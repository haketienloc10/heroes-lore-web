"""Sequential isolated runs, immutable snapshot verification, external timing.

Usage: python3 .../run_scheduler_verification.py trace tap 01
No overlapping emulator processes in this campaign. Review images before acceptance.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time

sys.dont_write_bytecode = True
from run_runtime_smoke import ROOT, EMULATOR, agent, tap, capture, write
from scheduler_xdamage import measure

EVIDENCE = ROOT/'reverse-engineering/findings/evidence/milestone-1.5/scheduler-20261021'
BUILD = ROOT/'reference/recordings/scheduler-probe-v3'


def proc_sample(pid):
    stat = Path(f'/proc/{pid}/stat').read_text().split(') ', 1)[1].split()
    return {'mono_ns': time.monotonic_ns(), 'utime_ticks': int(stat[11]), 'stime_ticks': int(stat[12]),
            'clock_ticks_per_second': os.sysconf('SC_CLK_TCK'),
            'status': Path(f'/proc/{pid}/status').read_text()}


def main():
    mode, case, repeat = sys.argv[1:]
    assert mode in ('baseline', 'trace') and case in ('tap', 'hold')
    EVIDENCE.mkdir(exist_ok=True)
    name = f'M15-SCN-0004-P1M-{mode}-{case}-R{repeat}'
    rd = EVIDENCE/name; rd.mkdir()
    snapshot_manifest = ROOT/'reverse-engineering/findings/evidence/milestone-1.5/runtime-20261021/M15-SCN-0006-P1M-R05L/HOUSE-INPUT-001-storage.json'
    meta = json.loads(snapshot_manifest.read_text())
    source = ROOT/'reference/recordings/snapshots/HOUSE-INPUT-001'
    work = ROOT/'reference/recordings'/name
    shutil.copytree(source, work)
    for item in meta['files']:
        path = work/item['relative_path']
        assert path.stat().st_size == item['size'] and hashlib.sha256(path.read_bytes()).hexdigest() == item['sha256']
    write(rd/'snapshot-before.json', {'source': str(snapshot_manifest.relative_to(ROOT)), 'verified': True, 'files': meta['files']})
    argv = ['java', '-Dfile.encoding=ISO_8859_1', '-Dsun.java2d.uiScale=1']
    if mode == 'trace': argv += [f'-javaagent:{BUILD}/probe.jar={rd}/trace.jsonl|{name}']
    argv += ['-jar', str(BUILD/'emulator-traced.jar' if mode=='trace' else EMULATOR),
             (BUILD/'game-traced.jar' if mode=='trace' else ROOT/'original/heroes-lore-v2.1.2.jar').as_uri(),
             '0', '240', '320', '2', '2', '60']
    with (rd/'console.log').open('w') as log:
        process = subprocess.Popen(argv, cwd=work, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    pid = process.pid
    write(rd/'launch.json', {'run_id': name, 'pid': pid, 'argv': argv, 'cwd': str(work),
          'utc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'mode': mode, 'case': case,
          'fixture': 'HOUSE-INPUT-001', 'synthetic_input': True, 'game_field_writes': False,
          'rng_controlled': False, 'baseline_has_method_hooks': False})
    def checkpoint(label):
        if process.poll() is not None: raise RuntimeError(f'Emulator exited: {process.returncode}')
        capture(pid, rd, label)
        if label in ('04-fixture','05-before-input'):
            tree=subprocess.check_output(['xwininfo','-root','-tree'],text=True)
            windows=re.findall(r'(0x[0-9a-f]+) "sun-awt-X11-XCanvasPeer"',tree)
            if len(windows)!=1: raise RuntimeError('Ambiguous X11 checkpoint')
            subprocess.run(['python3',str(ROOT/'reverse-engineering/scripts/runtime_x11.py'),str(rd/'checkpoint-x11.jsonl'),
                            'capture',windows[0],str(ROOT/'reference/screenshots'/name/f'{label}-X11.png')],check=True)
        print(name, label, flush=True)
    def window(label):
        time.sleep(5)
        tree = subprocess.check_output(['xwininfo', '-root', '-tree'], text=True)
        (rd/f'{label}-window-tree.txt').write_text(tree)
        candidates = re.findall(r'(0x[0-9a-f]+) "sun-awt-X11-XCanvasPeer"', tree)
        # Sequential campaign, no other emulator. Verify owning PID on top-level frame.
        frames = re.findall(r'(0x[0-9a-f]+) "FreeJ2ME-Plus"', tree)
        matching = [f for f in frames if f'= {pid}' in subprocess.check_output(['xprop', '-id', f, '_NET_WM_PID'], text=True)]
        if len(candidates) != 1 or len(matching) != 1: raise RuntimeError('Ambiguous emulator window')
        before = proc_sample(pid)
        measure(int(candidates[0],16), 30, rd/f'{label}-xdamage.json')
        after = proc_sample(pid)
        write(rd/f'{label}-process.json', {'before': before, 'after': after})
        print(name, label, '30s complete', flush=True)
    try:
        time.sleep(10)
        console = (rd/'console.log').read_text()
        if any(e in console for e in ('NoClassDefFoundError', 'VerifyError', 'IllegalAccessError')):
            raise RuntimeError('Instrumentation verification/linkage failed')
        checkpoint('01-startup')
        tap(pid, rd, 10, wait=1); checkpoint('02-menu')
        if case == 'tap': window('menu')
        tap(pid, rd, 10, wait=1); checkpoint('03-load-Ronin')
        tap(pid, rd, 10, wait=10); checkpoint('04-fixture')
        agent(pid, 'probe-current.jar', str(rd/'state-fixture.log'))
        window('gameplay')
        checkpoint('05-before-input')
        plan = rd/'input.plan'
        plan.write_text(f'wait 5000\ndown 102\nwait {20 if case=="tap" else 1000}\nup 102\nwait 5000\nframe 06-after-input\n')
        subprocess.run(['java', '--add-modules', 'jdk.attach', '-cp', '/tmp/heroes-lore-runtime-probe',
                        'RuntimeStateProbe', str(pid), '/tmp/heroes-lore-runtime-sequence/sequence-probe.jar',
                        f'{rd}|{plan}|{ROOT/"reference/screenshots"/name}'], check=True)
        agent(pid, 'probe-current.jar', str(rd/'state-final.log'))
    finally:
        process.terminate()
        try: process.wait(timeout=20)
        except subprocess.TimeoutExpired: process.kill(); process.wait(); raise
        write(rd/'stop.json', {'pid': pid, 'returncode': process.returncode,
              'utc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'proc_absent': not Path(f'/proc/{pid}').exists()})
        print(name, 'stopped', process.returncode, flush=True)


if __name__ == '__main__': main()
