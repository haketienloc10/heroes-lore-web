package org.recompile.hlprobe;

import java.lang.instrument.Instrumentation;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/** Non-reflective, scoped trace for the natural bf.run() CF-01 startup invocation. */
public final class CF01TraceProbe {
    private static final List<String> rows = new ArrayList<>();
    private static long seq;
    private static long nextSpan;
    private static Path output;
    private static String runId;
    private static final ThreadLocal<Long> span = new ThreadLocal<>();
    private static final ThreadLocal<Integer> stateA = new ThreadLocal<>();
    private static final ThreadLocal<Integer> stateB = new ThreadLocal<>();

    private static String quote(String value) {
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    private static synchronized void emit(String site, Integer bci, String outcome) {
        Long currentSpan = span.get();
        if (currentSpan == null) return;
        Thread thread = Thread.currentThread();
        rows.add("{\"run_id\":" + quote(runId) + ",\"seq\":" + (++seq) +
            ",\"t_mono_ns\":" + System.nanoTime() + ",\"thread_id\":" + thread.threadId() +
            ",\"thread_name\":" + quote(thread.getName()) + ",\"span_id\":" + currentSpan +
            ",\"bf.a:B\":" + stateA.get() + ",\"bf.b:B\":" + stateB.get() +
            ",\"site\":" + quote(site) + ",\"original_bci\":" + (bci == null ? "null" : bci) +
            ",\"outcome\":" + (outcome == null ? "null" : quote(outcome)) + "}");
    }

    public static void begin(int a, int b) {
        long id;
        synchronized (CF01TraceProbe.class) { id = ++nextSpan; }
        span.set(id);
        stateA.set(a);
        stateB.set(b);
        emit("bf_run_entry", null, null);
    }

    public static void mark(String site, int bci) { emit(site, bci, null); }

    public static void finish(String outcome) {
        emit("bf_run_exit", null, outcome);
        span.remove();
        stateA.remove();
        stateB.remove();
    }

    public static void premain(String args, Instrumentation instrumentation) throws Exception {
        String[] parts = args.split("\\|", 2);
        if (parts.length != 2) throw new IllegalArgumentException("Expected output path|run id");
        output = Path.of(parts[0]);
        runId = parts[1];
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            synchronized (CF01TraceProbe.class) {
                try {
                    Files.createDirectories(output.toAbsolutePath().getParent());
                    Files.write(output, rows);
                } catch (Exception error) {
                    error.printStackTrace();
                }
            }
        }, "cf01-startup-trace-flush"));
    }
}
