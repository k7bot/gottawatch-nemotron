# Eye refinements (concept 5). Run: python3 build_eye.py
import cairosvg, io, os
from PIL import Image, ImageDraw, ImageFont
BG="#0E1020"; A="#F2B45A"; T="#F4F1EA"
EYE='M96 512 Q512 40 928 512 Q512 984 96 512 Z'
def W(b): return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"><rect width="1024" height="1024" fill="{BG}"/>{b}</svg>'
C={
"5a-play-glint": W(f'<path d="{EYE}" fill="{A}"/><circle cx="512" cy="512" r="150" fill="{BG}"/><path d="M490 450 L490 574 L590 512 Z" fill="{T}" stroke="{T}" stroke-width="18" stroke-linejoin="round"/>'),
"5b-heart-glint": W(f'<path d="{EYE}" fill="{A}"/><circle cx="512" cy="512" r="150" fill="{BG}"/><path d="M512 590 C430 535 420 470 465 455 C490 447 512 465 512 485 C512 465 534 447 559 455 C604 470 594 535 512 590 Z" fill="{T}"/>'),
"5c-screen-pupil": W(f'<path d="{EYE}" fill="{A}"/><rect x="352" y="402" width="320" height="220" rx="60" fill="{BG}"/><circle cx="602" cy="462" r="30" fill="{T}"/>'),
"5d-wink-pair": W(f'<path d="M60 520 Q290 210 520 520 Q290 830 60 520 Z" fill="{A}"/><circle cx="290" cy="520" r="100" fill="{BG}"/><circle cx="325" cy="485" r="30" fill="{T}"/><path d="M580 560 Q760 400 950 560" fill="none" stroke="{T}" stroke-width="100" stroke-linecap="round"/>'),
}
os.makedirs("png",exist_ok=True)
def png(s,n,h=None): return Image.open(io.BytesIO(cairosvg.svg2png(bytestring=s.encode(),output_width=n,output_height=h or n))).convert("RGBA")
def mask(im,r):
    m=Image.new("L",im.size,0); ImageDraw.Draw(m).rounded_rectangle([0,0,im.size[0]-1,im.size[1]-1],r,fill=255); im.putalpha(m); return im
F=lambda s:ImageFont.truetype("/usr/share/fonts/truetype/sand-box/google/Inter/Inter-VariableFont_opsz,wght.ttf",s)
def banner(k,v):  # Fire TV launcher 320x180
    b=Image.new("RGBA",(320,180),BG); ic=png(v,120); b.paste(ic,(10,30),ic)
    ImageDraw.Draw(b).text((136,72),"Gottawatch",fill=T,font=F(28)); return b
for k,v in C.items():
    open(f"svg/{k}.svg","w").write(v+"\n")
    for s in (1024,180,48): png(v,s).save(f"png/{k}-{s}.png")
    banner(k,v).save(f"png/{k}-firetv-320x180.png")
Wd,H=1720,260*len(C)+80; sh=Image.new("RGB",(Wd,H),"#fff"); d=ImageDraw.Draw(sh)
d.text((20,20),"Eye refinements: 180 / 60 / 29 px on dark + light, and Fire TV 320x180 banner",fill="#111",font=F(26))
for i,(k,v) in enumerate(C.items()):
    y=80+i*260; d.text((20,y+110),k,fill="#111",font=F(20))
    for j,bg in enumerate(["#1b1d27","#e9e6f2"]):
        x0=230+j*480; d.rectangle([x0,y,x0+460,y+240],fill=bg); x=x0+20
        for s in (180,60,29):
            ic=mask(png(v,s),int(s*.225)); sh.paste(ic,(x,y+(240-s)//2),ic); x+=s+40
    d.rectangle([1190,y,1710,y+240],fill="#000"); b=banner(k,v); sh.paste(b,(1290,y+30),b)
sh.save("contact-sheet-eye.png")
