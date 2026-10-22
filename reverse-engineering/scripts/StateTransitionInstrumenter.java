import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collections;
import java.util.Set;
import java.util.jar.JarEntry;
import java.util.jar.JarFile;
import java.util.jar.JarOutputStream;
import jdk.internal.org.objectweb.asm.ClassReader;
import jdk.internal.org.objectweb.asm.ClassWriter;
import jdk.internal.org.objectweb.asm.Opcodes;
import jdk.internal.org.objectweb.asm.tree.AbstractInsnNode;
import jdk.internal.org.objectweb.asm.tree.ClassNode;
import jdk.internal.org.objectweb.asm.tree.FieldInsnNode;
import jdk.internal.org.objectweb.asm.tree.InsnList;
import jdk.internal.org.objectweb.asm.tree.InsnNode;
import jdk.internal.org.objectweb.asm.tree.JumpInsnNode;
import jdk.internal.org.objectweb.asm.tree.LdcInsnNode;
import jdk.internal.org.objectweb.asm.tree.MethodInsnNode;
import jdk.internal.org.objectweb.asm.tree.MethodNode;
import jdk.internal.org.objectweb.asm.tree.VarInsnNode;

/** Copy-only hooks; when the natural state setter stores 4, queue an AWT W key event. */
public final class StateTransitionInstrumenter implements Opcodes {
    private static final Set<String> TARGETS = Set.of(
            "m.a(I)V", "m.i()V", "m.n()V", "ar.keyPressed(I)V", "ag.a(II)V", "br.b()V", "br.a(JJ)V");

    private static InsnList invoke(String method, String descriptor, int... locals) {
        InsnList list = new InsnList();
        for (int local : locals) list.add(new VarInsnNode(ILOAD, local));
        list.add(new MethodInsnNode(INVOKESTATIC, "org/recompile/hlprobe/StateTransitionTraceProbe",
                method, descriptor, false));
        return list;
    }

    private static void hookStateSetter(MethodNode method) {
        boolean hooked = false;
        for (AbstractInsnNode instruction : method.instructions.toArray()) {
            if (!(instruction instanceof FieldInsnNode field) || field.getOpcode() != PUTSTATIC
                    || !field.owner.equals("m") || !field.name.equals("e") || !field.desc.equals("I")) continue;
            method.instructions.insert(instruction, invoke("stateSetterStored", "(I)V", 0));
            hooked = true;
        }
        if (!hooked) throw new IllegalStateException("Did not find m.a(I)V store to m.e:I");
        System.out.println("m.a(I)V state store hooked after original PUTSTATIC m.e:I");
    }

    private static void hookKeyState(MethodNode method) {
        boolean hooked = false;
        for (AbstractInsnNode instruction : method.instructions.toArray()) {
            if (instruction.getOpcode() != TABLESWITCH) continue;
            AbstractInsnNode previous = instruction.getPrevious();
            while (previous != null && previous.getOpcode() < 0) previous = previous.getPrevious();
            if (previous instanceof FieldInsnNode field && field.getOpcode() == GETSTATIC
                    && field.owner.equals("m") && field.name.equals("e") && field.desc.equals("I")) {
                InsnList marker = new InsnList();
                marker.add(new InsnNode(DUP));
                marker.add(new MethodInsnNode(INVOKESTATIC,
                        "org/recompile/hlprobe/StateTransitionTraceProbe", "keyState", "(I)V", false));
                method.instructions.insertBefore(instruction, marker);
                hooked = true;
                break;
            }
        }
        if (!hooked) throw new IllegalStateException("Did not find ar.keyPressed m.e:I TABLESWITCH");
        System.out.println("ar.keyPressed m.e:I switch operand hooked");
    }

    private static void hookBypassBranch(MethodNode method) {
        boolean hooked = false;
        for (AbstractInsnNode instruction : method.instructions.toArray()) {
            if (!(instruction instanceof JumpInsnNode jump) || jump.getOpcode() != IFNE) continue;
            AbstractInsnNode previous = instruction.getPrevious();
            while (previous != null && previous.getOpcode() < 0) previous = previous.getPrevious();
            if (previous instanceof FieldInsnNode field && field.getOpcode() == GETSTATIC
                    && field.owner.equals("ag") && field.name.equals("a") && field.desc.equals("Z")) {
                InsnList marker = new InsnList();
                marker.add(new InsnNode(DUP));
                marker.add(new MethodInsnNode(INVOKESTATIC,
                        "org/recompile/hlprobe/StateTransitionTraceProbe", "bypassValue", "(I)V", false));
                method.instructions.insertBefore(instruction, marker);
                hooked = true;
            }
        }
        if (!hooked) throw new IllegalStateException("Did not find br.b ag.a:Z IFNE branch");
        System.out.println("br.b ag.a:Z IFNE operand hooked");
    }

    private static void hookSleepYield(MethodNode method) {
        int sleeps = 0;
        int yields = 0;
        for (AbstractInsnNode instruction : method.instructions.toArray()) {
            if (!(instruction instanceof MethodInsnNode call)
                    || !call.owner.equals("java/lang/Thread")) continue;
            if (call.name.equals("sleep") && call.desc.equals("(J)V")) {
                method.instructions.insertBefore(instruction, invoke("pacingSleep", "()V"));
                sleeps++;
            }
            if (call.name.equals("yield") && call.desc.equals("()V")) {
                method.instructions.insertBefore(instruction, invoke("pacingYield", "()V"));
                yields++;
            }
        }
        if (sleeps != 1 || yields != 1)
            throw new IllegalStateException("Expected one Thread.sleep and one Thread.yield in br.a(JJ)V; found "
                    + sleeps + " and " + yields);
        System.out.println("br.a(JJ)V sleep/yield call sites hooked (1/1)");
    }

    private static InsnList transitionMarker(boolean enter, int kind) {
        InsnList marker = new InsnList();
        marker.add(new InsnNode(kind == 1 ? ICONST_1 : ICONST_2));
        marker.add(new MethodInsnNode(INVOKESTATIC, "org/recompile/hlprobe/StateTransitionTraceProbe",
                enter ? "transitionEnter" : "transitionExit", "(I)V", false));
        return marker;
    }

    private static void hookTransitionMethod(MethodNode method, int kind) {
        method.instructions.insert(transitionMarker(true, kind));
        for (AbstractInsnNode instruction : method.instructions.toArray()) {
            if (instruction.getOpcode() == RETURN)
                method.instructions.insertBefore(instruction, transitionMarker(false, kind));
        }
        System.out.println("m." + (kind == 1 ? "i" : "n") + "()V transition entry/exit hooked");
    }

    private static byte[] transform(byte[] bytes) {
        ClassNode type = new ClassNode();
        new ClassReader(bytes).accept(type, 0);
        boolean changed = false;
        for (MethodNode method : type.methods) {
            String key = type.name + "." + method.name + method.desc;
            if (!TARGETS.contains(key)) continue;
            System.out.println(key);
            if (key.equals("m.a(I)V")) hookStateSetter(method);
            if (key.equals("m.i()V")) hookTransitionMethod(method, 1);
            if (key.equals("m.n()V")) hookTransitionMethod(method, 2);
            if (key.equals("ar.keyPressed(I)V")) {
                method.instructions.insert(invoke("keyPressed", "(I)V", 1));
                hookKeyState(method);
            }
            if (key.equals("ag.a(II)V"))
                method.instructions.insert(invoke("handlerCall", "(II)V", 0, 1));
            if (key.equals("br.b()V")) {
                method.instructions.insert(invoke("pacingEntry", "()V"));
                hookBypassBranch(method);
                for (AbstractInsnNode instruction : method.instructions.toArray())
                    if (instruction.getOpcode() == RETURN)
                        method.instructions.insertBefore(instruction, invoke("pacingExit", "()V"));
            }
            if (key.equals("br.a(JJ)V")) {
                method.instructions.insert(invoke("pacingHelperEntry", "()V"));
                InsnList targetPeriod = new InsnList();
                targetPeriod.add(new VarInsnNode(LLOAD, 3));
                targetPeriod.add(new MethodInsnNode(INVOKESTATIC,
                        "org/recompile/hlprobe/StateTransitionTraceProbe",
                        "pacingTargetPeriod", "(J)V", false));
                method.instructions.insert(targetPeriod);
                System.out.println("br.a(JJ)V helper period argument hooked");
                hookSleepYield(method);
                for (AbstractInsnNode instruction : method.instructions.toArray())
                    if (instruction.getOpcode() == RETURN)
                        method.instructions.insertBefore(instruction, invoke("pacingHelperExit", "()V"));
            }
            changed = true;
        }
        if (!changed) return bytes;
        ClassWriter writer = new ClassWriter(ClassWriter.COMPUTE_MAXS);
        type.accept(writer);
        return writer.toByteArray();
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 2) throw new IllegalArgumentException("INPUT.jar OUTPUT.jar");
        Path output = Path.of(args[1]);
        if (Files.exists(output)) throw new IllegalStateException("Output exists: " + output);
        try (JarFile source = new JarFile(args[0]);
             JarOutputStream destination = new JarOutputStream(Files.newOutputStream(output))) {
            for (JarEntry entry : Collections.list(source.entries())) {
                byte[] bytes = source.getInputStream(entry).readAllBytes();
                if (entry.getName().endsWith(".class")) bytes = transform(bytes);
                JarEntry copy = new JarEntry(entry.getName());
                copy.setTime(entry.getTime());
                destination.putNextEntry(copy);
                destination.write(bytes);
                destination.closeEntry();
            }
        }
    }
}
