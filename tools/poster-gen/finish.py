# Converts Chrome screenshots into app assets and checks poster-title contrast (ux-design §3, MF-8).
import json, sys
from PIL import Image
tmp, out, titles = sys.argv[1], sys.argv[2], json.loads(sys.argv[3])
web = sys.argv[4] if len(sys.argv) > 4 else None  # phone PWA thumbnails (220x330 JPEG)
TEXT = (0xF4, 0xF1, 0xEA)
def lum(rgb):
    def c(v):
        v = v / 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = (c(x) for x in rgb[:3])
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
def ratio(a, b):
    la, lb = sorted([lum(a), lum(b)], reverse=True)
    return (la + 0.05) / (lb + 0.05)
ok = True
for t in titles:
    s = t["slug"]
    Image.open(f"{tmp}/{s}-poster.png").convert("RGB").save(f"{out}/{s}-poster.png", optimize=True)
    Image.open(f"{tmp}/{s}-backdrop.png").convert("RGB").resize((960, 540), Image.LANCZOS).save(f"{out}/{s}-backdrop.jpg", quality=82, optimize=True)
    if web:
        Image.open(f"{tmp}/{s}-poster.png").convert("RGB").resize((220, 330), Image.LANCZOS).save(f"{web}/{s}.jpg", quality=85, optimize=True)
    if t.get("noTitle"):
        continue
    # Title sits in the bottom ~35% (recipe: baseline at 80% height). Worst case = 95th-percentile
    # brightest background pixel in that band of the no-title render.
    bg = Image.open(f"{tmp}/{s}-poster-notitle.png").convert("RGB")
    band = bg.crop((int(440 * .06), int(660 * .58), int(440 * .94), int(660 * .84)))
    px = sorted(list(band.getdata()), key=lum)
    worst = px[int(len(px) * .95)]
    r = ratio(TEXT, worst)
    print(f"{s}: title contrast vs 95th-pct background = {r:.2f}:1 {'OK' if r >= 4.5 else 'FAIL'}")
    ok = ok and r >= 4.5
if not ok:
    sys.exit("poster title contrast below 4.5:1")
