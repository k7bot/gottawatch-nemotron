# Renders concept SVGs -> PNG previews + contact sheet. Run: python3 build.py
import cairosvg, io, os
from PIL import Image, ImageDraw, ImageFont
BG="#0E1020"; A="#F2B45A"; T="#F4F1EA"; SKY="#86BDEB"; S2="#23273F"
def wrap(body): return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"><rect width="1024" height="1024" fill="{BG}"/>{body}</svg>'
C={
# 1 Handoff G: thick G arc whose bar becomes an arrow -> "sent to you"
"1-handoff-g": wrap(f'<path d="M742 330 A300 300 0 1 0 812 512 H560" fill="none" stroke="{A}" stroke-width="128" stroke-linecap="round" stroke-linejoin="round"/><path d="M560 400 L440 512 L560 624 Z" fill="{A}" transform="translate(-10 0)"/>'),
# 2 Linked rings: two-way connection; overlap lens = shared pick
"2-two-way-rings": wrap(f'<defs><clipPath id="l"><circle cx="400" cy="512" r="240"/></clipPath></defs><circle cx="624" cy="512" r="240" fill="{A}" clip-path="url(#l)"/><circle cx="400" cy="512" r="240" fill="none" stroke="{T}" stroke-width="72"/><circle cx="624" cy="512" r="240" fill="none" stroke="{A}" stroke-width="72"/>'),
# 3 Pick bubble: rounded screen with a speech tail + amber dot = a friend's pick on your screen
"3-pick-bubble": wrap(f'<path d="M232 260 H792 a80 80 0 0 1 80 80 V640 a80 80 0 0 1 -80 80 H460 L300 840 V720 H232 a80 80 0 0 1 -80 -80 V340 a80 80 0 0 1 80 -80 Z" fill="{A}"/><circle cx="512" cy="490" r="96" fill="{BG}"/>'),
# 4 Folded ticket corner: amber tile with a dog-eared corner (a pick, saved for you)
"4-dogear": wrap(f'<path d="M232 200 H632 L792 360 V824 H232 Z" fill="{A}"/><path d="M632 200 V360 H792 Z" fill="{T}"/><path d="M360 600 L470 700 L680 470" fill="none" stroke="{BG}" stroke-width="84" stroke-linecap="round" stroke-linejoin="round"/>'),
# 5 Gw monogram eye: almond eye made of two arcs, pupil offset = "gotta watch"
"5-glance": wrap(f'<path d="M140 512 Q512 140 884 512 Q512 884 140 512 Z" fill="none" stroke="{A}" stroke-width="84" stroke-linejoin="round"/><circle cx="560" cy="512" r="130" fill="{T}"/><circle cx="600" cy="472" r="40" fill="{BG}"/>'),
}
os.makedirs("png",exist_ok=True)
def png(svg,s): return Image.open(io.BytesIO(cairosvg.svg2png(bytestring=svg.encode(),output_width=s,output_height=s))).convert("RGBA")
def mask(im,r):
    m=Image.new("L",im.size,0); ImageDraw.Draw(m).rounded_rectangle([0,0,im.size[0]-1,im.size[1]-1],r,fill=255); im.putalpha(m); return im
F=lambda s:ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",s)
for k,v in C.items():
    open(f"svg/{k}.svg","w").write(v+"\n")
    for s in (1024,180,48): png(v,s).save(f"png/{k}-{s}.png")
# contact sheet: per concept row: 180 / 60 / 29 on dark + light wallpapers
W,H=1500,260*len(C)+80; sh=Image.new("RGB",(W,H),"#ffffff"); d=ImageDraw.Draw(sh)
d.text((20,20),"Gottawatch icon concepts — 180 / 60 / 29 px on dark and light home screens",fill="#111",font=F(26))
for i,(k,v) in enumerate(C.items()):
    y=80+i*260
    for j,(bg,fg) in enumerate([("#1b1d27","#eee"),("#e9e6f2","#222")]):
        x0=260+j*620; d.rectangle([x0,y,x0+600,y+240],fill=bg); x=x0+20
        for s in (180,60,29):
            ic=mask(png(v,s),int(s*0.225)); sh.paste(ic,(x,y+(240-s)//2-10),ic)
            d.text((x,y+(240+s)//2-4),"Gottawatch"[: max(4,s//8)],fill=fg,font=F(12)); x+=s+40
    d.text((20,y+110),k,fill="#111",font=F(20))
sh.save("contact-sheet.png")
