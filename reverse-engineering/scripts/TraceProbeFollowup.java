package org.recompile.hlprobe;

import java.lang.instrument.Instrumentation;
import java.lang.reflect.Field;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;

/** Bounded trace with exact Runnable identity and repaint request candidate sets. */
public class TraceProbeFollowup {
    static final int CAP = 1_000_000;
    static final int MAX_PENDING_REPAINTS = 20_000;
    static final ArrayList<String> rows = new ArrayList<>();
    static final ThreadLocal<ArrayDeque<Long>> spans = ThreadLocal.withInitial(ArrayDeque::new);
    static final ThreadLocal<ArrayDeque<Long>> repaintStack = ThreadLocal.withInitial(ArrayDeque::new);
    static final ArrayDeque<RepaintTicket> pendingRepaints = new ArrayDeque<>();
    static final ArrayDeque<SerialTicket> pendingSerial = new ArrayDeque<>();
    static final Map<String, Field> fields = new HashMap<>();
    static long seq, dropped, errors, nextSerial, nextRepaint, repaintQueueDropped;
    static Object controller, canvas;
    static Class<?> stateClass, qClass, btClass, bfClass;
    static volatile Integer observedAg;
    static Path output;
    static String run;

    static final class SerialTicket { final long id; final Object runnable; SerialTicket(long i, Object r) { id=i; runnable=r; } }
    static final class RepaintTicket { final long id, time; RepaintTicket(long i, long t) { id=i; time=t; } }

    static Object read(Class<?> c, Object obj, String name, Class<?> type) {
        try {
            if (c == null) return null;
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
    static Class<?> qAncestor(Class<?> type) {
        for (Class<?> c=type; c!=null; c=c.getSuperclass())
            if (c.getName().equals("q")) return c;
        return null;
    }
    static String quote(String s) {
        return "\""+s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r")+"\"";
    }
    static String listJson(List<Long> values) {
        StringBuilder b = new StringBuilder("[");
        for (int i=0;i<values.size();i++) { if (i>0) b.append(','); b.append(values.get(i)); }
        return b.append(']').toString();
    }
    static boolean repaintMethod(String owner, String method) {
        return owner.equals("javax/microedition/lcdui/Canvas") && (method.startsWith("repaint()") || method.startsWith("repaint(IIII)"));
    }
    static long takeSerial(Object runnable) {
        if (runnable == null) return 0;
        for (Iterator<SerialTicket> it=pendingSerial.iterator(); it.hasNext();) {
            SerialTicket t=it.next();
            if (t.runnable == runnable) { it.remove(); return t.id; }
        }
        return 0;
    }

    public static synchronized void event(String owner, String method, String phase, String detail,
                                          Object self, int arg0, long long0, long long1,
                                          boolean hasLong0, boolean hasLong1, Object objectArg) {
        long t = System.nanoTime();
        Thread thread = Thread.currentThread();
        Class<?> caller = StackWalker.getInstance(StackWalker.Option.RETAIN_CLASS_REFERENCE).getCallerClass();
        if (owner.equals("m")) stateClass = caller;
        if (owner.equals("br") && self != null) controller = self;
        if (owner.equals("q") || owner.equals("ar") || owner.equals("bf")) {
            canvas = self;
            qClass = owner.equals("q") ? caller : qAncestor(caller);
        }
        if (owner.equals("bt")) btClass = caller;
        if (owner.equals("bf")) bfClass = caller;

        ArrayDeque<Long> stack = spans.get();
        long id, parent = 0, serialId = 0, repaintId = 0;
        List<Long> paintCandidates = List.of();
        boolean repaintEvent = repaintMethod(owner, method);
        ArrayDeque<Long> requests = repaintStack.get();
        if (phase.equals("entry")) {
            parent = stack.isEmpty() ? 0 : stack.peek(); id = seq+1; stack.push(id);
            if (owner.equals("javax/microedition/lcdui/Display") && method.startsWith("callSerially")) {
                serialId = ++nextSerial;
                if (pendingSerial.size() < MAX_PENDING_REPAINTS) pendingSerial.addLast(new SerialTicket(serialId, objectArg));
                else repaintQueueDropped++;
            }
            if (owner.equals("br") && method.equals("run()V")) serialId = takeSerial(self);
            if (repaintEvent) {
                repaintId = requests.isEmpty() ? ++nextRepaint : requests.peek();
                if (requests.isEmpty()) {
                    requests.push(repaintId);
                    if (pendingRepaints.size() < MAX_PENDING_REPAINTS) pendingRepaints.addLast(new RepaintTicket(repaintId,t));
                    else repaintQueueDropped++;
                } else requests.push(repaintId);
            }
            if (owner.equals("org/recompile/freej2me/FreeJ2ME$LCD") && method.startsWith("paint(")) {
                ArrayList<Long> candidates = new ArrayList<>();
                while (!pendingRepaints.isEmpty()) candidates.add(pendingRepaints.removeFirst().id);
                paintCandidates = candidates;
            }
        } else {
            id = stack.isEmpty() ? 0 : stack.peek();
            if (phase.equals("exit") && !stack.isEmpty()) stack.pop();
            if (!stack.isEmpty()) parent = stack.peek();
            if (repaintEvent && !requests.isEmpty()) { repaintId=requests.pop(); }
        }

        Object state = read(stateClass, null, "e", int.class);
        Object pending = read(stateClass, null, "b", byte.class);
        Object paramC = read(stateClass, null, "c", byte.class);
        Object paramD = read(stateClass, null, "d", byte.class);
        Object qA = canvas == null ? null : read(qClass, canvas, "a", boolean.class);
        Object qF = canvas == null ? null : read(qClass, canvas, "f", int.class);
        Object qB = read(qClass, null, "b", boolean.class);
        Object btMode = read(btClass, null, "a", byte.class);
        Object btBusy = read(btClass, null, "a", boolean.class);
        Object bfMode = owner.equals("bf") ? read(bfClass, self, "a", byte.class) : null;
        Object bfSubmode = owner.equals("bf") ? read(bfClass, self, "b", byte.class) : null;
        Object period = read(controller == null ? null : controller.getClass(), controller, "d", int.class);
        Object schedulerStart = read(controller == null ? null : controller.getClass(), controller, "a", long.class);
        Object order = read(controller == null ? null : controller.getClass(), controller, "d", boolean.class);
        Object bypass = observedAg == null ? null : observedAg != 0;

        long number = ++seq;
        if (rows.size() >= CAP) { dropped++; return; }
        String row = "{\"run_id\":"+quote(run)+",\"seq\":"+number+",\"t_mono_ns\":"+t+
            ",\"thread_id\":"+thread.threadId()+",\"thread_name\":"+quote(thread.getName())+
            ",\"class\":"+quote(owner)+",\"method\":"+quote(method)+",\"phase\":"+quote(phase)+
            ",\"detail\":"+quote(detail)+",\"span_id\":"+id+",\"parent_span_id\":"+parent+
            ",\"call_serially_id\":"+serialId+",\"repaint_request_id\":"+repaintId+
            ",\"paint_request_candidates\":"+listJson(paintCandidates)+
            ",\"receiver_id\":"+(self==null?0:System.identityHashCode(self))+
            ",\"arg0_int\":"+(arg0==Integer.MIN_VALUE?"null":arg0)+
            ",\"arg0_long\":"+(hasLong0?Long.toString(long0):"null")+
            ",\"arg1_long\":"+(hasLong1?Long.toString(long1):"null")+
            ",\"m.e:I\":"+state+",\"m.b:B\":"+pending+",\"m.c:B\":"+paramC+",\"m.d:B\":"+paramD+
            ",\"q.a:Z\":"+qA+",\"q.b:Z\":"+qB+",\"q.f:I\":"+qF+
            ",\"bt.a:B\":"+btMode+",\"bt.a:Z\":"+btBusy+",\"bf.a:B\":"+bfMode+",\"bf.b:B\":"+bfSubmode+
            ",\"br.d:I\":"+period+",\"br.a:J\":"+schedulerStart+
            ",\"br.d:Z\":"+order+",\"ag.a:Z\":"+bypass+"}";
        rows.add(row);
    }

    public static void waitRequested(long milliseconds, String owner, String method, String detail) {
        event(owner, method, "point", detail, null, Integer.MIN_VALUE, milliseconds, 0, true, false, null);
    }

    public static void observeAg(int value, String owner, String method, String detail) {
        observedAg = value == 0 ? 0 : 1;
        event(owner, method, "point", detail + ";value=" + observedAg, null,
            Integer.MIN_VALUE, 0, 0, false, false, null);
    }

    public static void premain(String args, Instrumentation inst) throws Exception {
        String[] parts = args.split("\\|", 2); output = Path.of(parts[0]); run = parts[1];
        long[] deltas = new long[100000]; long last = System.nanoTime();
        for (int i=0;i<deltas.length;i++) { long now=System.nanoTime(); deltas[i]=now-last; last=now; }
        Arrays.sort(deltas);
        Files.writeString(output.resolveSibling("clock.json"), "{\"utc\":"+quote(Instant.now().toString())+
            ",\"mono_ns\":"+System.nanoTime()+",\"successive_read_n\":100000,\"min_ns\":"+deltas[0]+
            ",\"median_ns\":"+deltas[50000]+",\"p95_ns\":"+deltas[95000]+",\"absolute_accuracy_ns\":null}\n");
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            synchronized (TraceProbeFollowup.class) {
                try {
                    Files.write(output, rows);
                    Files.writeString(output.resolveSibling("trace-health.json"), "{\"events\":"+seq+
                        ",\"retained\":"+rows.size()+",\"dropped\":"+dropped+",\"field_read_errors\":"+errors+
                        ",\"capacity\":"+CAP+",\"pending_ticket_queue_dropped\":"+repaintQueueDropped+
                        ",\"pending_repaints_at_shutdown\":"+pendingRepaints.size()+",\"exceptional_exit_hooks\":false}\n");
                } catch (Exception e) { e.printStackTrace(); }
            }
        }, "hl-followup-trace-flush"));
    }
}
