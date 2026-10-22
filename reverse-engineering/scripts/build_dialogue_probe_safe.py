"""Build an isolated two-method dialogue probe with no reflective game-state reads."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "reference/recordings/scheduler-probe-followup-20261022-dialogue-r2"
GAME = ROOT / "original/heroes-lore-v2.1.2.jar"
EMU = Path("/home/locdt/tools/freej2me-plus-v1.52/freej2me.jar")
EXPECTED_GAME = "7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61"
EXPECTED_EMU = "92f84012958f2ca0692dbe7d258cea7aebd4e96f664445d8e92dd0297e12df0e"
INSTRUMENTER = ROOT / "reverse-engineering/scripts/DialogueInstrumenter.java"
PROBE = ROOT / "reverse-engineering/scripts/DialogueTraceProbe.java"


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def record(path):
    return {"path": str(path), "size": path.stat().st_size, "sha256": sha256(path)}


def main():
    if sha256(GAME) != EXPECTED_GAME or sha256(EMU) != EXPECTED_EMU:
        raise RuntimeError("Original game/emulator identity mismatch")
    BUILD.mkdir(parents=True, exist_ok=False)
    classes = BUILD / "classes"
    classes.mkdir()
    exports = ["--add-exports", "java.base/jdk.internal.org.objectweb.asm=ALL-UNNAMED",
               "--add-exports", "java.base/jdk.internal.org.objectweb.asm.tree=ALL-UNNAMED"]
    subprocess.run(["javac", *exports, "-d", str(classes), str(INSTRUMENTER), str(PROBE)], check=True)
    manifest = BUILD / "PROBE.MF"
    manifest.write_text("Manifest-Version: 1.0\nPremain-Class: org.recompile.hlprobe.DialogueTraceProbe\n\n")
    agent = BUILD / "probe-dialogue-safe.jar"
    subprocess.run(["jar", "cfm", str(agent), str(manifest), "-C", str(classes), "org/recompile/hlprobe"], check=True)
    transform_log = BUILD / "transform.log"
    with transform_log.open("w") as log:
        for source, target in [(GAME, BUILD / "game-traced.jar"), (EMU, BUILD / "emulator-traced.jar")]:
            subprocess.run(["java", *exports, "-cp", str(classes), "DialogueInstrumenter",
                            str(source), str(target)], stdout=log, check=True)
    transformed = transform_log.read_text()
    for target in ("ar.keyPressed(I)V", "ag.a(II)V"):
        if target not in transformed:
            raise RuntimeError(f"Transform did not find {target}")
    inputs = [GAME, EMU, INSTRUMENTER, PROBE, agent,
              BUILD / "game-traced.jar", BUILD / "emulator-traced.jar", transform_log]
    (BUILD / "build-manifest.json").write_text(json.dumps([record(path) for path in inputs], indent=2) + "\n")
    print(json.dumps({"build": str(BUILD.relative_to(ROOT)), "targets": ["ar.keyPressed(I)V", "ag.a(II)V"],
                      "reflection": False, "game_sha256": sha256(BUILD / "game-traced.jar"),
                      "emulator_sha256": sha256(BUILD / "emulator-traced.jar"),
                      "agent_sha256": sha256(agent)}, indent=2))


if __name__ == "__main__":
    main()
