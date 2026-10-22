import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import java.net.UnixDomainSocketAddress;
import java.net.StandardProtocolFamily;
import java.nio.ByteBuffer;
import java.nio.channels.SocketChannel;

/** Host/JVM read calibration, not an absolute clock accuracy claim. */
public class SchedulerClockCalibration {
    public static void main(String[] args) throws Exception {
        for (int i=0;i<100000;i++) System.nanoTime();
        long[] values = new long[1000000];
        long last=System.nanoTime(), start=last;
        for (int i=0;i<values.length;i++) { long now=System.nanoTime(); values[i]=now-last; last=now; }
        long elapsed=last-start; Arrays.sort(values);
        long positive=0; int zeros=0; for(long d:values) { if(d==0) zeros++; else if(positive==0)positive=d; }
        long before=System.nanoTime(); String utc=Instant.now().toString(); long after=System.nanoTime();
        String json="{\"producer\":\"Standalone JVM21 on same host, after measurement campaign\",\"n\":"+values.length+
            ",\"elapsed_ns\":"+elapsed+",\"zero_deltas\":"+zeros+",\"min_positive_ns\":"+positive+
            ",\"median_ns\":"+values[values.length/2]+",\"p95_ns\":"+values[949999]+",\"max_ns\":"+values[values.length-1]+
            ",\"utc\":\""+utc+"\",\"utc_bracket_mono_ns\":["+before+","+after+"],\"absolute_accuracy_ns\":null}";
        Files.writeString(Path.of(args[0]),json+"\n");
        if(args.length>1) try(SocketChannel channel=SocketChannel.open(StandardProtocolFamily.UNIX)) {
            channel.connect(UnixDomainSocketAddress.of(args[1]));
            ByteBuffer request=ByteBuffer.allocate(1),response=ByteBuffer.allocate(8);
            while(true) {
                request.clear();if(channel.read(request)<0)break;
                long stamp=System.nanoTime();response.clear();response.putLong(stamp);response.flip();
                while(response.hasRemaining())channel.write(response);
            }
        }
    }
}
