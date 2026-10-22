import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collections;
import java.util.jar.JarEntry;
import java.util.jar.JarFile;
import java.util.jar.JarOutputStream;
import jdk.internal.org.objectweb.asm.ClassReader;
import jdk.internal.org.objectweb.asm.ClassWriter;
import jdk.internal.org.objectweb.asm.Opcodes;
import jdk.internal.org.objectweb.asm.tree.AbstractInsnNode;
import jdk.internal.org.objectweb.asm.tree.FieldInsnNode;
import jdk.internal.org.objectweb.asm.tree.InsnList;
import jdk.internal.org.objectweb.asm.tree.InsnNode;
import jdk.internal.org.objectweb.asm.tree.JumpInsnNode;
import jdk.internal.org.objectweb.asm.tree.LabelNode;
import jdk.internal.org.objectweb.asm.tree.MethodInsnNode;
import jdk.internal.org.objectweb.asm.tree.MethodNode;
import jdk.internal.org.objectweb.asm.tree.TableSwitchInsnNode;
import jdk.internal.org.objectweb.asm.tree.VarInsnNode;
import jdk.internal.org.objectweb.asm.tree.ClassNode;

/** Traces m.e command consumption and injects one labeled CF-04 command on first gameplay paint. */
public final class CF04Instrumenter implements Opcodes {
    private static final String PROBE = "org/recompile/hlprobe/CF04TraceProbe";
    private static boolean controlledInjection = true;

    private static InsnList call(String name, String descriptor) {
        InsnList code = new InsnList();
        code.add(new MethodInsnNode(INVOKESTATIC, PROBE, name, descriptor, false));
        return code;
    }

    private static byte[] transform(byte[] bytes) {
        ClassNode type = new ClassNode();
        new ClassReader(bytes).accept(type, 0);
        if (type.name.equals("m")) {
            int commandBodyCalls = 0;
            int workerModeCalls = 0;
            for (MethodNode method : type.methods) {
                if (method.name.equals("e") && method.desc.equals("()V")) {
                    InsnList entry = new InsnList();
                    entry.add(new FieldInsnNode(GETSTATIC, "m", "e", "I"));
                    entry.add(new FieldInsnNode(GETSTATIC, "m", "b", "B"));
                    entry.add(new FieldInsnNode(GETSTATIC, "m", "c", "B"));
                    entry.add(new FieldInsnNode(GETSTATIC, "m", "d", "B"));
                    entry.add(new FieldInsnNode(GETSTATIC, "m", "e", "B"));
                    entry.add(new MethodInsnNode(INVOKESTATIC, PROBE, "beginME", "(IIIII)V", false));
                    method.instructions.insert(entry);
                    int opcodeIndex = 0;
                    for (AbstractInsnNode instruction : method.instructions.toArray()) {
                        int opcode = instruction.getOpcode();
                        if (opcode < 0) continue;
                        if (instruction instanceof MethodInsnNode call && opcode == INVOKESTATIC) {
                            if (call.owner.equals("m") && call.name.equals("c") && call.desc.equals("()V")) {
                                InsnList mark = new InsnList();
                                mark.add(new jdk.internal.org.objectweb.asm.tree.LdcInsnNode("m.e_call_m.c;opcode_index=" + opcodeIndex));
                                mark.add(new MethodInsnNode(INVOKESTATIC, PROBE, "mark", "(Ljava/lang/String;)V", false));
                                method.instructions.insertBefore(instruction, mark);
                                commandBodyCalls++;
                            }
                            if (call.owner.equals("bt") && call.name.equals("d") && call.desc.equals("()V")) {
                                InsnList mark = new InsnList();
                                mark.add(new jdk.internal.org.objectweb.asm.tree.LdcInsnNode("m.e_call_bt.d;opcode_index=" + opcodeIndex));
                                mark.add(new MethodInsnNode(INVOKESTATIC, PROBE, "mark", "(Ljava/lang/String;)V", false));
                                method.instructions.insertBefore(instruction, mark);
                                AbstractInsnNode next = instruction.getNext();
                                while (next != null && next.getOpcode() < 0) next = next.getNext();
                                if (next == null || next.getOpcode() != RETURN)
                                    throw new IllegalStateException("Expected bt.d()V to be followed by return");
                                InsnList afterWorker = new InsnList();
                                afterWorker.add(new jdk.internal.org.objectweb.asm.tree.LdcInsnNode("m.e_return_immediately_after_bt.d"));
                                afterWorker.add(new MethodInsnNode(INVOKESTATIC, PROBE, "mark", "(Ljava/lang/String;)V", false));
                                method.instructions.insertBefore(next, afterWorker);
                                workerModeCalls++;
                            }
                        }
                        if (opcode == RETURN) {
                            InsnList finish = new InsnList();
                            finish.add(new jdk.internal.org.objectweb.asm.tree.LdcInsnNode(opcodeIndex));
                            finish.add(new MethodInsnNode(INVOKESTATIC, PROBE, "finishME", "(I)V", false));
                            method.instructions.insertBefore(instruction, finish);
                        }
                        opcodeIndex++;
                    }
                } else if (method.name.equals("a") && method.desc.equals("(I)V")) {
                    InsnList entry = new InsnList();
                    entry.add(new VarInsnNode(ILOAD, 0));
                    entry.add(new MethodInsnNode(INVOKESTATIC, PROBE, "stateSetter", "(I)V", false));
                    method.instructions.insert(entry);
                } else if (method.name.equals("a") && method.desc.equals("(BB)V")) {
                    InsnList entry = new InsnList();
                    entry.add(new VarInsnNode(ILOAD, 0));
                    entry.add(new VarInsnNode(ILOAD, 1));
                    entry.add(new MethodInsnNode(INVOKESTATIC, PROBE, "pendingSetter", "(II)V", false));
                    method.instructions.insert(entry);
                }
            }
            if (commandBodyCalls != 1 || workerModeCalls != 2)
                throw new IllegalStateException("Expected m.e branch call sites m.c=1, bt.d=2; got " + commandBodyCalls + "/" + workerModeCalls);
        } else if (type.name.equals("bt")) {
            for (MethodNode method : type.methods) {
                if (method.name.equals("d") && method.desc.equals("()V")) {
                    InsnList entry = new InsnList();
                    entry.add(new jdk.internal.org.objectweb.asm.tree.LdcInsnNode("bt.d_entry"));
                    entry.add(new FieldInsnNode(GETSTATIC, "bt", "a", "B"));
                    entry.add(new MethodInsnNode(INVOKESTATIC, PROBE, "workerMode", "(Ljava/lang/String;I)V", false));
                    method.instructions.insert(entry);
                    for (AbstractInsnNode instruction : method.instructions.toArray()) {
                        if (instruction instanceof FieldInsnNode field && instruction.getOpcode() == PUTSTATIC &&
                            field.owner.equals("bt") && field.name.equals("a") && field.desc.equals("B")) {
                            InsnList afterStore = new InsnList();
                            afterStore.add(new jdk.internal.org.objectweb.asm.tree.LdcInsnNode("bt.d_after_mode_store"));
                            afterStore.add(new FieldInsnNode(GETSTATIC, "bt", "a", "B"));
                            afterStore.add(new MethodInsnNode(INVOKESTATIC, PROBE, "workerMode", "(Ljava/lang/String;I)V", false));
                            method.instructions.insert(instruction, afterStore);
                        }
                        if (instruction.getOpcode() == RETURN) {
                            InsnList exit = new InsnList();
                            exit.add(new jdk.internal.org.objectweb.asm.tree.LdcInsnNode("bt.d_return"));
                            exit.add(new FieldInsnNode(GETSTATIC, "bt", "a", "B"));
                            exit.add(new MethodInsnNode(INVOKESTATIC, PROBE, "workerMode", "(Ljava/lang/String;I)V", false));
                            method.instructions.insertBefore(instruction, exit);
                        }
                    }
                } else if (method.name.equals("<init>") && method.desc.equals("()V")) {
                    for (AbstractInsnNode instruction : method.instructions.toArray()) {
                        if (instruction.getOpcode() == RETURN) {
                            InsnList register = new InsnList();
                            register.add(new VarInsnNode(ALOAD, 0));
                            register.add(new MethodInsnNode(INVOKESTATIC, PROBE, "registerWorker", "(Ljava/lang/Object;)V", false));
                            method.instructions.insertBefore(instruction, register);
                        }
                    }
                } else if (method.name.equals("run") && method.desc.equals("()V")) {
                    InsnList entry = new InsnList();
                    entry.add(new jdk.internal.org.objectweb.asm.tree.LdcInsnNode("bt.run_entry"));
                    entry.add(new VarInsnNode(ALOAD, 0));
                    entry.add(new FieldInsnNode(GETSTATIC, "bt", "a", "B"));
                    entry.add(new MethodInsnNode(INVOKESTATIC, PROBE, "workerRun", "(Ljava/lang/String;Ljava/lang/Object;I)V", false));
                    method.instructions.insert(entry);
                    int case5Targets = 0;
                    for (AbstractInsnNode instruction : method.instructions.toArray()) {
                        if (!(instruction instanceof TableSwitchInsnNode table) || table.min != 1 || table.max != 5) continue;
                        LabelNode target = table.labels.get(4);
                        AbstractInsnNode first = target.getNext();
                        while (first != null && first.getOpcode() < 0) first = first.getNext();
                        if (first == null) throw new IllegalStateException("bt.run() mode-5 case is empty");
                        InsnList marker = new InsnList();
                        marker.add(new jdk.internal.org.objectweb.asm.tree.LdcInsnNode("bt.run_case5_BCI_190"));
                        marker.add(new VarInsnNode(ALOAD, 0));
                        marker.add(new FieldInsnNode(GETSTATIC, "bt", "a", "B"));
                        marker.add(new MethodInsnNode(INVOKESTATIC, PROBE, "workerRun", "(Ljava/lang/String;Ljava/lang/Object;I)V", false));
                        method.instructions.insertBefore(first, marker);
                        case5Targets++;
                    }
                    if (case5Targets != 1) throw new IllegalStateException("Expected one bt.run() switch with mode 1..5");
                }
            }
        } else if (type.name.equals("ar")) {
            for (MethodNode method : type.methods) {
                if (method.name.equals("e") && method.desc.equals("(Ljavax/microedition/lcdui/Graphics;)V")) {
                    int textSetterSites = 0;
                    for (AbstractInsnNode instruction : method.instructions.toArray()) {
                        if (!(instruction instanceof MethodInsnNode call) || call.getOpcode() != INVOKESTATIC ||
                            !call.owner.equals("m") || !call.name.equals("a") || !call.desc.equals("(BB)V")) continue;
                        InsnList marker = new InsnList();
                        marker.add(new jdk.internal.org.objectweb.asm.tree.LdcInsnNode("ar.e_text_completion_calls_pending_setter"));
                        marker.add(new MethodInsnNode(INVOKESTATIC, PROBE, "naturalCallSite", "(Ljava/lang/String;)V", false));
                        method.instructions.insertBefore(instruction, marker);
                        textSetterSites++;
                    }
                    if (textSetterSites != 1) throw new IllegalStateException("Expected one pending setter call in ar.e(Graphics); got " + textSetterSites);
                }
                if (method.name.equals("keyPressed") && method.desc.equals("(I)V")) {
                    for (AbstractInsnNode instruction : method.instructions.toArray()) {
                        if (!(instruction instanceof MethodInsnNode call) || call.getOpcode() != INVOKESTATIC ||
                            !call.owner.equals("m") || !call.name.equals("a") || !call.desc.equals("(BB)V")) continue;
                        InsnList marker = new InsnList();
                        marker.add(new jdk.internal.org.objectweb.asm.tree.LdcInsnNode("ar.keyPressed_natural_command_setter"));
                        marker.add(new MethodInsnNode(INVOKESTATIC, PROBE, "naturalCallSite", "(Ljava/lang/String;)V", false));
                        method.instructions.insertBefore(instruction, marker);
                    }
                }
                if (controlledInjection && method.name.equals("paint") && method.desc.equals("(Ljavax/microedition/lcdui/Graphics;)V")) {
                    int callsToME = 0;
                    for (AbstractInsnNode instruction : method.instructions.toArray()) {
                        if (!(instruction instanceof MethodInsnNode call) || call.getOpcode() != INVOKESTATIC ||
                            !call.owner.equals("m") || !call.name.equals("e") || !call.desc.equals("()V")) continue;
                        InsnList inject = new InsnList();
                        inject.add(new FieldInsnNode(GETSTATIC, "m", "e", "I"));
                        inject.add(new FieldInsnNode(GETSTATIC, "m", "b", "B"));
                        inject.add(new MethodInsnNode(INVOKESTATIC, PROBE, "shouldInject", "(II)Z", false));
                        LabelNode skip = new LabelNode();
                        inject.add(new JumpInsnNode(IFEQ, skip));
                        inject.add(new jdk.internal.org.objectweb.asm.tree.IntInsnNode(BIPUSH, 21));
                        inject.add(new InsnNode(ICONST_2));
                        inject.add(new MethodInsnNode(INVOKESTATIC, "m", "a", "(BB)V", false));
                        inject.add(skip);
                        method.instructions.insertBefore(instruction, inject);
                        callsToME++;
                    }
                    if (callsToME != 1) throw new IllegalStateException("Expected ar.paint to call m.e once; got " + callsToME);
                }
            }
        }
        ClassWriter writer = new ClassWriter(ClassWriter.COMPUTE_MAXS);
        type.accept(writer);
        return writer.toByteArray();
    }

    public static void main(String[] args) throws Exception {
        if (args.length > 2) controlledInjection = !args[2].equals("natural");
        Path input = Path.of(args[0]);
        Path output = Path.of(args[1]);
        if (Files.exists(output)) throw new IllegalStateException("Output already exists: " + output);
        try (JarFile source = new JarFile(input.toFile());
             JarOutputStream destination = new JarOutputStream(Files.newOutputStream(output))) {
            for (JarEntry entry : Collections.list(source.entries())) {
                byte[] content = source.getInputStream(entry).readAllBytes();
                if (entry.getName().equals("m.class") || entry.getName().equals("ar.class") || entry.getName().equals("bt.class"))
                    content = transform(content);
                JarEntry transformed = new JarEntry(entry.getName());
                transformed.setTime(entry.getTime());
                destination.putNextEntry(transformed);
                destination.write(content);
                destination.closeEntry();
            }
        }
    }
}
