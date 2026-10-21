import com.sun.tools.attach.VirtualMachine;
import java.awt.AWTEvent;
import java.awt.Component;
import java.awt.Container;
import java.awt.EventQueue;
import java.awt.Frame;
import java.awt.Toolkit;
import java.awt.event.KeyEvent;
import java.awt.event.KeyListener;
import java.lang.instrument.Instrumentation;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.util.Map;

/** Probe đọc snapshot/quan sát AWT, không transform class hoặc ghi field game. */
public class RuntimeStateProbe {
    private static Path output;
    private static boolean listener;
    private static Component inputTarget(Component component) {
        if (component instanceof java.awt.Canvas && component.getKeyListeners().length > 0) return component;
        if (component instanceof Container) {
            for (Component child : ((Container) component).getComponents()) {
                Component found = inputTarget(child);
                if (found != null) return found;
            }
        }
        return null;
    }
    private static synchronized void log(String text) {
        try {
            Files.writeString(output, Instant.now() + " mono_ns=" + System.nanoTime() + " " + text + "\n",
                StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        } catch (Exception e) { e.printStackTrace(); }
    }
    private static String value(Object value) {
        if (value == null || value instanceof Number || value instanceof Boolean || value instanceof String || value instanceof Map)
            return String.valueOf(value);
        return value.getClass().getName() + "@" + Integer.toHexString(System.identityHashCode(value));
    }
    private static void fields(Class<?> type, Object target) throws Exception {
        for (Field f : type.getDeclaredFields()) {
            boolean stat = Modifier.isStatic(f.getModifiers());
            if ((target == null) != stat) continue;
            if (type.getName().equals("m") && !(f.getName().matches("[bcde]") && f.getType().isPrimitive())) continue;
            f.setAccessible(true);
            Object v = f.get(target);
            log("field " + type.getName() + "." + f.getName() + ":" + f.getType().getTypeName() + "=" + value(v));
            if (v != null && (v.getClass().getName().equals("bf") || v.getClass().getName().equals("ar"))) {
                fields(v.getClass(), v);
                fields(v.getClass().getSuperclass(), v);
            }
        }
    }
    public static void agentmain(String args, Instrumentation inst) throws Exception {
        String[] options = args.split("\\|");
        output = Path.of(options[0]);
        if (options.length == 3) {
            int code = Integer.parseInt(options[1]), hold = Integer.parseInt(options[2]);
            Integer internalKey = null;
            for (Class<?> c : inst.getAllLoadedClasses()) {
                if (c.getName().equals("org.recompile.freej2me.FreeJ2ME")) {
                    Method map = c.getDeclaredMethod("getMobileKey", int.class);
                    map.setAccessible(true);
                    internalKey = (Integer) map.invoke(c.getField("app").get(null), code);
                }
            }
            if (internalKey != null && internalKey != Integer.MIN_VALUE) {
                for (Class<?> c : inst.getAllLoadedClasses()) {
                    if (c.getName().equals("org.recompile.mobile.Mobile"))
                        log("computed_emulator_mapping host_awt=" + code + " internal=" + internalKey
                            + " raw=" + c.getMethod("getMobileKey", int.class).invoke(null, internalKey));
                }
            } else log("computed_emulator_mapping host_awt=" + code + " UNMAPPED");
            Component target = null;
            for (Frame frame : Frame.getFrames()) {
                if (frame.getTitle().equals("FreeJ2ME-Plus")) target = inputTarget(frame);
            }
            if (target == null) throw new IllegalStateException("Không có emulator LCD KeyListener");
            final Component lcd = target;
            log("INJECT emulator AWT KeyListener; bypass OS focus; not physical input; code=" + code + " hold_ms=" + hold);
            EventQueue.invokeAndWait(() -> {
                log("emulator_key_down code=" + code);
                KeyEvent event = new KeyEvent(lcd, KeyEvent.KEY_PRESSED, System.currentTimeMillis(), 0, code, KeyEvent.CHAR_UNDEFINED);
                for (KeyListener k : lcd.getKeyListeners()) k.keyPressed(event);
            });
            try { Thread.sleep(hold); }
            finally {
                EventQueue.invokeAndWait(() -> {
                    KeyEvent event = new KeyEvent(lcd, KeyEvent.KEY_RELEASED, System.currentTimeMillis(), 0, code, KeyEvent.CHAR_UNDEFINED);
                    for (KeyListener k : lcd.getKeyListeners()) k.keyReleased(event);
                    log("emulator_key_up code=" + code);
                });
            }
            return;
        }
        log("snapshot_begin; fields read independently, no atomicity; no game method invoked");
        for (Class<?> c : inst.getAllLoadedClasses()) {
            String name = c.getName();
            if (name.matches("br|q|m|bt|bf|ar")) {
                fields(c, null);
                if (name.equals("br")) {
                    for (Field f : c.getDeclaredFields()) {
                        if (Modifier.isStatic(f.getModifiers()) && f.getType() == c) {
                            f.setAccessible(true);
                            Object controller = f.get(null);
                            if (controller != null) fields(c, controller);
                        }
                    }
                }
            }
            if (name.equals("org.recompile.mobile.Mobile")) {
                for (Field f : c.getDeclaredFields()) {
                    if (!Modifier.isStatic(f.getModifiers())) continue;
                    if (f.getName().matches("lcdWidth|lcdHeight|limitFPS|isFastForwarding|isPaused|config")) {
                        f.setAccessible(true); Object v = f.get(null);
                        log("emulator " + f.getName() + "=" + value(v));
                        if (v != null && f.getName().equals("config")) {
                            Field settings = v.getClass().getField("settings");
                            log("effective_config=" + value(settings.get(v)));
                        }
                    }
                }
            }
        }
        if (!listener) {
            Toolkit.getDefaultToolkit().addAWTEventListener(event -> {
                if (event instanceof KeyEvent) {
                    KeyEvent key = (KeyEvent) event;
                    log("AWT_KEY id=" + key.getID() + " code=" + key.getKeyCode() + " location=" + key.getKeyLocation()
                        + " source=" + value(key.getSource()) + " thread=" + Thread.currentThread().getName());
                }
            }, AWTEvent.KEY_EVENT_MASK);
            listener = true;
            log("AWT listener attached; not a MIDlet callback trace; timing overhead unmeasured");
        }
        log("snapshot_end");
    }
    public static void main(String[] args) throws Exception {
        VirtualMachine vm = VirtualMachine.attach(args[0]);
        try { vm.loadAgent(args[1], args[2]); }
        finally { vm.detach(); }
    }
}
