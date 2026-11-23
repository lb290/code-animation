
import glob, os, sys
from PIL import Image
d = r"F:/AI/dsh/code-animation/04-output/cielo"
files = sorted(glob.glob(os.path.join(d, "view-*.png")))
if not files:
    print("no stills"); sys.exit(0)
cols = 3 if len(files) <= 6 else 4
rows = (len(files) + cols - 1) // cols
tw, th, pad = 520, 293, 10
sheet = Image.new("RGB", (cols*tw + (cols+1)*pad, rows*th + (rows+1)*pad), (10, 22, 40))
for i, f in enumerate(files):
    im = Image.open(f).convert("RGB"); im.thumbnail((tw, th), Image.LANCZOS)
    sheet.paste(im, (pad + (i % cols)*(tw+pad), pad + (i//cols)*(th+pad)))
out = os.path.join(d, "00-contact-sheet.png")
sheet.save(out)
print("sheet ok", sheet.size, out, len(files))
