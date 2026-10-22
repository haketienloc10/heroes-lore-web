package org.recompile.hlprobe;

import java.lang.instrument.Instrumentation;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/** Non-reflective recorder for bf paint state during natural cold startup. */
public final class CF01PaintTraceProbe {
    private static final List<String> rows = new ArrayList<>();
    private static long seq;
    private static Path output;
    private static String runId;

    private static String quote(String value) {
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    private static synchronized void emit(String site, Integer a, Integer b, String method, Integer opcodeIndex) {
        Thread thread = Thread.currentThread();
        rows.add("{\"run_id\":" + quote(runId) + ",\"seq\":" + (++seq) +
            ",\"t_mono_ns\":" + System.nanoTime() + ",\"thread_id\":" + thread.threadId() +
            ",\"thread_name\":" + quote(thread.getName()) + ",\"site\":" + quote(site) +
            ",\"bf.a:B\":" + (a == null ? "null" : a) + ",\"bf.b:B\":" + (b == null ? "null" : b) +
            ",\"method\":" + (method == null ? "null" : quote(method)) +
            ",\"opcode_index\":" + (opcodeIndex == null ? "null" : opcodeIndex) + "}");
    }

    public static void paintEntry(int a, int b) { emit("bf_paint_entry", a, b, "bf.paint(Graphics)V", null); }
    public static void paintExit(int opcodeIndex) { emit("bf_paint_return", null, null, "bf.paint(Graphics)V", opcodeIndex); }
    public static void runEntry(int a, int b) { emit("bf_run_entry", a, b, "bf.run()V", null); }
    public static void runExit(int opcodeIndex) { emit("bf_run_return", null, null, "bf.run()V", opcodeIndex); }
    public static void stateWrite(int value, String method, int opcodeIndex) {
        emit("bf_a_field_write", value, null, method, opcodeIndex);
    }

    public static void premain(String args, Instrumentation instrumentation) throws Exception {
        String[] parts = args.split("\\|", 2);
        if (parts.length != 2) throw new IllegalArgumentException("Expected output path|run id");
        output = Path.of(parts[0]);
        runId = parts[1];
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            synchronized (CF01PaintTraceProbe.class) {
                try {
                    Files.createDirectories(output.toAbsolutePath().getParent());
                    Files.write(output, rows);
                } catch (Exception error) {
                    error.printStackTrace();
                }
            }
        }, "cf01-paint-trace-flush"));
    }
}
