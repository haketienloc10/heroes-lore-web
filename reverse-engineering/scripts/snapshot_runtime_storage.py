"""Copy storage only after the recorded process has stopped; binaries remain local.

python3 reverse-engineering/scripts/snapshot_runtime_storage.py SESSION SNAPSHOT
"""
import datetime
import hashlib
import json
from pathlib import Path
import shutil
import sys

sys.dont_write_bytecode = True
from run_runtime_smoke import EVIDENCE, ROOT, write


def main():
    session, name = sys.argv[1:]
    rd = EVIDENCE / session
    launch = json.loads((rd / 'launch.json').read_text())
    stat = Path(f'/proc/{launch["pid"]}/stat')
    proc_state = stat.read_text().split(') ', 1)[1].split()[0] if stat.exists() else 'absent'
    if proc_state not in ['absent', 'Z']:
        raise RuntimeError('Process is still alive; no quiescent snapshot')
    work = Path(launch['cwd'])
    target = ROOT / 'reference/recordings/snapshots' / name
    if target.exists():
        raise FileExistsError(target)
    shutil.copytree(work, target)
    entries = []
    for path in sorted(target.rglob('*')):
        if not path.is_file():
            continue
        entries.append({'relative_path': str(path.relative_to(target)), 'size': path.stat().st_size,
                        'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
        if path.suffix in ['.conf', '.log']:
            dest = rd / 'artifacts' / path.relative_to(target)
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, dest)
    write(rd / f'{name}-storage.json', {'kind': 'quiescent storage copy, not save schema validation',
          'utc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'session_id': session,
          'pid': launch['pid'], 'proc_state_at_copy': proc_state, 'source_cwd': str(work),
          'local_snapshot': str(target.relative_to(ROOT)), 'files': entries})
    print(target)


if __name__ == '__main__':
    main()
