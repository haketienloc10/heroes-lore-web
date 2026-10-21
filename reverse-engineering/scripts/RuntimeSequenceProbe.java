import java.awt.Component;
import java.awt.Container;
import java.awt.EventQueue;
import java.awt.Frame;
import java.awt.event.KeyEvent;
import java.awt.event.KeyListener;
import java.lang.instrument.Instrumentation;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.Set;

/** Synthetic LCD KeyListener sequence, including captures while held. No transformer,
 * game method calls, game field writes, physical input, or callback tracing. */
public class RuntimeSequenceProbe {
    private static Path log;
    private static void emit(String event) throws Exception {
        Files.writeString(log, Instant.now() + " mono_ns=" + System.nanoTime() + " " + event + "\n",
            StandardOpenOption.CREATE, StandardOpenOption.APPEND);
    }
    private static Component find(Component c) {
        if (c instanceof java.awt.Canvas && c.getKeyListeners().length > 0) return c;
        if (c instanceof Container) for (Component child : ((Container)c).getComponents()) {
            Component found = find(child); if (found != null) return found;
        }
        return null;
    }
    private static void key(Component lcd, int code, boolean down) throws Exception {
        EventQueue.invokeAndWait(() -> {
            try {
                emit("listener_dispatch_begin phase=" + (down ? "down" : "up") + " code=" + code);
                KeyEvent event = new KeyEvent(lcd, down ? KeyEvent.KEY_PRESSED : KeyEvent.KEY_RELEASED,
                    System.currentTimeMillis(), 0, code, KeyEvent.CHAR_UNDEFINED);
                for (KeyListener listener : lcd.getKeyListeners()) {
                    if (down) listener.keyPressed(event); else listener.keyReleased(event);
                }
                emit("listener_dispatch_end phase=" + (down ? "down" : "up") + " code=" + code);
            } catch (Exception e) { throw new RuntimeException(e); }
        });
    }
    private static void mapping(int code, Instrumentation inst) throws Exception {
        Class<?> mobile = null, frontend = null;
        for (Class<?> c : inst.getAllLoadedClasses()) {
            if (c.getName().equals("org.recompile.mobile.Mobile")) mobile = c;
            if (c.getName().equals("org.recompile.freej2me.FreeJ2ME")) frontend = c;
        }
        Method method = frontend.getDeclaredMethod("getMobileKey", int.class);
        method.setAccessible(true);
        int internal = (Integer)method.invoke(frontend.getField("app").get(null), code);
        emit("computed_emulator_mapping host_awt=" + code + " internal=" + internal + " raw="
            + (internal == Integer.MIN_VALUE ? "UNMAPPED" : mobile.getMethod("getMobileKey", int.class).invoke(null, internal)));
    }
    public static void agentmain(String args, Instrumentation inst) throws Exception {
        String[] options = args.split("\\|");
        Path rd = Path.of(options[0]), plan = Path.of(options[1]), images = Path.of(options[2]);
        log = rd.resolve("sequence-input.log");
        Files.createDirectories(images);
        Component target = null;
        for (Frame frame : Frame.getFrames()) if (frame.getTitle().equals("FreeJ2ME-Plus")) target = find(frame);
        if (target == null) throw new IllegalStateException("No LCD KeyListener");
        Set<Integer> held = new LinkedHashSet<>();
        emit("sequence_begin plan=" + plan + "; synthetic KeyListener, no automatic repeat; overhead unmeasured");
        try {
            for (String line : Files.readAllLines(plan)) {
                if (line.isBlank() || line.startsWith("#")) continue;
                String[] step = line.split(" ", 2);
                switch (step[0]) {
                    case "down": {
                        int code = Integer.parseInt(step[1]); mapping(code, inst);
                        held.add(code); key(target, code, true); break;
                    }
                    case "up": {
                        int code = Integer.parseInt(step[1]); key(target, code, false); held.remove(code); break;
                    }
                    case "wait": emit("wait_requested_ms=" + step[1]); Thread.sleep(Integer.parseInt(step[1])); break;
                    case "frame": RuntimeFramebufferProbe.agentmain(images.resolve(step[1] + ".png") + "|" + rd.resolve("framebuffer.log"), inst); break;
                    default: throw new IllegalArgumentException(line);
                }
            }
        } finally {
            for (int code : held) { emit("cleanup_release code=" + code); key(target, code, false); }
            emit("sequence_end");
        }
    }
}
