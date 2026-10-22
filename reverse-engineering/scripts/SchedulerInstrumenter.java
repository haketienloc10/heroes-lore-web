import java.nio.file.*;
import java.util.*;
import java.util.jar.*;
import jdk.internal.org.objectweb.asm.*;
import jdk.internal.org.objectweb.asm.tree.*;

/** Offline copies only. Keeps original instruction order and existing frames;
 * COMPUTE_MAXS accounts for stack-neutral probes, no new locals/control edges. */
public class SchedulerInstrumenter implements Opcodes {
    static final Set<String> targets = Set.of(
        "br.run()V", "br.b()V", "br.a(I)V", "q.i()V", "q.j()V",
        "ar.paint(Ljavax/microedition/lcdui/Graphics;)V", "ar.a(Ljavax/microedition/lcdui/Graphics;)V",
        "ad.a(Ljavax/microedition/lcdui/Graphics;)V", "ar.keyPressed(I)V", "ar.keyReleased(I)V",
        "ar.showNotify()V", "ar.hideNotify()V", "bf.run()V", "bt.run()V",
        "m.e()V", "m.g()V", "m.i()V", "m.h()V", "m.q()V", "m.n()V",
        "m.b(B)V", "m.a(B)V", "m.a(BB)V", "m.a(BBB)V", "m.a(BBBB)V", "m.a(I)V",
        "javax/microedition/lcdui/Canvas.repaint()V",
        "javax/microedition/lcdui/Canvas.repaint(IIII)V",
        "javax/microedition/lcdui/Canvas.repaintRequest(IIII)V",
        "javax/microedition/lcdui/Canvas.keyRepeated(I)V",
        "javax/microedition/lcdui/Display.callSerially(Ljava/lang/Runnable;)V",
        "javax/microedition/lcdui/Display.setCurrent(Ljavax/microedition/lcdui/Displayable;)V",
        "org/recompile/mobile/MobilePlatform.flushGraphics(Lorg/recompile/mobile/PlatformImage;IIII)V",
        "org/recompile/freej2me/FreeJ2ME$LCD.paint(Ljava/awt/Graphics;)V"
    );
    static InsnList probe(String owner, MethodNode m, String phase, String detail) {
        InsnList x = new InsnList();
        x.add(new LdcInsnNode(owner)); x.add(new LdcInsnNode(m.name + m.desc));
        x.add(new LdcInsnNode(phase)); x.add(new LdcInsnNode(detail));
        if ((m.access & ACC_STATIC) == 0) x.add(new VarInsnNode(ALOAD, 0));
        else x.add(new InsnNode(ACONST_NULL)); // CLDC class versions predate ldc Class.
        Type[] args = Type.getArgumentTypes(m.desc);
        if (args.length > 0 && args[0].getSort() == Type.INT || args.length > 0 && args[0].getSort() == Type.BYTE)
            x.add(new VarInsnNode(ILOAD, (m.access & ACC_STATIC) == 0 ? 1 : 0));
        else x.add(new LdcInsnNode(Integer.MIN_VALUE));
        x.add(new MethodInsnNode(INVOKESTATIC, "org/recompile/hlprobe/TraceProbe", "event",
            "(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/Object;I)V", false));
        return x;
    }
    static byte[] transform(byte[] bytes) {
        ClassNode c = new ClassNode(); new ClassReader(bytes).accept(c, 0);
        boolean changed = false;
        for (MethodNode m : c.methods) {
            String key = c.name + "." + m.name + m.desc;
            if (!targets.contains(key)) continue;
            System.out.println(key); changed = true;
            AbstractInsnNode[] original = m.instructions.toArray();
            m.instructions.insert(probe(c.name, m, "entry", ""));
            int returns = 0;
            for (AbstractInsnNode n : original) {
                if (n.getOpcode() == MONITORENTER)
                    m.instructions.insert(n, probe(c.name, m, "point", "monitor_acquired"));
                if (n instanceof FieldInsnNode f && f.getOpcode() == PUTSTATIC && c.name.equals("m") && m.name.equals("e") && m.desc.equals("()V") && f.name.equals("b") && f.desc.equals("B"))
                    m.instructions.insert(n, probe(c.name, m, "point", "after_reset_m.b:B_original_bci12"));
                if (n instanceof MethodInsnNode call && c.name.equals("br") && m.name.equals("b") && call.owner.equals("java/lang/Thread")) {
                    m.instructions.insertBefore(n, probe(c.name, m, "point", "before_Thread." + call.name));
                    m.instructions.insert(n, probe(c.name, m, "point", "after_Thread." + call.name));
                }
                if (n.getOpcode() >= IRETURN && n.getOpcode() <= RETURN) {
                    String detail = c.name.equals("m") && m.name.equals("e") && m.desc.equals("()V") && returns == 0 ? "original_bci6" : "normal_return_" + returns;
                    m.instructions.insertBefore(n, probe(c.name, m, "exit", detail)); returns++;
                }
            }
        }
        if (!changed) return bytes;
        ClassWriter w = new ClassWriter(ClassWriter.COMPUTE_MAXS); c.accept(w); return w.toByteArray();
    }
    public static void main(String[] args) throws Exception {
        if (Files.exists(Path.of(args[1]))) throw new IllegalStateException("Output exists");
        try (JarFile src = new JarFile(args[0]); JarOutputStream dst = new JarOutputStream(Files.newOutputStream(Path.of(args[1])))) {
            for (JarEntry e : Collections.list(src.entries())) {
                byte[] b = src.getInputStream(e).readAllBytes();
                if (e.getName().endsWith(".class")) b = transform(b);
                JarEntry out = new JarEntry(e.getName()); out.setTime(e.getTime());
                dst.putNextEntry(out); dst.write(b); dst.closeEntry();
            }
        }
    }
}
