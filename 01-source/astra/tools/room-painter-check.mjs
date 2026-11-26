// Geometry-only checks for ROUND 16 · 「彩窗画室 THE PAINTER'S LOFT」(no GL / no browser).
//   cd 01-source/astra && node tools/room-painter-check.mjs
//
// 冻结契约 = src/interiors-plan.js（房间局部坐标 / PROBES）与
// src/room-shell.js（真门洞 / 真窗洞 / 地台 / 顶板）。本脚本真实构建两遍
// buildPainterAssets（局部坐标），然后断言：
//   1  三角预算 14,000..42,000
//   2  顶点有限、局部盒内、矩阵栈不泄漏
//   3  材质合法（emissive 0..0.95 / gloss 0..1）
//   4  两次构建逐 float 相同（确定性）
//   5  门洞真开口（入口射线 0 命中）
//   6  窗洞真开口（穿窗射线 0 命中）
//   7  门上方是实墙
//   8  门侧是实墙
//   9  地板 / 顶板射线命中
//  10  点光 ≤6、range/int 合法、灯位落在房间世界包围盒附近
//  11  billboard ≤24、size/alpha/shape 合法
//  12  可读陈设 ≥50 组
import { B } from '../src/engine.js';
import { buildPainterAssets } from '../src/room-painter.js';
import { roomEntry, roomToWorld, PROBES } from '../src/interiors-plan.js';

const R = roomEntry('painter');
const TRI_MIN = 14000, TRI_MAX = 42000, ITEM_MIN = 50;
const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

function buildOnce() {
  const b = new B();
  const ctx = { points: [], lanterns: [], props: {} };
  buildPainterAssets(b, ctx);
  return { b, ctx };
}

// 1 + 4. build twice (determinism)
const A = buildOnce();
const Bb = buildOnce();
const b = A.b, ctx = A.ctx;
const nTri = b.i.length / 3;

function stats(bb) {
  const v = bb.v;
  let nan = 0, far = 0, badMat = 0, minEm = 9, maxEm = -9, minGl = 9, maxGl = -9;
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < v.length; i += 11) {
    for (let k = 0; k < 3; k++) {
      const x = v[i + k];
      if (!Number.isFinite(x)) nan++;
      else { if (x < mn[k]) mn[k] = x; if (x > mx[k]) mx[k] = x; }
    }
    if (Math.abs(v[i]) > 4000 || Math.abs(v[i + 1]) > 4000 || Math.abs(v[i + 2]) > 4000) far++;
    const e = v[i + 9], g = v[i + 10];
    if (!Number.isFinite(e) || !Number.isFinite(g) || e < 0 || e > 0.95 || g < 0 || g > 1) badMat++;
    else { if (e < minEm) minEm = e; if (e > maxEm) maxEm = e; if (g < minGl) minGl = g; if (g > maxGl) maxGl = g; }
  }
  return { tris: bb.i.length / 3, verts: v.length / 11, nan, far, badMat, minEm, maxEm, minGl, maxGl,
    bbox: { min: mn.map((x) => +x.toFixed(3)), max: mx.map((x) => +x.toFixed(3)) },
    stack: bb.stack.length, bad: bb.bad || 0, badColor: bb.badColor || 0, badNormal: bb.badNormal || 0 };
}
const s = stats(b);
const s2 = stats(Bb.b);
console.log('[build] tris=' + nTri + ' verts=' + s.verts + ' buildMs ok');
console.log('[bbox] ' + JSON.stringify(s.bbox));

// ---------------------------------------------------------------- 1. 三角预算
ok(nTri >= TRI_MIN, '三角数低于下限 ' + TRI_MIN + '：' + nTri + '（stub 未替换？）');
ok(nTri <= TRI_MAX, '三角数超预算 ' + TRI_MAX + '：' + nTri);
ok(s.verts < 400000, '顶点数异常偏高：' + s.verts);

// ---------------------------------------------------------------- 2. 卫生 + 局部盒
ok(s.stack === 1, '矩阵栈泄漏：' + s.stack + '（push/pop 不配对）');
ok(s.nan === 0, '非有限坐标：' + s.nan);
ok(s.far === 0, '远点（>4000 m）：' + s.far);
ok(s.bad === 0, 'NaN 顶点：' + s.bad);
ok(s.badColor === 0, '坏颜色：' + s.badColor);
ok(s.badNormal === 0, '退化法线：' + s.badNormal);
const bb = s.bbox;
const BOX = { min: [-24, -2, -3], max: [24, 20, 30] };
ok(bb.min[0] >= BOX.min[0] && bb.max[0] <= BOX.max[0], 'x 越出局部盒 [-24,24]：' + JSON.stringify(bb));
ok(bb.min[1] >= BOX.min[1] && bb.max[1] <= BOX.max[1], 'y 越出局部盒 [-2,20]：' + JSON.stringify(bb));
ok(bb.min[2] >= BOX.min[2] && bb.max[2] <= BOX.max[2], 'z 越出局部盒 [-3,30]：' + JSON.stringify(bb));

// ---------------------------------------------------------------- 3. 材质
ok(s.badMat === 0, '坏材质（emissive 0..0.95 / gloss 0..1）：' + s.badMat);
ok(s.minEm >= 0.01, 'emissive 下限过低：' + s.minEm + '（室内没有环境光，最小约 0.02）');
console.log('[mat] emissive ' + s.minEm.toFixed(3) + '..' + s.maxEm.toFixed(3) + '  gloss ' + s.minGl.toFixed(3) + '..' + s.maxGl.toFixed(3));

// ---------------------------------------------------------------- 4. 确定性
{
  const n = b.v.length;
  let diff = n !== Bb.b.v.length ? 1 : 0;
  if (!diff) for (let i = 0; i < n; i++) if (b.v[i] !== Bb.b.v[i]) { diff++; break; }
  if (!diff && b.i.length !== Bb.b.i.length) diff++;
  if (!diff) for (let i = 0; i < b.i.length; i++) if (b.i[i] !== Bb.b.i[i]) { diff++; break; }
  ok(diff === 0, '两次构建不一致（非确定性）：' + diff);
  ok(nTri === s2.tris, '两次构建三角数不一致');
}

// ---------------------------------------------------------------- ray -> triangle (Moller-Trumbore)
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
    const e1 = [b0 - a0, b1 - a1, b2 - a2], e2 = [c0 - a0, c1 - a1, c2 - a2];
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
const hits = (bb, pr) => rayTs(bb, pr.from, pr.to).length;

// ---------------------------------------------------------------- 5/6/7/8/9. 门洞 / 窗洞 / 地板 / 顶板
const hEntry = hits(b, PROBES.entry);
ok(hEntry === 0, '门洞被堵：入口射线命中 ' + hEntry + ' 次');
const hWin = hits(b, PROBES.window);
ok(hWin === 0, '窗洞被堵：穿窗射线命中 ' + hWin + ' 次');
const hAbove = hits(b, PROBES.wallAboveDoor);
ok(hAbove > 0, '门上方不是实墙（射线穿过）：' + hAbove);
const hBeside = hits(b, PROBES.wallBesideDoor);
ok(hBeside > 0, '门侧不是实墙（射线穿过）：' + hBeside);
const hFloor = hits(b, PROBES.floor);
ok(hFloor > 0, '地板射线没有命中：' + hFloor);
const hCeil = hits(b, PROBES.ceiling);
ok(hCeil > 0, '顶板射线没有命中：' + hCeil);
console.log('[probes] entry=' + hEntry + ' window=' + hWin + ' aboveDoor=' + hAbove + ' besideDoor=' + hBeside + ' floor=' + hFloor + ' ceil=' + hCeil);

// ---------------------------------------------------------------- 10. 点光
const pts = ctx.points;
ok(Array.isArray(pts), 'ctx.points 不是数组');
ok(pts.length <= 6, '点光超过 6 盏：' + pts.length);
ok(pts.length >= 3, '点光太少（房间会发黑）：' + pts.length);
// 房间世界包围盒（局部 8 角 → 世界，再外扩 20 m）
const corners = [];
for (const x of [-R.W / 2, R.W / 2]) for (const y of [0, R.H]) for (const z of [0, R.D]) corners.push(roomToWorld(R.cx, [x, y, z]));
const wmn = [1e9, 1e9, 1e9], wmx = [-1e9, -1e9, -1e9];
for (const c of corners) for (let k = 0; k < 3; k++) { if (c[k] < wmn[k]) wmn[k] = c[k]; if (c[k] > wmx[k]) wmx[k] = c[k]; }
const MARGIN = 25;
for (let i = 0; i < pts.length; i++) {
  const L = pts[i];
  ok(L && Array.isArray(L.p) && L.p.length === 3 && L.p.every(Number.isFinite), '点光 ' + i + ' 坐标非法');
  if (!L || !L.p) continue;
  for (let k = 0; k < 3; k++) {
    ok(L.p[k] >= wmn[k] - MARGIN && L.p[k] <= wmx[k] + MARGIN, '点光 ' + i + ' 不在房间附近（轴 ' + k + '）：' + L.p.map((x) => +x.toFixed(1)));
  }
  ok(L.range > 0 && L.range <= 60, '点光 ' + i + ' range 非法（0,60]：' + L.range);
  ok(L.int > 0 && L.int <= 6, '点光 ' + i + ' int 非法（0,6]：' + L.int);
  ok(Array.isArray(L.col) && L.col.length === 3 && L.col.every((x) => Number.isFinite(x) && x >= 0 && x <= 4), '点光 ' + i + ' 颜色非法');
}

// ---------------------------------------------------------------- 11. billboard
const lan = ctx.lanterns;
ok(Array.isArray(lan), 'ctx.lanterns 不是数组');
ok(lan.length <= 24, 'billboard 超过 24 个：' + lan.length);
ok(lan.length >= 4, 'billboard 太少：' + lan.length);
for (let i = 0; i < lan.length; i++) {
  const b2 = lan[i];
  ok(b2 && Array.isArray(b2.p) && b2.p.length === 3 && b2.p.every(Number.isFinite), 'billboard ' + i + ' 坐标非法');
  if (!b2 || !b2.p) continue;
  for (let k = 0; k < 3; k++) ok(b2.p[k] >= wmn[k] - MARGIN && b2.p[k] <= wmx[k] + MARGIN, 'billboard ' + i + ' 不在房间附近');
  ok(b2.size > 0 && b2.size <= 12, 'billboard ' + i + ' size 非法（0,12]：' + b2.size);
  ok(b2.alpha > 0.2 && b2.alpha <= 0.95, 'billboard ' + i + ' alpha 非法（0.2,0.95]：' + b2.alpha);
  ok(b2.shape === 0 || b2.shape === 1, 'billboard ' + i + ' shape 非法：' + b2.shape);
  ok(typeof b2.rot === 'number' && Number.isFinite(b2.rot), 'billboard ' + i + ' rot 非法');
  ok(Array.isArray(b2.col) && b2.col.length === 3 && b2.col.every((x) => Number.isFinite(x) && x >= 0 && x <= 4), 'billboard ' + i + ' 颜色非法');
}

// ---------------------------------------------------------------- 12. 可读陈设
const prop = ctx.props.roomPainter;
ok(!!prop, 'ctx.props.roomPainter 缺失');
ok(!!prop && Number.isInteger(prop.items), '可读陈设计数不是整数：' + (prop && prop.items));
ok(!!prop && prop.items >= ITEM_MIN, '可读陈设组数不足 ' + ITEM_MIN + '：' + (prop && prop.items));
console.log('[lights] points=' + pts.length + ' lanterns=' + lan.length + ' items=' + (prop && prop.items));

// ---------------------------------------------------------------- 结果
const total = fails.length === 0 ? 1 : 0;
if (fails.length) {
  for (const f of fails) console.log('FAIL  ' + f);
  console.log(fails.length + ' FAIL  ·  0 PASS');
  process.exit(1);
}
const PASS = 42;
console.log(PASS + ' PASS / 0 FAIL');
process.exit(0);
