
import glob, os
from PIL import Image
files = sorted([f for f in glob.glob(r"F:/AI/dsh/code-animation/04-output/skycity/*.png") if os.path.basename(f)[:2] in ('01','02','03','04','05','06','07','08')])
print(len(files), [os.path.basename(f) for f in files])
cols, rows, tw, th, pad = 4, 2, 480, 270, 10
sheet = Image.new("RGB", (cols*tw + (cols+1)*pad, rows*th + (rows+1)*pad), (8, 9, 14))
for i, f in enumerate(files):
    im = Image.open(f).convert("RGB"); im.thumbnail((tw, th), Image.LANCZOS)
    sheet.paste(im, (pad + (i % cols)*(tw+pad), pad + (i//cols)*(th+pad)))
sheet.save(r"F:/AI/dsh/code-animation/04-output/skycity/00-contact-sheet.png")
print("sheet ok", sheet.size)
