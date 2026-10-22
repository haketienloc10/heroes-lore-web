import com.sun.tools.attach.VirtualMachine;
import java.lang.instrument.Instrumentation;
import java.lang.reflect.Field;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/** Read a bounded snapshot of selected records from the follow-up trace agent's in-memory buffer. */
public final class RuntimeTraceSnapshot {
    private static String quote(String s) {
        return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"")
                .replace("\n", "\\n").replace("\r", "\\r") + "\"";
    }

    @SuppressWarnings("unchecked")
    private static void snapshot(String base, Instrumentation inst) {
        String error = null;
        long seq = -1, dropped = -1, errors = -1;
        int total = -1, agCount = 0, keyCount = 0;
        ArrayList<String> selected = new ArrayList<>();
        try {
            Class<?> probe = null;
            for (Class<?> c : inst.getAllLoadedClasses())
                if (c.getName().equals("org.recompile.hlprobe.TraceProbeFollowup")) { probe = c; break; }
            if (probe == null) throw new IllegalStateException("TraceProbeFollowup class is not loaded");
            synchronized (probe) {
                Field rowsField = probe.getDeclaredField("rows"); rowsField.setAccessible(true);
                List<String> rows = (List<String>) rowsField.get(null);
                ArrayList<String> copy = new ArrayList<>(rows);
                total = copy.size();
                for (String row : copy) {
                    boolean ag = row.contains("\"class\":\"ag\"") && row.contains("\"method\":\"a(II)V\"");
                    boolean key = row.contains("\"class\":\"ar\"") && row.contains("\"method\":\"keyPressed(I)V\"");
                    if (ag) { selected.add(row); agCount++; }
                    else if (key) { selected.add(row); keyCount++; }
                }
                for (String name : new String[]{"seq", "dropped", "errors"}) {
                    Field f = probe.getDeclaredField(name); f.setAccessible(true);
                    long value = f.getLong(null);
                    if (name.equals("seq")) seq = value;
                    else if (name.equals("dropped")) dropped = value;
                    else errors = value;
                }
            }
        } catch (Throwable t) {
            error = t.getClass().getName() + ":" + String.valueOf(t.getMessage());
        }
        try {
            Path jsonl = Path.of(base + ".jsonl");
            Path metadata = Path.of(base + ".json");
            Files.createDirectories(jsonl.getParent());
            Files.write(jsonl, selected);
            String summary = "{\"event\":\"trace_memory_snapshot\",\"probe_class\":\"org.recompile.hlprobe.TraceProbeFollowup\","
                    + "\"selected_scope\":\"ag.a(II)V and ar.keyPressed(I)V records only\","
                    + "\"probe_sequence\":" + seq + ",\"buffer_rows\":" + total
                    + ",\"selected_ag_a_II_records\":" + agCount
                    + ",\"selected_ar_keyPressed_records\":" + keyCount
                    + ",\"dropped\":" + dropped + ",\"field_read_errors\":" + errors
                    + ",\"error\":" + (error == null ? "null" : quote(error)) + "}\n";
            Files.writeString(metadata, summary);
        } catch (Throwable t) { t.printStackTrace(); }
    }

    public static void agentmain(String args, Instrumentation inst) {
        Thread worker = new Thread(() -> snapshot(args, inst), "HL-runtime-trace-snapshot");
        worker.setDaemon(true);
        worker.start();
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 3) throw new IllegalArgumentException("PID AGENT_JAR OUTPUT_BASE");
        VirtualMachine vm = VirtualMachine.attach(args[0]);
        try { vm.loadAgent(args[1], args[2]); }
        finally { vm.detach(); }
    }
}
