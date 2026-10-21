"""Capture cửa sổ X11 và phát input host; không sửa JAR hoặc field của game.

Ví dụ: python3 runtime_x11.py LOG capture WINDOW OUTPUT.png
       python3 runtime_x11.py LOG tap WINDOW 5 100
Ảnh dùng TrueColor RGB 24-bit đã kiểm tra bằng xdpyinfo; input log là host,
không chứng minh callback keyPressed bên trong MIDlet.
"""
import ctypes as C
import ctypes.util
import datetime
import json
from pathlib import Path
import re
import struct
import subprocess
import sys
import time
import zlib


def main():
    log, command, window = Path(sys.argv[1]), sys.argv[2], int(sys.argv[3], 0)
    x = C.CDLL(ctypes.util.find_library("X11"))
    x.XOpenDisplay.restype = C.c_void_p
    d = x.XOpenDisplay(None)
    if not d:
        raise RuntimeError("Không mở được X11 DISPLAY")
    for name, args, result in [
        ("XGetImage", [C.c_void_p, C.c_ulong, C.c_int, C.c_int, C.c_uint, C.c_uint, C.c_ulong, C.c_int], C.c_void_p),
        ("XGetPixel", [C.c_void_p, C.c_int, C.c_int], C.c_ulong),
        ("XDestroyImage", [C.c_void_p], C.c_int),
        ("XCloseDisplay", [C.c_void_p], C.c_int),
        ("XSync", [C.c_void_p, C.c_int], C.c_int),
        ("XSetInputFocus", [C.c_void_p, C.c_ulong, C.c_int, C.c_ulong], C.c_int),
        ("XStringToKeysym", [C.c_char_p], C.c_ulong),
        ("XKeysymToKeycode", [C.c_void_p, C.c_ulong], C.c_uint),
    ]:
        getattr(x, name).argtypes = args
        getattr(x, name).restype = result

    def event(name, **fields):
        row = {"utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
               "mono_ns": time.monotonic_ns(), "producer": "X11 host control",
               "event": name, "window": hex(window), **fields}
        with log.open("a") as f:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    try:
        if command == "capture":
            info = subprocess.check_output(["xwininfo", "-id", hex(window)], text=True)
            width = int(re.search(r"Width: (\d+)", info)[1])
            height = int(re.search(r"Height: (\d+)", info)[1])
            output = Path(sys.argv[4])
            event("capture_begin", width=width, height=height, output=str(output))
            image = x.XGetImage(d, window, 0, 0, width, height, C.c_ulong(-1).value, 2)
            if not image:
                raise RuntimeError("XGetImage không trả ảnh")
            try:
                data = bytearray()
                for yy in range(height):
                    data.append(0)
                    for xx in range(width):
                        pixel = x.XGetPixel(image, xx, yy)
                        data.extend([(pixel >> 16) & 255, (pixel >> 8) & 255, pixel & 255])
            finally:
                x.XDestroyImage(image)

            def chunk(kind, data):
                return struct.pack("!I", len(data)) + kind + data + struct.pack("!I", zlib.crc32(kind + data) & 0xffffffff)

            output.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack("!2I5B", width, height, 8, 2, 0, 0, 0))
                               + chunk(b"IDAT", zlib.compress(bytes(data))) + chunk(b"IEND", b""))
            event("capture_end", output=str(output))
        elif command == "tap":
            key, duration = sys.argv[4], int(sys.argv[5])
            code = x.XKeysymToKeycode(d, x.XStringToKeysym(key.encode("ascii")))
            if not code:
                raise ValueError("Không có X11 keycode cho " + key)
            xt = C.CDLL(ctypes.util.find_library("Xtst"))
            xt.XTestFakeKeyEvent.argtypes = [C.c_void_p, C.c_uint, C.c_int, C.c_ulong]
            x.XSetInputFocus(d, window, 2, 0)
            x.XSync(d, 0)
            event("focus")
            event("key_down", host_keysym=key, x11_keycode=code, planned_hold_ms=duration)
            xt.XTestFakeKeyEvent(d, code, 1, 0)
            x.XSync(d, 0)
            try:
                time.sleep(duration / 1000)
            finally:
                xt.XTestFakeKeyEvent(d, code, 0, 0)
                x.XSync(d, 0)
                event("key_up", host_keysym=key, x11_keycode=code)
        else:
            raise ValueError("capture | tap")
    finally:
        x.XCloseDisplay(d)


if __name__ == "__main__":
    main()
