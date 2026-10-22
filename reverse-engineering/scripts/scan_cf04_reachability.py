"""Scan original JAR call sites for natural CF-04 state and pending-command setters."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
GAME = ROOT / "original/heroes-lore-v2.1.2.jar"
BUILD = ROOT / "reference/recordings/cf04-reachability-scan-20261022"
EXPECTED_GAME = "7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61"
SCANNER = ROOT / "reverse-engineering/scripts/FindCf04Reachability.java"


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def record(path):
    return {"path": str(path.relative_to(ROOT)), "size": path.stat().st_size, "sha256": sha256(path)}


def main():
    game_hash = sha256(GAME)
    if game_hash != EXPECTED_GAME:
        raise RuntimeError(f"Original JAR hash mismatch: {game_hash}")
    BUILD.mkdir(parents=True, exist_ok=True)
    classes = BUILD / "classes"
    classes.mkdir(exist_ok=True)
    exports = ["--add-exports", "java.base/jdk.internal.org.objectweb.asm=ALL-UNNAMED",
               "--add-exports", "java.base/jdk.internal.org.objectweb.asm.tree=ALL-UNNAMED"]
    subprocess.run(["javac", *exports, "-d", str(classes), str(SCANNER)], check=True)
    run = subprocess.run(["java", *exports, "-cp", str(classes), "FindCf04Reachability", str(GAME)],
                         capture_output=True, text=True, check=True)
    result = json.loads(run.stdout)
    result["game_sha256"] = game_hash
    result["scope"] = "Every .class entry in the original game JAR; scans m.a(I)V state setter calls, direct m.e:I static stores, and all m.a(B... )V pending-command overloads. Constant extraction only reports immediately adjacent literal pushes."
    result["limitations"] = [
        "This is a static call-site inventory; it does not prove any call site is reachable from the UI.",
        "Arguments not loaded as adjacent integer literals are reported as null; this bounded constant scan is not general bytecode dataflow.",
        "The scan does not alter the original JAR or establish runtime invocation order.",
    ]
    output = BUILD / "analysis.json"
    output.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
    java_version = subprocess.run(["java", "-version"], capture_output=True, text=True, check=True).stderr.strip().splitlines()
    manifest = {
        "purpose": "Static inventory of original JAR call sites relevant to CF-04 state 14 and pending command 21/2 reachability.",
        "tool": "JDK internal ASM tree API; read-only class parsing",
        "java_version": java_version,
        "game_sha256": game_hash,
        "scanner": record(SCANNER),
        "files": [record(GAME), record(SCANNER), record(output)],
        "interpretation_limit": "Static call-site existence is not dynamic reachability evidence.",
    }
    (BUILD / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"output": str(output.relative_to(ROOT)), "class_count": result["class_count"],
                      "state_setter_calls": len(result["state_setter_calls"]),
                      "state14_call_sites": len(result["constant_state_14_calls"]),
                      "command_21_2_sites": [row for row in result["pending_command_setter_calls"]
                                               if row["descriptor"] == "(BB)V" and row["argument_constants"] == [21, 2]],
                      "command_2_param_14_sites": [row for row in result["pending_command_setter_calls"]
                                                     if row["descriptor"] == "(BB)V" and row["argument_constants"] == [2, 14]]},
                     ensure_ascii=False))


if __name__ == "__main__":
    main()
