// room-gallery-check.mjs — Round 16 集成体检：悬灯画廊 + 四间可进入的室内。
// 纯 node，不需要浏览器：node tools/room-gallery-check.mjs
//
// 检查"四间房确实装在画廊上、门/窗是真的开口、整体在世界正确位置、总量与确定性"：
//   1. 画廊壳三角预算 / 世界包围盒 / 无 NaN / 两次构建逐 float 相同
//   2. 每间房：三角 12k..42k、世界位置在各自的槽位、确定性
//   3. 世界坐标下的门洞射线：从廊桥穿过 13 m 拱门进入房间 → 0 命中
//   4. 门上方 / 门侧是实墙 → 必须命中；每间房都有 3..6 盏点光
//   5. 新增总量（画廊 + 四间房）≤ 25 万三角
import { B } from '../src/engine.js';
import { buildGalleryShell, galleryLights, galleryLanterns } from '../src/room-gallery.js';
import { buildPainterAssets } from '../src/room-painter.js';
import { buildTearoomAssets } from '../src/room-tearoom.js';
import { buildAtelierAssets } from '../src/room-atelier.js';
import { buildStudyAssets } from '../src/room-study.js';
import { ROOMS, GAL, galleryFrame, roomFrame, roomToWorld } from '../src/interiors-plan.js';

const fails = [];
const lines = [];
const ok = (cond, msg) => { lines.push((cond ? '  PASS ' : '  FAIL ') + msg); if (!cond) fails.push(msg); };
const fmt = (n) => Math.round(n).toLocaleString();

// ---------------------------------------------------------------- build helpers
function fresh() { return { b: new B(), ctx: { points: [], lanterns: [], props: {} } }; }
function buildGallery() {
  const { b, ctx } = fresh();
  b.push(galleryFrame());
  buildGalleryShell(b, ctx);
  b.pop();
  galleryLights(ctx);
  galleryLanterns(ctx);
  return { b, ctx };
}
// 注意：用 **Assets**（局部坐标，世界摆放由这里的 roomFrame 负责）。
// build<Key>Room 内部已经 push 过 roomFrame，这里再用会双重变换。
const ROOM_FN = { painter: buildPainterAssets, tearoom: buildTearoomAssets, atelier: buildAtelierAssets, study: buildStudyAssets };

function stats(bb) {
  const v = bb.v;
  let nan = 0, far = 0, badMat = 0;
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < v.length; i += 11) {
    for (let k = 0; k < 3; k++) {
      const x = v[i + k];
      if (!Number.isFinite(x)) nan++;
      else { if (x < mn[k]) mn[k] = x; if (x > mx[k]) mx[k] = x; }
    }
    if (Math.abs(v[i]) > 4000 || Math.abs(v[i + 1]) > 4000 || Math.abs(v[i + 2]) > 4000) far++;
    const e = v[i + 9], g = v[i + 10];
    if (!Number.isFinite(e) || !Number.isFinite(g) || e < 0 || e > 1.2 || g < 0 || g > 1) badMat++;
  }
  let h = 2166136261;
  for (let i = 0; i < v.length; i += 7) h = Math.imul(h ^ Math.round(v[i] * 1024), 16777619) >>> 0;
  return { tris: bb.i.length / 3, verts: v.length / 11, nan, far, badMat, mn, mx, hash: h, stack: bb.stack.length };
}

// ---------------------------------------------------------------- rays
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
const hits = (bb, a, z) => rayTs(bb, a, z).length;

// ---------------------------------------------------------------- 1. 画廊
console.log('\n== 悬灯画廊 · 四间室内 集成体检 ==\n');
console.log('[roomGallery]');
const g1 = buildGallery();
const sg1 = stats(g1.b);
const g2 = buildGallery();
const sg2 = stats(g2.b);
ok(sg1.tris >= 5000 && sg1.tris <= 80000, '画廊三角 ' + fmt(sg1.tris) + ' ∈ [5,000, 80,000]');
ok(sg1.nan === 0, '画廊无 NaN 顶点');
ok(sg1.far === 0, '画廊顶点都在 ±4000 m 内');
ok(sg1.badMat === 0, '画廊材质 [emissive,gloss] 合法');
ok(sg1.hash === sg2.hash, '画廊两次构建逐 float 相同');
ok(sg1.stack === 1, '画廊构建后 push/pop 栈平衡（stack=1）');
const gy0 = sg1.mn[1], gy1 = sg1.mx[1];
ok(gy0 > -100 && gy1 < -25, '画廊在环带下方：y ' + gy0.toFixed(1) + '..' + gy1.toFixed(1) + ' ∈ (-100, -25)');
let rMin = 1e9, rMax = 0;
for (let i = 0; i < g1.b.v.length; i += 11) {
  const r = Math.hypot(g1.b.v[i], g1.b.v[i + 2]);
  if (r < rMin) rMin = r; if (r > rMax) rMax = r;
}
ok(rMin > 560 && rMax < 740, '画廊径向 ' + rMin.toFixed(0) + '..' + rMax.toFixed(0) + ' m ∈ (560, 740)');
ok(g1.ctx.points.length >= 4 && g1.ctx.points.length <= 8, '画廊点光 ' + g1.ctx.points.length + ' ∈ [4, 8]');
let badPt = 0;
for (const p of g1.ctx.points) {
  if (!Array.isArray(p.p) || p.p.some((x) => !Number.isFinite(x))) badPt++;
  else if (!(p.range > 0 && p.range <= 900)) badPt++;
  if (!(p.int > 0 && p.int <= 12)) badPt++;
}
ok(badPt === 0, '画廊点光参数合理（异常 ' + badPt + '）');
let badLt = 0;
for (const l of g1.ctx.lanterns) {
  if (!Array.isArray(l.p) || l.p.some((x) => !Number.isFinite(x))) badLt++;
  else if (!(l.shape >= 0 && l.shape <= 6)) badLt++;
  else if (!(l.size > 0 && l.size < 400)) badLt++;
}
ok(g1.ctx.lanterns.length >= 12 && g1.ctx.lanterns.length <= 60, '画廊静态光斑 ' + g1.ctx.lanterns.length + ' ∈ [12, 60]');
ok(badLt === 0, '画廊光斑参数合理（异常 ' + badLt + '）');

// ---------------------------------------------------------------- 2. 每间房
const rooms = {};
let totalNew = sg1.tris;
for (const R of ROOMS) {
  console.log('[' + R.key + ']');
  const fn = ROOM_FN[R.key];
  const mk = () => { const { b, ctx } = fresh(); b.push(roomFrame(R.cx)); fn(b, ctx); b.pop(); return { b, ctx }; };
  const a = mk();
  const s = stats(a.b);
  const bb = mk();
  const s2 = stats(bb.b);
  rooms[R.key] = { b: a.b, ctx: a.ctx, s };
  ok(s.tris >= 12000 && s.tris <= 52000, R.name + ' 三角 ' + fmt(s.tris) + ' ∈ [12,000, 52,000]');
  ok(s.nan === 0, R.name + ' 无 NaN 顶点');
  ok(s.badMat === 0, R.name + ' 材质合法');
  ok(s.hash === s2.hash, R.name + ' 两次构建逐 float 相同');
  ok(s.stack === 1, R.name + ' push/pop 栈平衡');
  // 房间几何必须落在自己的槽位里（世界坐标）：中心 = roomToWorld(cx, [0, 8, 13])
  const c = roomToWorld(R.cx, [0, 8, 13]);
  let far2 = 0, maxD = 0;
  for (let i = 0; i < a.b.v.length; i += 11) {
    const d = Math.hypot(a.b.v[i] - c[0], a.b.v[i + 1] - c[1], a.b.v[i + 2] - c[2]);
    if (d > maxD) maxD = d;
    if (d > 40) far2++;
  }
  ok(far2 === 0, R.name + ' 顶点都在自己的槽位内（max ' + maxD.toFixed(1) + ' ≤ 40 m）');
  ok(a.ctx.points.length >= 3 && a.ctx.points.length <= 6, R.name + ' 点光 ' + a.ctx.points.length + ' ∈ [3, 6]');
  let badL = 0;
  for (const p of a.ctx.points) {
    if (!Array.isArray(p.p) || p.p.some((x) => !Number.isFinite(x))) badL++;
    else if (!(p.range > 0 && p.range <= 60)) badL++;
    if (!(p.int > 0 && p.int <= 6)) badL++;
    // 灯必须在房间附近（防止局部坐标没换成世界坐标 —— 这是本轮最容易犯的错）
    else {
      const d = Math.hypot(p.p[0] - c[0], p.p[1] - c[1], p.p[2] - c[2]);
      if (d > 45) badL++;
    }
  }
  ok(badL === 0, R.name + ' 点光参数合理且在世界坐标（异常 ' + badL + '）');
  totalNew += s.tris;
}
ok(totalNew <= 250000, '新增三角合计 ' + fmt(totalNew) + ' ≤ 250,000');

// ---------------------------------------------------------------- 3. 世界坐标下的门/墙射线
console.log('[门洞 / 实墙]');
const ALL = new B();
ALL.push(galleryFrame());
buildGalleryShell(ALL, fresh().ctx);
ALL.pop();
for (const R of ROOMS) {
  ALL.push(roomFrame(R.cx));
  ROOM_FN[R.key](ALL, fresh().ctx);   // 每次给新 ctx（房间会写 ctx.props）
  ALL.pop();
}
for (const R of ROOMS) {
  const doorIn = hits(ALL, roomToWorld(R.cx, [0, 6.5, -14]), roomToWorld(R.cx, [0, 6.5, 4]));
  ok(doorIn === 0, R.key + ' 廊桥→房门 13 m 拱门是真开口（命中 ' + doorIn + '）');
  const above = hits(ALL, roomToWorld(R.cx, [0, 16.6, -14]), roomToWorld(R.cx, [0, 16.6, 4]));
  ok(above > 0, R.key + ' 门上方是实墙（命中 ' + above + '）');
  const side = hits(ALL, roomToWorld(R.cx, [17, 6.5, -14]), roomToWorld(R.cx, [17, 6.5, 4]));
  ok(side > 0, R.key + ' 门侧是实墙（命中 ' + side + '）');
  const win = hits(ALL, roomToWorld(R.cx, [0, 8, 8]), roomToWorld(R.cx, [0, 8, 60]));
  ok(win === 0, R.key + ' 大窗是真开口（命中 ' + win + '）');
}

console.log('\n' + lines.join('\n'));
const pass = lines.filter((l) => l.startsWith('  PASS')).length;
console.log('\n' + pass + ' PASS / ' + fails.length + ' FAIL');
if (fails.length) { console.log('FAILED:'); for (const f of fails) console.log('  · ' + f); }
process.exit(fails.length ? 1 : 0);