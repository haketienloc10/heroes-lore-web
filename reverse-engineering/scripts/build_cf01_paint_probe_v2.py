"""Build an isolated CF-01 probe for splash paint state and loaded logo images."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "reference/recordings/scheduler-cf01-paint-v2-20261022"
GAME = ROOT / "original/heroes-lore-v2.1.2.jar"
EMU = Path("/home/locdt/tools/freej2me-plus-v1.52/freej2me.jar")
INSTRUMENTER = ROOT / "reverse-engineering/scripts/CF01PaintInstrumenterV2.java"
PROBE = ROOT / "reverse-engineering/scripts/CF01PaintTraceProbeV2.java"
GAME_SHA256 = "7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61"
EMU_SHA256 = "92f84012958f2ca0692dbe7d258cea7aebd4e96f664445d8e92dd0297e12df0e"


def digest(path):
    return {"path": str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path),
            "size": path.stat().st_size,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def main():
    if digest(GAME)["sha256"] != GAME_SHA256:
        raise RuntimeError("Original game JAR identity mismatch")
    if digest(EMU)["sha256"] != EMU_SHA256:
        raise RuntimeError("Original emulator JAR identity mismatch")
    BUILD.mkdir(parents=True, exist_ok=True)
    classes = BUILD / "classes"
    classes.mkdir(exist_ok=True)
    exports = ["--add-exports", "java.base/jdk.internal.org.objectweb.asm=ALL-UNNAMED",
               "--add-exports", "java.base/jdk.internal.org.objectweb.asm.tree=ALL-UNNAMED"]
    subprocess.run(["javac", *exports, "-cp", str(EMU), "-d", str(classes),
                    str(INSTRUMENTER), str(PROBE)], check=True)
    manifest = BUILD / "PROBE.MF"
    manifest.write_text("Manifest-Version: 1.0\nPremain-Class: org.recompile.hlprobe.CF01PaintTraceProbeV2\n\n")
    probe_jar = BUILD / "cf01-paint-probe-v2.jar"
    subprocess.run(["jar", "cfm", str(probe_jar), str(manifest), "-C", str(classes),
                    "org/recompile/hlprobe/CF01PaintTraceProbeV2.class"], check=True)
    transformed = BUILD / "heroes-lore-cf01-paint-probed-v2.jar"
    with (BUILD / "instrumentation.log").open("w") as log:
        subprocess.run(["java", *exports, "-cp", str(classes), "CF01PaintInstrumenterV2",
                        str(GAME), str(transformed)], stdout=log, stderr=subprocess.STDOUT, check=True)
    java = subprocess.run(["java", "-version"], capture_output=True, text=True, check=True)
    manifest_data = {
        "purpose": "Observe bf.paint animation fields, bf.run entries, and cd.j logo Image[] null availability during natural no-input startup.",
        "game_sha256": GAME_SHA256, "emulator_sha256": EMU_SHA256,
        "java_version": java.stderr.strip().splitlines(),
        "instrumented_methods": ["bf.run()V entry and returns", "bf.paint(Graphics)V entry and returns",
                                  "cd.j:[Ljavax/microedition/lcdui/Image; reads from bf.paint"],
        "probe_limits": ["No reflection, input injection, or game field writes.",
                         "Image availability is observed only when the original paint method accesses cd.j[].",
                         "A separate game-JAR copy is instrumented; the original JAR is unchanged."],
        "files": [digest(path) for path in [GAME, EMU, INSTRUMENTER, PROBE, probe_jar, transformed]],
    }
    (BUILD / "build-manifest.json").write_text(json.dumps(manifest_data, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"build": str(BUILD.relative_to(ROOT)), "probe_jar": digest(probe_jar),
                      "transformed_game": digest(transformed)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
