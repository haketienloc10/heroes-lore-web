"""Phát một plan đã lưu qua sequence sidecar; không tạo log runtime bằng Python.

python3 reverse-engineering/scripts/run_runtime_sequence.py SESSION RUN PLAN
PLAN: file văn bản down/up <AWT>, wait <ms>, frame <name>, hoặc comment #.
RUN phải là directory evidence đã tạo với launch.json và cùng PID session.
"""
import json
from pathlib import Path
import shutil
import subprocess
import sys

sys.dont_write_bytecode = True
from run_runtime_smoke import EVIDENCE, ROOT, PROBE, EMULATOR


def main():
    session, run, plan = sys.argv[1:]
    launch = json.loads((EVIDENCE / session / 'launch.json').read_text())
    pid = launch['pid']
    if str(EMULATOR).encode() not in Path(f'/proc/{pid}/cmdline').read_bytes().split(b'\0'):
        raise RuntimeError('PID no longer matches emulator')
    if Path(f'/proc/{pid}/cwd').resolve() != Path(launch['cwd']):
        raise RuntimeError('Cwd mismatch')
    rd = EVIDENCE / run
    retained = rd / Path(plan).name
    if retained.exists():
        raise FileExistsError(retained)
    shutil.copyfile(plan, retained)
    subprocess.run(['java', '--add-modules', 'jdk.attach', '-cp', str(PROBE),
                    'RuntimeStateProbe', str(pid), '/tmp/heroes-lore-runtime-sequence/sequence-probe.jar',
                    f'{rd}|{retained}|{ROOT / "reference/screenshots" / run}'], check=True)


if __name__ == '__main__':
    main()
