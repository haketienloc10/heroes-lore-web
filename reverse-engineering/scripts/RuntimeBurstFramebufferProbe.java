import java.awt.image.BufferedImage;
import java.awt.image.ColorModel;
import java.awt.image.RenderedImage;
import java.awt.image.WritableRaster;
import java.lang.instrument.Instrumentation;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.locks.LockSupport;
import javax.imageio.ImageIO;

/**
 * Samples the FreeJ2ME frontbuffer in one attached-agent call. It reads emulator
 * presentation pixels only; it does not call game methods, write game fields, or
 * install a transformer. PNG encoding happens after sampling and input release.
 */
public final class RuntimeBurstFramebufferProbe {
    private RuntimeBurstFramebufferProbe() {}

    private static final class Sample {
        final int ordinal;
        final long startNs;
        final long endNs;
        final BufferedImage image;

        Sample(int ordinal, long startNs, long endNs, BufferedImage image) {
            this.ordinal = ordinal;
            this.startNs = startNs;
            this.endNs = endNs;
            this.image = image;
        }
    }

    public static final class Burst {
        private final long beginNs;
        private final long endNs;
        private final int requestedIntervalMs;
        private final List<Sample> samples;

        private Burst(long beginNs, long endNs, int requestedIntervalMs, List<Sample> samples) {
            this.beginNs = beginNs;
            this.endNs = endNs;
            this.requestedIntervalMs = requestedIntervalMs;
            this.samples = samples;
        }

        public void write(Path imageDir, Path log, String prefix) throws Exception {
            Files.createDirectories(imageDir);
            String safePrefix = prefix.replaceAll("[^A-Za-z0-9._-]", "_");
            StringBuilder rows = new StringBuilder();
            rows.append("# utc=").append(Instant.now())
                .append(" producer=FreeJ2ME in-process frontbuffer reader; timestamps use target JVM System.nanoTime()")
                .append(" requested_interval_ms=").append(requestedIntervalMs)
                .append(" begin_mono_ns=").append(beginNs)
                .append(" end_mono_ns=").append(endNs)
                .append(" samples=").append(samples.size())
                .append("; images are copied during capture and PNG-encoded after the input release\n");
            for (Sample sample : samples) {
                String name = safePrefix + "-" + String.format(Locale.ROOT, "%04d", sample.ordinal) + ".png";
                Path image = imageDir.resolve(name);
                if (!ImageIO.write(sample.image, "png", image.toFile())) {
                    throw new IllegalStateException("PNG writer unavailable");
                }
                rows.append(sample.ordinal).append(' ')
                    .append(sample.startNs).append(' ')
                    .append(sample.endNs).append(' ')
                    .append(name).append('\n');
            }
            Files.writeString(log, rows.toString());
        }
    }

    private static BufferedImage copy(RenderedImage source) {
        WritableRaster raster = source.copyData(null);
        ColorModel model = source.getColorModel();
        return new BufferedImage(model, raster, model.isAlphaPremultiplied(), null);
    }

    public static Burst capture(int durationMs, int intervalMs, Instrumentation inst) throws Exception {
        if (durationMs < 1 || intervalMs < 1) throw new IllegalArgumentException("duration/interval must be positive");
        Class<?> mobile = null;
        for (Class<?> c : inst.getAllLoadedClasses()) {
            if (c.getName().equals("org.recompile.mobile.Mobile")) {
                mobile = c;
                break;
            }
        }
        if (mobile == null) throw new IllegalStateException("FreeJ2ME Mobile class not loaded");
        Method getPlatform = mobile.getMethod("getPlatform");
        Object platform = getPlatform.invoke(null);
        Method getFrontbuffer = platform.getClass().getMethod("getLcdFrontbuffer");
        Object frontbuffer = getFrontbuffer.invoke(platform);
        Method getCanvas = frontbuffer.getClass().getMethod("getCanvas");

        long begin = System.nanoTime();
        long end = begin + durationMs * 1_000_000L;
        long period = intervalMs * 1_000_000L;
        long target = begin;
        List<Sample> samples = new ArrayList<>((durationMs + intervalMs - 1) / intervalMs + 2);
        while (true) {
            long now = System.nanoTime();
            if (now >= end) break;
            long sampleStart = now;
            RenderedImage frame = (RenderedImage) getCanvas.invoke(frontbuffer);
            BufferedImage image = copy(frame);
            long sampleEnd = System.nanoTime();
            samples.add(new Sample(samples.size(), sampleStart, sampleEnd, image));

            target += period;
            long remaining = target - System.nanoTime();
            if (remaining > 0) LockSupport.parkNanos(remaining);
            else target = System.nanoTime();
        }
        return new Burst(begin, System.nanoTime(), intervalMs, samples);
    }
}
