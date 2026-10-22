"""Build the read-only SCN-0004 runtime field snapshot sidecar."""
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "reverse-engineering/scripts/RuntimeFlagSnapshot.java"
OUT = ROOT / "reference/recordings/scheduler-sidecars/runtime-flag-snapshot"
JAR = ROOT / "reference/recordings/scheduler-sidecars/runtime-flag-snapshot.jar"


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    subprocess.run(["javac", "--add-modules", "jdk.attach", "-d", str(OUT), str(SOURCE)], check=True)
    manifest = OUT / "MANIFEST.MF"
    manifest.write_text(
        "Manifest-Version: 1.0\n"
        "Agent-Class: RuntimeFlagSnapshot\n"
        "Main-Class: RuntimeFlagSnapshot\n"
        "Can-Redefine-Classes: false\n"
        "Can-Retransform-Classes: false\n\n"
    )
    subprocess.run(["jar", "cfm", str(JAR), str(manifest), "-C", str(OUT), "RuntimeFlagSnapshot.class"], check=True)
    print(JAR)


if __name__ == "__main__":
    main()
