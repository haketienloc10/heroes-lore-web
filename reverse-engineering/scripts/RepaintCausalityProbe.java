package org.recompile.hlprobe;

import java.awt.AWTEvent;
import java.awt.EventQueue;
import java.awt.event.PaintEvent;
import java.awt.Rectangle;
import java.lang.instrument.Instrumentation;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;

/** Captures FreeJ2ME repaint requests and their AWT PaintEvent/LCD.paint dispatch. */
public final class RepaintCausalityProbe {
    private static final int CAPACITY = 200_000;
    private static final int MAX_PENDING_PER_COMPONENT = 100_000;
    private static final String LCD_CLASS = "org.recompile.freej2me.FreeJ2ME$LCD";
    private static final ArrayList<String> rows = new ArrayList<>();
    private static final ThreadLocal<Deque<Span>> spans = ThreadLocal.withInitial(ArrayDeque::new);
    private static final IdentityHashMap<Object, ArrayDeque<Long>> pendingRequests = new IdentityHashMap<>();
    private static final IdentityHashMap<AWTEvent, Long> eventIds = new IdentityHashMap<>();
    private static final IdentityHashMap<AWTEvent, List<Long>> requestsByEvent = new IdentityHashMap<>();

    private static long sequence;
    private static long nextSpan;
    private static long nextRequest;
    private static long nextPaintEvent;
    private static long dropped;
    private static long requestQueueOverflow;
    private static long eventIdOverflow;
    private static long fieldOrAwtErrors;
    private static long spanErrors;
    private static long activeSpans;
    private static long repaintRequests;
    private static long lcdPaintEntries;
    private static long updateEventPaintEntries;
    private static long linkedUpdatePaintEntries;
    private static long unmatchedUpdatePaintEntries;
    private static long nonPaintContextEntries;
    private static Path output;
    private static String runId;

    private static final class Span {
        final long id;
        final String owner;
        final String method;
        Span(long id, String owner, String method) { this.id = id; this.owner = owner; this.method = method; }
    }

    private static final class PaintContext {
        long eventId;
        String eventClass;
        int eventType = -1;
        int receiverIdentity;
        int sourceIdentity;
        boolean sameSource;
        int clipX = Integer.MIN_VALUE;
        int clipY = Integer.MIN_VALUE;
        int clipWidth = Integer.MIN_VALUE;
        int clipHeight = Integer.MIN_VALUE;
        List<Long> requestIds = List.of();
    }

    private static String quote(String value) {
        if (value == null) return "null";
        StringBuilder result = new StringBuilder("\"");
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '\\' -> result.append("\\\\");
                case '"' -> result.append("\\\"");
                case '\n' -> result.append("\\n");
                case '\r' -> result.append("\\r");
                case '\t' -> result.append("\\t");
                default -> result.append(c);
            }
        }
        return result.append('"').toString();
    }

    private static String listJson(List<Long> values) {
        StringBuilder result = new StringBuilder("[");
        for (int i = 0; i < values.size(); i++) {
            if (i > 0) result.append(',');
            result.append(values.get(i));
        }
        return result.append(']').toString();
    }

    private static long parentSpan() {
        Deque<Span> stack = spans.get();
        return stack.isEmpty() ? 0 : stack.peek().id;
    }

    private static void append(String kind, String owner, String method, long spanId, long parentSpanId,
                               Object receiver, int gameState, PaintContext paint, long requestId,
                               String sourceMethod) {
        long seq = ++sequence;
        if (rows.size() >= CAPACITY) { dropped++; return; }
        long threadId = Thread.currentThread().threadId();
        String threadName = Thread.currentThread().getName();
        rows.add("{\"run_id\":" + quote(runId) + ",\"seq\":" + seq +
            ",\"t_mono_ns\":" + System.nanoTime() + ",\"thread_id\":" + threadId +
            ",\"thread_name\":" + quote(threadName) + ",\"kind\":" + quote(kind) +
            ",\"owner\":" + quote(owner) + ",\"method\":" + quote(method) +
            ",\"span_id\":" + spanId + ",\"parent_span_id\":" + parentSpanId +
            ",\"receiver_identity\":" + (receiver == null ? 0 : System.identityHashCode(receiver)) +
            ",\"game_state\":" + (gameState == Integer.MIN_VALUE ? "null" : Integer.toString(gameState)) +
            ",\"repaint_request_id\":" + requestId + ",\"source_method\":" + quote(sourceMethod) +
            ",\"awt_event_id\":" + (paint == null || paint.eventId == 0 ? "null" : paint.eventId) +
            ",\"awt_event_class\":" + quote(paint == null ? null : paint.eventClass) +
            ",\"awt_event_type\":" + (paint == null || paint.eventType < 0 ? "null" : paint.eventType) +
            ",\"awt_source_identity\":" + (paint == null ? "null" : Integer.toString(paint.sourceIdentity)) +
            ",\"awt_source_matches_receiver\":" + (paint == null ? "null" : Boolean.toString(paint.sameSource)) +
            ",\"paint_clip\":" + (paint == null || paint.clipX == Integer.MIN_VALUE ? "null" :
                "{\"x\":" + paint.clipX + ",\"y\":" + paint.clipY + ",\"width\":" + paint.clipWidth +
                    ",\"height\":" + paint.clipHeight + "}") +
            ",\"paint_request_ids\":" + listJson(paint == null ? List.of() : paint.requestIds) + "}");
    }

    private static PaintContext paintContext(Object receiver) {
        PaintContext context = new PaintContext();
        context.receiverIdentity = System.identityHashCode(receiver);
        try {
            AWTEvent event = EventQueue.getCurrentEvent();
            if (!(event instanceof PaintEvent paintEvent)) {
                nonPaintContextEntries++;
                return context;
            }
            context.eventClass = event.getClass().getName();
            context.eventType = event.getID();
            Object source = event.getSource();
            context.sourceIdentity = source == null ? 0 : System.identityHashCode(source);
            context.sameSource = source == receiver;
            Long id = eventIds.get(event);
            if (id == null) {
                if (eventIds.size() < CAPACITY) {
                    id = ++nextPaintEvent;
                    eventIds.put(event, id);
                } else {
                    eventIdOverflow++;
                    id = ++nextPaintEvent;
                }
            }
            context.eventId = id;
            Rectangle clip = paintEvent.getUpdateRect();
            if (clip != null) {
                context.clipX = clip.x;
                context.clipY = clip.y;
                context.clipWidth = clip.width;
                context.clipHeight = clip.height;
            }
            if (context.sameSource && paintEvent.getID() == PaintEvent.UPDATE) {
                updateEventPaintEntries++;
                List<Long> grouped = requestsByEvent.get(event);
                if (grouped == null) {
                    ArrayDeque<Long> queue = pendingRequests.remove(receiver);
                    ArrayList<Long> drained = new ArrayList<>();
                    if (queue != null) while (!queue.isEmpty()) drained.add(queue.removeFirst());
                    grouped = List.copyOf(drained);
                    requestsByEvent.put(event, grouped);
                }
                context.requestIds = grouped;
                if (grouped.isEmpty()) unmatchedUpdatePaintEntries++;
                else linkedUpdatePaintEntries++;
            }
        } catch (Throwable e) {
            fieldOrAwtErrors++;
        }
        return context;
    }

    /** Called at instrumented method entry. Only ar.paint reads the live game state. */
    public static synchronized void enter(String owner, String method, Object self, int gameState) {
        Deque<Span> stack = spans.get();
        long parent = stack.isEmpty() ? 0 : stack.peek().id;
        long id = ++nextSpan;
        stack.push(new Span(id, owner, method));
        activeSpans++;
        PaintContext paint = null;
        if (owner.equals("org/recompile/freej2me/FreeJ2ME$LCD") && method.startsWith("paint(")) {
            lcdPaintEntries++;
            paint = paintContext(self);
        }
        append("span_entry", owner, method, id, parent, self, gameState, paint, 0, null);
    }

    /** Called before normal method return; exceptional exits remain outside this capture. */
    public static synchronized void exit(String owner, String method, Object self) {
        Deque<Span> stack = spans.get();
        long id = 0;
        if (stack.isEmpty()) {
            spanErrors++;
        } else {
            Span top = stack.peek();
            if (!top.owner.equals(owner) || !top.method.equals(method)) {
                spanErrors++;
            } else {
                id = stack.pop().id;
                activeSpans--;
            }
        }
        append("span_exit", owner, method, id, parentSpan(), self, Integer.MIN_VALUE, null, 0, null);
    }

    /** Called immediately before FreeJ2ME's painter invokes repaint() on its LCD component. */
    public static synchronized void repaintRequest(Object component, String sourceMethod) {
        if (component == null || !component.getClass().getName().equals(LCD_CLASS)) {
            fieldOrAwtErrors++;
            return;
        }
        long id = ++nextRequest;
        ArrayDeque<Long> queue = pendingRequests.computeIfAbsent(component, ignored -> new ArrayDeque<>());
        if (queue.size() < MAX_PENDING_PER_COMPONENT) queue.addLast(id);
        else requestQueueOverflow++;
        repaintRequests++;
        append("lcd_repaint_request", "org/recompile/freej2me/FreeJ2ME$LCD", "repaint()V",
            0, parentSpan(), component, Integer.MIN_VALUE, null, id, sourceMethod);
    }

    private static long pendingRequestCount() {
        long count = 0;
        for (Map.Entry<Object, ArrayDeque<Long>> entry : pendingRequests.entrySet()) count += entry.getValue().size();
        return count;
    }

    public static void premain(String args, Instrumentation instrumentation) throws Exception {
        String[] parts = args.split("\\|", 2);
        if (parts.length != 2) throw new IllegalArgumentException("expected output-path|run-id");
        output = Path.of(parts[0]);
        runId = parts[1];
        Files.createDirectories(output.toAbsolutePath().getParent());
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            synchronized (RepaintCausalityProbe.class) {
                try {
                    StringBuilder body = new StringBuilder();
                    for (String row : rows) body.append(row).append('\n');
                    Files.writeString(output, body);
                    Files.writeString(output.resolveSibling("trace-health.json"),
                        "{\"events_seen\":" + sequence + ",\"retained\":" + rows.size() +
                        ",\"dropped\":" + dropped + ",\"capacity\":" + CAPACITY +
                        ",\"span_errors\":" + spanErrors + ",\"active_spans_at_shutdown\":" + activeSpans +
                        ",\"lcd_repaint_requests\":" + repaintRequests +
                        ",\"lcd_paint_entries\":" + lcdPaintEntries +
                        ",\"update_event_paint_entries\":" + updateEventPaintEntries +
                        ",\"linked_update_paint_entries\":" + linkedUpdatePaintEntries +
                        ",\"unmatched_update_paint_entries\":" + unmatchedUpdatePaintEntries +
                        ",\"non_paint_context_entries\":" + nonPaintContextEntries +
                        ",\"unmatched_repaint_requests\":" + pendingRequestCount() +
                        ",\"request_queue_overflow\":" + requestQueueOverflow +
                        ",\"paint_event_id_overflow\":" + eventIdOverflow +
                        ",\"awt_lookup_errors\":" + fieldOrAwtErrors +
                        ",\"unique_paint_events\":" + eventIds.size() + "}\n");
                } catch (Exception e) {
                    e.printStackTrace();
                }
            }
        }, "hl-repaint-causality-flush"));
    }
}
