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
import jdk.internal.org.objectweb.asm.Type;
import jdk.internal.org.objectweb.asm.tree.AbstractInsnNode;
import jdk.internal.org.objectweb.asm.tree.ClassNode;
import jdk.internal.org.objectweb.asm.tree.InsnList;
import jdk.internal.org.objectweb.asm.tree.InsnNode;
import jdk.internal.org.objectweb.asm.tree.LdcInsnNode;
import jdk.internal.org.objectweb.asm.tree.MethodInsnNode;
import jdk.internal.org.objectweb.asm.tree.MethodNode;
import jdk.internal.org.objectweb.asm.tree.VarInsnNode;

/** Adds entry/normal-return events to two methods in isolated JAR copies. */
public final class DialogueInstrumenter implements Opcodes {
    private static final Set<String> TARGETS = Set.of("ar.keyPressed(I)V", "ag.a(II)V");

    private static InsnList event(String owner, MethodNode method, String phase) {
        InsnList list = new InsnList();
        list.add(new LdcInsnNode(owner));
        list.add(new LdcInsnNode(method.name + method.desc));
        list.add(new LdcInsnNode(phase));
        boolean isStatic = (method.access & ACC_STATIC) != 0;
        list.add(isStatic ? new InsnNode(ACONST_NULL) : new VarInsnNode(ALOAD, 0));
        Type[] args = Type.getArgumentTypes(method.desc);
        int local = isStatic ? 0 : 1;
        int written = 0;
        for (Type arg : args) {
            if (written < 2 && (arg.getSort() == Type.INT || arg.getSort() == Type.BYTE
                    || arg.getSort() == Type.SHORT || arg.getSort() == Type.CHAR || arg.getSort() == Type.BOOLEAN)) {
                list.add(new VarInsnNode(ILOAD, local));
                written++;
            }
            local += arg.getSize();
        }
        while (written++ < 2) list.add(new LdcInsnNode(Integer.MIN_VALUE));
        list.add(new MethodInsnNode(INVOKESTATIC, "org/recompile/hlprobe/DialogueTraceProbe", "event",
                "(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/Object;II)V", false));
        return list;
    }

    private static byte[] transform(byte[] bytes) {
        ClassNode type = new ClassNode();
        new ClassReader(bytes).accept(type, 0);
        boolean changed = false;
        for (MethodNode method : type.methods) {
            String key = type.name + "." + method.name + method.desc;
            if (!TARGETS.contains(key)) continue;
            System.out.println(key);
            method.instructions.insert(event(type.name, method, "entry"));
            for (AbstractInsnNode instruction : method.instructions.toArray()) {
                int opcode = instruction.getOpcode();
                if (opcode >= IRETURN && opcode <= RETURN) {
                    method.instructions.insertBefore(instruction, event(type.name, method, "exit"));
                }
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
