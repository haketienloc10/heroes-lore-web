"""Same-host standalone Java/Python monotonic handshake after the campaign.

Does not establish absolute accuracy or drift over earlier runs.
"""
import json
from pathlib import Path
import socket
import struct
import subprocess
import tempfile
import time

ROOT=Path(__file__).resolve().parents[2]
E=ROOT/'reverse-engineering/findings/evidence/milestone-1.5/scheduler-20261021'


def main():
    with tempfile.TemporaryDirectory(prefix='hl-clock-') as temp:
        subprocess.run(['javac','-d',temp,str(ROOT/'reverse-engineering/scripts/SchedulerClockCalibration.java')],check=True)
        endpoint=str(Path(temp)/'clock.sock')
        with socket.socket(socket.AF_UNIX) as server:
            server.bind(endpoint);server.listen(1);server.settimeout(15)
            child=subprocess.Popen(['java','-cp',temp,'SchedulerClockCalibration',str(E/'host-clock-calibration.json'),endpoint])
            rows=[]
            with server.accept()[0] as connection:
                for i in range(100):
                    before=time.monotonic_ns();connection.sendall(b'1');data=b''
                    while len(data)<8:data+=connection.recv(8-len(data))
                    after=time.monotonic_ns();stamp=struct.unpack('>q',data)[0]
                    rows.append({'seq':i+1,'python_before_ns':before,'java_ns':stamp,'python_after_ns':after,
                        'rtt_ns':after-before,'java_minus_python_offset_bounds_ns':[stamp-after,stamp-before]})
            child.wait(timeout=10);assert child.returncode==0
        best=min(rows,key=lambda r:r['rtt_ns'])
        (E/'clock-handshake.json').write_text(json.dumps({'producer':'Standalone Java21/Python on same host after runs',
            'n':len(rows),'best_rtt_sample':best,'samples':rows,'drift_over_campaign_measured':False,
            'absolute_accuracy_ns':None},indent=2)+'\n')


if __name__=='__main__':main()
