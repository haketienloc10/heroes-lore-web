import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.jar.JarEntry;
import java.util.jar.JarFile;
import jdk.internal.org.objectweb.asm.ClassReader;
import jdk.internal.org.objectweb.asm.Opcodes;
import jdk.internal.org.objectweb.asm.tree.AbstractInsnNode;
import jdk.internal.org.objectweb.asm.tree.ClassNode;
import jdk.internal.org.objectweb.asm.tree.IntInsnNode;
import jdk.internal.org.objectweb.asm.tree.LdcInsnNode;
import jdk.internal.org.objectweb.asm.tree.MethodInsnNode;
import jdk.internal.org.objectweb.asm.tree.MethodNode;

/** Read-only inventory of every m state-setter and CF-04 pending-command call site. */
public final class FindCf04Reachability implements Opcodes {
    private static Integer intConstant(AbstractInsnNode insn) {
        if (insn == null) return null;
        int opcode = insn.getOpcode();
        if (opcode >= ICONST_M1 && opcode <= ICONST_5) return opcode - ICONST_0;
        if (insn instanceof IntInsnNode value && (opcode == BIPUSH || opcode == SIPUSH)) return value.operand;
        if (insn instanceof LdcInsnNode value && value.cst instanceof Integer number) return number;
        return null;
    }

    private static AbstractInsnNode previousOpcode(AbstractInsnNode insn) {
        AbstractInsnNode previous = insn.getPrevious();
        while (previous != null && previous.getOpcode() < 0) previous = previous.getPrevious();
        return previous;
    }

    private static AbstractInsnNode previousOpcode(AbstractInsnNode insn, int distance) {
        AbstractInsnNode previous = insn;
        for (int i = 0; i < distance; i++) previous = previousOpcode(previous);
        return previous;
    }

    private static String json(String value) {
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    private static String nullable(Integer value) { return value == null ? "null" : value.toString(); }

    public static void main(String[] args) throws Exception {
        Path jarPath = Path.of(args[0]);
        int classCount = 0;
        List<String> stateSetters = new ArrayList<>();
        List<String> commandSetters = new ArrayList<>();
        List<String> directStateStores = new ArrayList<>();
        List<String> stateFourTransitions = new ArrayList<>();
        try (JarFile jar = new JarFile(jarPath.toFile())) {
            for (JarEntry entry : Collections.list(jar.entries())) {
                if (!entry.getName().endsWith(".class")) continue;
                classCount++;
                ClassNode type = new ClassNode();
                new ClassReader(jar.getInputStream(entry).readAllBytes()).accept(type, 0);
                for (MethodNode method : type.methods) {
                    AbstractInsnNode[] instructions = method.instructions.toArray();
                    for (int index = 0; index < instructions.length; index++) {
                        AbstractInsnNode instruction = instructions[index];
                        if (instruction instanceof MethodInsnNode call && call.owner.equals("m")) {
                            if (call.name.equals("a") && call.desc.equals("(I)V")) {
                                Integer value = intConstant(previousOpcode(instruction));
                                String row = "{\"class\":" + json(type.name) + ",\"method\":" + json(method.name + method.desc) +
                                    ",\"instruction_ordinal\":" + index + ",\"previous_constant\":" + nullable(value) + "}";
                                stateSetters.add(row);
                                if (value != null && value == 14) stateFourTransitions.add(row);
                            }
                            if (call.name.equals("a") && call.desc.matches("\\(B{1,4}\\)V")) {
                                int arity = call.desc.indexOf(')') - 1;
                                List<String> constants = new ArrayList<>();
                                for (int distance = arity; distance >= 1; distance--)
                                    constants.add(nullable(intConstant(previousOpcode(instruction, distance))));
                                String row = "{\"class\":" + json(type.name) + ",\"method\":" + json(method.name + method.desc) +
                                    ",\"instruction_ordinal\":" + index + ",\"descriptor\":" + json(call.desc) +
                                    ",\"argument_constants\":[" + String.join(",", constants) + "]}";
                                commandSetters.add(row);
                            }
                        }
                        if (instruction instanceof jdk.internal.org.objectweb.asm.tree.FieldInsnNode field &&
                            instruction.getOpcode() == PUTSTATIC && field.owner.equals("m") && field.name.equals("e") && field.desc.equals("I")) {
                            directStateStores.add("{\"class\":" + json(type.name) + ",\"method\":" + json(method.name + method.desc) +
                                ",\"instruction_ordinal\":" + index + "}");
                        }
                    }
                }
            }
        }
        System.out.println("{\"jar\":" + json(jarPath.toAbsolutePath().normalize().toString()) +
            ",\"class_count\":" + classCount + ",\"state_setter_calls\":[" + String.join(",", stateSetters) +
            "],\"direct_state_stores\":[" + String.join(",", directStateStores) +
            "],\"constant_state_14_calls\":[" + String.join(",", stateFourTransitions) +
            "],\"pending_command_setter_calls\":[" + String.join(",", commandSetters) + "]}");
    }
}
