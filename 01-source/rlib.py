"""AETHER raster/HDR library: splatting, blur, text masks, cinematic post chain."""
import numpy as np, math, os
from PIL import Image, ImageDraw, ImageFont

SCALE = float(os.environ.get("AETHER_SCALE", "1"))
W, H = int(1920 * SCALE), int(1080 * SCALE)

# ---------------------------------------------------------------- easing
def ss(e0, e1, x):
    t = np.clip((np.asarray(x, dtype=np.float64) - e0) / (e1 - e0), 0.0, 1.0)
    return (t * t * (3.0 - 2.0 * t)).astype(np.float32)

def ease_out(t):
    t = np.clip(t, 0.0, 1.0); return float(1 - (1 - t) ** 3)

def ease_io(t):
    t = np.float64(np.clip(t, 0.0, 1.0))
    return float(np.where(t < .5, 4*t**3, 1 - (-2*t + 2)**3 / 2))

def wnd(t, a, b, fi=0.0, fo=0.0):
    v = np.float32(1.0)
    if fi > 0: v = v * ss(a, a + fi, t)
    if fo > 0: v = v * (1.0 - ss(b - fo, b, t))
    return np.float32(v)

# ---------------------------------------------------------------- blur
def _box(a, r, axis):
    if r <= 0: return a
    n = a.shape[axis]
    pw = [(0, 0)] * a.ndim; pw[axis] = (r, r)
    p = np.pad(a, pw, mode="edge")
    c = np.cumsum(p, axis=axis, dtype=np.float32)
    zs = list(c.shape); zs[axis] = 1
    c = np.concatenate([np.zeros(zs, np.float32), c], axis=axis)
    hi = [slice(None)] * a.ndim; lo = [slice(None)] * a.ndim
    hi[axis] = slice(2 * r + 1, 2 * r + 1 + n); lo[axis] = slice(0, n)
    return (c[tuple(hi)] - c[tuple(lo)]) * np.float32(1.0 / (2 * r + 1))

def blur(a, r, passes=3):
    if r <= 0: return a
    for _ in range(passes):
        a = _box(a, r, 1); a = _box(a, r, 0)
    return a

def streak_h(a, r, passes=2):
    for _ in range(passes): a = _box(a, r, 1)
    return a

def ds(a, f):
    h, w = a.shape[0] // f, a.shape[1] // f
    if a.ndim == 3:
        return a[:h*f, :w*f].reshape(h, f, w, f, a.shape[2]).mean(axis=(1, 3), dtype=np.float32)
    return a[:h*f, :w*f].reshape(h, f, w, f).mean(axis=(1, 3), dtype=np.float32)

def ups(a, w, h):
    if a.ndim == 2: a = a[:, :, None]
    out = np.empty((h, w, a.shape[2]), np.float32)
    for c in range(a.shape[2]):
        im = Image.fromarray(np.ascontiguousarray(a[:, :, c]), mode="F").resize((w, h), Image.BILINEAR)
        out[:, :, c] = np.asarray(im, dtype=np.float32)
    return out

# ---------------------------------------------------------------- splat
def splat(canvas, x, y, col, w=None, bilinear=True):
    """Additive particle splat. col (N,3) linear RGB, w (N,) per-particle weight."""
    h, wd = canvas.shape[0], canvas.shape[1]
    m = (x >= 0) & (x < wd - 2) & (y >= 0) & (y < h - 2)
    n = int(m.sum())
    if n == 0: return canvas
    if not m.all():
        x = x[m]; y = y[m]; col = col[m]
        if w is not None: w = w[m]
    c = col if w is None else (col * w[:, None])
    x0 = x.astype(np.int32); y0 = y.astype(np.int32)
    if bilinear:
        fx = (x - x0).astype(np.float32); fy = (y - y0).astype(np.float32)
        base = (y0 * wd + x0)
        idx = np.concatenate([base, base + 1, base + wd, base + wd + 1])
        wgt = np.concatenate([(1-fx)*(1-fy), fx*(1-fy), (1-fx)*fy, fx*fy]).astype(np.float32)
        cw = np.concatenate([c, c, c, c], axis=0)
    else:
        idx = (y0 * wd + x0)
        wgt = None
        cw = c
    for ch in range(3):
        wt = cw[:, ch] if wgt is None else cw[:, ch] * wgt
        canvas[:, :, ch] += np.bincount(idx, weights=wt, minlength=h*wd).reshape(h, wd).astype(np.float32)
    return canvas

# ---------------------------------------------------------------- text
FONTS = {
    "title": [r"C:\Windows\Fonts\bahnschrift.ttf", r"C:\Windows\Fonts\segoeuil.ttf", r"C:\Windows\Fonts\arial.ttf"],
    "bold":  [r"C:\Windows\Fonts\BarlowCondensed-Bold.ttf", r"C:\Windows\Fonts\arialbd.ttf"],
    "light": [r"C:\Windows\Fonts\segoeuil.ttf", r"C:\Windows\Fonts\bahnschrift.ttf"],
    "cjk":   [r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\msyhl.ttc", r"C:\Windows\Fonts\simhei.ttf"],
}

def pick(kind):
    for p in FONTS.get(kind, FONTS["light"]):
        if os.path.exists(p): return p
    return None

def text_mask(text, kind, px, tracking=0.0, ss_=3):
    path = pick(kind)
    if path is None: return None, 0, 0
    font = ImageFont.truetype(path, int(round(px * ss_)))
    advances = [font.getlength(ch) for ch in text]
    trk = tracking * px * ss_
    total = sum(advances) + trk * max(0, len(text) - 1)
    pad = int(px * ss_ * 0.7)
    cw, chh = int(math.ceil(total)) + 2 * pad, int(math.ceil(px * ss_ * 1.8)) + 2 * pad
    im = Image.new("L", (cw, chh), 0)
    d = ImageDraw.Draw(im)
    x = pad
    for ch, a in zip(text, advances):
        d.text((x, pad), ch, font=font, fill=255)
        x += a + trk
    im = im.resize((cw // ss_, chh // ss_), Image.BOX)
    m = np.asarray(im, dtype=np.float32) / 255.0
    ys, xs = np.nonzero(m > 0.004)
    if len(xs) == 0: return None, 0, 0
    return m[ys.min():ys.max()+1, xs.min():xs.max()+1], int(xs.max()-xs.min()+1), int(ys.max()-ys.min()+1)

def place(canvas, mask, x, y, col, gain=1.0):
    if mask is None: return
    h, w = mask.shape
    Hc, Wc = canvas.shape[0], canvas.shape[1]
    x0, y0 = int(round(x)), int(round(y))
    xa, ya = max(0, x0), max(0, y0)
    xb, yb = min(Wc, x0 + w), min(Hc, y0 + h)
    if xa >= xb or ya >= yb: return
    sub = mask[ya - y0:yb - y0, xa - x0:xb - x0]
    canvas[ya:yb, xa:xb, :] += sub[:, :, None] * np.asarray(col, np.float32)[None, None, :] * gain

# ---------------------------------------------------------------- post
def aces(x):
    a, b, c, d, e = 2.51, 0.03, 2.43, 0.59, 0.14
    return np.clip((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0)

def chroma(img, amt):
    if amt <= 0: return img
    h, w = img.shape[:2]; cx, cy = w * 0.5, h * 0.5
    out = img.copy()
    for i, s in enumerate((1.0 + amt, 1.0, 1.0 - amt)):
        k = 1.0 / s
        data = (k, 0.0, cx - cx * k, 0.0, k, cy - cy * k)
        im = Image.fromarray(np.ascontiguousarray(img[:, :, i]), mode="F")
        out[:, :, i] = np.asarray(im.transform((w, h), Image.AFFINE, data, resample=Image.BILINEAR), np.float32)
    return out

_VIG = None
def vignette():
    global _VIG
    if _VIG is None:
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        dx = (xx - W / 2) / (W / 2); dy = (yy - H / 2) / (H / 2)
        r = np.sqrt(dx * dx * 0.9 + dy * dy)
        _VIG = np.clip(1.0 - 0.40 * np.clip(r - 0.30, 0, 3) ** 1.6, 0.04, 1.0).astype(np.float32)
    return _VIG

def post(hdr, t, expo=1.0, bloom=(0.55, 0.38, 0.26), ca=0.0012, grain=0.012,
         shadow_tint=(0.92, 0.98, 1.14), high_tint=(1.06, 1.0, 0.93), sat=1.0, vig=1.0,
         streak=(0.55, 0.75, 1.0), streak_amt=0.55):
    b1 = blur(ds(hdr, 2), 3, 2); b2 = blur(ds(hdr, 4), 5, 2); b3 = blur(ds(hdr, 8), 7, 2)
    img = hdr.copy()
    img += ups(b1, W, H) * bloom[0]
    img += ups(b2, W, H) * bloom[1]
    img += ups(b3, W, H) * bloom[2]
    if streak_amt > 0:
        core = np.clip(ds(hdr, 4) - 1.10, 0, None)
        core = streak_h(blur(core, 2, 1), 58, 2)
        img += ups(core, W, H) * np.asarray(streak, np.float32) * streak_amt
    img = np.minimum(img, np.float32(26.0))
    img = aces(img * expo)
    luma = img[:, :, 0] * 0.2126 + img[:, :, 1] * 0.7152 + img[:, :, 2] * 0.0722
    w = np.clip(luma[:, :, None] * 1.15, 0, 1)
    img = img * (np.asarray(shadow_tint, np.float32) * (1 - w) + np.asarray(high_tint, np.float32) * w)
    g = luma[:, :, None]
    img = g + (img - g) * sat
    img = np.clip(img, 0, 1)
    img = img + (img * (1 - img) * (img - 0.5)) * 0.55
    img = chroma(img, ca * 0.0022)
    img = img * (vignette() * vig)[:, :, None]
    rng = np.random.default_rng(int(t * 977) & 0x7fffffff)
    n = rng.standard_normal((H // 2, W // 2), dtype=np.float32)
    n = np.repeat(np.repeat(n, 2, axis=0), 2, axis=1)
    lam = (1.0 - img.mean(axis=2)) * 0.85 + 0.25
    img = img + (n * lam)[:, :, None] * grain
    img = img * (1.0 + 0.006 * math.sin(t * 61.0) * math.sin(t * 17.3))
    img = np.clip(img, 0, 1)
    q = img * 255.0 + rng.uniform(-0.5, 0.5, img.shape).astype(np.float32)
    return np.clip(q, 0, 255).astype(np.uint8)
