// Geometry-only checks for ROUND 15 · ASTRA central core (no GL / no browser).
//   cd 01-source/astra && node tools/station-core-check.mjs
//
// 冻结契约 = src/station-core-plan.js：尺寸（CORE）、可飞射线（FLY_RAYS）、
// 中庭空腔（CAVITIES）、门洞探针（MOUTH_PROBES）、室内基线（NAVE_BASELINE）。
// 这个脚本真实构建两遍 buildStationCore（不启动浏览器），然后断言：
//   1. 三角预算 40,000..200,000（下限防 stub，上限是硬预算）
//   2. 包围盒 / NaN / 远点 / 矩阵栈 / 材质范围（emissive 0..1.2, gloss 0..1, min 0.015）
//   3. 北门洞是真开口：穿门射线能进中庭（首撞 z<0）、±80 m 平行射线命中鼓座外壳、
//      越过门洞上/下沿的两条斜射线被壳体挡住
//   4. 中庭可飞：绕鲸骨的环状空腔 0 顶点（并给 8 个方位的明细）；门→中庭中心的 6 条
//      直连射线 0 命中
//   5. 室内基线：中庭内顶点反照率中位 0.42..0.55、emissive≤0.16（星图/灯白名单 ≤0.35）
//   6. 点光 ≤8 且 range 60..400 / 颜色合理；发光窗（emissive≥0.6）≥60
//   7. 6 条辐条（60° 簇）、24 根经向肋（15° 簇）
//   8. 确定性：两次构建逐 float 相同
import { B } from '../src/engine.js';
import { buildStationCore } from '../src/station-core.js';
import { CORE, FLY_RAYS, CAVITIES, MOUTH_PROBES, CORE_BBOX, NAVE_BASELINE } from '../src/station-core-plan.js';

const DEG = Math.PI / 180;
const TRI_MIN = 40000, TRI_MAX = 200000;

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

// ---------------------------------------------------------------- build
function buildOnce(ctx) {
  const b = new B();
  buildStationCore(b, ctx);
  return b;
}
const ctx = { points: [], lanterns: [], props: {} };
const t0 = Date.now();
const b = buildOnce(ctx);
const buildMs = Date.now() - t0;
const nTri = b.i.length / 3;

function stats(bb) {
  const v = bb.v;
  let nan = 0, far = 0, badMat = 0, lowEm = 0, minEm = 9, maxEm = -9;
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < v.length; i += 11) {
    for (let k = 0; k < 3; k++) {
      const x = v[i + k];
      if (!Number.isFinite(x)) nan++;
      else { if (x < mn[k]) mn[k] = x; if (x > mx[k]) mx[k] = x; }
    }
    if (Math.abs(v[i]) > 3000 || Math.abs(v[i + 1]) > 3000 || Math.abs(v[i + 2]) > 3000) far++;
    const e = v[i + 9], g = v[i + 10];
    if (!Number.isFinite(e) || !Number.isFinite(g) || e < 0 || e > 1.2 || g < 0 || g > 1) badMat++;
    else { if (e < minEm) minEm = e; if (e > maxEm) maxEm = e; }
    if (e < 0.015) lowEm++;
  }
  let h = 2166136261;
  for (let i = 0; i < v.length; i += 7) h = Math.imul(h ^ Math.round(v[i] * 1024), 16777619) >>> 0;
  return {
    tris: bb.i.length / 3, verts: v.length / 11, nan, far, badMat, lowEm, minEm, maxEm, hash: h,
    bbox: { min: mn.map((x) => +x.toFixed(3)), max: mx.map((x) => +x.toFixed(3)) },
    stack: bb.stack.length, bad: bb.bad || 0, badColor: bb.badColor || 0, badNormal: bb.badNormal || 0,
    indexCount: bb.i.length,
  };
}
const s = stats(b);

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

// ---------------------------------------------------------------- cavity vert counter
const wrapPi = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
function cavityVerts(bb, cav) {
  const v = bb.v;
  let n = 0;
  for (let i = 0; i < v.length; i += 11) {
    const x = v[i], y = v[i + 1], z = v[i + 2];
    if (!(y > cav.y0 && y < cav.y1)) continue;
    const r = Math.hypot(x, z);
    if (cav.kind === 'ann') { if (r > cav.r0 && r < cav.r1) n++; }
    else if (cav.kind === 'cyl') { if (r < cav.r) n++; }
    else if (cav.kind === 'door') {
      if (r > cav.r0 && r < cav.r1) {
        const az = Math.abs(wrapPi(Math.atan2(x, z)));   // 距 +Z 的方位角（与本模块 P(a,r,y) 同约定）
        if (az < cav.azHalfDeg * DEG) n++;
      }
    }
  }
  return n;
}

// ================================================================ 1. 三角预算
ok(nTri >= TRI_MIN, 'core 三角数低于下限 ' + TRI_MIN + '：' + nTri + '（stub 未替换？）');
ok(nTri <= TRI_MAX, 'core 三角数超预算 ' + TRI_MAX + '：' + nTri);
ok(s.verts < 500000, '顶点数异常偏高：' + s.verts);

// ================================================================ 2. 卫生 + 包围盒 + 材质
ok(s.stack === 1, '矩阵栈泄漏：' + s.stack + '（push/pop 不配对）');
ok(s.nan === 0, '非有限坐标：' + s.nan);
ok(s.far === 0, '远点（>3000 m）：' + s.far);
ok(s.bad === 0, 'NaN 顶点：' + s.bad);
ok(s.badColor === 0, '坏颜色：' + s.badColor);
ok(s.badNormal === 0, '退化法线：' + s.badNormal);
ok(s.badMat === 0, '坏材质数组（emissive 0..1.2 / gloss 0..1）：' + s.badMat);
ok(s.lowEm === 0, 'emissive < 0.015 的死黑面：' + s.lowEm + '（太空没有环境光，最小 0.02）');
ok(s.minEm >= 0.02, '最小 emissive 低于 0.02：' + s.minEm);
const bb = s.bbox;
ok(bb.min[0] >= CORE_BBOX.min[0] && bb.max[0] <= CORE_BBOX.max[0], 'x 包围盒越界：' + JSON.stringify(bb));
ok(bb.min[2] >= CORE_BBOX.min[2] && bb.max[2] <= CORE_BBOX.max[2], 'z 包围盒越界：' + JSON.stringify(bb));
ok(bb.min[1] >= CORE_BBOX.min[1] && bb.max[1] <= CORE_BBOX.max[1], 'y 包围盒越界：' + JSON.stringify(bb));
ok(bb.max[1] >= 456, '塔顶灯塔缺失（max y=' + bb.max[1] + '）');
ok(bb.min[1] <= -296, '底部配重/引擎舱缺失（min y=' + bb.min[1] + '）');
{
  let maxR = 0;
  for (let i = 0; i < s.verts * 11; i += 11) maxR = Math.max(maxR, Math.hypot(b.v[i], b.v[i + 2]));
  ok(maxR >= 548, '辐条没有伸到环带内沿（最大水平半径 ' + maxR.toFixed(1) + '，应有 ~558）');
}

// ================================================================ 3. 北门洞是真开口
const flyRes = FLY_RAYS.map((r) => hits(b, [r[0], r[1], r[2]], [r[3], r[4], r[5]]));
const flyTotal = flyRes.reduce((a, c) => a + c, 0);
ok(flyTotal === 0, '可飞射线被挡住：' + flyTotal + ' 次命中 ' + JSON.stringify(flyRes));

const P = MOUTH_PROBES.portalThrough;
const tPortal = firstT(b, [P[0], P[1], P[2]], [P[3], P[4], P[5]]);
const zAt = tPortal < 0 ? null : +(P[2] + tPortal * (P[5] - P[2])).toFixed(2);
ok(tPortal >= 0, '穿门射线完全没命中（中庭没有内壁？）：' + tPortal);
ok(tPortal >= 0 && zAt !== null && zAt < 0, '穿门射线首撞在 z=' + zAt + '（应在中庭深处 z<0，说明门洞被封住了）');
// ±80 m 平行射线必须命中鼓座外壳
const offHits = [-1, 1].map((sx) => hits(b, [sx * MOUTH_PROBES.offsetX, MOUTH_PROBES.offsetFrom[1], MOUTH_PROBES.offsetFrom[2]],
  [sx * MOUTH_PROBES.offsetX, MOUTH_PROBES.offsetFrom[1], 0]));
ok(offHits[0] > 0 && offHits[1] > 0, '门洞外 ±80 m 的射线没有命中鼓座外壳：' + JSON.stringify(offHits));
// 门洞上/下沿的两条斜射线必须被挡住
const aboveHits = hits(b, [MOUTH_PROBES.above[0], MOUTH_PROBES.above[1], MOUTH_PROBES.above[2]],
  [MOUTH_PROBES.above[3], MOUTH_PROBES.above[4], MOUTH_PROBES.above[5]]);
const belowHits = hits(b, [MOUTH_PROBES.below[0], MOUTH_PROBES.below[1], MOUTH_PROBES.below[2]],
  [MOUTH_PROBES.below[3], MOUTH_PROBES.below[4], MOUTH_PROBES.below[5]]);
ok(aboveHits > 0, '越过门洞上沿的斜射线穿过了壳体（拱上墙有洞）：' + aboveHits);
ok(belowHits > 0, '低于门洞下沿的斜射线穿过了壳体（门槛基座有洞）：' + belowHits);

// ================================================================ 4. 中庭可飞（空腔）
const cavRes = CAVITIES.map((c) => ({ name: c.name, kind: c.kind, verts: cavityVerts(b, c) }));
const cavTotal = cavRes.reduce((a, c) => a + c.verts, 0);
ok(cavTotal === 0, '可飞空腔内有顶点：' + cavTotal + ' ' + JSON.stringify(cavRes));
// 8 个方位复核（环状空腔分扇区都不许有顶点）
const ann = CAVITIES.find((c) => c.kind === 'ann');
const annAz = [];
for (let k = 0; k < 8; k++) {
  const a = (k / 8) * Math.PI * 2;
  const half = (Math.PI * 2 / 8) * 0.5;
  let n = 0;
  const v = b.v;
  for (let i = 0; i < v.length; i += 11) {
    const y = v[i + 1];
    if (!(y > ann.y0 && y < ann.y1)) continue;
    const r = Math.hypot(v[i], v[i + 2]);
    if (!(r > ann.r0 && r < ann.r1)) continue;
    const az = Math.atan2(v[i], v[i + 2]);
    if (Math.abs(wrapPi(az - a)) < half) n++;
  }
  annAz.push(n);
}
ok(annAz.reduce((a, c) => a + c, 0) === 0, '环状空腔按 8 个方位复核仍有顶点：' + JSON.stringify(annAz));

// ================================================================ 5. 室内基线（反照率 / 自发光）
const NB = NAVE_BASELINE;
const lums = [];
const emIn = [];
let unlisted = 0;
const vv = b.v;
for (let i = 0; i < vv.length; i += 11) {
  const x = vv[i], y = vv[i + 1], z = vv[i + 2];
  if (!(y > NB.y0 && y < NB.y1)) continue;
  const r = Math.hypot(x, z);
  if (!(r < NB.r)) continue;
  const lum = 0.2126 * vv[i + 6] + 0.7152 * vv[i + 7] + 0.0722 * vv[i + 8];
  lums.push(lum);
  const e = vv[i + 9];
  emIn.push(e);
  if (e > NB.emissiveMax) {
    const wl =
      (y < NB.y0 + 2.6) ||                                  // 星图马赛克（贴地）
      (r < 30 && y < 92) ||                                 // 祭坛铜灯
      (r > 96 && r < 118 && y > 76 && y < 100) ||            // 环廊吊灯
      (r > 96 && r < 112 && y > 105 && y < 170);             // 风铃星灯
    if (!wl || e > NB.emissiveWhitelistMax) unlisted++;
  }
}
lums.sort((a, b2) => a - b2);
const med = lums.length ? lums[Math.floor(lums.length / 2)] : -1;
const maxEm = emIn.length ? Math.max(...emIn) : -1;
ok(lums.length > 2000, '中庭内顶点太少，统计不可信：' + lums.length);
ok(med >= NB.albedoMin && med <= NB.albedoMax, '中庭顶点反照率中位 ' + med.toFixed(3) + ' 不在 ' + NB.albedoMin + '..' + NB.albedoMax);
ok(maxEm <= NB.emissiveWhitelistMax, '中庭内 emissive 超过白名单上限 ' + NB.emissiveWhitelistMax + '：' + maxEm);
ok(unlisted === 0, '中庭内 ' + unlisted + ' 个非白名单顶点 emissive > ' + NB.emissiveMax);

// ================================================================ 6. 点光 + 发光窗
const L = ctx.points;
ok(L.length <= CORE.maxLights, '点光超过 8 盏：' + L.length);
ok(L.length >= 6, '点光太少（室内需要祭坛/星图/门厅/环廊/观星仪）：' + L.length);
let badL = 0;
for (const q of L) {
  if (!q.p || !Array.isArray(q.p) || !q.p.every(Number.isFinite)) { badL++; continue; }
  if (!q.col || !q.col.every(Number.isFinite)) { badL++; continue; }
  if (!(q.range >= 60 && q.range <= 400)) { badL++; continue; }
  if (!(q.int > 0 && q.int <= 1.2)) { badL++; continue; }
  if (q.p[0] < CORE_BBOX.min[0] || q.p[0] > CORE_BBOX.max[0]) badL++;
  if (q.p[1] < CORE_BBOX.min[1] || q.p[1] > CORE_BBOX.max[1]) badL++;
  if (q.p[2] < CORE_BBOX.min[2] || q.p[2] > CORE_BBOX.max[2]) badL++;
}
ok(badL === 0, badL + ' 盏点光的 range/颜色/位置不合理');
// 发光窗（emissive>=0.6 的面）
let winFaces = 0, winTris = 0;
for (let t = 0; t < b.i.length; t += 3) {
  const ia = b.i[t] * 11;
  if (b.v[ia + 9] >= 0.6) { winFaces++; winTris++; }
}
ok(winTris >= 60, '发光窗（emissive>=0.6 的面）只有 ' + winTris + ' 个，期望 ≥60');
ok(ctx.lanterns.length <= 96, '静态 billboard 过多：' + ctx.lanterns.length);
ok(ctx.lanterns.length >= 20, '静态 billboard 太少（信标/风铃/吊灯）：' + ctx.lanterns.length);

// ================================================================ 7. 辐条 6 条 / 经向肋 24 根
const AZ = [];
for (let i = 0; i < vv.length; i += 11) {
  const x = vv[i], y = vv[i + 1], z = vv[i + 2];
  const r = Math.hypot(x, z);
  if (y > -40 && y < 40 && r > 250 && r < 520) AZ.push((Math.atan2(x, z) * 180) / Math.PI);
}
// 按方位角统计：每 60° 一个簇，簇心（±10° 窗口内的圆均值）必须落在期望方位 ±1.5°
const spokeCounts = [], spokeCenters = [];
for (const ad of CORE.spokeAzDeg) {
  let sx = 0, sy = 0, n = 0;
  for (const a of AZ) {
    if (Math.abs(wrapPi((a - ad) * DEG)) >= 10 * DEG) continue;
    sx += Math.cos(a * DEG); sy += Math.sin(a * DEG); n++;
  }
  const c = n ? ((Math.atan2(sy, sx) * 180) / Math.PI + 360) % 360 : -999;
  const err = n ? Math.abs(((c - ad + 540) % 360) - 180) : 999;
  spokeCounts.push(n);
  spokeCenters.push(+err.toFixed(2));
}
ok(spokeCounts.every((n) => n > 500), '6 条辐条方位簇顶点不足（应有 6 个 60° 簇）：' + JSON.stringify(spokeCounts));
ok(spokeCenters.every((e) => e < 1.5), '辐条簇心偏离 60° 网格超过 1.5°：' + JSON.stringify(spokeCenters));
// 60° 之间的中点（30/90/...→ 实际是 0/60/...）不应有第二个簇
let midN = 0;
for (const ad of CORE.spokeAzDeg) {
  const mid = (ad + 30) % 360;
  for (const a of AZ) if (Math.abs(wrapPi((a - mid) * DEG)) < 3 * DEG) midN++;
}
ok(midN < AZ.length * 0.03, '两个辐条之间的中点方位有 ' + midN + ' 个顶点，可能存在多余辐条');
// 24 根经向肋：y 160..240、r > 局部穹顶半径 + 3.5 的顶点应当只落在 15° 的 24 个簇上
// 经向肋：y 160..240、r 大于局部穹顶半径+3.5 的顶点只应出现在 15° 的 24 个簇上
const ribPts = [];
let ribSel = 0;
for (let i = 0; i < vv.length; i += 11) {
  const x = vv[i], y = vv[i + 1], z = vv[i + 2];
  if (!(y > 160 && y < 240)) continue;
  const r = Math.hypot(x, z);
  // 到穹顶球心的距离：经向肋外凸 5.2 m，纬向肋只外凸 2.8 m → 取 +4.0 m 作筛选线
  const q = Math.hypot(r, y - CORE.domeY);
  if (q <= CORE.domeR + 4.0) continue;
  ribSel++;
  ribPts.push(((Math.atan2(x, z) * 180) / Math.PI + 360) % 360);
}
const ribCounts = [], ribErr = [];
for (let k = 0; k < 24; k++) {
  const want = k * 15;
  let sx = 0, sy = 0, n = 0;
  for (const a of ribPts) {
    if (Math.abs(wrapPi((a - want) * DEG)) >= 6.2 * DEG) continue;
    sx += Math.cos(a * DEG); sy += Math.sin(a * DEG); n++;
  }
  const c = n ? ((Math.atan2(sy, sx) * 180) / Math.PI + 360) % 360 : -999;
  ribErr.push(n ? +Math.abs(((c - want + 540) % 360) - 180).toFixed(2) : 999);
  ribCounts.push(n);
}
ok(ribSel > 300, '穹顶经向肋顶点太少（外壳/肋没建？）：' + ribSel);
ok(ribCounts.every((n) => n > 20), '24 根经向肋不是每 15° 一根：' + JSON.stringify(ribCounts));
ok(ribErr.every((e) => e < 1.5), '经向肋簇心偏离 15° 网格超过 1.5°：' + JSON.stringify(ribErr));
let ribMid = 0;
for (let k = 0; k < 24; k++) {
  const mid = k * 15 + 7.5;
  for (const a of ribPts) if (Math.abs(wrapPi((a - mid) * DEG)) < 1.5 * DEG) ribMid++;
}
ok(ribMid < ribSel * 0.02, '两根经向肋之间有额外肋（' + ribMid + '/' + ribSel + '）');

// ================================================================ 8. 确定性
const ctx2 = { points: [], lanterns: [], props: {} };
const b2 = buildOnce(ctx2);
let floatDiff = -1;
if (b2.v.length === b.v.length) {
  floatDiff = 0;
  for (let i = 0; i < b.v.length; i++) if (b.v[i] !== b2.v[i]) { floatDiff++; break; }
}
const s2 = stats(b2);
ok(b2.v.length === b.v.length, '顶点数不确定：' + b.v.length + ' vs ' + b2.v.length);
ok(floatDiff === 0, '顶点 float 不确定（首个不同处存在）');
ok(s2.tris === s.tris, '三角数不确定：' + s.tris + ' vs ' + s2.tris);
ok(s2.hash === s.hash, '顶点哈希不确定');
ok(JSON.stringify(s2.bbox) === JSON.stringify(bb), '包围盒不确定');

// ================================================================ 交接
const pc = ctx.props.core;
ok(!!pc, 'ctx.props.core 没有写');
ok(!!pc && !!pc.dome && pc.dome.r === CORE.domeR, 'ctx.props.core.dome 缺字段');
ok(!!pc && !!pc.mouth && pc.mouth.width > 100, 'ctx.props.core.mouth 缺字段');
ok(!!pc && !!pc.cradle && pc.cradle.len >= 40, 'ctx.props.core.cradle 缺字段');
ok(!!pc && Array.isArray(pc.spokes) && pc.spokes.length === 6, 'ctx.props.core.spokes 应 6 条');

// ================================================================ report
const report = {
  tris: s.tris, verts: s.verts, build_ms: buildMs,
  bbox: bb,
  materials: { minEmissive: +s.minEm.toFixed(3), maxEmissive: +s.maxEm.toFixed(3) },
  mouth: {
    width: CORE.mouth.width, height: CORE.mouth.height,
    fly_rays: { rays: FLY_RAYS.length, hits: flyRes },
    portal_first_hit_z: zAt,
    offset80_hits: offHits, above_hits: aboveHits, below_hits: belowHits,
  },
  cavities: cavRes,
  cavity_8az: annAz,
  nave: { verts: lums.length, albedo_median: +med.toFixed(3), emissive_max: maxEm, non_whitelist_emissive: unlisted },
  lights: L.length, lanterns: ctx.lanterns.length, emissive_windows: winTris,
  spokes: { az: CORE.spokeAzDeg, cluster_verts: spokeCounts, center_err_deg: spokeCenters },
  dome_ribs: { expected: 24, min_cluster: Math.min(...ribCounts), max_center_err_deg: Math.max(...ribErr), selected: ribSel },
  deterministic: floatDiff === 0 && s2.hash === s.hash,
};
console.log(JSON.stringify(report, null, 2));
if (fails.length) {
  console.log('FAIL\n - ' + fails.join('\n - '));
  process.exit(1);
}
console.log('PASS  station-core: ' + s.tris + ' tris, bbox ' + JSON.stringify(bb) + ', ' + FLY_RAYS.length + ' fly rays 0 hits, ' +
  CAVITIES.length + ' cavities 0 verts, portal open (first hit z=' + zAt + '), nave albedo med ' + med.toFixed(3) +
  ', ' + L.length + ' lights, ' + winTris + ' lit windows, ' + CORE.spokeAzDeg.length + ' spokes / 24 ribs, deterministic');
