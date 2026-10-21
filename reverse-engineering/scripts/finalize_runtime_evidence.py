"""Index/hash real local artifacts and derive input brackets; never emit runtime logs.

Run after every selected emulator process has stopped. Old run manifests are
preserved so session-audit.json retains its original source identities.
"""
import datetime
import hashlib
import json
from pathlib import Path
import re
import struct
import subprocess

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'reverse-engineering/findings/evidence/milestone-1.5/runtime-20261021'


def row(path):
    return {'path': str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path), 'size': path.stat().st_size,
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}


def dump(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')


def sequence(rd):
    events, mappings, presses = [], [], {}
    inputs = []
    for n, line in enumerate((rd / 'sequence-input.log').read_text().splitlines(), 1):
        match = re.match(r'(\S+) mono_ns=(\d+) (.*)', line)
        if not match:
            raise ValueError(line)
        utc, mono, message = match.groups()
        point = {'utc': utc, 'mono_ns': int(mono), 'line': n}
        events.append({**point, 'text': message})
        if 'computed_emulator_mapping' in message:
            mappings.append({**point, 'text': message})
        m = re.fullmatch(r'listener_dispatch_(begin|end) phase=(down|up) code=(\d+)', message)
        if not m:
            continue
        boundary, phase, key = m.groups()
        if phase == 'down' and boundary == 'begin':
            if key in presses:
                raise ValueError('Repeated down requires explicit analysis')
            presses[key] = {'awt': int(key)}
        presses[key][phase + '_' + boundary] = point
        if phase == 'up' and boundary == 'end':
            item = presses.pop(key)
            item['listener_hold_bounds_ns'] = [
                item['up_begin']['mono_ns'] - item['down_end']['mono_ns'],
                item['up_end']['mono_ns'] - item['down_begin']['mono_ns']]
            inputs.append(item)
    if presses:
        raise ValueError('Held input not released')
    return {'run_id': rd.name, 'source': row(rd / 'sequence-input.log'), 'events': events,
            'computed_mappings': mappings, 'inputs': inputs}


def main():
    names = ['M15-SCN-0001-P1M-R05', 'M15-SCN-0002-P1M-R05', 'M15-SCN-0003-P1M-R05',
             'M15-SCN-0006-P1M-R05', 'M15-SCN-0006-P1M-R05L']
    names += sorted(p.name for p in BASE.glob('M15-SCN-0003-P1M-*-R*') if p.is_dir())
    summaries, runs, external = [], [], []
    for name in names:
        rd = BASE / name
        launch = json.loads((rd / 'launch.json').read_text())
        if 'inherited_session' not in launch:
            stat = Path(f'/proc/{launch["pid"]}/stat')
            if stat.exists() and stat.read_text().split(') ', 1)[1].split()[0] != 'Z':
                raise RuntimeError(f'Process for {name} still alive')
        files = [row(p) for p in sorted(rd.rglob('*')) if p.is_file() and p.name != 'manifest.json']
        images = []
        for path in sorted((ROOT / 'reference/screenshots' / name).glob('*.png')):
            width, height = struct.unpack('>II', path.read_bytes()[16:24])
            images.append({**row(path), 'width': width, 'height': height,
                           'producer': 'emulator native frontbuffer via sidecar' if 'X11' not in path.name else 'XGetImage',
                           'availability': 'local, Git ignored', 'valid_for_behavior': True})
        dump(rd / 'manifest.json', {'run_id': name, 'control': 'synthetic emulator KeyListener',
             'scenario_result': 'runtime captured; partial, no callback/BCI/FPS verification',
             'launch': launch, 'files': files, 'screenshots': images})
        runs.append({'run_id': name, 'launch': row(rd / 'launch.json'), 'manifest': row(rd / 'manifest.json'),
                     'screenshot_count': len(images), 'physical_session': launch.get('inherited_session', name)})
        if (rd / 'sequence-input.log').exists():
            summaries.append(sequence(rd))
        for path in rd.glob('*.log'):
            for n, line in enumerate(path.read_text().splitlines(), 1):
                if 'AWT_KEY id=' in line:
                    external.append({'path': str(path.relative_to(ROOT)), 'line': n, 'text': line})
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    dump(BASE / 'input-case-analysis.json', {'kind': 'derived analysis, NOT runtime trace',
         'utc': now, 'cases': summaries,
         'time_semantics': 'Listener hold bounds bracket calls to emulator listeners. Not MIDlet callback durations or physical input latency. Logging/capture/clock resolution overhead unmeasured.',
         'fps': None, 'midlet_callback_ordering': 'chưa xác minh', 'full_internal_state_equivalence': 'chưa xác minh'})
    dump(BASE / 'continuation-runs.json', {'utc': now, 'producer': row(Path(__file__).resolve()),
         'runs': runs, 'case_count_by_variant': {v: sum(f'-{v}-R' in r['run_id'] for r in runs) for v in 'ABCDE'},
         'scenario_ids_observed_partially': ['SCN-0001', 'SCN-0002', 'SCN-0003', 'SCN-0005', 'SCN-0006'],
         'scenarios_fully_passed': 0, 'milestone_complete': False})
    old = json.loads((BASE / 'environment.json').read_text())
    game = row(ROOT / old['original']['path'])
    web_errors = [name for name, digest in old['web_sha256_before'].items()
                  if hashlib.sha256((ROOT / name).read_bytes()).hexdigest() != digest]
    errors = []
    count = 0
    for run in runs:
        manifest = json.loads((ROOT / run['manifest']['path']).read_text())
        for entry in manifest['files'] + manifest['screenshots']:
            count += 1
            if any(row(ROOT / entry['path'])[k] != entry[k] for k in ['size', 'sha256']):
                errors.append(entry['path'])
    dump(BASE / 'continuation-verification.json', {'utc': now, 'producer': 'local artifact validation, not mechanics test',
         'game': game, 'game_jar_unchanged': game['sha256'] == old['original']['sha256'],
         'emulator_jar_unchanged': row(Path(old['emulator']['path']))['sha256'] == old['emulator']['sha256'],
         'web_files_compared': len(old['web_sha256_before']), 'web_hash_errors': web_errors,
         'git_web_diff_empty': subprocess.check_output(['git', 'diff', '--', 'web'], cwd=ROOT) == b'',
         'manifest_entries_checked': count, 'manifest_errors': errors,
         'observed_external_awt_key_events': external, 'measured_fps': None,
         'callback_ordering_verified': False, 'milestone_complete': False})
    summary_files = ['session-audit.json', 'session-inputs.csv', 'continuation-environment.json',
                     'continuation-runs.json', 'input-case-analysis.json', 'review.json',
                     'continuation-verification.json']
    dump(BASE / 'continuation-manifest.json', {'kind': 'index of derived evidence and new run manifests',
         'utc': now, 'producer': row(Path(__file__).resolve()),
         'files': [row(BASE / name) for name in summary_files] + [r['manifest'] for r in runs],
         'note': 'Each run manifest hashes real raw logs/config/PNG artifacts. This index is not a runtime log.'})
    print(json.dumps({'runs': len(runs), 'input_cases': len(summaries), 'checked_entries': count,
                      'manifest_errors': errors, 'web_errors': web_errors, 'external_awt_events': len(external)}))


if __name__ == '__main__':
    main()
