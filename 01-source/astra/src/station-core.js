// station-core.js — ROUND 15 · 星鲸环 ASTRA 的中央核心
// OWNER: agent "core".  冻结契约：src/station-core-plan.js（CORE / FLY_RAYS / CAVITIES）
//
// 造什么（自上而下）：
//   · 脊柱塔：-300..-60 下段配重/引擎舱（配重环 / 4 个推进喷口 / 散热板 / 舷窗）；
//     -60..60 中段枢纽（6 个黄铜对接环 + 腰线 + 青绿灯带）；
//     66..460 上段：鼓座柱廊 → 玻璃肋穹顶 → 6 道塔肋 → 尖塔 → 顶部灯塔。
//   · 6 条辐条交通管（30/90/150/210/270/330°）：桁架肋环、三排窗、两侧管束、外挂 3 个胶囊舱。
//   · 北门洞（+Z）：真开口 110 m 宽 × 72 m 高，门套 / 雨棚 / 两根导向灯柱。
//   · 穹顶中庭内景：同心圆铺装 + 星图马赛克、黄铜鲸骨（6 根吊索）、祭坛台阶 8 铜灯、
//     y=96 环形回廊（栏杆 / 吊灯 / 长凳 / 花池 / 旗帜）、4 座黄铜观星仪、12 串风铃。
//
// 美术基线：象牙白船壳 + 黄铜饰线 + 高拱窗暖光 + 青绿灯带；比例高大、轮廓可读、近看有细节。
// 材质 mat=[emissive, gloss]（lit.fs）；任何面 emissive >= 0.02（太空无环境光，死黑会烂掉）。
// 确定性：自有 mulberry32(0x57a11002)，同一份源码两次构建逐 float 相同；不接收共享 rng。
import {
  mulberry32, TAU, m4, clamp, lerp, norm, sub, cross, add, scale as vs, dot,
  mixc, mulc, rgb, box, cylinder, lathe, torus, sphere, ribbon, bar3,
  ellipsoid, tubePath, disc, extrudeXZ, radialSlabs, catmullPts, bez3,
} from './engine.js';
import { C } from './palette.js';
import { ST } from './layout.js';
import { CORE } from './station-core-plan.js';

const PI = Math.PI;
const DEG = PI / 180;
const SEED = CORE.seed;

// ---------------------------------------------------------------- 局部色板
// 色板文件归 lead 所有，模块内新颜色在这里定义（线性空间，注释给 hex）。
const IV = C.ivory, IVS = C.ivoryShade, IVD = C.ivoryDark;      // #e8e2d2 / #c3bcaa / #9c9585
const BR = C.brass, BRH = C.brassHi, BRD = C.brassDark;          // #d9a955 / #f2d69a / #8a6a34
const STL = C.steel, STLD = C.steelDark;                        // #5c6478 / #2b3040
const PNL = C.panel, PNLD = C.panelDark, PNDP = C.panelDeep;     // #8e93a3 / #4a4f63 / #2b3040
const GL = C.glass, GLD = C.glassDeep, GF = C.glassFrame;        // #a8d8f0 / #4a7fa8 / #e6eef8
const WARM = C.warmGlow, AMB = C.amber, CY = C.cyanGlow, CYD = C.cyan;  // #ffd9a0 / #f0b24a / #7ff0dc / #4fd6c8
const EM = C.ember;
// 内景专用（线性反照率 ≈0.40–0.55，满足「中庭反照率中位 0.42–0.55」基线）
const NAVE_IV = rgb('#c8b69c');       // 暖砂岩象牙（线性亮度 0.48）
const NAVE_ST = rgb('#b5a58c');       // 暖石（0.39）
const NAVE_MB = rgb('#cdbf9f');       // 暖大理石（0.53）
const FLOOR_A = rgb('#b8ac97');       // 铺装浅（0.42）
const FLOOR_B = rgb('#c4b8a0');       // 铺装深（0.49）
const FLOOR_D = rgb('#a99f8c');       // 铺装缝（0.35，少量）
const BR_IN = rgb('#d4ac68');         // 内景黄铜（线性亮度 0.445）
const BR_MID = rgb('#b98a3f');        // 内景暗黄铜（0.289，鲸骨/吊索用）
const GL_IN = rgb('#8399a8');         // 穹顶内视玻璃（0.36）
const GL_IN2 = rgb('#6b8093');        // 穹顶内视玻璃暗部（0.28）
const PIPE_COL = rgb('#7e8798');      // 管束灰蓝
const HEAT = rgb('#5d4a3e');          // 散热板背部暗铜

// ---------------------------------------------------------------- 材质（emissive, gloss）
const M_HULL = [0.022, 0.34];         // 象牙白船壳
const M_HULL2 = [0.026, 0.30];        // 船壳次色
const M_PANEL = [0.024, 0.26];        // 深色面板
const M_PANEL2 = [0.030, 0.22];
const M_BRASS = [0.060, 0.86];        // 黄铜
const M_BRASSD = [0.042, 0.60];
const M_STEEL = [0.030, 0.52];
const M_STEELD = [0.026, 0.40];
const M_GLASS = [0.160, 0.95];        // 穹顶外视玻璃
const M_GLASSI = [0.120, 0.82];       // 穹顶内视玻璃（室内 ≤0.16）
const M_WIN = [0.850, 0.10];          // 舷窗暖光（外部/塔身）
const M_WIN_I = [0.680, 0.10];        // 中庭内的大窗（压暗一档，避免中庭过曝）
const M_WIN2 = [0.700, 0.12];
const M_CYAN = [0.950, 0.05];         // 青绿灯带
const M_TEAL = [0.820, 0.08];
const M_STONE = [0.020, 0.16];        // 石/混凝土
const M_MARBLE = [0.070, 0.22];
const M_NAVE = [0.062, 0.20];         // 内景石材（压暗自发光，靠点光塑形）
const M_NAVE2 = [0.048, 0.18];
const M_MOSAIC = [0.185, 0.26];       // 星图马赛克（白名单 ≤0.35）
const M_LAMP = [0.300, 0.12];         // 铜灯灯芯（白名单 ≤0.35）
const M_LAMP2 = [0.250, 0.10];
const M_BRASS_IN = [0.120, 0.86];     // 内景黄铜（鲸骨等）
const M_GLOWD = [0.140, 0.10];        // 内景弱发光（观星仪刻度环，≤0.16 不需白名单）
// 舷窗暖光：比 C.warmGlow 更琥珀，避免 emissive*3 之后被 tonemap 冲成纯白
const PANE = mixc(C.warmGlow, C.amber, 0.55);   // ≈ #f5bb62
const PANE2 = mixc(C.warmGlow, C.ember, 0.40);  // ≈ #ffb070
const M_LEAF = [0.035, 0.14];
const M_MOSS = [0.030, 0.10];
const M_DARK = [0.040, 0.14];

// ---------------------------------------------------------------- 小工具
const T = (x, y, z) => m4.translate([x, y, z]);
const RY = (a) => m4.rotY(a);
const RX = (a) => m4.rotX(a);
const RZ = (a) => m4.rotZ(a);
function at(b, x, y, z, fn) { b.push(T(x, y, z)); fn(); b.pop(); }
function atAz(b, a, fn) { b.push(RY(a)); fn(); b.pop(); }
function atYaw(b, x, y, z, a, fn) { b.push(T(x, y, z)); b.push(RY(a)); fn(); b.pop(); b.pop(); }
function wrapPi(a) { while (a > PI) a -= TAU; while (a < -PI) a += TAU; return a; }

// 方位 a（0 = +Z 朝 +X 增大）：P/NR/TG
const P = (a, r, y) => [Math.sin(a) * r, y, Math.cos(a) * r];
const NRm = (a) => [Math.sin(a), 0, Math.cos(a)];
const TGm = (a) => [Math.cos(a), 0, -Math.sin(a)];
const scl = (v, s) => [v[0] * s, v[1] * s, v[2] * s];

// 圆柱面一条带（外法线 side=+1 / 内法线 -1）
function cylF(b, r, y0, y1, a0, a1, n, col, mat, side = 1, colFn) {
  for (let i = 0; i < n; i++) {
    const t0 = a0 + (a1 - a0) * (i / n), t1 = a0 + (a1 - a0) * ((i + 1) / n), tm = (t0 + t1) / 2;
    const c = colFn ? colFn(tm, i) : col;
    b.quad(P(t0, r, y0), P(t1, r, y0), P(t1, r, y1), P(t0, r, y1), c, mat, scl(NRm(tm), side));
  }
}
// 水平环带（r0 = 0 时退化为扇面）
function ringF(b, r0, r1, y, a0, a1, n, col, mat, ny = 1, colFn) {
  const N = [0, ny, 0];
  for (let i = 0; i < n; i++) {
    const t0 = a0 + (a1 - a0) * (i / n), t1 = a0 + (a1 - a0) * ((i + 1) / n);
    const c = colFn ? colFn((t0 + t1) / 2, i) : col;
    if (r0 < 1e-4) b.tri([0, y, 0], P(t1, r1, y), P(t0, r1, y), c, mat, N, N, N);
    else b.quad(P(t0, r0, y), P(t1, r0, y), P(t1, r1, y), P(t0, r1, y), c, mat, N);
  }
}
// 矩形截面环带（可关某些面；skip 可挖扇区）
function bandF(b, rIn, rOut, y0, y1, a0, a1, n, col, mat, o = {}) {
  const top = o.topCol || mulc(col, 1.10), bot = o.botCol || mulc(col, 0.62);
  const oc = o.outCol || col, ic = o.inCol || mulc(col, 0.82);
  for (let i = 0; i < n; i++) {
    const t0 = a0 + (a1 - a0) * (i / n), t1 = a0 + (a1 - a0) * ((i + 1) / n), tm = (t0 + t1) / 2;
    if (o.skip && o.skip(tm)) continue;
    if (!o.noTop) b.quad(P(t0, rIn, y1), P(t1, rIn, y1), P(t1, rOut, y1), P(t0, rOut, y1), top, mat, [0, 1, 0]);
    if (!o.noBot) b.quad(P(t0, rIn, y0), P(t1, rIn, y0), P(t1, rOut, y0), P(t0, rOut, y0), bot, mat, [0, -1, 0]);
    if (!o.noOut) b.quad(P(t0, rOut, y0), P(t1, rOut, y0), P(t1, rOut, y1), P(t0, rOut, y1), oc, mat, NRm(tm));
    if (!o.noIn) b.quad(P(t0, rIn, y0), P(t1, rIn, y0), P(t1, rIn, y1), P(t0, rIn, y1), ic, mat, scl(NRm(tm), -1));
  }
}
// 局部 XY 平面内的环（法线 +-Z），用于放射状法兰
function ringXY(b, r0, r1, z, n, col, mat, nz = 1, colFn) {
  const N = [0, 0, nz];
  const PP = (t, r) => [Math.cos(t) * r, Math.sin(t) * r, z];
  for (let i = 0; i < n; i++) {
    const t0 = (i / n) * TAU, t1 = ((i + 1) / n) * TAU;
    const c = colFn ? colFn((t0 + t1) / 2, i) : col;
    if (r0 < 1e-4) b.tri([0, 0, z], PP(t1, r1), PP(t0, r1), c, mat, N, N, N);
    else b.quad(PP(t0, r0), PP(t1, r0), PP(t1, r1), PP(t0, r1), c, mat, N);
  }
}
// 局部 Z 轴向的圆筒（用于放射状法兰/管）
function cylZ(b, r0, r1, z0, z1, n, col, mat, side = 1) {
  const PP = (t, r, z) => [Math.cos(t) * r, Math.sin(t) * r, z];
  for (let i = 0; i < n; i++) {
    const t0 = (i / n) * TAU, t1 = ((i + 1) / n) * TAU, tm = (t0 + t1) / 2;
    b.quad(PP(t0, r0, z0), PP(t1, r0, z0), PP(t1, r1, z1), PP(t0, r1, z1), col, mat,
      scl([Math.cos(tm), Math.sin(tm), 0], side));
  }
}
// 沿折线扫掠矩形截面（塔肋 / 斜撑）；w/h 可为数字或 f(t)
function beamPath(b, pts, wF, hF, col, mat, o = {}) {
  const n = pts.length;
  const up = o.up || [0, 1, 0];
  const frames = [];
  for (let i = 0; i < n; i++) {
    const pa = pts[Math.max(0, i - 1)], pc = pts[Math.min(n - 1, i + 1)];
    const t = norm(sub(pc, pa));
    let s = cross(t, up);
    if (Math.hypot(s[0], s[1], s[2]) < 1e-4) s = cross(t, [1, 0, 0]);
    s = norm(s);
    const u = norm(cross(s, t));
    const w = (typeof wF === 'function' ? wF(i / (n - 1)) : wF) / 2;
    const h = (typeof hF === 'function' ? hF(i / (n - 1)) : hF) / 2;
    frames.push({ p: pts[i], s, u, t, w, h });
  }
  const corner = (f, si, ui) => [
    f.p[0] + f.s[0] * f.w * si + f.u[0] * f.h * ui,
    f.p[1] + f.s[1] * f.w * si + f.u[1] * f.h * ui,
    f.p[2] + f.s[2] * f.w * si + f.u[2] * f.h * ui,
  ];
  const shade = o.shade || 1;
  for (let i = 0; i < n - 1; i++) {
    const f0 = frames[i], f1 = frames[i + 1];
    const sides = [[1, 1, 1, -1], [-1, -1, -1, 1], [1, 1, -1, -1], [-1, -1, -1, -1]];
    // +s 面 / -s 面 / +u 面 / -u 面
    const faces = [
      [f0.s, corner(f0, 1, 1), corner(f0, 1, -1), corner(f1, 1, -1), corner(f1, 1, 1)],
      [scl(f0.s, -1), corner(f0, -1, 1), corner(f1, -1, 1), corner(f1, -1, -1), corner(f0, -1, -1)],
      [f0.u, corner(f0, -1, 1), corner(f0, 1, 1), corner(f1, 1, 1), corner(f1, -1, 1)],
      [scl(f0.u, -1), corner(f0, 1, -1), corner(f0, -1, -1), corner(f1, -1, -1), corner(f1, 1, -1)],
    ];
    void sides;
    for (let k = 0; k < 4; k++) {
      const F = faces[k];
      const cc = k < 2 ? mulc(col, shade) : mulc(col, k === 2 ? 1.08 * shade : 0.82 * shade);
      b.quad(F[1], F[2], F[3], F[4], cc, mat, F[0]);
    }
  }
  if (o.caps !== false) {
    const f0 = frames[0], f1 = frames[n - 1];
    b.quad(corner(f0, -1, 1), corner(f0, 1, 1), corner(f0, 1, -1), corner(f0, -1, -1), mulc(col, 0.7), mat, scl(f0.t, -1));
    b.quad(corner(f1, -1, 1), corner(f1, 1, 1), corner(f1, 1, -1), corner(f1, -1, -1), mulc(col, 1.02), mat, f1.t);
  }
}
// 沿折线扫掠圆管（外法线正确版；共享的 tubePath 法线朝内，会让管子背光发黑）
function tubePts(b, pts, radii, seg, colFn, mat, o = {}) {
  const n = pts.length;
  if (n < 2) return;
  const rad = (i) => (typeof radii === 'number' ? radii : typeof radii === 'function' ? radii(i / (n - 1)) : radii[Math.min(n - 1, i)]);
  const tan = pts.map((p, i) => norm(sub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)])));
  let ref = Math.abs(dot(tan[0], [0, 1, 0])) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  let u = norm(cross(tan[0], ref));
  let v = norm(cross(tan[0], u));
  const rings = [];
  for (let i = 0; i < n; i++) {
    u = norm(sub(u, vs(tan[i], dot(u, tan[i]))));
    v = norm(cross(tan[i], u));
    const r = rad(i);
    const ring = [];
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * TAU;
      const d = add(vs(u, Math.cos(a)), vs(v, Math.sin(a)));
      ring.push({ p: add(pts[i], vs(d, r)), n: d });
    }
    rings.push(ring);
  }
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < seg; k++) {
      const A = rings[i][k], B = rings[i][k + 1], C = rings[i + 1][k + 1], D = rings[i + 1][k];
      const cc = colFn ? colFn((i + 0.5) / (n - 1), k / seg) : mulc([0.6, 0.6, 0.6], 1);
      b.tri(A.p, B.p, C.p, cc, mat, A.n, B.n, C.n);
      b.tri(A.p, C.p, D.p, cc, mat, A.n, C.n, D.n);
    }
  }
  if (o.caps !== false) {
    for (const [idx, dir] of [[0, -1], [n - 1, 1]]) {
      const c0 = pts[idx];
      const N = vs(tan[idx], dir);
      const cc = colFn ? colFn(idx / (n - 1), 0) : mulc([0.6, 0.6, 0.6], 1);
      for (let k = 0; k < seg; k++) {
        const A = rings[idx][k], B = rings[idx][k + 1];
        b.tri(c0, A.p, B.p, mulc(cc, 0.92), mat, N, N, N);
      }
    }
  }
}

// 圆柱面上一个矩形面片（proud = 外凸量，避免 z-fighting）
function surfQuad(b, r, a0, a1, y0, y1, col, mat, proud = 0.06) {
  const am = (a0 + a1) / 2;
  b.quad(P(a0, r + proud, y0), P(a1, r + proud, y0), P(a1, r + proud, y1), P(a0, r + proud, y1), col, mat, NRm(am));
}
// 舷窗：暖光窗芯 + 黄铜窗套（5 个面片 = 10 tri）
function windowHull(b, r, a, y0, y1, hwA, fwA, pane, frame, proud = 0.10) {
  surfQuad(b, r, a - hwA, a + hwA, y0, y1, pane, M_WIN, proud);
  surfQuad(b, r, a - hwA - fwA, a - hwA, y0 - fwA, y1 + fwA, frame, M_BRASSD, proud + 0.05);
  surfQuad(b, r, a + hwA, a + hwA + fwA, y0 - fwA, y1 + fwA, frame, M_BRASSD, proud + 0.05);
  surfQuad(b, r, a - hwA - fwA, a + hwA + fwA, y1, y1 + fwA, frame, M_BRASSD, proud + 0.05);
  surfQuad(b, r, a - hwA - fwA, a + hwA + fwA, y0 - fwA, y0, frame, M_BRASSD, proud + 0.05);
}

// ============================================================ 下段：配重 / 引擎舱
function buildLowerTower(b, R) {
  const Y0 = CORE.lowerY0, Y1 = CORE.lowerY1;
  const prof = [
    [0, Y0], [54, Y0], [62, Y0 + 4], [76, Y0 + 12], [78, Y0 + 18],
    [78, -252], [85, -248], [85, -236], [78, -232],
    [78, -196], [74, -192], [74, -150],
    [81, -146], [81, -134], [76, -130],
    [76, -112], [71, -108], [71, -86],
    [66, -82], [66, Y1 - 6], [52, Y1 - 2], [52, Y1], [0, Y1],
  ];
  lathe(b, prof, 40, IV, M_HULL, {
    colFn: (y, t) => mixc(IV, IVS, 0.16 + 0.34 * Math.abs(Math.sin(t * 9.3 + 0.7))),
  });
  // ---- 配重环（三道重黄铜箍）
  for (const [y, dr, h] of [[-252, 4.5, 5], [-166, 5.5, 6], [-116, 4.0, 4.5]]) {
    bandF(b, 74, 78 + dr, y - h / 2, y + h / 2, 0, TAU, 40, BR, M_BRASS, { topCol: BRH, botCol: BRD });
    bandF(b, 74 - 1.5, 74 + 0.5, y - 1.1, y + 1.1, 0, TAU, 40, BRD, M_BRASSD, { noIn: true, noOut: true, noTop: true });
  }
  // ---- 竖向肋 + 面板缝（分段短肋：不再有贴着塔身几百米的细长条）
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * TAU + 0.04;
    for (let s2 = 0; s2 < 6; s2++) {
      const y0 = -292 + s2 * 36, y1 = y0 + 30;
      surfQuad(b, 78, a - 0.010, a + 0.010, y0, y1, mixc(IVS, PNL, 0.3), M_HULL2, 1.1);
      surfQuad(b, 78, a - 0.014, a + 0.014, y1 - 1.2, y1, mulc(IVD, 0.9), M_HULL2, 1.25);
    }
  }
  // 水平面板分缝（细暗线，让大面不呆板）
  for (let y = -292; y < -72; y += 13.5) {
    bandF(b, 77.4, 78.6, y, y + 0.55, 0, TAU, 40, mixc(IVS, IVD, 0.55), M_HULL2, { noIn: true, noTop: true, noBot: true });
  }
  // ---- 下沿一圈散热板（16 片，向斜外张）
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * TAU;
    atAz(b, a, () => {
      at(b, 0, -268, 92, () => {
        box(b, 3.0, 42, 26, mixc(PNL, HEAT, 0.42), M_PANEL, { topCol: mulc(PNL, 1.1), bottomCol: HEAT });
        for (let i = 0; i < 4; i++) {
          at(b, 0, -18 + i * 12, 0, () => box(b, 3.4, 0.9, 27, BRD, M_BRASSD));
        }
        at(b, 0, 21.5, 0, () => box(b, 3.3, 1.4, 27.5, BRD, M_BRASS));
      });
      // 根部支撑
      b.quad(P(0.018, 80, -290), P(0.018, 106, -282), P(0.018, 106, -280), P(0.018, 80, -288), BRD, M_BRASSD, NRm(a));
    });
  }
  // ---- 4 个大型推进喷口（青绿 emissive 环；喷口朝下，探出 8 m）
  for (let k = 0; k < 4; k++) {
    const a = (0.25 + 0.5 * k) * PI;
    atAz(b, a, () => {
      at(b, 0, 0, 40, () => {
        // 钟形喷管
        lathe(b, [[30, -308], [27, -304], [22, -294], [15, -282], [12, -274], [12, -262]], 20, STLD, M_STEELD);
        lathe(b, [[29, -308.5], [26, -304.5], [21, -294.5], [15, -282.5], [11.6, -274], [11.6, -263]], 20, mulc(STL, 0.6), M_STEEL);
        // 喷口内芯（青绿）
        ringF(b, 0, 24, -305.2, 0, TAU, 20, CY, M_CYAN, -1);
        ringF(b, 24, 27.6, -305.2, 0, TAU, 20, mulc(CY, 0.7), M_TEAL, -1);
        // 外壳加强环
        bandF(b, 27, 33, -306.6, -304.2, 0, TAU, 20, BR, M_BRASSD, {});
        bandF(b, 24, 29, -296, -293.4, 0, TAU, 20, BR, M_BRASSD, {});
        // 4 根斜撑（钟形喷管外的加强筋）
        for (let s = 0; s < 4; s++) {
          const aa = (s / 4) * TAU + 0.4;
          const p0 = [Math.cos(aa) * 24, -287, Math.sin(aa) * 24];
          const p1 = [Math.cos(aa) * 15, -305, Math.sin(aa) * 15];
          beamPath(b, [p0, p1], 1.4, 1.4, BRD, M_BRASSD);
        }
      });
    });
  }
  // ---- 三排舷窗（暖光，沿塔身上下错位）
  for (let row = 0; row < 3; row++) {
    const y = -238 + row * 26;
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * TAU + (row % 2) * 0.06;
      windowHull(b, 78, a, y, y + 8.5, 0.035, 0.014, WARM, BRD, 0.09);
    }
  }
  // ---- 管束（4 条沿塔身）
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + 0.22;
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const y = -294 + i * 27.6;
      const rr = y > -150 ? 77 : 81;
      pts.push(P(a, rr + 2.2, y));
    }
    tubePts(b, pts, 1.7, 7, () => PIPE_COL, M_STEEL, { caps: false });
    for (let i = 1; i < 8; i += 2) {
      const y = -294 + i * 27.6;
      atAz(b, a, () => at(b, 0, y, 80, () => box(b, 5.2, 1.4, 3.2, STLD, M_STEELD)));
    }
  }
  // ---- 舷侧检修平台 / greeble
  for (let k = 0; k < 20; k++) {
    const a = R() * TAU, y = -290 + R() * 210, rr = 78.4;
    atAz(b, a, () => at(b, 0, y, rr, () => box(b, 1.2 + R() * 2.2, 0.7 + R() * 1.4, 1.0 + R() * 2.0, mixc(PNL, IVS, R() * 0.5), M_PANEL2)));
  }
  // ---- 底部中央的主喷口 + 散热槽
  ringF(b, 0, 20, Y0 - 0.02, 0, TAU, 24, mulc(STLD, 0.8), M_STEELD, -1);
  ringF(b, 20, 34, Y0 - 0.02, 0, TAU, 24, CYD, M_TEAL, -1);
  ringF(b, 34, 36, Y0 - 0.02, 0, TAU, 24, BR, M_BRASS, -1);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;
    b.quad(P(a - 0.008, 52, Y0 + 0.05), P(a + 0.008, 52, Y0 + 0.05), P(a + 0.008, 76, Y0 + 0.05), P(a - 0.008, 76, Y0 + 0.05),
      PNDP, M_PANEL2, [0, 1, 0]);
  }
  // 顶部与枢纽的过渡环
  bandF(b, 52, 70, Y1 - 6, Y1 - 2, 0, TAU, 32, IVS, M_HULL2, { topCol: IV });
}

// ============================================================ 中段：枢纽 / 6 个对接环
function buildHub(b, R) {
  const Y0 = CORE.hubY0, Y1 = CORE.hubY1;
  const prof = [
    [0, Y0], [52, Y0], [66, Y0 + 2], [84, Y0 + 6], [92, Y0 + 12],
    [92, -44], [88, -40], [86, -34], [86, -14], [88, -10],
    [88, 10], [86, 14], [86, 34], [90, 40], [94, 46],
    [94, 54], [90, Y1 - 4], [80, Y1 - 1], [80, Y1], [0, Y1],
  ];
  lathe(b, prof, 36, IV, M_HULL, {
    colFn: (y, t) => mixc(IV, IVS, 0.12 + 0.4 * Math.abs(Math.sin(t * 7.7))),
  });
  // 腰线（黄铜腰带 + 青绿灯带）
  bandF(b, 85, 90, -6, -3.2, 0, TAU, 36, BR, M_BRASS, { topCol: BRH });
  bandF(b, 86.2, 90.4, -2.4, -1.2, 0, TAU, 36, CY, M_CYAN, { noIn: true, noTop: true });
  bandF(b, 85, 90, 3.2, 6, 0, TAU, 36, BR, M_BRASS, { topCol: BRH });
  bandF(b, 86.2, 90.4, 7.2, 8.4, 0, TAU, 36, CY, M_CYAN, { noIn: true, noTop: true });
  for (const y of [-52, -30, 24, 52]) {
    bandF(b, 84, 93.2, y - 2.4, y + 2.4, 0, TAU, 36, IVS, M_HULL2, { topCol: IV });
  }
  // ---- 6 个对接环（辐条落点）
  for (const ad of CORE.spokeAzDeg) {
    const a = ad * DEG;
    atAz(b, a, () => {
      cylZ(b, 27, 30, 84, 96, 20, STLD, M_STEELD, 1);
      ringXY(b, 30, 40, 96, 20, BR, M_BRASS, 1);
      ringXY(b, 30, 40, 92, 20, BRD, M_BRASSD, -1);
      cylZ(b, 40, 40, 92, 96, 20, BR, M_BRASS, 1);
      torus(b, 36, 3.4, 24, 6, BR, M_BRASS, 'z');
      // 法兰螺栓
      for (let k = 0; k < 16; k++) {
        const t = (k / 16) * TAU;
        at(b, Math.cos(t) * 34, Math.sin(t) * 34, 96.5, () => box(b, 1.6, 1.6, 1.4, BRD, M_BRASSD));
      }
      // 外侧导向灯（青绿）
      for (let k = 0; k < 4; k++) {
        const t = (k / 4) * TAU + 0.39;
        at(b, Math.cos(t) * 37, Math.sin(t) * 37, 97.2, () => box(b, 1.8, 1.8, 0.6, CY, M_TEAL));
      }
    });
    // 与鼓座之间的斜撑（4 根/辐条方位）
    for (const s of [-1, 1]) {
      const b0 = P(a + s * 0.055, 88, 52);
      const b1 = P(a + s * 0.16, 116, 60);
      beamPath(b, [b0, [(b0[0] + b1[0]) / 2, 60, (b0[2] + b1[2]) / 2], b1], 4.2, 5, BRD, M_BRASSD);
    }
  }
  // ---- 枢纽舷窗（两排）
  for (let row = 0; row < 2; row++) {
    const y = -40 + row * 52;
    for (let k = 0; k < 24; k++) {
      if (row === 0 && Math.abs(wrapPi((k / 24) * TAU - (CORE.spokeAzDeg[1] * DEG))) < 0.12) continue;
      const a = (k / 24) * TAU + 0.06;
      windowHull(b, 87.5, a, y, y + 9, 0.032, 0.013, WARM, BRD, 0.09);
    }
  }
  // ---- 竖向肋 / 面板 / 小 greeble
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * TAU;
    surfQuad(b, 86.4, a - 0.010, a + 0.010, -56, 54, mulc(IVS, 0.96), M_HULL2, 0.7);
  }
  for (let k = 0; k < 26; k++) {
    const a = R() * TAU, y = -56 + R() * 108;
    atAz(b, a, () => at(b, 0, y, 89, () => box(b, 1.1 + R() * 2, 0.8 + R() * 1.6, 1.4 + R() * 2.2, mixc(PNL, IVS, R() * 0.6), M_PANEL2)));
  }
  // ---- 鼓座底部的 8 根支撑臂（托住鼓座外挑）
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU + 0.2;
    const p0 = P(a, 86, 50), p1 = P(a, 112, 58), p2 = P(a, 124, 62);
    beamPath(b, [p0, p1, p2], 5, 6.5, IVS, M_HULL2);
  }
  // 枢纽底部收口
  bandF(b, 40, 66, Y0 - 2, Y0 + 4, 0, TAU, 32, PNL, M_PANEL, { topCol: mulc(PNL, 1.12) });
}
// ============================================================ 鼓座 + 北门洞
const MOUTH_AZ = CORE.mouth.azHalf;
const MOUTH_Y0 = CORE.mouth.y0;        // 58 门槛
const MOUTH_YS = CORE.mouth.ySpring;   // 92 拱脚
const MOUTH_YT = CORE.mouth.yTop;      // 130 拱冠 = 鼓座顶
// 门洞拱线（椭圆拱）
function archY(a) {
  const t = clamp(a / MOUTH_AZ, -1, 1);
  return MOUTH_YS + (MOUTH_YT - MOUTH_YS) * Math.sqrt(Math.max(0, 1 - t * t));
}
// 鼓座高拱窗：16 个均匀落在 294° 自由弧上（北门洞占去另外 51°）
const WIN_Y0 = 70, WIN_YS = 110, WIN_YT = 124;
const WIN_HW = 6.5 / CORE.drumRo;   // 13 m 宽
const WIN_AZ = (() => {
  const out = [];
  const freeStart = MOUTH_AZ + 3.4 * DEG;
  const step = (TAU - 2 * freeStart) / CORE.drumWindows;
  for (let k = 0; k < CORE.drumWindows; k++) out.push(freeStart + (k + 0.5) * step);
  return out;
})();
function winArchY(a, c) {
  const t = clamp((a - c) / WIN_HW, -1, 1);
  return WIN_YS + (WIN_YT - WIN_YS) * Math.sqrt(Math.max(0, 1 - t * t));
}

// 鼓座墙体（单侧壳）：侧 = +1 外表面（r=128）/ -1 内表面（r=120.5）
function drumWallFace(b, r, side) {
  const col = side > 0 ? IV : NAVE_IV;
  const mat = side > 0 ? M_HULL : M_NAVE;
  const cf = side > 0
    ? (a, i) => mixc(IV, IVS, 0.10 + 0.26 * (i % 3 === 0 ? 1 : 0.35))
    : (a, i) => mixc(NAVE_IV, NAVE_ST, 0.16 + 0.2 * (i % 4 === 0 ? 1 : 0.25));
  const A0 = MOUTH_AZ, A1 = TAU - MOUTH_AZ;
  // 1) 54..70 基座层（整弧）
  cylF(b, r, 54, 70, A0, A1, 72, col, mat, side, cf);
  // 2) 70..124 窗间墙（挖掉 16 个窗洞）
  const piers = [];
  let prev = A0;
  for (const c of WIN_AZ) { piers.push([prev, c - WIN_HW]); prev = c + WIN_HW; }
  piers.push([prev, A1]);
  for (const [p0, p1] of piers) {
    const n = Math.max(1, Math.round((p1 - p0) / 0.062));
    cylF(b, r, 70, 124, p0, p1, n, col, mat, side, cf);
  }
  // 3) 每个窗洞上方的拱腹填充（拱线以上到 124）
  for (const c of WIN_AZ) {
    const N = 8;
    for (let i = 0; i < N; i++) {
      const a0 = c - WIN_HW + (2 * WIN_HW * i) / N, a1 = c - WIN_HW + (2 * WIN_HW * (i + 1)) / N;
      const y0 = winArchY(a0, c), y1 = winArchY(a1, c);
      const am = (a0 + a1) / 2;
      b.quad(P(a0, r, y0), P(a1, r, y1), P(a1, r, 124), P(a0, r, 124), col, mat, scl(NRm(am), side));
    }
  }
  // 4) 124..130 檐部
  cylF(b, r, 124, 130, A0, A1, 72, side > 0 ? IVS : NAVE_MB, side > 0 ? M_HULL2 : M_NAVE2, side, cf);
  // 5) 北门洞扇区的拱上墙（拱线到 130）
  const NM = 22;
  for (let i = 0; i < NM; i++) {
    const a0 = -MOUTH_AZ + (2 * MOUTH_AZ * i) / NM, a1 = -MOUTH_AZ + (2 * MOUTH_AZ * (i + 1)) / NM;
    const y0 = archY(a0), y1 = archY(a1);
    const am = (a0 + a1) / 2;
    b.quad(P(a0, r, y0), P(a1, r, y1), P(a1, r, 130), P(a0, r, 130), col, mat, scl(NRm(am), side));
  }
  // 6) 门洞两侧下部的门槛墙（54..58 仍实心 → 4 m 高的门槛基座）
  cylF(b, r, 54, MOUTH_Y0, -MOUTH_AZ, MOUTH_AZ, 22, col, mat, side, cf);
}

// 鼓座窗：窗芯 + 窗洞侧壁 + 拱腹 + 窗台 + 中挺 + 外拱券线脚
function drumWindow(b, c) {
  const rO = CORE.drumRo, rI = CORE.drumRi, rPane = 124.4;
  // 窗芯（暖光）
  b.quad(P(c - WIN_HW, rPane, WIN_Y0), P(c + WIN_HW, rPane, WIN_Y0),
    P(c + WIN_HW, rPane, WIN_YS), P(c - WIN_HW, rPane, WIN_YS), PANE, M_WIN_I, NRm(c));
  const N = 8;
  for (let i = 0; i < N; i++) {
    const a0 = c - WIN_HW + (2 * WIN_HW * i) / N, a1 = c - WIN_HW + (2 * WIN_HW * (i + 1)) / N;
    const y0 = winArchY(a0, c), y1 = winArchY(a1, c);
    b.tri(P(c, rPane, WIN_YS), P(a0, rPane, y0), P(a1, rPane, y1), PANE, M_WIN_I, NRm(c), NRm(c), NRm(c));
  }
  // 窗洞侧壁（jamb）
  for (const s of [-1, 1]) {
    const a = c + s * WIN_HW;
    b.quad(P(a, rI, WIN_Y0), P(a, rO, WIN_Y0), P(a, rO, WIN_YS), P(a, rI, WIN_YS),
      mulc(NAVE_IV, 0.9), M_NAVE, scl(TGm(a), -s));
  }
  // 窗台
  b.quad(P(c - WIN_HW, rI, WIN_Y0), P(c - WIN_HW, rO, WIN_Y0), P(c + WIN_HW, rO, WIN_Y0), P(c + WIN_HW, rI, WIN_Y0),
    NAVE_ST, M_NAVE2, [0, 1, 0]);
  // 拱腹（拱线下面的洞内顶面）
  for (let i = 0; i < N; i++) {
    const a0 = c - WIN_HW + (2 * WIN_HW * i) / N, a1 = c - WIN_HW + (2 * WIN_HW * (i + 1)) / N;
    const y0 = winArchY(a0, c), y1 = winArchY(a1, c);
    b.quad(P(a0, rI, y0), P(a1, rI, y1), P(a1, rPane, y1), P(a0, rPane, y0),
      mulc(NAVE_ST, 1.05), M_NAVE2, [0, -1, 0]);
  }
  // 中挺（两根竖挺 + 一根横挡，黄铜）
  for (const f of [-0.34, 0.34]) {
    const aw = 0.30 / rPane;
    b.quad(P(c + f * WIN_HW - aw, rPane - 0.35, WIN_Y0), P(c + f * WIN_HW + aw, rPane - 0.35, WIN_Y0),
      P(c + f * WIN_HW + aw, rPane - 0.35, WIN_YS), P(c + f * WIN_HW - aw, rPane - 0.35, WIN_YS),
      BRD, M_BRASSD, NRm(c));
  }
  b.quad(P(c - WIN_HW, rPane - 0.3, 94), P(c + WIN_HW, rPane - 0.3, 94), P(c + WIN_HW, rPane - 0.3, 95.4), P(c - WIN_HW, rPane - 0.3, 95.4),
    BRD, M_BRASSD, NRm(c));
  // 外拱券线脚（外表面 rO+0.2 上的拱形带）
  const Fo = 0.42 / rO;
  for (let i = 0; i < N; i++) {
    const a0 = c - WIN_HW - Fo + ((2 * WIN_HW + 2 * Fo) * i) / N;
    const a1 = c - WIN_HW - Fo + ((2 * WIN_HW + 2 * Fo) * (i + 1)) / N;
    const am0 = clamp(a0 - c, -WIN_HW, WIN_HW), am1 = clamp(a1 - c, -WIN_HW, WIN_HW);
    const y0 = winArchY(am0, c) + 0.25, y1 = winArchY(am1, c) + 0.25;
    surfQuad(b, rO, a0, a1, y0 - 0.25, y0 + 1.4, BR, M_BRASS, 0.22);
    void y1;
  }
  for (const s of [-1, 1]) {
    surfQuad(b, rO, c + s * (WIN_HW + Fo), c + s * (WIN_HW + 2 * Fo), WIN_Y0 - 1.4, WIN_YS, BR, M_BRASS, 0.22);
  }
}

function buildDrum(b, R) {
  const rO = CORE.drumRo, rI = CORE.drumRi;
  drumWallFace(b, rO, 1);
  drumWallFace(b, rI, -1);
  // 墙顶/墙底的封口环
  ringF(b, rI, rO, 130, 0, TAU, 72, IVS, M_HULL2, 1);
  ringF(b, rI, rO, 54, 0, TAU, 72, mulc(IVD, 0.8), M_HULL2, -1);
  // 16 个高拱窗
  for (const c of WIN_AZ) drumWindow(b, c);
  // ---- 北门洞：门侧壁 + 拱腹 + 门槛
  for (const s of [-1, 1]) {
    const a = s * MOUTH_AZ;
    b.quad(P(a, rI, MOUTH_Y0), P(a, rO, MOUTH_Y0), P(a, rO, MOUTH_YS), P(a, rI, MOUTH_YS),
      mulc(IVS, 0.9), M_HULL, scl(TGm(a), -s));
  }
  const NARCH = 22;
  for (let i = 0; i < NARCH; i++) {
    const a0 = -MOUTH_AZ + (2 * MOUTH_AZ * i) / NARCH, a1 = -MOUTH_AZ + (2 * MOUTH_AZ * (i + 1)) / NARCH;
    const y0 = archY(a0), y1 = archY(a1);
    b.quad(P(a0, rI, y0), P(a1, rI, y1), P(a1, rO, y1), P(a0, rO, y0), mulc(IVS, 0.84), M_HULL, [0, -1, 0]);
  }
  // 门洞外拱券（加厚线脚 + 黄铜）
  for (let i = 0; i < NARCH; i++) {
    const a0 = -MOUTH_AZ + (2 * MOUTH_AZ * i) / NARCH, a1 = -MOUTH_AZ + (2 * MOUTH_AZ * (i + 1)) / NARCH;
    const y0 = archY(a0), y1 = archY(a1);
    surfQuad(b, rO, a0, a1, y0 - 0.4, y0 + 2.6, IVS, M_HULL2, 0.3);
    surfQuad(b, rO, a0, a1, y0 - 0.55, y0 - 0.25, BR, M_BRASS, 0.42);
  }
  // 门侧壁的壁柱（外面）
  for (const s of [-1, 1]) {
    const a = s * (MOUTH_AZ + 1.4 * DEG);
    surfQuad(b, rO + 0.1, a - 1.1 * DEG, a + 1.1 * DEG, MOUTH_Y0, MOUTH_YS + 6, mixc(IVS, PNL, 0.2), M_HULL2, 0.0);
    surfQuad(b, rO + 0.2, a - 1.4 * DEG, a + 1.4 * DEG, MOUTH_YS + 6, MOUTH_YS + 7.8, BR, M_BRASS, 0.0);
  }
  // ---- 柱廊（32 根壁柱，躲开门洞）：象牙白檐部 + 黄铜柱身
  const NPIL = 32;
  for (let k = 0; k < NPIL; k++) {
    const a = (k / NPIL) * TAU;
    if (Math.abs(wrapPi(a)) < MOUTH_AZ + 0.12) continue;
    atAz(b, a, () => {
      at(b, 0, 0, rO + 2.4, () => {
        // 壁柱身（8×52 m）
        box(b, 6.6, 50, 5.4, mixc(IVS, IV, 0.4), M_HULL2, { topCol: IV });
        // 黄铜柱身饰带
        box(b, 3.4, 48, 5.8, BRD, M_BRASSD, { topCol: BR });
        box(b, 7.4, 1.8, 6.2, BR, M_BRASS);
        at(b, 0, 25.2, 0, () => box(b, 7.8, 2.6, 6.6, BRH, M_BRASS));
        at(b, 0, -25.4, 0, () => box(b, 7.4, 1.6, 6.2, BRD, M_BRASSD));
        // 柱头
        at(b, 0, 27.2, 0, () => box(b, 8.2, 2.6, 7.0, IV, M_HULL2, { topCol: mulc(IV, 1.05) }));
      });
    });
  }
  const skipM = (a) => Math.abs(wrapPi(a)) < MOUTH_AZ + 0.02;
  // ---- 鼓座外表面的面板缝 + 铆钉带（近看的细节）
  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * TAU;
    if (Math.abs(wrapPi(a)) < MOUTH_AZ + 0.02) continue;
    surfQuad(b, rO, a - 0.0045, a + 0.0045, 70, 124, mulc(IVS, 0.86), M_HULL2, 0.16);
  }
  for (const yy of [80, 92, 104, 116]) {
    bandF(b, rO - 0.2, rO + 0.22, yy, yy + 0.42, 0, TAU, 48, mulc(IVS, 0.84), M_HULL2, { skip: skipM, noIn: true, noTop: true, noBot: true });
  }
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * TAU + 0.13;
    if (Math.abs(wrapPi(a)) < MOUTH_AZ + 0.05) continue;
    atAz(b, a, () => {
      at(b, 0, 72, rO + 0.3, () => { box(b, 1.6, 1.4, 1.0, BR, M_BRASS); });
      at(b, 0, 122, rO + 0.3, () => { box(b, 1.6, 1.4, 1.0, BR, M_BRASS); });
    });
  }
  // ---- 象牙白檐部（鼓座顶）+ 黄铜饰线：只做自由弧，躲开门洞
  bandF(b, rO - 0.6, 133.5, 126.2, 128.6, 0, TAU, 72, IVS, M_HULL2, { skip: skipM, topCol: IV });
  bandF(b, rO - 0.2, 134.0, 128.6, 129.4, 0, TAU, 72, BR, M_BRASS, { skip: skipM, noIn: true });
  bandF(b, rO + 0.4, 130.2, 68.0, 69.4, 0, TAU, 72, BR, M_BRASS, { skip: skipM, noIn: true, noTop: true, noBot: true });
  bandF(b, rO - 0.1, 131.0, 65.2, 66.6, 0, TAU, 72, IVS, M_HULL2, { skip: skipM });
  // ---- 门洞外的雨棚 + 两根导向灯柱
  buildDoorCanopy(b);
  // ---- 鼓座底部与枢纽之间的收腰环
  bandF(b, 112, 121, 50, 54, 0, TAU, 48, mulc(PNL, 0.9), M_PANEL, { topCol: PNL });
}

function buildDoorCanopy(b) {
  const zO = CORE.drumRo;
  const NA = 22;
  // ---- 门套：沿拱线外凸 7 m、5 m 高的深线脚（从外面一眼看出"这是门"）
  for (let i = 0; i < NA; i++) {
    const a0 = -MOUTH_AZ + (2 * MOUTH_AZ * i) / NA, a1 = -MOUTH_AZ + (2 * MOUTH_AZ * (i + 1)) / NA;
    const y0 = archY(a0), y1 = archY(a1);
    b.quad(P(a0, zO + 0.05, y0), P(a1, zO + 0.05, y1), P(a1, zO + 0.05, y1 + 5.0), P(a0, zO + 0.05, y0 + 5.0), IVS, M_HULL2, NRm((a0 + a1) / 2));
    b.quad(P(a0, zO + 0.05, y0 + 5.0), P(a1, zO + 0.05, y1 + 5.0), P(a1, zO + 7, y1 + 5.0), P(a0, zO + 7, y0 + 5.0), IV, M_HULL2, [0, 0.7, 0.7]);
    b.quad(P(a0, zO + 7, y0), P(a1, zO + 7, y1), P(a1, zO + 7, y1 + 5.0), P(a0, zO + 7, y0 + 5.0), BRD, M_BRASSD, NRm((a0 + a1) / 2));
    b.quad(P(a0, zO + 0.05, y0), P(a1, zO + 0.05, y1), P(a1, zO + 7, y1), P(a0, zO + 7, y0), mulc(IVD, 1.1), M_HULL2, [0, -1, 0]);
    // 拱腹内侧的暖光槽（从门外就能看到门洞在发光）
    b.quad(P(a0, zO - 3.2, y0 + 0.1), P(a1, zO - 3.2, y1 + 0.1), P(a1, zO - 3.2, y1 + 1.1), P(a0, zO - 3.2, y0 + 1.1), PANE, M_WIN, [0, -1, 0]);
    // 外缘金线
    b.quad(P(a0, zO + 7.05, y0 + 4.4), P(a1, zO + 7.05, y1 + 4.4), P(a1, zO + 7.05, y1 + 5.0), P(a0, zO + 7.05, y0 + 5.0), BRH, M_BRASS, NRm((a0 + a1) / 2));
  }
  // ---- 门洞侧壁内的暖光槽 + 门槛灯带（门内透出的暖光，从外面就看得到）
  for (const s of [-1, 1]) {
    const a = s * MOUTH_AZ;
    b.quad(P(a, 121.2, 60), P(a, 127, 60), P(a, 127, 90.5), P(a, 121.2, 90.5),
      PANE, M_WIN, scl(TGm(a), -s));
  }
  ringF(b, 121.4, 127, 58.6, -MOUTH_AZ * 0.92, MOUTH_AZ * 0.92, 14, PANE, M_WIN, 1);
  ringF(b, 127.4, 128.4, 58.6, -MOUTH_AZ * 0.92, MOUTH_AZ * 0.92, 14, BRH, M_BRASS, 1);
  // ---- 两侧门柱（把门框住）
  for (const s of [-1, 1]) {
    const a = s * (MOUTH_AZ + 0.03);
    atAz(b, a, () => {
      // 门柱：世界 y 53..131，中心 92
      at(b, 0, 92, zO + 3.2, () => {
        box(b, 5.0, 78, 6.4, IV, M_HULL2, { topCol: mulc(IV, 1.04) });
        box(b, 2.2, 74, 6.9, BRD, M_BRASSD, { topCol: BR });
        at(b, 0, 30, 0, () => { box(b, 6.0, 2.4, 7.8, BRH, M_BRASS); });
        at(b, 0, -27, 0, () => { box(b, 6.0, 2.0, 7.6, BR, M_BRASS); });
        at(b, 0, -36, 0, () => { box(b, 3.4, 4.4, 1.6, PANE, M_WIN); });   // 柱脚指示灯
      });
    });
    // 门柱前的引导灯（青绿，6 段）
    atAz(b, s * (MOUTH_AZ + 0.10), () => {
      at(b, 0, 0, zO + 9.5, () => {
        cylinder(b, 10, 1.1, 0.8, 66, BRD, M_BRASSD, { y0: 60, caps: false });
        for (let k = 0; k < 6; k++) {
          at(b, 0, 64 + k * 10.5, 0, () => { box(b, 2.6, 4.2, 2.6, CY, M_TEAL); });
        }
      });
    });
  }
  // ---- 雨棚：从拱冠上方挑出的薄板（在穹顶赤道以下）
  const y0 = 128.6, y1 = 130.8;
  b.quad([-50, y1, zO - 2], [50, y1, zO - 2], [50, y1, zO + 6.5], [-50, y1, zO + 6.5], IV, M_HULL2, [0, 1, 0]);
  b.quad([-50, y0, zO - 2], [-50, y0, zO + 6.5], [50, y0, zO + 6.5], [50, y0, zO - 2], mulc(BR, 0.85), M_BRASS, [0, -1, 0]);
  b.quad([-50, y0, zO + 6.5], [50, y0, zO + 6.5], [50, y1, zO + 6.5], [-50, y1, zO + 6.5], BR, M_BRASS, [0, 0, 1]);
  for (const s of [-1, 1]) {
    b.quad([s * 50, y0, zO - 2], [s * 50, y0, zO + 6.5], [s * 50, y1, zO + 6.5], [s * 50, y1, zO - 2], IVS, M_HULL2, [s, 0, 0]);
    // 挑檐下的黄铜托架
    for (let k = 0; k < 3; k++) {
      const x = s * (42 - k * 13);
      beamPath(b, [[x, 127.4, zO - 1], [x, 129.4, zO + 2], [x, y0 - 0.3, zO + 6]], 2.2, 2.0, BRD, M_BRASSD);
    }
  }
  // 两根导向灯柱（悬挑在鼓座外，框住门洞）
  for (const s of [-1, 1]) {
    const x = s * 68, z = zO + 12;
    for (let k = 0; k < 2; k++) {
      const y = 96 + k * 26;
      beamPath(b, [[s * 62.6, y, z - 12], [x, y + 1.5, z]], 2.6, 2.6, IVS, M_HULL2);
    }
    // 灯柱本体（竖立）
    at(b, x, 0, z, () => {
      cylinder(b, 12, 2.9, 2.2, 94, BRD, M_BRASSD, { y0: 16, caps: false });
      for (let k = 0; k < 7; k++) {
        const y = 24 + k * 12;
        at(b, 0, y, 0, () => { torus(b, 2.6, 0.6, 12, 4, BR, M_BRASS, 'y'); });
        at(b, 0, y + 4.5, 0, () => { box(b, 4.4, 6.4, 4.4, CY, M_TEAL); });
      }
      at(b, 0, 110, 0, () => { lathe(b, [[1.6, 0], [2.6, 1.2], [1.0, 2.4], [0.2, 3.6]], 10, BR, M_BRASS); });
      at(b, 0, 113, 0, () => { sphere(b, 1.5, CY, M_TEAL, { rings: 3, seg: 8, jitter: 0.04, seed: 4 }); });
    });
  }
  // 门洞门槛内的大台阶（58 → 66.02，四级）
  for (let k = 0; k < 4; k++) {
    const y = MOUTH_Y0 + (k + 1) * 2.0;
    const rA = CORE.drumRo - (k + 1) * 3.5, rB = CORE.drumRo - k * 3.5;
    ringF(b, rA, rB, y, -MOUTH_AZ * 0.98, MOUTH_AZ * 0.98, 18, k % 2 ? NAVE_ST : NAVE_MB, M_NAVE, 1);
    bandF(b, rA, rB, y - 2.0, y, -MOUTH_AZ * 0.98, MOUTH_AZ * 0.98, 18, mulc(NAVE_ST, 0.9), M_NAVE2, { noTop: true, noIn: true, noOut: true });
  }
}
// ============================================================ 玻璃肋穹顶
function domePt(a, phi, r) {
  const c = Math.cos(phi);
  return [Math.sin(a) * c * r, CORE.domeY + Math.sin(phi) * r, Math.cos(a) * c * r];
}
function domeNrm(a, phi) {
  const c = Math.cos(phi);
  return [Math.sin(a) * c, Math.sin(phi), Math.cos(a) * c];
}
const DOME_PHI_TOP = PI / 2 - 0.055;   // 顶端留出采光塔基座
function buildDome(b, R) {
  const Y = CORE.domeY, Ro = CORE.domeR, Ri = CORE.domeRi;
  const SEG = CORE.ribCount;   // 24 经向
  const BANDS = 9;
  // 玻璃壳（外表面 r=132 + 内表面 r=129）
  for (let j = 0; j < BANDS; j++) {
    const v0 = Math.pow(j / BANDS, 0.94) * DOME_PHI_TOP, v1 = Math.pow((j + 1) / BANDS, 0.94) * DOME_PHI_TOP;
    for (let i = 0; i < SEG; i++) {
      const a0 = (i / SEG) * TAU, a1 = ((i + 1) / SEG) * TAU, am = (a0 + a1) / 2;
      const pm = (v0 + v1) / 2;
      // 玻璃穹顶：统一在深青蓝玻璃里做细微变化，少数面板透出室内暖光（不再棋盘格）
      const pick = (i * 5 + j * 11) % 13;
      const ca = pick === 0 ? mixc(GL, WARM, 0.22)
        : pick === 5 ? mixc(GL, GF, 0.30)
        : mixc(GLD, GL, 0.28 + 0.20 * Math.abs(Math.sin(i * 1.7 + j * 0.8)));
      const nO = domeNrm(am, pm);
      b.quad(domePt(a0, v0, Ro), domePt(a1, v0, Ro), domePt(a1, v1, Ro), domePt(a0, v1, Ro), ca, M_GLASS, nO);
      const ci = mixc(GL_IN, GL_IN2, 0.2 + 0.25 * Math.abs(Math.sin(i * 1.7 + j * 0.9)));
      b.quad(domePt(a0, v0, Ri), domePt(a1, v0, Ri), domePt(a1, v1, Ri), domePt(a0, v1, Ri), ci, M_GLASSI, scl(nO, -1));
    }
  }
  // 顶端封口（藏在采光塔里）
  for (let i = 0; i < SEG; i++) {
    const a0 = (i / SEG) * TAU, a1 = ((i + 1) / SEG) * TAU, am = (a0 + a1) / 2;
    b.tri([0, Y + Ro * Math.sin(DOME_PHI_TOP), 0], domePt(a1, DOME_PHI_TOP, Ro), domePt(a0, DOME_PHI_TOP, Ro),
      GL, M_GLASS, [0, 1, 0], [0, 1, 0], [0, 1, 0]);
    b.tri([0, Y + Ri * Math.sin(DOME_PHI_TOP), 0], domePt(a0, DOME_PHI_TOP, Ri), domePt(a1, DOME_PHI_TOP, Ri),
      GL_IN, M_GLASSI, [0, -1, 0], [0, -1, 0], [0, -1, 0]);
    void am;
  }
  // 24 根经向玻璃肋（黄铜，向外凸 5.2 m）—— 体检按 15° 簇统计
  for (let k = 0; k < SEG; k++) domeRib(b, (k / SEG) * TAU);
  // 5 道纬向肋
  for (const v of [0.20, 0.40, 0.60, 0.80, 0.93]) {
    const phi = v * DOME_PHI_TOP;
    const Rl = (Ro + 1.5) * Math.cos(phi), yl = Y + (Ro + 1.5) * Math.sin(phi);
    at(b, 0, yl, 0, () => { torus(b, Rl, 1.3, 48, 5, BR, M_BRASS, 'y'); });
  }
  // 赤道圈：穹顶落在鼓座檐口上（北门洞扇区让开）
  const skipM = (a) => Math.abs(wrapPi(a)) < MOUTH_AZ + 0.015;
  bandF(b, Ro - 4.2, Ro + 3.2, Y - 1.4, Y + 0.8, 0, TAU, 72, IVS, M_HULL2, { skip: skipM, topCol: IV });
  bandF(b, Ro - 0.2, Ro + 3.6, Y - 2.2, Y - 1.4, 0, TAU, 72, BR, M_BRASS, { skip: skipM, noIn: true });
  // 采光塔
  buildDomeLantern(b);
}

function domeRib(b, az) {
  const Ro = CORE.domeR;
  const N = 12, TW = 2.7, HR = 4.2;
  const RIB_COL = mixc(BR, BRD, 0.38);
  const ring = [];
  for (let i = 0; i <= N; i++) {
    const phi = DOME_PHI_TOP * Math.pow(i / N, 0.92);
    const dA = TW / (Ro * Math.max(0.18, Math.cos(phi)));
    const rr = Ro - 0.6, ro = Ro + HR;
    ring.push({
      a0: az - dA, a1: az + dA,
      i0: domePt(az - dA, phi, rr), i1: domePt(az + dA, phi, rr),
      o0: domePt(az - dA, phi, ro), o1: domePt(az + dA, phi, ro),
      n: domeNrm(az, phi),
    });
  }
  for (let i = 0; i < N; i++) {
    const A = ring[i], B = ring[i + 1];
    const nm = norm(add(A.n, B.n));
    b.quad(A.o0, A.o1, B.o1, B.o0, RIB_COL, M_BRASS, nm);
    const tg = TGm(az);
    b.quad(A.i0, A.o0, B.o0, B.i0, mulc(RIB_COL, 0.8), M_BRASSD, scl(tg, -1));
    b.quad(A.o1, A.i1, B.i1, B.o1, mulc(RIB_COL, 0.8), M_BRASSD, tg);
    // 每隔三段加一个金箍
    if (i % 3 === 2) {
      const p = domePt(az, (i + 1) / N * DOME_PHI_TOP, Ro + HR * 0.6);
      at(b, p[0], p[1], p[2], () => { box(b, 6.2, 2.0, 4.0, BRH, M_BRASS); });
    }
  }
}

function buildDomeLantern(b) {
  const Y = CORE.domeY + CORE.domeR;   // 262 穹顶尖
  // 基座环
  bandF(b, 14, 27, Y - 15, Y - 8, 0, TAU, 24, BR, M_BRASS, { topCol: BRH });
  bandF(b, 14.4, 25, Y - 17, Y - 15, 0, TAU, 24, BRD, M_BRASSD, { noIn: true, noTop: true });
  // 玻璃灯室
  cylF(b, 20, Y - 8, Y + 8, 0, TAU, 24, mixc(GL, WARM, 0.25), M_GLASS, 1);
  cylF(b, 19.2, Y - 8, Y + 8, 0, TAU, 24, mixc(WARM, GL, 0.18), M_WIN2, -1);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;
    atAz(b, a, () => {
      at(b, 0, Y, 20.6, () => box(b, 1.7, 16, 1.9, BRD, M_BRASSD));
    });
  }
  bandF(b, 19.4, 27, Y + 8, Y + 10.4, 0, TAU, 24, BR, M_BRASS, { topCol: BRH });
  bandF(b, 12, 22, Y + 10.4, Y + 11.2, 0, TAU, 24, BRH, M_BRASS, { noIn: true });
  // 小穹顶（黄铜）
  lathe(b, [[22, Y + 11.2], [18, Y + 16], [12.5, Y + 21], [6.4, Y + 25.4], [2.2, Y + 28.4], [0, Y + 29.6]], 24, BR, M_BRASS);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU + 0.39;
    b.quad(P(a - 0.012, 22, Y + 11.4), P(a + 0.012, 22, Y + 11.4), P(a + 0.012, 5, Y + 26.4), P(a - 0.012, 5, Y + 26.4),
      BRD, M_BRASSD, [0, 0.5, 0.86]);
  }
  // 尖顶金球 + 信标
  at(b, 0, Y + 30.6, 0, () => { cylinder(b, 8, 0.9, 0.5, 3.2, BRD, M_BRASSD, { y0: 0, caps: false }); });
  at(b, 0, Y + 34.6, 0, () => { sphere(b, 1.5, CY, M_TEAL, { rings: 3, seg: 8, jitter: 0.03, seed: 9 }); });
  bandF(b, 8, 13, Y + 29.6, Y + 30.6, 0, TAU, 16, BRH, M_BRASS, {});
}

// ============================================================ 6 道塔肋（辐条的能量继续向上包住穹顶）
const PYLON_PTS = [
  [138, 62], [140, 96], [139, 130], [134, 164],
  [124, 198], [108, 226], [86, 250], [62, 272], [42, 290], [30, 302],
];
function buildPylons(b, R) {
  for (const ad of CORE.spokeAzDeg) {
    const a = ad * DEG;
    const tg = TGm(a);
    // 世界坐标折线
    const pts = PYLON_PTS.map(([r, y]) => P(a, r, y));
    beamPath(b, pts, (t) => lerp(9.2, 4.4, t), (t) => lerp(12.5, 5.2, t), IV, M_HULL);
    // 分段黄铜箍 + 窗带
    for (let i = 1; i < PYLON_PTS.length - 1; i++) {
      const [r, y] = PYLON_PTS[i];
      const [r0, y0] = PYLON_PTS[i - 1], [r1, y1] = PYLON_PTS[i + 1];
      const dr = r1 - r0, dy = y1 - y0;
      const tilt = Math.atan2(dr, dy);
      const p = P(a, r, y);
      b.push(T(p[0], p[1], p[2]));
      b.push(RY(a));
      b.push(RX(tilt));
      box(b, 7.8 + 0.2 * i, 1.6, 13.4, BR, M_BRASS, { topCol: BRH });
      if (i % 2 === 1 && PYLON_PTS[i][0] > 122) {
        // 朝外的窗带（暖光；只在 r>122 的上段，别落进中庭采样圆柱里）
        at(b, 0, 0, 6.4, () => box(b, 4.0, 5.4, 0.8, WARM, M_WIN));
      }
      b.pop(); b.pop(); b.pop();
      void tg;
    }
    // 顶端汇聚点的金冠
    const tp = P(a, 30, 302);
    at(b, tp[0], tp[1], tp[2], () => { box(b, 6.4, 3.0, 7.2, BRH, M_BRASS); });
  }
}

// ============================================================ 尖塔 + 顶部灯塔
function buildSpire(b, R) {
  const Y0 = 302, Y1 = CORE.spireTop;  // 302..460
  // 基座鼓（与 6 道塔肋收束处同高）
  lathe(b, [[0, 294], [26, 294], [30, 298], [30, 306], [26, 310], [24, 316], [0, 316]], 32, IV, M_HULL, {
    colFn: (y, t) => mixc(IV, IVS, 0.12 + 0.3 * t),
  });
  bandF(b, 24, 32, 304, 306.4, 0, TAU, 32, BR, M_BRASS, { topCol: BRH });
  bandF(b, 24, 31, 312, 313.6, 0, TAU, 32, CY, M_CYAN, { noIn: true, noTop: true });
  // 6 个角尖塔
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU + PI / 6;
    atAz(b, a, () => {
      at(b, 0, 306, 27, () => {
        lathe(b, [[3.6, 0], [3.0, 6], [1.9, 12], [0.7, 17], [0, 19]], 10, mixc(IVS, BR, 0.18), M_HULL2);
        at(b, 0, 19.6, 0, () => { sphere(b, 0.8, BRH, M_BRASS, { rings: 2, seg: 6, jitter: 0.02, seed: 3 }); });
      });
    });
  }
  // 塔身（312..424，r 24 → 15，带收分与束腰）
  const prof = [
    [0, 312], [24, 312], [24, 326], [21, 330], [21, 348], [19.5, 352],
    [19.5, 368], [18, 372], [18, 388], [16.6, 392], [16.6, 406],
    [15.4, 410], [15.4, 420], [14.2, 424], [0, 424],
  ];
  lathe(b, prof, 32, IV, M_HULL, {
    colFn: (y, t) => mixc(IV, IVS, 0.1 + 0.34 * Math.abs(Math.sin(t * 11 + 0.4))),
  });
  // 檐口 / 束带 / 金环
  const bands = [
    [326, 329, 20.6, 25.2, IVS, M_HULL2],
    [348, 350.6, 19.2, 23.0, IVS, M_HULL2],
    [368, 370.4, 18.0, 21.6, IVS, M_HULL2],
    [388, 390.4, 16.8, 20.2, IVS, M_HULL2],
    [406, 408.2, 15.8, 19.0, IVS, M_HULL2],
  ];
  for (const [y0, y1, ri, ro, cc, mm] of bands) {
    bandF(b, ri, ro, y0, y1, 0, TAU, 32, cc, mm, { topCol: IV });
    bandF(b, ro - 1.2, ro + 0.5, y0 + 0.2, y0 + 0.9, 0, TAU, 32, BR, M_BRASS, { noIn: true, noTop: true });
  }
  for (const y of [332, 356, 376, 396, 414]) {
    bandF(b, 13, 22, y, y + 1.3, 0, TAU, 32, CY, M_CYAN, { noIn: true, noTop: true, noBot: true });
  }
  // 4 排舷窗（暖光，8 个/排）
  for (let row = 0; row < 4; row++) {
    const y = [334, 358, 378, 398][row];
    const rr = [21.6, 20.2, 18.8, 17.4][row];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU + (row % 2) * 0.2;
      windowHull(b, rr, a, y, y + 7.4, 0.036, 0.015, WARM, BRD, 0.08);
    }
  }
  // 垂直壁柱（12 道，分段，避免长细条）
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU;
    for (const [y0, y1, r0] of [[314, 348, 23.6], [352, 368, 21.6], [372, 388, 20.2], [392, 406, 18.8], [410, 420, 17.4]]) {
      b.quad(P(a - 0.012, r0 + 1.2, y0), P(a + 0.012, r0 + 1.2, y0), P(a + 0.012, r0 + 0.5, y1), P(a - 0.012, r0 + 0.5, y1),
        mixc(IVS, PNL, 0.22), M_HULL2, NRm(a));
    }
  }
  // 顶部灯塔（428..460）
  buildTopLantern(b);
}

function buildTopLantern(b) {
  const Y0 = CORE.lanternY0;   // 428
  // 檐托 / 平台
  bandF(b, 12.5, 22.4, Y0 - 4, Y0, 0, TAU, 24, IVS, M_HULL2, { topCol: IV });
  bandF(b, 21.6, 23.6, Y0 - 1.1, Y0 - 0.2, 0, TAU, 24, BR, M_BRASS, { noIn: true, noTop: true });
  // 玻璃灯室（八边形）
  cylF(b, 17.4, Y0 + 0.6, Y0 + 13.6, 0, TAU, 24, mixc(GL, WARM, 0.32), M_GLASS, 1);
  cylF(b, 16.8, Y0 + 0.6, Y0 + 13.6, 0, TAU, 24, mixc(WARM, GL, 0.12), M_WIN2, -1);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;
    atAz(b, a, () => { at(b, 0, Y0 + 7.2, 17.9, () => box(b, 1.5, 14, 1.5, BRD, M_BRASSD)); });
  }
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU + PI / 8;
    atAz(b, a, () => { at(b, 0, Y0 + 14.4, 13.4, () => box(b, 5.6, 1.4, 2.2, BR, M_BRASS)); });
  }
  bandF(b, 16.6, 24.6, Y0 + 13.6, Y0 + 15.4, 0, TAU, 24, BR, M_BRASS, { topCol: BRH });
  // 穹顶 + 灯尖
  lathe(b, [[22, Y0 + 15.4], [18, Y0 + 19.4], [12, Y0 + 23.4], [5.6, Y0 + 27], [0, Y0 + 29.4]], 24, BR, M_BRASS);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU + 0.39;
    b.quad(P(a - 0.014, 22, Y0 + 15.6), P(a + 0.014, 22, Y0 + 15.6), P(a + 0.014, 4, Y0 + 25.4), P(a - 0.014, 4, Y0 + 25.4),
      BRD, M_BRASSD, NRm(a));
  }
  // 4 根短桅杆（阶距式，最长 26 m，不会拉出画面的长细线）
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + PI / 4;
    atAz(b, a, () => {
      at(b, 0, 0, 21, () => {
        cylinder(b, 8, 1.5, 1.0, 26, STL, M_STEEL, { y0: Y0 + 1.2, caps: false });
        for (let s2 = 0; s2 < 5; s2++) {
          at(b, 0, Y0 + 4 + s2 * 5.2, 0, () => { torus(b, 1.7, 0.32, 8, 4, BRD, M_BRASSD, 'y'); });
        }
        at(b, 0, Y0 + 27.6, 0, () => { sphere(b, 1.0, CY, M_TEAL, { rings: 2, seg: 6, jitter: 0.02, seed: 2 }); });
        at(b, 0, Y0 + 22, 0, () => { box(b, 5.4, 0.3, 0.3, BR, M_BRASS); });
      });
    });
  }
  // 信标灯
  at(b, 0, Y0 + 30.6, 0, () => { cylinder(b, 8, 1.0, 0.4, 2.4, BRD, M_BRASSD, { y0: 0, caps: false }); });
  at(b, 0, Y0 + 32.8, 0, () => { sphere(b, 2.2, CY, M_TEAL, { rings: 4, seg: 10, jitter: 0.03, seed: 11 }); });
  at(b, 0, Y0 + 32.8, 0, () => { sphere(b, 1.1, C.sun || WARM, M_WIN, { rings: 2, seg: 6, jitter: 0.02, seed: 5 }); });
}
// ============================================================ 6 条辐条交通管
function buildSpoke(b, a, R) {
  const rad = CORE.spokeRad;
  const z0 = 76, z1 = CORE.spokeR1;
  const yc = (t) => 7.5 * Math.sin(Math.min(1, Math.max(0, (t - 0.06) / 0.88)) * PI);
  b.push(RY(a));
  // ---- 主交通管（12 边形，微微起拱）
  const NSEG = 10;
  const pts = [];
  for (let i = 0; i <= NSEG; i++) {
    const t = i / NSEG;
    pts.push([0, yc(t), lerp(z0, z1, t)]);
  }
  tubePts(b, pts, rad, 12, (t, k) => mixc(IV, IVS, 0.08 + 0.3 * Math.abs(Math.sin(k * 1.7 + t * 6.3))), M_HULL, { caps: true });
  // ---- 10 道桁架肋环（深色箍带 + 亮黄铜环，近看是"分段管"而不是白管子）
  for (let i = 1; i <= 10; i++) {
    const t = i / 11;
    const z = lerp(z0, z1, t), y = yc(t);
    at(b, 0, y, z, () => {
      cylZ(b, rad - 0.2, rad + 2.4, -2.8, 2.8, 20, mixc(PNL, STLD, 0.35), M_PANEL);
      cylZ(b, rad + 2.4, rad + 2.7, -2.4, 2.4, 20, BRD, M_BRASSD);
      torus(b, rad + 3.0, 1.6, 20, 5, BR, M_BRASS, 'z');
      torus(b, rad + 3.2, 0.5, 20, 4, BRH, M_BRASS, 'z');
    });
  }
  // ---- 纵向面板缝（分段短条，避免长细线）
  for (let k = 0; k < 6; k++) {
    const th = (k / 6) * TAU + 0.26;
    for (let s2 = 0; s2 < 10; s2++) {
      const t = 0.055 + s2 * 0.09;
      const z = lerp(z0, z1, t), y = yc(t);
      b.push(RZ(th));
      at(b, rad + 0.35, 0, z, () => { box(b, 0.7, 0.7, 26, mixc(PNL, STLD, 0.4), M_PANEL2); });
      b.pop();
    }
  }
  // ---- 背脊鳍（沿管顶的分段鳍板，增强剪影）
  for (let s2 = 0; s2 < 9; s2++) {
    const t = 0.07 + s2 * 0.105;
    const z = lerp(z0, z1, t), y = yc(t) + rad;
    at(b, 0, y + 1.2, z, () => { box(b, 0.7, 3.6, 40, mixc(IVS, BRD, 0.22), M_HULL2); });
    at(b, 0, y + 3.1, z, () => { box(b, 1.0, 0.5, 40, BR, M_BRASS); });
  }
  // ---- 侧腹货舱门（4 个）
  for (let s2 = 0; s2 < 4; s2++) {
    const th = (s2 % 2 ? 1 : -1) * 0.95;
    const t = 0.20 + s2 * 0.19;
    const z = lerp(z0, z1, t), y = yc(t);
    b.push(RZ(th));
    at(b, rad + 0.15, 0, z, () => { box(b, 0.5, 11.2, 18.4, BRD, M_BRASSD); });
    at(b, rad + 0.5, 0, z, () => { box(b, 0.6, 9.4, 16.6, mixc(PNL, IVS, 0.35), M_PANEL2); });
    b.pop();
  }
  // ---- 6 条纵向桁架
  for (let k = 0; k < 6; k++) {
    const th = (k / 6) * TAU + 0.5;
    const cs = Math.cos(th), sn = Math.sin(th);
    const rl = rad + 1.6;
    const pp = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8, z = lerp(z0 + 6, z1 - 6, t);
      pp.push([cs * rl, yc(t) + sn * rl, z]);
    }
    for (let i = 0; i < 8; i++) {
      beamPath(b, [pp[i], pp[i + 1]], 1.5, 1.5, mixc(IVS, BRD, 0.32), M_HULL2, { caps: false });
    }
  }
  // ---- 三排窗（每排 8 扇）
  const ROWS = [90, 32, 148];     // 局部极角（度）：顶窗 + 两侧上斜窗
  for (const rowDeg of ROWS) {
    const th = rowDeg * DEG;
    for (let k = 0; k < 8; k++) {
      const t = 0.10 + (k / 7) * 0.80;
      spokeWindow(b, th, lerp(z0, z1, t), yc(t), 0.155, 21, rad);
    }
  }
  // ---- 两侧管束
  for (const th of [-24 * DEG, -156 * DEG]) {
    const cs = Math.cos(th), sn = Math.sin(th), rl = rad + 3.6;
    const pp = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      pp.push([cs * rl, yc(t) + sn * rl, lerp(z0 + 9, z1 - 9, t)]);
    }
    tubePts(b, pp, 3.1, 8, () => PIPE_COL, M_STEEL, { caps: false });
    for (let i = 1; i < 8; i += 2) {
      const p = pp[i];
      at(b, p[0], p[1], p[2], () => { box(b, 7.6, 1.3, 3.4, STLD, M_STEELD); });
    }
  }
  // ---- 3 个外挂胶囊舱（发光小舱）
  for (let k = 0; k < CORE.spokePods; k++) {
    const t = 0.20 + 0.27 * k;
    const z = lerp(z0, z1, t), y = yc(t);
    spokePod(b, y - rad, z);
  }
  // ---- 两端法兰
  at(b, 0, 0, z0 + 8, () => {
    cylZ(b, rad - 3, rad + 9, -4, 4, 20, BRD, M_BRASSD, 1);
    ringXY(b, rad + 9, rad + 15, 4, 20, BR, M_BRASS, 1);
    ringXY(b, rad + 9, rad + 15, -4, 20, BR, M_BRASS, -1);
  });
  at(b, 0, 0, CORE.spokeR1 - 4, () => {
    cylZ(b, rad - 2, rad + 12, -3, 3, 24, BRD, M_BRASSD, 1);
    ringXY(b, rad + 12, rad + 20, 3, 24, BR, M_BRASS, 1);
    ringXY(b, rad + 12, rad + 20, -3, 24, BR, M_BRASS, -1);
    for (let k = 0; k < 24; k++) {
      const tt = (k / 24) * TAU;
      at(b, Math.cos(tt) * (rad + 16), Math.sin(tt) * (rad + 16), 3.6, () => { box(b, 1.5, 1.5, 1.2, BRD, M_BRASSD); });
    }
  });
  // 环带侧的 6 根斜撑（与环带内沿的结构过渡）
  for (let k = 0; k < 6; k++) {
    const th = (k / 6) * TAU + 0.3;
    const p0 = [Math.cos(th) * (rad + 4), Math.sin(th) * (rad + 4), CORE.spokeR1 - 26];
    const p1 = [Math.cos(th) * (rad + 26), Math.sin(th) * (rad + 26), CORE.spokeR1 - 2];
    beamPath(b, [p0, p1], 2.4, 2.4, IVS, M_HULL2);
  }
  b.pop();
}

function spokeWindow(b, th, z, y, dth, len, rad) {
  const cs = Math.cos(th), sn = Math.sin(th);
  const rp = rad + 0.18;
  const p = (tt, zz) => [Math.cos(tt) * rp, y + Math.sin(tt) * rp, zz];
  const N = [cs, sn, 0];
  const zA = z - len / 2, zB = z + len / 2;
  b.quad(p(th - dth, zA), p(th + dth, zA), p(th + dth, zB), p(th - dth, zB), PANE, M_WIN, N);
  // 窗套（略凸）
  const rq = rad + 0.42;
  const q = (tt, zz) => [Math.cos(tt) * rq, y + Math.sin(tt) * rq, zz];
  const e = 0.055;
  b.quad(q(th - dth - 0.012, zA - e), q(th + dth + 0.012, zA - e), q(th + dth + 0.012, zA - 0.02), q(th - dth - 0.012, zA - 0.02), BRD, M_BRASSD, N);
  b.quad(q(th - dth - 0.012, zB + 0.02), q(th + dth + 0.012, zB + 0.02), q(th + dth + 0.012, zB + e), q(th - dth - 0.012, zB + e), BRD, M_BRASSD, N);
  b.quad(q(th - dth - 0.012, zA), q(th - dth - 0.004, zA), q(th - dth - 0.004, zB), q(th - dth - 0.012, zB), BRD, M_BRASSD, N);
  b.quad(q(th + dth + 0.004, zA), q(th + dth + 0.012, zA), q(th + dth + 0.012, zB), q(th + dth + 0.004, zB), BRD, M_BRASSD, N);
  // 中挺
  b.quad(p(th - 0.012, z), p(th + 0.012, z), p(th + 0.012, zB), p(th - 0.012, zB), BRD, M_BRASSD, N);
}

function spokePod(b, yTop, z) {
  const y = yTop - 22;
  // 吊架
  beamPath(b, [[0, yTop - 1, z - 6], [0, yTop - 6, z - 3], [0, y + 5, z - 1]], 2.2, 2.2, IVS, M_HULL2);
  beamPath(b, [[0, yTop - 1, z + 6], [0, yTop - 6, z + 3], [0, y + 5, z + 1]], 2.2, 2.2, IVS, M_HULL2);
  // 舱体
  at(b, 0, y, z, () => {
    ellipsoid(b, 5.4, 5.0, 13.0, 10, 5, IV, M_HULL, {
      colFn: (v) => mixc(IV, IVS, 0.15 + 0.3 * v),
    });
    ellipsoid(b, 5.5, 5.1, 4.0, 10, 3, mixc(IVS, BRD, 0.2), M_HULL2);
    bandF(b, 5.0, 5.8, -1.2, 1.2, 0, TAU, 16, BR, M_BRASS, {});
    // 6 扇窗
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU;
      atAz(b, a, () => {
        b.quad([-1.9, -1.4, 5.1], [1.9, -1.4, 5.1], [1.9, 2.2, 5.1], [-1.9, 2.2, 5.1], WARM, M_WIN, [0, 0, 1]);
      });
    }
    at(b, 0, 5.2, 0, () => { box(b, 3.2, 1.6, 5.0, BRD, M_BRASSD); });
    at(b, 0, -5.4, 0, () => { box(b, 2.4, 1.4, 7.0, BRD, M_BRASSD); });
  });
}

// ============================================================ 中庭内景
function buildNave(b, R) {
  const Y = CORE.naveFloorY + 0.02;
  const NR = CORE.naveR;
  // ---- 圆盘铺装（同心环 + 放射缝）
  const RINGS = [26, 33, 40, 47, 54, 61, 68, 75, 82, 89, 96, 103, 110, 118];
  for (let i = 0; i < RINGS.length - 1; i++) {
    ringF(b, RINGS[i], RINGS[i + 1], Y, 0, TAU, 48, i % 2 ? FLOOR_A : FLOOR_B, M_NAVE, 1);
    if (i < RINGS.length - 2) {
      ringF(b, RINGS[i + 1] - 0.14, RINGS[i + 1] + 0.14, Y + 0.014, 0, TAU, 48, FLOOR_D, M_NAVE2, 1);
    }
  }
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * TAU;
    b.quad(P(a - 0.004, 26, Y + 0.016), P(a + 0.004, 26, Y + 0.016), P(a + 0.004, NR, Y + 0.016), P(a - 0.004, NR, Y + 0.016),
      FLOOR_D, M_NAVE2, [0, 1, 0]);
  }
  // 外圈压边 + 与鼓座内墙的收口
  bandF(b, NR - 5.5, NR, Y - 0.1, Y + 0.35, 0, TAU, 72, NAVE_MB, M_NAVE, { topCol: NAVE_IV });
  bandF(b, NR - 6.4, NR - 5.5, Y, Y + 0.55, 0, TAU, 72, BR_IN, M_BRASS_IN, { noIn: true });
  ringF(b, NR, CORE.drumRi + 0.4, Y, 0, TAU, 72, NAVE_ST, M_NAVE2, 1);
  // ---- 中央星图马赛克（金色线条，emissive 0.14）
  at(b, 0, Y + 0.03, 0, () => {
    disc(b, 26, 48, mixc(FLOOR_D, GL_IN2, 0.45), M_NAVE2);
    for (const [r0, r1] of [[24.8, 26], [17.6, 18.2], [8.8, 9.4]]) {
      ringF(b, r0, r1, 0, 0, TAU, 48, AMB, M_MOSAIC, 1);
    }
    // 8 条主航道（自中心放射到 r=25）
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      b.quad(P(a - 0.008, 9.2, 0), P(a + 0.008, 9.2, 0), P(a + 0.013, 24.8, 0), P(a - 0.013, 24.8, 0), AMB, M_MOSAIC, [0, 1, 0]);
    }
    // 6 条弧形航道
    for (let k = 0; k < 6; k++) {
      const a0 = (k / 6) * TAU;
      for (let s = 0; s < 6; s++) {
        const t0 = s / 6, t1 = (s + 1) / 6;
        const pt = (t) => {
          const ang = a0 + t * 0.9, rr = lerp(10, 24, t);
          return P(ang, rr, 0);
        };
        b.quad(pt(t0), pt(t1), P(a0 + t1 * 0.9 + 0.02, lerp(10, 24, t1), 0), P(a0 + t0 * 0.9 + 0.02, lerp(10, 24, t0), 0), mulc(AMB, 0.85), M_MOSAIC, [0, 1, 0]);
      }
    }
    // 5 颗行星（金色小环）
    const planets = [[7, 0.6], [12, 2.1], [18, 3.9], [20, 5.2], [15, 4.4]];
    for (const [rr, aa] of planets) {
      ringF(b, rr - 0.9, rr + 0.9, 0.005, aa, aa + 0.34, 8, AMB, M_MOSAIC, 1);
    }
    // 中心罗盘星
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      b.tri([0, 0.01, 0], P(a - 0.05, 8.4, 0.01), P(a + 0.05, 8.4, 0.01), AMB, M_MOSAIC, [0, 1, 0], [0, 1, 0], [0, 1, 0]);
    }
  });
  // ---- 中庭柱列（16 根，落在窗间墙的位置）
  for (const c of WIN_AZ) {
    const a = c + (PI * 2) / CORE.drumWindows / 2;
    atAz(b, a, () => {
      at(b, 0, Y, 119.2, () => {
        cylinder(b, 10, 1.3, 1.05, 46, NAVE_IV, M_NAVE, { y0: 0, caps: false });
        at(b, 0, 22, 0, () => { box(b, 3.0, 1.2, 3.0, BR_IN, M_BRASS_IN); });
        at(b, 0, 46.6, 0, () => { box(b, 3.4, 2.4, 3.4, NAVE_MB, M_NAVE); });
        at(b, 0, 0.4, 0, () => { box(b, 3.2, 0.9, 3.2, NAVE_ST, M_NAVE2); });
      });
    });
  }
  // 檐部 / 墙裙（鼓座内墙的古典三段式）—— 北门洞扇区必须断开，否则会把门洞封住
  const skipDoor = (a) => Math.abs(wrapPi(a)) < MOUTH_AZ + 0.012;
  bandF(b, 118.4, CORE.drumRi, Y - 0.2, Y + 5.6, 0, TAU, 72, NAVE_ST, M_NAVE2, { topCol: NAVE_IV, skip: skipDoor });
  bandF(b, 118.2, CORE.drumRi, Y + 5.6, Y + 6.4, 0, TAU, 72, BR_IN, M_BRASS_IN, { noIn: true, skip: skipDoor });
  bandF(b, 118.2, CORE.drumRi, 119.4, 123.4, 0, TAU, 72, NAVE_MB, M_NAVE, { topCol: NAVE_IV, skip: skipDoor });
  bandF(b, 118.0, CORE.drumRi, 123.4, 124.2, 0, TAU, 72, BR_IN, M_BRASS_IN, { noIn: true, skip: skipDoor });
  // ---- 鲸鱼摇篮祭坛（三层圆台 + 8 铜灯 + 中央铜盆）
  for (let k = 0; k < 3; k++) {
    const r0 = 26 - k * 5.2, r1 = r0 + 5.4;
    bandF(b, r0, r1, Y, Y + 0.5 + k * 0.55, 0, TAU, 40, k % 2 ? NAVE_ST : NAVE_MB, M_NAVE, { topCol: NAVE_IV });
  }
  ringF(b, 12.4, 22.6, Y + 1.62, 0, TAU, 40, NAVE_MB, M_NAVE, 1);
  bandF(b, 12.0, 13.0, Y + 1.62, Y + 2.3, 0, TAU, 32, BR_IN, M_BRASS_IN, { topCol: BRH });
  ringF(b, 0, 3.2, Y + 1.75, 0, TAU, 24, mixc(AMB, WARM, 0.5), M_LAMP2, 1);
  ringF(b, 2.6, 3.2, Y + 1.76, 0, TAU, 24, BRH, M_BRASS, 1);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU + PI / 8;
    atAz(b, a, () => {
      at(b, 0, Y + 0.4, 15.5, () => {
        cylinder(b, 8, 0.42, 0.38, 3.6, BR_IN, M_BRASS_IN, { y0: 0, caps: false });
        at(b, 0, 3.6, 0, () => { cylinder(b, 10, 0.9, 0.5, 0.7, BRD, M_BRASSD, { y0: 0 }) ; });
        at(b, 0, 4.3, 0, () => { sphere(b, 0.55, WARM, M_LAMP, { rings: 3, seg: 8, jitter: 0.05, seed: 6 }); });
      });
    });
  }
  // ---- 4 座观星仪
  for (const ad of [45, 135, 225, 315]) buildArmillary(b, ad * DEG);
  // ---- 黄铜鲸骨
  buildWhale(b, R);
  // ---- 12 串风铃
  buildChimes(b, R);
}

function buildArmillary(b, a) {
  const Y = CORE.naveFloorY + 0.02;
  at(b, Math.sin(a) * CORE.armillaryR, 0, Math.cos(a) * CORE.armillaryR, () => {
    // 三级八角基座
    for (let k = 0; k < 3; k++) {
      const rr = 6.4 - k * 0.9;
      lathe(b, [[rr, Y + k * 0.7], [rr - 0.5, Y + k * 0.7 + 0.5], [rr - 1.4, Y + k * 0.7 + 0.7]], 8, k % 2 ? NAVE_MB : NAVE_ST, M_NAVE);
    }
    // 基座立柱
    lathe(b, [[0, Y + 2.1], [1.9, Y + 2.1], [1.5, Y + 3.2], [0.9, Y + 5.4], [1.2, Y + 6.4], [0.8, Y + 7.0]], 12, BR_IN, M_BRASS_IN);
    // 浑天仪四环（黄铜，中心 y=+9.5）
    const CY = Y + 9.5;
    at(b, 0, CY, 0, () => { torus(b, 5.4, 0.26, 24, 4, BR, M_BRASS, 'y'); });
    at(b, 0, CY, 0, () => { torus(b, 5.4, 0.26, 24, 4, BR, M_BRASS, 'z'); });
    at(b, 0, CY, 0, () => { b.push(RY(PI / 2)); torus(b, 5.4, 0.26, 24, 4, BR, M_BRASS, 'z'); b.pop(); });
    at(b, 0, CY, 0, () => { b.push(RX(0.42)); torus(b, 4.6, 0.22, 24, 4, mulc(BR, 0.9), M_BRASSD, 'z'); b.pop(); });
    // 极轴 + 中心球
    at(b, 0, CY, 0, () => { sphere(b, 0.95, BRH, M_BRASS, { rings: 3, seg: 8, jitter: 0.02, seed: 7 }); });
    b.push(T(0, CY, 0)); b.push(RX(0.42));
    bar3(b, [0, -6.4, 0], [0, 6.4, 0], 0.34, 0.34, BR_MID, M_BRASSD);
    b.pop(); b.pop();
    // 青绿微光刻度环
    at(b, 0, CY + 1.4, 0, () => { torus(b, 2.2, 0.16, 16, 3, CYD, M_GLOWD, 'y'); });
  });
}

// ============================================================ 黄铜鲸骨（46 m，离地 34 m）
const WHALE_SC = CORE.whaleLen / 46;   // 鲸骨整体缩放（lead 允许 ≤60 m）
const WHALE_SPINE = (() => {
  const out = [];
  const N = 13;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    out.push([lerp(-20, 18, t) * WHALE_SC, 2.0 + 1.9 * Math.sin(t * PI), 0]);
  }
  return out;
})();
function buildWhale(b, R) {
  const CY = CORE.whaleY;
  const SC = WHALE_SC;
  const base = [0, CY, 0];
  const W = (p) => [base[0] + p[0], base[1] + p[1], base[2] + p[2]];
  // 脊椎 + 椎骨
  for (let i = 0; i < WHALE_SPINE.length; i++) {
    const [x, y] = WHALE_SPINE[i];
    at(b, base[0] + x, base[1] + y, base[2], () => {
      box(b, 2.6, 2.8, 3.4, BR_IN, M_BRASS_IN, { topCol: BRH, bottomCol: mulc(BR_IN, 0.8) });
      box(b, 0.8, 3.0, 1.3, BR_MID, M_BRASSD);
      at(b, 0, -2.0, 0, () => { box(b, 0.9, 2.4, 1.2, BR_MID, M_BRASSD); });
      if (i % 2 === 0) {
        at(b, 0, 0, 0, () => { cylinder(b, 10, 1.5, 1.3, 2.7, BR, M_BRASS, { y0: -1.35, caps: false }); });
      }
    });
  }
  // 肋骨拱（11 对）：胸腔中段最深，向头尾收小 —— 这是"鲸"的读法关键
  const RIB = [
    [0, -0.4, 1.3], [0, -3.8, 7.8], [0, -8.0, 12.8],
    [0, -12.4, 15.0], [0, -16.2, 12.8], [0, -18.6, 6.8],
  ];
  const tipPts = [[], []];
  for (let i = 1; i < WHALE_SPINE.length - 1; i++) {
    const [x, y] = WHALE_SPINE[i];
    const t = i / (WHALE_SPINE.length - 1);
    const sc = 0.46 + 0.54 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.04)), 0.7);
    for (const s of [-1, 1]) {
      const pts = RIB.map(([dx, dy, dz]) => W([x + dx * SC, y + dy * sc * SC, s * dz * sc * SC]));
      const rr = 0.84 * SC * (0.72 + 0.28 * sc);
      tubePts(b, pts, rr, 5, () => BR_IN, M_BRASS_IN, { caps: true });
      tipPts[s < 0 ? 0 : 1].push(pts[5]);
    }
  }
  // 腹线（把肋尖串起来，侧看才像骨架而不是一排栅栏）
  for (const tips of tipPts) beamPath(b, tips, 0.5, 0.5, BR_IN, M_BRASS_IN, { caps: false });
  // 胸骨/龙骨
  beamPath(b, [W([-6 * SC, -10.4 * SC, 0]), W([6 * SC, -11.2 * SC, 0]), W([14 * SC, -9.6 * SC, 0])], 1.5 * SC, 1.5 * SC, BR_IN, M_BRASS_IN);
  // 头骨
  at(b, base[0] + 20.2 * SC, base[1] + 2.0 * SC, base[2], () => {
    ellipsoid(b, 3.9 * SC, 2.7 * SC, 3.0 * SC, 10, 5, BR_IN, M_BRASS_IN);
    at(b, 0, 1.9 * SC, 0, () => { box(b, 5.4 * SC, 1.2 * SC, 1.8 * SC, BR_MID, M_BRASSD); });
    at(b, 0, 0.4 * SC, 0, () => { box(b, 1.2 * SC, 1.0 * SC, 4.4 * SC, BR_MID, M_BRASSD); });
    for (const s of [-1, 1]) {
      at(b, 0.4, 0.2, s * 2.5 * SC, () => { torus(b, 1.0 * SC, 0.26 * SC, 8, 4, BRH, M_BRASS, 'z'); });
      beamPath(b, [W([18.6 * SC, -0.6 * SC, s * 2.1 * SC]), W([21.6 * SC, -1.6 * SC, s * 1.7 * SC]), W([23.0 * SC, -2.3 * SC, s * 1.2 * SC])], 0.75 * SC, 0.9 * SC, BR_IN, M_BRASS_IN);
    }
  });
  // 尾椎 + 尾鳍
  for (let k = 0; k < 3; k++) {
    at(b, base[0] - (21.2 + k * 1.0) * SC, base[1] + (1.5 - k * 0.4) * SC, base[2], () => {
      box(b, 1.4 * SC, 1.2 * SC, 1.6 * SC, BR_IN, M_BRASS_IN);
    });
  }
  for (const s of [-1, 1]) {
    const p0 = W([-22.2 * SC, 1.6 * SC, 0]);
    const p1 = W([-25.4 * SC, 0.4 * SC, s * 11.0 * SC]);
    const p2 = W([-19.6 * SC, -0.6 * SC, s * 3.6 * SC]);
    b.tri(p0, p1, p2, BR_IN, M_BRASS_IN, [0, 1, 0], [0, 1, 0], [0, 1, 0]);
    b.tri(p0, p2, p1, mulc(BR_IN, 0.8), M_BRASS_IN, [0, -1, 0], [0, -1, 0], [0, -1, 0]);
  }
  // 6 根细吊索 → 穹顶内肋
  const topR = 36, topY = CORE.domeY + Math.sqrt(Math.max(0, CORE.domeRi * CORE.domeRi - topR * topR));
  const bottomX = [-17, -10, -3, 4, 11, 19].map((x) => x * SC);
  const topAz = [250, 292, 334, 26, 68, 110];
  for (let k = 0; k < CORE.whaleCables; k++) {
    const x = bottomX[k];
    const idx = Math.round(lerp(2, 11, (x / SC + 14) / 30));
    const sy = WHALE_SPINE[Math.min(WHALE_SPINE.length - 1, idx)][1];
    const p0 = W([x, sy + 2.4, 0]);
    const p1 = [Math.sin(topAz[k] * DEG) * topR, topY, Math.cos(topAz[k] * DEG) * topR];
    beamPath(b, [p0, [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2 + 2, (p0[2] + p1[2]) / 2], p1], 0.5, 0.5, BR_MID, M_BRASSD, { up: [1, 0, 0] });
    at(b, p0[0], p0[1], p0[2], () => { box(b, 1.2, 0.7, 1.2, BRH, M_BRASS); });
    at(b, p1[0], p1[1], p1[2], () => { box(b, 1.6, 0.8, 1.6, BRH, M_BRASS); });
  }
}

// ============================================================ 环形回廊（y=96, r=108）
function buildPromenade(b, R) {
  const Y = CORE.promenadeY, ri = CORE.promenadeRi, ro = CORE.promenadeRo;
  // 桥面
  ringF(b, ri, ro, Y, 0, TAU, 64, NAVE_MB, M_NAVE, 1);
  ringF(b, ri, ro, Y - 1.4, 0, TAU, 64, mulc(NAVE_ST, 0.8), M_NAVE2, -1);
  bandF(b, ri - 0.5, ri + 0.6, Y - 1.4, Y, 0, TAU, 64, BR_IN, M_BRASS_IN, { topCol: BRH });
  bandF(b, ro - 0.6, ro + 0.7, Y - 1.4, Y, 0, TAU, 64, NAVE_ST, M_NAVE2, { topCol: NAVE_MB });
  // 24 根支柱（落到中庭地面）
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * TAU + 0.06;
    atAz(b, a, () => {
      at(b, 0, CORE.naveFloorY, 110, () => {
        cylinder(b, 8, 1.05, 0.8, 28.5, NAVE_IV, M_NAVE, { y0: 0, caps: false });
        at(b, 0, 0.3, 0, () => { box(b, 2.6, 0.7, 2.6, NAVE_ST, M_NAVE2); });
        at(b, 0, 28.6, 0, () => { box(b, 2.8, 1.5, 2.8, NAVE_MB, M_NAVE); });
      });
    });
  }
  // 内侧栏杆
  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * TAU;
    atAz(b, a, () => {
      at(b, 0, Y + 1.0, ri + 0.2, () => { box(b, 0.28, 2.0, 0.28, BR_IN, M_BRASS_IN); });
    });
  }
  bandF(b, ri + 0.05, ri + 0.55, Y + 1.9, Y + 2.3, 0, TAU, 64, BR_IN, M_BRASS_IN, { topCol: BRH });
  bandF(b, ri + 0.1, ri + 0.5, Y + 0.9, Y + 1.15, 0, TAU, 64, BR_MID, M_BRASSD, { noIn: true, noTop: true });
  // 16 组吊灯（吊在桥面下）
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * TAU + PI / 16;
    atAz(b, a, () => {
      at(b, 0, 0, 106.5, () => {
        b.push(T(0, Y - 1.4, 0));
        beamPath(b, [[0, 0, 0], [0, -4.0, 0]], 0.16, 0.16, BR_MID, M_BRASSD, { up: [1, 0, 0] });
        at(b, 0, -6.4, 0, () => {
          lathe(b, [[0, -1.5], [1.25, -1.0], [1.15, 0.2], [0.7, 0.9], [0.2, 1.3]], 10, BR_IN, M_BRASS_IN);
          at(b, 0, -0.2, 0, () => { sphere(b, 0.7, WARM, M_LAMP, { rings: 3, seg: 8, jitter: 0.04, seed: 7 }); });
        });
        b.pop();
      });
    });
  }
  // 8 个花池 + 8 条长凳 + 16 面旗帜
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU + 0.24;
    atAz(b, a, () => {
      at(b, 0, Y, 113.4, () => {
        bandF(b, 0, 2.4, 0, 1.5, 0, TAU, 12, NAVE_ST, M_NAVE2, {});
        at(b, 0, 1.5, 0, () => {
          sphere(b, 2.0, C.leafDark, M_MOSS, { rings: 3, seg: 7, jitter: 0.35, seed: 3 + k });
          at(b, 0.6, 1.1, 0.4, () => { sphere(b, 1.3, C.leaf, M_LEAF, { rings: 3, seg: 6, jitter: 0.4, seed: 5 + k }); });
          at(b, -0.8, 0.9, -0.5, () => { sphere(b, 1.1, C.leafLight, M_LEAF, { rings: 2, seg: 6, jitter: 0.4, seed: 8 + k }); });
        });
      });
      at(b, 0, Y, 111.6, () => {
        box(b, 4.2, 0.32, 1.3, NAVE_MB, M_NAVE, { topCol: NAVE_IV });
        at(b, -1.7, -0.45, 0, () => { box(b, 0.5, 0.9, 1.1, NAVE_ST, M_NAVE2); });
        at(b, 1.7, -0.45, 0, () => { box(b, 0.5, 0.9, 1.1, NAVE_ST, M_NAVE2); });
      });
    });
  }
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * TAU;
    atAz(b, a, () => {
      at(b, 0, Y + 2.3, ri + 0.3, () => {
        beamPath(b, [[0, 0, 0], [0, 1.2, 1.0], [0, 0.4, 2.2]], 0.2, 0.2, BR_MID, M_BRASSD, { up: [1, 0, 0] });
      });
      b.push(T(0, Y + 3.6, 0));
      b.push(RY(a));
      b.push(T(0, 0, ri + 1.4));
      const bc = k % 2 ? mulc(C.bloomPink, 0.45) : mulc(C.bloomYellow, 0.42);
      b.quad([-1.25, 0, 0], [1.25, 0, 0], [1.25, -6.2, 0], [-1.25, -6.2, 0], mulc(bc, 0.9), M_LEAF, [0, 0, 1]);
      b.quad([1.25, 0, 0], [-1.25, 0, 0], [-1.25, -6.2, 0], [1.25, -6.2, 0], mulc(bc, 0.7), M_LEAF, [0, 0, -1]);
      b.pop(); b.pop(); b.pop();
    });
  }
}

// ============================================================ 12 串风铃 / 星灯
function buildChimes(b, R) {
  for (let k = 0; k < 12; k++) {
    const a = (15 + 30 * k) * DEG;
    const r = 104;
    const topY = CORE.domeY + Math.sqrt(Math.max(0, CORE.domeRi * CORE.domeRi - r * r));
    const len = 78 + (k % 4) * 7.5;
    const botY = topY - len;
    atAz(b, a, () => {
      at(b, 0, 0, r, () => {
        at(b, 0, topY, 0, () => { torus(b, 1.5, 0.4, 10, 4, BR, M_BRASS, 'y'); });
        beamPath(b, [[0, topY - 0.8, 0], [0, botY + 8, 0]], 0.14, 0.14, BR_MID, M_BRASSD, { up: [1, 0, 0] });
        for (let i = 0; i < 3; i++) {
          const y = botY + i * 1.2 + 4.4 * i;
          at(b, 0, y, 0, () => {
            lathe(b, [[0, 0.2], [0.95, 0.1], [0.85, -0.9], [0.5, -1.5], [0.14, -1.7]], 10, BR_IN, M_BRASS_IN);
            at(b, 0, -0.5, 0, () => { sphere(b, 0.34, BRH, M_BRASS, { rings: 2, seg: 6, jitter: 0.03, seed: 4 + i }); });
          });
        }
        at(b, 0, botY, 0, () => { sphere(b, 0.62, CY, M_LAMP, { rings: 3, seg: 8, jitter: 0.05, seed: 9 + k }); });
      });
    });
  }
}

// ============================================================ 点光（≤8）/ 静态 billboard / 交接
// ============================================================ 点光（≤8）/ 静态 billboard / 交接
function pushLights(ctx) {
  const L = [
    { p: [0, 96, 0], col: WARM, range: 64, int: 0.80 },         // 鲸鱼摇篮祭坛（暖金 1）
    { p: [0, 71, 30], col: WARM, range: 60, int: 0.45 },        // 星图马赛克（暖金 2）
    { p: [0, 100, 100], col: WARM, range: 70, int: 0.62 },      // 门厅（暖金 3）
    { p: [0, 110, -74], col: WARM, range: 80, int: 0.55 },      // 环形回廊（暖金 4）
    { p: [49, 80, 49], col: CY, range: 62, int: 0.62 },         // 观星仪 NE（青绿 1）
    { p: [-49, 80, -49], col: CY, range: 62, int: 0.62 },       // 观星仪 SW（青绿 2）
    { p: [0, CORE.lanternY0 + 18, 0], col: CY, range: 150, int: 0.85 },  // 顶部信标
    { p: [0, -272, 0], col: CY, range: 120, int: 0.60 },        // 底部引擎喷口
  ];
  for (const l of L) ctx.points.push({ p: l.p, col: l.col, range: l.range, int: l.int });
}

function pushLanterns(ctx) {
  const add = (p, size, shape, col, alpha) => ctx.lanterns.push({ p, size, rot: 0, alpha: alpha ?? 0.9, shape, col });
  add([0, CORE.lanternY0 + 33, 0], 26, 1, CY, 0.80);            // 顶部信标光晕
  add([0, CORE.domeY + CORE.domeR + 20, 0], 13, 1, WARM, 0.55); // 采光塔
  for (const ad of CORE.spokeAzDeg) add(P(ad * DEG, 104, 0), 9, 0, WARM, 0.78);   // 6 个对接环
  add([0, 106, 146], 18, 0, WARM, 0.50);                        // 门厅暖光
  for (const s of [-1, 1]) add([s * 68, 112, 140], 9, 1, CY, 0.62);   // 2 根导向灯柱
  for (let k = 0; k < 12; k++) {
    const a = (15 + 30 * k) * DEG;
    const r = 104;
    const topY = CORE.domeY + Math.sqrt(Math.max(0, CORE.domeRi * CORE.domeRi - r * r));
    add(P(a, r, topY - (78 + (k % 4) * 7.5)), 3.2, 0, WARM, 0.85);   // 12 串风铃光点
  }
  for (let k = 0; k < 16; k++) add(P((k / 16) * TAU + PI / 16, 106.5, 88), 2.6, 0, WARM, 0.85);  // 16 组吊灯
  for (const ad of [45, 135, 225, 315]) add(P(ad * DEG, 70, 80.5), 4.2, 0, CY, 0.62);           // 4 座观星仪
  for (let k = 0; k < 8; k++) add(P((k / 8) * TAU + PI / 8, 15.5, 72.5), 2.2, 0, WARM, 0.80);   // 8 铜灯
}

// ============================================================ 入口
export function buildStationCore(b, ctx) {
  const R = mulberry32(SEED);
  if (b && typeof b.note === 'function') b.note('stationCore');
  buildLowerTower(b, R);
  buildHub(b, R);
  buildDrum(b, R);
  buildDome(b, R);
  buildPylons(b, R);
  buildSpire(b, R);
  for (const ad of CORE.spokeAzDeg) buildSpoke(b, ad * DEG, R);
  buildNave(b, R);
  buildPromenade(b, R);
  pushLights(ctx);
  pushLanterns(ctx);
  ctx.props.core = {
    dome: { p: [0, CORE.domeY, 0], r: CORE.domeR, ri: CORE.domeRi, ribs: CORE.ribCount, rings: CORE.ringCount },
    nave: {
      floorY: CORE.naveFloorY, r: CORE.naveR,
      promenadeY: CORE.promenadeY, promenadeR: CORE.promenadeR,
      armillaryR: CORE.armillaryR,
    },
    mouth: {
      p: [0, (CORE.mouth.y0 + CORE.mouth.yTop) / 2, CORE.drumRo],
      dir: [0, 0, 1], azHalfDeg: CORE.mouth.azHalfDeg,
      y0: CORE.mouth.y0, yTop: CORE.mouth.yTop,
      width: CORE.mouth.width, height: CORE.mouth.height,
    },
    cradle: { p: [0, CORE.whaleY, 0], len: CORE.whaleLen, cables: CORE.whaleCables },
    spokes: CORE.spokeAzDeg.map((d) => ({ azDeg: d, r0: CORE.spokeR0, r1: CORE.spokeR1, rad: CORE.spokeRad })),
    spire: { top: CORE.spireTop, lanternY: CORE.lanternY0 },
  };
}
