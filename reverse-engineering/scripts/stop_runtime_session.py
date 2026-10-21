"""Dừng đúng PID của session do harness tạo; snapshot storage sau khi tiến trình dừng."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import time
sys.dont_write_bytecode = True
from run_runtime_smoke import EVIDENCE, ROOT, EMULATOR, write


def main():
    rd = EVIDENCE / sys.argv[1]
    launch = json.loads((rd / "launch.json").read_text())
    pid = launch["pid"]
    cmdline = Path(f"/proc/{pid}/cmdline").read_bytes().split(b"\0")
    if str(EMULATOR).encode() not in cmdline or Path(f"/proc/{pid}/cwd").resolve() != Path(launch["cwd"]):
        raise RuntimeError("PID/cwd không còn khớp session; từ chối dừng process khác")
    for name, args in [("threads-final.txt", ["Thread.print"]), ("system-properties.txt", ["VM.system_properties"])]:
        result = subprocess.run(["jcmd", str(pid), *args], capture_output=True, text=True)
        (rd / name).write_text(result.stdout + result.stderr)
    os.kill(pid, signal.SIGTERM)
    stopped = False
    for _ in range(100):
        stat = Path(f"/proc/{pid}/stat")
        if not stat.exists() or stat.read_text().split(") ", 1)[1].startswith("Z"):
            stopped = True
            break
        time.sleep(0.1)
    write(rd / "stop.json", {"utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
          "method": "SIGTERM do harness gửi; không kiểm thử thoát/save qua UI", "process_stopped": stopped})
    if not stopped:
        raise RuntimeError("Chưa dừng process; không snapshot storage đang hoạt động")
    work = Path(launch["cwd"])
    rows = []
    for p in sorted(work.rglob("*")):
        if not p.is_file():
            continue
        rows.append({"path": str(p.relative_to(ROOT)), "size": p.stat().st_size,
                     "sha256": hashlib.sha256(p.read_bytes()).hexdigest()})
        if p.suffix in [".conf", ".log"]:
            dest = rd / "artifacts" / p.relative_to(work)
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(p, dest)
    write(rd / "storage-manifest.json", {"snapshot_after_process_stopped": True, "files": rows,
          "note": "Metadata/config/log; RMS nhị phân chỉ local, chưa xác minh save/load semantics"})


if __name__ == "__main__":
    main()
