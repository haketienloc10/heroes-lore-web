package org.recompile.hlprobe;

import java.lang.instrument.Instrumentation;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.atomic.AtomicLong;

/** Minimal dialogue input trace. It performs no reflection or game-state reads. */
public final class DialogueTraceProbe {
    private static final int CAPACITY = 50000;
    private static final ConcurrentLinkedQueue<Row> ROWS = new ConcurrentLinkedQueue<>();
    private static final AtomicLong SEQUENCE = new AtomicLong();
    private static final AtomicLong DROPPED = new AtomicLong();
    private static volatile Path output;
    private static volatile String runId;

    private record Row(long sequence, String json) {}

    private static String quote(String value) {
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"")
                .replace("\n", "\\n").replace("\r", "\\r") + "\"";
    }

    public static void event(String owner, String method, String phase,
                             Object receiver, int arg0, int arg1) {
        long sequence = SEQUENCE.incrementAndGet();
        if (sequence > CAPACITY) {
            DROPPED.incrementAndGet();
            return;
        }
        Thread thread = Thread.currentThread();
        long mono = System.nanoTime();
        String json = "{\"run_id\":" + quote(runId) + ",\"seq\":" + sequence
                + ",\"t_mono_ns\":" + mono + ",\"thread_id\":" + thread.threadId()
                + ",\"thread_name\":" + quote(thread.getName())
                + ",\"class\":" + quote(owner) + ",\"method\":" + quote(method)
                + ",\"phase\":" + quote(phase) + ",\"receiver_id\":"
                + (receiver == null ? 0 : System.identityHashCode(receiver))
                + ",\"arg0_int\":" + arg0 + ",\"arg1_int\":" + arg1 + "}";
        ROWS.add(new Row(sequence, json));
    }

    public static void premain(String args, Instrumentation instrumentation) throws Exception {
        String[] parts = args.split("\\|", 2);
        if (parts.length != 2) throw new IllegalArgumentException("expected OUTPUT|RUN_ID");
        output = Path.of(parts[0]);
        runId = parts[1];
        Files.createDirectories(output.toAbsolutePath().getParent());
        Files.writeString(output.resolveSibling("trace-probe-start.json"),
                "{\"event\":\"probe_started\",\"utc\":" + quote(Instant.now().toString())
                        + ",\"targets\":[\"ar.keyPressed(I)V\",\"ag.a(II)V\"]"
                        + ",\"reflection\":false,\"game_state_reads\":false}\n");
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            try {
                ArrayList<Row> snapshot = new ArrayList<>(ROWS);
                snapshot.sort(Comparator.comparingLong(Row::sequence));
                ArrayList<String> lines = new ArrayList<>(snapshot.size());
                for (Row row : snapshot) lines.add(row.json());
                Files.write(output, lines);
                Files.writeString(output.resolveSibling("trace-health.json"),
                        "{\"events_seen\":" + SEQUENCE.get() + ",\"retained\":" + snapshot.size()
                                + ",\"dropped\":" + DROPPED.get() + ",\"capacity\":" + CAPACITY
                                + ",\"exceptional_exit_hooks\":false,\"reflection\":false}\n");
            } catch (Exception e) {
                e.printStackTrace();
            }
        }, "hl-dialogue-trace-flush"));
    }
}
