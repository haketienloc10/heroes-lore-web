"""Build an isolated CF-01 paint-state probe for cold-start blank-canvas analysis."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "reference/recordings/scheduler-cf01-paint-20261022"
GAME = ROOT / "original/heroes-lore-v2.1.2.jar"
EMU = Path("/home/locdt/tools/freej2me-plus-v1.52/freej2me.jar")
INSTRUMENTER = ROOT / "reverse-engineering/scripts/CF01PaintInstrumenter.java"
PROBE = ROOT / "reverse-engineering/scripts/CF01PaintTraceProbe.java"
GAME_SHA256 = "7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61"
EMU_SHA256 = "92f84012958f2ca0692dbe7d258cea7aebd4e96f664445d8e92dd0297e12df0e"


def digest(path):
    h = hashlib.sha256(path.read_bytes()).hexdigest()
    try:
        name = str(path.relative_to(ROOT))
    except ValueError:
        name = str(path)
    return {"path": name, "size": path.stat().st_size, "sha256": h}


def main():
    if hashlib.sha256(GAME.read_bytes()).hexdigest() != GAME_SHA256:
        raise RuntimeError("Original game JAR identity mismatch")
    if hashlib.sha256(EMU.read_bytes()).hexdigest() != EMU_SHA256:
        raise RuntimeError("Original emulator JAR identity mismatch")
    BUILD.mkdir(parents=True, exist_ok=False)
    classes = BUILD / "classes"
    classes.mkdir()
    exports = ["--add-exports", "java.base/jdk.internal.org.objectweb.asm=ALL-UNNAMED",
               "--add-exports", "java.base/jdk.internal.org.objectweb.asm.tree=ALL-UNNAMED"]
    subprocess.run(["javac", *exports, "-d", str(classes), str(INSTRUMENTER), str(PROBE)], check=True)
    manifest = BUILD / "PROBE.MF"
    manifest.write_text("Manifest-Version: 1.0\nPremain-Class: org.recompile.hlprobe.CF01PaintTraceProbe\n\n")
    probe_jar = BUILD / "cf01-paint-probe.jar"
    subprocess.run(["jar", "cfm", str(probe_jar), str(manifest), "-C", str(classes),
                    "org/recompile/hlprobe/CF01PaintTraceProbe.class"], check=True)
    transformed = BUILD / "heroes-lore-cf01-paint-probed.jar"
    with (BUILD / "instrumentation.log").open("w") as log:
        subprocess.run(["java", *exports, "-cp", str(classes), "CF01PaintInstrumenter",
                        str(GAME), str(transformed)], stdout=log, stderr=subprocess.STDOUT, check=True)
    java = subprocess.run(["java", "-version"], capture_output=True, text=True, check=True)
    manifest_data = {
        "purpose": "CF-01 cold-start blank-canvas diagnosis by tracing bf.paint state and bf.a writes",
        "game_sha256": GAME_SHA256, "emulator_sha256": EMU_SHA256,
        "java_version": java.stderr.strip().splitlines(),
        "instrumented_methods": ["bf.run()V entry and returns", "bf.paint(Graphics)V entry and returns",
                                  "writes to bf.a:B within bf"],
        "probe_limits": ["No reflection, input injection, or game field writes.",
                         "A separate game-JAR copy is instrumented; the original JAR is unchanged."],
        "files": [digest(path) for path in [GAME, EMU, INSTRUMENTER, PROBE, probe_jar, transformed]],
    }
    (BUILD / "build-manifest.json").write_text(json.dumps(manifest_data, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"build": str(BUILD.relative_to(ROOT)), "probe_jar": digest(probe_jar),
                      "transformed_game": digest(transformed)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
