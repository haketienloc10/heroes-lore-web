"""Build an isolated probe that queues Right Soft after the game stores state 4."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "reference/recordings/scheduler-probe-followup-20261023-bypass-state-trigger-r1"
GAME = ROOT / "original/heroes-lore-v2.1.2.jar"
EMU = Path("/home/locdt/tools/freej2me-plus-v1.52/freej2me.jar")
EXPECTED_GAME = "7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61"
EXPECTED_EMU = "92f84012958f2ca0692dbe7d258cea7aebd4e96f664445d8e92dd0297e12df0e"
INSTRUMENTER = ROOT / "reverse-engineering/scripts/StateTriggeredBypassInstrumenter.java"
PROBE = ROOT / "reverse-engineering/scripts/StateTriggeredBypassTraceProbe.java"


def digest(path):
    return {"path": str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path),
            "size": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def main():
    if hashlib.sha256(GAME.read_bytes()).hexdigest() != EXPECTED_GAME:
        raise RuntimeError("Original game JAR identity mismatch")
    if hashlib.sha256(EMU.read_bytes()).hexdigest() != EXPECTED_EMU:
        raise RuntimeError("Original emulator JAR identity mismatch")
    BUILD.mkdir(parents=True, exist_ok=False)
    classes = BUILD / "classes"
    classes.mkdir()
    exports = ["--add-exports", "java.base/jdk.internal.org.objectweb.asm=ALL-UNNAMED",
               "--add-exports", "java.base/jdk.internal.org.objectweb.asm.tree=ALL-UNNAMED"]
    subprocess.run(["javac", *exports, "-d", str(classes), str(INSTRUMENTER), str(PROBE)], check=True)
    manifest = BUILD / "PROBE.MF"
    manifest.write_text("Manifest-Version: 1.0\nPremain-Class: org.recompile.hlprobe.StateTriggeredBypassTraceProbe\n\n")
    agent = BUILD / "probe-state-triggered.jar"
    subprocess.run(["jar", "cfm", str(agent), str(manifest), "-C", str(classes),
                    "org/recompile/hlprobe"], check=True)
    traced_game = BUILD / "game-state-triggered.jar"
    transform_log = BUILD / "transform.log"
    with transform_log.open("w") as log:
        subprocess.run(["java", *exports, "-cp", str(classes), "StateTriggeredBypassInstrumenter",
                        str(GAME), str(traced_game)], stdout=log, check=True)
    transformed = transform_log.read_text()
    targets = ("m.a(I)V state store hooked after original PUTSTATIC m.e:I",
               "ar.keyPressed m.e:I switch operand hooked", "br.b ag.a:Z IFNE operand hooked",
               "ag.a(II)V", "br.a(JJ)V")
    for target in targets:
        if target not in transformed:
            raise RuntimeError(f"Transform did not confirm {target}")
    inputs = [GAME, EMU, INSTRUMENTER, PROBE,
              ROOT / "reverse-engineering/scripts/build_state_triggered_bypass_probe.py",
              agent, traced_game, transform_log]
    (BUILD / "build-manifest.json").write_text(json.dumps([digest(p) for p in inputs], indent=2) + "\n")
    print(json.dumps({"build": str(BUILD.relative_to(ROOT)), "agent": digest(agent),
                      "traced_game": digest(traced_game), "targets": list(targets),
                      "input_action": "one AWT W key event queued after original m.a(4) stores m.e=4",
                      "reflection": False, "direct_game_method_calls": False,
                      "direct_game_field_writes": False}, indent=2))


if __name__ == "__main__":
    main()
