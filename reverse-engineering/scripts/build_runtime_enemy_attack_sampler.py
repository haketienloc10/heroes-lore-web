"""Build a read-only bounded source-enemy attack-state sampler sidecar."""
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "reverse-engineering/scripts/RuntimeEnemyAttackSampler.java"
OUT = ROOT / "reference/recordings/runtime-enemy-attack-sampler"
JAR = ROOT / "reference/recordings/runtime-enemy-attack-sampler.jar"


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    subprocess.run(["javac", "--add-modules", "jdk.attach", "-d", str(OUT), str(SOURCE)], check=True)
    manifest = OUT / "MANIFEST.MF"
    manifest.write_text(
        "Manifest-Version: 1.0\nAgent-Class: RuntimeEnemyAttackSampler\nMain-Class: RuntimeEnemyAttackSampler\n"
        "Can-Redefine-Classes: false\nCan-Retransform-Classes: false\n\n"
    )
    subprocess.run(["jar", "cfm", str(JAR), str(manifest), "-C", str(OUT), "RuntimeEnemyAttackSampler.class"], check=True)
    print(JAR)


if __name__ == "__main__":
    main()
