"""Lượt smoke có kiểm soát M1.5; không tự đánh dấu scenario đạt.

Chạy từ repo: python3 reverse-engineering/scripts/run_runtime_smoke.py 02
Yêu cầu đã compile các probe theo README evidence, không có thao tác tay.
Để emulator mở ở cuối chuỗi cho bước gameplay thích nghi theo ảnh thực tế.
"""
import datetime
import json
from pathlib import Path
import re
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / "reverse-engineering/findings/evidence/milestone-1.5/runtime-20261021"
PROBE = Path("/tmp/heroes-lore-runtime-probe")
EMULATOR = Path("/home/locdt/tools/freej2me-plus-v1.52/freej2me.jar")


def write(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


def agent(pid, jar, args):
    subprocess.run(["java", "--add-modules", "jdk.attach", "-cp", str(PROBE),
                    "RuntimeStateProbe", str(pid), str(PROBE / jar), args], check=True)


def capture(pid, rd, name):
    image_dir = ROOT / "reference/screenshots" / rd.name
    image_dir.mkdir(parents=True, exist_ok=True)
    agent(pid, "frame-probe.jar", str(image_dir / (name + ".png")) + "|" + str(rd / "framebuffer.log"))


def tap(pid, rd, code, hold=100, wait=0.7):
    agent(pid, "probe-current.jar", str(rd / "input.log") + "|" + str(code) + "|" + str(hold))
    time.sleep(wait)


def main():
    repeat = sys.argv[1]
    name = "M15-SCN-0001-P1M-R" + repeat
    rd = EVIDENCE / name
    rd.mkdir()  # Không ghi đè run cũ.
    work = ROOT / "reference/recordings" / name
    work.mkdir(parents=True)
    image_dir = ROOT / "reference/screenshots" / name
    image_dir.mkdir(parents=True)
    argv = ["java", "-Dfile.encoding=ISO_8859_1", "-Dsun.java2d.uiScale=1", "-jar", str(EMULATOR),
            (ROOT / "original/heroes-lore-v2.1.2.jar").as_uri(), "0", "240", "320", "2", "2", "60"]
    start = time.monotonic_ns()
    with (rd / "console.log").open("w") as log:
        process = subprocess.Popen(argv, cwd=work, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    write(rd / "launch.json", {"run_id": name, "pid": process.pid,
          "utc": datetime.datetime.now(datetime.timezone.utc).isoformat(), "mono_ns": start,
          "argv": argv, "cwd": str(work), "profile": "P1M Motorola, 240×320, limiter60, scale2 requested",
          "rms_before": "directory mới", "input_coordination": "Người dùng đã chọn agent tự động, không thao tác tay",
          "instrumentation_at_launch": False, "later_probes": "đọc state/framebuffer và injection emulator KeyListener; không transform class"})
    time.sleep(10)
    tree = subprocess.check_output(["xwininfo", "-root", "-tree"], text=True)
    (rd / "window-tree.txt").write_text(tree)
    canvas = re.findall(r'(0x[0-9a-f]+) "sun-awt-X11-XCanvasPeer"', tree)[-1]
    subprocess.run(["python3", str(ROOT / "reverse-engineering/scripts/runtime_x11.py"), str(rd / "capture-x11.jsonl"),
                    "capture", canvas, str(image_dir / "01-10s-X11.png")], check=True)
    capture(process.pid, rd, "02-10s-framebuffer")
    agent(process.pid, "probe-current.jar", str(rd / "state-before-input.log"))
    tap(process.pid, rd, 10, wait=2)
    capture(process.pid, rd, "03-after-startup-Enter")
    agent(process.pid, "probe-current.jar", str(rd / "state-after-startup.log"))

    menu = EVIDENCE / ("M15-SCN-0002-P1M-R" + repeat)
    menu.mkdir()
    write(menu / "launch.json", {"run_id": menu.name, "pid": process.pid, "inherited_session": name,
          "input_method": "in-process emulator AWT KeyListener; không ép state", "profile": "P1M Motorola"})
    steps = [(40, "Down"), (38, "Up"), (10, "open-Ronin"), (87, "Back"),
             (10, "open-Ronin-again"), (10, "guardian-message"), (10, "guardian-list"),
             (10, "select-Hestia"), (39, "second-guardian"), (10, "confirm-two-guardians"),
             (37, "Yes"), (10, "start-loading")]
    for i, (code, label) in enumerate(steps, 1):
        tap(process.pid, menu, code)
        capture(process.pid, menu, f"{i:02d}-{label}")
    time.sleep(10)
    capture(process.pid, menu, "13-after-load")
    agent(process.pid, "probe-current.jar", str(menu / "state-after-load.log"))
    print(json.dumps({"pid": process.pid, "startup": name, "menu": menu.name,
                      "status": "Cần xem ảnh trước bước gameplay; chưa đánh dấu đạt"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
