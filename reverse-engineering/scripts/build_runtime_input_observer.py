"""Build the passive AWT input observer sidecar used in a manual runtime run."""
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "reverse-engineering/scripts/RuntimeInputObserver.java"
OUT = ROOT / "reference/recordings/scheduler-sidecars/manual-input-observer"
JAR = ROOT / "reference/recordings/scheduler-sidecars/manual-input-observer.jar"


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    subprocess.run(["javac", "--add-modules", "jdk.attach", "-d", str(OUT), str(SOURCE)], check=True)
    manifest = OUT / "MANIFEST.MF"
    manifest.write_text(
        "Manifest-Version: 1.0\n"
        "Agent-Class: RuntimeInputObserver\n"
        "Main-Class: RuntimeInputObserver\n"
        "Can-Redefine-Classes: false\n"
        "Can-Retransform-Classes: false\n\n"
    )
    subprocess.run(["jar", "cfm", str(JAR), str(manifest), "-C", str(OUT), "RuntimeInputObserver.class"], check=True)
    print(JAR)


if __name__ == "__main__":
    main()
