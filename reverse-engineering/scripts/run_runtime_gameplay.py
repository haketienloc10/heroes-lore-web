"""Tiếp tục session smoke ở intro; các kết quả phải được người đọc ảnh đánh giá."""
import json
from pathlib import Path
import sys
import time
sys.dont_write_bytecode = True
from run_runtime_smoke import EVIDENCE, ROOT, PROBE, agent, capture, tap, write


def main():
    repeat = sys.argv[1]
    startup = EVIDENCE / ("M15-SCN-0001-P1M-R" + repeat)
    pid = json.loads((startup / "launch.json").read_text())["pid"]
    rd = EVIDENCE / ("M15-SCN-0005-P1M-R" + repeat)
    rd.mkdir()
    write(rd / "launch.json", {"run_id": rd.name, "pid": pid, "inherited_session": startup.name,
          "menu_run": "M15-SCN-0002-P1M-R" + repeat, "profile": "P1M Motorola",
          "fixture": "New Game / Ronin / Hestia + guardian thứ hai; intro được tạo từ RMS sạch",
          "input_method": "in-process emulator KeyListener; không thao tác tay hoặc ép state"})
    capture(pid, rd, "01-before-Skip")
    tap(pid, rd, 87, wait=2)
    capture(pid, rd, "02-after-Skip")
    time.sleep(8)
    capture(pid, rd, "03-after-load")
    agent(pid, "probe-current.jar", str(rd / "state-after-load.log"))
    for i, (code, label) in enumerate([(40, "Down"), (39, "Right"), (38, "Up"), (37, "Left")], 4):
        tap(pid, rd, code, hold=1000, wait=0)
        capture(pid, rd, f"{i:02d}-{label}-release")
        time.sleep(1)
        capture(pid, rd, f"{i:02d}-{label}-idle")
    tap(pid, rd, 10, wait=1)
    capture(pid, rd, "08-action-Enter")
    tap(pid, rd, 87, wait=1)
    capture(pid, rd, "09-W-menu")
    tap(pid, rd, 87, wait=1)
    capture(pid, rd, "10-close-menu")
    tap(pid, rd, 39, hold=1000, wait=1)
    capture(pid, rd, "11-Right-boundary")
    tap(pid, rd, 39, hold=1000, wait=1)
    capture(pid, rd, "12-Right-again")
    tap(pid, rd, 10, wait=1)
    capture(pid, rd, "13-action-at-boundary")
    tap(pid, rd, 87, wait=1)
    capture(pid, rd, "14-status-final")
    agent(pid, "probe-current.jar", str(rd / "state-final.log"))
    print(json.dumps({"pid": pid, "run_id": rd.name, "status": "Đã thu ảnh/input; chưa đánh dấu đạt"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
