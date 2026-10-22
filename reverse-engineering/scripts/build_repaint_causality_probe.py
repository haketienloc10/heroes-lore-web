"""Build isolated game/emulator copies with direct repaint-to-PaintEvent hooks."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "reference/recordings/scheduler-repaint-causality-20261023-r1"
GAME = ROOT / "original/heroes-lore-v2.1.2.jar"
EMU = Path("/home/locdt/tools/freej2me-plus-v1.52/freej2me.jar")
EXPECTED_GAME = "7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61"
EXPECTED_EMU = "92f84012958f2ca0692dbe7d258cea7aebd4e96f664445d8e92dd0297e12df0e"


def digest(path):
    path = Path(path)
    return {"path": str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path),
            "size": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def main():
    if hashlib.sha256(GAME.read_bytes()).hexdigest() != EXPECTED_GAME:
        raise RuntimeError("Original game JAR identity mismatch")
    if hashlib.sha256(EMU.read_bytes()).hexdigest() != EXPECTED_EMU:
        raise RuntimeError("FreeJ2ME JAR identity mismatch")
    BUILD.mkdir(parents=True, exist_ok=False)
    classes = BUILD / "classes"
    classes.mkdir()
    exports = ["--add-exports", "java.base/jdk.internal.org.objectweb.asm=ALL-UNNAMED",
               "--add-exports", "java.base/jdk.internal.org.objectweb.asm.tree=ALL-UNNAMED"]
    src = ROOT / "reverse-engineering/scripts"
    sources = [src / "RepaintCausalityInstrumenter.java", src / "RepaintCausalityProbe.java"]
    subprocess.run(["javac", *exports, "-d", str(classes), *map(str, sources)], check=True)
    manifest = BUILD / "PROBE.MF"
    manifest.write_text("Manifest-Version: 1.0\nPremain-Class: org.recompile.hlprobe.RepaintCausalityProbe\n\n")
    agent = BUILD / "repaint-causality-agent.jar"
    subprocess.run(["jar", "cfm", str(agent), str(manifest), "-C", str(classes),
                    "org/recompile/hlprobe"], check=True)

    traced_game = BUILD / "game-repaint-causality.jar"
    traced_emulator = BUILD / "emulator-repaint-causality.jar"
    reports = []
    for source, target, mode in [(GAME, traced_game, "game"), (EMU, traced_emulator, "emulator")]:
        result = subprocess.run(["java", *exports, "-cp", str(classes), "RepaintCausalityInstrumenter",
                                 str(source), str(target), mode], capture_output=True, text=True, check=True)
        reports.append({"mode": mode, "report": json.loads(result.stdout)})
    report = BUILD / "transform-report.json"
    report.write_text(json.dumps(reports, indent=2, ensure_ascii=False) + "\n")
    java_version = subprocess.run(["java", "-version"], capture_output=True, text=True, check=True).stderr.strip().splitlines()
    inputs = [GAME, EMU, *sources, ROOT / "reverse-engineering/scripts/build_repaint_causality_probe.py",
              ROOT / "reverse-engineering/scripts/run_repaint_causality_probe.py",
              ROOT / "reverse-engineering/scripts/analyze_repaint_causality_probe.py",
              agent, traced_game, traced_emulator, report]
    build_manifest = {
        "purpose": "Trace game ar.paint and FreeJ2ME flushGraphics -> painter repaint request -> AWT PaintEvent.UPDATE -> LCD.paint on isolated copies.",
        "date": "2026-10-23",
        "original_game_sha256": EXPECTED_GAME,
        "original_emulator_sha256": EXPECTED_EMU,
        "java_version": java_version,
        "instrumented_targets": reports,
        "semantics": {
            "game_field_writes": False,
            "game_state_observation": "direct GETSTATIC m.e:I at ar.paint entry only",
            "repaint_request": "marker immediately before FreeJ2ME$6.run invokes LCD.repaint()",
            "paint_correlation": "EventQueue.getCurrentEvent() at LCD.paint; only same-source PaintEvent.UPDATE drains pending repaint IDs",
            "physical_presentation": False,
        },
        "files": [digest(path) for path in inputs],
    }
    (BUILD / "build-manifest.json").write_text(json.dumps(build_manifest, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"build": str(BUILD.relative_to(ROOT)), "agent": digest(agent),
                      "traced_game": digest(traced_game), "traced_emulator": digest(traced_emulator),
                      "transform_report": reports}, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
