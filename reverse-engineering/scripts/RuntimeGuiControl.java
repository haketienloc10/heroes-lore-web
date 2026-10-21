import java.awt.GraphicsEnvironment;
import java.awt.Rectangle;
import java.awt.Robot;
import java.awt.event.InputEvent;
import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import javax.imageio.ImageIO;

/** Thu ảnh/input host bằng AWT Robot; không sửa hoặc instrument JAR game. */
public class RuntimeGuiControl {
    private static Path log;

    private static void event(String name, String fields) throws Exception {
        String line = "{\"utc\":\"" + Instant.now() + "\",\"mono_ns\":" + System.nanoTime()
            + ",\"producer\":\"AWT Robot host\",\"event\":\"" + name + "\"" + fields + "}\n";
        Files.writeString(log, line, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
    }

    public static void main(String[] args) throws Exception {
        log = Path.of(args[0]);
        Robot robot = new Robot();
        switch (args[1]) {
            case "capture": {
                Rectangle rect = args.length == 3
                    ? GraphicsEnvironment.getLocalGraphicsEnvironment().getDefaultScreenDevice().getDefaultConfiguration().getBounds()
                    : new Rectangle(Integer.parseInt(args[3]), Integer.parseInt(args[4]), Integer.parseInt(args[5]), Integer.parseInt(args[6]));
                event("capture_begin", ",\"x\":" + rect.x + ",\"y\":" + rect.y + ",\"width\":" + rect.width + ",\"height\":" + rect.height);
                ImageIO.write(robot.createScreenCapture(rect), "png", new File(args[2]));
                event("capture_end", "");
                break;
            }
            case "tap": {
                int key = Integer.parseInt(args[2]);
                event("key_down", ",\"host_awt_keycode\":" + key);
                robot.keyPress(key);
                try { Thread.sleep(Integer.parseInt(args[3])); }
                finally {
                    robot.keyRelease(key);
                    event("key_up", ",\"host_awt_keycode\":" + key);
                }
                robot.waitForIdle();
                break;
            }
            case "click": {
                int x = Integer.parseInt(args[2]), y = Integer.parseInt(args[3]);
                event("click", ",\"x\":" + x + ",\"y\":" + y);
                robot.mouseMove(x, y);
                robot.mousePress(InputEvent.BUTTON1_DOWN_MASK);
                robot.mouseRelease(InputEvent.BUTTON1_DOWN_MASK);
                robot.waitForIdle();
                break;
            }
            default: throw new IllegalArgumentException("capture | tap | click");
        }
    }
}
