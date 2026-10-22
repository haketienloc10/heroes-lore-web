import java.nio.file.*;
import java.util.*;
import java.util.jar.*;
import jdk.internal.org.objectweb.asm.*;
import jdk.internal.org.objectweb.asm.tree.*;

/** Follow-up probe for SCN-0004. Inserts stack-neutral calls into private copies. */
public class SchedulerInstrumenterFollowup implements Opcodes {
    static final Set<String> targets = Set.of(
        "br.run()V", "br.b()V", "br.a(I)V", "br.a(JJ)V", "q.i()V", "q.j()V",
        "ar.paint(Ljavax/microedition/lcdui/Graphics;)V", "ar.a(Ljavax/microedition/lcdui/Graphics;)V",
        "ad.a(Ljavax/microedition/lcdui/Graphics;)V", "ar.keyPressed(I)V", "ar.keyReleased(I)V",
        "ar.showNotify()V", "ar.hideNotify()V", "bf.run()V", "bt.run()V",
        "bt.a()V", "bt.b()V", "bt.c()V", "bt.d()V", "bt.a()Lad;",
        "bt.f()V", "bt.g()V", "bt.h()V", "bt.i()V", "bt.j()V", "bt.k()V",
        "m.e()V", "m.g()V", "m.i()V", "m.h()V", "m.q()V", "m.n()V",
        "m.b(B)V", "m.b(BBBB)V", "m.a(B)V", "m.a(BB)V", "m.a(BBB)V", "m.a(BBBB)V", "m.a(I)V",
        "javax/microedition/lcdui/Canvas.repaint()V",
        "javax/microedition/lcdui/Canvas.repaint(IIII)V",
        "javax/microedition/lcdui/Canvas.repaintRequest(IIII)V",
        "javax/microedition/lcdui/Canvas.keyRepeated(I)V",
        "javax/microedition/lcdui/Display.callSerially(Ljava/lang/Runnable;)V",
        "javax/microedition/lcdui/Display.setCurrent(Ljavax/microedition/lcdui/Displayable;)V",
        "org/recompile/mobile/MobilePlatform.flushGraphics(Lorg/recompile/mobile/PlatformImage;IIII)V",
        "org/recompile/freej2me/FreeJ2ME$LCD.paint(Ljava/awt/Graphics;)V"
    );

    static boolean monitoredStore(FieldInsnNode f) {
        return (f.owner.equals("m") &&
                ((f.name.equals("b") && f.desc.equals("B")) ||
                 (f.name.equals("c") && f.desc.equals("B")) ||
                 (f.name.equals("d") && f.desc.equals("B")) ||
                 (f.name.equals("e") && f.desc.equals("I")))) ||
               (f.owner.equals("br") && f.name.equals("d") && f.desc.equals("Z")) ||
               (f.owner.equals("ag") && f.name.equals("a") && f.desc.equals("Z")) ||
               (f.owner.equals("q") && ((f.name.equals("a") && f.desc.equals("Z")) ||
                                          (f.name.equals("b") && f.desc.equals("Z")) ||
                                          (f.name.equals("f") && f.desc.equals("I")))) ||
               (f.owner.equals("bt") && f.name.equals("a") && (f.desc.equals("B") || f.desc.equals("Z"))) ||
               (f.owner.equals("bf") && ((f.name.equals("a") || f.name.equals("b")) && f.desc.equals("B")));
    }

    static InsnList probe(String owner, MethodNode m, String phase, String detail) {
        InsnList x = new InsnList();
        x.add(new LdcInsnNode(owner));
        x.add(new LdcInsnNode(m.name + m.desc));
        x.add(new LdcInsnNode(phase));
        x.add(new LdcInsnNode(detail));
        if ((m.access & ACC_STATIC) == 0) x.add(new VarInsnNode(ALOAD, 0));
        else x.add(new InsnNode(ACONST_NULL));
        Type[] args = Type.getArgumentTypes(m.desc);
        if (args.length > 0 && (args[0].getSort() == Type.INT || args[0].getSort() == Type.BYTE))
            x.add(new VarInsnNode(ILOAD, (m.access & ACC_STATIC) == 0 ? 1 : 0));
        else x.add(new LdcInsnNode(Integer.MIN_VALUE));
        int slot = (m.access & ACC_STATIC) == 0 ? 1 : 0;
        int long0 = -1, long1 = -1;
        for (Type arg : args) {
            if (arg.getSort() == Type.LONG) {
                if (long0 < 0) long0 = slot; else if (long1 < 0) long1 = slot;
            }
            slot += arg.getSize();
        }
        if (long0 < 0) x.add(new InsnNode(LCONST_0)); else x.add(new VarInsnNode(LLOAD, long0));
        if (long1 < 0) x.add(new InsnNode(LCONST_0)); else x.add(new VarInsnNode(LLOAD, long1));
        x.add(new InsnNode(long0 < 0 ? ICONST_0 : ICONST_1));
        x.add(new InsnNode(long1 < 0 ? ICONST_0 : ICONST_1));
        if (owner.equals("javax/microedition/lcdui/Display") && m.name.equals("callSerially") && args.length == 1)
            x.add(new VarInsnNode(ALOAD, 1));
        else x.add(new InsnNode(ACONST_NULL));
        x.add(new MethodInsnNode(INVOKESTATIC, "org/recompile/hlprobe/TraceProbeFollowup", "event",
            "(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/Object;IJJZZLjava/lang/Object;)V", false));
        return x;
    }

    static byte[] transform(byte[] bytes) {
        ClassNode c = new ClassNode(); new ClassReader(bytes).accept(c, 0);
        boolean changed = false;
        for (MethodNode m : c.methods) {
            String key = c.name + "." + m.name + m.desc;
            boolean selected = targets.contains(key);
            AbstractInsnNode[] original = m.instructions.toArray();
            int opcodeIndex = 0, returnIndex = 0;
            if (selected) {
                System.out.println(key); changed = true;
                m.instructions.insert(probe(c.name, m, "entry", ""));
            }
            for (AbstractInsnNode n : original) {
                int opcode = n.getOpcode();
                if (opcode < 0) continue;
                String where = "op_index=" + opcodeIndex++;
                if (selected && opcode == MONITORENTER)
                    m.instructions.insert(n, probe(c.name, m, "point", "monitor_acquired;" + where));
                if (n instanceof MethodInsnNode call && selected && call.owner.equals("java/lang/Thread")) {
                    if (call.name.equals("sleep") && call.desc.equals("(J)V")) {
                        InsnList requested = new InsnList();
                        requested.add(new InsnNode(DUP2));
                        requested.add(new LdcInsnNode(c.name));
                        requested.add(new LdcInsnNode(m.name + m.desc));
                        requested.add(new LdcInsnNode("thread_sleep_requested_ms;" + where));
                        requested.add(new MethodInsnNode(INVOKESTATIC, "org/recompile/hlprobe/TraceProbeFollowup", "waitRequested",
                            "(JLjava/lang/String;Ljava/lang/String;Ljava/lang/String;)V", false));
                        m.instructions.insertBefore(n, requested);
                    }
                    if (call.name.equals("sleep") || call.name.equals("yield") || call.name.equals("start")) {
                        m.instructions.insertBefore(n, probe(c.name, m, "point", "before_Thread." + call.name + ";" + where));
                        m.instructions.insert(n, probe(c.name, m, "point", "after_Thread." + call.name + ";" + where));
                    }
                }
                if (n instanceof MethodInsnNode call && selected && c.name.equals("ar") && m.name.equals("paint") && call.owner.equals("m") &&
                    (call.name.equals("e") || call.name.equals("g") || call.name.equals("i")))
                    m.instructions.insert(n, probe(c.name, m, "point", "after_call_m." + call.name + call.desc + ";" + where));
                if (n instanceof MethodInsnNode call && selected && c.name.equals("bt") && m.name.equals("run")) {
                    if (call.owner.equals("bt") && call.name.equals("a") && call.desc.equals("()Lad;"))
                        m.instructions.insertBefore(n, probe(c.name, m, "point", "worker_mode2_branch_call;original_bci=49;" + where));
                    else if (call.owner.equals("bt") && call.name.equals("h") && call.desc.equals("()V"))
                        m.instructions.insertBefore(n, probe(c.name, m, "point", "worker_mode3_branch_call;original_bci=176;" + where));
                    else if (call.owner.equals("bt") && call.name.equals("f") && call.desc.equals("()V"))
                        m.instructions.insertBefore(n, probe(c.name, m, "point", "worker_mode5_branch_call;original_bci=190;" + where));
                    if (call.owner.equals("m") && call.name.equals("b") && call.desc.equals("(BBBB)V"))
                        m.instructions.insert(n, probe(c.name, m, "point", "worker_post_command_m.b(BBBB);original_bci=168;" + where));
                }
                if (n instanceof FieldInsnNode f && f.owner.equals("ag") && f.name.equals("a") && f.desc.equals("Z")) {
                    if (opcode == GETSTATIC && c.name.equals("br") && m.name.equals("b") && m.desc.equals("()V")) {
                        InsnList observed = new InsnList();
                        observed.add(new InsnNode(DUP));
                        observed.add(new LdcInsnNode(c.name));
                        observed.add(new LdcInsnNode(m.name + m.desc));
                        observed.add(new LdcInsnNode("observed_getstatic_ag.a:Z;" + where));
                        observed.add(new MethodInsnNode(INVOKESTATIC, "org/recompile/hlprobe/TraceProbeFollowup", "observeAg",
                            "(ILjava/lang/String;Ljava/lang/String;Ljava/lang/String;)V", false));
                        m.instructions.insert(n, observed);
                        changed = true;
                    } else if (opcode == PUTSTATIC) {
                        InsnList observed = new InsnList();
                        observed.add(new FieldInsnNode(GETSTATIC, "ag", "a", "Z"));
                        observed.add(new LdcInsnNode(c.name));
                        observed.add(new LdcInsnNode(m.name + m.desc));
                        observed.add(new LdcInsnNode("observed_putstatic_ag.a:Z;" + where));
                        observed.add(new MethodInsnNode(INVOKESTATIC, "org/recompile/hlprobe/TraceProbeFollowup", "observeAg",
                            "(ILjava/lang/String;Ljava/lang/String;Ljava/lang/String;)V", false));
                        m.instructions.insert(n, observed);
                        changed = true;
                    }
                } else if (n instanceof FieldInsnNode f && monitoredStore(f) &&
                           ((opcode == PUTSTATIC && f.getOpcode() == PUTSTATIC) || (opcode == PUTFIELD && f.getOpcode() == PUTFIELD))) {
                    m.instructions.insert(n, probe(c.name, m, "point", "field_store_after=" + f.owner + "." + f.name + ":" + f.desc + ";" + where));
                    changed = true;
                }
                if (selected && opcode >= IRETURN && opcode <= RETURN) {
                    String detail;
                    if (c.name.equals("m") && m.name.equals("e") && m.desc.equals("()V") && returnIndex == 0)
                        detail = "original_bci=6;" + where;
                    else if (c.name.equals("ar") && m.name.equals("paint") && m.desc.equals("(Ljavax/microedition/lcdui/Graphics;)V"))
                        detail = "original_bci=" + (returnIndex == 0 ? "191" : "441") + ";" + where;
                    else detail = "normal_return=" + returnIndex + ";" + where;
                    m.instructions.insertBefore(n, probe(c.name, m, "exit", detail));
                    returnIndex++; changed = true;
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
