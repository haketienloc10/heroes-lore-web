import com.sun.tools.attach.VirtualMachine;
import java.lang.instrument.Instrumentation;
import java.lang.reflect.Array;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.util.ArrayList;
import java.util.IdentityHashMap;
import java.util.List;

/** Bounded read-only snapshots of source enemy attack state; does not transform classes or write game fields. */
public final class RuntimeEnemyAttackSampler {
    private static String quote(String value) {
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"")
            .replace("\n", "\\n").replace("\r", "\\r") + "\"";
    }

    private static Field findField(Class<?> type, String name, Class<?> fieldType) throws Exception {
        for (Class<?> current = type; current != null; current = current.getSuperclass()) {
            try {
                Field field = current.getDeclaredField(name);
                if (field.getType() == fieldType) {
                    field.setAccessible(true);
                    return field;
                }
            } catch (NoSuchFieldException ignored) { }
        }
        throw new NoSuchFieldException(type.getName() + "." + name + ":" + fieldType.getName());
    }

    private static Object staticInstance(Instrumentation instrumentation, String owner, String memberType) throws Exception {
        for (Class<?> type : instrumentation.getAllLoadedClasses()) {
            if (!type.getName().equals(owner)) continue;
            for (Field field : type.getDeclaredFields()) {
                if (!Modifier.isStatic(field.getModifiers()) || !field.getType().getName().equals(memberType)) continue;
                field.setAccessible(true);
                return field.get(null);
            }
        }
        return null;
    }

    private static Object findEntityGrid(Object world) throws Exception {
        for (Field field : world.getClass().getDeclaredFields()) {
            Class<?> type = field.getType();
            if (!type.isArray() || !type.getComponentType().isArray() ||
                !type.getComponentType().getComponentType().getName().equals("cj")) continue;
            field.setAccessible(true);
            return field.get(world);
        }
        return null;
    }

    private static void sample(String base, int targetEnemyId, int durationMs, int intervalMs,
                               int maxAttackStarts, Instrumentation instrumentation) {
        Path jsonl = Path.of(base + ".jsonl");
        Path summary = Path.of(base + ".summary.json");
        long startedAt = System.nanoTime();
        int samples = 0;
        int attackStarts = 0;
        Integer startHp = null;
        int minHp = Integer.MAX_VALUE;
        Integer endHp = null;
        String stopReason = "duration";
        String error = null;
        ArrayList<String> startEvents = new ArrayList<>();
        IdentityHashMap<Object, Boolean> previousAttackState = new IdentityHashMap<>();
        try {
            Files.createDirectories(jsonl.getParent());
            Object world = staticInstance(instrumentation, "m", "ad");
            Object player = staticInstance(instrumentation, "m", "an");
            if (world == null || player == null) throw new IllegalStateException("Source world/player is not loaded");
            Object grid = findEntityGrid(world);
            if (grid == null) throw new IllegalStateException("Source entity grid is unavailable");

            Class<?> enemyType = null;
            for (Class<?> type : instrumentation.getAllLoadedClasses()) {
                if (type.getName().equals("ak")) { enemyType = type; break; }
            }
            if (enemyType == null) throw new IllegalStateException("Source enemy class ak is not loaded");
            Field enemyIdField = findField(enemyType, "m", byte.class);
            Field enemyCooldownField = findField(enemyType, "p", byte.class);
            Field enemyDelayField = findField(enemyType, "o", byte.class);
            Field stateField = findField(enemyType, "h", byte.class);
            Field frameField = findField(enemyType, "k", byte.class);
            Field tileXField = findField(enemyType, "a", byte.class);
            Field tileYField = findField(enemyType, "b", byte.class);
            Field playerHpField = findField(player.getClass(), "a", int.class);

            long deadline = startedAt + durationMs * 1_000_000L;
            try (var writer = Files.newBufferedWriter(jsonl, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING)) {
                while (System.nanoTime() < deadline) {
                    long elapsedMs = (System.nanoTime() - startedAt) / 1_000_000L;
                    int hp = playerHpField.getInt(player);
                    if (startHp == null) startHp = hp;
                    minHp = Math.min(minHp, hp);
                    endHp = hp;
                    List<String> enemies = new ArrayList<>();
                    List<String> newStarts = new ArrayList<>();
                    IdentityHashMap<Object, Boolean> seen = new IdentityHashMap<>();
                    for (int y = 0; y < Array.getLength(grid); y++) {
                        Object row = Array.get(grid, y);
                        for (int x = 0; x < Array.getLength(row); x++) {
                            Object actor = Array.get(row, x);
                            if (actor == null || !enemyType.isInstance(actor) || seen.put(actor, Boolean.TRUE) != null) continue;
                            int enemyId = enemyIdField.getByte(actor);
                            if (enemyId != targetEnemyId) continue;
                            int tileX = tileXField.getByte(actor);
                            int tileY = tileYField.getByte(actor);
                            int state = stateField.getByte(actor);
                            int frame = frameField.getByte(actor);
                            boolean attacking = state == 3;
                            boolean wasAttacking = previousAttackState.getOrDefault(actor, Boolean.FALSE);
                            String actorKey = Integer.toHexString(System.identityHashCode(actor));
                            if (attacking && !wasAttacking) {
                                attackStarts += 1;
                                newStarts.add("{\"actorKey\":" + quote(actorKey) + ",\"elapsedMs\":" + elapsedMs +
                                    ",\"tile\":[" + tileX + "," + tileY + "]}");
                            }
                            previousAttackState.put(actor, attacking);
                            enemies.add("{\"actorKey\":" + quote(actorKey) + ",\"enemyId\":" + enemyId +
                                ",\"tile\":[" + tileX + "," + tileY + "],\"state\":" + state +
                                ",\"frame\":" + frame + ",\"attackCooldown\":" + enemyCooldownField.getByte(actor) +
                                ",\"actionDelay\":" + enemyDelayField.getByte(actor) + "}");
                        }
                    }
                    startEvents.addAll(newStarts);
                    String row = "{\"sample\":" + samples + ",\"at\":" + quote(Instant.now().toString()) +
                        ",\"elapsedMs\":" + elapsedMs + ",\"playerHp\":" + hp +
                        ",\"attackStartCount\":" + attackStarts + ",\"newAttackStarts\":[" + String.join(",", newStarts) +
                        "],\"enemies\":[" + String.join(",", enemies) + "]}";
                    writer.write(row);
                    writer.newLine();
                    if (samples % 10 == 0) writer.flush();
                    samples += 1;
                    if (attackStarts >= maxAttackStarts) { stopReason = "attack-start-limit"; break; }
                    if (startHp != null && hp <= Math.max(1, startHp - 24)) { stopReason = "bounded-player-hp-loss"; break; }
                    Thread.sleep(intervalMs);
                }
            }
        } catch (Throwable throwable) {
            error = throwable.getClass().getName() + ":" + String.valueOf(throwable.getMessage());
        }
        long endedAt = System.nanoTime();
        try {
            Files.createDirectories(summary.getParent());
            String payload = "{\"event\":\"source_enemy_attack_sample_summary\",\"targetEnemyId\":" + targetEnemyId +
                ",\"requestedDurationMs\":" + durationMs + ",\"sampleIntervalMs\":" + intervalMs +
                ",\"observedDurationMs\":" + ((endedAt - startedAt) / 1_000_000L) + ",\"sampleCount\":" + samples +
                ",\"attackStartCount\":" + attackStarts + ",\"attackStarts\":[" + String.join(",", startEvents) +
                "],\"playerHpStart\":" + (startHp == null ? "null" : startHp) +
                ",\"playerHpMinimum\":" + (minHp == Integer.MAX_VALUE ? "null" : minHp) +
                ",\"playerHpEnd\":" + (endHp == null ? "null" : endHp) +
                ",\"stopReason\":" + quote(stopReason) +
                ",\"fieldsReadIndependently\":true,\"gameMethodsInvoked\":false,\"gameFieldsWritten\":false,\"classTransformations\":false,\"error\":" +
                (error == null ? "null" : quote(error)) + "}\n";
            Files.writeString(summary, payload, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
        } catch (Throwable throwable) { throwable.printStackTrace(); }
    }

    public static void agentmain(String args, Instrumentation instrumentation) {
        String[] values = args.split("\\|");
        if (values.length != 5) throw new IllegalArgumentException("OUTPUT_BASE|ENEMY_ID|DURATION_MS|INTERVAL_MS|MAX_ATTACK_STARTS");
        String base = values[0];
        int enemyId = Integer.parseInt(values[1]);
        int durationMs = Integer.parseInt(values[2]);
        int intervalMs = Integer.parseInt(values[3]);
        int maxAttackStarts = Integer.parseInt(values[4]);
        if (durationMs < 1000 || durationMs > 30000 || intervalMs < 20 || intervalMs > 500 || maxAttackStarts < 1 || maxAttackStarts > 5)
            throw new IllegalArgumentException("Sampler limits: duration 1000–30000 ms, interval 20–500 ms, max starts 1–5");
        Thread worker = new Thread(() -> sample(base, enemyId, durationMs, intervalMs, maxAttackStarts, instrumentation),
            "HL-source-enemy-attack-sampler");
        worker.setDaemon(true);
        worker.start();
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 7) throw new IllegalArgumentException("PID AGENT_JAR OUTPUT_BASE ENEMY_ID DURATION_MS INTERVAL_MS MAX_ATTACK_STARTS");
        VirtualMachine vm = VirtualMachine.attach(args[0]);
        try { vm.loadAgent(args[1], args[2] + "|" + args[3] + "|" + args[4] + "|" + args[5] + "|" + args[6]); }
        finally { vm.detach(); }
    }
}
