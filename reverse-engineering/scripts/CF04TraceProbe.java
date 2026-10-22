package org.recompile.hlprobe;

import java.lang.instrument.Instrumentation;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;

/** Non-reflective recorder for a separately labeled CF-04 command injection run. */
public final class CF04TraceProbe {
    private static final List<String> rows = new ArrayList<>();
    private static long seq;
    private static long nextSpan;
    private static Path output;
    private static String runId;
    private static boolean injectionDone;
    private static final ThreadLocal<Long> activeMESpan = new ThreadLocal<>();
    private static long nextWorkerId;
    private static final Map<Object, Long> workerOrigins = new IdentityHashMap<>();
    private static final Map<Object, Long> workerIds = new IdentityHashMap<>();

    private static String quote(String value) {
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    private static synchronized void emit(String site, Long span, String fields) {
        Thread thread = Thread.currentThread();
        rows.add("{\"run_id\":" + quote(runId) + ",\"seq\":" + (++seq) +
            ",\"t_mono_ns\":" + System.nanoTime() + ",\"thread_id\":" + thread.threadId() +
            ",\"thread_name\":" + quote(thread.getName()) + ",\"site\":" + quote(site) +
            ",\"m_e_span\":" + (span == null ? "null" : span) + (fields == null ? "" : "," + fields) + "}");
    }

    private static String intField(String name, int value) { return quote(name) + ":" + value; }

    private static Long span() { return activeMESpan.get(); }

    public static synchronized boolean shouldInject(int gameState, int pendingCommand) {
        if (!injectionDone && gameState == 2 && pendingCommand == 0) {
            injectionDone = true;
            emit("controlled_injection_requested", null,
                intField("trigger_m.e:I", gameState) + "," + intField("trigger_m.b:B", pendingCommand) +
                ",\"command\":21,\"param\":2");
            return true;
        }
        return false;
    }

    public static synchronized void pendingSetter(int command, int param) {
        emit("m.a(BB)_entry", span(), intField("argument_command", command) + "," + intField("argument_param", param));
    }

    public static synchronized void naturalCallSite(String site) {
        emit(site, span(), null);
    }

    public static synchronized void beginME(int gameState, int command, int paramC, int paramD, int paramE) {
        if (command == 0) return;
        long id = ++nextSpan;
        activeMESpan.set(id);
        emit("m.e_entry_pending", id, intField("m.e:I", gameState) + "," + intField("m.b:B", command) +
            "," + intField("m.c:B", paramC) + "," + intField("m.d:B", paramD) + "," + intField("m.e:B", paramE));
    }

    public static synchronized void mark(String site) {
        if (span() != null) emit(site, span(), null);
    }

    public static synchronized void stateSetter(int value) {
        emit("m.a(I)_state_setter", span(), intField("new_m.e:I", value));
    }

    public static synchronized void workerMode(String phase, int value) {
        emit(phase, span(), intField("bt.a:B", value));
    }

    public static synchronized void registerWorker(Object worker) {
        Long origin = span();
        if (origin == null) return;
        long id = ++nextWorkerId;
        workerOrigins.put(worker, origin);
        workerIds.put(worker, id);
        emit("bt_worker_constructed", origin, intField("worker_id", (int) id));
    }

    public static synchronized void workerRun(String phase, Object worker, int value) {
        Long origin = workerOrigins.get(worker);
        Long workerId = workerIds.get(worker);
        if (origin == null && value != 5) return;
        Long eventSpan = origin == null ? span() : origin;
        String fields = intField("bt.a:B", value) + "," +
            (workerId == null ? "\"worker_id\":null" : intField("worker_id", (int) (long) workerId));
        emit(phase, eventSpan, fields);
    }

    public static synchronized void finishME(int opcodeIndex) {
        Long id = span();
        if (id == null) return;
        emit("m.e_return", id, intField("transformed_opcode_index", opcodeIndex));
        activeMESpan.remove();
    }

    public static void premain(String args, Instrumentation instrumentation) throws Exception {
        String[] parts = args.split("\\|", 2);
        if (parts.length != 2) throw new IllegalArgumentException("Expected output path|run id");
        output = Path.of(parts[0]);
        runId = parts[1];
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            synchronized (CF04TraceProbe.class) {
                try {
                    Files.createDirectories(output.toAbsolutePath().getParent());
                    Files.write(output, rows);
                } catch (Exception error) { error.printStackTrace(); }
            }
        }, "cf04-trace-flush"));
    }
}
