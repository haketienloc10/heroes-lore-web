"""Build a separate SCN-0004 probe that also records ag.a(II)V invocations."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "reference/recordings/scheduler-probe-followup-20261022-dialogue-r1"
GAME = ROOT / "original/heroes-lore-v2.1.2.jar"
EMU = Path("/home/locdt/tools/freej2me-plus-v1.52/freej2me.jar")
BASE_INSTRUMENTER = ROOT / "reverse-engineering/scripts/SchedulerInstrumenterFollowup.java"
TRACE_PROBE = ROOT / "reverse-engineering/scripts/TraceProbeFollowup.java"
EXPECTED_GAME = "7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61"
EXPECTED_EMU = "92f84012958f2ca0692dbe7d258cea7aebd4e96f664445d8e92dd0297e12df0e"


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def file_record(path):
    return {"path": str(path), "size": path.stat().st_size, "sha256": sha256(path)}


def main():
    if sha256(GAME) != EXPECTED_GAME:
        raise RuntimeError("Original game JAR identity mismatch")
    if sha256(EMU) != EXPECTED_EMU:
        raise RuntimeError("Original FreeJ2ME JAR identity mismatch")
    BUILD.mkdir(parents=True, exist_ok=False)
    instrumenter = BASE_INSTRUMENTER.read_text()
    instrumenter = instrumenter.replace(
        "public class SchedulerInstrumenterFollowup implements Opcodes",
        "public class SchedulerInstrumenterDialogue implements Opcodes",
        1,
    )
    anchor = '"ad.a(Ljavax/microedition/lcdui/Graphics;)V", "ar.keyPressed(I)V", "ar.keyReleased(I)V",'
    replacement = anchor + '\n        "ag.a(II)V",'
    if anchor not in instrumenter:
        raise RuntimeError("Expected target-list anchor not found")
    instrumenter = instrumenter.replace(anchor, replacement, 1)
    if instrumenter.count('"ag.a(II)V"') != 1:
        raise RuntimeError("Dialogue handler target was not inserted exactly once")
    generated = BUILD / "SchedulerInstrumenterDialogue.java"
    generated.write_text(instrumenter)

    classes = BUILD / "classes"
    classes.mkdir()
    exports = ["--add-exports", "java.base/jdk.internal.org.objectweb.asm=ALL-UNNAMED",
               "--add-exports", "java.base/jdk.internal.org.objectweb.asm.tree=ALL-UNNAMED"]
    subprocess.run(["javac", *exports, "-d", str(classes), str(generated), str(TRACE_PROBE)], check=True)
    manifest = BUILD / "PROBE.MF"
    manifest.write_text("Manifest-Version: 1.0\nPremain-Class: org.recompile.hlprobe.TraceProbeFollowup\n\n")
    probe = BUILD / "probe-dialogue.jar"
    subprocess.run(["jar", "cfm", str(probe), str(manifest), "-C", str(classes), "org/recompile/hlprobe"], check=True)
    transform_log = BUILD / "transform.log"
    with transform_log.open("w") as out:
        for source, target in [(GAME, BUILD / "game-traced.jar"), (EMU, BUILD / "emulator-traced.jar")]:
            subprocess.run(["java", *exports, "-cp", str(classes), "SchedulerInstrumenterDialogue", str(source), str(target)], stdout=out, check=True)
    transformed = transform_log.read_text()
    if "ag.a(II)V" not in transformed:
        raise RuntimeError("Transform log does not confirm ag.a(II)V instrumentation")
    inputs = [GAME, EMU, BASE_INSTRUMENTER, TRACE_PROBE, generated, probe,
              BUILD / "game-traced.jar", BUILD / "emulator-traced.jar", transform_log]
    (BUILD / "build-manifest.json").write_text(json.dumps([file_record(p) for p in inputs], indent=2) + "\n")
    print(json.dumps({"build": str(BUILD.relative_to(ROOT)), "target": "ag.a(II)V",
                      "game_sha256": sha256(BUILD / "game-traced.jar"),
                      "emulator_sha256": sha256(BUILD / "emulator-traced.jar"),
                      "probe_sha256": sha256(probe)}, indent=2))


if __name__ == "__main__":
    main()
