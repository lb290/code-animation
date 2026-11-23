// Geometry + contract checks for the palace rotunda salon (no GL / no browser).
//   node tools/palace-salon-check.mjs
// Verifies: triangle budget, balanced matrix stack, finite vertices / colours /
// materials, the hall envelope (r<=14.7 about (0,144)), the protected dome-view
// cylinder (r<3.5, y 32..46), the apse stained-glass plane, the clerestory drum,
// the light/billboard contract, oriented-box furniture footprints, and determinism.
import { mulberry32 } from '../src/math.js';
import { B } from '../src/geo.js';
import { buildPalaceSalon, FOOTPRINTS, SALON_TRI } from '../src/palace-salon.js';
import { PAL } from '../src/palace-plan.js';

const CX = PAL.hall.cx, CZ = PAL.hall.cz;
const FY = PAL.hall.floorY;
const MAX_R = 14.98;
const DEG = Math.PI / 180;
const COL_ANGLES = [];
for (let i = 0; i < 12; i++) COL_ANGLES.push(-90 + 15 + i * 30);

function fakeCtx() {
  return { points: [], lanterns: [], dyn: [], bbDyn: [], props: {}, triLog: {} };
}

// 2D oriented-box / oriented-box overlap (SAT). Boxes are {x,z,hw,hd,yaw}.
function obbOverlap(a, c, pad = 0) {
  const dx = c.x - a.x, dz = c.z - a.z;
  const axes = [a.yaw, a.yaw + Math.PI / 2, c.yaw, c.yaw + Math.PI / 2];
  for (const th of axes) {
    const ux = Math.cos(th), uz = Math.sin(th);
    const pa = Math.abs((a.hw - pad) * Math.cos(th - a.yaw)) + Math.abs((a.hd - pad) * Math.sin(th - a.yaw));
    const pc = Math.abs((c.hw - pad) * Math.cos(th - c.yaw)) + Math.abs((c.hd - pad) * Math.sin(th - c.yaw));
    if (Math.abs(dx * ux + dz * uz) > pa + pc) return false;
  }
  return true;
}

function stats(b) {
  const v = b.v;
  let nan = 0, far = 0, badMat = 0, maxR = 0, maxRPos = null;
  let ymin = 1e9, ymax = -1e9, yminPos = null;
  let centerBlock = 0, centerWorst = null;
  let drumBlock = 0, glassBlock = 0, glassWorst = null;
  let apseYMax = -1e9, apseWorst = null;
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < v.length; i += 11) {
    const x = v[i], y = v[i + 1], z = v[i + 2];
    if (![x, y, z].every(Number.isFinite)) { nan++; continue; }
    for (let k = 0; k < 3; k++) {
      const q = v[i + k];
      if (!Number.isFinite(q)) nan++;
      mn[k] = Math.min(mn[k], q);
      mx[k] = Math.max(mx[k], q);
    }
    if (Math.abs(x) > 3000 || Math.abs(y) > 3000 || Math.abs(z) > 3000) far++;
    const r = Math.hypot(x - CX, z - CZ);
    if (y < ymin) { ymin = y; yminPos = [x, y, z].map((q) => +q.toFixed(2)); }
    ymax = Math.max(ymax, y);
    // the rotunda envelope does not apply to the apse recess (z>158.6) or the tunnel (z<130.2)
    const inApse = z > 157.3 && Math.abs(x) <= 5.75;   // apse recess (the shell cuts the wall here)
    const inTunnel = z < 130.2;
    if (!inApse && !inTunnel && r > maxR) { maxR = r; maxRPos = [x, y, z].map((q) => +q.toFixed(2)); }
    // protected dome-view cylinder: the composition of view 16
    if (r < 3.5 && y > 32 && y < 46) {
      centerBlock++;
      if (!centerWorst) centerWorst = [x, y, z].map((q) => +q.toFixed(2));
    }
    // clerestory drum band (52.4..60) must stay on the wall
    if (y > 52.0 && y < 60.6 && r > 13.0) drumBlock++;
    // apse stained glass: the screen plane sits at z=164.36
    if (z >= 163.85 && Math.abs(x) <= 4.8 && y > 33.0 && y < 47.5) {
      glassBlock++;
      if (!glassWorst) glassWorst = [x, y, z].map((q) => +q.toFixed(2));
    }
    if (inApse && y > apseYMax) { apseYMax = y; apseWorst = [x, y, z].map((q) => +q.toFixed(2)); }
    const c = [v[i + 6], v[i + 7], v[i + 8]];
    if (!c.every(Number.isFinite)) nan++;
    const e = v[i + 9], g = v[i + 10];
    if (!Number.isFinite(e) || !Number.isFinite(g) || e < 0 || e > 1.2 || g < 0 || g > 1) badMat++;
  }
  return {
    tris: b.i.length / 3, verts: v.length / 11, nan, far, badMat, maxR, maxRPos,
    ymin, ymax, yminPos, mn, mx, centerBlock, centerWorst, drumBlock, glassBlock, glassWorst,
    apseYMax, apseWorst,
    stack: b.stack.length, bad: b.bad || 0, badColor: b.badColor || 0, badNormal: b.badNormal || 0,
  };
}

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

// ---------------------------------------------------------------- full build
const ctx = fakeCtx();
const b = new B();
buildPalaceSalon(b, ctx, mulberry32(20261121));
const s = stats(b);
const fps = FOOTPRINTS.slice();
const tri = JSON.parse(JSON.stringify(SALON_TRI));

// 1. budget + non-empty
ok(s.tris > 0, 'no triangles');
ok(s.tris >= 50000, 'under the 50k triangle budget: ' + s.tris);
ok(s.tris <= 130000, 'over the 130k triangle budget: ' + s.tris);
// 2. matrix stack balanced
ok(s.stack === 1, 'matrix stack depth ' + s.stack + ' (expected 1)');
// 3. finite vertices / colours / materials
ok(s.nan === 0, 'non-finite vertices/colours: ' + s.nan);
ok(s.bad === 0, 'bad (non-finite) verts: ' + s.bad);
ok(s.badColor === 0, 'bad colours (material array in a colour slot?): ' + s.badColor);
ok(s.badMat === 0, 'bad material pairs: ' + s.badMat);
ok(s.far === 0, 'far vertices: ' + s.far);
ok(s.badNormal < 30, 'degenerate normals: ' + s.badNormal);
// 4. envelope
ok(s.maxR <= MAX_R, 'hall envelope: max horizontal radius ' + s.maxR.toFixed(3) + ' > ' + MAX_R +
  ' at ' + JSON.stringify(s.maxRPos));
ok(s.ymin >= FY - 0.05, 'geometry below the floor: ymin=' + s.ymin.toFixed(3));
ok(s.ymax <= FY + 46.0, 'geometry too tall: ymax=' + s.ymax.toFixed(3));
// 5. the protected dome-view cylinder (view 16)
ok(s.centerBlock === 0, 'protected dome-view cylinder (r<3.5, y 32..46) is not empty: ' + s.centerBlock +
  ' verts, worst ' + JSON.stringify(s.centerWorst));
// 6. apse stained glass: never covered, never overshot
ok(s.glassBlock === 0, 'apse stained glass blocked/intersected: ' + s.glassBlock + ' verts, worst ' + JSON.stringify(s.glassWorst));
ok(s.apseYMax <= FY + 6.4, 'apse furnishing reaches y=' + s.apseYMax.toFixed(2) +
  ' (must stay below ' + (FY + 6.4).toFixed(2) + ' so the window stays readable), at ' + JSON.stringify(s.apseWorst));
// 7. clerestory drum stays clear
ok(s.drumBlock === 0, 'clerestory drum band blocked: ' + s.drumBlock + ' verts');
// 8. every section contributed geometry
for (const k of ['carpet', 'throne', 'seating', 'piers', 'hangings', 'paintings', 'chandeliers', 'entrance']) {
  ok((tri[k] || 0) > 100, 'section ' + k + ' is empty (' + (tri[k] || 0) + ' tris)');
}
// 9. lighting contract
ok(ctx.points.length <= 10, 'too many point lights: ' + ctx.points.length);
ok(ctx.points.length >= 6, 'too few point lights: ' + ctx.points.length);
ok(ctx.lanterns.length <= 26, 'too many billboard halos: ' + ctx.lanterns.length);
for (const p of ctx.points) {
  const r = Math.hypot(p.p[0] - CX, p.p[2] - CZ);
  ok(p.p.every(Number.isFinite) && p.col.every(Number.isFinite), 'bad point light ' + JSON.stringify(p));
  ok(r <= 15.6 && p.p[1] > FY && p.p[1] <= FY + 20, 'point light outside the hall: ' + JSON.stringify(p.p));
  ok(p.range > 0 && p.int > 0, 'point light with no range/intensity');
}
for (const L of ctx.lanterns) {
  const r = Math.hypot(L.p[0] - CX, L.p[2] - CZ);
  ok(L.p.every(Number.isFinite) && L.col.every(Number.isFinite), 'bad lantern ' + JSON.stringify(L));
  ok(r <= 15.6 && L.p[1] > FY && L.p[1] <= FY + 25, 'lantern outside the hall: ' + JSON.stringify(L.p));
}
// 10. furniture footprints: no interpenetration, clear of the column plinths
const COL = COL_ANGLES.map((d) => {
  const a = d * DEG;
  return { n: 'column ' + d, x: CX + Math.cos(a) * PAL.hall.colR, z: CZ + Math.sin(a) * PAL.hall.colR,
    hw: 1.05, hd: 1.05, yaw: a + Math.PI / 2, y0: FY, y1: FY + 0.62 };
});
let minGap = 99;
for (let i = 0; i < fps.length; i++) {
  const a = fps[i];
  for (let j = i + 1; j < fps.length; j++) {
    const c = fps[j];
    if (a.y1 < c.y0 || c.y1 < a.y0) continue;
    const d = Math.hypot(a.x - c.x, a.z - c.z);
    minGap = Math.min(minGap, d - (Math.hypot(a.hw, a.hd) + Math.hypot(c.hw, c.hd)));
    ok(!obbOverlap(a, c, 0.04), 'furniture overlap: ' + a.n + ' vs ' + c.n +
      ' at (' + a.x.toFixed(1) + ',' + a.z.toFixed(1) + ') / (' + c.x.toFixed(1) + ',' + c.z.toFixed(1) + ')');
  }
  for (const col of COL) {
    if (a.y0 > col.y1) continue;      // the console/mirror sits above the plinth
    ok(!obbOverlap(a, col, 0.04), 'furniture inside a column plinth: ' + a.n +
      ' at (' + a.x.toFixed(1) + ',' + a.z.toFixed(1) + ') vs ' + col.n);
  }
}
// 11. determinism (same seed twice, including the lights and the footprints)
const ctx2 = fakeCtx();
const b2 = new B();
buildPalaceSalon(b2, ctx2, mulberry32(20261121));
const s2 = stats(b2);
ok(s2.tris === s.tris, 'non-deterministic triangle count: ' + s.tris + ' vs ' + s2.tris);
ok(s2.mx[0] === s.mx[0] && s2.mx[2] === s.mx[2] && s2.ymax === s.ymax, 'non-deterministic bounds');
ok(JSON.stringify(ctx2.points) === JSON.stringify(ctx.points), 'non-deterministic point lights');
ok(JSON.stringify(ctx2.lanterns) === JSON.stringify(ctx.lanterns), 'non-deterministic lanterns');
ok(JSON.stringify(FOOTPRINTS) === JSON.stringify(fps), 'non-deterministic footprints');
// 12. a different world seed must not change the module at all (it uses its own local rng)
const b3 = new B();
buildPalaceSalon(b3, fakeCtx(), mulberry32(7));
const s3 = stats(b3);
ok(s3.tris === s.tris, 'the module rng leaks the world seed: ' + s.tris + ' vs ' + s3.tris);
ok(s3.nan === 0 && s3.stack === 1 && s3.badColor === 0, 'second-seed build invalid');

// ---------------------------------------------------------------- report
const report = {
  tris: s.tris, verts: s.verts,
  bbox: { min: s.mn.map((x) => +x.toFixed(3)), max: s.mx.map((x) => +x.toFixed(3)) },
  sections: tri,
  envelope: { maxR: +s.maxR.toFixed(3), maxRAt: s.maxRPos, ymin: +s.ymin.toFixed(3), yminAt: s.yminPos, ymax: +s.ymax.toFixed(3), limit: MAX_R },
  protectedCentre: { verts: s.centerBlock, rLimit: 3.5 },
  apse: { glassVerts: s.glassBlock, furnishingYMax: +s.apseYMax.toFixed(2), worst: s.apseWorst },
  drum: { blocked: s.drumBlock },
  stack: s.stack, bad: s.bad, badColor: s.badColor, badNormal: s.badNormal, farVerts: s.far,
  footprints: fps.length,
  points: ctx.points.length, lanterns: ctx.lanterns.length,
  deterministic: s2.tris === s.tris,
};
console.log(JSON.stringify(report, null, 2));
if (fails.length) { console.log('FAIL\n - ' + fails.join('\n - ')); process.exit(1); }
console.log('PASS  palace-salon: ' + s.tris + ' tris, maxR ' + s.maxR.toFixed(2) +
  ', y ' + s.ymin.toFixed(2) + '..' + s.ymax.toFixed(2) +
  ', centre clear, glass clear, ' + ctx.points.length + ' lights, ' +
  ctx.lanterns.length + ' halos, deterministic');
