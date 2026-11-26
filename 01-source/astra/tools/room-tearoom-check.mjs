// room-tearoom-check.mjs — ROUND 16 ·「丝绒茶厅」的纯 node 体检（不启动浏览器）。
//   cd 01-source/astra && node tools/room-tearoom-check.mjs
//
// 只 import 自己的模块，不受别人正在写的其它 room-*.js 影响。
// 断言（合同 §7 的 12 条）：
//   1  三角预算 14000..42000
//   2  顶点有限 / 都在局部盒 x∈[-24,24], y∈[-2,20], z∈[-3,30]
//   3  材质合法：emissive ∈ [0,0.95]、gloss ∈ [0,1]（每 11 个 float 的第 9/10 位）
//   4  两次构建逐 float 相同（确定性，禁 Math.random / Date）
//   5  门洞真开口：从桥上穿门进来 0 命中
//   6  窗洞真开口：从室内穿大窗出去 0 命中
//   7  门上方是实墙（命中）
//   8  门侧是实墙（命中）
//   9  地板 / 顶板射线命中
//  10  点光 ≤6，range ∈ (0,60]，int ∈ (0,6]，位置在房间世界包围盒附近
//  11  billboard ≤24，size ∈ (0,12]，alpha ∈ (0.2,0.95]，shape ∈ {0,1}
//  12  可读陈设 ≥50 组（模块自己写进 ctx.props.roomTearoom.items）
// 附加卫生：矩阵栈不泄漏、无坏颜色 / 坏法线、光照参数齐全。
import { B } from '../src/engine.js';
import { roomEntry, roomToWorld, PROBES } from '../src/interiors-plan.js';
import { buildTearoomAssets } from '../src/room-tearoom.js';

const R = roomEntry('tearoom');
const TRI_MIN = 14000, TRI_MAX = 42000;
const BOX = { min: [-24, -2, -3], max: [24, 20, 30] };   // 局部坐标包围盒（含外壳出挑）

const fails = [];
const oks = [];
const ok = (cond, msg) => { if (cond) oks.push(msg); else fails.push(msg); };

// ---------------------------------------------------------------- build
function buildOnce() {
  const ctx = { points: [], lanterns: [], props: {} };
  const b = new B();
  buildTearoomAssets(b, ctx);
  return { b, ctx };
}
const t0 = Date.now();
const A = buildOnce();
const buildMs = Date.now() - t0;
const b = A.b, ctx = A.ctx;
const nTri = b.i.length / 3;

// ---------------------------------------------------------------- 统计
function stats(bb) {
  const v = bb.v;
  let nan = 0, out = 0, badMat = 0, badEm = 0, badGl = 0;
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < v.length; i += 11) {
    let finite = true;
    for (let k = 0; k < 3; k++) {
      const x = v[i + k];
      if (!Number.isFinite(x)) { nan++; finite = false; }
      else { if (x < mn[k]) mn[k] = x; if (x > mx[k]) mx[k] = x; }
    }
    for (let k = 3; k < 6; k++) if (!Number.isFinite(v[i + k])) nan++;
    if (finite && (mn[0] < BOX.min[0] || mx[0] > BOX.max[0] || mn[1] < BOX.min[1] || mx[1] > BOX.max[1] ||
      mn[2] < BOX.min[2] || mx[2] > BOX.max[2])) out++;
    const e = v[i + 9], g = v[i + 10];
    if (!Number.isFinite(e) || !Number.isFinite(g)) badMat++;
    else {
      if (e < 0 || e > 0.95) { badMat++; badEm++; }
      if (g < 0 || g > 1) { badMat++; badGl++; }
    }
  }
  return {
    tris: bb.i.length / 3, verts: v.length / 11, nan, out, badMat, badEm, badGl,
    bbox: { min: mn.map((x) => +x.toFixed(3)), max: mx.map((x) => +x.toFixed(3)) },
    stack: bb.stack.length, badNormal: bb.badNormal || 0, badColor: bb.badColor || 0,
  };
}
const s = stats(b);

// ---------------------------------------------------------------- 射线 → 三角（Möller–Trumbore，抄 station-core-check）
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
const hits = (p0, p1) => rayTs(b, p0, p1).length;

// ================================================================ 1 三角预算
ok(nTri >= TRI_MIN && nTri <= TRI_MAX, '三角数 ' + nTri + ' 不在 [' + TRI_MIN + ',' + TRI_MAX + ']');
ok(s.verts < 200000, '顶点数异常：' + s.verts);

// ================================================================ 2 顶点 / 包围盒
ok(s.nan === 0, '非有限顶点：' + s.nan);
ok(s.out === 0, '越界顶点（局部盒 x±24 / y -2..20 / z -3..30）：' + s.out);
ok(s.stack === 1, '矩阵栈泄漏：' + s.stack + '（push/pop 不配对）');
ok(s.badNormal === 0, '退化法线：' + s.badNormal);
ok(s.badColor === 0, '坏颜色：' + s.badColor);

// ================================================================ 3 材质
ok(s.badMat === 0, '非法材质：' + s.badMat + '（emissive 越界 ' + s.badEm + '，gloss 越界 ' + s.badGl + '）');

// ================================================================ 4 确定性
const B2 = buildOnce();
let firstDiff = -1;
let lenEq = B2.b.v.length === b.v.length;
if (lenEq) {
  for (let i = 0; i < b.v.length; i++) if (b.v[i] !== B2.b.v[i]) { firstDiff = i; break; }
}
ok(lenEq, '两次构建顶点数不同：' + b.v.length + ' vs ' + B2.b.v.length);
ok(firstDiff === -1, '两次构建逐 float 不同（首个差异 index ' + firstDiff + '）');
ok(B2.b.i.length === b.i.length, '两次构建索引数不同');
ok(JSON.stringify(B2.ctx.props) === JSON.stringify(ctx.props), '两次构建 props.items 不同');
ok(JSON.stringify(B2.ctx.points) === JSON.stringify(ctx.points), '两次构建点光不同');
ok(JSON.stringify(B2.ctx.lanterns) === JSON.stringify(ctx.lanterns), '两次构建光斑不同');

// ================================================================ 5/6 门洞、窗洞真开口
const ent = hits(PROBES.entry.from, PROBES.entry.to);
ok(ent === 0, '门洞被挡住：穿门射线命中 ' + ent + ' 次');
const win = hits(PROBES.window.from, PROBES.window.to);
ok(win === 0, '窗洞被挡住：穿窗射线命中 ' + win + ' 次');

// ================================================================ 7/8 门上方 / 门侧是实墙
const above = hits(PROBES.wallAboveDoor.from, PROBES.wallAboveDoor.to);
ok(above > 0, '门上方不是实墙：命中 ' + above);
const beside = hits(PROBES.wallBesideDoor.from, PROBES.wallBesideDoor.to);
ok(beside > 0, '门侧不是实墙：命中 ' + beside);

// ================================================================ 9 地板 / 顶板
const fl = hits(PROBES.floor.from, PROBES.floor.to);
ok(fl > 0, '地板射线没有命中：' + fl);
const ce = hits(PROBES.ceiling.from, PROBES.ceiling.to);
ok(ce > 0, '顶板射线没有命中：' + ce);

// ================================================================ 10 点光
const L = ctx.points;
ok(Array.isArray(L), 'ctx.points 不是数组');
ok(L.length >= 4, '点光太少（室内需要主灯/窗侧/门口/工作灯）：' + L.length);
ok(L.length <= 6, '点光超过 6 盏：' + L.length);
// 房间世界包围盒（局部盒四角 → 世界）外扩 10 m：灯必须落在附近
function worldBBox() {
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const x of [-20, 20]) for (const y of [0, 18]) for (const z of [0, 26]) {
    const p = roomToWorld(R.cx, [x, y, z]);
    for (let k = 0; k < 3; k++) { if (p[k] < mn[k]) mn[k] = p[k]; if (p[k] > mx[k]) mx[k] = p[k]; }
  }
  return { mn: mn.map((v) => v - 10), mx: mx.map((v) => v + 10) };
}
const WB = worldBBox();
let badL = 0;
for (const q of L) {
  if (!q || !Array.isArray(q.p) || !q.p.every(Number.isFinite)) { badL++; continue; }
  if (!q.col || !q.col.every(Number.isFinite)) { badL++; continue; }
  if (!(q.range > 0 && q.range <= 60)) { badL++; continue; }
  if (!(q.int > 0 && q.int <= 6)) { badL++; continue; }
  for (let k = 0; k < 3; k++) {
    if (q.p[k] < WB.mn[k] || q.p[k] > WB.mx[k]) { badL++; break; }
  }
}
ok(badL === 0, badL + ' 盏点光的 range/int/颜色/位置不合理（须为 roomToWorld 后的世界坐标）');
ok(L.some((q) => q.range >= 30 && q.int >= 2.5), '没有一盏足够强的主灯（range≥30 且 int≥2.5）');

// ================================================================ 11 billboard
const BB = ctx.lanterns || [];
ok(BB.length <= 24, '静态 billboard 超过 24：' + BB.length);
ok(BB.length >= 6, '静态 billboard 太少（吊灯/壁灯/窗光）：' + BB.length);
let badBB = 0;
for (const q of BB) {
  if (!q || !Array.isArray(q.p) || !q.p.every(Number.isFinite)) { badBB++; continue; }
  if (!q.col || !q.col.every(Number.isFinite)) { badBB++; continue; }
  if (!(q.size > 0 && q.size <= 12)) { badBB++; continue; }
  if (!(q.alpha > 0.2 && q.alpha <= 0.95)) { badBB++; continue; }
  if (q.shape !== 0 && q.shape !== 1) badBB++;
  for (let k = 0; k < 3; k++) {
    if (q.p[k] < WB.mn[k] || q.p[k] > WB.mx[k]) { badBB++; break; }
  }
}
ok(badBB === 0, badBB + ' 个 billboard 的 size/alpha/shape/位置不合理');

// ================================================================ 12 可读陈设
const props = ctx.props && ctx.props.roomTearoom;
ok(!!props, 'ctx.props.roomTearoom 没有写');
ok(!!props && Number.isFinite(props.items), 'ctx.props.roomTearoom.items 不是数字');
ok(!!props && props.items >= 50, '可读陈设组数不足 50：' + (props && props.items));
ok(!!props && Math.abs(props.tris - nTri) < 1e-6, 'props.tris 与实际三角数不一致：' + (props && props.tris) + ' vs ' + nTri);

// ================================================================ 报告
const report = {
  room: R.name + ' / ' + R.en,
  tris: nTri, verts: s.verts, build_ms: buildMs,
  bbox: s.bbox,
  material: { bad: s.badMat, emissive: [0, 0.95], gloss: [0, 1] },
  deterministic: firstDiff === -1 && lenEq,
  openings: { entry_hits: ent, window_hits: win, above_door_hits: above, beside_door_hits: beside, floor_hits: fl, ceiling_hits: ce },
  lights: L.length,
  lanterns: BB.length,
  items: props && props.items,
};
console.log(JSON.stringify(report, null, 2));
if (fails.length) {
  console.log('FAIL\n - ' + fails.join('\n - '));
  process.exit(1);
}
console.log('PASS  roomTearoom: ' + nTri + ' tris, ' + s.verts + ' verts, bbox ' + JSON.stringify(s.bbox) +
  ', door/window open, ' + L.length + ' lights, ' + BB.length + ' billboards, ' + props.items + ' props, deterministic');
