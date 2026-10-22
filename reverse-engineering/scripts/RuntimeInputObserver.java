import com.sun.tools.attach.VirtualMachine;
import java.awt.AWTEvent;
import java.awt.Component;
import java.awt.Frame;
import java.awt.Toolkit;
import java.awt.Window;
import java.awt.event.KeyEvent;
import java.awt.event.AWTEventListener;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Instant;

/** Passive observer for AWT key events delivered to the FreeJ2ME game window. */
public final class RuntimeInputObserver {
    private static Path output;
    private static boolean installed;

    private static synchronized void write(String row) {
        try {
            Files.writeString(output, row + "\n", StandardOpenOption.CREATE,
                    StandardOpenOption.APPEND);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private static String json(String value) {
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"")
                .replace("\n", "\\n").replace("\r", "\\r") + "\"";
    }

    private static String gameWindow(AWTEvent event) {
        Object source = event.getSource();
        if (!(source instanceof Component)) return null;
        for (Component c = (Component) source; c != null; c = c.getParent()) {
            if (c instanceof Frame && "FreeJ2ME-Plus".equals(((Frame) c).getTitle()))
                return "FreeJ2ME-Plus";
            if (c instanceof Window && !(c instanceof Frame)) return null;
        }
        return null;
    }

    public static synchronized void agentmain(String args,
                                               java.lang.instrument.Instrumentation ignored) {
        output = Path.of(args);
        if (installed) {
            write("{\"event\":\"observer_already_installed\",\"utc\":"
                    + json(Instant.now().toString()) + ",\"mono_ns\":"
                    + System.nanoTime() + "}");
            return;
        }
        AWTEventListener listener = event -> {
            if (!(event instanceof KeyEvent)) return;
            String window = gameWindow(event);
            if (window == null) return;
            KeyEvent key = (KeyEvent) event;
            String id = key.getID() == KeyEvent.KEY_PRESSED ? "key_pressed"
                    : key.getID() == KeyEvent.KEY_RELEASED ? "key_released"
                    : key.getID() == KeyEvent.KEY_TYPED ? "key_typed" : "key_other";
            write("{\"event\":" + json(id) + ",\"utc\":"
                    + json(Instant.now().toString()) + ",\"mono_ns\":"
                    + System.nanoTime() + ",\"window\":" + json(window)
                    + ",\"awt_key_code\":" + key.getKeyCode()
                    + ",\"awt_key_char_code\":" + (int) key.getKeyChar()
                    + ",\"key_location\":" + key.getKeyLocation()
                    + ",\"modifiers_ex\":" + key.getModifiersEx()
                    + ",\"event_when_ms\":" + key.getWhen()
                    + ",\"source_class\":" + json(key.getSource().getClass().getName())
                    + ",\"thread\":" + json(Thread.currentThread().getName()) + "}");
        };
        Toolkit.getDefaultToolkit().addAWTEventListener(listener, AWTEvent.KEY_EVENT_MASK);
        installed = true;
        write("{\"event\":\"observer_attached\",\"utc\":"
                + json(Instant.now().toString()) + ",\"mono_ns\":"
                + System.nanoTime() + ",\"scope\":\"FreeJ2ME-Plus window only\""
                + ",\"input_source_attribution\":\"AWT event stream; physical vs synthetic is not identifiable\"}");
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 3) throw new IllegalArgumentException("PID AGENT_JAR OUTPUT_JSONL");
        VirtualMachine vm = VirtualMachine.attach(args[0]);
        try {
            vm.loadAgent(args[1], args[2]);
        } finally {
            vm.detach();
        }
    }
}
