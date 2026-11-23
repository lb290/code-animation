#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
make_score.py  --  24.0 s cinematic minimal-electronic cue, A minor.
                   Pure-numpy programmatic synthesis. No samples, no external audio.

Style target: Jon Hopkins / Hans Zimmer minimalism -- slow harmonic bloom,
detuned saw beds, sub swells, granular noise texture, sprawling convolution tail.

Output: score.wav  24.000 s / 48000 Hz / 24-bit PCM / stereo
Runtime: CPython 3.12 + numpy

TIMELINE (A minor, 100 BPM, 16th = 0.150 s -> 5.0 / 11.0 / 17.0 all land on the grid)
  0.0 -  5.0  low-frequency swell (55 Hz sub + <105 Hz noise) + noise bed fade-in,
              sparse A2/A3/C4/E5/A5 entrances; sparse and dark by design
  5.0         light airy impact: descending band-swept noise + soft 62->36 Hz body
  5.0 - 11.0  detuned low 16th-note pulse (A1, +-6..9 cents) + high shimmer/overtones
  9.5 - 11.0  riser: noise band sweep 180 Hz -> 11 kHz and pitch glide A2 -> A5
 11.0         bright chord hit (A3 C4 E4 A4 C5 E5 G5 A5 C6) + air burst + sub punch
 11.0 - 17.0  main pad: A2 E3 A3 C4 E4 G4 A4 C5 E5 G5 A5 C6 E6, 3-4 detuned saws
              per note, staggered bloom, slow LFOs; full-open filter  (fullest)
 17.0 - 21.0  closing: pulse gone, pad low-pass closes 4.6 kHz -> 0.8 kHz
 21.0 - 24.0  final A-minor chord (A1..A6) + long convolution tail, tail fade and
              50 ms fade-out -> exact digital silence at 24.000 s

SYNTHESIS METHODS
-----------------
* band-limited additive saw wavetables (random harmonic phase -> smooth supersaw),
  linear-interpolated table oscillator with optional pitch-glide (cumsum phase)
* multi-oscillator detune (+-4..9 cents) with independent harmonic phases
* zero-phase FFT filters (2nd-order low/high/band) + triangular "morph filter"
  automation for continuous low-pass sweeps (17-21 s closing, chord bloom)
* log-spaced noise band-bank with Gaussian band gains -> spectral sweep riser
  / descending air burst (no time-varying IIR needed, no aliasing)
* synthetic convolution reverb: exponentially decaying decorrelated stereo
  noise IR (independent L/R noise, exponential energy decay, HF damping,
  sparse early reflections, pre-delay), 3.9 s, FFT convolution
* per-voice equal-power panning + M/S stereo width
* block-based RMS compressor (soft attack/release) + look-ahead peak limiter
* 50 ms smoothstep fade in/out, 24-bit TPDF-free clean quantization at -1 dBFS
"""

from __future__ import annotations

import math
import os
import sys
import time
import wave

import numpy as np

# --------------------------------------------------------------------------- #
#  global session constants
# --------------------------------------------------------------------------- #
SR = 48000
DUR = 24.0
N = int(round(SR * DUR))                      # 1_152_000 samples
HERE = os.path.dirname(os.path.abspath(__file__))
WAV_PATH = os.path.join(HERE, "score.wav")

BPM = 100.0
SIX = 60.0 / BPM / 4.0                        # 16th note = 0.150 s  (5.0/11.0/17.0 grid)
T5, T11, T17, T21, T24 = 5.0, 11.0, 17.0, 21.0, 24.0

t = np.arange(N, dtype=np.float64) / SR
nlin = np.arange(N, dtype=np.float64)

# A minor pitch table (equal temperament, A4 = 440)
NOTE = dict(
    A1=55.000, E2=82.407, A2=110.000, C3=130.813, E3=164.814, G3=195.998,
    A3=220.000, C4=261.626, E4=329.628, G4=391.995, A4=440.000,
    C5=523.251, E5=659.255, G5=783.991, A5=880.000,
    C6=1046.502, E6=1318.510, G6=1567.982, A6=1760.000, C7=2093.005,
)

# --------------------------------------------------------------------------- #
#  mix levels -- tuned so the pre-master peak sits near -1.5 dBFS and the
#  limiter barely works (relative dynamics survive the master chain)
# --------------------------------------------------------------------------- #
LEVELS = dict(
    sub=     dict(rms_db=-28.5, window=(5.0, 11.0)),
    rumble=  dict(rms_db=-37.5, window=(3.0, 5.0)),
    bed=     dict(rms_db=-33.0, window=(5.0, 11.0)),
    sparse=  dict(peak_db=-22.0),
    impact=  dict(peak_db=-10.0),
    pulse=   dict(peak_db=-9.0),
    shimmer= dict(peak_db=-15.5),
    riser=   dict(peak_db=-8.0),
    hit11=   dict(peak_db=-3.4),
    pad=     dict(rms_db=-17.5, window=(11.0, 17.0)),
    final=   dict(peak_db=-1.9),
)
SENDS = dict(sub=0.04, rumble=0.20, bed=0.62, sparse=0.85, impact=1.0,
             pulse=0.28, shimmer=0.95, riser=0.85, hit11=1.0, pad=0.62, final=1.0)


# --------------------------------------------------------------------------- #
#  basic helpers
# --------------------------------------------------------------------------- #
def db2a(dbfs):
    return 10.0 ** (dbfs / 20.0)


def a2db(x):
    return 20.0 * np.log10(max(abs(float(x)), 1e-12))


def c2a(cents):
    return 2.0 ** (cents / 1200.0)


def smoothstep(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3.0 - 2.0 * x)


def ramp(x):
    """smoothstep ramp from an already-normalised argument"""
    return smoothstep(x)


def smooth_arr(y, seconds):
    """FFT (hann) smoothing with edge padding -- for click-free automation."""
    n = int(max(3, round(seconds * SR)))
    if n < 4:
        return y
    h = np.hanning(n + 2)[1:-1]
    h /= h.sum()
    m = len(y) + n - 1
    nfft = 1 << int(math.ceil(math.log2(m + 1)))
    yp = np.concatenate([np.full(n, y[0]), y, np.full(n, y[-1])])
    m2 = len(yp) + n - 1
    nfft = 1 << int(math.ceil(math.log2(m2 + 1)))
    out = np.fft.irfft(np.fft.rfft(yp, nfft) * np.fft.rfft(h, nfft), nfft)[:m2]
    start = (n - 1) // 2 + n
    return out[start:start + len(y)]


def automation(points, smooth=0.06):
    """piecewise-linear automation from (time, value) pairs, gently smoothed"""
    ts = np.array([p[0] for p in points], dtype=np.float64)
    vs = np.array([p[1] for p in points], dtype=np.float64)
    y = np.interp(t, ts, vs)
    if smooth > 0:
        y = smooth_arr(y, smooth)
    return np.clip(y, None, None)


def exp_env(t0, tau, att=0.005):
    """0 before t0, smoothstep attack, exponential decay afterwards"""
    tt = t - t0
    a = smoothstep((tt) / max(att, 1e-6))
    return np.where(tt > 0.0, a * np.exp(-np.maximum(tt, 0.0) / tau), 0.0)


def gate(t0, t1, att, rel):
    """smooth on/off window"""
    return smoothstep((t - t0) / max(att, 1e-6)) * smoothstep((t1 - t) / max(rel, 1e-6))


# --------------------------------------------------------------------------- #
#  FFT filters / noise
# --------------------------------------------------------------------------- #
FREQ = np.fft.rfftfreq(N, 1.0 / SR)


def response_lp(fc, order=2):
    return 1.0 / np.sqrt(1.0 + (FREQ / max(fc, 1.0)) ** (2.0 * order))


def response_hp(fc, order=2):
    return 1.0 / np.sqrt(1.0 + (max(fc, 1.0) / np.maximum(FREQ, 1e-9)) ** (2.0 * order))


def fft_filter(x, H):
    return np.fft.irfft(np.fft.rfft(x) * H, N)


def lp(x, fc, order=2):
    return fft_filter(x, response_lp(fc, order))


def hp(x, fc, order=2):
    return fft_filter(x, response_hp(fc, order))


def band_h(lo, hi, order=2):
    return response_hp(lo, order) * response_lp(hi, order)


def white(n, seed):
    return np.random.default_rng(seed).standard_normal(n)


def pink(n, seed):
    """1/f amplitude-shaped white noise, unit RMS"""
    w = white(n, seed)
    X = np.fft.rfft(w)
    f = np.fft.rfftfreq(n, 1.0 / SR)
    X *= 1.0 / np.sqrt(np.maximum(f, 1.0))
    y = np.fft.irfft(X, n)
    return y / (np.sqrt(np.mean(y * y)) + 1e-12)


def pan2(sig, p):
    th = (float(np.clip(p, -1.0, 1.0)) + 1.0) * 0.25 * math.pi
    return np.stack([sig * math.cos(th), sig * math.sin(th)])


# --------------------------------------------------------------------------- #
#  wavetable supersaw oscillator
# --------------------------------------------------------------------------- #
TSIZE = 4096


def saw_table(freq_hint, seed=0):
    """Band-limited saw: harmonics 1..H, H = 0.45*SR/f, random phase per harmonic."""
    H = int(min(96, max(1, math.floor(0.45 * SR / max(freq_hint, 20.0)))))
    r = np.random.default_rng(seed)
    ph = r.uniform(0.0, 2.0 * math.pi, H)
    n = np.arange(TSIZE, dtype=np.float64) * (2.0 * math.pi / TSIZE)
    tab = np.zeros(TSIZE)
    for k in range(1, H + 1):
        tab += np.sin(k * n + ph[k - 1]) / k
    return tab / (np.max(np.abs(tab)) + 1e-12)


def osc(freq, table, phase0=0.0):
    """table oscillator, scalar frequency"""
    inc = (float(freq) / SR) * TSIZE
    pos = phase0 * TSIZE + nlin * inc
    i0 = np.floor(pos)
    fr = pos - i0
    i0 = i0.astype(np.int64) % TSIZE
    i1 = (i0 + 1) % TSIZE
    return table[i0] + (table[i1] - table[i0]) * fr


def osc_glide(freq_arr, table, phase0=0.0):
    """table oscillator, time-varying frequency (continuous phase)"""
    inc = (np.asarray(freq_arr, dtype=np.float64) / SR) * TSIZE
    pos = phase0 * TSIZE + np.cumsum(inc)
    i0 = np.floor(pos)
    fr = pos - i0
    i0 = i0.astype(np.int64) % TSIZE
    i1 = (i0 + 1) % TSIZE
    return table[i0] + (table[i1] - table[i0]) * fr


def sine(freq, phase0=0.0):
    f = np.asarray(freq, dtype=np.float64)
    if f.ndim == 0:
        return np.sin(phase0 + 2.0 * math.pi * float(f) * nlin / SR)
    return np.sin(phase0 + 2.0 * math.pi * np.cumsum(f) / SR)


def supersaw(freq, cents_list, seed, phase_jitter=True):
    """sum of detuned band-limited saws, unit-ish level"""
    acc = np.zeros(N)
    for i, c in enumerate(cents_list):
        f = freq * c2a(c)
        tab = saw_table(f, seed + 17 * i)
        p0 = np.random.default_rng(seed + 101 * i).uniform() if phase_jitter else 0.0
        acc += osc(f, tab, p0)
    return acc / len(cents_list)


# --------------------------------------------------------------------------- #
#  mix bus
# --------------------------------------------------------------------------- #
class Mix:
    def __init__(self):
        self.dry = np.zeros((2, N))
        self.send = np.zeros((2, N))
        self.log = []

    def add(self, layer, gain=1.0, send=0.5, peak_db=None, rms_db=None,
            window=None, name="layer"):
        if peak_db is not None:
            layer = layer * (db2a(peak_db) / (np.max(np.abs(layer)) + 1e-12))
        if rms_db is not None:
            w0, w1 = window if window else (0.0, DUR)
            m = (t >= w0) & (t < w1)
            rms = math.sqrt(float(np.mean(layer[:, m] ** 2)))
            layer = layer * (db2a(rms_db) / (rms + 1e-12))
        self.dry += gain * layer
        self.send += gain * send * layer
        self.log.append(dict(name=name, peak=a2db(np.max(np.abs(layer))),
                             send=send, gain=gain))
        return layer


# --------------------------------------------------------------------------- #
#  LAYER 1 -- sub / low-frequency swell (0-24 s)
# --------------------------------------------------------------------------- #
def build_sub(M):
    L = np.zeros((2, N))
    # sub sine A1 (+ very quiet E2 fifth for weight)
    s1 = sine(NOTE["A1"]) * automation(
        [(0, 0.16), (1.0, 0.28), (2.4, 0.44), (3.8, 0.66), (4.7, 0.88),
         (5.3, 1.0), (10.8, 1.0), (16.8, 0.98), (20.3, 0.75), (20.95, 1.05),
         (21.9, 0.85), (23.2, 0.45), (23.95, 0.0)], 0.12)
    s2 = sine(NOTE["E2"]) * automation(
        [(0, 0.05), (4.9, 0.35), (11.0, 0.40), (17.0, 0.34), (20.9, 0.30),
         (22.0, 0.18), (23.6, 0.0)], 0.25)
    breath = 1.0 + 0.10 * np.sin(2 * math.pi * 0.075 * t + 0.7)
    L[0] = (s1 * 0.92 + s2 * 0.42) * breath
    L[1] = (s1 * 0.92 + s2 * 0.42) * (1.0 + 0.10 * np.sin(2 * math.pi * 0.061 * t + 2.1))
    M.add(L, send=SENDS["sub"], **LEVELS["sub"], name="sub")


# --------------------------------------------------------------------------- #
#  LAYER 2 -- low rumble swell into 5.0 s impact
# --------------------------------------------------------------------------- #
def build_rumble(M):
    n = pink(N, 7001)
    low = lp(n, 105.0, order=3)
    low = hp(low, 32.0, order=2)
    env = smoothstep((t / 5.0) ** 1.35) ** 2.0
    env *= 1.0 - smoothstep((t - 4.98) / 0.035)          # stop at the impact
    L = np.stack([low * env, lp(pink(N, 7002), 100.0, 3) * env * 0.95])
    M.add(L, send=SENDS["rumble"], **LEVELS["rumble"], name="rumble")


# --------------------------------------------------------------------------- #
#  LAYER 3 -- noise bed (airy texture, fades in 0-5 s)
# --------------------------------------------------------------------------- #
def build_bed(M):
    lo, hi = 190.0, 7200.0
    H = band_h(lo, hi, 2)
    a = fft_filter(pink(N, 7101), H)
    b = fft_filter(pink(N, 7102), H)
    a = hp(a, 170.0, 2)
    b = hp(b, 170.0, 2)
    g = automation([(0.0, 0.0), (1.2, 0.18), (3.0, 0.42), (5.0, 0.60), (8.0, 0.66),
                    (10.9, 0.70), (11.05, 0.62), (16.9, 0.60), (17.4, 0.52),
                    (19.8, 0.30), (20.95, 0.34), (21.6, 0.22), (23.0, 0.06),
                    (23.9, 0.0)], 0.12)
    lfo_a = 1.0 + 0.16 * np.sin(2 * math.pi * 0.083 * t + 0.3)
    lfo_b = 1.0 + 0.16 * np.sin(2 * math.pi * 0.071 * t + 2.4)
    L = np.stack([a * g * lfo_a, b * g * lfo_b])
    # gentle slow spectral drift: narrow band-limited copy for "air"
    air = hp(fft_filter(pink(N, 7103), band_h(5200.0, 12500.0, 2)), 4800.0, 2)
    air_r = hp(fft_filter(pink(N, 7104), band_h(5200.0, 12500.0, 2)), 4800.0, 2)
    ga = automation([(0, 0.0), (4.5, 0.10), (10.9, 0.22), (11.1, 0.30),
                     (16.9, 0.26), (18.5, 0.12), (20.9, 0.10), (21.5, 0.08),
                     (23.2, 0.0)], 0.20)
    L[0] += air * ga
    L[1] += air_r * ga
    M.add(L, send=SENDS["bed"], **LEVELS["bed"], name="bed")


# --------------------------------------------------------------------------- #
#  LAYER 4 -- sparse prelude material (0-5 s)
# --------------------------------------------------------------------------- #
def bell(f, t0, decay, amps, partial_ratios, pan, gain, seed):
    out = np.zeros(N)
    for i, (r, a) in enumerate(zip(partial_ratios, amps)):
        fh = f * r
        if fh > 0.45 * SR:
            continue
        env = exp_env(t0, decay / (1.0 + 0.45 * i), att=0.004)
        out += a * sine(fh, phase0=0.4 * i + 0.2 * seed) * env
    return pan2(out, pan) * gain


def build_sparse(M):
    L = np.zeros((2, N))
    # soft low pad note -- A3
    v = supersaw(NOTE["A3"], (-5.0, 0.0, 4.0), seed=310)
    e = gate(0.85, 4.6, att=1.15, rel=1.9) * (0.55 + 0.45 * np.sin(2 * math.pi * 0.11 * t))
    v = np.stack([lp(v, 900.0, 2), lp(v, 1050.0, 2)])
    L += np.stack([v[0] * math.cos(0.35 * math.pi), v[1] * math.sin(0.35 * math.pi)]) * (e * 0.16)
    # bell E5
    L += bell(NOTE["E5"], 2.35, 1.5, [1.0, 0.48, 0.26, 0.14, 0.08],
              [1.0, 2.01, 3.02, 4.19, 5.42], +0.45, 0.10, 3)
    # muted C4 swell
    v = supersaw(NOTE["C4"], (-6.0, 0.0, 5.0), seed=311)
    e = gate(3.45, 5.0, att=0.75, rel=1.1)
    L += pan2(v * e, -0.10) * 0.13
    # faint high bell leading to the impact
    L += bell(NOTE["A5"], 4.30, 1.5, [1.0, 0.4, 0.2], [1.0, 2.02, 3.01], +0.2, 0.05, 5)
    # low A2 entrance
    v = supersaw(NOTE["A2"], (-4.0, 0.0, 3.0), seed=312)
    e = gate(1.9, 5.0, att=1.6, rel=0.9)
    L += pan2(lp(v, 400.0, 2) * e, 0.0) * 0.18
    M.add(L, send=SENDS["sparse"], **LEVELS["sparse"], name="sparse")


# --------------------------------------------------------------------------- #
#  LAYER 5 -- 5.0 s airy impact (light, not a heavy hit)
# --------------------------------------------------------------------------- #
def band_sweep_noise(seed_l, seed_r, centers, t0, t1, width_oct=0.62,
                     edges=None, gains=None):
    """log band-bank noise with a moving (Gaussian in log-f) centre frequency"""
    if edges is None:
        edges = np.geomspace(70.0, 15000.0, 15)
    nb = len(edges) - 1
    ctr = np.sqrt(edges[:-1] * edges[1:])
    out = np.zeros((2, N))
    u = np.clip((t - t0) / max(t1 - t0, 1e-6), 0.0, 1.0)
    cf = np.asarray(centers(u), dtype=np.float64) if callable(centers) else np.full(N, float(centers))
    cf = np.maximum(cf, 30.0)
    lc = np.log2(cf)
    for s, ch in ((seed_l, 0), (seed_r, 1)):
        x = pink(N, s)
        X = np.fft.rfft(x)
        acc = np.zeros(N)
        for i in range(nb):
            g = np.exp(-0.5 * ((lc - math.log2(ctr[i])) / width_oct) ** 2)
            if not np.any(g > 1e-4):
                continue
            band = np.fft.irfft(X * band_h(edges[i], edges[i + 1], 2), N)
            acc += band * g
        out[ch] = acc
    return out


def build_impact(M):
    L = np.zeros((2, N))
    # air burst: descending noise centre, short attack, 0.55 s tail
    u_env = exp_env(5.0, 0.55, att=0.006)
    sweep = band_sweep_noise(7201, 7202,
                             lambda u: 7200.0 * (1100.0 / 7200.0) ** (u ** 0.85),
                             5.0, 5.9, width_oct=0.85)
    L += sweep * u_env
    # soft "breath" whoosh (wider, slower)
    w = band_sweep_noise(7203, 7204,
                         lambda u: 2600.0 * (420.0 / 2600.0) ** (u ** 0.7),
                         5.0, 6.6, width_oct=1.1)
    L += w * exp_env(5.0, 0.95, att=0.02) * 0.55
    # airy low body (a soft thump, not a kick)
    body = sine(62.0 * (36.0 / 62.0) ** np.clip((t - 5.0) / 0.45, 0, 1)) * exp_env(5.0, 0.26, att=0.004)
    L += pan2(body, 0.0) * 0.55
    # tiny transient sparkle
    sp = hp(pink(N, 7205), 3200.0, 2) * exp_env(5.0, 0.05, att=0.001)
    sp2 = hp(pink(N, 7206), 3200.0, 2) * exp_env(5.0, 0.05, att=0.001)
    L += np.stack([sp, sp2]) * 0.30
    M.add(L, send=SENDS["impact"], **LEVELS["impact"], name="impact5")


# --------------------------------------------------------------------------- #
#  LAYER 6 -- detuned low 16th-note pulse (5.0 - 17.0 s)
# --------------------------------------------------------------------------- #
def make_pulse(freq, cents, seed, octave=False):
    """one pre-rendered pulse voice ~0.32 s"""
    m = int(0.28 * SR)
    tl = np.arange(m) / SR
    v = np.zeros(m)
    for i, c in enumerate(cents):
        f = freq * c2a(c) * (2.0 if octave else 1.0)
        tab = saw_table(f, seed + 31 * i)
        # local oscillator on a short buffer
        pos = 0.1 * i * TSIZE + (f / SR) * TSIZE * np.arange(m)
        i0 = np.floor(pos)
        fr = pos - i0
        i0 = i0.astype(np.int64) % TSIZE
        v += tab[i0] + (tab[(i0 + 1) % TSIZE] - tab[i0]) * fr
    v /= len(cents)
    # sub sine
    sub = np.sin(2 * math.pi * freq * tl)
    # percussive envelope
    amp = smoothstep(tl / 0.0035) * np.exp(-tl / 0.062)
    amp *= 1.0 - smoothstep((tl - 0.22) / 0.05)
    # two-stage low-pass "filter envelope": bright attack -> dark body
    br = lp(np.pad(v, (0, N - m))[:N], 1500.0, 2)[:m]
    dk = lp(np.pad(v, (0, N - m))[:N], 260.0, 3)[:m]
    w = np.exp(-tl / 0.030)
    body = dk * (1.0 - 0.85 * w) + br * (0.85 * w)
    body110 = np.sin(2 * math.pi * freq * 2.0 * tl) * (1.0 - 0.85 * np.exp(-tl / 0.035))
    sig = (body + 0.30 * body110 + 0.45 * sub * (1.0 - 0.7 * np.exp(-tl / 0.04))) * amp
    return sig


def build_pulse(M):
    voices = {}
    for k, (c, oc, sd) in enumerate([
            ((-9.0, -2.0, 7.5), False, 5501),
            ((-7.0, 0.0, 9.0), False, 5521),
            ((-8.0, 1.0, 6.0), False, 5541),
            ((-6.0, 0.0, 5.0), True, 5561)]):
        voices[k] = make_pulse(NOTE["A1"], c, sd, oc)

    L = np.zeros((2, N))
    m = voices[0].size
    onsets = []
    k = 0
    while True:
        t0 = 5.0 + k * SIX
        if t0 >= 17.0 - 1e-9:
            break
        onsets.append((k, t0))
        k += 1
    for k, t0 in onsets:
        i = int(round(t0 * SR))
        if i + m > N:
            continue
        # section envelope
        g = smoothstep((t0 - 5.0) / 1.15) * smoothstep((17.15 - t0) / 0.65)
        if g <= 1e-4:
            continue
        accent = 1.0
        if k % 4 == 0:
            accent = 1.18
        if k % 8 == 0:
            accent = 1.34
        # subtle pitch/detune rotation on a 4-pulse (one beat) cycle so the
        # 16th-note groove stays regular
        v = voices[k % 4]
        if k % 8 == 0:
            v = v + 0.55 * voices[3]
        pan = 0.10 * math.sin(2.0 * math.pi * k / 8.0)
        gl = math.cos((pan + 1.0) * 0.25 * math.pi)
        gr = math.sin((pan + 1.0) * 0.25 * math.pi)
        L[0, i:i + m] += v * g * accent * gl
        L[1, i:i + m] += v * g * accent * gr
    # darkening low-pass as the pulse leaves (17 s)
    L = np.stack([lp(L[0], 420.0, 2) * 0.35 + L[0] * 0.65,
                  lp(L[1], 420.0, 2) * 0.35 + L[1] * 0.65])
    M.add(L, send=SENDS["pulse"], **LEVELS["pulse"], name="pulse")


# --------------------------------------------------------------------------- #
#  LAYER 7 -- high shimmer / overtones (5 - 21 s)
# --------------------------------------------------------------------------- #
def build_shimmer(M):
    L = np.zeros((2, N))
    env = automation([(0, 0.0), (5.1, 0.0), (7.6, 1.0), (10.9, 1.05), (11.3, 0.95),
                      (16.8, 0.85), (18.6, 0.45), (20.9, 0.35), (21.4, 0.55),
                      (22.6, 0.22), (23.6, 0.0)], 0.25)
    parts = [
        (NOTE["A5"], 0.42, 0.0), (NOTE["C6"], 0.34, +0.45),
        (NOTE["E6"], 0.30, -0.55), (NOTE["G6"], 0.22, +0.7),
        (NOTE["A6"], 0.18, -0.7), (NOTE["C7"], 0.12, +0.85),
        (NOTE["E5"], 0.16, -0.25),
    ]
    for i, (f, g, pan) in enumerate(parts):
        rate = 0.09 + 0.035 * i
        trem = 1.0 + 0.55 * np.sin(2 * math.pi * rate * t + 1.1 * i)
        for j, c in enumerate((-6.0, 5.5)):
            s = sine(f * c2a(c), phase0=0.7 * j + 0.3 * i)
            pp = pan + (0.05 if j else -0.05)
            L += pan2(s * trem * env, pp) * (g * 0.30)
    # slow high-noise shimmer
    nh = hp(fft_filter(pink(N, 7301), band_h(4200.0, 13000.0, 2)), 4000.0, 2)
    nh2 = hp(fft_filter(pink(N, 7302), band_h(4200.0, 13000.0, 2)), 4000.0, 2)
    sl = 1.0 + 0.45 * np.sin(2 * math.pi * 0.117 * t + 0.2)
    L[0] += nh * env * sl * 0.10
    L[1] += nh2 * env * (1.0 + 0.45 * np.sin(2 * math.pi * 0.101 * t + 1.9)) * 0.10
    # sparse sparkle overtones riding the reverb
    for (t0, f, p, a) in [(8.2, NOTE["A6"], +0.5, 0.05), (11.0, NOTE["C7"], -0.4, 0.07),
                          (13.4, NOTE["E6"], +0.65, 0.045), (15.7, NOTE["G6"], -0.6, 0.04),
                          (19.1, NOTE["A6"], +0.3, 0.04), (21.0, NOTE["E6"], -0.2, 0.07)]:
        L += bell(f, t0, 1.9, [1.0, 0.35], [1.0, 2.01], p, a, 41 + int(t0))
    M.add(L, send=SENDS["shimmer"], **LEVELS["shimmer"], name="shimmer")


# --------------------------------------------------------------------------- #
#  LAYER 8 -- riser 9.5 -> 11.0 s (noise sweep + upward pitch glide)
# --------------------------------------------------------------------------- #
def build_riser(M):
    t0, t1 = 9.5, 11.0
    u = np.clip((t - t0) / (t1 - t0), 0.0, 1.0)
    env = (u ** 1.15) * (1.0 - smoothstep((t - (t1 - 0.012)) / 0.012))

    # --- noise band sweep, exponential upward
    edges = np.geomspace(90.0, 15000.0, 15)
    ctr = np.sqrt(edges[:-1] * edges[1:])
    cf = 180.0 * (11000.0 / 180.0) ** (u ** 0.95)
    lc = np.log2(np.maximum(cf, 40.0))
    out = np.zeros((2, N))
    for s, ch in ((7401, 0), (7402, 1)):
        X = np.fft.rfft(pink(N, s))
        acc = np.zeros(N)
        for i in range(len(edges) - 1):
            g = np.exp(-0.5 * ((lc - math.log2(ctr[i])) / 0.66) ** 2)
            if not np.any(g > 1e-4):
                continue
            acc += np.fft.irfft(X * band_h(edges[i], edges[i + 1], 2), N) * g
        out[ch] = acc
    # widening towards the drop
    mid = 0.5 * (out[0] + out[1])
    side = 0.5 * (out[0] - out[1]) * (1.0 + 1.1 * u)
    out[0] = mid + side
    out[1] = mid - side
    out *= env * (0.28 + 0.72 * smoothstep(u))

    # --- pitch glide: A2 -> A5 (two octaves+) with vibrato
    f_glide = NOTE["A2"] * (NOTE["A5"] / NOTE["A2"]) ** (u ** 1.45)
    vib = 1.0 + 0.006 * np.sin(2 * math.pi * (5.0 + 6.0 * u) * t)
    glide = sine(f_glide * vib) * 0.55
    glide += 0.45 * sine(f_glide * vib * c2a(7.0)) * 0.5
    tab = saw_table(300.0, 7511)
    pad_glide = osc_glide(NOTE["A2"] * 4.0 * (NOTE["A5"] / (NOTE["A2"] * 4.0)) ** (u ** 1.45), tab)
    gl_env = u ** 1.2
    Lg = np.zeros((2, N))
    sig = (glide * 0.55 + pad_glide * 0.30) * gl_env * env
    Lg[0] = sig * (0.75 + 0.25 * u)
    Lg[1] = sig * (0.75 - 0.25 * u)
    out += Lg
    # --- low swell underneath
    lw = lp(pink(N, 7503), 140.0, 3) * (u ** 2.0) * env
    out[0] += lw * 0.8
    out[1] += lp(pink(N, 7504), 140.0, 3) * (u ** 2.0) * env * 0.8
    M.add(out, send=SENDS["riser"], **LEVELS["riser"], name="riser")


# --------------------------------------------------------------------------- #
#  LAYER 9 -- bright chord hit at 11.0 s
# --------------------------------------------------------------------------- #
CHORD = [("A3", 220.000), ("C4", 261.626), ("E4", 329.628), ("A4", 440.000),
         ("C5", 523.251), ("E5", 659.255), ("G5", 783.991), ("A5", 880.000),
         ("C6", 1046.502)]


def chord_hit(notes, t0, tau, attack, gains, seed, bright=12000.0, dark=3200.0,
              tap=1.0):
    """one detuned saw chord with per-voice pan + bright->dark filter envelope"""
    L = np.zeros((2, N))
    for i, (nm, f) in enumerate(notes):
        cents = (-8.0, 0.0, 6.5) if f < 700.0 else (-7.0, 0.0, 5.0)
        v = supersaw(f, cents, seed=seed + 7 * i)
        e = exp_env(t0, tau, att=attack)
        e = e * (1.0 - smoothstep((t - (t0 + 2.6)) / 2.2))
        v = v * e * gains[i] * tap
        pan = 0.62 * math.sin(1.7 * i + 0.4) * min(1.0, 0.35 + f / 900.0)
        L += pan2(v, pan)
    # filter envelope: bright at the transient, closing
    k = np.clip((t - t0) / 1.1, 0.0, 1.0)
    fc = bright * (dark / bright) ** (k ** 0.55)
    pos = np.interp(np.log2(fc), np.log2(np.geomspace(400.0, 14000.0, 13)),
                    np.arange(13))
    out = np.zeros((2, N))
    for ch in (0, 1):
        X = np.fft.rfft(L[ch])
        grid = np.geomspace(400.0, 14000.0, 13)
        for j, fc_j in enumerate(grid):
            w = np.clip(1.0 - np.abs(pos - j), 0.0, 1.0)
            if not np.any(w > 1e-4):
                continue
            out[ch] += np.fft.irfft(X * response_lp(fc_j, 2), N) * w
    return out


def build_hit11(M):
    L = chord_hit(CHORD, 11.0, 1.55, 0.010,
                  [0.32, 0.30, 0.28, 0.26, 0.23, 0.20, 0.15, 0.13, 0.10],
                  seed=8100, bright=13000.0, dark=4200.0)
    # sub punch
    L += pan2(sine(58.0 * (40.0 / 58.0) ** np.clip((t - 11.0) / 0.5, 0, 1)) *
              exp_env(11.0, 0.42, att=0.006), 0.0) * 0.75
    # air burst
    air = band_sweep_noise(8101, 8102,
                           lambda u: 9000.0 * (1400.0 / 9000.0) ** (u ** 0.8),
                           11.0, 11.9, width_oct=0.95)
    L += air * exp_env(11.0, 0.60, att=0.004) * 0.9
    M.add(L, send=SENDS["hit11"], **LEVELS["hit11"], name="hit11")


# --------------------------------------------------------------------------- #
#  LAYER 10 -- main pad 11.0 - 21.0 s (fullest section)
# --------------------------------------------------------------------------- #
PAD = [("A2", 110.000, 0.58, -0.10), ("E3", 164.814, 0.66, 0.18),
       ("A3", 220.000, 0.78, -0.22), ("C4", 261.626, 0.74, 0.30),
       ("E4", 329.628, 0.72, -0.36), ("G4", 391.995, 0.60, 0.42),
       ("A4", 440.000, 0.62, -0.46), ("C5", 523.251, 0.52, 0.52),
       ("E5", 659.255, 0.44, -0.58), ("G5", 783.991, 0.34, 0.62),
       ("A5", 880.000, 0.30, -0.66), ("C6", 1046.502, 0.20, 0.70),
       ("E6", 1318.510, 0.14, -0.74)]


def build_pad(M):
    L = np.zeros((2, N))
    for i, (nm, f, g, pan) in enumerate(PAD):
        cents = (-8.0, -3.0, 3.0, 8.0) if f < 500.0 else (-7.0, 0.0, 7.0)
        v = supersaw(f, cents, seed=9100 + 13 * i)
        start = 11.0 + min(1.25, 0.055 * i)                 # staggered bloom
        att = 1.15 + 0.05 * (i % 4)
        e = smoothstep((t - start) / att)
        e *= 1.0 - smoothstep((t - 20.92) / 0.75)           # release into 21 s hit
        lfo = 1.0 + (0.20 if f < 700 else 0.12) * np.sin(
            2 * math.pi * (0.055 + 0.011 * i) * t + 1.9 * i)
        L += pan2(v * e * lfo, pan * 1.05) * g
    # slow filter bloom: 11.0 open, settle, close 17->21
    fc = automation([(10.9, 4200.0), (11.02, 12000.0), (11.35, 7000.0),
                     (13.5, 4600.0), (16.4, 5200.0), (17.1, 4600.0),
                     (18.6, 2400.0), (19.9, 1200.0), (21.0, 820.0)], 0.05)
    lcf = np.log2(np.maximum(fc, 200.0))
    grid = np.geomspace(240.0, 14000.0, 13)
    pos = np.interp(lcf, np.log2(grid), np.arange(13))
    out = np.zeros((2, N))
    for ch in (0, 1):
        X = np.fft.rfft(L[ch])
        for j, fc_j in enumerate(grid):
            w = np.clip(1.0 - np.abs(pos - j), 0.0, 1.0)
            if not np.any(w > 1e-4):
                continue
            out[ch] += np.fft.irfft(X * response_lp(fc_j, 2), N) * w
    # section shape: full through 16.5 s, then a deliberate closing taper
    out *= automation([(10.9, 0.86), (12.6, 1.0), (16.5, 1.0), (18.4, 0.68),
                       (20.4, 0.52), (20.95, 0.46), (21.06, 0.20),
                       (21.5, 0.0)], 0.05)
    M.add(out, send=SENDS["pad"], **LEVELS["pad"], name="pad11-21")


# --------------------------------------------------------------------------- #
#  LAYER 11 -- final chord 21.0 s + long tail to 24.0 s
# --------------------------------------------------------------------------- #
FINAL = [("A1", 55.000, 0.55, 0.0), ("A2", 110.000, 0.72, 0.0),
         ("E3", 164.814, 0.66, -0.15), ("A3", 220.000, 0.72, 0.15),
         ("C4", 261.626, 0.66, -0.28), ("E4", 329.628, 0.62, 0.30),
         ("G4", 391.995, 0.52, -0.38), ("A4", 440.000, 0.56, 0.40),
         ("C5", 523.251, 0.44, -0.50), ("E5", 659.255, 0.36, 0.54),
         ("G5", 783.991, 0.28, -0.60), ("A5", 880.000, 0.24, 0.66),
         ("C6", 1046.502, 0.16, -0.72), ("E6", 1318.510, 0.11, 0.78),
         ("A6", 1760.000, 0.06, 0.30)]


def build_final(M):
    L = np.zeros((2, N))
    for i, (nm, f, g, pan) in enumerate(FINAL):
        cents = (-9.0, -4.0, 0.0, 4.0, 9.0) if f < 500.0 else (-8.0, 0.0, 8.0)
        v = supersaw(f, cents, seed=9500 + 11 * i)
        e = smoothstep((t - 21.0) / 0.014) * np.exp(-np.maximum(t - 21.0, 0.0) / 1.05)
        e *= 1.0 - smoothstep((t - 23.86) / 0.14)
        lfo = 1.0 + 0.12 * np.sin(2 * math.pi * 0.047 * t + 1.2 * i)
        L += pan2(v * e * lfo, pan) * g
    # sub boom
    L += pan2(sine(55.0) * smoothstep((t - 21.0) / 0.01) *
              np.exp(-np.maximum(t - 21.0, 0.0) / 1.4), 0.0) * 0.55
    # filter: open bright at the hit, close down over the tail
    fc = automation([(20.9, 2000.0), (21.02, 11000.0), (21.5, 6200.0),
                     (22.4, 3300.0), (23.3, 1500.0), (23.95, 700.0)], 0.02)
    pos = np.interp(np.log2(np.maximum(fc, 200.0)),
                    np.log2(np.geomspace(240.0, 14000.0, 13)), np.arange(13))
    grid = np.geomspace(240.0, 14000.0, 13)
    out = np.zeros((2, N))
    for ch in (0, 1):
        X = np.fft.rfft(L[ch])
        for j, fc_j in enumerate(grid):
            w = np.clip(1.0 - np.abs(pos - j), 0.0, 1.0)
            if not np.any(w > 1e-4):
                continue
            out[ch] += np.fft.irfft(X * response_lp(fc_j, 2), N) * w
    # reverse-ish swell 20.25 -> 21.0 (pre-roll into the last chord)
    pre = exp_env_pre(20.25, 21.0, 7402)
    out += pre * 0.55
    # air burst on the hit
    air = band_sweep_noise(9601, 9602,
                           lambda u: 10000.0 * (1200.0 / 10000.0) ** (u ** 0.75),
                           21.0, 22.0, width_oct=0.95)
    out += air * exp_env(21.0, 0.8, att=0.005) * 0.85
    M.add(out, send=SENDS["final"], **LEVELS["final"], name="final21-24")


def exp_env_pre(t0, t1, seed):
    """rising noise swell that stops at t1 (anticipation into the hit)"""
    n = pink(N, seed)
    H = band_h(300.0, 9000.0, 2)
    x = fft_filter(n, H)
    u = np.clip((t - t0) / (t1 - t0), 0.0, 1.0)
    e = (u ** 2.6) * (1.0 - smoothstep((t - (t1 - 0.006)) / 0.006))
    return np.stack([x * e, lp(fft_filter(pink(N, seed + 1), H), 9000.0, 2) * e])


# --------------------------------------------------------------------------- #
#  convolution reverb
# --------------------------------------------------------------------------- #
def make_ir(seconds=3.9, predelay=0.024, damp=5600.0, seed=9800):
    n = int(seconds * SR)
    tt = np.arange(n) / SR
    chans = []
    for c in range(2):
        r = np.random.default_rng(seed + c)
        env = np.exp(-tt / (seconds * 0.30))
        env *= np.clip(tt / 0.004, 0.0, 1.0)                 # soft onset
        ir = r.standard_normal(n) * env
        ir = lp(np.pad(ir, (0, N - n))[:N], damp, 2)[:n]
        ir = hp(np.pad(ir, (0, N - n))[:N], 165.0, 2)[:n]
        # sparse early reflections (decorrelated per channel)
        for k in range(11):
            dt = r.uniform(0.007, 0.085)
            i = int(dt * SR)
            ir[i] += r.uniform(-1.0, 1.0) * (1.0 - dt / 0.09) * 2.5
        ir /= math.sqrt(float(np.sum(ir * ir)) + 1e-12)
        chans.append(np.concatenate([np.zeros(int(predelay * SR)), ir]))
    return np.stack(chans)


def convolve(x, h):
    n = len(x) + len(h) - 1
    nfft = 1 << int(math.ceil(math.log2(n + 1)))
    y = np.fft.irfft(np.fft.rfft(x, nfft) * np.fft.rfft(h, nfft), nfft)
    return y[:N]


def build_wet(send, amount=0.62):
    ir = make_ir()
    wet = np.zeros((2, N))
    for ch in (0, 1):
        wet[ch] = convolve(send[ch], ir[ch])
    wet = np.stack([hp(wet[0], 190.0, 2), hp(wet[1], 190.0, 2)])
    return wet * amount


# --------------------------------------------------------------------------- #
#  master chain
# --------------------------------------------------------------------------- #
def ms_width(x, w):
    m = 0.5 * (x[0] + x[1])
    s = 0.5 * (x[0] - x[1]) * w
    return np.stack([m + s, m - s])


def compressor(x, thr_db=-19.0, ratio=2.0, att_db=0.008, rel_db=0.12,
               makeup_db=1.6, block=64):
    nb = N // block
    e = np.max(np.abs(x[:, :nb * block]).reshape(2, nb, block), axis=(0, 2))
    env_db = 20.0 * np.log10(e + 1e-9)
    over = np.maximum(0.0, env_db - thr_db)
    gr = -over * (1.0 - 1.0 / ratio)
    a_att = math.exp(-block / (att_db * SR))
    a_rel = math.exp(-block / (rel_db * SR))
    sm = np.empty(nb)
    prev = 0.0
    for i in range(nb):
        a = a_att if gr[i] < prev else a_rel
        prev = a * prev + (1.0 - a) * gr[i]
        sm[i] = prev
    gdb = sm + makeup_db
    g = np.interp(np.arange(N) / block, np.arange(nb), db2a(gdb))
    return x * g


def limiter(x, ceil_db=-1.2, block=48, rel_db=0.09):
    nb = N // block
    e = np.max(np.abs(x[:, :nb * block]).reshape(2, nb, block), axis=(0, 2))
    ceil = db2a(ceil_db)
    need = np.minimum(1.0, ceil / (e + 1e-9))
    gr_db = 20.0 * np.log10(need + 1e-12)
    a_rel = math.exp(-block / (rel_db * SR))
    sm = np.empty(nb)
    prev = 0.0
    for i in range(nb):
        a = 0.0 if gr_db[i] < prev else a_rel     # instant attack
        prev = a * prev + (1.0 - a) * gr_db[i]
        sm[i] = prev
    g = db2a(np.interp(np.arange(N) / block, np.arange(nb), sm))
    g = np.minimum(g, 1.0)
    return x * g


def stage(nm, x, st):
    st[nm] = (20.0 * np.log10(np.max(np.abs(x)) + 1e-12),
              20.0 * np.log10(math.sqrt(float(np.mean(x ** 2))) + 1e-12))
    return x


SECT = [(0.0, 5.0), (5.0, 11.0), (11.0, 17.0), (17.0, 21.0), (21.0, 24.0)]


def sect_rms(x):
    out = []
    for a, b in SECT:
        m = (t >= a) & (t < b)
        out.append(20.0 * np.log10(math.sqrt(float(np.mean(x[:, m] ** 2))) + 1e-12))
    return out


def master(dry, send, st=None):
    st = {} if st is None else st
    wet = build_wet(send, 0.72)
    mix = stage("dry+wet", (dry + wet) * db2a(-4.0), st)
    st["sect_dry_wet"] = sect_rms(mix)
    mix = np.stack([hp(mix[0], 31.0, 2), hp(mix[1], 31.0, 2)])
    mix = ms_width(mix, 1.18)
    mix = stage("width", mix, st)
    mix = np.tanh(mix * 1.06) / 1.06                        # gentle glue saturation
    mix = stage("saturate", mix, st)
    mix = compressor(mix, thr_db=-13.0, ratio=1.5, att_db=0.012,
                     rel_db=0.20, makeup_db=0.0)
    mix = stage("compress", mix, st)
    mix = limiter(mix, ceil_db=-1.1, block=32, rel_db=0.12)
    mix = stage("limit", mix, st)
    # 50 ms smoothstep fade in / at 24.000 s, plus a long natural tail fade so
    # the reverb dies to true silence instead of being chopped at the end
    fi = smoothstep(t / 0.050)
    fo = smoothstep((DUR - 0.050 - t) / 0.050)
    tail = 1.0 - smoothstep((t - 22.85) / 1.13)
    mix *= fi * fo * tail
    peak = np.max(np.abs(mix))
    st["fades"] = (20.0 * np.log10(peak + 1e-12),
                   20.0 * np.log10(math.sqrt(float(np.mean(mix ** 2))) + 1e-12))
    mix *= db2a(-1.0) / (peak + 1e-12)
    stage("normalize", mix, st)
    st["sect_pre_master"] = sect_rms(mix)
    return mix, st


# --------------------------------------------------------------------------- #
#  write + verify
# --------------------------------------------------------------------------- #
def write_wav(path, x24):
    """x24: (2, N) float in [-1, 1] -> 24-bit PCM stereo"""
    n = x24.shape[1]
    ints = np.round(x24.T * 8388607.0).astype(np.int32)
    ints = np.clip(ints, -8388608, 8388607)
    u8 = np.ascontiguousarray(ints, dtype="<i4").view(np.uint8).reshape(n, 8)
    payload = u8[:, [0, 1, 2, 4, 5, 6]].tobytes()
    with wave.open(path, "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(3)
        wf.setframerate(SR)
        wf.writeframes(payload)


def read_wav(path):
    with wave.open(path, "rb") as wf:
        nch, sw, fr, nf = wf.getnchannels(), wf.getsampwidth(), wf.getframerate(), wf.getnframes()
        raw = wf.readframes(nf)
    assert sw == 3
    b = np.frombuffer(raw, dtype=np.uint8).reshape(nf, nch * 3)
    s = np.zeros((nf, nch), dtype=np.int32)
    for c in range(nch):
        u = b[:, c * 3:c * 3 + 3].astype(np.int32)
        v = u[:, 0] | (u[:, 1] << 8) | (u[:, 2] << 16)
        v = np.where(v >= 1 << 23, v - (1 << 24), v)
        s[:, c] = v
    return s, nch, sw, fr, nf


def rms_db(x, t0, t1):
    m = (t >= t0) & (t < t1)
    if not np.any(m):
        return -np.inf
    return 20.0 * np.log10(math.sqrt(float(np.mean(x[:, m] ** 2))) + 1e-12)


def spectral_flux_onsets(x, hop=1024):
    nfr = N // hop
    w = np.hanning(1024)
    mag = np.abs(np.fft.rfft(x[0, :nfr * hop].reshape(nfr, hop) *
                             w[:hop] if hop <= 1024 else w, axis=1))
    d = np.diff(mag, axis=0)
    flux = np.sum(np.maximum(d, 0.0), axis=1)
    flux /= (np.max(flux) + 1e-12)
    # local maxima, sorted by strength
    idx = [i for i in range(1, len(flux) - 1)
           if flux[i] > flux[i - 1] and flux[i] >= flux[i + 1] and flux[i] > 0.12]
    idx.sort(key=lambda i: -flux[i])
    return [(round((i + 1) * hop / SR, 3), round(float(flux[i]), 3)) for i in idx[:12]]


def main():
    t_start = time.time()
    print("=" * 74)
    print("make_score.py -- 24 s cinematic minimal-electronic cue (pure numpy)")
    print("=" * 74)

    M = Mix()
    build_sub(M)
    build_rumble(M)
    build_bed(M)
    build_sparse(M)
    build_impact(M)
    build_pulse(M)
    build_shimmer(M)
    build_riser(M)
    build_hit11(M)
    build_pad(M)
    build_final(M)
    print("layers built in %.1fs" % (time.time() - t_start))
    for e in M.log:
        print("  %-12s peak %6.1f dBFS  send %.2f" % (e["name"], e["peak"], e["send"]))

    print("  dry  section RMS:", " ".join("%6.1f" % v for v in sect_rms(M.dry)))
    print("  send section RMS:", " ".join("%6.1f" % v for v in sect_rms(M.send)))
    mix, st = master(M.dry, M.send)
    print("master in %.1fs" % (time.time() - t_start))
    print("  dry+wet section RMS:", " ".join("%6.1f" % v for v in st["sect_dry_wet"]))
    print("\n--- master chain (peak / rms dBFS) ---")
    for k in ("dry+wet", "width", "saturate", "compress", "limit", "fades", "normalize"):
        print("  %-10s %7.2f / %7.2f" % (k, st[k][0], st[k][1]))
    print("  section RMS pre-master:", " ".join("%6.1f" % v for v in st["sect_pre_master"]))

    # quantise + write
    write_wav(WAV_PATH, mix)
    s, nch, sw, fr, nf = read_wav(WAV_PATH)
    x = s.T.astype(np.float64) / 8388607.0
    peak = np.max(np.abs(x))
    peak_i = int(np.argmax(np.abs(x[0])))
    corr = float(np.corrcoef(x[0], x[1])[0, 1])
    clip = int(np.sum(np.abs(s) >= 8388607))

    print("\n--- file ---")
    print("path      :", WAV_PATH)
    print("duration  : %.6f s  (%d frames @ %d Hz)" % (nf / fr, nf, fr))
    print("format    : %d ch, %d-bit PCM, %d Hz" % (nch, sw * 8, fr))
    print("size      : %.2f MB" % (os.path.getsize(WAV_PATH) / 1e6))
    print("peak      : %.2f dBFS  (at %.3f s)   clipped samples: %d"
          % (20 * np.log10(peak + 1e-12), peak_i / SR, clip))
    print("L/R corr  : %.3f" % corr)

    print("\n--- section RMS (dBFS) ---")
    for nm, a, b in [("0.0-5.0   intro", 0.0, 5.0), ("5.0-11.0  pulse", 5.0, 11.0),
                     ("11.0-17.0 bloom", 11.0, 17.0), ("17.0-21.0 close", 17.0, 21.0),
                     ("21.0-24.0 final", 21.0, 24.0)]:
        print("  %-16s %6.1f   (peak %5.1f)" %
              (nm, rms_db(x, a, b), 20 * np.log10(np.max(np.abs(x[:, (t >= a) & (t < b)])) + 1e-12)))

    print("\n--- 1 s RMS profile ---")
    line = []
    for i in range(24):
        line.append("%5.1f" % rms_db(x, i, i + 1))
    print(" ".join(line))
    print("\n--- last 200 ms ---")
    print("  RMS  %.1f dBFS" % rms_db(x, 23.8, 24.0))
    print("  last sample  L=%.1f R=%.1f" % (a2db(x[0, -1]), a2db(x[1, -1])))
    print("  samples |x|<1e-6 in final 10ms: %d/%d"
          % (int(np.sum(np.abs(x[:, -480:]) < 1e-6)), 960))

    print("\n--- spectral balance (band energy dB rel. total) ---")
    def bands(xx, a, b):
        m = (t >= a) & (t < b)
        seg = xx[0, m]
        if len(seg) < 4096:
            return (0, 0, 0, 0)
        X = np.abs(np.fft.rfft(seg * np.hanning(len(seg))))
        f = np.fft.rfftfreq(len(seg), 1.0 / SR)
        tot = float(np.sum(X ** 2)) + 1e-12
        out = []
        for lo, hi in ((20, 150), (150, 800), (800, 4000), (4000, 20000)):
            out.append(10 * np.log10((float(np.sum(X[(f >= lo) & (f < hi)] ** 2)) / tot) + 1e-12))
        cen = float(np.sum(f * X ** 2) / tot)
        return out + [cen]
    for nm, a, b in [("intro", 0.0, 5.0), ("pulse", 5.0, 11.0), ("bloom", 11.0, 17.0),
                     ("close", 17.0, 21.0), ("final", 21.0, 24.0)]:
        v = bands(x, a, b)
        print("  %-6s sub%6.1f low%6.1f mid%6.1f high%6.1f   centroid %5.0f Hz"
              % (nm, v[0], v[1], v[2], v[3], v[4]))

    print("\n--- spectral-flux onsets (top, time in s) ---")
    for tm, v in spectral_flux_onsets(x):
        print("  %6.3f  %5.3f" % (tm, v))

    print("\n--- checkpoints ---")
    for tm in (4.99, 5.0, 5.01, 10.99, 11.0, 11.01, 20.99, 21.0, 21.01, 23.99):
        i = min(N - 1, int(tm * SR))
        print("  t=%6.2f  |L|=% .4f  |R|=% .4f" % (tm, abs(x[0, i]), abs(x[1, i])))

    print("\ntotal %.1fs" % (time.time() - t_start))
    return 0


if __name__ == "__main__":
    sys.exit(main())
