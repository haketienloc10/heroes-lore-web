import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collections;
import java.util.jar.JarEntry;
import java.util.jar.JarFile;
import java.util.jar.JarOutputStream;
import jdk.internal.org.objectweb.asm.ClassReader;
import jdk.internal.org.objectweb.asm.ClassWriter;
import jdk.internal.org.objectweb.asm.Opcodes;
import jdk.internal.org.objectweb.asm.Type;
import jdk.internal.org.objectweb.asm.tree.AbstractInsnNode;
import jdk.internal.org.objectweb.asm.tree.ClassNode;
import jdk.internal.org.objectweb.asm.tree.FieldInsnNode;
import jdk.internal.org.objectweb.asm.tree.InsnList;
import jdk.internal.org.objectweb.asm.tree.InsnNode;
import jdk.internal.org.objectweb.asm.tree.MethodInsnNode;
import jdk.internal.org.objectweb.asm.tree.MethodNode;
import jdk.internal.org.objectweb.asm.tree.VarInsnNode;

/** Instruments only the bt.run()V mode-1 branch and its common suffix. */
public final class CF02Instrumenter implements Opcodes {
    private static final String PROBE = "org/recompile/hlprobe/CF02TraceProbe";

    private static InsnList mark(String site) {
        InsnList instructions = new InsnList();
        instructions.add(new jdk.internal.org.objectweb.asm.tree.LdcInsnNode(site));
        instructions.add(new MethodInsnNode(INVOKESTATIC, PROBE, "mark", "(Ljava/lang/String;)V", false));
        return instructions;
    }

    private static byte[] transform(byte[] bytes) {
        ClassNode type = new ClassNode();
        new ClassReader(bytes).accept(type, 0);
        if (!type.name.equals("bt")) return bytes;
        boolean changed = false;
        for (MethodNode method : type.methods) {
            if (!method.name.equals("run") || !method.desc.equals("()V")) continue;
            AbstractInsnNode[] original = method.instructions.toArray();
            InsnList begin = new InsnList();
            begin.add(new FieldInsnNode(GETSTATIC, "bt", "a", "B"));
            begin.add(new MethodInsnNode(INVOKESTATIC, PROBE, "begin", "(I)V", false));
            method.instructions.insert(begin);
            int opcodeIndex = 0;
            int seen = 0;
            for (AbstractInsnNode instruction : original) {
                int opcode = instruction.getOpcode();
                if (opcode < 0) continue;
                int index = opcodeIndex++;
                if (index == 45) {
                    require(opcode == GOTO, "expected BCI 146 goto at opcode index 45");
                    method.instructions.insertBefore(instruction, mark("load_success_branch_BCI_146"));
                    seen++;
                } else if (index == 46) {
                    require(opcode == POP, "expected BCI 149 handler pop at opcode index 46");
                    method.instructions.insertBefore(instruction, mark("exception_handler_BCI_149"));
                    seen++;
                } else if (index == 47) {
                    require(opcode == ALOAD && ((VarInsnNode) instruction).var == 0,
                        "expected BCI 150 aload_0 at opcode index 47");
                    method.instructions.insertBefore(instruction, mark("common_join_BCI_150"));
                    seen++;
                } else if (index == 48) {
                    require(isCall(instruction, INVOKESPECIAL, "bt", "j", "()V"), "expected j()V at BCI 151");
                    method.instructions.insertBefore(instruction, mark("call_j_BCI_151"));
                    seen++;
                } else if (index == 50) {
                    require(isCall(instruction, INVOKESPECIAL, "bt", "k", "()V"), "expected k()V at BCI 155");
                    method.instructions.insertBefore(instruction, mark("call_k_BCI_155"));
                    seen++;
                } else if (index == 55) {
                    require(isCall(instruction, INVOKESTATIC, "m", "b", "(BBBB)V"), "expected m.b(BBBB)V at BCI 168");
                    method.instructions.insertBefore(instruction, mark("call_m_b_BBBB_BCI_168"));
                    seen++;
                } else if (index == 57) {
                    require(opcode == PUTSTATIC && instruction instanceof FieldInsnNode,
                        "expected q.b:Z store at BCI 172");
                    FieldInsnNode field = (FieldInsnNode) instruction;
                    require(field.owner.equals("q") && field.name.equals("b") && field.desc.equals("Z"),
                        "unexpected field store at BCI 172");
                    InsnList stored = new InsnList();
                    stored.add(new FieldInsnNode(GETSTATIC, "q", "b", "Z"));
                    stored.add(new MethodInsnNode(INVOKESTATIC, PROBE, "qStore", "(Z)V", false));
                    method.instructions.insert(instruction, stored);
                    seen++;
                } else if (index == 58) {
                    require(opcode == RETURN, "expected normal return at BCI 175");
                    method.instructions.insertBefore(instruction,
                        new MethodInsnNode(INVOKESTATIC, PROBE, "finish", "()V", false));
                    seen++;
                }
            }
            require(seen == 8, "instrumentation sites incomplete: " + seen);
            changed = true;
        }
        if (!changed) return bytes;
        ClassWriter writer = new ClassWriter(ClassWriter.COMPUTE_MAXS);
        type.accept(writer);
        return writer.toByteArray();
    }

    private static boolean isCall(AbstractInsnNode instruction, int opcode, String owner, String name, String desc) {
        if (!(instruction instanceof MethodInsnNode)) return false;
        MethodInsnNode call = (MethodInsnNode) instruction;
        return call.getOpcode() == opcode && call.owner.equals(owner) && call.name.equals(name) && call.desc.equals(desc);
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new IllegalStateException(message);
    }

    public static void main(String[] args) throws Exception {
        Path input = Path.of(args[0]);
        Path output = Path.of(args[1]);
        if (Files.exists(output)) throw new IllegalStateException("Output exists: " + output);
        try (JarFile source = new JarFile(input.toFile());
             JarOutputStream destination = new JarOutputStream(Files.newOutputStream(output))) {
            for (JarEntry entry : Collections.list(source.entries())) {
                byte[] content = source.getInputStream(entry).readAllBytes();
                if (entry.getName().equals("bt.class")) content = transform(content);
                JarEntry transformed = new JarEntry(entry.getName());
                transformed.setTime(entry.getTime());
                destination.putNextEntry(transformed);
                destination.write(content);
                destination.closeEntry();
            }
        }
    }
}
