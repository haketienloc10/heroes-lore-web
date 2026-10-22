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

/** Copy-only hooks for the ag.a bypass operand, key route, and scheduler call. */
public final class BypassInstrumenter implements Opcodes {
    private static final Set<String> TARGETS = Set.of(
            "ar.keyPressed(I)V", "ag.a(II)V", "br.b()V", "br.a(JJ)V");
    private static final int NO_ARG = Integer.MIN_VALUE;

    private static boolean isReal(AbstractInsnNode instruction) {
        return instruction != null && instruction.getOpcode() >= 0;
    }

    private static InsnList methodEvent(String owner, MethodNode method, String phase) {
        InsnList list = new InsnList();
        list.add(new LdcInsnNode(owner));
        list.add(new LdcInsnNode(method.name + method.desc));
        list.add(new LdcInsnNode(phase));
        if (phase.equals("entry") && owner.equals("ar") && method.name.equals("keyPressed")) {
            list.add(new VarInsnNode(ILOAD, 1));
            list.add(new LdcInsnNode(NO_ARG));
        } else if (phase.equals("entry") && owner.equals("ag") && method.name.equals("a")
                && method.desc.equals("(II)V")) {
            list.add(new VarInsnNode(ILOAD, 0));
            list.add(new VarInsnNode(ILOAD, 1));
        } else {
            list.add(new LdcInsnNode(NO_ARG));
            list.add(new LdcInsnNode(NO_ARG));
        }
        list.add(new MethodInsnNode(INVOKESTATIC, "org/recompile/hlprobe/BypassTraceProbe", "methodEvent",
                "(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;II)V", false));
        return list;
    }

    private static void hookAgBranch(MethodNode method) {
        boolean hooked = false;
        for (AbstractInsnNode instruction : method.instructions.toArray()) {
            if (!(instruction instanceof JumpInsnNode jump) || jump.getOpcode() != IFNE) continue;
            AbstractInsnNode previous = instruction.getPrevious();
            while (!isReal(previous) && previous != null) previous = previous.getPrevious();
            if (previous instanceof FieldInsnNode field && field.getOpcode() == GETSTATIC
                    && field.owner.equals("ag") && field.name.equals("a") && field.desc.equals("Z")) {
                InsnList marker = new InsnList();
                marker.add(new InsnNode(DUP));
                marker.add(new MethodInsnNode(INVOKESTATIC, "org/recompile/hlprobe/BypassTraceProbe",
                        "bypassValue", "(I)V", false));
                method.instructions.insertBefore(instruction, marker);
                hooked = true;
            }
        }
        if (!hooked) throw new IllegalStateException("Did not find br.b ag.a:Z IFNE branch");
        System.out.println("br.b ag.a:Z operand hooked at original BCI 0; IFNE target original BCI 19");
    }

    private static void hookGameplayStateSwitch(MethodNode method) {
        boolean hooked = false;
        for (AbstractInsnNode instruction : method.instructions.toArray()) {
            if (instruction.getOpcode() != TABLESWITCH) continue;
            AbstractInsnNode previous = instruction.getPrevious();
            while (!isReal(previous) && previous != null) previous = previous.getPrevious();
            if (previous instanceof FieldInsnNode field && field.getOpcode() == GETSTATIC
                    && field.owner.equals("m") && field.name.equals("e") && field.desc.equals("I")) {
                InsnList marker = new InsnList();
                marker.add(new InsnNode(DUP));
                marker.add(new MethodInsnNode(INVOKESTATIC, "org/recompile/hlprobe/BypassTraceProbe",
                        "gameStateValue", "(I)V", false));
                method.instructions.insertBefore(instruction, marker);
                hooked = true;
                break;
            }
        }
        if (!hooked) throw new IllegalStateException("Did not find ar.keyPressed m.e:I tableswitch");
        System.out.println("ar.keyPressed m.e:I tableswitch operand hooked");
    }

    private static byte[] transform(byte[] bytes) {
        ClassNode type = new ClassNode();
        new ClassReader(bytes).accept(type, 0);
        boolean changed = false;
        for (MethodNode method : type.methods) {
            String key = type.name + "." + method.name + method.desc;
            if (!TARGETS.contains(key)) continue;
            System.out.println(key);
            if (key.equals("br.b()V")) hookAgBranch(method);
            if (key.equals("ar.keyPressed(I)V")) hookGameplayStateSwitch(method);
            method.instructions.insert(methodEvent(type.name, method, "entry"));
            for (AbstractInsnNode instruction : method.instructions.toArray()) {
                int opcode = instruction.getOpcode();
                if (opcode >= IRETURN && opcode <= RETURN)
                    method.instructions.insertBefore(instruction, methodEvent(type.name, method, "exit"));
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
