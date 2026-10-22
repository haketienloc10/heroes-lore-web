import com.sun.tools.attach.VirtualMachine;
import java.lang.instrument.Instrumentation;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/** Copies the trace prefix under the trace collector's own class monitor. */
public final class TraceSnapshotProbe {
    private static Object read(Class<?> type, String name) throws Exception {
        Field field = type.getDeclaredField(name);
        field.setAccessible(true);
        return field.get(null);
    }

    @SuppressWarnings("unchecked")
    public static void agentmain(String args, Instrumentation instrumentation) throws Exception {
        String[] parts = args.split("\\|", 2);
        Path tracePath = Path.of(parts[0]);
        Path healthPath = Path.of(parts[1]);
        Class<?> collector = null;
        for (Class<?> loaded : instrumentation.getAllLoadedClasses()) {
            if (loaded.getName().equals("org.recompile.hlprobe.TraceProbeFollowup")) {
                collector = loaded;
                break;
            }
        }
        if (collector == null) throw new IllegalStateException("Trace collector is not loaded");

        synchronized (collector) {
            List<String> rows = new ArrayList<>((List<String>) read(collector, "rows"));
            Files.write(tracePath, rows, StandardCharsets.UTF_8);
            long seq = ((Number) read(collector, "seq")).longValue();
            long dropped = ((Number) read(collector, "dropped")).longValue();
            long errors = ((Number) read(collector, "errors")).longValue();
            long queueDropped = ((Number) read(collector, "repaintQueueDropped")).longValue();
            Files.writeString(healthPath,
                "{\"events\":" + seq + ",\"retained\":" + rows.size()
                + ",\"dropped\":" + dropped + ",\"field_read_errors\":" + errors
                + ",\"pending_ticket_queue_dropped\":" + queueDropped
                + ",\"snapshot_only\":true,\"collector_class_monitor_held\":true}\n",
                StandardCharsets.UTF_8);
        }
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 4) throw new IllegalArgumentException("pid agent.jar trace.jsonl health.json");
        VirtualMachine vm = VirtualMachine.attach(args[0]);
        try {
            vm.loadAgent(args[1], args[2] + "|" + args[3]);
        } finally {
            vm.detach();
        }
    }
}
