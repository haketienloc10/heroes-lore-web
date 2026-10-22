"""Build an isolated probe for the CF-04 m.e() command 21/2 branch."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
MODE = sys.argv[1] if len(sys.argv) > 1 else "injected"
if MODE not in ("injected", "natural"):
    raise SystemExit("Usage: build_cf04_probe.py [injected|natural]")
BUILD = ROOT / ("reference/recordings/scheduler-cf04-injected-v5-20261022" if MODE == "injected"
                else "reference/recordings/scheduler-cf04-natural-v3-20261022")
GAME = ROOT / "original/heroes-lore-v2.1.2.jar"
EMU = Path("/home/locdt/tools/freej2me-plus-v1.52/freej2me.jar")
INSTRUMENTER = ROOT / "reverse-engineering/scripts/CF04Instrumenter.java"
PROBE = ROOT / "reverse-engineering/scripts/CF04TraceProbe.java"
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
    BUILD.mkdir(parents=True, exist_ok=True)
    for name in ("build-manifest.json", "cf04-probe.jar", "heroes-lore-cf04-probed.jar"):
        if (BUILD / name).exists():
            raise RuntimeError(f"Refusing to overwrite existing build output: {BUILD / name}")
    classes = BUILD / "classes"
    classes.mkdir(exist_ok=True)
    exports = ["--add-exports", "java.base/jdk.internal.org.objectweb.asm=ALL-UNNAMED",
               "--add-exports", "java.base/jdk.internal.org.objectweb.asm.tree=ALL-UNNAMED"]
    subprocess.run(["javac", *exports, "-d", str(classes), str(INSTRUMENTER), str(PROBE)], check=True)
    manifest = BUILD / "PROBE.MF"
    manifest.write_text("Manifest-Version: 1.0\nPremain-Class: org.recompile.hlprobe.CF04TraceProbe\n\n")
    probe_jar = BUILD / "cf04-probe.jar"
    subprocess.run(["jar", "cfm", str(probe_jar), str(manifest), "-C", str(classes),
                    "org/recompile/hlprobe/CF04TraceProbe.class"], check=True)
    transformed_game = BUILD / "heroes-lore-cf04-probed.jar"
    with (BUILD / "instrumentation.log").open("w") as log:
        command = ["java", *exports, "-cp", str(classes), "CF04Instrumenter",
                   str(GAME), str(transformed_game)]
        if MODE == "natural":
            command.append("natural")
        subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, check=True)
    java_version = subprocess.run(["java", "-version"], capture_output=True, text=True, check=True)
    files = [GAME, EMU, INSTRUMENTER, PROBE, probe_jar, transformed_game]
    result = {
        "mode": MODE,
        "purpose": ("Trace the m.e()V command 21/2 body for CF-04 with a separately labeled one-time injected pending command."
                    if MODE == "injected" else "Observe natural UI calls to ar.e(Graphics) pending setter and m.e() command consumption without injecting or modifying game state."),
        "interpretation_limit": ("The injected command proves branch-body behavior only; it does not prove that ordinary UI input naturally reaches the injection condition or command 21/2."
                                 if MODE == "injected" else "No command or state is injected by this build; lack of a command during the observed route does not prove global unreachability."),
        "game_sha256": GAME_SHA256,
        "emulator_sha256": EMU_SHA256,
        "java_version": java_version.stderr.strip().splitlines(),
        "injection_guard": "First ar.paint() call where m.e:I==2 and pending m.b:B==0; set pending command (21,2) using m.a(BB)V." if MODE == "injected" else None,
        "instrumented_sites": (["ar.paint controlled injection guard", "m.a(BB)V arguments", "m.e()V pending entry snapshot", "m.c()V branch call", "m.a(I)V state setter", "bt.d()V mode-5 store and return", "bt constructor identity linked to active m.e span", "bt.run()V mode-5 switch target BCI 190", "m.e()V return immediately after bt.d()"] if MODE == "injected" else ["ar.e(Graphics) natural text-completion setter call", "ar.keyPressed(I)V natural command setter call", "m.a(BB)V arguments", "m.e()V pending entry snapshot", "m.c()V branch call", "m.a(I)V state setter", "bt.d()V mode-5 store and return", "bt constructor identity linked to active m.e span", "bt.run()V mode-5 switch target BCI 190", "m.e()V return after bt.d()"]),
        "original_game_jar_modified": False,
        "files": [digest(path) for path in files],
    }
    (BUILD / "build-manifest.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"build": str(BUILD.relative_to(ROOT)), "probe_jar": digest(probe_jar),
                      "transformed_game": digest(transformed_game)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
