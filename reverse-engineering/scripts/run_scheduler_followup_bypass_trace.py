"""Open a user-operated trace window for the transient ag.a:Z bypass."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time

sys_path = Path(__file__).resolve().parent
import sys
sys.dont_write_bytecode = True
sys.path.insert(0, str(sys_path))
import run_scheduler_followup_transition as common

ROOT = common.ROOT
EVIDENCE = common.EVIDENCE
BUILD = ROOT / "reference/recordings/scheduler-probe-followup-20261022-bypass-r1"
RUN = os.environ.get("BYPASS_RUN_ID", "M15-SCN-0004-E-bypass-R01")
PHONE_PROFILE = os.environ.get("BYPASS_PHONE_PROFILE", "Motorola")


def main():
    rd = EVIDENCE / RUN
    work = ROOT / "reference/recordings" / RUN
    shots = ROOT / "reference/screenshots" / RUN
    rd.mkdir(parents=True, exist_ok=False)
    shots.mkdir(parents=True, exist_ok=False)
    fixture = common.copy_fixture(work)
    common.write(rd / "fixture-verification.json", {
        "source_manifest": str(common.SNAPSHOT_MANIFEST.relative_to(ROOT)),
        "verified_files": len(fixture), "files": fixture})
    game_config = work / "config/Heroes Lore/game.conf"
    config_before = game_config.read_bytes()
    config_lines = config_before.decode("utf-8").splitlines()
    phone_lines = [index for index, line in enumerate(config_lines) if line.startswith("phone:")]
    if len(phone_lines) != 1:
        raise RuntimeError(f"Expected one phone setting in {game_config}; found {len(phone_lines)}")
    source_phone = config_lines[phone_lines[0]].split(":", 1)[1]
    config_lines[phone_lines[0]] = f"phone:{PHONE_PROFILE}"
    game_config.write_text("\n".join(config_lines) + "\n", encoding="utf-8")
    config_after = game_config.read_bytes()
    common.write(rd / "emulator-profile-override.json", {
        "run_id": RUN, "setting": "phone", "source_value": source_phone,
        "run_value": PHONE_PROFILE,
        "scope": "isolated recording copy only; original game/emulator JARs and source fixture are unchanged",
        "config_path": str(game_config.relative_to(ROOT)),
        "sha256_before": hashlib.sha256(config_before).hexdigest(),
        "sha256_after": hashlib.sha256(config_after).hexdigest(),
        "only_changed_line": {"before": f"phone:{source_phone}",
                               "after": f"phone:{PHONE_PROFILE}"}})
    agent = BUILD / "probe-bypass-safe.jar"
    traced_game = BUILD / "game-bypass-traced.jar"
    argv = ["java", "-Dfile.encoding=ISO_8859_1", "-Dsun.java2d.uiScale=1",
            f"-javaagent:{agent}={rd / 'trace.jsonl'}|{RUN}",
            "-jar", str(common.EMU), traced_game.as_uri(), "0", "240", "320", "2", "2", "60"]
    started = time.monotonic_ns()
    with (rd / "console.log").open("w") as log:
        process = subprocess.Popen(argv, cwd=work, stdout=log, stderr=subprocess.STDOUT,
                                   start_new_session=True)
    common.write(rd / "launch.json", {
        "run_id": RUN, "pid": process.pid,
        "utc": datetime.datetime.now(datetime.timezone.utc).isoformat(), "mono_ns": started,
        "argv": argv, "cwd": str(work.relative_to(ROOT)), "fixture": "HOUSE-INPUT-001",
        "mode": "user-operated trace-only bypass-route session; game methods instrumented in isolated JAR copy",
        "instrumented_game_sha256": common.hashlib.sha256(traced_game.read_bytes()).hexdigest(),
        "agent_sha256": common.hashlib.sha256(agent.read_bytes()).hexdigest(),
        "emulator_sha256": common.hashlib.sha256(common.EMU.read_bytes()).hexdigest(),
        "trace_targets": ["ar.keyPressed(I)V raw key", "m.e:I switch operand", "ag.a(II)V args",
                          "br.b()V", "ag.a:Z operand before original IFNE BCI 0", "br.a(JJ)V"],
        "probe_reflection": False, "game_state_reads": False, "game_state_writes": False,
        "input": "user-operated window; no input injection", "rng_controlled": False,
        "host_display": os.environ.get("DISPLAY"),
        "profile": f"FreeJ2ME-Plus 1.52, phone profile {PHONE_PROFILE}, 240x320, limiter 60",
        "phone_profile": PHONE_PROFILE,
        "phone_profile_override": str((rd / "emulator-profile-override.json").relative_to(ROOT))})
    try:
        time.sleep(8)
        if process.poll() is not None:
            raise RuntimeError(f"Emulator exited during startup: {process.returncode}")
        window, tree = common.find_window(process.pid)
        (rd / "window-tree-startup.txt").write_text(tree)
        common.capture(window, rd / "checkpoint-x11.jsonl", shots / "01-startup.png")
        title = "FreeJ2ME-Plus - SCN-0004 bypass trace safe"
        subprocess.run(["xprop", "-id", hex(window), "-set", "WM_NAME", title], check=True)
        subprocess.run(["xprop", "-id", hex(window), "-f", "_NET_WM_NAME", "8s",
                        "-set", "_NET_WM_NAME", title], check=False,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        common.write(rd / "session-status.json", {
            "run_id": RUN, "captured_utc": now, "pid": process.pid, "pid_alive": True,
            "status": f"waiting for user to load Ronin save and reach house-exit loading state under phone profile {PHONE_PROFILE}",
            "user_input_started": False, "harness_input_sent": False,
            "trace_targets": ["ar.keyPressed raw key", "m.e:I state operand", "ag.a(II)V",
                              "br.b ag.a:Z operand", "br.a(JJ)V"],
            "probe_reflection": False, "game_state_reads": False, "game_state_writes": False,
            "next_checkpoint": "load Ronin save; leave house with Down; press Right Soft (W in this run's recorded input map) as soon as NOW LOADING appears; no visible UI change is expected"})
        (rd / "operator-guide.md").write_text(
            "# User-operated scheduler bypass trace\n\n"
            "The target trigger is a natural Right Soft key while `m.e:I=4`. Under the Motorola profile, the recorded host mapping "
            "uses W for Right Soft, which reaches `ar.keyPressed(I)V` as raw -22 and is normalized to -8 before dispatch to `ag.a(II)V`. "
            "The original `br.b()V` then branches around `br.a(JJ)V` while `ag.a:Z` is true. A previous route trace saw state 4 for about 286 ms.\n\n"
            f"This run sets only the copied emulator game profile to `{PHONE_PROFILE}`; the fixture source and JARs are unchanged. "
            "First load the Ronin save and reach the house interior. Press Down to initiate leaving the house, then press **W once "
            "about 0.9 seconds after starting Down**, before waiting for `NOW LOADING` to appear. Do not press W during the initial "
            "save load or in the menu. The route scout measured state 4 beginning about 0.934 seconds after Down and lasting about "
            "286 ms. The R02/R03 attempts show that waiting for the visual loading cue can be too late; no visible UI response is "
            "expected from W. If missed, return indoors and start another exit transition. No harness input is sent.\n\n"
            "The copy-only probe records raw key callback arguments, the actual `m.e:I` operand at the key handler's "
            "tableswitch, `ag.a(II)V` arguments, the `ag.a:Z` operand immediately before `br.b`'s original `IFNE`, and "
            "entry/exit for `br.b` and `br.a(JJ)V`. It uses no reflection, game field reads/writes, or input injection. "
            "Its shutdown gate serializes a contiguous prefix and marks method spans without exits as censored.\n")
        common.append(rd / "timeline.jsonl", "interactive_trace_ready", window=hex(window), title=title,
                      screenshot=str((shots / "01-startup.png").relative_to(ROOT)),
                      targets=["ar.keyPressed(I)V", "ag.a(II)V", "br.b()V ag.a:Z operand", "br.a(JJ)V"],
                      reflection=False, game_state_reads=False)
        print(json.dumps({"run_id": RUN, "pid": process.pid, "window": hex(window), "title": title,
                          "startup_screenshot": str((shots / "01-startup.png").relative_to(ROOT)),
                          "phone_profile": PHONE_PROFILE,
                          "instruction": "Load Ronin, start leaving the house with Down, then press Right Soft (W in the recorded input map) about 0.9 seconds after Down starts, before NOW LOADING appears."}, ensure_ascii=False))
    except Exception as exc:
        common.write(rd / "startup-error.json", {"error": repr(exc), "mono_ns": time.monotonic_ns()})
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=20)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        raise


if __name__ == "__main__":
    main()
