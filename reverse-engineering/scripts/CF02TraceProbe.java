package org.recompile.hlprobe;

import java.lang.instrument.Instrumentation;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/** Small, non-reflective probe used only for bt.run() mode-1 branch evidence. */
public final class CF02TraceProbe {
    private static final List<String> rows = new ArrayList<>();
    private static long seq;
    private static long nextSpan;
    private static Path output;
    private static String runId;
    private static final ThreadLocal<Long> span = new ThreadLocal<>();
    private static final ThreadLocal<Integer> mode = new ThreadLocal<>();

    private static String quote(String value) {
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    private static synchronized void emit(String site, Boolean qB) {
        Integer currentMode = mode.get();
        Long currentSpan = span.get();
        if (currentMode == null || currentMode != 1 || currentSpan == null) return;
        Thread thread = Thread.currentThread();
        String row = "{\"run_id\":" + quote(runId) +
            ",\"seq\":" + (++seq) +
            ",\"t_mono_ns\":" + System.nanoTime() +
            ",\"thread_id\":" + thread.threadId() +
            ",\"thread_name\":" + quote(thread.getName()) +
            ",\"span_id\":" + currentSpan +
            ",\"mode\":" + currentMode +
            ",\"site\":" + quote(site) +
            ",\"q.b:Z\":" + (qB == null ? "null" : qB.toString()) + "}";
        rows.add(row);
    }

    public static void begin(int workerMode) {
        long id;
        synchronized (CF02TraceProbe.class) { id = ++nextSpan; }
        span.set(id);
        mode.set(workerMode);
        emit("worker_entry", null);
    }

    public static void mark(String site) { emit(site, null); }
    public static void qStore(boolean value) { emit("q_b_store_after_BCI_172", value); }
    public static void finish() {
        emit("normal_return_BCI_175", null);
        mode.remove();
        span.remove();
    }

    public static void premain(String args, Instrumentation instrumentation) throws Exception {
        String[] parts = args.split("\\|", 2);
        if (parts.length != 2) throw new IllegalArgumentException("Expected output path|run id");
        output = Path.of(parts[0]);
        runId = parts[1];
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            synchronized (CF02TraceProbe.class) {
                try {
                    Files.createDirectories(output.toAbsolutePath().getParent());
                    Files.write(output, rows);
                } catch (Exception error) {
                    error.printStackTrace();
                }
            }
        }, "cf02-branch-trace-flush"));
    }
}
