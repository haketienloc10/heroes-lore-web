package org.recompile.hlprobe;

import java.lang.instrument.Instrumentation;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.atomic.AtomicLong;

/** Bounded, no-reflection trace for paint order and the actual br.d branch operand. */
public final class RenderOrderProbe {
    private static final int CAPACITY = 200_000;
    private static final ConcurrentLinkedQueue<Row> ROWS = new ConcurrentLinkedQueue<>();
    private static final AtomicLong SEQUENCE = new AtomicLong();
    private static final AtomicLong DROPPED = new AtomicLong();
    private static final AtomicLong SPANS = new AtomicLong();
    private static final ThreadLocal<java.util.ArrayDeque<Long>> STACK =
            ThreadLocal.withInitial(java.util.ArrayDeque::new);
    private static volatile Path output;
    private static volatile String runId;

    private record Row(long sequence, String json) {}

    private static String quote(String value) {
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"")
                .replace("\n", "\\n").replace("\r", "\\r") + "\"";
    }

    private static void write(long sequence, String json) {
        if (sequence > CAPACITY) { DROPPED.incrementAndGet(); return; }
        ROWS.add(new Row(sequence, json));
    }

    public static void event(String owner, String method, String phase, Object receiver) {
        Thread thread = Thread.currentThread();
        java.util.ArrayDeque<Long> stack = STACK.get();
        long span;
        long parent;
        if (phase.equals("entry")) {
            parent = stack.isEmpty() ? 0 : stack.peek();
            span = SPANS.incrementAndGet();
            stack.push(span);
        } else {
            span = stack.isEmpty() ? 0 : stack.peek();
            if (!stack.isEmpty()) stack.pop();
            parent = stack.isEmpty() ? 0 : stack.peek();
        }
        long sequence = SEQUENCE.incrementAndGet();
        String row = "{\"run_id\":" + quote(runId) + ",\"seq\":" + sequence
                + ",\"t_mono_ns\":" + System.nanoTime()
                + ",\"thread_id\":" + thread.threadId() + ",\"thread_name\":" + quote(thread.getName())
                + ",\"event\":\"method\",\"class\":" + quote(owner)
                + ",\"method\":" + quote(method) + ",\"phase\":" + quote(phase)
                + ",\"span_id\":" + span + ",\"parent_span_id\":" + parent
                + ",\"receiver_id\":" + (receiver == null ? 0 : System.identityHashCode(receiver)) + "}";
        write(sequence, row);
    }

    /** The duplicated int is the exact boolean loaded from br.d:Z before IFEQ. */
    public static void branchValue(int value) {
        Thread thread = Thread.currentThread();
        java.util.ArrayDeque<Long> stack = STACK.get();
        long span = stack.isEmpty() ? 0 : stack.peek();
        long sequence = SEQUENCE.incrementAndGet();
        String row = "{\"run_id\":" + quote(runId) + ",\"seq\":" + sequence
                + ",\"t_mono_ns\":" + System.nanoTime()
                + ",\"thread_id\":" + thread.threadId() + ",\"thread_name\":" + quote(thread.getName())
                + ",\"event\":\"branch_value\",\"class\":\"ar\",\"method\":\"paint(Graphics)V\""
                + ",\"field\":\"br.d:Z\",\"value\":" + (value == 0 ? "false" : "true")
                + ",\"span_id\":" + span + ",\"parent_span_id\":" + span
                + ",\"original_bci\":94,\"ifeq_target_original_bci\":106}";
        write(sequence, row);
    }

    public static void premain(String args, Instrumentation instrumentation) throws Exception {
        String[] parts = args.split("\\|", 2);
        if (parts.length != 2) throw new IllegalArgumentException("expected OUTPUT|RUN_ID");
        output = Path.of(parts[0]);
        runId = parts[1];
        Files.createDirectories(output.toAbsolutePath().getParent());
        Files.writeString(output.resolveSibling("trace-probe-start.json"),
                "{\"event\":\"probe_started\",\"utc\":" + quote(Instant.now().toString())
                        + ",\"targets\":[\"ar.paint(Graphics)V\",\"m.i()V\",\"m.g()V\",\"br.d:Z branch operand\"]"
                        + ",\"reflection\":false,\"game_state_reads\":false,\"game_state_writes\":false}\n");
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            try {
                ArrayList<Row> snapshot = new ArrayList<>(ROWS);
                snapshot.sort(Comparator.comparingLong(Row::sequence));
                StringBuilder jsonl = new StringBuilder();
                for (Row row : snapshot) jsonl.append(row.json()).append('\n');
                Files.writeString(output, jsonl);
                Files.writeString(output.resolveSibling("trace-health.json"),
                        "{\"events_seen\":" + SEQUENCE.get() + ",\"retained\":" + snapshot.size()
                                + ",\"dropped\":" + DROPPED.get() + ",\"capacity\":" + CAPACITY
                                + ",\"reflection\":false,\"game_state_reads\":false"
                                + ",\"exceptional_exit_hooks\":false}\n");
            } catch (Exception e) { e.printStackTrace(); }
        }, "hl-render-order-trace-flush"));
    }
}
