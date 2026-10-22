"""Build a minimal branch/order probe without reflection or emulator instrumentation."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "reference/recordings/scheduler-probe-followup-20261022-render-r1"
GAME = ROOT / "original/heroes-lore-v2.1.2.jar"
EMU = Path("/home/locdt/tools/freej2me-plus-v1.52/freej2me.jar")
EXPECTED_GAME = "7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61"
EXPECTED_EMU = "92f84012958f2ca0692dbe7d258cea7aebd4e96f664445d8e92dd0297e12df0e"
INSTRUMENTER = ROOT / "reverse-engineering/scripts/RenderOrderInstrumenter.java"
PROBE = ROOT / "reverse-engineering/scripts/RenderOrderProbe.java"


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def record(path):
    record_path = path.relative_to(ROOT) if path.is_relative_to(ROOT) else path
    return {"path": str(record_path), "size": path.stat().st_size, "sha256": sha256(path)}


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
    manifest.write_text("Manifest-Version: 1.0\nPremain-Class: org.recompile.hlprobe.RenderOrderProbe\n\n")
    agent = BUILD / "probe-render-order-safe.jar"
    subprocess.run(["jar", "cfm", str(agent), str(manifest), "-C", str(classes), "org/recompile/hlprobe"], check=True)
    game_traced = BUILD / "game-traced.jar"
    transform_log = BUILD / "transform.log"
    with transform_log.open("w") as log:
        subprocess.run(["java", *exports, "-cp", str(classes), "RenderOrderInstrumenter",
                        str(GAME), str(game_traced)], stdout=log, check=True)
    transformed = transform_log.read_text()
    for target in ("ar.paint", "m.g()V", "m.i()V", "br.d:Z operand hooked at original BCI 94"):
        if target not in transformed:
            raise RuntimeError(f"Transform did not confirm {target}")
    inputs = [GAME, EMU, INSTRUMENTER, PROBE, agent, game_traced, transform_log]
    (BUILD / "build-manifest.json").write_text(json.dumps([record(path) for path in inputs], indent=2) + "\n")
    print(json.dumps({"build": str(BUILD.relative_to(ROOT)),
                      "targets": ["ar.paint(Graphics)V", "m.i()V", "m.g()V", "br.d:Z operand"],
                      "reflection": False, "game_state_reads": False, "game_state_writes": False,
                      "game_sha256": sha256(game_traced), "agent_sha256": sha256(agent)}, indent=2))


if __name__ == "__main__":
    main()
