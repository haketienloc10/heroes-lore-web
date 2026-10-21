import java.awt.image.RenderedImage;
import java.lang.instrument.Instrumentation;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import javax.imageio.ImageIO;

/** Đọc frontbuffer như ScreenShot của FreeJ2ME-Plus; không gọi method game. */
public class RuntimeFramebufferProbe {
    public static void agentmain(String args, Instrumentation inst) throws Exception {
        String[] paths = args.split("\\|");
        Path image = Path.of(paths[0]), log = Path.of(paths[1]);
        for (Class<?> c : inst.getAllLoadedClasses()) {
            if (!c.getName().equals("org.recompile.mobile.Mobile")) continue;
            Object platform = c.getMethod("getPlatform").invoke(null);
            Object buffer = platform.getClass().getMethod("getLcdFrontbuffer").invoke(platform);
            RenderedImage pixels = (RenderedImage) buffer.getClass().getMethod("getCanvas").invoke(buffer);
            ImageIO.write(pixels, "png", image.toFile());
            Files.writeString(log, Instant.now() + " mono_ns=" + System.nanoTime()
                + " emulator_frontbuffer_capture " + image + " " + pixels.getWidth() + "x" + pixels.getHeight()
                + "; not host presentation timing; no synchronization with game paint\n",
                StandardOpenOption.CREATE, StandardOpenOption.APPEND);
            return;
        }
        throw new IllegalStateException("Chưa có emulator Mobile class");
    }
}
