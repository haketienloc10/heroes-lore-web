"""Build an isolated probe that distinguishes bt.run() mode-1 BCI 146/149."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "reference/recordings/scheduler-cf02-branch-20261022"
GAME = ROOT / "original/heroes-lore-v2.1.2.jar"
EMU = Path("/home/locdt/tools/freej2me-plus-v1.52/freej2me.jar")
INSTRUMENTER = ROOT / "reverse-engineering/scripts/CF02Instrumenter.java"
PROBE = ROOT / "reverse-engineering/scripts/CF02TraceProbe.java"
GAME_SHA256 = "7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61"
EMU_SHA256 = "92f84012958f2ca0692dbe7d258cea7aebd4e96f664445d8e92dd0297e12df0e"


def digest(path):
    value = hashlib.sha256(path.read_bytes()).hexdigest()
    return {"path": str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path),
            "size": path.stat().st_size, "sha256": value}


def main():
    if hashlib.sha256(GAME.read_bytes()).hexdigest() != GAME_SHA256:
        raise RuntimeError("Heroes Lore JAR identity mismatch")
    if hashlib.sha256(EMU.read_bytes()).hexdigest() != EMU_SHA256:
        raise RuntimeError("FreeJ2ME-Plus JAR identity mismatch")
    BUILD.mkdir(parents=True, exist_ok=False)
    classes = BUILD / "classes"
    classes.mkdir()
    exports = ["--add-exports", "java.base/jdk.internal.org.objectweb.asm=ALL-UNNAMED",
               "--add-exports", "java.base/jdk.internal.org.objectweb.asm.tree=ALL-UNNAMED"]
    subprocess.run(["javac", *exports, "-d", str(classes), str(INSTRUMENTER), str(PROBE)], check=True)
    manifest = BUILD / "PROBE.MF"
    manifest.write_text("Manifest-Version: 1.0\nPremain-Class: org.recompile.hlprobe.CF02TraceProbe\n\n")
    probe_jar = BUILD / "cf02-probe.jar"
    subprocess.run(["jar", "cfm", str(probe_jar), str(manifest), "-C", str(classes),
                    "org/recompile/hlprobe/CF02TraceProbe.class"], check=True)
    transformed_game = BUILD / "heroes-lore-cf02-probed.jar"
    with (BUILD / "instrumentation.log").open("w") as log:
        subprocess.run(["java", *exports, "-cp", str(classes), "CF02Instrumenter",
                        str(GAME), str(transformed_game)], stdout=log, stderr=subprocess.STDOUT, check=True)
    java_version = subprocess.run(["java", "-version"], capture_output=True, text=True, check=True)
    files = [GAME, EMU, INSTRUMENTER, PROBE, probe_jar, transformed_game]
    result = {
        "purpose": "CF-02: distinguish the bt.run() mode-1 success branch at BCI 146 from handler BCI 149",
        "game_sha256": GAME_SHA256,
        "emulator_sha256": EMU_SHA256,
        "java_version": java_version.stderr.strip().splitlines(),
        "bci_to_opcode_index": {"146": 45, "149": 46, "150": 47, "151": 48, "155": 50, "168": 55, "172": 57, "175": 58},
        "instrumented_sites": ["mode-1 worker entry", "BCI 146 before goto", "BCI 149 before handler pop",
                               "BCI 150 common join", "BCI 151 j()V", "BCI 155 k()V",
                               "BCI 168 m.b(BBBB)V", "BCI 172 q.b:Z store", "BCI 175 normal return"],
        "files": [digest(path) for path in files],
    }
    (BUILD / "build-manifest.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"build": str(BUILD.relative_to(ROOT)), "probe_jar": digest(probe_jar),
                      "transformed_game": digest(transformed_game)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
