from collections import Counter
from PIL import Image
import sys

paths = sys.argv[1:] or ["FINAL Brandsheet.png"]
for path in paths:
    im = Image.open(path).convert("RGB")
    w, h = im.size
    print("=== %s  %dx%d" % (path, w, h))
    px = list(im.getdata())
    c = Counter(px)
    total = len(px)
    for (col, n) in c.most_common(14):
        r, g, b = col
        print("  #%02X%02X%02X  %6.3f%%" % (r, g, b, 100.0 * n / total))
    print()
