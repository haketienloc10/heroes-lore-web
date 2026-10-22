"""Capture X11, emulator frontbuffer and selected state from a paused baseline run."""
import json
from pathlib import Path
import subprocess
import sys
import time

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import run_scheduler_followup_transition as common


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: capture_scheduler_hud_checkpoint.py PID TAG")
    pid = int(sys.argv[1])
    tag = sys.argv[2]
    if not tag.replace("-", "").isalnum():
        raise ValueError("TAG may contain letters, digits, and hyphens only")
    run = "M15-SCN-0004-E-hud-diagnosis-R01"
    rd = common.EVIDENCE / run
    shots = common.ROOT / "reference/screenshots" / run
    window, tree = common.find_window(pid)
    (shots / f"window-tree-{tag}.txt").write_text(tree)
    x11_log = rd / "checkpoint-x11.jsonl"
    x11_before = shots / f"02-{tag}-x11-before.png"
    frontbuffer = shots / f"02-{tag}-frontbuffer.png"
    framebuffer_log = rd / f"frontbuffer-{tag}.log"
    state_snapshot = rd / f"runtime-state-{tag}.json"
    x11_after = shots / f"02-{tag}-x11-after.png"
    outputs = [x11_before, frontbuffer, framebuffer_log, state_snapshot, x11_after]
    if any(path.exists() for path in outputs):
        raise FileExistsError("Checkpoint tag already exists; choose a new TAG")

    common.capture(window, x11_log, x11_before)
    subprocess.run(["java", "--add-modules", "jdk.attach", "-cp", str(common.SIDECARS),
                    "RuntimeStateProbe", str(pid), str(common.SIDECARS / "frame-probe.jar"),
                    str(frontbuffer) + "|" + str(framebuffer_log)], check=True)
    subprocess.run(["java", "--add-modules", "jdk.attach", "-cp", str(common.SIDECARS),
                    "RuntimeStateProbe", str(pid), str(common.SIDECARS / "runtime-flag-snapshot.jar"),
                    str(state_snapshot)], check=True)
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline and not state_snapshot.exists():
        time.sleep(0.05)
    if not state_snapshot.exists():
        raise TimeoutError("Runtime state sidecar did not write its snapshot")
    common.capture(window, x11_log, x11_after)
    common.append(rd / "timeline.jsonl", "hud_diagnostic_checkpoint", tag=tag,
                  window=hex(window), pid=pid,
                  screenshots=[str(path.relative_to(common.ROOT)) for path in (x11_before, frontbuffer, x11_after)],
                  state=str(state_snapshot.relative_to(common.ROOT)),
                  limitations="sequential captures; frontbuffer read is not synchronized with paint or compositor")
    before = [json.loads(line) for line in x11_log.read_text().splitlines()
              if str(x11_before) in line]
    after = [json.loads(line) for line in x11_log.read_text().splitlines()
             if str(x11_after) in line]
    print(json.dumps({"tag": tag, "window": hex(window), "x11_before": str(x11_before.relative_to(common.ROOT)),
                      "frontbuffer": str(frontbuffer.relative_to(common.ROOT)),
                      "runtime_state": str(state_snapshot.relative_to(common.ROOT)),
                      "x11_after": str(x11_after.relative_to(common.ROOT)),
                      "x11_capture_events": len(before) + len(after)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
