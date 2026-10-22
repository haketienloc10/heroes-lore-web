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
import jdk.internal.org.objectweb.asm.tree.LdcInsnNode;
import jdk.internal.org.objectweb.asm.tree.MethodInsnNode;
import jdk.internal.org.objectweb.asm.tree.MethodNode;
import jdk.internal.org.objectweb.asm.tree.VarInsnNode;

/** Captures the bf splash animation fields and loaded logo-image availability. */
public final class CF01PaintInstrumenterV2 implements Opcodes {
    private static final String PROBE = "org/recompile/hlprobe/CF01PaintTraceProbeV2";

    private static void addIntField(InsnList list, String name, String desc) {
        list.add(new VarInsnNode(ALOAD, 0));
        list.add(new FieldInsnNode(GETFIELD, "bf", name, desc));
    }

    private static InsnList paintEntry() {
        InsnList code = new InsnList();
        addIntField(code, "a", "B");
        addIntField(code, "b", "B");
        addIntField(code, "a", "I");
        addIntField(code, "a", "S");
        addIntField(code, "b", "S");
        addIntField(code, "c", "B");
        addIntField(code, "c", "S");
        addIntField(code, "d", "S");
        addIntField(code, "d", "B");
        addIntField(code, "c", "Z");
        code.add(new FieldInsnNode(GETSTATIC, "q", "g", "I"));
        code.add(new FieldInsnNode(GETSTATIC, "q", "h", "I"));
        code.add(new MethodInsnNode(INVOKESTATIC, PROBE, "paintEntry", "(IIIIIIIIIIII)V", false));
        return code;
    }

    private static byte[] transform(byte[] bytes) {
        ClassNode type = new ClassNode();
        new ClassReader(bytes).accept(type, 0);
        if (!type.name.equals("bf")) return bytes;
        int paintCount = 0;
        int runCount = 0;
        for (MethodNode method : type.methods) {
            if (method.name.equals("paint") && method.desc.equals("(Ljavax/microedition/lcdui/Graphics;)V")) {
                method.instructions.insert(paintEntry());
                int imageArrayHooks = 0;
                int opcodeIndex = 0;
                for (AbstractInsnNode instruction : method.instructions.toArray()) {
                    int opcode = instruction.getOpcode();
                    if (opcode < 0) continue;
                    if (instruction instanceof FieldInsnNode field && opcode == GETSTATIC && field.owner.equals("cd") &&
                        field.name.equals("j") && field.desc.equals("[Ljavax/microedition/lcdui/Image;") && imageArrayHooks == 0) {
                        InsnList observe = new InsnList();
                        observe.add(new jdk.internal.org.objectweb.asm.tree.InsnNode(DUP));
                        observe.add(new MethodInsnNode(INVOKESTATIC, PROBE, "observeLogoImages",
                            "([Ljavax/microedition/lcdui/Image;)V", false));
                        method.instructions.insert(instruction, observe);
                        imageArrayHooks++;
                    }
                    if (opcode == RETURN) {
                        InsnList exit = new InsnList();
                        exit.add(new LdcInsnNode(opcodeIndex));
                        exit.add(new MethodInsnNode(INVOKESTATIC, PROBE, "paintExit", "(I)V", false));
                        method.instructions.insertBefore(instruction, exit);
                    }
                    opcodeIndex++;
                }
                if (imageArrayHooks != 1) throw new IllegalStateException("Expected one cd.j[] read in bf.paint");
                paintCount++;
            } else if (method.name.equals("run") && method.desc.equals("()V")) {
                InsnList entry = new InsnList();
                addIntField(entry, "a", "B");
                addIntField(entry, "b", "B");
                entry.add(new MethodInsnNode(INVOKESTATIC, PROBE, "runEntry", "(II)V", false));
                method.instructions.insert(entry);
                int opcodeIndex = 0;
                for (AbstractInsnNode instruction : method.instructions.toArray()) {
                    int opcode = instruction.getOpcode();
                    if (opcode < 0) continue;
                    if (opcode == RETURN) {
                        InsnList exit = new InsnList();
                        exit.add(new LdcInsnNode(opcodeIndex));
                        exit.add(new MethodInsnNode(INVOKESTATIC, PROBE, "runExit", "(I)V", false));
                        method.instructions.insertBefore(instruction, exit);
                    }
                    opcodeIndex++;
                }
                runCount++;
            }
        }
        if (paintCount != 1 || runCount != 1)
            throw new IllegalStateException("Expected one bf.paint/run hook, got " + paintCount + "/" + runCount);
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
