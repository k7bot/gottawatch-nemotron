# Final icon (5c Screen pupil) -> app assets. Run from repo root: python3 docs/design/icon/build_final.py
import cairosvg, io
from PIL import Image, ImageDraw, ImageFont
BG="#0E1020"; A="#F2B45A"; T="#F4F1EA"
def mark(fill_eye=A,pupil=BG,glint=T,scale=1.0):
    # eye mark centered in 1024 box, scaled about center
    return (f'<g transform="translate(512 512) scale({scale}) translate(-512 -512)">'
      f'<path d="M96 512 Q512 40 928 512 Q512 984 96 512 Z" fill="{fill_eye}"/>'
      f'<rect x="352" y="402" width="320" height="220" rx="60" fill="{pupil}"/>'
      f'<circle cx="602" cy="462" r="30" fill="{glint}"/></g>')
def svg(body,bg=True): return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">{f"<rect width=\"1024\" height=\"1024\" fill=\"{BG}\"/>" if bg else ""}{body}</svg>'
def r(s,w,h=None): return Image.open(io.BytesIO(cairosvg.svg2png(bytestring=s.encode(),output_width=w,output_height=h or w))).convert("RGBA")
R="apps/"
full=svg(mark())
open("docs/design/icon/svg/gottawatch-icon.svg","w").write(full+"\n")
r(full,1024).convert("RGB").save(R+"mobile/assets/icon.png")              # iOS: no alpha
# Android adaptive: 108dp canvas, 66dp safe -> mark at ~0.6
r(svg(mark(scale=0.62),bg=False),1024).save(R+"mobile/assets/android-icon-foreground.png")
Image.new("RGB",(1024,1024),BG).save(R+"mobile/assets/android-icon-background.png")
mono=r(svg('<g transform="translate(512 512) scale(0.62) translate(-512 -512)"><path fill-rule="evenodd" fill="#fff" d="M96 512 Q512 40 928 512 Q512 984 96 512 Z M412 402 H612 A60 60 0 0 1 672 462 V562 A60 60 0 0 1 612 622 H412 A60 60 0 0 1 352 562 V462 A60 60 0 0 1 412 402 Z"/><circle cx="602" cy="462" r="30" fill="#fff"/></g>',bg=False),1024)
mono.save(R+"mobile/assets/android-icon-monochrome.png")
r(svg(mark(),bg=False),1024).save(R+"mobile/assets/splash-icon.png")
r(full,48).save(R+"mobile/assets/favicon.png")
r(full,192).convert("RGB").save(R+"web/public/icon-192.png"); r(full,512).convert("RGB").save(R+"web/public/icon-512.png")
r(full,180).convert("RGB").save(R+"web/public/apple-touch-icon.png")
open(R+"web/public/favicon.svg","w").write(full+"\n")
# TV
tv=R+"tv/apps/expo-multi-tv/assets/"
r(full,1024).convert("RGB").save(tv+"images/icon.png")
r(svg(mark(scale=0.62),bg=False),1024).save(tv+"images/adaptive-foreground.png")
F=ImageFont.truetype("/usr/share/fonts/truetype/sand-box/google/Inter/Inter-VariableFont_opsz,wght.ttf",10); 
def banner(w,h):
    b=Image.new("RGB",(w,h),BG); ic=r(svg(mark(),bg=False),int(h*0.6)); b.paste(ic,(int(h*0.12),int(h*0.2)),ic)
    f=ImageFont.truetype(F.path,int(h*0.15)); f.set_variation_by_axes([int(h*0.17) if False else 32,700]) if hasattr(f,"set_variation_by_axes") else None
    d=ImageDraw.Draw(b); d.text((int(h*0.76),h//2),"Gottawatch",fill=T,font=f,anchor="lm"); return b
for w,h in [(400,240),(800,480),(1280,768),(1920,720)]: banner(w,h).save(tv+f"tv_icons/icon-{w}x{h}.png")
banner(320,180).save("docs/design/icon/png/firetv-banner-320x180.png")
