package org.recompile.hlprobe;

import java.lang.instrument.Instrumentation;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.concurrent.atomic.AtomicLong;

/** Bounded, no-reflection trace of the transient ag.a:Z scheduler bypass. */
public final class BypassTraceProbe {
    private static final int CAPACITY = 200_000;
    private static final int NO_ARG = Integer.MIN_VALUE;
    private static final Object LOCK = new Object();
    private static final ArrayList<Row> ROWS = new ArrayList<>();
    private static final AtomicLong SEQUENCE = new AtomicLong();
    private static final AtomicLong DROPPED = new AtomicLong();
    private static final AtomicLong SPANS = new AtomicLong();
    private static final ThreadLocal<java.util.ArrayDeque<Long>> STACK =
            ThreadLocal.withInitial(java.util.ArrayDeque::new);
    private static volatile boolean closing;
    private static volatile Path output;
    private static volatile String runId;

    private record Row(long sequence, String json) {}

    private static String quote(String value) {
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"")
                .replace("\n", "\\n").replace("\r", "\\r") + "\"";
    }

    private static long currentSpan() {
        java.util.ArrayDeque<Long> stack = STACK.get();
        return stack.isEmpty() ? 0 : stack.peek();
    }

    private static void record(String event, String owner, String method, String phase,
                               long span, long parent, Integer arg0, Integer arg1, Boolean value) {
        synchronized (LOCK) {
            if (closing) return;
            long sequence = SEQUENCE.incrementAndGet();
            if (sequence > CAPACITY) {
                DROPPED.incrementAndGet();
                return;
            }
            Thread thread = Thread.currentThread();
            String json = "{\"run_id\":" + quote(runId) + ",\"seq\":" + sequence
                    + ",\"t_mono_ns\":" + System.nanoTime()
                    + ",\"thread_id\":" + thread.threadId() + ",\"thread_name\":" + quote(thread.getName())
                    + ",\"event\":" + quote(event)
                    + ",\"class\":" + (owner == null ? "null" : quote(owner))
                    + ",\"method\":" + (method == null ? "null" : quote(method))
                    + ",\"phase\":" + (phase == null ? "null" : quote(phase))
                    + ",\"span_id\":" + span + ",\"parent_span_id\":" + parent
                    + ",\"arg0_int\":" + (arg0 == null ? "null" : arg0)
                    + ",\"arg1_int\":" + (arg1 == null ? "null" : arg1)
                    + ",\"value\":" + (value == null ? "null" : value) + "}";
            ROWS.add(new Row(sequence, json));
        }
    }

    public static void methodEvent(String owner, String method, String phase, int arg0, int arg1) {
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
        record("method", owner, method, phase, span, parent,
                arg0 == NO_ARG ? null : arg0, arg1 == NO_ARG ? null : arg1, null);
    }

    /** The duplicated boolean is the exact ag.a:Z value before br.b's original IFNE. */
    public static void bypassValue(int value) {
        long span = currentSpan();
        record("bypass_value", "br", "b()V", null, span, span, null, null, value != 0);
    }

    /** The duplicated m.e:I value immediately before ar.keyPressed's original tableswitch. */
    public static void gameStateValue(int value) {
        long span = currentSpan();
        record("game_state_value", "ar", "keyPressed(I)V", null, span, span, value, null, null);
    }

    public static void premain(String args, Instrumentation instrumentation) throws Exception {
        String[] parts = args.split("\\|", 2);
        if (parts.length != 2) throw new IllegalArgumentException("expected OUTPUT|RUN_ID");
        output = Path.of(parts[0]);
        runId = parts[1];
        Files.createDirectories(output.toAbsolutePath().getParent());
        Files.writeString(output.resolveSibling("trace-probe-start.json"),
                "{\"event\":\"probe_started\",\"utc\":" + quote(Instant.now().toString())
                        + ",\"targets\":[\"ar.keyPressed(I)V\",\"m.e:I key operand\",\"ag.a(II)V\",\"br.b()V\",\"ag.a:Z branch operand\",\"br.a(JJ)V\"]"
                        + ",\"reflection\":false,\"game_state_reads\":false,\"game_state_writes\":false}\n");
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            ArrayList<Row> snapshot;
            long seen;
            long dropped;
            synchronized (LOCK) {
                closing = true;
                snapshot = new ArrayList<>(ROWS);
                seen = SEQUENCE.get();
                dropped = DROPPED.get();
            }
            try {
                snapshot.sort(Comparator.comparingLong(Row::sequence));
                StringBuilder jsonl = new StringBuilder();
                for (Row row : snapshot) jsonl.append(row.json()).append('\n');
                Files.writeString(output, jsonl);
                Files.writeString(output.resolveSibling("trace-health.json"),
                        "{\"events_seen\":" + seen + ",\"retained\":" + snapshot.size()
                                + ",\"dropped\":" + dropped + ",\"capacity\":" + CAPACITY
                                + ",\"synchronized_close\":true,\"reflection\":false"
                                + ",\"game_state_reads\":false,\"exceptional_exit_hooks\":false}\n");
            } catch (Exception e) { e.printStackTrace(); }
        }, "hl-bypass-trace-flush"));
    }
}
