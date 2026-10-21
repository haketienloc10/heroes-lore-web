"""Launch a new process from a quiescent storage copy; stop at startup checkpoint.

python3 reverse-engineering/scripts/start_runtime_from_snapshot.py RUN SNAPSHOT
"""
import datetime
import json
import shutil
import subprocess
import sys
import time

sys.dont_write_bytecode = True
from run_runtime_smoke import EVIDENCE, ROOT, EMULATOR, write, capture, agent


def main():
    name, snapshot = sys.argv[1:]
    source = ROOT / 'reference/recordings/snapshots' / snapshot
    manifests = list(EVIDENCE.glob(f'*/{snapshot}-storage.json'))
    if len(manifests) != 1:
        raise RuntimeError('Require exactly one stopped-process snapshot manifest')
    meta = json.loads(manifests[0].read_text())
    import hashlib
    for entry in meta['files']:
        path = source / entry['relative_path']
        if path.stat().st_size != entry['size'] or hashlib.sha256(path.read_bytes()).hexdigest() != entry['sha256']:
            raise RuntimeError(f'Snapshot mismatch: {path}')
    rd = EVIDENCE / name
    rd.mkdir()
    work = ROOT / 'reference/recordings' / name
    if work.exists():
        raise FileExistsError(work)
    shutil.copytree(source, work)
    argv = ['java', '-Dfile.encoding=ISO_8859_1', '-Dsun.java2d.uiScale=1', '-jar', str(EMULATOR),
            (ROOT / 'original/heroes-lore-v2.1.2.jar').as_uri(), '0', '240', '320', '2', '2', '60']
    with (rd / 'console.log').open('w') as log:
        process = subprocess.Popen(argv, cwd=work, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    write(rd / 'launch.json', {'run_id': name, 'pid': process.pid, 'argv': argv, 'cwd': str(work),
          'utc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'profile': 'P1M',
          'snapshot_source': str(manifests[0].relative_to(ROOT)), 'previous_pid': meta['pid'],
          'previous_proc_state_at_copy': meta['proc_state_at_copy'],
          'input_method': 'synthetic emulator KeyListener; no game state writes'})
    time.sleep(10)
    capture(process.pid, rd, '01-cold-startup')
    agent(process.pid, 'probe-current.jar', str(rd / 'state-startup.log'))
    print(json.dumps({'run_id': name, 'pid': process.pid}))


if __name__ == '__main__':
    main()
