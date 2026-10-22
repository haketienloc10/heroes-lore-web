"""Reconcile SCN-0004 launch metadata against the emulator's per-run config."""
import hashlib
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / "reverse-engineering/findings/evidence/milestone-1.5/scheduler-followup-20261022"
EMU = Path("/home/locdt/tools/freej2me-plus-v1.52/freej2me.jar")


def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return {"path": str(path.relative_to(ROOT)), "size": path.stat().st_size,
            "sha256": h.hexdigest()}


def read_properties(path):
    values = {}
    for line in path.read_text().splitlines():
        if ":" in line and not line.startswith("#"):
            key, value = line.split(":", 1)
            values[key] = value
    return values


def main():
    launch_paths = sorted((ROOT / "reverse-engineering/findings/evidence/milestone-1.5")
                          .glob("scheduler*/M15-SCN-0004-*/launch.json"))
    records = []
    profile_counts = Counter()
    metadata_counts = Counter()
    mismatch_count = 0
    missing_metadata_count = 0
    for launch_path in launch_paths:
        launch = json.loads(launch_path.read_text())
        run_id = launch.get("run_id", launch_path.parent.name)
        config_path = ROOT / "reference/recordings" / run_id / "config/Heroes Lore/game.conf"
        system_path = ROOT / "reference/recordings" / run_id / "freej2me_system/freej2me.conf"
        if not config_path.is_file() or not system_path.is_file():
            raise RuntimeError(f"Missing per-run config for {run_id}")
        game_config = read_properties(config_path)
        system_config = read_properties(system_path)
        configured_phone = game_config.get("phone", "<missing>")
        reported_profile = launch.get("profile")
        profile_counts[configured_phone] += 1
        metadata_counts[reported_profile or "<missing>"] += 1
        reported_says_motorola = bool(reported_profile and "motorola" in reported_profile.lower())
        mismatch = reported_says_motorola and configured_phone != "Motorola"
        if mismatch:
            mismatch_count += 1
        if reported_profile is None:
            missing_metadata_count += 1
        records.append({
            "run_id": run_id,
            "launch_file": str(launch_path.relative_to(ROOT)),
            "previous_launch_profile_metadata": reported_profile,
            "configured_phone_profile": configured_phone,
            "launch_metadata_says_motorola": reported_says_motorola,
            "metadata_mismatch": mismatch,
            "game_config": digest(config_path),
            "system_config": digest(system_path),
            "softkey_host_mappings": {
                "LeftSoft_AWT_key_code": int(system_config["input_LeftSoft"]),
                "RightSoft_AWT_key_code": int(system_config["input_RightSoft"])
            }
        })

    output = {
        "producer": "audit_scheduler_phone_profile.py",
        "scope": "SCN-0004 M1.5/P1M and 2026-10-22 follow-up runs with launch.json",
        "emulator": {"path": str(EMU), "sha256": hashlib.sha256(EMU.read_bytes()).hexdigest()},
        "run_count": len(records),
        "configured_phone_profile_counts": dict(profile_counts),
        "launch_profile_metadata_counts": dict(metadata_counts),
        "motorola_metadata_vs_config_mismatches": mismatch_count,
        "launch_profile_metadata_absent": missing_metadata_count,
        "configuration_authority": "Per-run config/Heroes Lore/game.conf is the configuration loaded by FreeJ2ME for that run. In FreeJ2ME 1.52 Mobile.updateSettings(), phone=Standard clears vendor flags and phone=Motorola sets Mobile.motorola=true. The 28 follow-up launch.json profile strings saying Motorola conflict with their per-run game.conf values; initial P1M launch files omit profile metadata.",
        "input_mapping": {
            "per_run_system_config": "input_RightSoft:87 (W), input_LeftSoft:81 (Q)",
            "AWTGUI_default_input_slots": {"slot_1_host_key_code": 87, "slot_1_key": "W"},
            "Mobile.awtguiKeycodes_slot_1": 8,
            "Mobile.getMobileKey_Standard_argument_8": -7,
            "Mobile.getMobileKey_Motorola_argument_8": -22,
            "game_key_handler": "ar.keyPressed(I)V maps raw -22 or 22 to -8 before dispatch; state m.e:I=4 calls ag.a(II)V.",
            "operator_instruction_for_motorola_profile": "With the per-run phone profile set to Motorola and the recorded default RightSoft mapping unchanged, press W during the brief state-4 NOW LOADING transition. Escape did not produce the target -22/22 value in bypass R01."
        },
        "interpretation": "The scheduler and rendering measurements remain observations of the recorded FreeJ2ME configuration, but these runs used phone=Standard. Do not describe them as Motorola-profile measurements. The R01 bypass attempt is not a test of the intended Motorola softkey route.",
        "static_mapping_facts": [
            "FreeJ2ME 1.52 FreeJ2ME.getMobileKey(I): looks up the configured AWT key slot, then calls Mobile.convertAWTKeycode(slot).",
            "FreeJ2ME 1.52 Mobile.convertAWTKeycode(1) reads awtguiKeycodes[1]=8.",
            "FreeJ2ME 1.52 Mobile.getMobileKey(8) returns -7 in Standard mode and -22 when motorola=true.",
            "FreeJ2ME 1.52 Mobile.updateSettings() sets all vendor flags false, then enables motorola only when phone.equals(\"Motorola\").",
            "Original game ar.keyPressed(I)V normalizes raw -22 and 22 to -8, and dispatches m.e:I=4 to ag.a(II)V."
        ],
        "runs": records
    }
    target = EVIDENCE / "emulator-profile-audit.json"
    target.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"audit": str(target.relative_to(ROOT)), "run_count": len(records),
                      "configured_phone_profiles": dict(profile_counts),
                      "motorola_metadata_mismatches": mismatch_count,
                      "missing_profile_metadata": missing_metadata_count}, ensure_ascii=False))


if __name__ == "__main__":
    main()
