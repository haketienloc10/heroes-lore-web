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
import jdk.internal.org.objectweb.asm.tree.LdcInsnNode;
import jdk.internal.org.objectweb.asm.tree.MethodInsnNode;
import jdk.internal.org.objectweb.asm.tree.MethodNode;
import jdk.internal.org.objectweb.asm.tree.VarInsnNode;

/** Instruments only bf.paint()/bf.run() state markers in an isolated game-JAR copy. */
public final class CF01PaintInstrumenter implements Opcodes {
    private static final String PROBE = "org/recompile/hlprobe/CF01PaintTraceProbe";

    private static InsnList call(String method, String desc, Object... constants) {
        InsnList code = new InsnList();
        for (Object constant : constants) {
            if (constant instanceof String value) code.add(new LdcInsnNode(value));
            else if (constant instanceof Integer value) code.add(new LdcInsnNode(value));
            else throw new IllegalArgumentException("Unsupported constant: " + constant);
        }
        code.add(new MethodInsnNode(INVOKESTATIC, PROBE, method, desc, false));
        return code;
    }

    private static InsnList readStateAndCall(String method, String desc, Object... prefix) {
        InsnList code = new InsnList();
        for (Object constant : prefix) {
            if (constant instanceof String value) code.add(new LdcInsnNode(value));
            else if (constant instanceof Integer value) code.add(new LdcInsnNode(value));
            else throw new IllegalArgumentException("Unsupported constant: " + constant);
        }
        code.add(new VarInsnNode(ALOAD, 0));
        code.add(new FieldInsnNode(GETFIELD, "bf", "a", "B"));
        code.add(new VarInsnNode(ALOAD, 0));
        code.add(new FieldInsnNode(GETFIELD, "bf", "b", "B"));
        code.add(new MethodInsnNode(INVOKESTATIC, PROBE, method, desc, false));
        return code;
    }

    private static byte[] transform(byte[] bytes) {
        ClassNode type = new ClassNode();
        new ClassReader(bytes).accept(type, 0);
        if (!type.name.equals("bf")) return bytes;
        boolean changed = false;
        int paintCount = 0;
        int runCount = 0;
        for (MethodNode method : type.methods) {
            if (method.name.equals("paint") && method.desc.equals("(Ljavax/microedition/lcdui/Graphics;)V")) {
                method.instructions.insert(readStateAndCall("paintEntry", "(II)V"));
                int opcodeIndex = 0;
                for (AbstractInsnNode instruction : method.instructions.toArray()) {
                    int opcode = instruction.getOpcode();
                    if (opcode < 0) continue;
                    if (opcode >= IRETURN && opcode <= RETURN)
                        method.instructions.insertBefore(instruction, call("paintExit", "(I)V", opcodeIndex));
                    opcodeIndex++;
                }
                paintCount++;
                changed = true;
            } else if (method.name.equals("run") && method.desc.equals("()V")) {
                method.instructions.insert(readStateAndCall("runEntry", "(II)V"));
                int opcodeIndex = 0;
                for (AbstractInsnNode instruction : method.instructions.toArray()) {
                    int opcode = instruction.getOpcode();
                    if (opcode < 0) continue;
                    if (opcode >= IRETURN && opcode <= RETURN)
                        method.instructions.insertBefore(instruction, call("runExit", "(I)V", opcodeIndex));
                    opcodeIndex++;
                }
                runCount++;
                changed = true;
            }
        }
        if (paintCount != 1 || runCount != 1)
            throw new IllegalStateException("Expected one bf.paint(Graphics) and bf.run() method, got " + paintCount + "/" + runCount);

        for (MethodNode method : type.methods) {
            int opcodeIndex = 0;
            for (AbstractInsnNode instruction : method.instructions.toArray()) {
                int opcode = instruction.getOpcode();
                if (opcode < 0) continue;
                if (instruction instanceof FieldInsnNode field && opcode == PUTFIELD && field.owner.equals("bf") &&
                    field.name.equals("a") && field.desc.equals("B")) {
                    InsnList stored = new InsnList();
                    stored.add(new VarInsnNode(ALOAD, 0));
                    stored.add(new FieldInsnNode(GETFIELD, "bf", "a", "B"));
                    stored.add(new LdcInsnNode(method.name + method.desc));
                    stored.add(new LdcInsnNode(opcodeIndex));
                    stored.add(new MethodInsnNode(INVOKESTATIC, PROBE, "stateWrite", "(ILjava/lang/String;I)V", false));
                    method.instructions.insert(instruction, stored);
                    changed = true;
                }
                opcodeIndex++;
            }
        }
        if (!changed) throw new IllegalStateException("No bf paint/run hooks installed");
        ClassWriter writer = new ClassWriter(ClassWriter.COMPUTE_MAXS);
        type.accept(writer);
        return writer.toByteArray();
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
