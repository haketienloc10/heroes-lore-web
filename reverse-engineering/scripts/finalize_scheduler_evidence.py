"""Keep large raw traces local, produce size/SHA256 manifests, verify retained data."""
import datetime
import gzip
import hashlib
import json
from pathlib import Path
import shutil
import sys

sys.dont_write_bytecode=True
from analyze_scheduler_trace import ROOT,E


def item(path):
    return {'path':str(path.relative_to(ROOT)),'size':path.stat().st_size,
            'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}


def main():
    for rd in sorted(E.iterdir()):
        if not rd.is_dir():continue
        if rd.name.startswith('M15-SCN-0004-'):
            assert (rd/'stop.json').exists() and json.loads((rd/'stop.json').read_text())['proc_absent']
            work=ROOT/'reference/recordings'/rd.name
        elif rd.name.startswith('PILOT-'):
            work=ROOT/'reference/recordings'/('SCN0004-'+rd.name)
        elif rd.name.startswith('ABORTED-'):
            work=ROOT/'reference/recordings'/('SCN0004-'+rd.name)
        else:continue
        work.mkdir(exist_ok=True)
        raw=rd/'trace.jsonl';local=work/'trace.jsonl'
        if raw.exists():
            assert not local.exists();before=item(raw)
            shutil.move(raw,local)
            assert item(local)['sha256']==before['sha256']
        if local.exists():
            compressed=work/'trace.jsonl.gz'
            if not compressed.exists():
                with local.open('rb') as source,compressed.open('wb') as out:
                    with gzip.GzipFile(fileobj=out,mode='wb',filename='',mtime=0) as gz:shutil.copyfileobj(source,gz)
            with gzip.open(compressed,'rb') as f:assert hashlib.sha256(f.read()).hexdigest()==item(local)['sha256']
            (rd/'trace-retention.json').write_text(json.dumps({'producer':'lossless archival of measured trace',
                'raw':item(local),'gzip':item(compressed),'decompressed_sha256_verified':True},indent=2)+'\n')
        images=ROOT/'reference/screenshots'/(rd.name if rd.name.startswith('M15-') else 'SCN0004-'+rd.name)
        evidence=[item(p) for p in sorted(rd.rglob('*')) if p.is_file() and p.name!='manifest.json']
        artifacts=[item(p) for root in [work,images] if root.exists() for p in sorted(root.rglob('*')) if p.is_file()]
        (rd/'manifest.json').write_text(json.dumps({'run_id':rd.name,'evidence':evidence,'local_only_artifacts':artifacts},indent=2)+'\n')
    # Hash source/sidecar artifacts too; full logs and binaries remain local.
    source_names=['SchedulerInstrumenter.java','TraceProbe.java','SchedulerBytecodeAudit.java','SchedulerClockCalibration.java',
        'build_scheduler_probe.py','run_scheduler_verification.py','analyze_scheduler_trace.py','summarize_scheduler.py',
        'scheduler_xdamage.py','verify_scheduler_copies.py','calibrate_scheduler_clocks.py','finalize_scheduler_evidence.py',
        'RuntimeStateProbe.java','RuntimeSequenceProbe.java','RuntimeFramebufferProbe.java','run_runtime_smoke.py','runtime_x11.py']
    sources=[item(ROOT/'reverse-engineering/scripts'/n) for n in source_names]
    binaries=[item(p) for root in [ROOT/'reference/recordings/scheduler-probe-v3',Path('/tmp/heroes-lore-runtime-probe'),Path('/tmp/heroes-lore-runtime-sequence')]
        for p in sorted(root.rglob('*')) if p.is_file() and p.suffix in ['.jar','.class'] and p.is_relative_to(ROOT)]
    external=[]
    retained_sidecars=ROOT/'reference/recordings/scheduler-sidecars'
    retained_sidecars.mkdir(exist_ok=True)
    for root in [Path('/tmp/heroes-lore-runtime-probe'),Path('/tmp/heroes-lore-runtime-sequence')]:
        for p in sorted(root.glob('*')):
            if p.name not in ['probe-current.jar','frame-probe.jar','sequence-probe.jar','RuntimeStateProbe.class']:continue
            target=retained_sidecars/p.name
            if not target.exists():shutil.copyfile(p,target)
            assert p.read_bytes()==target.read_bytes()
            external.append({'original_path':str(p),'retained':item(target)})
    (E/'harness.json').write_text(json.dumps({'sources':sources,'local_binaries':binaries,'existing_attach_sidecars':external,
        'sidecar_rebuild':'javac --add-modules jdk.attach -d <sidecar-dir> reverse-engineering/scripts/RuntimeStateProbe.java reverse-engineering/scripts/RuntimeFramebufferProbe.java reverse-engineering/scripts/RuntimeSequenceProbe.java; jar cfm <agent.jar> <manifest with Agent-Class> -C <sidecar-dir> .',
        'sidecar_agent_classes':{'probe-current.jar':'RuntimeStateProbe','frame-probe.jar':'RuntimeFramebufferProbe','sequence-probe.jar':'RuntimeSequenceProbe'},
        'runtime_game_field_writes':False},indent=2)+'\n')
    paths=[p for p in sorted(E.rglob('*')) if p.is_file() and p!=E/'manifest.json']
    paths += [ROOT/'reverse-engineering/findings/FND-0004-runtime-scheduler.md',ROOT/'reference/scenarios/SCN-0004-game-loop.md']
    (E/'manifest.json').write_text(json.dumps({'producer':'Python hashlib, metadata only',
        'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'files':[item(p) for p in paths]},indent=2)+'\n')
    print('Manifests written; raw traces retained local with verified gzip copies')


if __name__=='__main__':main()
