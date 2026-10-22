package org.recompile.hlprobe;

import java.lang.instrument.Instrumentation;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import javax.microedition.lcdui.Image;

/** Non-reflective recorder for bf splash animation state and logo-image availability. */
public final class CF01PaintTraceProbeV2 {
    private static final List<String> rows = new ArrayList<>();
    private static long seq;
    private static Path output;
    private static String runId;
    private static String lastLogoSignature;

    private static String quote(String value) {
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    private static synchronized void emit(String site, Integer[] values, Integer opcodeIndex) {
        Thread thread = Thread.currentThread();
        StringBuilder fields = new StringBuilder();
        String[] names = {"bf.a:B", "bf.b:B", "bf.a:I", "bf.a:S", "bf.b:S", "bf.c:B",
                          "bf.c:S", "bf.d:S", "bf.d:B", "bf.c:Z", "q.g:I", "q.h:I"};
        for (int i = 0; i < names.length; i++) {
            if (fields.length() > 0) fields.append(',');
            fields.append(quote(names[i])).append(':').append(values == null || i >= values.length ? "null" : values[i]);
        }
        rows.add("{\"run_id\":" + quote(runId) + ",\"seq\":" + (++seq) +
            ",\"t_mono_ns\":" + System.nanoTime() + ",\"thread_id\":" + thread.threadId() +
            ",\"thread_name\":" + quote(thread.getName()) + ",\"site\":" + quote(site) +
            "," + fields + ",\"opcode_index\":" + (opcodeIndex == null ? "null" : opcodeIndex) + "}");
    }

    public static void paintEntry(int a, int b, int x, int y, int y2, int c, int x2,
                                  int y3, int d, int flag, int width, int height) {
        emit("bf_paint_entry", new Integer[]{a,b,x,y,y2,c,x2,y3,d,flag,width,height}, null);
    }

    public static void paintExit(int opcodeIndex) { emit("bf_paint_return", null, opcodeIndex); }
    public static void runEntry(int a, int b) { emit("bf_run_entry", new Integer[]{a,b}, null); }
    public static void runExit(int opcodeIndex) { emit("bf_run_return", null, opcodeIndex); }

    public static synchronized void observeLogoImages(Image[] images) {
        StringBuilder signature = new StringBuilder();
        if (images == null) signature.append("null");
        else {
            signature.append("length=").append(images.length).append(';');
            for (int i = 0; i < images.length; i++) signature.append(i).append(':').append(images[i] != null).append(',');
        }
        String value = signature.toString();
        if (!value.equals(lastLogoSignature)) {
            lastLogoSignature = value;
            Thread thread = Thread.currentThread();
            rows.add("{\"run_id\":" + quote(runId) + ",\"seq\":" + (++seq) +
                ",\"t_mono_ns\":" + System.nanoTime() + ",\"thread_id\":" + thread.threadId() +
                ",\"thread_name\":" + quote(thread.getName()) + ",\"site\":\"cd.j_logo_image_array\",\"detail\":" + quote(value) + "}");
        }
    }

    public static void premain(String args, Instrumentation instrumentation) throws Exception {
        String[] parts = args.split("\\|", 2);
        if (parts.length != 2) throw new IllegalArgumentException("Expected output path|run id");
        output = Path.of(parts[0]);
        runId = parts[1];
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            synchronized (CF01PaintTraceProbeV2.class) {
                try {
                    Files.createDirectories(output.toAbsolutePath().getParent());
                    Files.write(output, rows);
                } catch (Exception error) {
                    error.printStackTrace();
                }
            }
        }, "cf01-paint-trace-v2-flush"));
    }
}
