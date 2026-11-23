// Geometry-only checks for the palace rotunda interior (no GL / no browser).
//   node tools/palace-hall-check.mjs
// Verifies: balanced matrix stack, finite vertices, legal colours and materials,
// the hall envelope (r<=15.25 about (0,144), y 30..77.5), the open oculus, the
// floor inlay radius, the light/billboard contract, the triangle budget and
// determinism for the fixed world seed.
import { mulberry32 } from '../src/math.js';
import { B } from '../src/geo.js';
import { buildPalaceHall } from '../src/palace-hall.js';
import { PAL } from '../src/palace-plan.js';

const CX = PAL.hall.cx, CZ = PAL.hall.cz;
const FY = PAL.hall.floorY;
const OC = [CX, PAL.hall.oculusY, CZ];
const MAX_R = 15.25;

function fakeCtx() {
  return { points: [], lanterns: [], dyn: [], bbDyn: [], props: {}, triLog: {} };
}

// The apse bay behind the rotunda is the shell's rear extrusion: the contract's
// stained-glass window lives there, outside the r<=15.25 rotunda envelope.
const APSE = { zMin: PAL.rearWindow.z + 4.2, halfW: 5.6 };
const inApse = (x, z) => z >= APSE.zMin && Math.abs(x) <= APSE.halfW;

function stats(b) {
  const v = b.v;
  let nan = 0, far = 0, badMat = 0, badColor = 0, maxR = 0, maxRi = -1;
  let apseVerts = 0, apseMaxR = 0;
  let ymin = 1e9, ymax = -1e9;
  let floorMaxR = 0, stepMaxR = 0, oculusMin = 1e9;
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < v.length; i += 11) {
    const x = v[i], y = v[i + 1], z = v[i + 2];
    for (let k = 0; k < 3; k++) {
      const q = v[i + k];
      if (!Number.isFinite(q)) nan++;
      mn[k] = Math.min(mn[k], q);
      mx[k] = Math.max(mx[k], q);
    }
    if (Math.abs(x) > 3000 || Math.abs(y) > 3000 || Math.abs(z) > 3000) far++;
    const dx = x - CX, dz = z - CZ;
    const r = Math.hypot(dx, dz);
    if (inApse(x, z)) { apseVerts++; apseMaxR = Math.max(apseMaxR, r); }
    else if (r > maxR) { maxR = r; maxRi = i / 11; }
    ymin = Math.min(ymin, y);
    ymax = Math.max(ymax, y);
    if (y > FY + 0.001 && y < FY + 0.09) floorMaxR = Math.max(floorMaxR, r);
    if (y >= FY + 0.09 && y < FY + 0.16) stepMaxR = Math.max(stepMaxR, r);
    if (y > 69) {
      const d = Math.hypot(x - OC[0], y - OC[1], z - OC[2]);
      if (d < oculusMin) oculusMin = d;
    }
    const c = [v[i + 6], v[i + 7], v[i + 8]];
    if (!c.every(Number.isFinite)) badColor++;
    else {
      // a material array passed as a colour shows up as a 2-element / tiny tuple
      // in the vertex buffer; the builder repairs those, so check the repair count
    }
    const e = v[i + 9], g = v[i + 10];
    if (!Number.isFinite(e) || !Number.isFinite(g) || e < 0 || e > 1.2 || g < 0 || g > 1) badMat++;
  }
  return {
    tris: b.i.length / 3, verts: v.length / 11, nan, far, badMat, maxR, maxRi,
    ymin, ymax, floorMaxR, stepMaxR, oculusMin, mn, mx, apseVerts, apseMaxR,
    stack: b.stack.length, bad: b.bad || 0, badColor: b.badColor || 0, badNormal: b.badNormal || 0,
  };
}

const fails = [];
const warns = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

// ---------------------------------------------------------------- full build
const ctx = fakeCtx();
const b = new B();
buildPalaceHall(b, ctx, mulberry32(20261121));
const s = stats(b);

// 1. budget + non-empty
ok(s.tris > 0, 'no triangles');
ok(s.tris >= 20000, 'under the 20k triangle budget: ' + s.tris);
ok(s.tris <= 65000, 'over the 65k triangle budget: ' + s.tris);
// 2. matrix stack balanced
ok(s.stack === 1, 'matrix stack depth ' + s.stack + ' (expected 1)');
// 3. finite vertices / colours / materials
ok(s.nan === 0, 'non-finite vertices: ' + s.nan);
ok(s.bad === 0, 'bad (non-finite) verts: ' + s.bad);
ok(s.badColor === 0, 'bad colours: ' + s.badColor);
ok(s.badMat === 0, 'bad material pairs: ' + s.badMat);
ok(s.far === 0, 'far vertices: ' + s.far);
ok(s.badNormal < 40, 'degenerate normals: ' + s.badNormal);
// 4. envelope
ok(s.maxR <= MAX_R, 'hall envelope: max horizontal radius ' + s.maxR.toFixed(3) + ' > ' + MAX_R);
ok(s.apseVerts > 0 && s.apseMaxR <= 21.5, 'apse window geometry missing / too far out: verts ' +
  s.apseVerts + ' maxR ' + s.apseMaxR.toFixed(2));
ok(s.ymin >= FY - 0.02, 'geometry below the floor: ymin=' + s.ymin.toFixed(3));
ok(s.ymax <= 77.5, 'geometry above y=77.5: ymax=' + s.ymax.toFixed(3));
// 5. open oculus: nothing inside the 5 m ball above y=69
ok(s.oculusMin > 5.0, 'oculus blocked: nearest vertex ' + s.oculusMin.toFixed(3) + ' m from the oculus centre');
// 6. floor inlay stays inside r=14.7
ok(s.floorMaxR <= 14.72, 'floor inlay/paving exceeds r=14.7: ' + s.floorMaxR.toFixed(3));
ok(s.stepMaxR <= 15.0, 'perimeter step exceeds the wall: ' + s.stepMaxR.toFixed(3));
// 7. lighting contract
ok(ctx.points.length <= 10, 'too many point lights: ' + ctx.points.length);
ok(ctx.lanterns.length <= 12, 'too many billboard halos: ' + ctx.lanterns.length);
ok(ctx.points.length >= 6, 'too few point lights: ' + ctx.points.length);
for (const p of ctx.points) {
  const r = Math.hypot(p.p[0] - CX, p.p[2] - CZ);
  ok(p.p.every(Number.isFinite) && p.col.every(Number.isFinite), 'bad point light ' + JSON.stringify(p));
  ok(r <= 15 && p.p[1] >= FY && p.p[1] <= 77, 'point light outside the hall: ' + JSON.stringify(p.p));
  ok(p.range > 0 && p.int > 0, 'point light with no range/intensity');
}
for (const L of ctx.lanterns) {
  const r = Math.hypot(L.p[0] - CX, L.p[2] - CZ);
  ok(L.p.every(Number.isFinite) && L.col.every(Number.isFinite), 'bad lantern ' + JSON.stringify(L));
  ok(r <= 15 && L.p[1] >= FY && L.p[1] <= 77.5, 'lantern outside the hall: ' + JSON.stringify(L.p));
}
// 8. determinism (same seed twice, including the lights)
const ctx2 = fakeCtx();
const b2 = new B();
buildPalaceHall(b2, ctx2, mulberry32(20261121));
const s2 = stats(b2);
ok(s2.tris === s.tris, 'non-deterministic triangle count: ' + s.tris + ' vs ' + s2.tris);
ok(s2.mx[0] === s.mx[0] && s2.ymax === s.ymax && s2.maxR === s.maxR, 'non-deterministic bounds');
ok(JSON.stringify(ctx2.points) === JSON.stringify(ctx.points), 'non-deterministic point lights');
ok(JSON.stringify(ctx2.lanterns) === JSON.stringify(ctx.lanterns), 'non-deterministic lanterns');
// 9. a different seed must still produce valid geometry (no Math.random leakage)
const b3 = new B();
buildPalaceHall(b3, fakeCtx(), mulberry32(7));
const s3 = stats(b3);
ok(s3.nan === 0 && s3.stack === 1 && s3.badColor === 0 && s3.tris > 0, 'second seed build invalid');
ok(Math.abs(s3.tris - s.tris) <= 2000, 'triangle count swings with the seed: ' + s.tris + ' vs ' + s3.tris);

// ---------------------------------------------------------------- report
const report = {
  tris: s.tris, verts: s.verts,
  bbox: { min: s.mn.map((x) => +x.toFixed(3)), max: s.mx.map((x) => +x.toFixed(3)) },
  envelope: { maxR: +s.maxR.toFixed(3), ymin: +s.ymin.toFixed(3), ymax: +s.ymax.toFixed(3), limit: MAX_R },
  oculusClearance: +s.oculusMin.toFixed(3),
  floorInlayMaxR: +s.floorMaxR.toFixed(3),
  perimeterStepMaxR: +s.stepMaxR.toFixed(3),
  apseWindow: { verts: s.apseVerts, maxR: +s.apseMaxR.toFixed(2), note: 'rear window, exempt from the hall envelope' },
  stack: s.stack, bad: s.bad, badColor: s.badColor, badNormal: s.badNormal, farVerts: s.far,
  points: ctx.points.length, lanterns: ctx.lanterns.length,
  deterministic: s2.tris === s.tris,
};
console.log(JSON.stringify(report, null, 2));
if (warns.length) console.log('WARN\n - ' + warns.join('\n - '));
if (fails.length) { console.log('FAIL\n - ' + fails.join('\n - ')); process.exit(1); }
console.log('PASS  palace-hall: ' + s.tris + ' tris, maxR ' + s.maxR.toFixed(2) +
  ', y ' + s.ymin.toFixed(2) + '..' + s.ymax.toFixed(2) +
  ', oculus clear ' + s.oculusMin.toFixed(2) + ' m, ' + ctx.points.length + ' lights, ' +
  ctx.lanterns.length + ' halos, deterministic');
