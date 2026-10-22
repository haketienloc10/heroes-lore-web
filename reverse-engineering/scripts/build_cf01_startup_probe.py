"""Build a separate game-JAR copy instrumented for the natural CF-01 startup branch."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "reference/recordings/scheduler-cf01-startup-20261022"
GAME = ROOT / "original/heroes-lore-v2.1.2.jar"
EMU = Path("/home/locdt/tools/freej2me-plus-v1.52/freej2me.jar")
INSTRUMENTER = ROOT / "reverse-engineering/scripts/CF01Instrumenter.java"
PROBE = ROOT / "reverse-engineering/scripts/CF01TraceProbe.java"
GAME_SHA256 = "7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61"
EMU_SHA256 = "92f84012958f2ca0692dbe7d258cea7aebd4e96f664445d8e92dd0297e12df0e"


def digest(path):
    sha = hashlib.sha256(path.read_bytes()).hexdigest()
    return {"path": str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path),
            "size": path.stat().st_size, "sha256": sha}


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
    manifest.write_text("Manifest-Version: 1.0\nPremain-Class: org.recompile.hlprobe.CF01TraceProbe\n\n")
    probe_jar = BUILD / "cf01-probe.jar"
    subprocess.run(["jar", "cfm", str(probe_jar), str(manifest), "-C", str(classes),
                    "org/recompile/hlprobe/CF01TraceProbe.class"], check=True)
    transformed_game = BUILD / "heroes-lore-cf01-probed.jar"
    with (BUILD / "instrumentation.log").open("w") as log:
        subprocess.run(["java", *exports, "-cp", str(classes), "CF01Instrumenter",
                        str(GAME), str(transformed_game)], stdout=log, stderr=subprocess.STDOUT, check=True)
    java_version = subprocess.run(["java", "-version"], capture_output=True, text=True, check=True)
    files = [GAME, EMU, INSTRUMENTER, PROBE, probe_jar, transformed_game]
    result = {
        "purpose": "CF-01: trace natural bf.run()V startup with a=0,b=1 through the two resource loads and common suffix",
        "game_sha256": GAME_SHA256,
        "emulator_sha256": EMU_SHA256,
        "java_version": java_version.stderr.strip().splitlines(),
        "original_bci_sites": {"success_goto": 92, "exception_handler_pop": 95, "cd.y": 96,
                                "cd.A": 99, "bf.b": 208, "q.k": 211, "return": 214},
        "instrumented_sites": ["bf.a:B and bf.b:B at run entry", "BCI 92 success goto",
                               "BCI 95 IOException handler", "BCI 96 cd.y()V", "BCI 99 cd.A()V",
                               "BCI 208 bf.b()V", "BCI 211 q.k()V", "normal return"],
        "original_game_jar_modified": False,
        "files": [digest(path) for path in files],
    }
    (BUILD / "build-manifest.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"build": str(BUILD.relative_to(ROOT)), "probe_jar": digest(probe_jar),
                      "transformed_game": digest(transformed_game)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
