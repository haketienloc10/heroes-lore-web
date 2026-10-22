"""External XDamage receive timestamps. Counts damage notifications, not vsync/present.

The server may merge draws; subtract after draining each event. No polling screenshots.
"""
import ctypes as C
import ctypes.util
import json
import select
import sys
import time


def measure(window, seconds, output):
    x = C.CDLL(ctypes.util.find_library('X11'))
    damage = C.CDLL(ctypes.util.find_library('Xdamage'))
    for lib, name, args, result in [
        (x, 'XOpenDisplay', [C.c_char_p], C.c_void_p),
        (x, 'XConnectionNumber', [C.c_void_p], C.c_int),
        (x, 'XPending', [C.c_void_p], C.c_int),
        (x, 'XNextEvent', [C.c_void_p, C.c_void_p], C.c_int),
        (x, 'XFlush', [C.c_void_p], C.c_int),
        (x, 'XSync', [C.c_void_p, C.c_int], C.c_int),
        (x, 'XCloseDisplay', [C.c_void_p], C.c_int),
        (damage, 'XDamageQueryExtension', [C.c_void_p, C.POINTER(C.c_int), C.POINTER(C.c_int)], C.c_int),
        (damage, 'XDamageCreate', [C.c_void_p, C.c_ulong, C.c_int], C.c_ulong),
        (damage, 'XDamageSubtract', [C.c_void_p, C.c_ulong, C.c_ulong, C.c_ulong], None),
        (damage, 'XDamageDestroy', [C.c_void_p, C.c_ulong], None),
    ]:
        f = getattr(lib, name); f.argtypes = args; f.restype = result
    d = x.XOpenDisplay(None)
    if not d:
        raise RuntimeError('XOpenDisplay failed')
    base, error = C.c_int(), C.c_int()
    if not damage.XDamageQueryExtension(d, C.byref(base), C.byref(error)):
        raise RuntimeError('XDamage absent')
    handle = damage.XDamageCreate(d, window, 3)  # XDamageReportNonEmpty
    x.XSync(d, 0)
    event = (C.c_long * 24)()
    while x.XPending(d): x.XNextEvent(d, C.byref(event))
    damage.XDamageSubtract(d, handle, 0, 0); x.XSync(d, 0)
    fd = x.XConnectionNumber(d)
    start = time.monotonic_ns(); end = start + int(seconds * 1e9)
    rows = []
    while time.monotonic_ns() < end:
        if x.XPending(d) == 0:
            select.select([fd], [], [], max(0, min(.1, (end-time.monotonic_ns())/1e9)))
        while x.XPending(d):
            x.XNextEvent(d, C.byref(event))
            now = time.monotonic_ns()
            if C.cast(C.byref(event), C.POINTER(C.c_int))[0] == base.value and now < end:
                rows.append({'seq': len(rows)+1, 't_mono_ns': now, 'x_server_serial': int(event[1])})
                damage.XDamageSubtract(d, handle, 0, 0); x.XFlush(d)
    actual_end = time.monotonic_ns()
    damage.XDamageDestroy(d, handle); x.XCloseDisplay(d)
    result = {'producer': 'Python ctypes XDamageReportNonEmpty, receive time', 'window': hex(window),
              'start_ns': start, 'end_ns': end, 'loop_exit_ns': actual_end,
              'seconds': seconds, 'events': rows, 'physical_presentation': False,
              'coalescence_possible': True, 'clock': time.get_clock_info('monotonic').__dict__}
    output.write_text(json.dumps(result, indent=2)+'\n')
    return result


if __name__ == '__main__':
    from pathlib import Path
    measure(int(sys.argv[1], 0), float(sys.argv[2]), Path(sys.argv[3]))
