#!/usr/bin/env node
// quality-check.mjs — objective "how crisp / how pixelated / how jagged" metrics for
// the CIELO page, plus before/after comparison between two build tags.
//
// Nothing is judged by eye here: every number is computed from a PNG screenshot with
// Node's built-in zlib (no third-party deps). Screenshots are taken by the existing
// tools/shot.mjs (CDP + local Chrome); this file only drives it via child_process.
//
// usage:
//   node tools/quality-check.mjs --tag=baseline
//        [--views=0,4,7,40] [--mobile] [--desktop] [--gpu=default]
//        [--tag=baseline] [--compare=baseline,new] [--reuse] [--wait=9000]
//
//   --tag=<t>            capture (or reuse) this build's shots into 04-output/_quality/<t>/
//   --views=a,b,c        views to shoot for every selected mode
//                        (default mobile 0,4,7,40 / desktop 0,7)
//   --mobile/--desktop   restrict modes (default: both). mobile = 1280x582 CSS @dpr2,
//                        touch emulation, ?q=low; desktop = 1280x720 @dpr1, ?q=high
//   --compare=a,b[,c]    print the metrics side by side with change % (b/c against a).
//                        With no explicit --tag this only reads the saved metrics.json.
//   --reuse              reuse an already captured PNG for a shot instead of re-shooting
//   --wait=<ms>          extra settle time before the screenshot (default 9000/10000)
//   --q=low|mid|high     diagnostic override of the page's quality tier, e.g. shoot the
//                        mobile viewport at q=high to see how much of the pixelation is the
//                        tier rather than the renderer
//   --q-mobile=... / --q-desktop=...   per-mode tier; pass "default" to omit q= entirely and
//                        let the page pick (round-13 touch default = mid/均衡)
//   --crop=x,y,w,h[,zoom]  save a zoomed crop of each shot (several specs separated by ';')
//   --crop-auto=N        save the N worst sharpening-halo tiles per shot (needs the halo metric)
//   --zoom=N             crop upscale factor (default 3, nearest neighbour)
//   --port=<n>           base Chrome debugging port (default 9331; +i per shot)
//   --out=<dir>          output root (default 04-output/_quality)
//
// Every shot is frozen at ?freeze=2&tod=day&noui=1 so different builds are comparable;
// the adaptive render scale is disabled inside the page whenever freeze is set, so the
// buffers are exactly q-tier sized and the pixelation numbers are stable run to run.
// Mobile shots use --dpr=2, i.e. the PNG is the device-pixel image (1280x582 CSS ->
// 2560x1164): the canvas buffer is CSS-width×scale, so on a dpr=2 phone even a "crisp"
// build is upscaled unless the renderer draws at the device pixel ratio. Compare mobile
// against mobile (never against the desktop numbers, which are dpr=1 and 1:1).
//
// Metrics (all on Rec.709 luma, reported for the full frame AND the central 60% region):
//   sharpnessLapVar        variance of the 4-neighbour Laplacian (higher = sharper)
//   sharpnessTenengrad     mean gradient magnitude in gray levels (higher = sharper)
//   pixelationAdjEqPct     % of horizontal+vertical neighbouring pixel pairs whose RGB is
//                          bit-identical — upscaled buffers produce runs of equal pixels,
//                          so this is the core "画面粗糙" number (lower = better)
//   pixelationAdjEqTexPct  same but restricted to 3x3-textured areas (sky gradient excluded)
//   pixelationBlock2x2Pct  % of aligned 2x2 blocks in which all four pixels are identical
//   aliasStairPct          % of pixels where the 2nd difference repeats with the same sign
//                          two pixels away (classic stair-step diagonal edges; lower better)
//   aliasHFRatio           mean|Laplacian| / mean|gradient| inside textured areas
//                          (rough/hard-stepped edge behaviour; lower = smoother)
//   edgeFracPct            % of pixels on a strong edge (|grad| > 18 gray levels)
//   edgeContrastP95        p95 of the 3x3 max-min luma span at those strong edges (higher =
//                          crisper, less washed out)
//
// exit 0 = metrics written for every requested shot.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import url from 'node:url';
import zlib from 'node:zlib';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const CIELO = path.resolve(here, '..');            // 01-source/cielo
const ROOT = path.resolve(here, '../../..');       // repo root

const argv = process.argv.slice(2);
const has = (n) => argv.some((a) => a === '--' + n || a.startsWith('--' + n + '='));
function opt(name, def) {
  for (const a of argv) {
    const m = a.match(new RegExp('^--' + name + '=(.*)$', 's'));
    if (m) return m[1];
  }
  return def;
}

if (has('help') || has('h')) {
  const src = fs.readFileSync(url.fileURLToPath(import.meta.url), 'utf8').split('\n');
  const cut = src.findIndex((l) => l.startsWith('import '));
  console.log(src.slice(0, cut > 0 ? cut : src.length).join('\n'));
  process.exit(0);
}

const SITE_PORT = Number(opt('site-port', 8099));
const CDP_PORT = Number(opt('port', 9331));
const GPU = opt('gpu', 'default');
const OUT_ROOT = path.resolve(ROOT, opt('out', '04-output/_quality'));
const PAGE = 'http://127.0.0.1:' + SITE_PORT + '/04-output/CIELO.html';
const FREEZE = 2;
const TOD = 'day';

const MODES = {
  mobile: { key: 'mobile', mobile: true, touch: true, dpr: 2, w: 1280, h: 582, q: 'low', views: [0, 4, 7, 40], wait: 10000 },
  desktop: { key: 'desktop', mobile: false, touch: false, dpr: 1, w: 1280, h: 720, q: 'high', views: [0, 7], wait: 9000 },
};
const viewArg = opt('views', '');
const viewsOverride = viewArg ? viewArg.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n)) : null;
const selected = [];
if (has('mobile') || !has('desktop')) selected.push(MODES.mobile);
if (has('desktop') || !has('mobile')) selected.push(MODES.desktop);

const qOverride = opt('q', null);          // diagnostic: force q=low|mid|high on the page
const cropArg = opt('crop', null);          // x,y,w,h[,zoom] ; several specs separated by ';'
const cropAuto = Math.max(0, Number(opt('crop-auto', 0)) | 0);   // N worst halo tiles
const cropZoom = Math.max(1, Math.min(6, Number(opt('zoom', 3)) | 0));
// per-mode tier, 'default' = do not put q= in the URL at all (page picks its own default)
const qMobileArg = opt('q-mobile', null);
const qDesktopArg = opt('q-desktop', null);
const tierFor = (modeKey) => {
  const v = modeKey === 'mobile' ? qMobileArg : qDesktopArg;
  return v !== null ? v : qOverride;
};
const tagExplicit = has('tag');
const TAG = opt('tag', 'baseline');
const compareArg = opt('compare', null);

// ---------------------------------------------------------------- png decode
// 8-bit PNG, colour type 0/2/3/4/6, filter 0-4, no interlace. Returns RGBA + luma.
function decodePNG(buf) {
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47 || buf.readUInt32BE(4) !== 0x0d0a1a0a) throw new Error('not a PNG');
  let off = 8;
  let ihdr = null, plte = null, trns = null;
  const idat = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      ihdr = {
        width: data.readUInt32BE(0), height: data.readUInt32BE(4),
        bitDepth: data[8], colorType: data[9], compression: data[10],
        filter: data[11], interlace: data[12],
      };
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'PLTE') plte = Buffer.from(data);
    else if (type === 'tRNS') trns = Buffer.from(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (!ihdr) throw new Error('PNG without IHDR');
  if (ihdr.interlace !== 0) throw new Error('interlaced PNG unsupported');
  if (ihdr.compression !== 0 || ihdr.filter !== 0) throw new Error('unsupported PNG compression/filter method');
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ihdr.colorType];
  if (!ch) throw new Error('unsupported PNG colour type ' + ihdr.colorType);
  const bd = ihdr.bitDepth;
  if (bd !== 8 && bd !== 16) throw new Error('unsupported PNG bit depth ' + bd);
  if ((ihdr.colorType === 3) && bd !== 8) throw new Error('palette PNG must be 8-bit');
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const { width: W, height: H } = ihdr;
  const bitsPP = ch * bd;
  const bpp = Math.max(1, bitsPP >> 3);          // bytes per pixel for filter math
  const stride = Math.ceil((W * bitsPP) / 8);
  if (raw.length < (stride + 1) * H) throw new Error('PNG data too short');
  const out = Buffer.alloc(stride * H);
  const prev = Buffer.alloc(stride);
  let pos = 0;
  for (let y = 0; y < H; y++) {
    const ft = raw[pos++];
    const row = raw.subarray(pos, pos + stride);
    pos += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    if (ft === 0) row.copy(cur);
    else if (ft === 1) {
      for (let i = 0; i < stride; i++) cur[i] = (row[i] + (i >= bpp ? cur[i - bpp] : 0)) & 255;
    } else if (ft === 2) {
      for (let i = 0; i < stride; i++) cur[i] = (row[i] + prev[i]) & 255;
    } else if (ft === 3) {
      for (let i = 0; i < stride; i++) cur[i] = (row[i] + (((i >= bpp ? cur[i - bpp] : 0) + prev[i]) >> 1)) & 255;
    } else if (ft === 4) {
      for (let i = 0; i < stride; i++) {
        const a = i >= bpp ? cur[i - bpp] : 0;
        const b = prev[i];
        const c = i >= bpp ? prev[i - bpp] : 0;
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        cur[i] = (row[i] + pr) & 255;
      }
    } else throw new Error('bad PNG filter type ' + ft);
    prev.set(cur);
  }
  // ---- to RGBA + luma
  const rgba = new Uint8Array(W * H * 4);
  const luma = new Float32Array(W * H);
  const is16 = bd === 16;
  const s16 = is16 ? 2 : 1;          // byte step inside one channel
  const pxStep = is16 ? bpp : bpp;   // bytes per pixel
  for (let y = 0; y < H; y++) {
    const rs = y * stride;
    for (let x = 0; x < W; x++) {
      let r, g, b, a = 255;
      const o = rs + x * pxStep;
      if (ihdr.colorType === 0) { r = g = b = out[o]; }
      else if (ihdr.colorType === 2) { r = out[o]; g = out[o + s16]; b = out[o + 2 * s16]; }
      else if (ihdr.colorType === 4) { r = g = b = out[o]; a = out[o + s16]; }
      else if (ihdr.colorType === 6) { r = out[o]; g = out[o + s16]; b = out[o + 2 * s16]; a = out[o + 3 * s16]; }
      else { // palette
        const idx = out[o] * 3;
        r = plte[idx]; g = plte[idx + 1]; b = plte[idx + 2];
        if (trns && out[o] < trns.length) a = trns[out[o]];
      }
      const i4 = (y * W + x) * 4;
      rgba[i4] = r; rgba[i4 + 1] = g; rgba[i4 + 2] = b; rgba[i4 + 3] = a;
      luma[y * W + x] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
  }
  return { W, H, rgba, luma, info: { width: W, height: H, colorType: ihdr.colorType, bitDepth: bd, channels: ch } };
}

// 3x3 luma range per pixel (separable max/min), used to tell texture from flat sky.
function detailMap(luma, W, H) {
  const hmax = new Float32Array(W * H), hmin = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      const l = luma[row + (x > 0 ? x - 1 : 0)];
      const c = luma[row + x];
      const r = luma[row + (x + 1 < W ? x + 1 : W - 1)];
      let mx = l > c ? l : c; if (r > mx) mx = r;
      let mn = l < c ? l : c; if (r < mn) mn = r;
      hmax[row + x] = mx; hmin[row + x] = mn;
    }
  }
  const t = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const ym = (y > 0 ? y - 1 : 0) * W, yc = y * W, yp = (y + 1 < H ? y + 1 : H - 1) * W;
    for (let x = 0; x < W; x++) {
      const mx = Math.max(hmax[ym + x], hmax[yc + x], hmax[yp + x]);
      const mn = Math.min(hmin[ym + x], hmin[yc + x], hmin[yp + x]);
      t[yc + x] = mx - mn;
    }
  }
  return t;
}

const TEX_T = 10;     // 3x3 range above this = textured pixel
const EDGE_T = 18;    // |gradient| above this (gray levels) = strong edge
const STAIR_T = 14;   // |2nd difference| threshold for stair detection

// region metrics. opts.mask (Uint8Array W*H) collects halo flags so crop-auto can point
// at the worst ring/overshoot areas.
function metricsFor(img, region, opts) {
  const { W, H, rgba, luma, detail } = img;
  const mask = opts && opts.mask;
  const m = 3;
  const x0 = Math.max(m, region.x0), y0 = Math.max(m, region.y0);
  const x1 = Math.min(W - m, region.x1), y1 = Math.min(H - m, region.y1);
  const n = Math.max(1, (x1 - x0) * (y1 - y0));
  let lapS = 0, lapS2 = 0, tenS = 0;
  let hfLap = 0, hfGrad = 0, hfCnt = 0;
  let eqH = 0, eqV = 0, eqHt = 0, eqVt = 0, pairH = 0, pairV = 0, texH = 0, texV = 0;
  let stairH = 0, stairV = 0;
  let edgeCnt = 0;
  const edgeVals = [];
  let b2 = 0, b2c = 0;
  let haloB = 0, haloD = 0;

  for (let y = y0; y < y1; y++) {
    const row = y * W;
    for (let x = x0; x < x1; x++) {
      const i = row + x;
      const c = luma[i], l = luma[i - 1], r = luma[i + 1], u = luma[i - W], d = luma[i + W];
      const lap = 4 * c - l - r - u - d;
      lapS += lap; lapS2 += lap * lap;
      const gx = (r - l) * 0.5, gy = (d - u) * 0.5;
      const gm = Math.sqrt(gx * gx + gy * gy);
      tenS += gm;

      const p = i * 4, pr = p + 4, pd = p + W * 4;
      pairH++;
      if (rgba[p] === rgba[pr] && rgba[p + 1] === rgba[pr + 1] && rgba[p + 2] === rgba[pr + 2]) eqH++;
      pairV++;
      if (rgba[p] === rgba[pd] && rgba[p + 1] === rgba[pd + 1] && rgba[p + 2] === rgba[pd + 2]) eqV++;

      const tex = detail[i] > TEX_T;
      if (tex) {
        texH++; texV++;
        if (rgba[p] === rgba[pr] && rgba[p + 1] === rgba[pr + 1] && rgba[p + 2] === rgba[pr + 2]) eqHt++;
        if (rgba[p] === rgba[pd] && rgba[p + 1] === rgba[pd + 1] && rgba[p + 2] === rgba[pd + 2]) eqVt++;
        hfLap += Math.abs(lap); hfGrad += gm; hfCnt++;
      }

      // stair-step: the 2nd difference is large and repeats with the same sign at x-2 / y-2
      const dh = l + r - 2 * c;
      if (Math.abs(dh) > STAIR_T) {
        const dhm = luma[i - 3] + luma[i - 1] - 2 * luma[i - 2];
        if (Math.abs(dhm) > STAIR_T && dh * dhm > 0) stairH++;
      }
      const dv = u + d - 2 * c;
      if (Math.abs(dv) > STAIR_T) {
        // vertical 2nd difference two rows up: luma[y-3] - 2*luma[y-2] + luma[y-1]
        const dvm = luma[i - 3 * W] + luma[i - W] - 2 * luma[i - 2 * W];
        if (Math.abs(dvm) > STAIR_T && dv * dvm > 0) stairV++;
      }

      if (gm > EDGE_T) {
        let mn = 255, mx = 0;
        for (let yy = y - 1; yy <= y + 1; yy++) {
          const r2 = yy * W;
          for (let xx = x - 1; xx <= x + 1; xx++) {
            const v = luma[r2 + xx];
            if (v < mn) mn = v;
            if (v > mx) mx = v;
          }
        }
        edgeVals.push(mx - mn);
        edgeCnt++;
      }

      // sharpening halo: the pixel overshoots every value in the 5x5 ring (distance >=2),
      // i.e. a white/black rim next to a high-contrast edge produced by unsharp/RCAS.
      if (detail[i] > 30) {
        let rmax = -1e9, rmin = 1e9;
        for (let dy = -2; dy <= 2; dy++) {
          const rr = (y + dy) * W;
          for (let dx = -2; dx <= 2; dx++) {
            if (dx > -2 && dx < 2 && dy > -2 && dy < 2) continue;
            const v = luma[rr + x + dx];
            if (v > rmax) rmax = v;
            if (v < rmin) rmin = v;
          }
        }
        if (c - rmax > 5) { haloB++; if (mask) mask[i] |= 1; }
        if (rmin - c > 5) { haloD++; if (mask) mask[i] |= 2; }
      }
    }
  }
  // aligned 2x2 blocks
  for (let y = y0; y + 1 < y1; y += 2) {
    const row = y * W;
    for (let x = x0; x + 1 < x1; x += 2) {
      const i = row + x;
      const a = i * 4, b = (i + 1) * 4, c2 = (i + W) * 4, d2 = (i + W + 1) * 4;
      b2c++;
      if (rgba[a] === rgba[b] && rgba[a] === rgba[c2] && rgba[a] === rgba[d2] &&
          rgba[a + 1] === rgba[b + 1] && rgba[a + 1] === rgba[c2 + 1] && rgba[a + 1] === rgba[d2 + 1] &&
          rgba[a + 2] === rgba[b + 2] && rgba[a + 2] === rgba[c2 + 2] && rgba[a + 2] === rgba[d2 + 2]) b2++;
    }
  }
  edgeVals.sort((a, b) => a - b);
  const p95 = edgeVals.length ? edgeVals[Math.min(edgeVals.length - 1, Math.floor(0.95 * (edgeVals.length - 1)))] : 0;
  const mean = lapS / n;
  return {
    pixels: n,
    sharpnessLapVar: r2(lapS2 / n - mean * mean),
    sharpnessTenengrad: r2(tenS / n),
    pixelationAdjEqPct: r2((100 * (eqH + eqV)) / Math.max(1, pairH + pairV)),
    pixelationAdjEqHPct: r2((100 * eqH) / Math.max(1, pairH)),
    pixelationAdjEqVPct: r2((100 * eqV) / Math.max(1, pairV)),
    pixelationAdjEqTexPct: r2((100 * (eqHt + eqVt)) / Math.max(1, texH + texV)),
    pixelationBlock2x2Pct: r2((100 * b2) / Math.max(1, b2c)),
    aliasStairPct: r2((100 * (stairH + stairV)) / Math.max(1, 2 * n)),
    aliasHFRatio: r2(hfLap / Math.max(1e-6, hfGrad)),
    edgeFracPct: r2((100 * edgeCnt) / n),
    edgeContrastP95: r2(p95),
    haloBrightPct: r2((100 * haloB) / n),
    haloDarkPct: r2((100 * haloD) / n),
  };
}
const r2 = (v) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------- crops (evidence)
// Tiny PNG writer (filter 0, colour type 6) — only used to save zoomed crops of the
// screenshots so an agent/human can look at halos without loading a 2560 px image.
let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function encodePNG(rgba, W, H) {
  const stride = W * 4;
  const raw = Buffer.alloc((stride + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride), y * (stride + 1) + 1);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}
function writeCrop(img, cx, cy, cw, ch, zoom, outPath) {
  const Z = Math.max(1, Math.min(6, Math.round(zoom) || 1));
  const x0 = Math.max(0, Math.min(img.W - 1, Math.round(cx - cw / 2)));
  const y0 = Math.max(0, Math.min(img.H - 1, Math.round(cy - ch / 2)));
  const ow = Math.min(cw, img.W - x0), oh = Math.min(ch, img.H - y0);
  const W2 = ow * Z, H2 = oh * Z;
  const out = new Uint8Array(W2 * H2 * 4);
  for (let y = 0; y < H2; y++) {
    const sy = y0 + ((y / Z) | 0);
    for (let x = 0; x < W2; x++) {
      const sx = x0 + ((x / Z) | 0);
      const si = (sy * img.W + sx) * 4, di = (y * W2 + x) * 4;
      out[di] = img.rgba[si]; out[di + 1] = img.rgba[si + 1]; out[di + 2] = img.rgba[si + 2]; out[di + 3] = 255;
    }
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, encodePNG(out, W2, H2));
  return { file: outPath, x: x0, y: y0, w: ow, h: oh, zoom: Z, outW: W2, outH: H2 };
}
// rank 128px tiles by how many sharpening-halo pixels they contain
function topHaloTiles(mask, W, H, count, tile = 128, step = 64) {
  const tiles = [];
  for (let y = 0; y + tile <= H; y += step) {
    for (let x = 0; x + tile <= W; x += step) {
      let n = 0;
      for (let yy = y; yy < y + tile; yy++) {
        const row = yy * W;
        for (let xx = x; xx < x + tile; xx++) if (mask[row + xx]) n++;
      }
      if (n) tiles.push({ x, y, w: tile, h: tile, n, density: Math.round((n / (tile * tile)) * 1e4) / 100 });
    }
  }
  tiles.sort((a, b) => b.n - a.n);
  return tiles.slice(0, count);
}
function parseCropSpecs(arg) {
  if (!arg) return [];
  return arg.split(';').map((s) => s.trim()).filter(Boolean).map((s) => {
    const p = s.split(',').map(Number);
    return { x: p[0], y: p[1], w: p[2] || 192, h: p[3] || 192, zoom: p[4] || cropZoom };
  });
}

// ---------------------------------------------------------------- capture
// runtime facts recorded with every shot. Round 12 builds only had scale/buffer; the
// round-13 quality system adds outW/outH (output canvas), scenePx (internal HDR budget)
// and srcW/srcH (internal resolution) — all read from __cielo.stats(), so old builds
// simply drop the missing keys.
const RUNTIME_JS =
  'JSON.stringify({q:__cielo.quality(),scale:+__cielo.stats().scale.toFixed(3),' +
  'bw:document.getElementById("c").width,bh:document.getElementById("c").height,' +
  'build:__cielo.build,' +
  'outW:__cielo.stats().outW,outH:__cielo.stats().outH,outPx:__cielo.stats().outPx,' +
  'scenePx:__cielo.stats().scenePx,srcW:__cielo.stats().srcW,srcH:__cielo.stats().srcH,' +
  'dpr:__cielo.stats().dpr,outScale:__cielo.stats().outScale,' +
  'sharpen:(__cielo.tiers&&__cielo.tiers[__cielo.quality()]||{}).sharpen,' +
  'touch:!!__cielo.isTouch,ready:!!__cielo.ready})';

function shotUrl(mode, view) {
  const tier = mode.q && mode.q !== 'default' ? '&q=' + mode.q : '';
  return PAGE + '?touch=' + (mode.touch ? 1 : 0) + '&noui=1' + tier +
    '&freeze=' + FREEZE + '&tod=' + TOD + '&view=' + view;
}

// other scripts on this machine also drive Chrome, so never assume the base port is
// free — scan upward and hand shot.mjs a port nothing is listening on.
function portFree(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '127.0.0.1');
  });
}
async function pickPort(base) {
  for (let p = base; p < base + 80; p++) if (await portFree(p)) return p;
  return base;
}

function runShot(mode, view, outPng, waitMs, cdpPort) {
  const args = [
    'tools/shot.mjs', '--gpu=' + GPU, '--port=' + cdpPort,
    '--url=' + shotUrl(mode, view), '--w=' + mode.w, '--h=' + mode.h,
    '--dpr=' + mode.dpr,
  ];
  if (mode.mobile) args.push('--mobile');
  if (mode.touch) args.push('--touch');
  args.push('--do=wait:' + waitMs, '--do=eval:' + RUNTIME_JS, '--do=wait:400', '--do=shot:' + outPng);
  const t0 = Date.now();
  const r = spawnSync(process.execPath, args, { cwd: CIELO, encoding: 'utf8', timeout: 240000, maxBuffer: 64 * 1024 * 1024 });
  const text = (r.stdout || '') + '\n' + (r.stderr || '');
  const out = { ms: Date.now() - t0, stdout: text, runtime: null, warnings: [] };
  for (const line of text.split(/\r?\n/)) {
    const ev = line.match(/^eval → (.*)$/);
    if (ev) {
      let v = ev[1];
      try { v = JSON.parse(v); } catch { /* keep raw */ }
      if (typeof v === 'string') { try { v = JSON.parse(v); } catch { /* keep */ } }
      if (v && typeof v === 'object') out.runtime = v;
    }
    if (/^\[exception\]/.test(line)) out.warnings.push('page exception: ' + line.slice(0, 220));
    if (/\[eval error\]/.test(line)) out.warnings.push('eval error: ' + line.slice(0, 220));
    if (/^FAIL /.test(line)) out.warnings.push(line.slice(0, 220));
  }
  out.status = r.status;
  out.ok = r.status === 0 && fs.existsSync(outPng);
  return out;
}

// ---------------------------------------------------------------- main
const tagDir = path.join(OUT_ROOT, TAG);
fs.mkdirSync(tagDir, { recursive: true });
// a previous metrics.json is used to keep runtime/capture metadata when --reuse re-analyses
// PNGs that were shot earlier instead of taking new ones.
let prevReport = null;
try {
  const f = path.join(tagDir, 'metrics.json');
  if (fs.existsSync(f)) prevReport = JSON.parse(fs.readFileSync(f, 'utf8'));
} catch { /* ignore */ }

function buildFingerprint() {
  const f = path.join(ROOT, '04-output/CIELO.html');
  try {
    const st = fs.statSync(f);
    const buf = fs.readFileSync(f);
    return {
      file: '04-output/CIELO.html',
      bytes: buf.length,
      sha256: crypto.createHash('sha256').update(buf).digest('hex'),
      mtime: st.mtime.toISOString(),
    };
  } catch (e) { return { file: '04-output/CIELO.html', error: String(e.message || e) }; }
}

const report = {
  tool: 'quality-check.mjs',
  version: 1,
  tag: TAG,
  createdAt: new Date().toISOString(),
  page: '04-output/CIELO.html',
  build: buildFingerprint(),
  sitePort: SITE_PORT,
  chrome: { gpu: GPU, basePort: CDP_PORT },
  fixed: { freeze: FREEZE, tod: TOD, noui: 1, ui: 'hidden' },
  modes: {},
  shots: [],
  totals: {},
};

let shotIndex = 0;
let okShots = 0;
const wantCapture = !compareArg || tagExplicit;

if (wantCapture) for (const mode of selected) {
  const views = viewsOverride || mode.views;
  report.modes[mode.key] = {
    mobile: mode.mobile, touch: mode.touch, dpr: mode.dpr,
    w: mode.w, h: mode.h, q: (tierFor(mode.key) !== null ? (tierFor(mode.key) === 'default' ? 'default' : tierFor(mode.key)) : mode.q), views,
  };
  for (const view of views) {
    const tier = tierFor(mode.key);
    const effMode = tier !== null ? { ...mode, q: tier === 'default' ? '' : tier } : mode;
    const png = path.join(tagDir, view + '-' + mode.w + 'x' + mode.h + '.png');
    const rec = {
      mode: mode.key, view, w: mode.w, h: mode.h, dpr: mode.dpr,
      url: shotUrl(effMode, view), file: path.relative(ROOT, png).replace(/\\/g, '/'),
      image: null, runtime: null, metrics: null, warnings: [], captureMs: null,
    };
    const prevShot = prevReport ? prevReport.shots.find((s) => s.mode === mode.key && s.view === view) : null;
    if (prevShot && has('reuse') && fs.existsSync(png)) {
      rec.runtime = prevShot.runtime || null;
      rec.captureMs = prevShot.captureMs || null;
    }
    try {
      if (wantCapture && !(has('reuse') && fs.existsSync(png))) {
        const label = mode.key + ' view ' + view;
        const cdpPort = await pickPort(CDP_PORT + shotIndex);
        console.log('[shoot] ' + label + '  port ' + cdpPort + '  ' + shotUrl(effMode, view));
        const res = runShot(effMode, view, png, Number(opt('wait', mode.wait)), cdpPort);
        shotIndex++;
        if (effMode.q && res.runtime && res.runtime.q && res.runtime.q !== effMode.q) {
          res.warnings.push('quality tier mismatch: page reports q=' + res.runtime.q + ', expected ' + mode.q +
            ' (maybe attached to another task\'s Chrome on that port)');
          console.error('  ! ' + res.warnings[res.warnings.length - 1]);
        }
        rec.captureMs = res.ms;
        rec.runtime = res.runtime;
        rec.warnings.push(...res.warnings);
        if (!res.ok) {
          rec.error = 'shot.mjs failed (exit ' + res.status + '): ' + res.stdout.slice(-600);
          console.error('  ✗ ' + rec.error);
          report.shots.push(rec);
          continue;
        }
        console.log('  ✓ ' + (res.ms / 1000).toFixed(1) + 's  ' + path.relative(ROOT, png) +
          (res.runtime ? '  q=' + res.runtime.q + ' scale=' + res.runtime.scale : ''));
      }
      if (!fs.existsSync(png)) throw new Error('missing png ' + png);
      rec.bytes = fs.statSync(png).size;
      const t0 = Date.now();
      const img = decodePNG(fs.readFileSync(png));
      rec.image = { width: img.info.width, height: img.info.height, colorType: img.info.colorType, bitDepth: img.info.bitDepth };
      const detail = detailMap(img.luma, img.W, img.H);
      img.detail = detail;
      const cx0 = Math.round(img.W * 0.2), cx1 = Math.round(img.W * 0.8);
      const cy0 = Math.round(img.H * 0.2), cy1 = Math.round(img.H * 0.8);
      const haloMask = new Uint8Array(img.W * img.H);
      rec.metrics = {
        full: metricsFor(img, { x0: 0, y0: 0, x1: img.W, y1: img.H }, { mask: haloMask }),
        center: metricsFor(img, { x0: cx0, y0: cy0, x1: cx1, y1: cy1 }),
      };
      rec.analysisMs = Date.now() - t0;
      // ---- zoomed crops: explicit --crop specs and/or the N worst halo tiles
      rec.crops = [];
      const cropSpecs = parseCropSpecs(cropArg).map((s) => ({ ...s, auto: false }));
      if (cropAuto > 0) {
        const tiles = topHaloTiles(haloMask, img.W, img.H, cropAuto);
        rec.haloTiles = tiles;
        for (const t of tiles) cropSpecs.push({ x: t.x + t.w / 2, y: t.y + t.h / 2, w: 192, h: 192, zoom: cropZoom, auto: true, tile: t });
      }
      for (const sp of cropSpecs) {
        const name = (sp.auto ? 'halo' : 'crop') + '-' + mode.key + '-v' + view + '-' + rec.crops.length + '.png';
        const cp = path.join(tagDir, 'crops', name);
        const info = writeCrop(img, sp.x, sp.y, sp.w, sp.h, sp.zoom, cp);
        info.auto = !!sp.auto;
        if (sp.tile) info.tile = sp.tile;
        rec.crops.push(info);
        console.log('  crop → ' + path.relative(ROOT, cp).replace(/\\/g, '/') + '  ' + info.outW + 'x' + info.outH);
      }
      if (rec.runtime && rec.runtime.bw && rec.image) {
        rec.bufferScale = Math.round((rec.image.width / rec.runtime.bw) * 100) / 100;
      }
      okShots++;
      const f = rec.metrics.full;
      console.log('  pixels ' + rec.image.width + 'x' + rec.image.height +
        '  lapVar=' + f.sharpnessLapVar + '  adjEq=' + f.pixelationAdjEqPct + '%' +
        '  block2=' + f.pixelationBlock2x2Pct + '%  stair=' + f.aliasStairPct + '%' +
        '  edgeP95=' + f.edgeContrastP95);
      report.shots.push(rec);
    } catch (e) {
      rec.error = String(e && e.message ? e.message : e);
      console.error('  ✗ ' + rec.error);
      report.shots.push(rec);
    }
    fs.writeFileSync(path.join(tagDir, 'metrics.json'), JSON.stringify(report, null, 2));
  }
}

// totals: mean over the modes' shots (per mode / full frame and centre)
if (wantCapture) {
  for (const mode of selected) {
    const rows = report.shots.filter((s) => s.mode === mode.key && s.metrics);
    if (!rows.length) continue;
    const agg = { shots: rows.length, full: {}, center: {} };
    const keys = Object.keys(rows[0].metrics.full);
    for (const region of ['full', 'center']) {
      for (const k of keys) {
        let sum = 0, cnt = 0;
        for (const s of rows) { const v = s.metrics[region][k]; if (typeof v === 'number' && Number.isFinite(v)) { sum += v; cnt++; } }
        if (cnt) agg[region][k] = r2(sum / cnt);
      }
    }
    report.totals[mode.key] = agg;
  }
  fs.writeFileSync(path.join(tagDir, 'metrics.json'), JSON.stringify(report, null, 2));
  console.log('\nmetrics → ' + path.relative(ROOT, path.join(tagDir, 'metrics.json')) + '  (' + okShots + '/' + report.shots.length + ' shots)');
}

// ---------------------------------------------------------------- compare
const METRIC_DEFS = [
  ['sharpnessLapVar', '锐度 Laplacian方差', 'up'],
  ['sharpnessTenengrad', '锐度 梯度均值', 'up'],
  ['pixelationAdjEqPct', '像素重复 相邻等值%', 'down'],
  ['pixelationAdjEqTexPct', '像素重复 纹理区%', 'down'],
  ['pixelationBlock2x2Pct', '2x2同色块%', 'down'],
  ['aliasStairPct', '阶梯锯齿%', 'down'],
  ['aliasHFRatio', '高频/梯度比', 'down'],
  ['edgeFracPct', '强边缘像素%', 'up'],
  ['edgeContrastP95', '边缘对比p95', 'up'],
  ['haloBrightPct', '白边过冲%', 'down'],
  ['haloDarkPct', '黑边过冲%', 'down'],
];

function loadTag(t) {
  const f = path.join(OUT_ROOT, t, 'metrics.json');
  if (!fs.existsSync(f)) throw new Error('no metrics for tag "' + t + '" at ' + f);
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

function fmt(v, k) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  return v.toFixed(k === 'sharpnessLapVar' ? 1 : 2);
}
function pct(oldV, newV) {
  if (typeof oldV !== 'number' || typeof newV !== 'number' || oldV === 0) return null;
  return ((newV - oldV) / Math.abs(oldV)) * 100;
}
const signed = (p) => (p === null ? '—' : (p >= 0 ? '+' : '') + p.toFixed(1) + '%');
// terminal display width (CJK/full-width chars take two cells)
const dispW = (s) => { let w = 0; for (const ch of s) w += ch.codePointAt(0) > 0x2e7f ? 2 : 1; return w; };
const padTo = (s, n) => s + ' '.repeat(Math.max(1, n - dispW(s)));

function meanOf(rows, region, k) {
  let sum = 0, cnt = 0;
  for (const s of rows) {
    const v = s.metrics && s.metrics[region][k];
    if (typeof v === 'number' && Number.isFinite(v)) { sum += v; cnt++; }
  }
  return cnt ? sum / cnt : null;
}
function commonViews(reports, mode) {
  const sets = reports.map((o) => new Set(o.r.shots.filter((s) => s.mode === mode && s.metrics).map((s) => s.view)));
  return [...sets[0]].filter((v) => sets.every((s) => s.has(v))).sort((a, b) => a - b);
}

function printCompare(tags) {
  const reports = tags.map((t) => ({ tag: t, r: loadTag(t) }));
  const base = reports[0];
  const others = reports.slice(1);
  console.log('\n================ quality compare ================');
  console.log('tags: ' + tags.join(' → ') + '    (Δ% = 后/前-1；锐度/边缘对比 ↑ 好，像素重复/锯齿/高频比 ↓ 好)');
  const modes = [...new Set(base.r.shots.map((s) => s.mode))];
  for (const mode of modes) {
    const baseRows = base.r.shots.filter((s) => s.mode === mode && s.metrics);
    if (!baseRows.length) continue;
    const cfg = base.r.modes[mode];
    console.log('\n--- ' + mode + (cfg ? ' (' + cfg.w + 'x' + cfg.h + ' CSS @' + cfg.dpr + 'x, q=' + cfg.q + ')' : '') + ' ---');
    for (const b of baseRows) {
      const cells = others.map((o) => ({ tag: o.tag, row: o.r.shots.find((s) => s.mode === mode && s.view === b.view && s.metrics) }));
      const rtOf = (row) => (row && row.runtime
        ? 'q=' + row.runtime.q + ' scale=' + row.runtime.scale +
          (row.runtime.scenePx
            ? ' scene ' + (row.runtime.scenePx / 1e6).toFixed(2) + 'MP(' + row.runtime.srcW + 'x' + row.runtime.srcH + ')'
            : '') +
          ' out ' + (row.runtime.outW || row.runtime.bw) + 'x' + (row.runtime.outH || row.runtime.bh) +
          (row.runtime.sharpen != null ? ' sharpen=' + row.runtime.sharpen : '')
        : 'runtime n/a');
      console.log('view ' + b.view + '   ' + base.tag + ': ' + rtOf(b) +
        cells.map((c) => ' | ' + c.tag + ': ' + rtOf(c.row)).join('') +
        (b.image ? '   → 截图 ' + b.image.width + 'x' + b.image.height : ''));
      console.log('  ' + padTo('metric', 26) + padTo('全图: ' + base.tag + ' → ' + tags.slice(1).join('/') + ' (Δ%)', 46) + '中央60%: 同上');
      for (const [k, label] of METRIC_DEFS) {
        let line = '  ' + padTo(label, 26);
        for (const region of ['full', 'center']) {
          const ov = b.metrics[region][k];
          const parts = cells.map(({ row }) => {
            if (!row) return '—';
            const nv = row.metrics[region][k];
            const p = pct(ov, nv);
            return fmt(nv, k) + (p === null ? '' : ' (' + signed(p) + ')');
          });
          line += padTo(fmt(ov, k) + ' → ' + parts.join(' / '), region === 'full' ? 46 : 38);
        }
        console.log(line);
      }
    }
    // ---- mode average, computed only on views common to every compared tag
    const common = commonViews(reports, mode);
    if (!common.length) { console.log('\n  · 无共同视图（各 tag 采的视图不同），跳过平均'); continue; }
    const subset = (o) => o.r.shots.filter((s) => s.mode === mode && s.metrics && common.includes(s.view));
    console.log('\n  · 平均（' + common.length + ' 个共同视图: ' + common.join(',') + '）');
    for (const [k, label] of METRIC_DEFS) {
      let line = '    ' + padTo(label, 26);
      for (const region of ['full', 'center']) {
        const ov = meanOf(subset(base), region, k);
        const parts = others.map((o) => {
          const nv = meanOf(subset(o), region, k);
          const p = pct(ov, nv);
          return fmt(nv, k) + (p === null ? '' : ' (' + signed(p) + ')');
        });
        line += padTo(fmt(ov, k) + ' → ' + parts.join(' / '), region === 'full' ? 46 : 38);
      }
      console.log(line);
    }
  }
  // ---- headline verdict on the common-view mode averages
  console.log('\n--- 判读（全图，共同视图平均）---');
  for (const mode of modes) {
    const common = commonViews(reports, mode);
    if (!common.length) continue;
    const subset = (o) => o.r.shots.filter((s) => s.mode === mode && s.metrics && common.includes(s.view));
    for (const o of others) {
      const g = (k) => signed(pct(meanOf(subset(base), 'full', k), meanOf(subset(o), 'full', k)));
      const cm = (k) => signed(pct(meanOf(subset(base), 'center', k), meanOf(subset(o), 'center', k)));
      console.log(mode + ' (' + base.tag + ' → ' + o.tag + '):');
      console.log('  像素重复 相邻等值%  全图 ' + g('pixelationAdjEqPct') + '   中央 ' + cm('pixelationAdjEqPct'));
      console.log('  2x2 同色块%        全图 ' + g('pixelationBlock2x2Pct') + '   中央 ' + cm('pixelationBlock2x2Pct'));
      console.log('  锐度 Laplacian方差  全图 ' + g('sharpnessLapVar') + '   中央 ' + cm('sharpnessLapVar'));
      console.log('  锐度 梯度均值        全图 ' + g('sharpnessTenengrad') + '   中央 ' + cm('sharpnessTenengrad'));
      console.log('  边缘对比 p95        全图 ' + g('edgeContrastP95') + '   中央 ' + cm('edgeContrastP95'));
      console.log('  阶梯锯齿% / 高频比   全图 ' + g('aliasStairPct') + ' / ' + g('aliasHFRatio') + '   中央 ' + cm('aliasStairPct') + ' / ' + cm('aliasHFRatio'));
    }
  }
  console.log('\n判定参考（手机 dpr=2 截图是设备像素图，canvas 缓冲区按 CSS 宽度×scale 渲染后再被放大）：');
  console.log('  · 只提高画质档(scale 0.6→1.0)：2x2 同色块、纹理区像素重复会大幅下降，但 LapVar 基本不动');
  console.log('    （缓冲区仍是 1280 宽，被 2× 放大到 2560），所以「像素重复降」不等于「已经渲染到设备像素」。');
  console.log('  · 真正精细（缓冲区≈设备像素 2560 宽）：像素重复相邻等值降到 ~10%、2x2 同色块 <1%、');
  console.log('    LapVar 显著上升(数百级)、边缘对比 p95 提升。三者同时成立才算画面变精细。');
  console.log('  · 只锐度涨而像素重复不降：多半是加了锐化/降噪，不是真分辨率。');
}

if (compareArg) {
  const tags = compareArg.split(',').map((s) => s.trim()).filter(Boolean);
  if (tags.length < 2) {
    console.error('--compare needs at least two tags, e.g. --compare=baseline,new');
    process.exit(2);
  }
  try { printCompare(tags); } catch (e) { console.error('compare failed: ' + e.message); process.exitCode = 1; }
}

const failed = report.shots.filter((s) => !s.metrics).length;
if (report.shots.length && failed === report.shots.length) {
  console.error('all shots failed');
  process.exit(1);
}
if (failed) console.error(failed + ' shot(s) failed — see metrics.json for details');
