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

/** Isolated right-walk screenshot capture; synthetic KeyListener and frontbuffer reads only. */
public final class M1059RightWalkCaptureAgentR23 {
  private static Path log;
  private static void emit(String text) throws Exception {
    Files.writeString(log, Instant.now()+" mono_ns="+System.nanoTime()+" "+text+"\n", StandardOpenOption.CREATE, StandardOpenOption.APPEND);
  }
  private static Component find(Component c) {
    if (c instanceof java.awt.Canvas && c.getKeyListeners().length>0) return c;
    if (c instanceof Container) for (Component child:((Container)c).getComponents()) { Component x=find(child); if(x!=null)return x; }
    return null;
  }
  private static void key(Component c,int code,boolean down) throws Exception {
    EventQueue.invokeAndWait(()->{
      KeyEvent e=new KeyEvent(c,down?KeyEvent.KEY_PRESSED:KeyEvent.KEY_RELEASED,System.currentTimeMillis(),0,code,KeyEvent.CHAR_UNDEFINED);
      for(KeyListener k:c.getKeyListeners()) { if(down)k.keyPressed(e); else k.keyReleased(e); }
    });
    emit("listener_dispatch phase="+(down?"down":"up")+" code="+code);
  }
  private static void mapping(int code,Instrumentation inst) throws Exception {
    Class<?> frontend=null,mobile=null;
    for(Class<?> c:inst.getAllLoadedClasses()) {
      if(c.getName().equals("org.recompile.freej2me.FreeJ2ME"))frontend=c;
      if(c.getName().equals("org.recompile.mobile.Mobile"))mobile=c;
    }
    Method get=frontend.getDeclaredMethod("getMobileKey",int.class);get.setAccessible(true);
    int internal=(Integer)get.invoke(frontend.getField("app").get(null),code);
    Object raw=internal==Integer.MIN_VALUE?"UNMAPPED":mobile.getMethod("getMobileKey",int.class).invoke(null,internal);
    emit("computed_emulator_mapping host_awt="+code+" internal="+internal+" raw="+raw);
  }
  public static void agentmain(String args,Instrumentation inst) throws Exception {
    String[] a=args.split("\\|");Path images=Path.of(a[0]),rd=Path.of(a[1]);
    int code=Integer.parseInt(a[2]),duration=Integer.parseInt(a[3]),interval=Integer.parseInt(a[4]);String prefix=a[5];
    log=rd.resolve("right-walk-capture.log");Component lcd=null;
    for(Frame f:Frame.getFrames())if(f.getTitle().equals("FreeJ2ME-Plus"))lcd=find(f);
    if(lcd==null)throw new IllegalStateException("No LCD KeyListener");
    emit("capture_begin duration_ms="+duration+" interval_ms="+interval+"; no game method or field writes");
    mapping(code,inst);key(lcd,code,true);
    RuntimeBurstFramebufferProbeR23.Burst walking;
    try{walking=RuntimeBurstFramebufferProbeR23.capture(duration,interval,inst);}
    finally{key(lcd,code,false);}
    walking.write(images,rd.resolve(prefix+"-samples.log"),prefix);
    emit("walk_capture_complete prefix="+prefix+" input_released_before_png_encode=true");
    Thread.sleep(300);
    RuntimeBurstFramebufferProbeR23.Burst idle=RuntimeBurstFramebufferProbeR23.capture(250,interval,inst);
    idle.write(images,rd.resolve("08-idle-after-release-samples.log"),"08-idle-after-release");
    emit("idle_capture_complete; no browser/game storage accessed");
  }
}
