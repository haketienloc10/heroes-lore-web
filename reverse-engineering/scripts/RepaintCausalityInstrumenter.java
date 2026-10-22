import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.Map;
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

/** Instruments the concrete FreeJ2ME repaint-to-AWT-paint path in isolated JAR copies. */
public final class RepaintCausalityInstrumenter implements Opcodes {
    private static final String PROBE = "org/recompile/hlprobe/RepaintCausalityProbe";
    private static final String GAME_PAINT = "ar.paint(Ljavax/microedition/lcdui/Graphics;)V";
    private static final String PLATFORM_FLUSH = "org/recompile/mobile/MobilePlatform.flushGraphics(Lorg/recompile/mobile/PlatformImage;IIII)V";
    private static final String PAINTER_RUN = "org/recompile/freej2me/FreeJ2ME$6.run()V";
    private static final String LCD_PAINT = "org/recompile/freej2me/FreeJ2ME$LCD.paint(Ljava/awt/Graphics;)V";

    private static final class Stats {
        int gamePaint;
        int platformFlush;
        int painterRun;
        int lcdPaint;
        int repaintCallsites;
    }

    private static boolean signedMetadata(String name) {
        String upper = name.toUpperCase(java.util.Locale.ROOT);
        return upper.startsWith("META-INF/") &&
            (upper.endsWith(".SF") || upper.endsWith(".RSA") || upper.endsWith(".DSA") || upper.endsWith(".EC"));
    }

    private static InsnList enterHook(String owner, MethodNode method, boolean readGameState) {
        InsnList hook = new InsnList();
        hook.add(new LdcInsnNode(owner));
        hook.add(new LdcInsnNode(method.name + method.desc));
        hook.add(new VarInsnNode(ALOAD, 0));
        if (readGameState) hook.add(new jdk.internal.org.objectweb.asm.tree.FieldInsnNode(GETSTATIC, "m", "e", "I"));
        else hook.add(new InsnNode(ICONST_M1));
        hook.add(new MethodInsnNode(INVOKESTATIC, PROBE, "enter",
            "(Ljava/lang/String;Ljava/lang/String;Ljava/lang/Object;I)V", false));
        return hook;
    }

    private static InsnList exitHook(String owner, MethodNode method) {
        InsnList hook = new InsnList();
        hook.add(new LdcInsnNode(owner));
        hook.add(new LdcInsnNode(method.name + method.desc));
        hook.add(new VarInsnNode(ALOAD, 0));
        hook.add(new MethodInsnNode(INVOKESTATIC, PROBE, "exit",
            "(Ljava/lang/String;Ljava/lang/String;Ljava/lang/Object;)V", false));
        return hook;
    }

    private static byte[] transform(byte[] input, String mode, Stats stats) {
        ClassNode type = new ClassNode();
        new ClassReader(input).accept(type, 0);
        boolean changed = false;
        for (MethodNode method : type.methods) {
            String key = type.name + "." + method.name + method.desc;
            boolean gamePaint = mode.equals("game") && key.equals(GAME_PAINT);
            boolean platformFlush = mode.equals("emulator") && key.equals(PLATFORM_FLUSH);
            boolean painterRun = mode.equals("emulator") && key.equals(PAINTER_RUN);
            boolean lcdPaint = mode.equals("emulator") && key.equals(LCD_PAINT);
            boolean selected = gamePaint || platformFlush || painterRun || lcdPaint;
            AbstractInsnNode[] original = method.instructions.toArray();

            if (selected) {
                method.instructions.insert(enterHook(type.name, method, gamePaint));
                changed = true;
                if (gamePaint) stats.gamePaint++;
                if (platformFlush) stats.platformFlush++;
                if (painterRun) stats.painterRun++;
                if (lcdPaint) stats.lcdPaint++;
            }

            if (painterRun) {
                for (AbstractInsnNode instruction : original) {
                    if (instruction instanceof MethodInsnNode call && call.name.equals("repaint") &&
                        call.desc.equals("()V")) {
                        InsnList request = new InsnList();
                        request.add(new InsnNode(DUP));
                        request.add(new LdcInsnNode(type.name + "." + method.name + method.desc));
                        request.add(new MethodInsnNode(INVOKESTATIC, PROBE, "repaintRequest",
                            "(Ljava/lang/Object;Ljava/lang/String;)V", false));
                        method.instructions.insertBefore(instruction, request);
                        stats.repaintCallsites++;
                        changed = true;
                    }
                }
            }

            if (selected) {
                for (AbstractInsnNode instruction : original) {
                    if (instruction.getOpcode() == RETURN)
                        method.instructions.insertBefore(instruction, exitHook(type.name, method));
                }
            }
        }
        if (!changed) return null;
        ClassWriter writer = new ClassWriter(ClassWriter.COMPUTE_MAXS);
        type.accept(writer);
        return writer.toByteArray();
    }

    private static void transformJar(Path source, Path destination, String mode, Stats stats) throws Exception {
        try (JarFile input = new JarFile(source.toFile());
             OutputStream fileOut = Files.newOutputStream(destination);
             JarOutputStream output = new JarOutputStream(fileOut)) {
            Enumeration<JarEntry> entries = input.entries();
            while (entries.hasMoreElements()) {
                JarEntry entry = entries.nextElement();
                if (signedMetadata(entry.getName())) continue;
                byte[] bytes;
                try (InputStream stream = input.getInputStream(entry)) {
                    bytes = stream.readAllBytes();
                }
                if (entry.getName().endsWith(".class")) {
                    String className = entry.getName().substring(0, entry.getName().length() - 6);
                    boolean candidate = mode.equals("game") ? className.equals("ar") :
                        className.equals("org/recompile/mobile/MobilePlatform") ||
                        className.equals("org/recompile/freej2me/FreeJ2ME$6") ||
                        className.equals("org/recompile/freej2me/FreeJ2ME$LCD");
                    if (candidate) {
                        byte[] transformed = transform(bytes, mode, stats);
                        if (transformed != null) bytes = transformed;
                    }
                }
                JarEntry copy = new JarEntry(entry.getName());
                if (entry.getTime() >= 0) copy.setTime(entry.getTime());
                output.putNextEntry(copy);
                output.write(bytes);
                output.closeEntry();
            }
        }
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 3) throw new IllegalArgumentException("usage: input.jar output.jar game|emulator");
        String mode = args[2];
        if (!mode.equals("game") && !mode.equals("emulator")) throw new IllegalArgumentException("mode must be game or emulator");
        Stats stats = new Stats();
        transformJar(Path.of(args[0]), Path.of(args[1]), mode, stats);
        if (mode.equals("game") && stats.gamePaint != 1)
            throw new IllegalStateException("Expected one ar.paint target; got " + stats.gamePaint);
        if (mode.equals("emulator") && (stats.platformFlush != 1 || stats.painterRun != 1 ||
                stats.lcdPaint != 1 || stats.repaintCallsites < 1))
            throw new IllegalStateException("Expected all emulator seam hooks; got flush=" + stats.platformFlush +
                " painter=" + stats.painterRun + " lcdPaint=" + stats.lcdPaint +
                " repaintCalls=" + stats.repaintCallsites);
        System.out.println("{\"mode\":\"" + mode + "\",\"ar_paint\":" + stats.gamePaint +
            ",\"platform_flush\":" + stats.platformFlush + ",\"painter_run\":" + stats.painterRun +
            ",\"lcd_paint\":" + stats.lcdPaint + ",\"repaint_callsites\":" + stats.repaintCallsites + "}");
    }
}
