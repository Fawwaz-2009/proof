"""Place only the emulator's Android display at the origin of the VNC screen."""
import ctypes
import sys
import time

x = ctypes.CDLL("libX11.so.6")
x.XOpenDisplay.argtypes = [ctypes.c_char_p]
x.XOpenDisplay.restype = ctypes.c_void_p
x.XDefaultRootWindow.argtypes = [ctypes.c_void_p]
x.XDefaultRootWindow.restype = ctypes.c_ulong
x.XQueryTree.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.POINTER(ctypes.c_ulong), ctypes.POINTER(ctypes.c_ulong), ctypes.POINTER(ctypes.POINTER(ctypes.c_ulong)), ctypes.POINTER(ctypes.c_uint)]
x.XFetchName.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.POINTER(ctypes.c_char_p)]
x.XMoveWindow.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int, ctypes.c_int]
x.XFree.argtypes = [ctypes.c_void_p]
x.XFlush.argtypes = [ctypes.c_void_p]
x.XCloseDisplay.argtypes = [ctypes.c_void_p]
display = None
for attempt in range(30):
    display = x.XOpenDisplay(b":1")
    if display:
        break
    time.sleep(1)
if not display:
    raise SystemExit("X display is unavailable")
if "--wait-display" in sys.argv:
    x.XCloseDisplay(display)
    raise SystemExit(0)
try:
    for attempt in range(90):
        root, parent, count = ctypes.c_ulong(), ctypes.c_ulong(), ctypes.c_uint()
        children = ctypes.POINTER(ctypes.c_ulong)()
        x.XQueryTree(display, x.XDefaultRootWindow(display), ctypes.byref(root), ctypes.byref(parent), ctypes.byref(children), ctypes.byref(count))
        found = False
        for index in range(count.value):
            title = ctypes.c_char_p()
            if x.XFetchName(display, children[index], ctypes.byref(title)) and title.value:
                name = title.value.decode(errors="replace")
                if name.startswith("Android Emulator -"):
                    x.XMoveWindow(display, children[index], 0, 0)
                    x.XFlush(display)
                    found = True
                x.XFree(title)
        if children:
            x.XFree(children)
        if found:
            print("Android display positioned")
            break
        time.sleep(1)
    else:
        raise SystemExit("Android display window was not created")
finally:
    x.XCloseDisplay(display)
