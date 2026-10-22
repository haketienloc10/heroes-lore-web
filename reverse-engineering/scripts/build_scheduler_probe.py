"""Build offline instrumented copies; refuses to replace existing artifacts."""
import json
from pathlib import Path
import subprocess
import hashlib

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / 'reference/recordings/scheduler-probe-v3'
EMU = Path('/home/locdt/tools/freej2me-plus-v1.52/freej2me.jar')


def main():
    BUILD.mkdir()
    classes = BUILD / 'classes'; classes.mkdir()
    exports = ['--add-exports', 'java.base/jdk.internal.org.objectweb.asm=ALL-UNNAMED',
               '--add-exports', 'java.base/jdk.internal.org.objectweb.asm.tree=ALL-UNNAMED']
    src = ROOT / 'reverse-engineering/scripts'
    subprocess.run(['javac', *exports, '-d', str(classes), str(src/'SchedulerInstrumenter.java'), str(src/'TraceProbe.java')], check=True)
    mf = BUILD/'PROBE.MF'; mf.write_text('Manifest-Version: 1.0\nPremain-Class: org.recompile.hlprobe.TraceProbe\n\n')
    subprocess.run(['jar', 'cfm', str(BUILD/'probe.jar'), str(mf), '-C', str(classes), 'org/recompile/hlprobe'], check=True)
    with (BUILD/'transform.log').open('w') as log:
        for source, target in [(ROOT/'original/heroes-lore-v2.1.2.jar', BUILD/'game-traced.jar'), (EMU, BUILD/'emulator-traced.jar')]:
            subprocess.run(['java', *exports, '-cp', str(classes), 'SchedulerInstrumenter', str(source), str(target)], stdout=log, check=True)
    paths = [ROOT/'original/heroes-lore-v2.1.2.jar', EMU, *BUILD.glob('*.jar'), *src.glob('*Scheduler*.java'), src/'TraceProbe.java']
    manifest = [{'path': str(p), 'size': p.stat().st_size, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in paths]
    (BUILD/'build-manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')


if __name__ == '__main__': main()
