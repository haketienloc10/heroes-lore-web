"""One SCN-0003 case from an immutable stopped-process snapshot.

python3 reverse-engineering/scripts/run_runtime_input_case.py B 01 HOUSE-INPUT-001
Always review load/checkpoint and result images before accepting behavior.
"""
import json
import subprocess
import sys

sys.dont_write_bytecode = True
from run_runtime_smoke import EVIDENCE, ROOT, tap, capture, agent, write


def main():
    variant, repeat, snapshot = sys.argv[1:]
    if variant not in 'ABCDE' or len(variant) != 1:
        raise ValueError(variant)
    name = f'M15-SCN-0003-P1M-{variant}-R{repeat}'
    scripts = ROOT / 'reverse-engineering/scripts'
    subprocess.run([sys.executable, str(scripts / 'start_runtime_from_snapshot.py'), name, snapshot], check=True)
    rd = EVIDENCE / name
    pid = json.loads((rd / 'launch.json').read_text())['pid']
    # This snapshot starts with Load Game selected. No Down from this menu.
    tap(pid, rd, 10, wait=1)
    capture(pid, rd, '02-menu')
    tap(pid, rd, 10, wait=1)
    capture(pid, rd, '03-load-Ronin')
    tap(pid, rd, 10, wait=10)
    capture(pid, rd, '04-restored-fixture')
    agent(pid, 'probe-current.jar', str(rd / 'state-fixture.log'))
    subprocess.run([sys.executable, str(scripts / 'run_runtime_sequence.py'), name, name,
                    str(ROOT / f'reference/scenarios/fixtures/input-{variant}.plan')], check=True)
    agent(pid, 'probe-current.jar', str(rd / 'state-final.log'))
    subprocess.run([sys.executable, str(scripts / 'stop_runtime_session.py'), name], check=True)
    write(rd / 'review-required.json', {'variant': variant, 'repeat': repeat,
          'status': 'recorded; UI and mapping require review; no MIDlet callback trace',
          'fixture': snapshot, 'game_state_writes': False, 'measured_fps': None})
    print(name, flush=True)


if __name__ == '__main__':
    main()
