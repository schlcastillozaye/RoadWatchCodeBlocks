import base64, io
from PIL import Image, ImageDraw

def png(color, label):
    im = Image.new("RGB", (160, 120), color)
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 159, 119], outline=(255, 255, 255), width=3)
    # simple "damage" marks
    d.ellipse([30, 30, 90, 70], fill=(20, 20, 20))
    d.line([10, 100, 150, 80], fill=(240, 240, 240), width=4)
    return base64.b64encode(_bytes(im)).decode()

def _bytes(im):
    buf = io.BytesIO()
    im.save(buf, format="PNG", optimize=True)
    return buf.getvalue()

specs = [
    ("BEFORE_POTHOLE", (90, 90, 96)),
    ("BEFORE_FLOOD", (70, 110, 150)),
    ("AFTER_REPAIRED", (120, 140, 120)),
    ("BEFORE_CRACK", (110, 100, 92)),
]
for name, color in specs:
    b = png(color, name)
    print(f'export const {name} = "{b}";')
