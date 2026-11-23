"""AETHER - a 24s procedural film. numpy + Pillow + ffmpeg only, no footage, no assets."""
import numpy as np, math, os, sys, subprocess, time
import rlib as R

FPS = 30; DUR = 24.0; NF = int(round(DUR * FPS)); FR = 1.0 / FPS
W, H = R.W, R.H

WHITE = np.array([1.00, 0.97, 0.92], np.float32)
ICE   = np.array([0.42, 0.80, 1.00], np.float32)
ICE2  = np.array([0.58, 0.94, 1.00], np.float32)
VIO   = np.array([0.50, 0.34, 1.00], np.float32)
AMB   = np.array([1.00, 0.60, 0.24], np.float32)

_BG = None
def BG(level=1.0):
    global _BG
    if _BG is None:
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        dx = (xx - W * 0.5) / (W * 0.5); dy = (yy - H * 0.5) / (H * 0.5)
        r = np.sqrt(dx * dx + dy * dy)
        g = np.exp(-r * r * 2.4).astype(np.float32)
        _BG = g[:, :, None] * np.array([0.010, 0.017, 0.036], np.float32)
    return _BG * level

_CORE = {}
def core_field(sigma):
    k = round(sigma, 2)
    if k not in _CORE:
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        _CORE[k] = np.exp(-(((xx - W / 2) ** 2 + (yy - H / 2) ** 2) / (2 * sigma * sigma))).astype(np.float32)
    return _CORE[k]

_EDGE = None
def edge_falloff():
    """soft atmospheric falloff at the frame edges (also hides density build-up there)"""
    global _EDGE
    if _EDGE is None:
        yy = np.linspace(0.0, 1.0, H, dtype=np.float32)[:, None, None]
        ram = np.clip((0.95 - yy) / 0.11, 0.0, 1.0) * np.clip(yy / 0.06, 0.0, 1.0)
        _EDGE = ram.astype(np.float32)
    return _EDGE

_STREAK = None
def streak_field():
    global _STREAK
    if _STREAK is None:
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        cy, cx = H * 0.5, W * 0.5
        _STREAK = (np.exp(-((yy - cy) / 4.5) ** 2) * (1.0 - np.abs(xx - cx) / (W * 0.62)).clip(0, 1) ** 2).astype(np.float32)
    return _STREAK

def cam3(P, yaw, pitch, roll, dist, zoom, f=0.9):
    cy_, sy_ = math.cos(yaw), math.sin(yaw)
    x = P[:, 0] * cy_ - P[:, 2] * sy_
    z = P[:, 0] * sy_ + P[:, 2] * cy_
    y = P[:, 1]
    cp, sp = math.cos(pitch), math.sin(pitch)
    y2 = y * cp - z * sp; z2 = y * sp + z * cp
    zc = z2 + dist
    inv = 1.0 / np.maximum(zc, 0.3)
    sx = x * f * zoom * inv * H * 0.5 + W * 0.5
    sy = -y2 * f * zoom * inv * H * 0.5 + H * 0.5
    cr, sr = math.cos(roll), math.sin(roll)
    dx = sx - W * 0.5; dy = sy - H * 0.5
    return dx * cr - dy * sr + W * 0.5, dx * sr + dy * cr + H * 0.5, zc

# ======================================================== SHOT 1 : BIRTH (Thomas attractor)
class Birth:
    def __init__(s):
        rng = np.random.default_rng(11)
        s.N = 130000
        u = rng.normal(size=(s.N, 3)); u /= (np.linalg.norm(u, axis=1, keepdims=True) + 1e-9)
        rad = rng.random((s.N, 1)) ** 0.34 * 5.4
        s.P = (u * rad).astype(np.float32)
        s.near = np.linalg.norm(s.P, axis=1).astype(np.float32)
        r = rng.random(s.N)
        col = np.where((r < 0.48)[:, None], WHITE, ICE)
        col = np.where(((r >= 0.48) & (r < 0.90))[:, None], VIO * 0.85 + ICE * 0.15, col)
        col = np.where((r >= 0.935)[:, None], AMB * 1.7, col)
        s.col = col.astype(np.float32)
        s.br = (0.40 + 1.00 * rng.random(s.N) ** 2).astype(np.float32)
        s.b = 0.19; s.t0 = None
        s.steps = 0

    def f(s, P):
        return np.stack([np.sin(P[:, 1]) - s.b * P[:, 0],
                         np.sin(P[:, 2]) - s.b * P[:, 1],
                         np.sin(P[:, 0]) - s.b * P[:, 2]], axis=1)

    def step(s, dt):
        n = 9; h = (dt * 2.60) / n; P = s.P
        for _ in range(n):
            k1 = s.f(P); k2 = s.f(P + 0.5 * h * k1)
            k3 = s.f(P + 0.5 * h * k2); k4 = s.f(P + h * k3)
            P = P + (h / 6.0) * (k1 + 2 * k2 + 2 * k3 + k4)
        s.P = P; s.steps += 1

    def render(s, t, tau):
        img = np.zeros((H, W, 3), np.float32)
        yaw = 0.55 + 0.40 * tau + 0.26 * math.sin(tau * 0.8)
        pitch = 0.26 + 0.15 * math.sin(tau * 0.95 + 0.4)
        roll = 0.12 * math.sin(tau * 0.5 - 0.3)
        zoom = 1.36 + 0.20 * R.ease_out(min(tau / 4.5, 1.0))
        sx, sy, zc = cam3(s.P, yaw, pitch, roll, 12.0, zoom)
        depth = np.clip(12.0 / zc, 0.30, 2.6)
        env = float(R.ss(0.0, 1.90, t)) * (1.0 - 0.25 * float(R.ss(4.1, 5.0, t)))
        w = s.br * (depth ** 1.7) * env * 0.24
        R.splat(img, sx, sy, s.col, w=w)
        # birth core glow
        core = math.exp(-max(tau - 0.9, 0) * 1.4) * 0.30 * env
        img += core_field(95.0)[:, :, None] * np.array([0.6, 0.85, 1.0], np.float32) * core
        return img

# ======================================================== SHOT 2 : FLOW (curl of analytic potential)
class Flow:
    def __init__(s):
        rng = np.random.default_rng(23)
        s.N = 62000
        s.p = rng.random((s.N, 2)).astype(np.float32)
        s.t = 0.0
        s.rng = np.random.default_rng(7)
        s.trail = [s.p.copy()]
        r = rng.random(s.N)
        cy_ = np.array([0.20, 0.66, 1.00], np.float32); vi_ = np.array([0.44, 0.24, 1.00], np.float32)
        am_ = np.array([1.00, 0.52, 0.16], np.float32)
        col = np.where((r < 0.44)[:, None], cy_, vi_)
        col = np.where(((r >= 0.44) & (r < 0.50))[:, None], cy_ * 0.35 + vi_ * 0.65, col)
        col = np.where((r > 0.90)[:, None], am_ * 1.4, col)
        s.col = col.astype(np.float32)
        s.br = (0.35 + 0.95 * rng.random(s.N) ** 2).astype(np.float32)
        rw = np.random.default_rng(99); s.waves = []
        for i in range(10):
            kk = rw.uniform(0.45, 2.7); an = rw.uniform(0, 2 * math.pi)
            s.waves.append((kk * math.cos(an), kk * math.sin(an), rw.uniform(0.06, 0.26),
                            rw.uniform(0, 6.28), rw.uniform(0.18, 0.62)))

    def vel(s, p):
        x = p[:, 0]; y = p[:, 1]
        vx = np.zeros_like(x); vy = np.zeros_like(x)
        for kx, ky, amp, ph, sp in s.waves:
            a = 2 * math.pi * (kx * x + ky * y) + ph + sp * s.t
            c = np.cos(a).astype(np.float32) * amp
            vx += c * ky; vy -= c * kx
        dx = x - 0.5; dy = y - 0.5
        rr = np.exp(-(dx * dx + dy * dy) * 5.5).astype(np.float32)
        vx += -dy * rr * 0.75; vy += dx * rr * 0.75
        return vx, vy

    def step(s, dt):
        sub = 6; h = dt / sub; s.trail = []
        for _ in range(sub):
            vx, vy = s.vel(s.p)
            s.p[:, 0] = s.p[:, 0] + vx * h * 0.92 + h * 0.16
            s.p[:, 1] = s.p[:, 1] + vy * h * 0.92 + h * 0.03
            s.p %= 1.0
            s.trail.append(s.p.copy()); s.t += h
        s.t = s.t % 1000.0
        s.diffuse_clumps()

    def diffuse_clumps(s):
        """Forward-Euler advection slowly contracts particles into knots; spread over-dense cells."""
        gx = (s.p[:, 0] * 96).astype(np.int32); gy = (s.p[:, 1] * 54).astype(np.int32)
        np.clip(gx, 0, 95, out=gx); np.clip(gy, 0, 53, out=gy)
        cell = (gy * 96 + gx).astype(np.int32)
        cnt = np.bincount(cell, minlength=96 * 54)
        over = np.nonzero(cnt[cell] > 150)[0]
        if len(over):
            s.p[over] += s.rng.normal(0.0, 0.006, (len(over), 2)).astype(np.float32)
            s.p[over] %= 1.0

    def render(s, t, tau):
        img = np.zeros((H, W, 3), np.float32)
        zoom = 1.0 + 0.05 * math.sin(0.40 * tau) + 0.03 * tau
        drift = 0.03 * math.sin(0.5 * tau)
        nsub = len(s.trail)
        for k, p in enumerate(s.trail):
            x = (p[:, 0] - 0.5) * zoom + 0.5 + drift
            y = (p[:, 1] - 0.5) * zoom + 0.5
            w = s.br * (0.40 + 0.60 * (k + 1) / nsub) * (2.8 / nsub)
            R.splat(img, x * W, y * H, s.col, w=w, bilinear=True)
        img *= np.float32(0.9 + 0.12 * math.sin(tau * 2.1))
        img *= edge_falloff()
        return np.minimum(img, np.float32(10.0))

# ======================================================== SHOT 3 : BLOOM (torus knot + burst)
class Knot:
    def __init__(s):
        rng = np.random.default_rng(31)
        s.N = 165000
        s.th = (rng.random(s.N) * 2 * np.pi).astype(np.float32)
        s.ph = (rng.random(s.N) * 2 * np.pi).astype(np.float32)
        s.rad = ((rng.random(s.N) ** 0.55) * 0.62 + 0.02).astype(np.float32)
        r = rng.random(s.N)
        cy_ = np.array([0.26, 0.74, 1.00], np.float32); vi_ = np.array([0.44, 0.18, 1.00], np.float32)
        am_ = np.array([1.00, 0.55, 0.18], np.float32)
        col = np.where((r < 0.55)[:, None], cy_, vi_)
        col = np.where(((r >= 0.55) & (r < 0.93))[:, None], cy_ * 0.55 + WHITE * 0.45, col)
        col = np.where((r > 0.88)[:, None], am_ * 1.3, col)
        s.col = col.astype(np.float32)
        s.br = (0.35 + 1.15 * rng.random(s.N) ** 2).astype(np.float32)
        s.jit = (rng.normal(size=(s.N, 3)) * 0.012).astype(np.float32)
        s.dir = None

    def base(s):
        th = s.th; p, q = 2, 3
        rr = 2.0 + np.cos(q * th)
        X = np.cos(p * th) * rr; Y = np.sin(p * th) * rr; Z = np.sin(q * th)
        P = np.stack([X, Y, Z], axis=1) * np.float32(0.93)
        off = np.stack([np.cos(s.ph) * 0.55, np.sin(s.ph) * 0.55, np.cos(s.ph * 2.0) * 0.35], axis=1)
        P = P + off * s.rad[:, None] + s.jit
        return P.astype(np.float32)

    def render(s, t, tau):
        img = np.zeros((H, W, 3), np.float32)
        P = s.base()
        if s.dir is None:
            s.dir = P / (np.linalg.norm(P, axis=1, keepdims=True) + 1e-6)
        # burst impulse then settle
        amp = 0.70 * math.exp(-tau / 0.55) + 0.18 * math.exp(-tau / 2.2)
        P = P + s.dir * amp
        # turbulence that decays
        tb = 0.12 * math.exp(-tau / 1.6)
        P = P + (np.sin(P[:, [1, 2, 0]] * 3.1 + tau * 1.7) * tb).astype(np.float32)
        # collapse into a star at the end of the shot
        scl = 1.0 - 0.94 * float(R.ss(5.05, 6.05, tau))
        P = P * np.float32(scl)
        yaw = 0.55 + 0.55 * tau + 0.5 * float(R.ss(0, 0.6, tau))
        pitch = 0.30 + 0.20 * math.sin(0.55 * tau)
        roll = -0.10 + 0.30 * tau
        zoom = 1.30 + 0.12 * float(R.ss(0, 3.0, tau)) + 0.55 * float(R.ss(4.4, 6.0, tau))
        sx, sy, zc = cam3(P, yaw, pitch, roll, 8.0, zoom)
        depth = np.clip(8.0 / zc, 0.30, 2.4)
        env = 1.0 + 0.55 * float(ss_flash(tau))
        w = s.br * (depth ** 1.6) * env * 0.30
        R.splat(img, sx, sy, s.col, w=w)
        # hot core during burst and at collapse
        c = 1.6 * math.exp(-max(tau - 0.05, 0) / 0.35) + 2.2 * float(R.ss(5.2, 6.05, tau))
        if c > 0.01:
            img += core_field(90.0)[:, :, None] * np.array([0.75, 0.9, 1.0], np.float32) * c
        return img

def ss_flash(tau):
    return math.exp(-max(tau - 0.02, 0) / 0.22)

# ======================================================== SHOT 4 : TITLE
_TMASK = {}
def title_mask(text, kind, px, trk):
    key = (text, kind, px, round(trk, 4))
    if key not in _TMASK:
        _TMASK[key] = R.text_mask(text, kind, px, tracking=trk)
    return _TMASK[key]

class Title:
    def render(s, t, tau):
        img = np.zeros((H, W, 3), np.float32)
        amp = 3.2 * math.exp(-max(tau - 0.02, 0) / 0.55) + 0.55
        img += core_field(26.0)[:, :, None] * np.array([1.0, 0.96, 0.90], np.float32) * amp
        img += (streak_field() * (1.4 * math.exp(-max(tau, 0) / 0.9) + 0.22))[:, :, None] * np.array([0.55, 0.78, 1.0], np.float32)
        # ---- title
        a = float(R.ss(17.55, 18.75, t))
        if a > 0.003:
            trk = 0.34 - 0.20 * R.ease_io((t - 17.7) / 1.7)
            m, mw, mh = title_mask("AETHER", "title", 200 * R.SCALE, trk)
            if m is not None:
                g = 2.35 * a
                px0 = (W - mw) / 2
                py0 = 372 * R.SCALE - (1.0 - a) * 6
                R.place(img, m, px0, py0, WHITE, gain=g)
                # glow passes
                m2 = R.blur(m[None, :, :], 9, 2)[0]
                m3 = R.blur(m[None, :, :], 26, 2)[0]
                R.place(img, m2, px0, py0, np.array([0.55, 0.82, 1.0], np.float32), gain=1.5 * a)
                # light sweep across the letters
                sweep = float(R.ss(18.6, 19.7, t))
                if sweep > 0:
                    band = np.exp(-((np.arange(mw) / mw - (sweep * 1.4 - 0.2)) / 0.10) ** 2).astype(np.float32)
                    R.place(img, m * band[None, :], px0, py0, WHITE * 1.2, gain=1.6 * a)
        # ---- subtitle
        a2 = float(R.ss(19.25, 20.1, t)) * (1.0 - float(R.ss(22.6, 23.4, t)))
        if a2 > 0.003:
            m, mw, mh = title_mask("A FILM MADE ONLY OF CODE", "light", 34 * R.SCALE, 0.42)
            if m is not None:
                R.place(img, m, (W - mw) / 2, 655 * R.SCALE + (1 - a2) * 8, np.array([0.80, 0.90, 1.0], np.float32), gain=0.72 * a2)
        a3 = float(R.ss(20.45, 21.3, t)) * (1.0 - float(R.ss(22.6, 23.4, t)))
        if a3 > 0.003:
            m, mw, mh = title_mask("NUMPY  ·  PILLOW  ·  FFMPEG", "light", 21 * R.SCALE, 0.40)
            if m is not None:
                R.place(img, m, (W - mw) / 2, 735 * R.SCALE, np.array([0.62, 0.78, 1.0], np.float32), gain=0.55 * a3)
        a4 = float(R.ss(21.05, 21.9, t)) * (1.0 - float(R.ss(22.6, 23.4, t)))
        if a4 > 0.003:
            m, mw, mh = title_mask("零素材 · 全部由代码生成", "cjk", 26 * R.SCALE, 0.24)
            if m is not None:
                R.place(img, m, (W - mw) / 2, 800 * R.SCALE, np.array([0.85, 0.85, 0.88], np.float32), gain=0.42 * a4)
        return img

# ======================================================== timeline
def boot():
    b = Birth(); f = Flow(); k = Knot(); ti = Title()
    return b, f, k, ti

def composite(t, sc):
    b, f, k, ti = sc
    img = BG(1.0).copy()
    if t < 5.35:
        w1 = float(R.wnd(t, -1.0, 5.02, fo=0.16))
        if w1 > 0.001: img += b.render(t, t) * w1
    if 4.85 <= t < 11.2:
        w2 = float(R.wnd(t, 4.95, 11.0, fi=0.16, fo=0.0))
        if w2 > 0.001: img += f.render(t, t - 5.0) * w2
    if 10.85 <= t < 17.25:
        w3 = 1.0
        if w3 > 0.001: img += k.render(t, t - 11.0) * w3
    if t >= 16.9:
        w4 = float(R.wnd(t, 16.9, 30.0, fi=0.10))
        if w4 > 0.001: img += ti.render(t, t - 17.0) * w4
    # cut flashes
    for tc, amp, wd in ((5.0, 1.05, 0.030), (11.0, 1.25, 0.026), (17.0, 0.55, 0.035)):
        d = (t - tc) / wd
        if abs(d) < 5: img += np.float32(amp * math.exp(-d * d))
    # global fade in / out
    img *= np.float32(min(1.0, t / 0.8)) * np.float32(1.0 - float(R.ss(23.15, 23.95, t)))
    return img

def params(t):
    if t < 5.0:   return dict(expo=1.45, bloom=(0.24, 0.16, 0.10), sat=1.14, grain=0.011, ca=0.0011, streak_amt=0.0)
    if t < 11.0:  return dict(expo=1.85, bloom=(0.34, 0.21, 0.13), sat=1.20, grain=0.011, ca=0.0013, streak_amt=0.0)
    if t < 17.0:  return dict(expo=1.30, bloom=(0.30, 0.19, 0.12), sat=1.12, grain=0.010, ca=0.0012, streak_amt=0.12)
    return dict(expo=1.22, bloom=(0.30, 0.19, 0.12), sat=1.04, grain=0.009, ca=0.0009, streak_amt=0.18)

def run(mode, out, frames):
    sc = boot()
    targets = set(frames)
    t0 = time.time()
    W_ = None
    for i in range(NF):
        t = i * FR
        if t < 5.7: sc[0].step(FR)
        if 4.8 <= t < 11.7: sc[1].step(FR)
        if mode == "stills" and i not in targets:
            continue
        hdr = composite(t, sc)
        p = params(t)
        rgb = R.post(hdr, t, **p)
        if mode == "stills":
            from PIL import Image
            Image.fromarray(rgb).save(os.path.join(out, "f%03d.png" % i))
            print("  still %d  t=%.2f  %.2fs" % (i, t, time.time() - t0), flush=True)
        else:
            out.write(rgb.tobytes())
    print("done %.1fs" % (time.time() - t0))

def main():
    if len(sys.argv) < 3: print("usage: film.py stills <dir> f... | render <mp4> [wav]"); return
    mode = sys.argv[1]
    if mode == "stills":
        out = sys.argv[2]; os.makedirs(out, exist_ok=True)
        run("stills", out, [int(x) for x in sys.argv[3:]])
    else:
        out = sys.argv[2]
        audio = sys.argv[3] if len(sys.argv) > 3 and os.path.exists(sys.argv[3]) else None
        cmd = ["ffmpeg", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", "%dx%d" % (W, H),
               "-r", str(FPS), "-i", "-"]
        if audio: cmd += ["-i", audio]
        cmd += ["-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p",
                "-profile:v", "high", "-tune", "film", "-movflags", "+faststart"]
        if audio: cmd += ["-c:a", "aac", "-b:a", "256k", "-shortest"]
        cmd += [out]
        pr = subprocess.Popen(cmd, stdin=subprocess.PIPE)
        run("render", pr.stdin, [])
        pr.stdin.close(); pr.wait()
        print("wrote", out)

if __name__ == "__main__":
    main()
