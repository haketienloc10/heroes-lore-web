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
import jdk.internal.org.objectweb.asm.tree.ClassNode;
import jdk.internal.org.objectweb.asm.tree.FieldInsnNode;
import jdk.internal.org.objectweb.asm.tree.InsnList;
import jdk.internal.org.objectweb.asm.tree.InsnNode;
import jdk.internal.org.objectweb.asm.tree.JumpInsnNode;
import jdk.internal.org.objectweb.asm.tree.MethodInsnNode;
import jdk.internal.org.objectweb.asm.tree.MethodNode;
import jdk.internal.org.objectweb.asm.tree.TryCatchBlockNode;
import jdk.internal.org.objectweb.asm.tree.VarInsnNode;

/** Instruments the natural bf.run() startup resource-load branch in an isolated JAR copy. */
public final class CF01Instrumenter implements Opcodes {
    private static final String PROBE = "org/recompile/hlprobe/CF01TraceProbe";

    private static InsnList mark(String site, int bci) {
        InsnList instructions = new InsnList();
        instructions.add(new jdk.internal.org.objectweb.asm.tree.LdcInsnNode(site));
        instructions.add(new jdk.internal.org.objectweb.asm.tree.LdcInsnNode(bci));
        instructions.add(new MethodInsnNode(INVOKESTATIC, PROBE, "mark", "(Ljava/lang/String;I)V", false));
        return instructions;
    }

    private static AbstractInsnNode nextOpcode(AbstractInsnNode node) {
        for (AbstractInsnNode next = node.getNext(); next != null; next = next.getNext())
            if (next.getOpcode() >= 0) return next;
        return null;
    }

    private static int countCall(MethodNode method, int opcode, String owner, String name, String desc) {
        int count = 0;
        for (AbstractInsnNode node : method.instructions) {
            if (node instanceof MethodInsnNode call && call.getOpcode() == opcode && call.owner.equals(owner) &&
                call.name.equals(name) && call.desc.equals(desc)) count++;
        }
        return count;
    }

    private static boolean isCall(AbstractInsnNode node, int opcode, String owner, String name, String desc) {
        return node instanceof MethodInsnNode call && call.getOpcode() == opcode && call.owner.equals(owner) &&
            call.name.equals(name) && call.desc.equals(desc);
    }

    private static byte[] transform(byte[] bytes) {
        ClassNode type = new ClassNode();
        new ClassReader(bytes).accept(type, 0);
        if (!type.name.equals("bf")) return bytes;
        boolean changed = false;
        for (MethodNode method : type.methods) {
            if (!method.name.equals("run") || !method.desc.equals("()V")) continue;
            int successGoto = 0;
            int handlerPop = 0;
            int cdY = 0;
            int cdA = 0;
            int bfB = 0;
            int finalQk = 0;
            for (AbstractInsnNode instruction : method.instructions.toArray()) {
                if (instruction instanceof JumpInsnNode jump && instruction.getOpcode() == GOTO &&
                    isCall(previousOpcode(instruction), INVOKESTATIC, "q", "k", "()V") &&
                    isCall(nextOpcode(jump.label), INVOKESTATIC, "cd", "y", "()V")) {
                    method.instructions.insertBefore(instruction, mark("resource_load_success_goto_BCI_92", 92));
                    successGoto++;
                }
                if (isCall(instruction, INVOKESTATIC, "cd", "y", "()V")) {
                    method.instructions.insertBefore(instruction, mark("call_cd_y_BCI_96", 96));
                    cdY++;
                } else if (isCall(instruction, INVOKESTATIC, "cd", "A", "()V")) {
                    method.instructions.insertBefore(instruction, mark("call_cd_A_BCI_99", 99));
                    cdA++;
                } else if (isCall(instruction, INVOKEVIRTUAL, "bf", "b", "()V")) {
                    method.instructions.insertBefore(instruction, mark("call_bf_b_BCI_208", 208));
                    bfB++;
                } else if (isCall(instruction, INVOKESTATIC, "q", "k", "()V") &&
                           nextOpcode(instruction) != null && nextOpcode(instruction).getOpcode() == RETURN) {
                    method.instructions.insertBefore(instruction, mark("call_q_k_BCI_211", 211));
                    finalQk++;
                }
            }
            for (TryCatchBlockNode block : method.tryCatchBlocks) {
                if (!"java/io/IOException".equals(block.type)) continue;
                AbstractInsnNode first = nextOpcode(block.handler);
                if (first != null && first.getOpcode() == POP) {
                    method.instructions.insertBefore(first, mark("resource_load_exception_handler_BCI_95", 95));
                    handlerPop++;
                }
            }
            if (successGoto != 1 || handlerPop != 1 || cdY != 1 || cdA != 1 || bfB != 1 || finalQk != 1)
                throw new IllegalStateException("CF-01 anchor mismatch: success=" + successGoto + ", handler=" +
                    handlerPop + ", cd.y=" + cdY + ", cd.A=" + cdA + ", bf.b=" + bfB + ", final q.k=" + finalQk);

            InsnList begin = new InsnList();
            begin.add(new VarInsnNode(ALOAD, 0));
            begin.add(new FieldInsnNode(GETFIELD, "bf", "a", "B"));
            begin.add(new VarInsnNode(ALOAD, 0));
            begin.add(new FieldInsnNode(GETFIELD, "bf", "b", "B"));
            begin.add(new MethodInsnNode(INVOKESTATIC, PROBE, "begin", "(II)V", false));
            method.instructions.insert(begin);

            int normalReturns = 0;
            for (AbstractInsnNode instruction : method.instructions.toArray()) {
                if (instruction.getOpcode() != RETURN) continue;
                InsnList finish = new InsnList();
                finish.add(new jdk.internal.org.objectweb.asm.tree.LdcInsnNode("normal_return"));
                finish.add(new MethodInsnNode(INVOKESTATIC, PROBE, "finish", "(Ljava/lang/String;)V", false));
                method.instructions.insertBefore(instruction, finish);
                normalReturns++;
            }
            if (normalReturns != 2) throw new IllegalStateException("Expected two bf.run()V RETURN sites; got " + normalReturns);
            changed = true;
        }
        if (!changed) throw new IllegalStateException("Did not find bf.run()V");
        ClassWriter writer = new ClassWriter(ClassWriter.COMPUTE_MAXS);
        type.accept(writer);
        return writer.toByteArray();
    }

    private static AbstractInsnNode previousOpcode(AbstractInsnNode node) {
        for (AbstractInsnNode previous = node.getPrevious(); previous != null; previous = previous.getPrevious())
            if (previous.getOpcode() >= 0) return previous;
        return null;
    }

    public static void main(String[] args) throws Exception {
        Path input = Path.of(args[0]);
        Path output = Path.of(args[1]);
        if (Files.exists(output)) throw new IllegalStateException("Output exists: " + output);
        try (JarFile source = new JarFile(input.toFile());
             JarOutputStream destination = new JarOutputStream(Files.newOutputStream(output))) {
            for (JarEntry entry : Collections.list(source.entries())) {
                byte[] content = source.getInputStream(entry).readAllBytes();
                if (entry.getName().equals("bf.class")) content = transform(content);
                JarEntry transformed = new JarEntry(entry.getName());
                transformed.setTime(entry.getTime());
                destination.putNextEntry(transformed);
                destination.write(content);
                destination.closeEntry();
            }
        }
    }
}
