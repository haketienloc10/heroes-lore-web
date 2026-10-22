"""Capture X11, emulator frontbuffer, and selected state from a render-order run."""
import json
from pathlib import Path
import subprocess
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import run_scheduler_followup_transition as common


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: capture_scheduler_render_order_checkpoint.py PID TAG")
    pid = int(sys.argv[1])
    tag = sys.argv[2]
    if not tag.replace("-", "").isalnum():
        raise ValueError("TAG may contain letters, digits, and hyphens only")
    run = "M15-SCN-0004-E-render-order-R01"
    rd = common.EVIDENCE / run
    shots = common.ROOT / "reference/screenshots" / run
    window, tree = common.find_window(pid)
    (shots / f"window-tree-{tag}.txt").write_text(tree)
    x11_log = rd / "checkpoint-x11.jsonl"
    x11_before = shots / f"02-{tag}-x11-before.png"
    frontbuffer = shots / f"02-{tag}-frontbuffer.png"
    frontbuffer_log = rd / f"frontbuffer-{tag}.log"
    state = rd / f"runtime-state-{tag}.json"
    x11_after = shots / f"02-{tag}-x11-after.png"
    if any(path.exists() for path in (x11_before, frontbuffer, frontbuffer_log, state, x11_after)):
        raise FileExistsError("Checkpoint tag already exists; choose a new TAG")
    common.capture(window, x11_log, x11_before)
    subprocess.run(["java", "--add-modules", "jdk.attach", "-cp", str(common.SIDECARS),
                    "RuntimeStateProbe", str(pid), str(common.SIDECARS / "frame-probe.jar"),
                    str(frontbuffer) + "|" + str(frontbuffer_log)], check=True)
    subprocess.run(["java", "--add-modules", "jdk.attach", "-cp", str(common.SIDECARS),
                    "RuntimeStateProbe", str(pid), str(common.SIDECARS / "runtime-flag-snapshot.jar"),
                    str(state)], check=True)
    common.capture(window, x11_log, x11_after)
    common.append(rd / "timeline.jsonl", "render_order_checkpoint", tag=tag, pid=pid,
                  window=hex(window),
                  screenshots=[str(p.relative_to(common.ROOT)) for p in (x11_before, frontbuffer, x11_after)],
                  state=str(state.relative_to(common.ROOT)),
                  limitations="sequential read-only captures; not synchronized with paint or compositor")
    rows = [json.loads(line) for line in x11_log.read_text().splitlines() if str(x11_before) in line or str(x11_after) in line]
    print(json.dumps({"tag": tag, "window": hex(window), "screenshots": len(rows),
                      "frontbuffer": str(frontbuffer.relative_to(common.ROOT)),
                      "runtime_state": str(state.relative_to(common.ROOT))}, ensure_ascii=False))


if __name__ == "__main__":
    main()
