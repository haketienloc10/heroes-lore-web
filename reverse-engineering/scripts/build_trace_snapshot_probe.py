"""Build the read-only live trace snapshot attach agent for SCN-0004 scouts."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "reverse-engineering/scripts/TraceSnapshotProbe.java"
BUILD = ROOT / "reference/recordings/scheduler-sidecars/trace-snapshot-build"
TARGET = ROOT / "reference/recordings/scheduler-sidecars/trace-snapshot-probe.jar"


def main():
    if BUILD.exists():
        shutil.rmtree(BUILD)
    BUILD.mkdir(parents=True)
    subprocess.run(["javac", "--add-modules", "jdk.attach", "-d", str(BUILD), str(SOURCE)], check=True)
    manifest = BUILD / "AGENT.MF"
    manifest.write_text("Manifest-Version: 1.0\nAgent-Class: TraceSnapshotProbe\nCan-Retransform-Classes: false\n\n")
    subprocess.run(["jar", "cfm", str(TARGET), str(manifest), "-C", str(BUILD), "TraceSnapshotProbe.class"], check=True)
    data = TARGET.read_bytes()
    print(json.dumps({"agent": str(TARGET.relative_to(ROOT)), "size": len(data),
                      "sha256": hashlib.sha256(data).hexdigest()}))


if __name__ == "__main__":
    main()
