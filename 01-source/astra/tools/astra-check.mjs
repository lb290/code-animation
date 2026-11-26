// 世界级体检（纯 node，不启动浏览器）：node tools/astra-check.mjs
// 检查的是"三个内容模块拼起来还是一个世界"：
//   1. 每个模块真的构建出东西（三角下限，防占位 stub 混过去）且不超预算
//   2. 世界总量 ≤ 900,000 tri
//   3. 顶点有限、不飞出世界、材质范围合法、最小 emissive 不出现死黑
//   4. 点光 ≤8/模块 且 range/int 合理；静态 billboard 的 shape 在 0..6
//   5. 两次构建逐 float 相同（确定性）—— rng 泄漏或 Date/Math.random 都会在这里失败
//   6. 观景点 10 个：坐标有限、离原点 ≤ 3400 m、fov 合法
import { B } from '../src/engine.js';
import { mulberry32 } from '../src/engine.js';
import { buildStationRing } from '../src/station-ring.js';
import { buildStationCore } from '../src/station-core.js';
import { buildSpaceProps } from '../src/space-props.js';
import { L, ST } from '../src/layout.js';

const FAIL = [];
const ok = (cond, msg) => { console.log((cond ? '  PASS ' : '  FAIL ') + msg); if (!cond) FAIL.push(msg); };
const fmt = (n) => Math.round(n).toLocaleString();

const MODULES = [
  { name: 'stationRing', fn: buildStationRing, min: 30000, max: 220000 },
  { name: 'stationCore', fn: buildStationCore, min: 40000, max: 200000 },
  { name: 'spaceProps', fn: buildSpaceProps, min: 8000, max: 130000 },
];
const WORLD_MAX = 900000;

function buildOne(mod) {
  const b = new B();
  const ctx = { points: [], lanterns: [], props: {}, failures: [] };
  mod.fn(b, ctx);
  return { b, ctx };
}

function stats(b) {
  const v = b.v;
  let nan = 0, far = 0, badMat = 0, dark = 0;
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  const emissives = [];
  for (let i = 0; i < v.length; i += 11) {
    for (let k = 0; k < 3; k++) {
      const x = v[i + k];
      if (!Number.isFinite(x)) { nan++; continue; }
      if (x < mn[k]) mn[k] = x;
      if (x > mx[k]) mx[k] = x;
    }
    if (Math.abs(v[i]) > 4000 || Math.abs(v[i + 1]) > 4000 || Math.abs(v[i + 2]) > 4000) far++;
    const e = v[i + 9], g = v[i + 10];
    if (!Number.isFinite(e) || !Number.isFinite(g) || e < 0 || e > 1.2 || g < 0 || g > 1) badMat++;
    else {
      emissives.push(e);
      if (e < 0.015) dark++;
    }
  }
  emissives.sort((a, c) => a - c);
  let h = 2166136261;
  for (let i = 0; i < v.length; i += 7) h = Math.imul(h ^ Math.round(v[i] * 1024), 16777619) >>> 0;
  return { tris: b.i.length / 3, verts: v.length / 11, nan, far, badMat, dark, mn, mx, h, emissives };
}

console.log('\n== ASTRA 世界体检 ==\n');
const total = { tris: 0, dark: 0, verts: 0 };
const seen = {};
for (const m of MODULES) {
  console.log('[' + m.name + ']');
  const a = buildOne(m);
  const sa = stats(a.b);
  const b2 = buildOne(m);
  const sb = stats(b2.b);
  seen[m.name] = { sa, ctx: a.ctx, sb };
  ok(sa.tris >= m.min && sa.tris <= m.max, m.name + ' 三角 ' + fmt(sa.tris) + ' ∈ [' + fmt(m.min) + ', ' + fmt(m.max) + ']');
  ok(sa.nan === 0, m.name + ' 无 NaN 顶点');
  ok(sa.far === 0, m.name + ' 顶点都在 ±4000 m 内（越界 ' + sa.far + '）');
  ok(sa.badMat === 0, m.name + ' 材质 [emissive,gloss] 合法（异常 ' + sa.badMat + '）');
  const darkPct = sa.verts ? (100 * sa.dark) / sa.verts : 0;
  ok(darkPct < 2.0, m.name + ' 死黑面占比 ' + darkPct.toFixed(2) + '% < 2%（最小 emissive 0.015）');
  ok(sa.h === sb.h, m.name + ' 两次构建逐 float 相同（确定性）');
  ok(a.ctx.points.length <= 8, m.name + ' 点光 ' + a.ctx.points.length + ' ≤ 8');
  let badPt = 0, badLt = 0;
  for (const p of a.ctx.points) {
    if (!Array.isArray(p.p) || p.p.some((x) => !Number.isFinite(x))) badPt++;
    else if (!(p.range > 0 && p.range <= 900)) badPt++;
    if (!(p.int > 0 && p.int <= 12)) badPt++;
  }
  for (const l of a.ctx.lanterns) {
    if (!Array.isArray(l.p) || l.p.some((x) => !Number.isFinite(x))) badLt++;
    else if (!(l.shape >= 0 && l.shape <= 6)) badLt++;
    else if (!(l.size > 0 && l.size < 400)) badLt++;
  }
  ok(badPt === 0, m.name + ' 点光参数合理（异常 ' + badPt + '）');
  ok(badLt === 0, m.name + ' static billboard 参数合理（shape 0..6 / size，异常 ' + badLt + '）');
  total.tris += sa.tris;
  total.verts += sa.verts;
  total.dark += sa.dark;
}

console.log('\n[世界]');
ok(total.tris <= WORLD_MAX, '世界静态三角 ' + fmt(total.tris) + ' ≤ ' + fmt(WORLD_MAX) + '（软上限）');
ok(Number.isFinite(ST.ringR) && ST.ringR === 600, '契约 ST.ringR=600（layout.js 单一事实源）');
ok(L.views.length === 10, '观景点 ' + L.views.length + ' 个（URL ?view= 与截图计划引用）');
let badView = 0;
for (const v of L.views) {
  const d = Math.hypot(v.pos[0], v.pos[1], v.pos[2]);
  if (!v.pos.every(Number.isFinite) || !v.look.every(Number.isFinite)) badView++;
  else if (d > 3400) badView++;
  else if (!(v.fov >= 30 && v.fov <= 100)) badView++;
  else if (Math.hypot(v.look[0] - v.pos[0], v.look[1] - v.pos[1], v.look[2] - v.pos[2]) < 1) badView++;
}
ok(badView === 0, '观景点坐标/fov/朝向合法（异常 ' + badView + '）');
ok(L.views[0].pos[2] > 1200, '观景点 0「画中初降」是远景（z>1200，坠入感）');

console.log('\n合计：' + fmt(total.tris) + ' tri / ' + fmt(total.verts) + ' verts；' +
  (FAIL.length ? 'FAIL ' + FAIL.length + ' 项' : '全部 PASS'));
process.exit(FAIL.length ? 1 : 0);
