// room-atelier-check.mjs — ROUND 16 ·「玻璃工坊」的纯 node 几何体检（无 GL / 无浏览器）。
//   cd 01-source/astra && node tools/room-atelier-check.mjs
//
// 直接构建 buildAtelierAssets 两遍（局部坐标），断言合同 §7 的 12 条红线：
//   1. 三角预算 14,000..42,000        2. 顶点有限且在局部盒内
//   3. 材质合法（emissive 0..0.95 / gloss 0..1）
//   4. 两次构建逐 float 相同（确定性）
//   5. 门洞真开口                     6. 窗洞真开口
//   7. 门上方是实墙                   8. 门侧是实墙
//   9. 地板/顶板射线命中              10. 点光 ≤6 且参数/位置合理
//  11. billboard ≤24 且参数合理        12. 可读陈设 ≥50 组
import { B } from '../src/engine.js';
import { buildAtelierAssets } from '../src/room-atelier.js';
import { PROBES, ROOMS, roomToWorld } from '../src/interiors-plan.js';

const TRI_MIN = 14000, TRI_MAX = 42000;
const BBOX = { x: [-24, 24], y: [-2, 20], z: [-3, 30] };

const fails = [];
let total = 0;
const ok = (cond, msg) => { total++; if (!cond) fails.push(msg); };

// ---------------------------------------------------------------- build
function buildOnce(ctx) {
  const b = new B();
  buildAtelierAssets(b, ctx);
  return b;
}
const ctx = { points: [], lanterns: [], props: {} };
const t0 = Date.now();
const b = buildOnce(ctx);
const buildMs = Date.now() - t0;
const nTri = b.i.length / 3;

function stats(bb) {
  const v = bb.v;
  let nan = 0, outBox = 0, badMat = 0, minEm = 9, maxEm = -9, minGl = 9, maxGl = -9;
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < v.length; i += 11) {
    for (let k = 0; k < 3; k++) {
      const x = v[i + k];
      if (!Number.isFinite(x)) nan++;
      else { if (x < mn[k]) mn[k] = x; if (x > mx[k]) mx[k] = x; }
    }
    if (!Number.isFinite(v[i]) || !Number.isFinite(v[i + 1]) || !Number.isFinite(v[i + 2])) outBox++;
    else if (v[i] < BBOX.x[0] || v[i] > BBOX.x[1] || v[i + 1] < BBOX.y[0] ||
             v[i + 1] > BBOX.y[1] || v[i + 2] < BBOX.z[0] || v[i + 2] > BBOX.z[1]) outBox++;
    const e = v[i + 9], g = v[i + 10];
    if (!Number.isFinite(e) || !Number.isFinite(g) || e < 0 || e > 0.95 || g < 0 || g > 1) badMat++;
    else {
      if (e < minEm) minEm = e; if (e > maxEm) maxEm = e;
      if (g < minGl) minGl = g; if (g > maxGl) maxGl = g;
    }
  }
  let h = 2166136261;
  for (let i = 0; i < v.length; i += 5) h = Math.imul(h ^ Math.round(v[i] * 4096), 16777619) >>> 0;
  return {
    tris: bb.i.length / 3, verts: v.length / 11, nan, outBox, badMat, hash: h,
    minEm, maxEm, minGl, maxGl, stack: bb.stack.length,
    bbox: { min: mn.map((x) => +x.toFixed(3)), max: mx.map((x) => +x.toFixed(3)) },
  };
}
const s = stats(b);

// ---------------------------------------------------------------- ray -> triangle (Möller–Trumbore，抄 station-core-check.mjs)
function rayTs(bb, p0, p1, eps = 2e-4) {
  const lo = [Math.min(p0[0], p1[0]), Math.min(p0[1], p1[1]), Math.min(p0[2], p1[2])];
  const hi = [Math.max(p0[0], p1[0]), Math.max(p0[1], p1[1]), Math.max(p0[2], p1[2])];
  const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const v = bb.v, idx = bb.i;
  const ts = [];
  for (let t = 0; t < idx.length; t += 3) {
    const ia = idx[t] * 11, ib = idx[t + 1] * 11, ic = idx[t + 2] * 11;
    const a0 = v[ia], a1 = v[ia + 1], a2 = v[ia + 2];
    const b0 = v[ib], b1 = v[ib + 1], b2 = v[ib + 2];
    const c0 = v[ic], c1 = v[ic + 1], c2 = v[ic + 2];
    if (Math.max(a0, b0, c0) < lo[0] || Math.min(a0, b0, c0) > hi[0]) continue;
    if (Math.max(a1, b1, c1) < lo[1] || Math.min(a1, b1, c1) > hi[1]) continue;
    if (Math.max(a2, b2, c2) < lo[2] || Math.min(a2, b2, c2) > hi[2]) continue;
    const e1 = [b0 - a0, b1 - a1, b2 - a2];
    const e2 = [c0 - a0, c1 - a1, c2 - a2];
    const pv = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
    const det = e1[0] * pv[0] + e1[1] * pv[1] + e1[2] * pv[2];
    if (Math.abs(det) < 1e-9) continue;
    const inv = 1 / det;
    const tv = [p0[0] - a0, p0[1] - a1, p0[2] - a2];
    const u = (tv[0] * pv[0] + tv[1] * pv[1] + tv[2] * pv[2]) * inv;
    if (u < -1e-6 || u > 1 + 1e-6) continue;
    const qv = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]];
    const vv = (d[0] * qv[0] + d[1] * qv[1] + d[2] * qv[2]) * inv;
    if (vv < -1e-6 || u + vv > 1 + 1e-6) continue;
    const tt = (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]) * inv;
    if (tt > eps && tt < 1 - eps) ts.push(tt);
  }
  return ts;
}
const hits = (bb, p0, p1) => rayTs(bb, p0, p1).length;
const firstT = (bb, p0, p1) => { const ts = rayTs(bb, p0, p1); return ts.length ? Math.min(...ts) : -1; };

// ================================================================ 1. 三角预算
ok(nTri >= TRI_MIN, '三角数低于下限 ' + TRI_MIN + '：' + nTri + '（stub 未替换？）');
ok(nTri <= TRI_MAX, '三角数超预算 ' + TRI_MAX + '：' + nTri);
ok(s.verts > 0, '顶点数为 0');

// ================================================================ 2. 顶点有限 / 局部盒
ok(s.stack === 1, '矩阵栈泄漏：' + s.stack + '（push/pop 不配对）');
ok(s.nan === 0, '非有限坐标（NaN/Inf）：' + s.nan);
ok(s.outBox === 0, '顶点跑出局部盒 ' + JSON.stringify(BBOX) + '：' + s.outBox);

// ================================================================ 3. 材质
ok(s.badMat === 0, '非法材质（emissive 0..0.95 / gloss 0..1）：' + s.badMat);
ok(s.minEm >= 0.02, 'emissive 低于 0.02 的死黑面：' + s.minEm.toFixed(3));

// ================================================================ 4. 确定性
const ctx2 = { points: [], lanterns: [], props: {} };
const b2 = buildOnce(ctx2);
let floatDiff = -1;
if (b2.v.length === b.v.length) {
  floatDiff = 0;
  for (let i = 0; i < b.v.length; i++) if (b.v[i] !== b2.v[i]) { floatDiff++; break; }
}
const s2 = stats(b2);
ok(b2.v.length === b.v.length, '顶点数不确定：' + b.v.length + ' vs ' + b2.v.length);
ok(floatDiff === 0, '顶点 float 不确定（存在首个不同处）');
ok(s2.tris === s.tris, '三角数不确定：' + s.tris + ' vs ' + s2.tris);
ok(s2.hash === s.hash, '顶点哈希不确定');
ok(JSON.stringify(ctx.lanterns) === JSON.stringify(ctx2.lanterns), '光斑列表不确定');
ok(JSON.stringify(ctx.points) === JSON.stringify(ctx2.points), '点光列表不确定');

// ================================================================ 5/6. 门洞 / 窗洞真开口
const entryHits = hits(b, PROBES.entry.from, PROBES.entry.to);
ok(entryHits === 0, '门洞不是真开口：穿门射线命中 ' + entryHits + ' 次');
const winHits = hits(b, PROBES.window.from, PROBES.window.to);
ok(winHits === 0, '窗洞不是真开口：穿窗射线命中 ' + winHits + ' 次');

// ================================================================ 7/8. 门上方 / 门侧是实墙
const aboveHits = hits(b, PROBES.wallAboveDoor.from, PROBES.wallAboveDoor.to);
ok(aboveHits > 0, '门上方不是实墙（射线 0 命中）');
const besideHits = hits(b, PROBES.wallBesideDoor.from, PROBES.wallBesideDoor.to);
ok(besideHits > 0, '门侧不是实墙（射线 0 命中）');

// ================================================================ 9. 地板 / 顶板
const floorHits = hits(b, PROBES.floor.from, PROBES.floor.to);
ok(floorHits > 0, '地板射线 0 命中');
const ceilHits = hits(b, PROBES.ceiling.from, PROBES.ceiling.to);
ok(ceilHits > 0, '顶板射线 0 命中');

// ================================================================ 10. 点光
const L = ctx.points;
ok(L.length >= 4, '点光太少（室内需要 4–6 盏）：' + L.length);
ok(L.length <= 6, '点光超过 6 盏：' + L.length);
const R = ROOMS.find((r) => r.key === 'atelier');
const wb = { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] };
for (const c of [[-20, -1, -1], [20, -1, -1], [-20, 19, -1], [20, 19, -1],
                 [-20, -1, 27], [20, -1, 27], [-20, 19, 27], [20, 19, 27]]) {
  const w = roomToWorld(R.cx, c);
  for (let k = 0; k < 3; k++) { if (w[k] < wb.min[k]) wb.min[k] = w[k]; if (w[k] > wb.max[k]) wb.max[k] = w[k]; }
}
let badL = 0;
for (const q of L) {
  if (!q.p || !Array.isArray(q.p) || !q.p.every(Number.isFinite)) { badL++; continue; }
  if (!q.col || !q.col.every(Number.isFinite)) { badL++; continue; }
  if (!(q.range > 0 && q.range <= 60)) { badL++; continue; }
  if (!(q.int > 0 && q.int <= 6)) { badL++; continue; }
  for (let k = 0; k < 3; k++) {
    if (q.p[k] < wb.min[k] - 4 || q.p[k] > wb.max[k] + 4) badL++;
  }
}
ok(badL === 0, badL + ' 盏点光参数/位置不合理（range 0..60 / int 0..6 / 落在房间世界包围盒附近）');

// ================================================================ 11. billboard
const BB = ctx.lanterns;
ok(BB.length <= 24, 'billboard 超过 24：' + BB.length);
let badB = 0;
for (const q of BB) {
  if (!q.p || !Array.isArray(q.p) || !q.p.every(Number.isFinite)) { badB++; continue; }
  if (!q.col || !q.col.every(Number.isFinite)) { badB++; continue; }
  if (!(q.size > 0 && q.size <= 12)) { badB++; continue; }
  if (!(q.alpha > 0.2 && q.alpha <= 0.95)) { badB++; continue; }
  if (q.shape !== 0 && q.shape !== 1) { badB++; continue; }
}
ok(badB === 0, badB + ' 个 billboard 参数不合理（size 0..12 / alpha 0.2..0.95 / shape 0|1）');

// ================================================================ 12. 可读陈设组数
const pc = ctx.props.roomAtelier;
ok(!!pc, 'ctx.props.roomAtelier 没有写');
ok(!!pc && Number.isFinite(pc.items), 'ctx.props.roomAtelier.items 不是数字');
ok(!!pc && pc.items >= 50, '可读陈设组数不足 50：' + (pc && pc.items));
ok(!!pc && Number.isFinite(pc.tris) && pc.tris === nTri, 'ctx.props.roomAtelier.tris 不对：' + (pc && pc.tris) + ' vs ' + nTri);

// ================================================================ report
const report = {
  tris: s.tris, verts: s.verts, build_ms: buildMs,
  bbox: s.bbox,
  materials: { emissive: [+s.minEm.toFixed(3), +s.maxEm.toFixed(3)], gloss: [+s.minGl.toFixed(2), +s.maxGl.toFixed(2)] },
  determinism: { floats: b.v.length, first_diff: floatDiff, hash: s.hash },
  probes: {
    door_open: entryHits, window_open: winHits,
    wall_above_door: aboveHits, wall_beside_door: besideHits,
    floor: floorHits, ceiling: ceilHits,
    door_first_hit_t: +firstT(b, PROBES.entry.from, PROBES.entry.to).toFixed(3),
  },
  lights: L.length, lanterns: BB.length, items: pc && pc.items,
};
console.log(JSON.stringify(report, null, 2));
if (fails.length) {
  console.log('FAIL\n - ' + fails.join('\n - '));
  process.exit(1);
}
console.log('PASS  room-atelier: ' + s.tris + ' tris · ' + (pc.items) + ' 组陈设 · ' + L.length +
  ' 点光 · ' + BB.length + ' 光斑 · 门/窗 0 命中 · 确定性一致 · 0 FAIL');
console.log((total - fails.length) + ' PASS / ' + fails.length + ' FAIL');
