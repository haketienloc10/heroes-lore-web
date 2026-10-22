import com.sun.tools.attach.VirtualMachine;
import java.lang.instrument.Instrumentation;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

/** One-shot, read-only snapshot of SCN-0004 runtime flags and state fields. */
public final class RuntimeFlagSnapshot {
    private static String quote(String s) {
        return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"")
                .replace("\n", "\\n").replace("\r", "\\r") + "\"";
    }

    private static Class<?> loaded(Instrumentation inst, String name) {
        for (Class<?> c : inst.getAllLoadedClasses())
            if (c.getName().equals(name)) return c;
        return null;
    }

    private static Field field(Class<?> c, String name, Class<?> type, boolean isStatic) {
        if (c == null) return null;
        for (Field f : c.getDeclaredFields()) {
            if (!f.getName().equals(name) || f.getType() != type) continue;
            if (Modifier.isStatic(f.getModifiers()) != isStatic) continue;
            return f;
        }
        return null;
    }

    private static String read(Class<?> c, Object target, String name, Class<?> type,
                               boolean isStatic) {
        try {
            Field f = field(c, name, type, isStatic);
            if (f == null) return "null";
            f.setAccessible(true);
            Object value = f.get(target);
            return value == null ? "null" : value.toString();
        } catch (Throwable t) {
            return "error:" + t.getClass().getSimpleName();
        }
    }

    private static void snapshot(String path, Instrumentation inst) {
        Map<String, String> values = new HashMap<>();
        Class<?> ag = loaded(inst, "ag"), br = loaded(inst, "br");
        Class<?> m = loaded(inst, "m"), q = loaded(inst, "q");
        Object controller = null;
        if (br != null) {
            try {
                Field f = field(br, "a", br, true);
                if (f != null) { f.setAccessible(true); controller = f.get(null); }
            } catch (Throwable t) {
                values.put("br.controller", "error:" + t.getClass().getSimpleName());
            }
        }
        values.put("ag.a:Z", read(ag, null, "a", boolean.class, true));
        values.put("br.d:Z", read(br, controller, "d", boolean.class, false));
        values.put("br.d:I", read(br, controller, "d", int.class, false));
        values.put("m.e:I", read(m, null, "e", int.class, true));
        values.put("m.b:B", read(m, null, "b", byte.class, true));
        values.put("m.c:B", read(m, null, "c", byte.class, true));
        values.put("m.d:B", read(m, null, "d", byte.class, true));
        values.put("q.b:Z", read(q, null, "b", boolean.class, true));
        StringBuilder fields = new StringBuilder("{");
        boolean first = true;
        for (Map.Entry<String, String> e : values.entrySet()) {
            if (!first) fields.append(',');
            first = false;
            fields.append(quote(e.getKey())).append(':').append(quote(e.getValue()));
        }
        fields.append('}');
        String json = "{\"event\":\"runtime_flag_snapshot\",\"utc\":"
                + quote(Instant.now().toString()) + ",\"mono_ns\":" + System.nanoTime()
                + ",\"scope\":\"selected fields only; sequential reads; no game methods invoked\""
                + ",\"fields\":" + fields + "}\n";
        try {
            Path output = Path.of(path);
            Files.createDirectories(output.getParent());
            Files.writeString(output, json);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    public static void agentmain(String args, Instrumentation inst) {
        Thread worker = new Thread(() -> snapshot(args, inst), "HL-runtime-flag-snapshot");
        worker.setDaemon(true);
        worker.start();
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 3) throw new IllegalArgumentException("PID AGENT_JAR OUTPUT_JSON");
        VirtualMachine vm = VirtualMachine.attach(args[0]);
        try { vm.loadAgent(args[1], args[2]); }
        finally { vm.detach(); }
    }
}
