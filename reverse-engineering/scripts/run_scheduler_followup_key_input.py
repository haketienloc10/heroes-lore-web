"""Capture host X11 key-repeat and overlapping-key callbacks in FreeJ2ME.

The game/emulator copies and bounded dialogue-safe probe already exist. XTest
events are host-simulated input; they are not physical keyboard evidence.
"""
import ctypes as C
import ctypes.util
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import run_scheduler_followup_transition as common

ROOT = common.ROOT
EVIDENCE = common.EVIDENCE
BUILD = ROOT / "reference/recordings/scheduler-probe-followup-20261022-dialogue-r2"
GAME = ROOT / "original/heroes-lore-v2.1.2.jar"
EMU = Path("/home/locdt/tools/freej2me-plus-v1.52/freej2me.jar")
SNAPSHOT = ROOT / "reference/recordings/snapshots/HOUSE-INPUT-001"
RUN = "M15-SCN-0004-E-key-input-R02"
RUN_DIR = EVIDENCE / RUN
GAME_SHA256 = "7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61"
EMU_SHA256 = "92f84012958f2ca0692dbe7d258cea7aebd4e96f664445d8e92dd0297e12df0e"
BUILD_HASHES = {
    "probe-dialogue-safe.jar": "e895df1f05fec051a988bda40be08681695ce16e023c71d8f917fb4b94ed6557",
    "game-traced.jar": "098edbe73145c677536d4d65315d1b0562093a7cb18f495fd47ae741c06618ce",
    "emulator-traced.jar": "5d9d0c3d9860e904e38afc1f690a9c5990fdd1c0220133df1958cedee1215300",
}


def digest(path):
    h = hashlib.sha256(path.read_bytes()).hexdigest()
    try:
        name = str(path.relative_to(ROOT))
    except ValueError:
        name = str(path)
    return {"path": name, "size": path.stat().st_size, "sha256": h}


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


class XKeyboardState(C.Structure):
    _fields_ = [("key_click_percent", C.c_int), ("bell_percent", C.c_int),
                ("bell_pitch", C.c_uint), ("bell_duration", C.c_uint),
                ("led_mask", C.c_ulong), ("global_auto_repeat", C.c_int),
                ("auto_repeats", C.c_char * 32)]


class XTestKeyboard:
    def __init__(self, log_path):
        lib_x11 = ctypes.util.find_library("X11")
        lib_xtst = ctypes.util.find_library("Xtst")
        if not lib_x11 or not lib_xtst:
            raise RuntimeError(f"XTest libraries unavailable: X11={lib_x11}, Xtst={lib_xtst}")
        self.x = C.CDLL(lib_x11)
        self.xt = C.CDLL(lib_xtst)
        self.x.XOpenDisplay.argtypes = [C.c_char_p]
        self.x.XOpenDisplay.restype = C.c_void_p
        self.display = self.x.XOpenDisplay(None)
        if not self.display:
            raise RuntimeError("Cannot connect to the configured X11 display")
        self.x.XStringToKeysym.argtypes = [C.c_char_p]
        self.x.XStringToKeysym.restype = C.c_ulong
        self.x.XKeysymToKeycode.argtypes = [C.c_void_p, C.c_ulong]
        self.x.XKeysymToKeycode.restype = C.c_uint
        self.x.XSetInputFocus.argtypes = [C.c_void_p, C.c_ulong, C.c_int, C.c_ulong]
        self.x.XSetInputFocus.restype = C.c_int
        self.x.XSync.argtypes = [C.c_void_p, C.c_int]
        self.x.XSync.restype = C.c_int
        self.x.XCloseDisplay.argtypes = [C.c_void_p]
        self.x.XCloseDisplay.restype = C.c_int
        self.x.XGetKeyboardControl.argtypes = [C.c_void_p, C.POINTER(XKeyboardState)]
        self.x.XGetKeyboardControl.restype = C.c_int
        self.xt.XTestFakeKeyEvent.argtypes = [C.c_void_p, C.c_uint, C.c_int, C.c_ulong]
        self.xt.XTestFakeKeyEvent.restype = C.c_int
        self.log_path = log_path
        self.keycodes = {}

    def repeat_settings(self):
        state = XKeyboardState()
        ok = self.x.XGetKeyboardControl(self.display, C.byref(state))
        raw_map = C.string_at(C.addressof(state) + XKeyboardState.auto_repeats.offset, 32)
        per_key = {}
        for keysym in ("KP_6", "KP_8"):
            code = self.keycode(keysym)
            byte = raw_map[code >> 3]
            mask = 1 << (code & 7)
            per_key[keysym] = {"keycode": code,
                               "enabled": bool(state.global_auto_repeat and (byte & mask))}
        return {"query_succeeded": bool(ok), "global_auto_repeat": state.global_auto_repeat,
                "key_auto_repeat": per_key, "display": os.environ.get("DISPLAY"),
                "note": "XGetKeyboardControl reports repeat enablement; this server API does not expose delay/rate here."}

    def keycode(self, keysym):
        if keysym not in self.keycodes:
            symbol = self.x.XStringToKeysym(keysym.encode("ascii"))
            code = self.x.XKeysymToKeycode(self.display, symbol) if symbol else 0
            if not code:
                raise RuntimeError(f"No X11 keycode for {keysym}")
            self.keycodes[keysym] = int(code)
        return self.keycodes[keysym]

    def focus(self, window):
        self.x.XGetInputFocus.argtypes = [C.c_void_p, C.POINTER(C.c_ulong), C.POINTER(C.c_int)]
        self.x.XGetInputFocus.restype = C.c_int
        self.x.XSetInputFocus(self.display, window, 2, 0)
        self.x.XSync(self.display, 0)
        focus_window, revert_to = C.c_ulong(), C.c_int()
        ok = self.x.XGetInputFocus(self.display, C.byref(focus_window), C.byref(revert_to))
        self.event("focus", requested_window=hex(window), query_succeeded=bool(ok),
                   actual_window=hex(focus_window.value), revert_to=revert_to.value)
        if not ok or focus_window.value != window:
            raise RuntimeError(f"X11 focus mismatch: requested={hex(window)} actual={hex(focus_window.value)}")

    def event(self, name, **fields):
        row = {"utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
               "mono_ns": time.monotonic_ns(), "producer": "X11 XTest host input",
               "event": name, **fields}
        with self.log_path.open("a") as f:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    def send(self, keysym, pressed, phase):
        code = self.keycode(keysym)
        ok = self.xt.XTestFakeKeyEvent(self.display, code, int(pressed), 0)
        self.x.XSync(self.display, 0)
        if not ok:
            raise RuntimeError(f"XTestFakeKeyEvent failed for {keysym} pressed={pressed}")
        self.event("key_down" if pressed else "key_up", keysym=keysym,
                   x11_keycode=code, phase=phase)

    def tap(self, keysym, duration_ms, phase):
        self.send(keysym, True, phase)
        try:
            time.sleep(duration_ms / 1000)
        finally:
            self.send(keysym, False, phase)

    def close(self):
        if self.display:
            self.x.XCloseDisplay(self.display)
            self.display = None


def read_trace(path):
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def summarize(rows, spans):
    result = {}
    for name, bounds in spans.items():
        start, end = bounds
        hits = [row for row in rows if row.get("method") == "ar.keyPressed(I)V"
                and row.get("phase") == "entry"
                and start <= row.get("t_mono_ns", 0) <= end]
        by_raw = {}
        for row in hits:
            by_raw[str(row.get("arg0_int"))] = by_raw.get(str(row.get("arg0_int")), 0) + 1
        result[name] = {"ar_keyPressed_entries": len(hits), "entries_by_raw_key": by_raw,
                        "distinct_raw_keys": sorted(by_raw, key=lambda value: int(value))}
    repeat = result.get("single_key_hold", {}).get("entries_by_raw_key", {})
    result["repeat_callback_observed"] = any(count >= 2 for count in repeat.values())
    overlap = result.get("overlapping_keys", {}).get("distinct_raw_keys", [])
    result["multiple_raw_keys_observed_during_overlap"] = len(overlap) >= 2
    any_callbacks = any(result.get(name, {}).get("ar_keyPressed_entries", 0)
                        for name in ("single_key_hold", "overlapping_keys"))
    result["interpretation_limit"] = (
        "X11 XTest host-generated events only; not physical keyboard evidence. "
        "Callback counts show delivery to ar.keyPressed, not action-state consumption or rendered response. "
        "Zero callbacks means the host-input path was not validated and says nothing about game repeat behavior.")
    result["host_input_reached_game_callback"] = bool(any_callbacks)
    return result


def main():
    if RUN_DIR.exists():
        raise RuntimeError(f"Refusing to overwrite {RUN_DIR}")
    if hashlib.sha256(GAME.read_bytes()).hexdigest() != GAME_SHA256:
        raise RuntimeError("Original game JAR identity mismatch")
    if hashlib.sha256(EMU.read_bytes()).hexdigest() != EMU_SHA256:
        raise RuntimeError("Original emulator JAR identity mismatch")
    for name, expected in BUILD_HASHES.items():
        path = BUILD / name
        if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise RuntimeError(f"Existing safe-probe build hash mismatch: {path}")
    RUN_DIR.mkdir(parents=True)
    screenshots = ROOT / "reference/screenshots" / RUN
    screenshots.mkdir(parents=True)
    host_log = RUN_DIR / "host-input.jsonl"
    timeline = RUN_DIR / "timeline.jsonl"
    trace_path = RUN_DIR / "trace.jsonl"
    scratch = tempfile.TemporaryDirectory(prefix="heroes-lore-key-input-")
    work = Path(scratch.name) / "work"
    process = None
    keyboard = None
    spans = {}
    failures = []
    fixture_checks = []
    try:
        fixture_checks = common.copy_fixture(work)
        config = work / "config/Heroes Lore/game.conf"
        if "phone:Standard" not in config.read_text(errors="replace"):
            raise RuntimeError("Fixture profile is not phone:Standard")
        argv = ["java", "-Dfile.encoding=ISO_8859_1", "-Dsun.java2d.uiScale=1",
                f"-javaagent:{BUILD / 'probe-dialogue-safe.jar'}={trace_path}|{RUN}",
                "-jar", str(BUILD / "emulator-traced.jar"),
                (BUILD / "game-traced.jar").as_uri(), "0", "240", "320", "2", "2", "60"]
        started = time.monotonic_ns()
        with (RUN_DIR / "console.log").open("w") as console:
            process = subprocess.Popen(argv, cwd=work, stdout=console, stderr=subprocess.STDOUT,
                                       start_new_session=True)
        write(RUN_DIR / "launch.json", {
            "run_id": RUN, "utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "mono_ns": started, "pid": process.pid, "argv": argv,
            "fixture": "HOUSE-INPUT-001", "fixture_verified_files": len(fixture_checks),
            "work_copy_profile": "phone:Standard",
            "restore_input": "RuntimeStateProbe AWT KeyListener sidecar",
            "stimulus_input": "X11 XTestFakeKeyEvent",
            "trace_target": ["ar.keyPressed(I)V", "ag.a(II)V"],
            "probe_reflection": False, "game_state_reads": False,
            "original_game_sha256": GAME_SHA256, "original_emulator_sha256": EMU_SHA256,
            "build_manifest": str((BUILD / "build-manifest.json").relative_to(ROOT)),
            "build_sha256": BUILD_HASHES, "display": os.environ.get("DISPLAY"),
            "input_caveat": "host-simulated X11 events; not physical keyboard evidence"})

        time.sleep(10)
        if process.poll() is not None:
            raise RuntimeError(f"Emulator exited during startup: {process.returncode}")
        window, tree = common.find_window(process.pid)
        (RUN_DIR / "window-tree.txt").write_text(tree)
        common.capture(window, RUN_DIR / "checkpoint-x11.jsonl", screenshots / "01-startup.png")
        canvas_matches = re.findall(r'^\s*(0x[0-9a-fA-F]+) "sun-awt-X11-XCanvasPeer"', tree, re.MULTILINE)
        if len(canvas_matches) != 1:
            raise RuntimeError(f"Expected one AWT Canvas peer in X11 tree; found {canvas_matches}")
        canvas_window = int(canvas_matches[0], 16)
        # Restore HOUSE-INPUT-001 through the known emulator-side AWT route;
        # XTest is reserved for the measured key-hold and overlap windows.
        for index, post_wait in enumerate((1.0, 1.0, 10.0), 1):
            out = RUN_DIR / f"restore-input-{index:02d}.log"
            common.agent(process.pid, common.SIDECARS / "probe-current.jar",
                         f"{out}|10|100")
            with (RUN_DIR / "timeline.jsonl").open("a") as f:
                f.write(json.dumps({"mono_ns": time.monotonic_ns(), "event": "fixture_restore_key",
                                    "step": index, "awt_code": 10, "hold_ms": 100,
                                    "producer": "RuntimeStateProbe AWT KeyListener"}) + "\n")
            time.sleep(post_wait)
        common.capture(window, RUN_DIR / "checkpoint-x11.jsonl", screenshots / "02-gameplay.png")
        keyboard = XTestKeyboard(host_log)
        settings = keyboard.repeat_settings()
        write(RUN_DIR / "x11-repeat-settings.json", settings)
        keyboard.focus(canvas_window)
        print(json.dumps({"checkpoint": str((screenshots / "02-gameplay.png").relative_to(ROOT)),
                          "repeat_settings": settings,
                          "prompt": "Inspect that the checkpoint shows the loaded game world. Type run to capture the two key-input windows, or abort.",
                          "process_pid": process.pid}, ensure_ascii=False), flush=True)
        decision = input("checkpoint ready [run/abort]: ").strip().lower()
        if decision != "run":
            raise RuntimeError("operator checkpoint review aborted the input windows")

        # One sustained host key-down long enough to cross X11 auto-repeat delay.
        hold_ms = 1800
        spans["single_key_hold"] = [time.monotonic_ns(), 0]
        keyboard.event("stimulus_begin", stimulus="single_key_hold", keysym="KP_6", hold_ms=hold_ms)
        keyboard.send("KP_6", True, "single_key_hold")
        try:
            time.sleep(hold_ms / 1000)
        finally:
            keyboard.send("KP_6", False, "single_key_hold")
        spans["single_key_hold"][1] = time.monotonic_ns()
        keyboard.event("stimulus_end", stimulus="single_key_hold")
        time.sleep(0.7)

        # Two distinct host keys overlap for 600 ms; the trace records game callbacks.
        spans["overlapping_keys"] = [time.monotonic_ns(), 0]
        keyboard.event("stimulus_begin", stimulus="overlapping_keys", keysyms=["KP_6", "KP_8"])
        keyboard.send("KP_6", True, "overlapping_keys")
        time.sleep(0.15)
        keyboard.send("KP_8", True, "overlapping_keys")
        time.sleep(0.6)
        keyboard.send("KP_8", False, "overlapping_keys")
        time.sleep(0.15)
        keyboard.send("KP_6", False, "overlapping_keys")
        spans["overlapping_keys"][1] = time.monotonic_ns()
        keyboard.event("stimulus_end", stimulus="overlapping_keys")
        time.sleep(1.5)
        common.capture(window, RUN_DIR / "checkpoint-x11.jsonl", screenshots / "03-after-input.png")

    except Exception as exc:
        failures.append(repr(exc))
    finally:
        if keyboard:
            keyboard.close()
        if process is not None and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=20)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        if process is not None:
            write(RUN_DIR / "process-exit.json", {
                "returncode": process.returncode,
                "proc_absent": not Path(f"/proc/{process.pid}").exists(),
                "mono_ns": time.monotonic_ns()})
        scratch.cleanup()

    rows = read_trace(trace_path)
    summary = summarize(rows, spans)
    health_path = RUN_DIR / "trace-health.json"
    if not health_path.exists():
        failures.append("safe trace probe did not flush trace-health.json")
    else:
        health = json.loads(health_path.read_text())
        if health.get("dropped", 0):
            failures.append(f"trace collector dropped {health['dropped']} events")
    if not spans:
        summary["status"] = "checkpoint_aborted_or_capture_failed"
    else:
        summary["status"] = "captured" if not failures else "invalid"
        if not failures and not summary.get("host_input_reached_game_callback"):
            summary["status"] = "host_input_not_received"
    summary["run_id"] = RUN
    summary["trace_event_count"] = len(rows)
    summary["fixture_verified_files"] = len(fixture_checks)
    summary["failures"] = failures
    summary["stimulus_windows_mono_ns"] = spans
    write(RUN_DIR / "key-input-analysis.json", summary)
    write(RUN_DIR / "fixture-verification.json", {
        "source_manifest": str(common.SNAPSHOT_MANIFEST.relative_to(ROOT)),
        "verified_files": len(fixture_checks), "files": fixture_checks})

    files = [path for path in RUN_DIR.rglob("*") if path.is_file() and path.name != "manifest.json"]
    files.extend(path for path in screenshots.rglob("*") if path.is_file())
    write(RUN_DIR / "manifest.json", {"run_id": RUN,
                                      "files": [digest(path) for path in sorted(files)]})
    print(json.dumps({"run_id": RUN, "status": summary["status"],
                      "analysis": {key: summary.get(key) for key in (
                          "single_key_hold", "overlapping_keys", "repeat_callback_observed",
                          "multiple_raw_keys_observed_during_overlap", "trace_event_count", "failures")},
                      "manifest": str((RUN_DIR / "manifest.json").relative_to(ROOT))}, ensure_ascii=False))
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
