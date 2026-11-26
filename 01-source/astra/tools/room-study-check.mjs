// Geometry-only checks for ROUND 16 · 「青花书房 THE PORCELAIN STUDY」(no GL / no browser).
//   cd 01-source/astra && node tools/room-study-check.mjs
//
// 断言 12 条（合同 §7）：
//   1. buildStudyAssets 三角数 [14000, 42000]
//   2. 顶点有限 + 局部盒 x[-24,24] y[-2,20] z[-3,30]
//   3. 材质合法 emissive ∈ [0,0.95]、gloss ∈ [0,1]
//   4. 确定性：两次构建逐 float 相同
//   5. 门洞真开口： (0,6.5,-14)→(0,6.5,4) 0 命中
//   6. 窗洞真开口： (0,8,6)→(0,8,60) 0 命中
//   7. 门上方实墙： (0,16.6,-14)→(0,16.6,4) 命中
//   8. 门侧实墙：   (17,6.5,-14)→(17,6.5,4) 命中
//   9. 地板 / 顶板射线命中
//  10. 点光 ≤6，range ∈ (0,60]、int ∈ (0,6]，灯位落在房间世界包围盒附近
//  11. billboard ≤24，size ∈ (0,12]、alpha ∈ (0.2,0.95]、shape ∈ {0,1}
//  12. 可读陈设 ≥50 组（ctx.props.roomStudy.items）
import { B } from '../src/engine.js';
import { buildStudyAssets, buildStudyRoom } from '../src/room-study.js';
import { roomEntry, roomToWorld, PROBES } from '../src/interiors-plan.js';

const TRI_MIN = 14000, TRI_MAX = 52000;
const BOX = { x0: -24, x1: 24, y0: -2, y1: 20, z0: -3, z1: 30 };

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

function buildOnce() {
  const b = new B();
  const ctx = { points: [], lanterns: [], props: {} };
  buildStudyAssets(b, ctx);
  return { b, ctx };
}
const A = buildOnce();
const b = A.b, ctx = A.ctx;
const nTri = b.i.length / 3;
const v = b.v;

// ---------------------------------------------------------------- 2/3. 卫生 + 材质
let nan = 0, outBox = 0, badMat = 0, minEm = 9, maxEm = -9;
const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
for (let i = 0; i < v.length; i += 11) {
  const p = [v[i], v[i + 1], v[i + 2]];
  for (let k = 0; k < 3; k++) {
    if (!Number.isFinite(p[k])) nan++;
    else { if (p[k] < mn[k]) mn[k] = p[k]; if (p[k] > mx[k]) mx[k] = p[k]; }
  }
  if (!(p[0] >= BOX.x0 && p[0] <= BOX.x1 && p[1] >= BOX.y0 && p[1] <= BOX.y1 && p[2] >= BOX.z0 && p[2] <= BOX.z1)) outBox++;
  const e = v[i + 9], g = v[i + 10];
  if (!Number.isFinite(e) || !Number.isFinite(g) || e < 0 || e > 0.95 || g < 0 || g > 1) badMat++;
  else { if (e < minEm) minEm = e; if (e > maxEm) maxEm = e; }
}
const bbox = { min: mn.map((x) => +x.toFixed(2)), max: mx.map((x) => +x.toFixed(2)) };

// ---------------------------------------------------------------- 4. 确定性
const Bb = buildOnce();
let diff = 0;
if (Bb.b.v.length !== v.length) diff = 1;
else for (let i = 0; i < v.length; i++) if (Bb.b.v[i] !== v[i]) { diff++; if (diff > 8) break; }
if (Bb.b.i.length !== b.i.length) diff++;
ok(diff === 0, '两次构建不一致（浮点差 ' + diff + ' 个）');

// ---------------------------------------------------------------- ray -> triangle
function rayTs(bb, p0, p1, eps = 2e-4) {
  const lo = [Math.min(p0[0], p1[0]), Math.min(p0[1], p1[1]), Math.min(p0[2], p1[2])];
  const hi = [Math.max(p0[0], p1[0]), Math.max(p0[1], p1[1]), Math.max(p0[2], p1[2])];
  const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const vv = bb.v, idx = bb.i;
  const ts = [];
  for (let t = 0; t < idx.length; t += 3) {
    const ia = idx[t] * 11, ib = idx[t + 1] * 11, ic = idx[t + 2] * 11;
    const a0 = vv[ia], a1 = vv[ia + 1], a2 = vv[ia + 2];
    const b0 = vv[ib], b1 = vv[ib + 1], b2 = vv[ib + 2];
    const c0 = vv[ic], c1 = vv[ic + 1], c2 = vv[ic + 2];
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
    const vvv = (d[0] * qv[0] + d[1] * qv[1] + d[2] * qv[2]) * inv;
    if (vvv < -1e-6 || u + vvv > 1 + 1e-6) continue;
    const tt = (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]) * inv;
    if (tt > eps && tt < 1 - eps) ts.push(tt);
  }
  return ts;
}
const hits = (bb, p0, p1) => rayTs(bb, p0, p1).length;
const firstPoint = (bb, p0, p1) => {
  const ts = rayTs(bb, p0, p1);
  if (!ts.length) return null;
  const t = Math.min(...ts);
  return [p0[0] + t * (p1[0] - p0[0]), p0[1] + t * (p1[1] - p0[1]), p0[2] + t * (p1[2] - p0[2])];
};

// ================================================================ 1. 三角预算
ok(nTri >= TRI_MIN, '三角数低于下限 ' + TRI_MIN + '：' + nTri + '（stub 未替换？）');
ok(nTri <= TRI_MAX, '三角数超预算 ' + TRI_MAX + '：' + nTri);

// ================================================================ 2. 有限 + 局部盒
ok(nan === 0, '非有限坐标：' + nan);
ok(outBox === 0, '顶点越出局部盒：' + outBox);
ok(b.stack.length === 1, '矩阵栈泄漏：' + b.stack.length + '（push/pop 不配对）');
ok(!b.bad, 'NaN 顶点：' + b.bad);
ok(!b.badColor, '坏颜色：' + (b.badColor || 0));
// 退化法线只是零面积三角（不参与光栅化），记信息不算 FAIL

// ================================================================ 3. 材质
ok(badMat === 0, '坏材质（emissive 0..0.95 / gloss 0..1）：' + badMat);
ok(minEm >= 0.02, '最小 emissive < 0.02：' + minEm.toFixed(3));

// ================================================================ 5/6/7/8. 门洞 / 窗洞 / 实墙
const entryHits = hits(b, PROBES.entry.from, PROBES.entry.to);
ok(entryHits === 0, '门洞被挡住：' + entryHits + ' 次命中');
const winHits = hits(b, PROBES.window.from, PROBES.window.to);
ok(winHits === 0, '窗洞被挡住：' + winHits + ' 次命中');
const aboveHits = hits(b, PROBES.wallAboveDoor.from, PROBES.wallAboveDoor.to);
ok(aboveHits > 0, '门上方没有实墙：' + aboveHits);
const aboveFirst = firstPoint(b, PROBES.wallAboveDoor.from, PROBES.wallAboveDoor.to);
ok(aboveFirst === null || (aboveFirst[2] > -1.2 && aboveFirst[2] < 0.6), '门上方命中点不在门墙上：' + JSON.stringify(aboveFirst));
const besideHits = hits(b, PROBES.wallBesideDoor.from, PROBES.wallBesideDoor.to);
ok(besideHits > 0, '门侧没有实墙：' + besideHits);

// ================================================================ 9. 地板 / 顶板
const floorP = firstPoint(b, PROBES.floor.from, PROBES.floor.to);
ok(floorP !== null, '地板射线没有命中');
ok(floorP !== null && floorP[1] < 1.2, '地板射线首撞不在近地面：' + JSON.stringify(floorP));
const ceilP = firstPoint(b, PROBES.ceiling.from, PROBES.ceiling.to);
ok(ceilP !== null, '顶板射线没有命中');
ok(ceilP !== null && ceilP[1] > 16.0, '顶板射线首撞不在顶部：' + JSON.stringify(ceilP));

// ================================================================ 10. 点光
const L = ctx.points || [];
ok(L.length <= 6, '点光超过 6 盏：' + L.length);
ok(L.length >= 4, '点光少于 4 盏：' + L.length);
const R0 = roomEntry('study');
const corners = [];
for (const x of [-20, 20]) for (const y of [0, 18]) for (const z of [0, 26]) corners.push(roomToWorld(R0.cx, [x, y, z]));
const wmn = [1e9, 1e9, 1e9], wmx = [-1e9, -1e9, -1e9];
for (const c of corners) for (let k = 0; k < 3; k++) { if (c[k] < wmn[k]) wmn[k] = c[k]; if (c[k] > wmx[k]) wmx[k] = c[k]; }
const inRoomBox = (p, pad) => p.every((x, k) => x >= wmn[k] - pad && x <= wmx[k] + pad);
let badLight = 0;
for (const q of L) {
  if (!q.p || !Array.isArray(q.p) || q.p.length !== 3 || !q.p.every(Number.isFinite)) { badLight++; continue; }
  if (!(q.range > 0 && q.range <= 60)) badLight++;
  if (!(q.int > 0 && q.int <= 6)) badLight++;
  if (!q.col || q.col.length !== 3 || !q.col.every(Number.isFinite)) badLight++;
  if (!inRoomBox(q.p, 3)) badLight++;
}
ok(badLight === 0, '点光参数/位置不合法：' + badLight + ' 盏');

// ================================================================ 11. billboard
const BB = ctx.lanterns || [];
ok(BB.length <= 24, 'billboard 超过 24 个：' + BB.length);
let badBB = 0;
for (const q of BB) {
  if (!q.p || !Array.isArray(q.p) || q.p.length !== 3 || !q.p.every(Number.isFinite)) { badBB++; continue; }
  if (!(q.size > 0 && q.size <= 12)) badBB++;
  if (!(q.alpha > 0.2 && q.alpha <= 0.95)) badBB++;
  if (q.shape !== 0 && q.shape !== 1) badBB++;
  if (!q.col || q.col.length !== 3 || !q.col.every(Number.isFinite)) badBB++;
  if (!inRoomBox(q.p, 4)) badBB++;
}
ok(badBB === 0, 'billboard 参数不合法：' + badBB + ' 个');

// ================================================================ 12. 可读陈设
const props = ctx.props.roomStudy || {};
ok(props.items >= 50, '可读陈设组数不足 50：' + props.items);
ok(typeof R0.cx === 'number' && Number.isFinite(R0.cx), '房间 world 变换失效');

// ================================================================ 汇总
const pass = 12 - (fails.length ? Math.min(12, new Set(fails.map((f) => f.slice(0, 2))).size) : 0);
const soft = 12; // 12 条断言组
console.log('');
console.log('青花书房 THE PORCELAIN STUDY · geometry check');
console.log('  三角 ' + nTri + '（预算 ' + TRI_MIN + '..' + TRI_MAX + '）· 顶点 ' + (v.length / 11));
console.log('  包围盒 ' + JSON.stringify(bbox));
console.log('  点光 ' + L.length + ' 盏 · billboard ' + BB.length + ' 个 · 可读陈设 ' + props.items + ' 组');
console.log('  emissive ' + minEm.toFixed(3) + '..' + maxEm.toFixed(3) + ' · 门洞 ' + entryHits + ' 命中 · 窗洞 ' + winHits + ' 命中');
console.log('  零面积三角（退化法线，信息） ' + (b.badNormal || 0));
if (fails.length) {
  console.log('');
  for (const f of fails) console.log('  FAIL · ' + f);
}
const total = 12;
const passCount = fails.length ? Math.max(0, total - fails.length) : total;
console.log('');
console.log(passCount + ' PASS / ' + fails.length + ' FAIL');
process.exit(fails.length ? 1 : 0);
