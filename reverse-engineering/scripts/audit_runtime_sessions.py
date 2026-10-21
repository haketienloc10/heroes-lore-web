"""Trích xuất evidence đã có; output là phân tích dẫn xuất, không phải runtime log.

Chạy từ repo: python3 reverse-engineering/scripts/audit_runtime_sessions.py
Không sửa các log/manifest nguồn và không suy timing game từ thời gian input.
"""
import csv
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'reverse-engineering/findings/evidence/milestone-1.5/runtime-20261021'


def identity(path):
    return {'path': str(path.relative_to(ROOT)), 'size': path.stat().st_size,
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}


def extract(rd):
    source = []
    inputs, captures, mappings, snapshots = [], [], [], []
    pending = None
    mapping = None
    requested = None
    previous_up = None
    for lineno, line in enumerate((rd / 'input.log').read_text().splitlines(), 1):
        stamp = re.match(r'(\S+) mono_ns=(\d+) (.*)', line)
        if not stamp:
            raise ValueError(f'{rd}: input line {lineno} not understood')
        utc, mono, message = stamp.groups()
        point = {'utc': utc, 'mono_ns': int(mono), 'source_line': lineno}
        if 'computed_emulator_mapping' in message:
            mapping = {'source_line': lineno, 'text': message}
            mappings.append(mapping)
        elif 'INJECT' in message:
            requested = int(re.search(r'hold_ms=(\d+)', message)[1])
        elif 'emulator_key_down' in message:
            if pending is not None:
                raise ValueError('Overlapping inputs require another parser')
            pending = {'key_awt': int(re.search(r'code=(\d+)', message)[1]),
                       'down': point, 'requested_hold_ms': requested,
                       'computed_mapping': mapping,
                       'gap_since_previous_up_ns': None if previous_up is None else int(mono) - previous_up}
        elif 'emulator_key_up' in message:
            if pending is None or pending['key_awt'] != int(re.search(r'code=(\d+)', message)[1]):
                raise ValueError('Unmatched key up')
            pending['up'] = point
            pending['listener_bracket_ns'] = int(mono) - pending['down']['mono_ns']
            inputs.append(pending)
            pending = None
            previous_up = int(mono)
    if pending is not None:
        raise ValueError('Unreleased input')
    for lineno, line in enumerate((rd / 'framebuffer.log').read_text().splitlines(), 1):
        m = re.match(r'(\S+) mono_ns=(\d+) emulator_frontbuffer_capture (.*?) (\d+)x(\d+);', line)
        if not m:
            raise ValueError(f'Unknown capture: {line}')
        utc, mono, name, width, height = m.groups()
        path = Path(name)
        captures.append({'utc': utc, 'mono_ns': int(mono), 'source_line': lineno,
                         **identity(path), 'width': int(width), 'height': int(height),
                         'availability': 'local, Git ignored'})
    for path in sorted(rd.glob('state*.log')):
        selected = [{'line': n, 'text': s} for n, s in enumerate(path.read_text().splitlines(), 1)
                    if any(t in s for t in ['effective_config=', 'emulator lcd', 'emulator limit',
                                           'emulator is', 'field m.e:', 'field q.g:', 'field q.h:'])]
        snapshots.append({'source': identity(path), 'selected_observations': selected})
    for name in ['input.log', 'framebuffer.log', 'launch.json', 'manifest.json']:
        source.append(identity(rd / name))
    return {'run_id': rd.name, 'sources': source,
            'launch': json.loads((rd / 'launch.json').read_text()),
            'inputs': inputs, 'captures': captures, 'state_snapshots': snapshots}


def main():
    sessions = []
    checks = []
    for repeat in ['02', '03', '04']:
        startup = BASE / f'M15-SCN-0001-P1M-R{repeat}'
        records = [extract(BASE / f'M15-SCN-{scenario}-P1M-R{repeat}')
                   for scenario in ['0001', '0002', '0005']]
        for record in records:
            manifest = json.loads((BASE / record['run_id'] / 'manifest.json').read_text())
            for entry in manifest['files'] + manifest.get('screenshots', []):
                path = ROOT / entry['path']
                actual = identity(path) if path.exists() else None
                checks.append({'run_id': record['run_id'], 'path': entry['path'],
                               'matches_saved_manifest': actual is not None and all(
                                   actual[k] == entry[k] for k in ['size', 'sha256'])})
        sessions.append({'session_id': startup.name, 'records': records,
                         'stop': json.loads((startup / 'stop.json').read_text()),
                         'storage_after_stop': json.loads((startup / 'storage-manifest.json').read_text()),
                         'storage_manifest_identity': identity(startup / 'storage-manifest.json'),
                         'initial_condition_assessment': {
                             'fresh_rms': 'declared in launch.json; no pre-launch byte snapshot',
                             'bed_anchor': {'02': '03-after-load.png', '03': '03-after-load.png',
                                            '04': '02-bed-start.png'}[repeat],
                             'rng_and_internal_state_equivalence': 'chưa xác minh',
                             'house_exit_replay': repeat == '04',
                             'variant': 'four-directions-inside' if repeat != '04' else 'two-Down-holds-exit'}})
    output = {'kind': 'derived analysis of saved evidence, NOT a new runtime recording',
              'producer': identity(Path(__file__).resolve()),
              'time_semantics': 'UTC and System.nanoTime preserved verbatim. Durations only subtract Java monotonic points within a process. Down is logged before KeyListener dispatch; up after dispatch, so listener_bracket_ns is not exact callback hold duration. Clock resolution, overhead, FPS, latency and callback ordering unmeasured. Do not subtract Python launch mono_ns from Java timestamps.',
              'sessions': sessions, 'saved_manifest_checks': checks,
              'conclusion': 'R02/R03/R04 are not three equivalent HOUSE-EXIT-001 replays; only R04 executed the exit path. Same declared fresh RMS/profile does not prove identical internal initialization or timing.'}
    (BASE / 'session-audit.json').write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
    with (BASE / 'session-inputs.csv').open('w', newline='') as stream:
        writer = csv.writer(stream)
        writer.writerow(['run_id', 'seq', 'awt', 'requested_hold_ms', 'down_utc', 'up_utc',
                         'down_mono_ns', 'up_mono_ns', 'listener_bracket_ns', 'gap_since_previous_up_ns'])
        for session in sessions:
            for record in session['records']:
                for n, item in enumerate(record['inputs'], 1):
                    writer.writerow([record['run_id'], n, item['key_awt'], item['requested_hold_ms'],
                                     item['down']['utc'], item['up']['utc'], item['down']['mono_ns'],
                                     item['up']['mono_ns'], item['listener_bracket_ns'],
                                     item['gap_since_previous_up_ns']])
    print(json.dumps({'sessions': len(sessions), 'input_pairs': sum(len(r['inputs']) for s in sessions for r in s['records']),
                      'manifest_entries_checked': len(checks), 'mismatches': [c for c in checks if not c['matches_saved_manifest']]}, ensure_ascii=False))


if __name__ == '__main__':
    main()
