from collections import Counter
from PIL import Image
import sys

paths = sys.argv[1:] or ["FINAL Brandsheet.png"]
for path in paths:
    im = Image.open(path).convert("RGB")
    w, h = im.size
    print("=== %s  %dx%d" % (path, w, h))
    small = im.resize((max(1, w // 2), max(1, h // 2)))
    px = list(small.getdata())
    q = [(r // 16 * 16, g // 16 * 16, b // 16 * 16) for (r, g, b) in px]
    c = Counter(q)
    total = len(q)
    for (col, n) in c.most_common(20):
        r, g, b = col
        print("  #%02X%02X%02X  %6.2f%%" % (r, g, b, 100.0 * n / total))
    print()
