// rail-path.js — one source of truth for the elevated railway centreline.
//
// The viaduct / train / city reservation all need the SAME curve. Before round 7
// the city reservation tested the control polygon (L.railLoop) while the train
// actually ran on the Catmull-Rom curve through those points, so the curve could
// bow into a building the polygon test thought was clear. Everything now samples
// the real curve from here.
import { catmullPts } from './lib3d.js';
import { L } from './layout.js';

const N = 1500;                 // curve samples (same count as rail.js makeLoop)
const COARSE = 8;               // pre-filter stride

let cachePts = null;
let cacheKey = '';
let coarse = null;

export function railSamples(ctrl = L.railLoop) {
  const key = ctrl.map((p) => p[0].toFixed(2) + ',' + p[2].toFixed(2)).join(';');
  if (cachePts && cacheKey === key) return cachePts;
  cacheKey = key;
  cachePts = catmullPts(ctrl, N, true);
  coarse = [];
  for (let i = 0; i < cachePts.length; i += COARSE) coarse.push(cachePts[i]);
  return cachePts;
}

function segDist2(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  let t = ((px - ax) * dx + (pz - az) * dz) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + dx * t, qz = az + dz * t;
  return (px - qx) * (px - qx) + (pz - qz) * (pz - qz);
}

function polyDist2(x, z, P) {
  let best = 1e18;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    const d = segDist2(x, z, a[0], a[2], b[0], b[2]);
    if (d < best) best = d;
  }
  return best;
}

// squared distance from (x,z) to the true rail centreline
export function railDist2(x, z, ctrl = L.railLoop) {
  const P = railSamples(ctrl);
  const d0 = polyDist2(x, z, coarse);
  // the coarse polyline never strays more than ~1 m from the true curve, and every
  // caller only cares below ~25 m, so anything farther can answer with the prefilter
  if (d0 > 35 * 35) return d0;
  return polyDist2(x, z, P);
}


// distance from an axis/rotated box (footprint) to the true rail centreline.
// Used by city.js so no building is placed inside the viaduct envelope.
export function railRectDist(x, z, w, d, rot) {
  railSamples();
  const c = Math.cos(rot), s = Math.sin(rot);
  const hw = w / 2, hd = d / 2;
  let best = 1e18;
  for (let i = 0; i < coarse.length; i++) {
    const p = coarse[i];
    const dx = p[0] - x, dz = p[2] - z;
    const lx = c * dx - s * dz;
    const lz = s * dx + c * dz;
    const ox = Math.abs(lx) - hw, oz = Math.abs(lz) - hd;
    const dd = (ox <= 0 && oz <= 0) ? 0 : Math.hypot(Math.max(ox, 0), Math.max(oz, 0));
    if (dd < best) best = dd;
  }
  return best;
}
// pier centres along the loop (rail.js spaces them every 26 m of arc length)
export function railPiers(ctrl = L.railLoop, step = 26) {
  const loop = railSamples(ctrl);
  const out = [];
  let s = 0, acc = 0;
  let last = loop[0];
  for (let i = 1; i <= loop.length; i++) {
    const p = loop[i % loop.length];
    s += Math.hypot(p[0] - last[0], p[2] - last[2]);
    last = p;
    if (s >= acc + step) {
      acc = s;
      out.push([p[0], p[2]]);
    }
  }
  return out;
}
