"""Validate the repaint-causality run and refresh its reproducibility manifests."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "reverse-engineering/findings/evidence/milestone-1.5/scheduler-followup-20261023-repaint-causality"
RUN_ID = os.environ.get("REPAINT_CAUSALITY_RUN_ID", "M15-SCN-0004-E-repaint-causality-R01")
RUN = BASE / RUN_ID
BUILD = ROOT / "reference/recordings/scheduler-repaint-causality-20261023-r1"
SCREENSHOTS = ROOT / "reference/screenshots" / RUN_ID
GAME = ROOT / "original/heroes-lore-v2.1.2.jar"
EMU = Path("/home/locdt/tools/freej2me-plus-v1.52/freej2me.jar")
EXPECTED_GAME = "7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61"
EXPECTED_EMU = "92f84012958f2ca0692dbe7d258cea7aebd4e96f664445d8e92dd0297e12df0e"
AGENT = BUILD / "repaint-causality-agent.jar"
TRACED_GAME = BUILD / "game-repaint-causality.jar"
TRACED_EMULATOR = BUILD / "emulator-repaint-causality.jar"
CODE = ROOT / "reverse-engineering/scripts"
SOURCE_FILES = [
    CODE / "RepaintCausalityInstrumenter.java",
    CODE / "RepaintCausalityProbe.java",
    CODE / "build_repaint_causality_probe.py",
    CODE / "run_repaint_causality_probe.py",
    CODE / "analyze_repaint_causality_probe.py",
    CODE / "finalize_repaint_causality_probe.py",
]
DOC_FILES = [
    ROOT / "reference/scenarios/SCN-0004-game-loop.md",
    ROOT / "reverse-engineering/findings/FND-0004-runtime-scheduler.md",
    BASE / "README.md",
]


def digest(path):
    path = Path(path)
    value = hashlib.sha256(path.read_bytes()).hexdigest()
    try:
        name = str(path.relative_to(ROOT))
    except ValueError:
        name = str(path)
    return {"path": name, "size": path.stat().st_size, "sha256": value}


def write(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def verify_hash(item):
    path = ROOT / item["path"] if not Path(item["path"]).is_absolute() else Path(item["path"])
    actual = digest(path)
    if actual["size"] != item["size"] or actual["sha256"] != item["sha256"]:
        raise RuntimeError(f"Hash mismatch for {path}")


def main():
    if hashlib.sha256(GAME.read_bytes()).hexdigest() != EXPECTED_GAME:
        raise RuntimeError("Original game JAR identity mismatch")
    if hashlib.sha256(EMU.read_bytes()).hexdigest() != EXPECTED_EMU:
        raise RuntimeError("Original emulator JAR identity mismatch")
    for path in (RUN / "trace.jsonl", RUN / "trace-health.json", RUN / "launch.json",
                 RUN / "process-exit.json", RUN / "fixture-verification.json", RUN / "timeline.jsonl",
                 BUILD / "transform-report.json", AGENT, TRACED_GAME, TRACED_EMULATOR):
        if not path.is_file():
            raise RuntimeError(f"Required evidence/build file missing: {path}")
    expected_screenshots = {"01-startup.png", "02-gameplay-after-load.png", "03-gameplay-after-idle.png"}
    actual_screenshots = {path.name for path in SCREENSHOTS.glob("*.png")}
    if actual_screenshots != expected_screenshots:
        raise RuntimeError(f"Unexpected screenshot set: {sorted(actual_screenshots)}")

    env = {**os.environ, "REPAINT_CAUSALITY_RUN_ID": RUN_ID}
    subprocess.run([sys.executable, str(CODE / "analyze_repaint_causality_probe.py")], env=env, check=True)
    analysis = json.loads((RUN / "analysis.json").read_text())
    if analysis.get("assessment") != "flush_repaint_update_event_lcd_paint_causality_observed":
        raise RuntimeError("Repaint-to-paint runtime link is inconclusive")
    if not all(analysis.get("checks", {}).values()):
        raise RuntimeError("One or more trace integrity/correlation checks failed")
    if analysis["counts"].get("lcd_repaint_requests") != 446 or analysis["counts"].get("request_ids_linked_to_lcd_paint") != 446:
        raise RuntimeError("Expected 446 complete repaint-to-paint links in R01")
    if analysis["gameplay_capture_window"].get("request_ids_linked_to_update_paint") != 146:
        raise RuntimeError("Expected 146 complete gameplay-window repaint links in R01")

    build_files = [GAME, EMU, *SOURCE_FILES, BUILD / "PROBE.MF", AGENT, TRACED_GAME,
                   TRACED_EMULATOR, BUILD / "transform-report.json"]
    build_manifest = {
        "purpose": "Trace ar.paint state entry and the FreeJ2ME flushGraphics -> painter LCD.repaint -> AWT PaintEvent.UPDATE -> LCD.paint runtime path.",
        "date": "2026-10-23",
        "original_game_sha256": EXPECTED_GAME,
        "original_emulator_sha256": EXPECTED_EMU,
        "semantics": {
            "game_state_read": "direct GETSTATIC m.e:I at ar.paint entry",
            "game_field_writes": False,
            "repaint_ticket": "assigned at the exact FreeJ2ME$6.run callsite immediately before LCD.repaint()",
            "awt_link": "EventQueue.getCurrentEvent() must be PaintEvent.UPDATE with source identical to the LCD receiver",
            "normal_returns_only": True,
            "physical_presentation": False,
        },
        "files": [digest(path) for path in build_files],
    }
    # The compiled .class directory is a temporary builder intermediate; the jars and source hashes are the reproducible artifacts.
    shutil.rmtree(BUILD / "classes", ignore_errors=True)
    write(BUILD / "build-manifest.json", build_manifest)

    run_files = [path for path in RUN.rglob("*") if path.is_file() and path.name != "manifest.json"]
    run_files.extend(path for path in SCREENSHOTS.rglob("*") if path.is_file())
    run_manifest = {"run_id": RUN_ID, "files": [digest(path) for path in sorted(run_files)]}
    write(RUN / "manifest.json", run_manifest)
    for item in run_manifest["files"]:
        verify_hash(item)

    aggregate = {
        "purpose": "Runtime correlation from the FreeJ2ME LCD repaint request through the same-source AWT update event to LCD.paint.",
        "run_count": 1,
        "run_id": RUN_ID,
        "trace_events": analysis["trace_events"],
        "trace_dropped": analysis["trace_health"]["dropped"],
        "assessment": analysis["assessment"],
        "counts": analysis["counts"],
        "gameplay_capture_window": analysis["gameplay_capture_window"],
        "censored_spans_at_shutdown": analysis["censored_spans_at_shutdown"],
        "limitations": analysis["limitations"],
    }
    write(BASE / "aggregate.json", aggregate)

    evidence_files = {path for path in BASE.rglob("*") if path.is_file() and path != BASE / "manifest.json"}
    evidence_files.update(path for path in BUILD.rglob("*") if path.is_file())
    evidence_files.update(DOC_FILES)
    evidence_files.update(SOURCE_FILES)
    all_manifest = {
        "producer": "finalize_repaint_causality_probe.py; SHA-256 metadata only",
        "date": "2026-10-23",
        "run_count": 1,
        "per_run_manifest_files_checked": len(run_manifest["files"]),
        "files": [digest(path) for path in sorted(evidence_files)],
    }
    write(BASE / "manifest.json", all_manifest)
    for item in all_manifest["files"]:
        verify_hash(item)
    print(json.dumps({"manifest": str((BASE / "manifest.json").relative_to(ROOT)),
                      "assessment": analysis["assessment"],
                      "trace_events": analysis["trace_events"],
                      "per_run_files_checked": len(run_manifest["files"]),
                      "all_files_hashed": len(all_manifest["files"]),
                      "full_capture_links": analysis["counts"]["request_ids_linked_to_lcd_paint"],
                      "gameplay_window_links": analysis["gameplay_capture_window"]["request_ids_linked_to_update_paint"]},
                     ensure_ascii=False))


if __name__ == "__main__":
    main()
