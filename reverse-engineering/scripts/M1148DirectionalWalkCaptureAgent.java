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

/** Captures one directional movement burst and its post-release idle on FreeJ2ME. */
public final class M1148DirectionalWalkCaptureAgent {
  private static Path log;

  private static void emit(String message) throws Exception {
    Files.writeString(log, Instant.now() + " mono_ns=" + System.nanoTime() + " " + message + "\n",
        StandardOpenOption.CREATE, StandardOpenOption.APPEND);
  }

  private static Component find(Component component) {
    if (component instanceof java.awt.Canvas && component.getKeyListeners().length > 0) return component;
    if (component instanceof Container) {
      for (Component child : ((Container) component).getComponents()) {
        Component found = find(child);
        if (found != null) return found;
      }
    }
    return null;
  }

  private static void key(Component component, int code, boolean down) throws Exception {
    EventQueue.invokeAndWait(() -> {
      KeyEvent event = new KeyEvent(component,
          down ? KeyEvent.KEY_PRESSED : KeyEvent.KEY_RELEASED,
          System.currentTimeMillis(), 0, code, KeyEvent.CHAR_UNDEFINED);
      for (KeyListener listener : component.getKeyListeners()) {
        if (down) listener.keyPressed(event);
        else listener.keyReleased(event);
      }
    });
    emit("listener_dispatch phase=" + (down ? "down" : "up") + " code=" + code);
  }

  private static void mapping(int code, Instrumentation instrumentation) throws Exception {
    Class<?> frontend = null;
    Class<?> mobile = null;
    for (Class<?> type : instrumentation.getAllLoadedClasses()) {
      if (type.getName().equals("org.recompile.freej2me.FreeJ2ME")) frontend = type;
      if (type.getName().equals("org.recompile.mobile.Mobile")) mobile = type;
    }
    if (frontend == null || mobile == null) throw new IllegalStateException("FreeJ2ME key mapper is unavailable");
    Method getMobileKey = frontend.getDeclaredMethod("getMobileKey", int.class);
    getMobileKey.setAccessible(true);
    int internal = (Integer) getMobileKey.invoke(frontend.getField("app").get(null), code);
    Object raw = internal == Integer.MIN_VALUE
        ? "UNMAPPED"
        : mobile.getMethod("getMobileKey", int.class).invoke(null, internal);
    emit("computed_emulator_mapping host_awt=" + code + " internal=" + internal + " raw=" + raw);
  }

  public static void agentmain(String args, Instrumentation instrumentation) throws Exception {
    String[] options = args.split("\\|");
    if (options.length != 6) throw new IllegalArgumentException("Expected imageDir|runDir|key|duration|interval|prefix");
    Path images = Path.of(options[0]);
    Path run = Path.of(options[1]);
    int code = Integer.parseInt(options[2]);
    int duration = Integer.parseInt(options[3]);
    int interval = Integer.parseInt(options[4]);
    String prefix = options[5];
    log = run.resolve("directional-walk-capture.log");
    Component lcd = null;
    for (Frame frame : Frame.getFrames()) {
      if (frame.getTitle().equals("FreeJ2ME-Plus")) lcd = find(frame);
    }
    if (lcd == null) throw new IllegalStateException("No LCD KeyListener");

    emit("capture_begin prefix=" + prefix + " duration_ms=" + duration + " interval_ms=" + interval
        + "; framebuffer reads only; no game method or field writes");
    mapping(code, instrumentation);
    key(lcd, code, true);
    RuntimeBurstFramebufferProbeR23.Burst walking;
    try {
      walking = RuntimeBurstFramebufferProbeR23.capture(duration, interval, instrumentation);
    } finally {
      key(lcd, code, false);
    }
    walking.write(images, run.resolve(prefix + "-samples.log"), prefix);
    emit("walk_capture_complete prefix=" + prefix + " input_released_before_png_encode=true");

    Thread.sleep(300);
    RuntimeBurstFramebufferProbeR23.Burst idle = RuntimeBurstFramebufferProbeR23.capture(250, interval, instrumentation);
    idle.write(images, run.resolve(prefix + "-idle-samples.log"), prefix + "-idle");
    emit("idle_capture_complete prefix=" + prefix + "; no browser/game storage accessed");
  }
}
