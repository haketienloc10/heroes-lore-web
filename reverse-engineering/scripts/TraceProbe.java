package org.recompile.hlprobe;

import java.lang.instrument.Instrumentation;
import java.lang.reflect.*;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;

/** In-memory bounded trace, flushed only on shutdown. No game field writes. */
public class TraceProbe {
    static final int CAP = 1_000_000;
    static final ArrayList<String> rows = new ArrayList<>();
    static final ThreadLocal<ArrayDeque<Long>> spans = ThreadLocal.withInitial(ArrayDeque::new);
    static final ArrayDeque<Long> serial = new ArrayDeque<>();
    static final Map<String, Field> fields = new HashMap<>();
    static long seq, dropped, errors;
    static Object controller, canvas;
    static Class<?> stateClass;
    static Path output;
    static String run;
    static Object read(Class<?> c, Object obj, String name, Class<?> type) {
        try {
            String key = c.getName()+":"+name+":"+type.getName();
            Field f = fields.get(key);
            if (f == null) {
                for (Class<?> p = c; p != null && f == null; p = p.getSuperclass())
                    for (Field candidate : p.getDeclaredFields())
                        if (candidate.getName().equals(name) && candidate.getType() == type) { f = candidate; break; }
                if (f == null) return null;
                f.setAccessible(true); fields.put(key, f);
            }
            return f.get(obj);
        } catch (Exception e) { errors++; return null; }
    }
    static String quote(String s) { return "\""+s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n")+"\""; }
    public static synchronized void event(String owner, String method, String phase, String detail, Object self, int arg) {
        long t = System.nanoTime();
        Thread thread = Thread.currentThread();
        if (owner.equals("m") && stateClass == null)
            stateClass = StackWalker.getInstance(StackWalker.Option.RETAIN_CLASS_REFERENCE).getCallerClass();
        if (owner.equals("br") && self != null) controller = self;
        if (owner.equals("q") || owner.equals("ar")) canvas = self;
        ArrayDeque<Long> stack = spans.get();
        long id, parent = 0, correlation = 0;
        if (phase.equals("entry")) {
            parent = stack.isEmpty() ? 0 : stack.peek(); id = seq+1; stack.push(id);
            if (owner.equals("javax/microedition/lcdui/Display") && method.startsWith("callSerially")) serial.add(id);
            if (owner.equals("br") && method.equals("run()V") && !serial.isEmpty()) correlation = serial.remove();
        } else {
            id = stack.isEmpty() ? 0 : stack.peek();
            if (phase.equals("exit") && !stack.isEmpty()) stack.pop();
            if (!stack.isEmpty()) parent = stack.peek();
        }
        Object state = stateClass == null ? null : read(stateClass, null, "e", int.class);
        Object pending = stateClass == null ? null : read(stateClass, null, "b", byte.class);
        Object qa = canvas == null ? null : read(canvas.getClass(), canvas, "a", boolean.class);
        // ar also declares a boolean 'a'? Select q exactly to avoid inherited collisions.
        Class<?> q = canvas == null ? null : canvas.getClass();
        while (q != null && !q.getName().equals("q")) q = q.getSuperclass();
        qa = q == null ? null : read(q, canvas, "a", boolean.class);
        Object qf = q == null ? null : read(q, canvas, "f", int.class);
        Object period = controller == null ? null : read(controller.getClass(), controller, "d", int.class);
        Object order = controller == null ? null : read(controller.getClass(), controller, "d", boolean.class);
        long number = ++seq;
        if (rows.size() >= CAP) { dropped++; return; }
        rows.add("{\"run_id\":"+quote(run)+",\"seq\":"+number+",\"t_mono_ns\":"+t+
            ",\"thread_id\":"+thread.threadId()+",\"thread_name\":"+quote(thread.getName())+
            ",\"class\":"+quote(owner)+",\"method\":"+quote(method)+",\"phase\":"+quote(phase)+
            ",\"detail\":"+quote(detail)+",\"span_id\":"+id+",\"parent_span_id\":"+parent+
            ",\"serial_enqueue_id\":"+correlation+",\"receiver_id\":"+(self==null?0:System.identityHashCode(self))+
            ",\"arg0_int\":"+(arg==Integer.MIN_VALUE?"null":arg)+",\"m.e:I\":"+state+",\"m.b:B\":"+pending+
            ",\"q.a:Z\":"+qa+",\"q.f:I\":"+qf+",\"br.d:I\":"+period+",\"br.d:Z\":"+order+"}");
    }
    public static void premain(String args, Instrumentation inst) throws Exception {
        String[] parts = args.split("\\|", 2); output = Path.of(parts[0]); run = parts[1];
        long[] deltas = new long[100000]; long last = System.nanoTime();
        for (int i=0;i<deltas.length;i++) { long now=System.nanoTime(); deltas[i]=now-last; last=now; }
        Arrays.sort(deltas);
        Files.writeString(output.resolveSibling("clock.json"), "{\"utc\":"+quote(Instant.now().toString())+
            ",\"mono_ns\":"+System.nanoTime()+",\"successive_read_n\":100000,\"min_ns\":"+deltas[0]+",\"median_ns\":"+deltas[50000]+",\"p95_ns\":"+deltas[95000]+",\"absolute_accuracy_ns\":null}");
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            synchronized (TraceProbe.class) {
                try {
                    Files.write(output, rows);
                    Files.writeString(output.resolveSibling("trace-health.json"), "{\"events\":"+seq+",\"retained\":"+rows.size()+",\"dropped\":"+dropped+",\"field_read_errors\":"+errors+",\"capacity\":"+CAP+",\"exceptional_exit_hooks\":false}");
                } catch (Exception e) { e.printStackTrace(); }
            }
        }, "hl-trace-flush"));
    }
}
