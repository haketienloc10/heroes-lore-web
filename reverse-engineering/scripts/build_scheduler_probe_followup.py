"""Build a separate follow-up probe for SCN-0004; never overwrites prior artifacts."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "reference/recordings/scheduler-probe-followup-20261022-r6"
GAME = ROOT / "original/heroes-lore-v2.1.2.jar"
EMU = Path("/home/locdt/tools/freej2me-plus-v1.52/freej2me.jar")


def digest(path):
    data = path.read_bytes()
    return {"path": str(path), "size": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def main():
    if hashlib.sha256(GAME.read_bytes()).hexdigest() != "7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61":
        raise RuntimeError("Game JAR identity mismatch")
    if hashlib.sha256(EMU.read_bytes()).hexdigest() != "92f84012958f2ca0692dbe7d258cea7aebd4e96f664445d8e92dd0297e12df0e":
        raise RuntimeError("FreeJ2ME JAR identity mismatch")
    BUILD.mkdir()
    classes = BUILD / "classes"
    classes.mkdir()
    exports = ["--add-exports", "java.base/jdk.internal.org.objectweb.asm=ALL-UNNAMED",
               "--add-exports", "java.base/jdk.internal.org.objectweb.asm.tree=ALL-UNNAMED"]
    src = ROOT / "reverse-engineering/scripts"
    sources = [src / "SchedulerInstrumenterFollowup.java", src / "TraceProbeFollowup.java"]
    subprocess.run(["javac", *exports, "-d", str(classes), *map(str, sources)], check=True)
    manifest = BUILD / "PROBE.MF"
    manifest.write_text("Manifest-Version: 1.0\nPremain-Class: org.recompile.hlprobe.TraceProbeFollowup\n\n")
    subprocess.run(["jar", "cfm", str(BUILD / "probe.jar"), str(manifest), "-C", str(classes), "org/recompile/hlprobe"], check=True)
    with (BUILD / "transform.log").open("w") as log:
        for source, target in [(GAME, BUILD / "game-traced.jar"), (EMU, BUILD / "emulator-traced.jar")]:
            subprocess.run(["java", *exports, "-cp", str(classes), "SchedulerInstrumenterFollowup", str(source), str(target)], stdout=log, check=True)
    files = [GAME, EMU, BUILD / "probe.jar", BUILD / "game-traced.jar", BUILD / "emulator-traced.jar", *sources]
    (BUILD / "build-manifest.json").write_text(json.dumps([digest(p) for p in files], indent=2) + "\n")


if __name__ == "__main__":
    main()
