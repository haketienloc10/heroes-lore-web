"""Build a read-only attach sidecar for selected in-memory trace records."""
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "reverse-engineering/scripts/RuntimeTraceSnapshot.java"
OUT = ROOT / "reference/recordings/scheduler-sidecars/runtime-trace-snapshot"
JAR = ROOT / "reference/recordings/scheduler-sidecars/runtime-trace-snapshot.jar"


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    subprocess.run(["javac", "--add-modules", "jdk.attach", "-d", str(OUT), str(SOURCE)], check=True)
    manifest = OUT / "MANIFEST.MF"
    manifest.write_text("Manifest-Version: 1.0\nAgent-Class: RuntimeTraceSnapshot\nMain-Class: RuntimeTraceSnapshot\n"
                        "Can-Redefine-Classes: false\nCan-Retransform-Classes: false\n\n")
    subprocess.run(["jar", "cfm", str(JAR), str(manifest), "-C", str(OUT), "RuntimeTraceSnapshot.class"], check=True)
    print(JAR)


if __name__ == "__main__":
    main()
