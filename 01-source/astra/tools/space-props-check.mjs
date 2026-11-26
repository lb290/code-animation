// space-props-check.mjs — 太空环境道具（space-props.js）的几何体检（纯 node，不启动浏览器）
//   node tools/space-props-check.mjs
//
// 检查的是「站外道具」这条合同：
//   1. 三角预算 8,000 ≤ tri ≤ 130,000（防占位 stub 混过去，也防超预算）
//   2. 世界包围盒 / NaN / 远点 / 材质范围（emissive 0..1.2，最小 0.015，不许 0.0 死黑面）
//   3. 中心飞行球 r<420 与穹顶内腔（r<170, y 40..280）0 顶点
//   4. 观景点 1/2/3/4：相机前方 60 m 内没有飞船 / 小行星（包围球近似）
//   5. 星座鲸：总星点 ≥400、每头 ≥80、三头都在 1200–3500 m
//   6. 两次构建逐 float 相同（rng 泄漏 / Math.random / Date 都会在这里失败）
//   7. 点光 ≤8（range 60..400）、静态 billboard ≤1500
//   8. 结构：40–70 块小行星、3 艘货船（系泊 / 进港 / 远航）、6–10 个浮标（其中 2 个天线碟）、≥2 个远景姊妹站
//   9. 光尘 / 航行灯两个动态 billboard 系统可用（fill 推点数量正确）
import { B } from '../src/engine.js';
import { buildSpaceProps } from '../src/space-props.js';
import { L, ST } from '../src/layout.js';

const SEED_TAG = '0x57A11003';
const TRI_MIN = 8000, TRI_MAX = 130000;
const ENV = { xz: 4000, y: 1200 };
const fails = [];
let passes = 0;
const ok = (cond, msg) => {
  if (cond) { passes++; console.log('  PASS ' + msg); }
  else { fails.push(msg); console.log('  FAIL ' + msg); }
};
const fmt = (n) => Math.round(n).toLocaleString();
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// ---------------------------------------------------------------- build + stats
function build() {
  const b = new B();
  const ctx = { points: [], lanterns: [], props: {}, bbDyn: [], dyn: [], failures: [] };
  buildSpaceProps(b, ctx);
  return { b, ctx };
}
function stats(b) {
  const v = b.v;
  let nan = 0, far = 0, badMat = 0, dark = 0;
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < v.length; i += 11) {
    for (let k = 0; k < 3; k++) {
      const x = v[i + k];
      if (!Number.isFinite(x)) { nan++; }
      else { if (x < mn[k]) mn[k] = x; if (x > mx[k]) mx[k] = x; }
    }
    if (Math.abs(v[i]) > ENV.xz || Math.abs(v[i + 2]) > ENV.xz || Math.abs(v[i + 1]) > ENV.y) far++;
    const e = v[i + 9], g = v[i + 10];
    if (!Number.isFinite(e) || !Number.isFinite(g) || e < 0 || e > 1.2 || g < 0 || g > 1) badMat++;
    else if (e < 0.015) dark++;
  }
  let h = 2166136261;
  for (let i = 0; i < v.length; i += 7) h = Math.imul(h ^ Math.round(v[i] * 1024), 16777619) >>> 0;
  return { tris: b.i.length / 3, verts: v.length / 11, nan, far, badMat, dark, hash: h, mn, mx };
}
// 顶点落在「球 / 圆柱空腔」里的数量
function vertsInSphere(b, c, r) {
  const v = b.v;
  let n = 0;
  for (let i = 0; i < v.length; i += 11) {
    const dx = v[i] - c[0], dy = v[i + 1] - c[1], dz = v[i + 2] - c[2];
    if (dx * dx + dy * dy + dz * dz < r * r) n++;
  }
  return n;
}
function vertsInDome(b) {
  const v = b.v;
  let n = 0;
  for (let i = 0; i < v.length; i += 11) {
    const y = v[i + 1];
    if (!(y > 40 && y < 280)) continue;
    const r = Math.hypot(v[i], v[i + 2]);
    if (r < 170) n++;
  }
  return n;
}

console.log('\n== ASTRA 太空道具体检（space-props.js）==\n');
const A = build();
const S = stats(A.b);
const plan = A.ctx.props && A.ctx.props.props;

// ---------------------------------------------------------------- 1. 三角预算
console.log('[预算]');
ok(S.tris >= TRI_MIN, '三角 ' + fmt(S.tris) + ' ≥ ' + fmt(TRI_MIN) + '（不是占位 stub）');
ok(S.tris <= TRI_MAX, '三角 ' + fmt(S.tris) + ' ≤ ' + fmt(TRI_MAX) + '（本模块预算）');
ok(S.verts < 200000, '顶点 ' + fmt(S.verts) + ' 没有异常膨胀');

// ---------------------------------------------------------------- 2. 包围盒 / NaN / 材质
console.log('[世界包围盒与卫生]');
const bb = { min: S.mn.map((x) => +x.toFixed(1)), max: S.mx.map((x) => +x.toFixed(1)) };
ok(S.nan === 0, '无 NaN / 非有限顶点');
ok(S.far === 0, '所有顶点 |x|,|z| ≤ ' + ENV.xz + '、|y| ≤ ' + ENV.y + '（越界 ' + S.far + '） bbox=' + JSON.stringify(bb));
ok(S.badMat === 0, '材质 [emissive, gloss] 合法（异常 ' + S.badMat + '）');
ok(S.dark === 0, '没有 emissive < 0.015 的死黑面（' + S.dark + ' 个）');
ok(A.b.stack.length === 1, '矩阵 push/pop 配对（栈深 ' + A.b.stack.length + '）');
ok(!A.b.badNormal && !A.b.bad && !A.b.badColor, '没有退化法线 / NaN / 坏颜色顶点（bad=' + (A.b.bad || 0) + ', badNormal=' + (A.b.badNormal || 0) + ', badColor=' + (A.b.badColor || 0) + '）');

// ---------------------------------------------------------------- 3. 中心飞行球 / 穹顶内腔
console.log('[飞行空腔]');
const centerVerts = vertsInSphere(A.b, [0, 0, 0], 420);
const domeVerts = vertsInDome(A.b);
ok(centerVerts === 0, '环站中心 r<420 m 飞行球内 0 顶点（实际 ' + centerVerts + '）');
ok(domeVerts === 0, '穹顶内腔（r<170, y 40..280）0 顶点（实际 ' + domeVerts + '）');

// ---------------------------------------------------------------- 4. 观景点遮挡
console.log('[观景点遮挡]');
ok(!!plan, 'ctx.props.props 交接存在（ships / whales / asteroids / buoys）');
const ships = (plan && plan.ships) || [];
const rocks = (plan && plan.asteroidList) || [];
let worst = { name: '', d: 1e9, r: 0, view: -1 };
const blockFails = [];
for (const vi of [1, 2, 3, 4]) {
  const vw = L.views[vi];
  const d = [vw.look[0] - vw.pos[0], vw.look[1] - vw.pos[1], vw.look[2] - vw.pos[2]];
  const dl = Math.hypot(d[0], d[1], d[2]);
  const p60 = [vw.pos[0] + (d[0] / dl) * 60, vw.pos[1] + (d[1] / dl) * 60, vw.pos[2] + (d[2] / dl) * 60];
  for (const s of ships) {
    const gap = dist(p60, s.p) - s.radius;
    if (gap < worst.d) worst = { name: s.name, d: gap, r: s.radius, view: vi };
    if (gap < 0) blockFails.push('view' + vi + ' 被 ' + s.name + ' 挡住（负间隙 ' + gap.toFixed(1) + ' m）');
  }
  for (const r of rocks) {
    const gap = dist(p60, r.p) - r.radius;
    if (gap < worst.d) worst = { name: '小行星', d: gap, r: r.radius, view: vi };
    if (gap < 0) blockFails.push('view' + vi + ' 被小行星挡住（负间隙 ' + gap.toFixed(1) + ' m）');
  }
}
ok(blockFails.length === 0, '观景点 1/2/3/4 前方 60 m 无飞船/小行星（最小间隙 ' + worst.d.toFixed(1) + ' m，最近 ' + worst.name + ' / view' + worst.view + '）');
// 观景点 200 m 内且挡在画面中央（±15°）也不行
const nearFails = [];
for (const vi of [0, 1, 2, 3, 4, 9]) {
  const vw = L.views[vi];
  const fwdLen = Math.hypot(vw.look[0] - vw.pos[0], vw.look[1] - vw.pos[1], vw.look[2] - vw.pos[2]);
  const fwd = [(vw.look[0] - vw.pos[0]) / fwdLen, (vw.look[1] - vw.pos[1]) / fwdLen, (vw.look[2] - vw.pos[2]) / fwdLen];
  for (const s of ships) {
    const rel = [s.p[0] - vw.pos[0], s.p[1] - vw.pos[1], s.p[2] - vw.pos[2]];
    const dd = Math.hypot(rel[0], rel[1], rel[2]);
    if (dd > 200 + s.radius) continue;
    const depth = rel[0] * fwd[0] + rel[1] * fwd[1] + rel[2] * fwd[2];
    if (depth <= 0) continue;
    const ang = Math.acos(Math.min(1, depth / dd)) * 180 / Math.PI;
    if (ang < 15) nearFails.push('view' + vi + ' 的 ' + s.name + ' 离机位 ' + dd.toFixed(0) + ' m 且偏离 ' + ang.toFixed(1) + '°');
  }
}
ok(nearFails.length === 0, '机位 200 m 内没有挡住画面中央（±15°）的飞船（' + (nearFails.join('；') || '无') + '）');

// ---------------------------------------------------------------- 5. 星座鲸
console.log('[星座鲸]');
const whales = (plan && plan.whales) || [];
const whaleStars = whales.reduce((a, w) => a + w.lanterns, 0);
ok(whales.length >= 2 && whales.length <= 3, '星座鲸 ' + whales.length + ' 头（2–3）');
ok(whaleStars >= 400, '星座鲸星点合计 ' + whaleStars + ' ≥ 400');
ok(whales.every((w) => w.lanterns >= 80), '每头鲸 ≥80 星点（' + whales.map((w) => w.lanterns).join(' / ') + '）');
const whaleDist = whales.map((w) => w.dist);
ok(whaleDist.every((d) => d >= 1200 && d <= 3500), '三头鲸都在 1200–3500 m（' + whaleDist.map((d) => Math.round(d)).join(' / ') + '）');
ok(whales.every((w) => w.len >= 600 && w.len <= 1000), '鲸体长 600–1000 m（' + whales.map((w) => w.len).join(' / ') + '）');

// ---------------------------------------------------------------- 6. 确定性
console.log('[确定性]');
const B2 = build();
const S2 = stats(B2.b);
let firstDiff = -1;
if (B2.b.v.length !== A.b.v.length) firstDiff = -2;
else for (let i = 0; i < A.b.v.length; i++) if (A.b.v[i] !== B2.b.v[i]) { firstDiff = i; break; }
ok(A.b.v.length === B2.b.v.length, '两次构建顶点数相同（' + A.b.v.length + ' / ' + B2.b.v.length + '）');
ok(firstDiff === -1, '两次构建逐 float 相同' + (firstDiff >= 0 ? '（第 ' + firstDiff + ' 个 float 开始不同）' : ''));
ok(S.hash === S2.hash, '顶点哈希相同（' + S.hash + '）');
ok(A.ctx.lanterns.length === B2.ctx.lanterns.length && A.ctx.points.length === B2.ctx.points.length, '星点 / 点光数量确定（' + A.ctx.lanterns.length + ' / ' + A.ctx.points.length + '）');

// ---------------------------------------------------------------- 7. 点光 / billboard
console.log('[灯光与 billboard]');
ok(A.ctx.points.length <= 8, '点光 ' + A.ctx.points.length + ' ≤ 8');
ok(A.ctx.points.length >= 3, '点光 ' + A.ctx.points.length + ' ≥ 3（尾焰 / 对接环 / 浮标）');
let badLight = 0;
for (const q of A.ctx.points) {
  if (!q.p || q.p.some((x) => !Number.isFinite(x))) badLight++;
  else if (!q.col || q.col.some((x) => !Number.isFinite(x))) badLight++;
  else if (!(q.range >= 60 && q.range <= 400)) badLight++;
  else if (!(q.int > 0 && q.int <= 6)) badLight++;
}
ok(badLight === 0, '点光参数合理（range 60..400、强度 0..6；异常 ' + badLight + '）');
ok(A.ctx.lanterns.length <= 1500, '静态 billboard ' + A.ctx.lanterns.length + ' ≤ 1500');
let badLt = 0;
for (const s of A.ctx.lanterns) {
  if (!s.p || s.p.some((x) => !Number.isFinite(x))) badLt++;
  else if (!(s.shape >= 0 && s.shape <= 6)) badLt++;
  else if (!(s.size > 0 && s.size < 400)) badLt++;
  else if (!(s.alpha >= 0 && s.alpha <= 1)) badLt++;
  else if (!s.col || s.col.some((x) => !Number.isFinite(x))) badLt++;
}
ok(badLt === 0, '静态 billboard 参数合理（shape 0..6 / size / alpha；异常 ' + badLt + '）');

// ---------------------------------------------------------------- 8. 结构
console.log('[结构内容]');
ok(plan && plan.asteroids >= 40 && plan.asteroids <= 70, '小行星 ' + (plan && plan.asteroids) + ' 块 ∈ [40, 70]');
ok(rocks.length >= plan.asteroids, '碎屑记录 ' + rocks.length + ' 条 ≥ 主岩体数（含碎屑）');
// 小行星的 y 分布：下带 / 上带 / 远散
const below = rocks.filter((r) => r.p[1] < -300).length;
const above = rocks.filter((r) => r.p[1] > 250).length;
ok(below >= 15 && above >= 12, '下带 ' + below + ' 块 / 上带 ' + above + ' 块（漂移带真的存在）');
ok(ships.length === 3, '货运飞船 3 艘（' + ships.map((s) => s.name).join('、') + '）');
const dockShip = ships.find((s) => dist(s.p, [0, 0, -760]) < 220);
ok(!!dockShip, '有 1 艘系泊在对接港附近 (<220 m of (0,0,-760))' + (dockShip ? '：' + dockShip.name : ''));
const approach = ships.find((s) => s.dist >= 700 && s.dist <= 1100);
ok(!!approach, '有 1 艘在 700–1100 m 缓慢接近' + (approach ? '（' + Math.round(approach.dist) + ' m）' : ''));
const farShip = ships.find((s) => s.dist > 2000);
ok(!!farShip, '有 1 艘 >2000 m 的远景剪影' + (farShip ? '（' + Math.round(farShip.dist) + ' m）' : ''));
const buoys = (plan && plan.buoys) || [];
ok(buoys.length >= 6 && buoys.length <= 10, '探针浮标 ' + buoys.length + ' 个 ∈ [6, 10]');
ok(buoys.filter((b) => b.dish).length === 2, '其中 2 个带天线碟（' + buoys.filter((b) => b.dish).length + '）');
ok(buoys.every((b) => b.dist > ST.ringR * 0.6 + 50), '浮标都在环站外围（最小半径 ' + Math.round(Math.min(...buoys.map((b) => b.dist))) + ' m）');
const sisters = (plan && plan.sisters) || [];
ok(sisters.length >= 2, '远景姊妹站 ' + sisters.length + ' 个');
ok(sisters.every((s) => s.dist > 3000 && Math.abs(s.p[0]) <= 4000 && Math.abs(s.p[2]) <= 4000), '姊妹站都在 >3000 m 且不越出世界包围盒');

// ---------------------------------------------------------------- 9. 动态 billboard（光尘 / 航行灯）
console.log('[动态 billboard]');
const dyn = A.ctx.bbDyn || [];
ok(dyn.length >= 2, '动态 billboard 系统 ' + dyn.length + ' 个（光尘 + 航行灯闪烁）');
const dust = dyn.find((d) => d.name === 'dust');
const beacons = dyn.find((d) => d.name === 'beacons');
ok(!!dust && dust.additive === true, '光尘系统存在且 additive');
let dustCount = 0;
if (dust) dust.fill(2.5, { add() { dustCount++; } }, 0.016);
ok(dustCount >= 400 && dustCount <= 600, '光尘点 ' + dustCount + ' ∈ [400, 600]');
let beaconCount = 0;
if (beacons) beacons.fill(2.5, { add() { beaconCount++; } }, 0.016);
ok(beaconCount >= 8 && beaconCount <= 40, '航行灯闪烁点 ' + beaconCount + ' ∈ [8, 40]');
let badCol = 0;
if (dust) dust.fill(1.0, { add(x, y, z, s, r, al, sh, col) { if (col.some((c) => !Number.isFinite(c))) badCol++; } }, 0.016);
ok(badCol === 0, '光尘颜色有限');
ok(A.ctx.props && A.ctx.props.props.motes === 500, 'ctx.props 交接记录了光尘数量');

// ---------------------------------------------------------------- 汇总
const TRI_NOTE = fmt(S.tris) + ' tri';
console.log('\n' + passes + ' PASS / ' + fails.length + ' FAIL  ·  ' + TRI_NOTE + ' / ' + fmt(S.verts) + ' verts  ·  ' +
  A.ctx.points.length + ' 点光 / ' + A.ctx.lanterns.length + ' billboard  ·  seed ' + SEED_TAG);
if (fails.length) {
  console.log('\nFAIL 项：');
  for (const f of fails) console.log('  - ' + f);
  process.exit(1);
}
console.log('space-props: 全部 PASS');
process.exit(0);
