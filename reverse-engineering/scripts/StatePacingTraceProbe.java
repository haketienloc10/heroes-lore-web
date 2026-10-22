package org.recompile.hlprobe;

import java.awt.Component;
import java.awt.Container;
import java.awt.EventQueue;
import java.awt.Frame;
import java.awt.event.KeyEvent;
import java.awt.event.KeyListener;
import java.lang.instrument.Instrumentation;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

/** Bounded trace plus one normal AWT W input queued after the natural state-4 setter. */
public final class StatePacingTraceProbe {
    private static final int CAPACITY = 100_000;
    private static final Object LOCK = new Object();
    private static final ArrayList<Row> ROWS = new ArrayList<>();
    private static final AtomicLong SEQUENCE = new AtomicLong();
    private static final AtomicLong DROPPED = new AtomicLong();
    private static final AtomicLong SPANS = new AtomicLong();
    private static final AtomicBoolean TRIGGERED = new AtomicBoolean();
    private static final ThreadLocal<ArrayDeque<Long>> BR_SPANS =
            ThreadLocal.withInitial(ArrayDeque::new);
    private static volatile boolean closing;
    private static volatile Path tracePath;
    private static volatile Path actionPath;
    private static volatile String runId;

    private record Row(long sequence, String json) {}

    private static String quote(String value) {
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"")
                .replace("\n", "\\n").replace("\r", "\\r") + "\"";
    }

    private static long currentBrSpan() {
        ArrayDeque<Long> stack = BR_SPANS.get();
        return stack.isEmpty() ? 0 : stack.peek();
    }

    private static void record(String event, String owner, String method, String phase,
                               long span, Integer arg0, Integer arg1, Boolean value) {
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
                    + ",\"span_id\":" + span
                    + ",\"arg0_int\":" + (arg0 == null ? "null" : arg0)
                    + ",\"arg1_int\":" + (arg1 == null ? "null" : arg1)
                    + ",\"value\":" + (value == null ? "null" : value) + "}";
            ROWS.add(new Row(sequence, json));
        }
    }

    private static synchronized void action(String event, String extra) {
        if (actionPath == null) return;
        String row = "{\"run_id\":" + quote(runId) + ",\"event\":" + quote(event)
                + ",\"utc\":" + quote(Instant.now().toString())
                + ",\"mono_ns\":" + System.nanoTime()
                + (extra == null ? "" : "," + extra) + "}\n";
        try {
            Files.writeString(actionPath, row, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        } catch (Exception e) { e.printStackTrace(); }
    }

    public static void stateSetterStored(int state) {
        record("state_setter", "m", "a(I)V", "after_m.e_store", 0, state, null, null);
        if (state != 4 || !TRIGGERED.compareAndSet(false, true)) return;
        action("natural_state_4_observed", "\"state\":4");
        EventQueue.invokeLater(StatePacingTraceProbe::dispatchW);
    }

    public static void keyPressed(int raw) {
        record("method", "ar", "keyPressed(I)V", "entry", 0, raw, null, null);
    }

    public static void keyState(int state) {
        record("key_state", "ar", "keyPressed(I)V", null, 0, state, null, null);
    }

    public static void handlerCall(int arg0, int arg1) {
        record("method", "ag", "a(II)V", "entry", currentBrSpan(), arg0, arg1, null);
    }

    public static void pacingEntry() {
        long span = SPANS.incrementAndGet();
        BR_SPANS.get().push(span);
        record("method", "br", "b()V", "entry", span, null, null, null);
    }

    public static void pacingExit() {
        ArrayDeque<Long> stack = BR_SPANS.get();
        long span = stack.isEmpty() ? 0 : stack.pop();
        record("method", "br", "b()V", "exit", span, null, null, null);
    }

    public static void pacingHelperEntry() {
        record("method", "br", "a(JJ)V", "entry", currentBrSpan(), null, null, null);
    }

    public static void pacingHelperExit() {
        record("method", "br", "a(JJ)V", "exit", currentBrSpan(), null, null, null);
    }

    public static void pacingSleep() {
        record("pacing_sleep", "br", "a(JJ)V", "before_Thread.sleep", currentBrSpan(), null, null, null);
    }

    public static void pacingYield() {
        record("pacing_yield", "br", "a(JJ)V", "before_Thread.yield", currentBrSpan(), null, null, null);
    }

    public static void bypassValue(int value) {
        record("bypass_value", "br", "b()V", null, currentBrSpan(), null, null, value != 0);
    }

    private static Component findInputTarget(Component component) {
        if (component instanceof java.awt.Canvas && ((java.awt.Canvas) component).getKeyListeners().length > 0)
            return component;
        if (component instanceof Container) {
            for (Component child : ((Container) component).getComponents()) {
                Component found = findInputTarget(child);
                if (found != null) return found;
            }
        }
        return null;
    }

    private static void dispatchW() {
        try {
            Component target = null;
            for (Frame frame : Frame.getFrames()) {
                if ("FreeJ2ME-Plus".equals(frame.getTitle())) {
                    target = findInputTarget(frame);
                    if (target != null) break;
                }
            }
            if (target == null) {
                action("auto_input_failed", "\"reason\":\"FreeJ2ME canvas with KeyListener not found\"");
                return;
            }
            final Component inputTarget = target;
            KeyEvent down = new KeyEvent(inputTarget, KeyEvent.KEY_PRESSED, System.currentTimeMillis(),
                    0, KeyEvent.VK_W, KeyEvent.CHAR_UNDEFINED);
            action("auto_key_down_begin", "\"awt_key_code\":87");
            for (KeyListener listener : ((java.awt.Canvas) inputTarget).getKeyListeners()) listener.keyPressed(down);
            action("auto_key_down_dispatched", "\"awt_key_code\":87");
            Thread release = new Thread(() -> {
                try { Thread.sleep(80); }
                catch (InterruptedException e) { Thread.currentThread().interrupt(); return; }
                EventQueue.invokeLater(() -> {
                    KeyEvent up = new KeyEvent(inputTarget, KeyEvent.KEY_RELEASED, System.currentTimeMillis(),
                            0, KeyEvent.VK_W, KeyEvent.CHAR_UNDEFINED);
                    for (KeyListener listener : ((java.awt.Canvas) inputTarget).getKeyListeners()) listener.keyReleased(up);
                    action("auto_key_up_dispatched", "\"awt_key_code\":87");
                });
            }, "hl-state4-key-release");
            release.setDaemon(true);
            release.start();
        } catch (Throwable error) {
            action("auto_input_failed", "\"reason\":" + quote(error.toString()));
        }
    }

    public static void premain(String args, Instrumentation instrumentation) throws Exception {
        String[] parts = args.split("\\|", 3);
        if (parts.length != 3) throw new IllegalArgumentException("expected TRACE|RUN_ID|ACTIONS");
        tracePath = Path.of(parts[0]);
        runId = parts[1];
        actionPath = Path.of(parts[2]);
        Files.createDirectories(tracePath.toAbsolutePath().getParent());
        Files.createDirectories(actionPath.toAbsolutePath().getParent());
        action("probe_ready", "\"reflection\":false,\"direct_game_method_calls\":false,\"game_field_writes\":false");
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
                Files.writeString(tracePath, jsonl);
                Files.writeString(tracePath.resolveSibling("trace-health.json"),
                        "{\"events_seen\":" + seen + ",\"retained\":" + snapshot.size()
                                + ",\"dropped\":" + dropped + ",\"capacity\":" + CAPACITY
                                + ",\"synchronized_close\":true,\"reflection\":false"
                                + ",\"direct_game_method_calls\":false,\"game_field_writes\":false}\n");
            } catch (Exception e) { e.printStackTrace(); }
        }, "hl-state-triggered-bypass-flush"));
    }
}
