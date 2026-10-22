import java.nio.file.*;
import java.util.*;
import java.util.jar.*;
import jdk.internal.org.objectweb.asm.*;
import jdk.internal.org.objectweb.asm.tree.*;

/** Static audit: remove precisely the emitted straight-line probes, compare all
 * original instructions and exception regions with label targets by instruction
 * ordinal. No equivalence claim for JVM timing/observer effects. */
public class SchedulerBytecodeAudit {
    static String form(MethodNode m, boolean strip) {
        if(strip) for(AbstractInsnNode n:m.instructions.toArray())
            if(n instanceof MethodInsnNode c && c.owner.equals("org/recompile/hlprobe/TraceProbe") && c.name.equals("event")) {
                AbstractInsnNode p=n;
                for(int i=0;i<7;i++) { AbstractInsnNode prev=p.getPrevious(); m.instructions.remove(p);p=prev; }
            }
        Map<LabelNode,Integer> labels=new IdentityHashMap<>();int index=0;
        for(AbstractInsnNode n:m.instructions) { if(n instanceof LabelNode l)labels.put(l,index); if(n.getOpcode()>=0)index++; }
        StringBuilder s=new StringBuilder();
        for(AbstractInsnNode n:m.instructions) {
            if(n.getOpcode()<0)continue;s.append(n.getOpcode()).append(':');
            if(n instanceof VarInsnNode x)s.append(x.var);
            else if(n instanceof IntInsnNode x)s.append(x.operand);
            else if(n instanceof LdcInsnNode x)s.append(x.cst);
            else if(n instanceof FieldInsnNode x)s.append(x.owner).append('.').append(x.name).append(x.desc);
            else if(n instanceof MethodInsnNode x)s.append(x.owner).append('.').append(x.name).append(x.desc).append(x.itf);
            else if(n instanceof TypeInsnNode x)s.append(x.desc);
            else if(n instanceof JumpInsnNode x)s.append(labels.get(x.label));
            else if(n instanceof IincInsnNode x)s.append(x.var).append(',').append(x.incr);
            else if(n instanceof TableSwitchInsnNode x) {s.append(x.min).append(',').append(x.max).append(',').append(labels.get(x.dflt));for(LabelNode l:x.labels)s.append(',').append(labels.get(l));}
            else if(n instanceof LookupSwitchInsnNode x) {s.append(x.keys).append(',').append(labels.get(x.dflt));for(LabelNode l:x.labels)s.append(',').append(labels.get(l));}
            else if(n instanceof MultiANewArrayInsnNode x)s.append(x.desc).append(',').append(x.dims);
            else if(n instanceof InvokeDynamicInsnNode x)s.append(x.name).append(x.desc).append(x.bsm).append(Arrays.toString(x.bsmArgs));
            s.append('\n');
        }
        for(TryCatchBlockNode x:m.tryCatchBlocks)s.append("try:").append(labels.get(x.start)).append(',').append(labels.get(x.end)).append(',').append(labels.get(x.handler)).append(',').append(x.type).append('\n');
        return s.toString();
    }
    public static void main(String[] args)throws Exception {
        int classes=0,methods=0;
        try(JarFile a=new JarFile(args[0]);JarFile b=new JarFile(args[1])) {
            for(JarEntry e:Collections.list(a.entries())) {
                if(!e.getName().endsWith(".class"))continue;
                byte[] old=a.getInputStream(e).readAllBytes(),now=b.getInputStream(b.getJarEntry(e.getName())).readAllBytes();
                if(Arrays.equals(old,now))continue;
                ClassNode ac=new ClassNode(),bc=new ClassNode();new ClassReader(old).accept(ac,0);new ClassReader(now).accept(bc,0);
                if(ac.version!=bc.version || ac.methods.size()!=bc.methods.size())throw new AssertionError(e.getName());
                for(int i=0;i<ac.methods.size();i++) {
                    MethodNode am=ac.methods.get(i),bm=bc.methods.get(i);
                    if(!am.name.equals(bm.name)||!am.desc.equals(bm.desc)||!form(am,false).equals(form(bm,true)))
                        throw new AssertionError(e.getName()+" "+am.name+am.desc);
                    methods++;
                }
                classes++;
            }
        }
        String result="{\"original\":\""+args[0]+"\",\"copy\":\""+args[1]+"\",\"changed_classes\":"+classes+",\"methods_compared\":"+methods+",\"original_instructions_and_exception_regions_preserved_after_probe_removal\":true,\"class_versions_unchanged\":true,\"runtime_equivalence_claimed\":false}\n";
        Files.writeString(Path.of(args[2]),result);
    }
}
