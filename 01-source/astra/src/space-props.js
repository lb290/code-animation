// space-props.js — 星鲸环 ASTRA · 站外的太空环境与生命（Round 15 · task-3 · props）
//
// 天空（星云 / 环带巨行星 / 恒星 / 星场）在 glsl/space-sky.fs 里，本文件只做「有体积的道具」：
//   1. 小行星与碎屑 —— 三条漂移带 + 远处散点（噪声岩体，少量冰蓝反光面）
//   2. 星座鲸       —— 3 头用发光点与细线勾出的巨大鲸形星座（本模块的主视觉）
//   3. 货运飞船     —— 3 艘：系泊 / 进港 / 远航剪影（象牙白 + 深蓝裙板 + 黄铜）
//   4. 探针浮标     —— 8 个，其中 2 个带天线碟
//   5. 光尘         —— 500 个动态 billboard（ctx.bbDyn，additive，缓慢漂移）
//   6. 远景姊妹站   —— 2 个 >3000 m 的低对比环塔剪影，给星空纵深
//
// 美术方向：太空里的 Beaux-Arts —— 象牙白 + 黄铜饰线 + 暖金舷窗 + 青绿灯带，
// 不是通用科幻灰盒子。远看有大形，近看有面板缝、铆钉带、管束、灯。
//
// 纪律：
//   · 不接收共享 rng，模块内部自有 mulberry32(0x57A11003)；两次构建逐三角相同。
//   · 材质 mat=[emissive, gloss]；太空没有环境光，任何面 emissive 不得低于 0.02。
//   · 坐标：真实米，站心 (0,0,0)，Y = 环轴；位置全部是本文件里的常量表。
import {
  TAU, clamp, lerp, mulberry32, noise2, noise3, fbm2, fbm3,
  norm, sub, add, cross, dot, len, scale as vs, m4,
  rgb, mixc, mulc, box, cylinder, lathe, torus, sphere, disc,
  tubePath, extrudeXY, extrudeXZ, bar3,
} from './engine.js';
import { ST, L } from './layout.js';
import { C, LOOK } from './palette.js';

// ---------------------------------------------------------------- 局部色
// palette.js 由 lead 维护（不改），这里只放本模块需要的新颜色（带注释）。
const ROCK_A = rgb('#5d5043');     // 小行星：暖灰褐（受光面）
const ROCK_B = rgb('#241f1a');     // 小行星：暗部（不是纯黑）
const ROCK_C = rgb('#8a7862');     // 小行星：最亮棱面
const ICE = rgb('#a9cfe6');        // 小行星：冰蓝反光面
const WHALE_C = rgb('#dfeaff');    // 星座鲸：冷白星光
const WHALE_W = rgb('#ffe6bc');    // 星座鲸：暖白星光
const WHALE_LINE = rgb('#9fe4ff'); // 星座鲸：连线青
const BUOY_RED = rgb('#ff5a4a');   // 浮标：红色航行灯
const SHIP_GREEN = rgb('#6affb0'); // 飞船：右舷绿灯
const PLUME_HOT = rgb('#fff4dc');  // 尾焰：白热
const PLUME_WARM = rgb('#ff9a4a'); // 尾焰：橙

// 色板常用色的本地别名（只读引用 palette.js，不改它）
const IVORY = C.ivory;
const HULL = C.hullWhite;
const HULL_DEEP = C.hullBlue;
const HULL_TEAL = C.hullTeal;
const PANEL_D = C.panelDeep;
const GLASS = C.glass;
const GLASSD = C.glassDeep;
const BRASS = C.brass;
const BRASS_HI = C.brassHi;
const BRASS_D = C.brassDark;

// 材质（lit.fs: mat = [emissive, gloss]）
const M = {
  hull: [0.02, 0.34],      // 船壳（太空基线）
  blue: [0.02, 0.30],      // 深蓝裙板
  teal: [0.02, 0.32],      // 舱段
  brass: [0.06, 0.86],     // 黄铜饰线
  brassDark: [0.04, 0.72],
  glass: [0.16, 0.95],     // 舷窗玻璃
  win: [0.85, 0.10],       // 暖金舷窗光
  winDim: [0.55, 0.10],
  cyan: [0.95, 0.05],      // 青绿灯带
  dark: [0.03, 0.45],      // 深色机械
  rock: [0.02, 0.14],      // 岩石
  ice: [0.05, 0.55],       // 冰面
  whaleLine: [1.02, 0.06], // 星座线（备用：更亮的轮廓）
  whaleLineDim: [0.42, 0.05], // 星座线（内部结构，压暗）
  whaleLineFaint: [0.30, 0.05], // 星座鲸轮廓细管：很淡，只勾出形状
  sister: [0.025, 0.30],   // 远景剪影
  sisterWin: [0.38, 0.10], // 远景剪影的微光窗
  plume: [1.06, 0.04],     // 尾焰
  plumeRim: [0.92, 0.05],  // 激波环
};

// ---------------------------------------------------------------- 位置常量表（世界坐标，米）
// 观景点画面中心禁区：0 画中初降 / 1 环站全景 / 2 环带立面 / 3 对接港 / 4 穹顶外 / 9 星云远眺。
// 小行星与浮标的生成会避开这些机位的画面中心（飞机与系泊船是刻意安排的构图，不走这条规则）。
const AVOID_VIEWS = [0, 1, 2, 3, 4, 8, 9].map((i) => L.views[i]);

// 三条小行星漂移带（count / y 范围 / 绕 Y 轴的柱面半径范围 / 尺寸范围）
const BELTS = [
  { name: '下带', count: 26, y: [-700, -380], r: [680, 2150], size: [6, 46], ice: [0.05, 0.14] },  // 环站下方：view 8 仰视可见
  { name: '上带', count: 18, y: [300, 600], r: [720, 2000], size: [4, 52], ice: [0.05, 0.14] },    // 环站上方
  { name: '远散', count: 13, dist: [900, 1800], size: [8, 60], ice: [0.05, 0.14] },                // 远处散点
  { name: '冰屑', count: 12, y: [-900, -540], r: [700, 1900], size: [5, 34], ice: [0.45, 0.85] },  // 环站更下方：冰质碎块，给 view 8 下方纵深
];

// 星座鲸：位置 / 航向 / 体长。航向刻意与「观景点→鲸」的视线近似垂直，保证看到侧影。
// 三头距站心都在 1200–3500 m（体检会验）。
const WHALES = [
  {
    name: '星座鲸 · 溯光',
    p: [-1500, 420, -2200],
    dir: [0.865, 0.063, -0.202],   // 横越星海、略朝环站游
    up: [0.05, 1, 0.10],
    len: 900,
    bright: 1.0,
    pitch: 0.15, roll: 0.14,     // 抬着头上浮 + 轻微侧倾，避免正侧面的"平面鱼"
    seed: 0x57a11a01,
    sec: 24, extra: 88, halos: 20, tubeR: 3.6, tubeSeg: 4,   // ≥80 星点/头（体检要求）
  },
  {
    name: '星座鲸 · 远歌',
    p: [1500, 560, -2500],
    dir: [0.62, 0.05, 0.55],
    up: [-0.10, 1, 0.15],
    len: 780,
    bright: 0.74,
    pitch: -0.10, roll: -0.16,
    seed: 0x57a11a02,
    sec: 18, extra: 66, halos: 14, tubeR: 3.0, tubeSeg: 3,
  },
  {
    name: '星座鲸 · 幼鲸',
    p: [260, 640, -2150],
    dir: [0.80, -0.034, 0.431],
    up: [0.10, 1, -0.05],
    len: 700,
    bright: 0.64,
    pitch: 0.09, roll: 0.20,
    seed: 0x57a11a03,
    sec: 16, extra: 56, halos: 12, tubeR: 2.8, tubeSeg: 3,
  },
];

// 货运飞船：detail 0 = 远航剪影（少三角），1 = 标准，2 = 系泊主角。
// yaw：局部 +X（船头）在世界里的朝向；tilt = 绕局部 Z（抬头/低头），bank = 绕局部 X（侧倾）。
const SHIPS = [
  {
    name: '系泊货船「鲸背号」',
    // 泊在对接港外侧（径向 ~688 m，港平台半径 150 之外），船身沿环带切向，
    // view 3 里落在画面左 1/3 且整船入画；不占港口开口的 -Z 视线通道。
    p: [167, -8, -668],
    yaw: 2.897,                  // 船头朝（−X,−Z）：鼻端对接环对着港口方向
    tilt: 0, bank: 0.02,
    len: 88, detail: 2, plume: 0, dock: 1,
  },
  {
    name: '进港货船「远星号」',
    p: [350, 120, 760],          // 站外 845 m，view 1 右前景
    yaw: 2.0, tilt: -0.05, bank: 0.14,
    len: 92, detail: 1, plume: 1, dock: 0,
  },
  {
    name: '远航剪影「长夜号」',
    p: [-1760, 300, -2020],      // 站外 2650 m，view 1 左远景
    yaw: 0.496, tilt: 0.03, bank: -0.10,
    len: 150, detail: 0, plume: 0, dock: 0,
  },
];

// 探针浮标：环绕环站的 8 个（尺寸 3–8 m），其中 2 个带天线碟（dish:1）。
const BUOYS = [
  { p: [520, 210, -430], size: 5.0, dish: 1, yaw: 0.4 },
  { p: [-470, -180, 480], size: 4.2, dish: 1, yaw: 1.9 },
  { p: [620, -120, 360], size: 3.6, dish: 0, yaw: 2.6 },
  { p: [-380, 260, -520], size: 4.6, dish: 0, yaw: 0.9 },
  { p: [300, 330, 620], size: 3.4, dish: 0, yaw: 3.4 },
  { p: [-640, 40, -300], size: 5.4, dish: 0, yaw: 5.1 },
  { p: [180, -260, -680], size: 4.0, dish: 0, yaw: 2.2 },
  { p: [-250, -350, 640], size: 3.8, dish: 0, yaw: 4.4 },
];

// 远景姊妹站：>3000 m 的低对比环塔剪影（坐标各分量 <3000，避免引擎的远点警告）。
const SISTERS = [
  { p: [-2820, 170, 2340], yaw: 0.6, tilt: 0.78, bank: 0.18, R: 118, dim: 1.0 },
  { p: [2880, -230, -1560], yaw: -1.1, tilt: -0.58, bank: 0.34, R: 92, dim: 0.8 },
];

// ---------------------------------------------------------------- 通用小工具
const applyM = (m, p) => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
];

// 局部系：T · Ry(yaw) · Rz(tilt) · Rx(bank) · S
function frame(p, yaw = 0, tilt = 0, bank = 0, s = 1) {
  let m = m4.translate(p);
  if (yaw) m = m4.mul(m, m4.rotY(yaw));
  if (tilt) m = m4.mul(m, m4.rotZ(tilt));
  if (bank) m = m4.mul(m, m4.rotX(bank));
  if (s !== 1) m = m4.mul(m, m4.scale([s, s, s]));
  return m;
}
function withFrame(b, p, yaw, tilt, bank, fn) {
  b.push(frame(p, yaw, tilt, bank));
  fn();
  b.pop();
}

// 环截面放样：rings 是等长的世界点数组；法线由邻居数值微分，保证平滑。
function loftRings(b, rings, colFn, mat, opts = {}) {
  const n = rings.length;
  const m = rings[0].length;
  const cent = rings.map((row) => {
    const c = [0, 0, 0];
    for (const p of row) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
    return [c[0] / row.length, c[1] / row.length, c[2] / row.length];
  });
  const P = (i, k) => rings[i][((k % m) + m) % m];
  const NRM = (i, k) => {
    const tang = sub(P(i, k + 1), P(i, k - 1));
    const ax = sub(P(Math.min(n - 1, i + 1), k), P(Math.max(0, i - 1), k));
    let nn = norm(cross(ax, tang));
    if (dot(nn, sub(P(i, k), cent[i])) < 0) nn = vs(nn, -1);
    return nn;
  };
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < m; k++) {
      const k1 = (k + 1) % m;
      const p00 = P(i, k), p10 = P(i, k1), p11 = P(i + 1, k1), p01 = P(i + 1, k);
      const n00 = NRM(i, k), n10 = NRM(i, k1), n11 = NRM(i + 1, k1), n01 = NRM(i + 1, k);
      const ia = b.vert(b.tp(p00), b.tn(n00), colFn(i, k), mat);
      const ib = b.vert(b.tp(p10), b.tn(n10), colFn(i, k1), mat);
      const ic = b.vert(b.tp(p11), b.tn(n11), colFn(i + 1, k1), mat);
      const id = b.vert(b.tp(p01), b.tn(n01), colFn(i + 1, k), mat);
      b.i.push(ia, ib, ic, ia, ic, id);
    }
  }
  if (opts.caps === false) return;
  const axis = norm(sub(cent[n - 1], cent[0]));
  for (const [idx, nrm, ringI] of [[0, vs(axis, -1), 0], [n - 1, axis, n - 1]]) {
    const c = cent[ringI];
    for (let k = 0; k < m; k++) {
      const a = P(ringI, k), c2 = P(ringI, k + 1);
      b.tri(c, a, c2, colFn(ringI, k), mat, nrm, nrm, nrm);
    }
    void idx;
  }
}

// 面片（quad / tri）按「inside 点」修正法线朝向，用于噪声岩体这类没有解析法线的面。
function emitQuad(b, A, B, C2, D, col, mat, inside) {
  let nn = norm(cross(sub(B, A), sub(C2, A)));
  if (dot(nn, sub(A, inside)) < 0) { nn = vs(nn, -1); b.quad(B, A, D, C2, col, mat, nn); }
  else b.quad(A, B, C2, D, col, mat, nn);
}
function emitTri(b, A, B, C2, col, mat, inside) {
  let nn = cross(sub(B, A), sub(C2, A));
  if (dot(nn, sub(A, inside)) < 0) b.tri(A, C2, B, col, mat);
  else b.tri(A, B, C2, col, mat);
}

// 截面参数插值（prof 行：[t, ryf, rzf, yf]）
function profAt(prof, t, idx) {
  if (t <= prof[0][0]) return prof[0][idx];
  for (let i = 0; i < prof.length - 1; i++) {
    const a = prof[i], c = prof[i + 1];
    if (t <= c[0]) {
      const u = (t - a[0]) / Math.max(1e-9, c[0] - a[0]);
      return lerp(a[idx], c[idx], u);
    }
  }
  return prof[prof.length - 1][idx];
}

// 舷窗：一个朝向 ±Z 的小四边形（局部系内）
function winFace(b, x, y, z, w, h, side, col = C.warmGlow, mat = M.win) {
  b.quad([x - w / 2, y - h / 2, z], [x + w / 2, y - h / 2, z],
    [x + w / 2, y + h / 2, z], [x - w / 2, y + h / 2, z], col, mat, [0, 0, side]);
}
// 舷窗：一个朝向 ±Y 的小四边形
function winFaceY(b, x, y, z, w, d, up, col = C.warmGlow, mat = M.win) {
  b.quad([x - w / 2, y, z - d / 2], [x + w / 2, y, z - d / 2],
    [x + w / 2, y, z + d / 2], [x - w / 2, y, z + d / 2], col, mat, [0, up, 0]);
}

// 观景点画面中心禁区（小行星 / 浮标用）：椭圆视锥中央 ~62% + 物体自身张角
function viewBlocked(p, radius) {
  for (const v of AVOID_VIEWS) {
    const rel = sub(p, v.pos);
    const d = len(rel);
    if (d < 310 + radius) return true;                       // 机位近处不放东西
    const fwd = norm(sub(v.look, v.pos));
    const depth = dot(rel, fwd);
    if (depth < 40) continue;
    const right = norm(cross(fwd, [0, 1, 0]));
    const up = cross(right, fwd);
    const hv = (v.fov * 0.5) * Math.PI / 180;
    const hh = Math.atan(Math.tan(hv) * (16 / 9));
    const hu = Math.atan2(dot(rel, right), depth) / hh;
    const vu = Math.atan2(dot(rel, up), depth) / hv;
    const mgn = Math.atan(radius / Math.max(80, depth)) / hv;
    if (Math.abs(hu) < 0.62 + mgn && Math.abs(vu) < 0.62 + mgn) return true;
  }
  return false;
}

// ================================================================ 1. 小行星与碎屑
// 每个岩体：极坐标环带 + fbm 噪声半径 + 少量冰蓝高光面（朝恒星、且随机抽取）。
// 面片用「面法线 + 面心噪声」上色，天然低多边形，远看是碎屑、近看是棱面。
function buildRock(b, R, c, size, iceAmt) {
  const rows = 4 + ((R() * 3) | 0);                 // 4..6 圈纬线（低多边形棱面）
  const seg = 7 + ((R() * 4) | 0);                  // 7..10 条经线
  const seed = 3 + R() * 60;
  const rough = 0.26 + R() * 0.30;
  const key = norm(LOOK.keyDir);
  // 随机正交基 + 非均匀缩放：拉成不规则的长条 / 扁块 / 尖棱，而不是圆土豆
  const basis = frame(c, R() * TAU, (R() - 0.5) * 1.4, 0);
  const sx = 0.70 + R() * 0.65, sy = 0.62 + R() * 0.62, sz = 0.70 + R() * 0.65;
  const toW = (q) => add(c, [
    basis[0] * q[0] * sx + basis[4] * q[1] * sy + basis[8] * q[2] * sz,
    basis[1] * q[0] * sx + basis[5] * q[1] * sy + basis[9] * q[2] * sz,
    basis[2] * q[0] * sx + basis[6] * q[1] * sy + basis[10] * q[2] * sz,
  ]);
  const S = size;
  const rowsPts = [];
  for (let i = 1; i < rows; i++) {
    const v = i / rows;
    const th = v * Math.PI;
    const base = Math.max(0.16, Math.sin(th));
    const cy = Math.cos(th);
    const row = [];
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * TAU;
      const n = fbm3(Math.cos(a) * 1.4 + seed, v * 2.1, Math.sin(a) * 1.4 + seed, 2);
      const n2 = noise2(a * 2.3 + seed, v * 4.1);
      const rr = base * (0.52 + 0.72 * n) * (1 + (n2 - 0.5) * rough);
      row.push(toW([Math.cos(a) * rr * S, (cy * (0.62 + 0.5 * n) + (n2 - 0.5) * 0.16) * S, Math.sin(a) * rr * S]));
    }
    rowsPts.push(row);
  }
  const top = toW([(R() - 0.5) * 0.16 * S, (0.92 + R() * 0.16) * S, (R() - 0.5) * 0.16 * S]);
  const bot = toW([(R() - 0.5) * 0.16 * S, -(0.86 + R() * 0.18) * S, (R() - 0.5) * 0.16 * S]);
  // 面片颜色：暗部 / 受光面 / 少量冰面（冰面只是薄薄一层混合，不做雪盖）
  const face = (A, B, D) => {
    const nn = norm(cross(sub(B, A), sub(D, A)));
    const lit = dot(nn, key);
    const nz = noise3((A[0] + B[0] + D[0]) * 0.055, (A[1] + B[1] + D[1]) * 0.055, (A[2] + B[2] + D[2]) * 0.055);
    let cc = mixc(ROCK_B, ROCK_A, clamp(0.26 + 0.6 * nz + 0.22 * lit, 0, 1));
    if (lit > 0.66) cc = mixc(cc, ROCK_C, 0.40);
    if (iceAmt > 0 && lit > 0.58 && R() < iceAmt) {
      return { col: mixc(mulc(cc, 1.15), mulc(ICE, 0.55 + 0.5 * nz), 0.55), mat: M.ice };
    }
    return { col: mulc(cc, 0.72 + 0.42 * clamp(0.5 + 0.5 * lit, 0, 1)), mat: M.rock };
  };
  const inside = c;
  // 顶 / 底扇
  for (let k = 0; k < seg; k++) {
    const a = rowsPts[0][k], c2 = rowsPts[0][(k + 1) % seg];
    const fc = face(top, a, c2);
    emitTri(b, top, a, c2, fc.col, fc.mat, inside);
    const al = rowsPts[rows - 2][k], cl = rowsPts[rows - 2][(k + 1) % seg];
    const fb = face(bot, al, cl);
    emitTri(b, bot, al, cl, fb.col, fb.mat, inside);
  }
  // 环带之间的四边形
  for (let i = 0; i < rowsPts.length - 1; i++) {
    for (let k = 0; k < seg; k++) {
      const k1 = (k + 1) % seg;
      const A = rowsPts[i][k], B = rowsPts[i][k1], C2 = rowsPts[i + 1][k1], D = rowsPts[i + 1][k];
      const fc = face(A, B, C2);
      emitQuad(b, A, B, C2, D, fc.col, fc.mat, inside);
    }
  }
}

function buildAsteroidField(b, acc, R, Rs) {
  let id = 0;
  const tryPlace = (p, size) => {
    if (len(p) < 470 + size * 1.6) return false;
    if (viewBlocked(p, size * 1.5)) return false;
    for (const q of acc.rocks) if (len(sub(p, q.p)) < (size + q.radius) * 2.4) return false;
    return true;
  };
  const addRock = (p, size, ice) => {
    buildRock(b, Rs, p, size, ice);
    acc.rocks.push({ p, radius: size * 1.45 });
    id++;
  };
  for (const belt of BELTS) {
    let n = 0, guard = 0;
    while (n < belt.count && guard++ < belt.count * 60) {
      let p;
      if (belt.r) {
        const a = R() * TAU;
        const rr = lerp(belt.r[0], belt.r[1], Math.sqrt(R()));
        const y = lerp(belt.y[0], belt.y[1], R());
        p = [Math.cos(a) * rr, y, Math.sin(a) * rr];
      } else {
        const y = (R() * 2 - 1) * 0.52;
        const a = R() * TAU;
        const rr = Math.sqrt(Math.max(0, 1 - y * y));
        const d = lerp(belt.dist[0], belt.dist[1], R());
        p = [Math.cos(a) * rr * d, y * d, Math.sin(a) * rr * d];
      }
      const size = lerp(belt.size[0], belt.size[1], Math.pow(R(), 1.8));
      if (!tryPlace(p, size)) continue;
      addRock(p, size, lerp(belt.ice[0], belt.ice[1], R()));
      // 大岩体附近撒 2–3 块碎屑（不单独计入 asteroid 数）
      if (size > 18 && R() < 0.6) {
        const debris = 2 + ((R() * 2) | 0);
        for (let k = 0; k < debris; k++) {
          const ds = size * (0.10 + R() * 0.16);
          const dp = add(p, [
            (R() - 0.5) * size * 5.5,
            (R() - 0.5) * size * 2.4,
            (R() - 0.5) * size * 5.5,
          ]);
          if (len(dp) < 460) continue;
          buildRock(b, Rs, dp, ds, 0.04);
          acc.rocks.push({ p: dp, radius: ds * 1.45 });
        }
      }
      n++;
    }
  }
  // ---- 前景碎屑：view 8「环下仰望」的画面下方需要几块近景岩石才有纵深 ----
  // 这些是刻意放进画面下缘的（不走 viewBlocked 的画面中心禁区），只保证不撞中心飞行球。
  {
    const v = L.views[8];
    const f = norm(sub(v.look, v.pos));
    const right = norm(cross(f, [0, 1, 0]));
    const up = cross(right, f);
    let placed = 0, guard = 0;
    while (placed < 14 && guard++ < 600) {
      const d = 150 + R() * 520;
      const lat = (R() * 2 - 1) * 430;
      const drop = -(0.30 + R() * 0.55) * d;                    // 画面下缘
      const p = add(v.pos, add(vs(f, d), add(vs(right, lat), vs(up, drop))));
      const size = 5 + R() * 17;
      if (len(p) < 470 + size * 1.6) continue;
      let clash = false;
      for (const q of acc.rocks) if (len(sub(p, q.p)) < (size + q.radius) * 2.6) { clash = true; break; }
      if (clash) continue;
      if (viewBlocked(p, size * 1.5)) continue;
      buildRock(b, Rs, p, size, 0.18 + R() * 0.3);
      acc.rocks.push({ p, radius: size * 1.45 });
      placed++;
    }
  }
  acc.asteroids = id;
}

// ================================================================ 2. 星座鲸
// 鲸形由「侧视轮廓」的骨架点构成：背线 / 腹线 / 下颚 / 尾鳍 / 胸鳍 / 脊线 / 肋线。
// 每段骨架是一条细的 emissive 管，每个骨架点是一颗 billboard 星；再加内部散点与光晕。
// 侧视轮廓（q=0 鼻端 → q=1 尾柄；v 为体长百分比，y 向上）。数字经过多轮截图调整：
// 头钝、背厚、体腔深、尾柄收细，尾鳍做成明确的大 V —— 远看要一眼认出是鲸。
const WHALE_TOP = [
  [0.000, 3.4], [0.030, 6.6], [0.070, 9.2], [0.120, 11.0], [0.190, 12.2],
  [0.270, 12.6], [0.360, 12.2], [0.450, 11.2], [0.540, 9.8], [0.630, 8.0],
  [0.710, 6.0], [0.780, 4.2], [0.840, 2.9], [0.880, 2.1],
];
const WHALE_BOT = [
  [0.000, -2.6], [0.040, -4.8], [0.090, -7.0], [0.160, -9.0], [0.240, -10.4],
  [0.330, -11.0], [0.420, -11.0], [0.520, -10.2], [0.620, -8.8], [0.710, -7.0],
  [0.790, -5.2], [0.850, -3.6], [0.890, -2.6],
];
// 下颚（嘴线）：从鼻端向后下方弯
const WHALE_JAW = [[0.004, 0.6], [0.022, -1.8], [0.050, -3.8], [0.090, -5.2], [0.150, -6.2]];
// 尾鳍：一条大 V（上叶 / 缺口 / 下叶），跨度约体长 20%
const WHALE_TAIL = [
  [0.900, 0.0], [0.940, 1.4], [0.980, 4.0], [1.025, 7.0], [1.060, 9.2], [1.078, 9.8],
  [1.030, 5.2], [1.000, 1.6], [0.985, 0.0],
  [1.000, -1.6], [1.030, -5.2], [1.078, -9.8], [1.060, -8.6], [1.025, -6.2], [0.980, -3.4], [0.940, -1.2],
];
// 胸鳍（座头鲸的长鳍）：从体侧向后下方甩出去，末端明显越出腹线
const WHALE_FIN_N = [[0.200, -1.8], [0.238, -4.8], [0.292, -8.4], [0.360, -11.8], [0.430, -15.0], [0.500, -17.2], [0.545, -16.4]];
const WHALE_FIN_F = [[0.205, -1.6], [0.240, -3.8], [0.300, -6.6], [0.365, -9.2], [0.435, -11.0], [0.485, -10.6]];
// 小背鳍
const WHALE_DORSAL = [[0.545, 9.9], [0.582, 13.4], [0.612, 10.6]];
// 头顶的"喷泉"：几颗上升的小星，星座鲸的标志性细节
const WHALE_SPOUT = [[0.085, 13.6], [0.075, 15.4], [0.060, 17.0], [0.042, 18.2], [0.090, 16.2]];

function buildWhale(b, ctx, acc, spec) {
  const R = mulberry32(spec.seed);
  const fwd0 = norm(spec.dir);
  let up0 = norm(spec.up || [0, 1, 0]);
  const side0 = norm(cross(up0, fwd0));
  up0 = norm(cross(fwd0, side0));
  // 俯仰 + 侧倾：身体不是一张贴在星空里的平面剪影，而是一头斜着游上来的鲸
  const pitch = spec.pitch || 0, roll = spec.roll || 0;
  const fwd = norm(add(vs(fwd0, Math.cos(pitch)), vs(up0, Math.sin(pitch))));
  const upP = norm(add(vs(up0, Math.cos(pitch)), vs(fwd0, -Math.sin(pitch))));
  const sideP = norm(cross(upP, fwd));
  const up = norm(add(vs(upP, Math.cos(roll)), vs(sideP, Math.sin(roll))));
  const side = norm(add(vs(sideP, Math.cos(roll)), vs(upP, -Math.sin(roll))));
  const L = spec.len;
  const S = L / 100;                          // 轮廓数据以体长百分比计
  const O = spec.p;
  const P = (q, vp, w = 0) => add(O, add(add(vs(fwd, (0.5 - q) * L), vs(up, vp * S)), vs(side, w * S)));
  const lineCol = mixc(WHALE_LINE, WHALE_C, 0.50);
  const lineMat = M.whaleLineFaint;     // 很淡的轮廓管：emissive 0.30，只负责"看得到轮廓"
  let stars = 0;
  const star = (p, size, alpha, col, shape = 0) => {
    // 星点颜色允许 HDR（>1 的部分进 bloom），远距离的小点也有光
    ctx.lanterns.push({ p, size, rot: R() * TAU, alpha, shape, col: shape === 1 ? col : mulc(col, 1.35) });
    stars++;
  };
  const tube = (pts, radius) => {
    const world = pts.map(([q, vp, w]) => P(q, vp, w || 0));
    tubePath(b, world, radius, spec.tubeSeg, lineCol, lineMat, { caps: false });
  };
  // ---- 分层之一：一条很淡的闭合轮廓细管（1.5–3 m），不做任何内部网格 ----
  const outline = [];
  for (const p of WHALE_TOP) outline.push(p);
  for (const p of WHALE_TAIL) outline.push(p);
  for (let i = WHALE_BOT.length - 1; i >= 0; i--) outline.push(WHALE_BOT[i]);
  outline.push(WHALE_TOP[0]);
  tube(outline, spec.tubeR * 0.72);
  tube(WHALE_FIN_N.map(([q, v]) => [q, v, 2.6]), spec.tubeR * 0.55);
  tube(WHALE_JAW, spec.tubeR * 0.42);           // 嘴线：鲸的"脸"全靠这一笔
  tube(WHALE_DORSAL, spec.tubeR * 0.50);
  // ---- 分层之二：稀疏的亮核心点（9–16 m，间距大、亮度高）----
  const CORE = [];
  for (const i of [0, 2, 4, 6, 8, 10, 13]) if (WHALE_TOP[i]) CORE.push(WHALE_TOP[i]);
  for (const i of [0, 2, 4, 6, 8, 10, 12]) if (WHALE_BOT[i]) CORE.push(WHALE_BOT[i]);
  for (const i of [0, 2, 4, 5, 8, 11, 12]) if (WHALE_TAIL[i]) CORE.push(WHALE_TAIL[i]);
  CORE.push([0.500, -17.2, 2.6], [0.360, -11.8, 2.6], [0.582, 13.4, 0]);   // 胸鳍尖 / 背鳍尖
  for (const [q, vp, w] of CORE) {
    star(P(q, vp, w || 0), 9.5 + R() * 5.0, Math.min(1, spec.bright * (0.92 + R() * 0.12)), R() < 0.30 ? WHALE_W : WHALE_C, 0);
  }
  // 眼睛：最亮的一颗 + 一小团十字光晕
  star(P(0.088, 3.6, 2.6), 16, spec.bright, WHALE_W, 0);
  star(P(0.088, 3.6, 2.6), 46, spec.bright * 0.42, WHALE_W, 1);
  // ---- 分层之三：更暗的次级星（补轮廓节奏，不是轮廓本身）----
  for (let i = 0; i < spec.sec; i++) {
    const srcs = i % 3 === 0 ? WHALE_TOP : (i % 3 === 1 ? WHALE_BOT : WHALE_TAIL);
    const idx = (i * 2 + 1) % srcs.length;
    const a = srcs[idx], c = srcs[(idx + 1) % srcs.length];
    star(P((a[0] + c[0]) * 0.5, (a[1] + c[1]) * 0.5, 0), 6.5 + R() * 3.0, spec.bright * (0.40 + R() * 0.22), WHALE_C, 0);
  }
  // ---- 分层之四：体腔内的极暗星尘（给体积感，不参与轮廓）----
  for (let i = 0; i < spec.extra; i++) {
    const q = 0.09 + R() * 0.80;
    const tb = profAt(WHALE_TOP, q, 1), bb = profAt(WHALE_BOT, q, 1);
    const vp = lerp(bb * 0.60, tb * 0.60, R());
    const w = (R() - 0.5) * 3.6;
    star(P(q, vp, w), 4.5 + R() * 3.0, spec.bright * (0.16 + R() * 0.16), i % 3 === 0 ? WHALE_W : WHALE_C, 0);
  }
  // ---- 光晕：只给最亮的几颗，别把整头鲸糊成一团 ----
  const halos = [
    [0.020, 5.0], [0.270, 12.4], [0.450, 11.0], [0.630, 7.8],
    [1.070, 9.2], [1.070, -9.2], [0.500, -17.2], [0.582, 13.4],
    [0.900, 0.8], [0.120, 10.8], [0.360, -11.0], [0.700, 5.0],
    [0.790, 4.0], [0.240, 10.6], [0.330, -9.0], [0.860, 2.4],
    [0.940, 1.2], [1.030, 6.6], [1.030, -6.6], [0.400, 8.0],
  ];
  for (let i = 0; i < spec.halos; i++) {
    const hq = halos[i % halos.length];
    star(P(hq[0] + (R() - 0.5) * 0.02, hq[1] + (R() - 0.5) * 0.8, (R() - 0.5) * 1.4), 26 + R() * 14, spec.bright * (0.16 + R() * 0.10), WHALE_C, 1);
  }
  // ---- 星座云气：两三层极淡的大光晕，让鲸"浮"在星海里 ----
  for (const [qq, vv, ss, aa] of [[0.36, 2.0, 0.30, 0.055], [0.70, 0.5, 0.20, 0.045], [0.09, 6.0, 0.13, 0.055]]) {
    star(P(qq, vv, 0), L * ss, spec.bright * aa, WHALE_C, 1);
  }
  acc.whales.push({
    name: spec.name, p: [...O], len: L, lanterns: stars,
    dist: Math.hypot(O[0], O[1], O[2]), dir: [...spec.dir],
  });
}

// ================================================================ 3. 货运飞船
// 局部系：+X = 船头，Y = 上，Z = 左舷；船长 L、半宽 Wd、半高 H。
function buildFreighter(b, ctx, acc, R, spec) {
  const L = spec.len;
  const H = L * 0.062;
  const Wd = L * 0.090;
  const det = spec.detail;
  const f = frame(spec.p, spec.yaw, spec.tilt || 0, spec.bank || 0);
  const W = (p) => applyM(f, p);
  b.push(f);

  // ---- 船体放样：尾端收口 → 鼻端 ----
  let prof = [
    [-1.00, 0.14, 0.26, -0.02],
    [-0.94, 0.40, 0.58, -0.03],
    [-0.84, 0.66, 0.80, -0.02],
    [-0.68, 0.85, 0.93, -0.01],
    [-0.44, 0.97, 0.99, 0.00],
    [-0.12, 1.00, 1.00, 0.00],
    [0.22, 0.98, 0.98, 0.00],
    [0.50, 0.90, 0.93, 0.01],
    [0.70, 0.76, 0.80, 0.02],
    [0.86, 0.54, 0.56, 0.03],
    [0.95, 0.30, 0.32, 0.02],
    [1.00, 0.09, 0.11, 0.00],
  ];
  if (det === 0) prof = prof.filter((_, i) => i % 2 === 0 || i === prof.length - 1);
  const NSEG = det === 0 ? 8 : 12;
  const hullCol = (i, k) => {
    const t = prof[i][0];
    const a = (k / NSEG) * TAU;
    const down = Math.sin(a);
    // 深蓝装甲裙板：下半船体（太空里代替水线）
    if (down < -0.12) {
      const k2 = clamp((-down - 0.12) * 1.45, 0.18, 1);
      return mixc(mixc(IVORY, HULL_DEEP, k2), PANEL_D, clamp((-down - 0.55) * 0.75, 0, 0.5));
    }
    let c = mixc(IVORY, HULL, 0.35 + 0.20 * Math.cos(a));
    // 船体面板缝：逐截面微差 + 两条黄铜饰带
    if (i % 2 === 1) c = mulc(c, 0.965);
    if ((t > -0.64 && t < -0.56) || (t > 0.34 && t < 0.42)) c = mixc(c, BRASS, 0.70);
    if (down > 0.72) c = mulc(c, 1.03);
    return c;
  };
  const rings = [];
  for (const s of prof) {
    const row = [];
    for (let k = 0; k < NSEG; k++) {
      const a = (k / NSEG) * TAU;
      const ca = Math.cos(a), sa = Math.sin(a);
      const ex = 0.74;
      row.push([
        s[0] * L * 0.5,
        s[3] * H + Math.sign(sa) * Math.pow(Math.abs(sa), ex) * H * s[1],
        Math.sign(ca) * Math.pow(Math.abs(ca), ex) * Wd * s[2],
      ]);
    }
    rings.push(row);
  }
  loftRings(b, rings, hullCol, M.hull);

  const rzAt = (t) => Wd * profAt(prof, t, 2);
  const ryAt = (t) => H * profAt(prof, t, 1);

  if (det >= 1) {
    // ---- 龙骨 / 背脊 ----
    b.push(m4.translate([0, -H * 0.98, 0]));
    box(b, L * 0.66, H * 0.5, Wd * 0.34, mixc(HULL_DEEP, PANEL_D, 0.4), M.blue);
    b.pop();
    for (const sd of [-1, 1]) {
      bar3(b, [-L * 0.30, -H * 1.20, sd * Wd * 0.16], [L * 0.30, -H * 1.20, sd * Wd * 0.16], 0.55, 0.55, BRASS, M.brass);
    }
    b.push(m4.translate([0, H * 0.98, 0]));
    box(b, L * 0.46, H * 0.32, Wd * 0.30, IVORY, M.hull);
    b.pop();

    // ---- 舷窗带：两舷一排暖窗 + 一条连续长廊灯带 + 下缘青绿灯带 ----
    // 长廊灯带是"背光机位"（view 3 从 -Z 看船）也能读出船身的关键：舷窗本身会自发光。
    for (const side of [-1, 1]) {
      for (let i = 0; i < 15; i++) {
        const t = -0.32 + i * 0.046;
        const x = t * L * 0.5;
        const rz = rzAt(t), ry = ryAt(t);
        winFace(b, x, ry * 0.18, side * (rz * 0.995 + 0.07), L * 0.017, L * 0.011, side);
      }
      for (let i = 0; i < 6; i++) {
        const t0 = -0.42 + i * 0.145, t1 = t0 + 0.145;
        const x0 = t0 * L * 0.5, x1 = t1 * L * 0.5;
        const z0 = side * (rzAt(t0) * 0.995 + 0.055), z1 = side * (rzAt(t1) * 0.995 + 0.055);
        const y0 = ryAt(t0) * 0.40, y1 = ryAt(t1) * 0.40;
        b.quad([x0, y0, z0], [x1, y1, z1], [x1, y1 + L * 0.0085, z1], [x0, y0 + L * 0.0085, z0], C.warmGlow, M.win, [0, 0, side]);
      }
      for (let i = 0; i < 6; i++) {
        const t0 = -0.58 + i * 0.22, t1 = t0 + 0.22;
        const x0 = t0 * L * 0.5, x1 = t1 * L * 0.5;
        const z0 = side * (rzAt(t0) * 0.99 + 0.03), z1 = side * (rzAt(t1) * 0.99 + 0.03);
        const y0 = -ryAt(t0) * 0.20, y1 = -ryAt(t1) * 0.20;
        b.quad([x0, y0, z0], [x1, y1, z1], [x1, y1 + L * 0.006, z1], [x0, y0 + L * 0.006, z0], C.cyanGlow, M.cyan, [0, 0, side]);
      }
    }

    // ---- 甲板室（后部，加长到驾驶室底下，消灭"浮空盒子"）----
    const dhL = L * 0.30, dhH = L * 0.078, dhW = Wd * 1.30;
    const dhX = -L * 0.17, dhY = H + dhH * 0.5;
    b.push(m4.translate([dhX, dhY, 0]));
    box(b, dhL, dhH, dhW, IVORY, M.hull);
    b.pop();
    // 黄铜檐线 + 檐下青灯
    for (const sd of [-1, 1]) {
      bar3(b, [dhX - dhL * 0.5, dhY + dhH * 0.5, sd * dhW * 0.5],
        [dhX + dhL * 0.5, dhY + dhH * 0.5, sd * dhW * 0.5], 0.55, 0.45, BRASS, M.brass);
      bar3(b, [dhX - dhL * 0.5, dhY - dhH * 0.5, sd * dhW * 0.5],
        [dhX + dhL * 0.5, dhY - dhH * 0.5, sd * dhW * 0.5], 0.42, 0.36, BRASS_D, M.brassDark);
      // 甲板室两排暖窗
      for (let i = 0; i < 6; i++) {
        const x = dhX - dhL * 0.42 + i * (dhL * 0.84 / 5);
        winFace(b, x, dhY + dhH * 0.16, sd * (dhW * 0.5 + 0.04), dhL * 0.055, dhH * 0.30, sd);
        winFace(b, x, dhY - dhH * 0.22, sd * (dhW * 0.5 + 0.04), dhL * 0.045, dhH * 0.20, sd, C.amber, M.winDim);
      }
    }
    // ---- 艏楼甲板：从驾驶室一直伸到船头，接上桅杆与吊臂 ----
    b.push(m4.translate([L * 0.10, H + H * 0.28, 0]));
    box(b, L * 0.30, H * 0.46, Wd * 0.46, mixc(IVORY, HULL, 0.25), M.hull);
    b.pop();
    for (const sd of [-1, 1]) {
      bar3(b, [-L * 0.05, H + H * 0.52, sd * Wd * 0.24], [L * 0.25, H + H * 0.52, sd * Wd * 0.24], 0.26, 0.24, BRASS, M.brass);
      for (let i = 0; i < 3; i++) {
        winFace(b, L * 0.02 + i * L * 0.07, H + H * 0.34, sd * (Wd * 0.235), L * 0.016, L * 0.010, sd);
      }
    }
    // 船头吊臂（A 型吊架 + 吊钩缆）
    for (const sd of [-1, 1]) {
      bar3(b, [L * 0.36, H + H * 0.20, sd * Wd * 0.30], [L * 0.43, H + L * 0.075, 0], 0.42, 0.42, mixc(IVORY, HULL, 0.4), M.hull);
    }
    bar3(b, [L * 0.40, H + L * 0.060, -Wd * 0.16], [L * 0.40, H + L * 0.060, Wd * 0.16], 0.34, 0.30, BRASS, M.brass);

    // ---- 驾驶室：坐在甲板室顶前缘 ----
    const brL = L * 0.13, brH = L * 0.046, brW = Wd * 1.05;
    const brX = -L * 0.11, brY = H + dhH + brH * 0.5;
    b.push(m4.translate([brX, brY, 0]));
    box(b, brL, brH, brW, mixc(IVORY, HULL, 0.3), M.hull);
    b.pop();
    // 驾驶室玻璃：正前方 + 两侧
    b.quad([brX + brL * 0.5 + 0.03, brY - brH * 0.32, -brW * 0.36],
      [brX + brL * 0.5 + 0.03, brY - brH * 0.32, brW * 0.36],
      [brX + brL * 0.5 + 0.03, brY + brH * 0.34, brW * 0.36],
      [brX + brL * 0.5 + 0.03, brY + brH * 0.34, -brW * 0.36], mixc(GLASS, C.glassFrame, 0.3), M.glass, [1, 0, 0]);
    for (const sd of [-1, 1]) {
      b.quad([brX - brL * 0.44, brY - brH * 0.30, sd * (brW * 0.5 + 0.03)],
        [brX + brL * 0.44, brY - brH * 0.30, sd * (brW * 0.5 + 0.03)],
        [brX + brL * 0.44, brY + brH * 0.32, sd * (brW * 0.5 + 0.03)],
        [brX - brL * 0.44, brY + brH * 0.32, sd * (brW * 0.5 + 0.03)], mixc(GLASS, C.glassFrame, 0.3), M.glass, [0, 0, sd]);
    }
    // 驾驶室顶黄铜栏杆 + 两根天线桅
    for (const sd of [-1, 1]) {
      bar3(b, [brX - brL * 0.5, brY + brH * 0.5, sd * brW * 0.44],
        [brX + brL * 0.5, brY + brH * 0.5, sd * brW * 0.44], 0.34, 0.30, BRASS_HI, M.brass);
    }
    for (const sd of [-1, 1]) {
      const mx = brX - brL * 0.2, mz = sd * brW * 0.30, my = brY + brH * 0.5;
      b.push(m4.translate([mx, my, mz]));
      cylinder(b, 6, 0.30, 0.16, L * 0.12, BRASS_D, M.brassDark, { y0: 0 });
      b.pop();
      bar3(b, [mx - L * 0.026, my + L * 0.085, mz], [mx + L * 0.026, my + L * 0.085, mz], 0.18, 0.18, BRASS, M.brass);
      bar3(b, [mx, my + L * 0.105, mz - L * 0.02], [mx, my + L * 0.105, mz + L * 0.02], 0.16, 0.16, BRASS, M.brass);
      star3(acc, W([mx, my + L * 0.122, mz]), C.star, 2.6, 1.2, R);
    }

    // ---- 货柜：后甲板一排 + 两舷各两个 ----
    const boxCols = [HULL_DEEP, HULL_TEAL, mixc(IVORY, HULL, 0.4), BRASS_D];
    for (let i = 0; i < 4; i++) {
      const x = -L * 0.485 + i * L * 0.045;
      b.push(m4.translate([x, H + L * 0.021, 0]));
      box(b, L * 0.040, L * 0.042, Wd * 0.78, boxCols[i % 4], i % 2 ? M.blue : M.teal);
      b.pop();
      bar3(b, [x, H + L * 0.043, -Wd * 0.39], [x, H + L * 0.043, Wd * 0.39], 0.22, 0.22, BRASS, M.brass);
    }
    for (const sd of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        const x = L * 0.10 + i * L * 0.085;
        b.push(m4.translate([x, -H * 0.55, sd * (Wd + L * 0.026)]));
        box(b, L * 0.070, L * 0.052, L * 0.052, boxCols[(i + 1) % 4], M.blue);
        b.pop();
        bar3(b, [x - L * 0.035, -H * 0.55 - L * 0.026, sd * (Wd + L * 0.012)],
          [x - L * 0.035, -H * 0.55 + L * 0.026, sd * (Wd + L * 0.012)], 0.20, 0.20, BRASS, M.brass);
      }
    }

    // ---- 尾鳍：1 片上垂鳍 + 2 片水平鳍 ----
    extrudeXY(b, [
      [-L * 0.20, H * 0.55], [-L * 0.35, H * 0.55 + L * 0.082],
      [-L * 0.42, H * 0.55 + L * 0.062], [-L * 0.40, H * 0.55],
    ], 2.2, IVORY, M.hull, { z0: -1.1 });
    for (const sd of [-1, 1]) {
      const poly = [
        [-L * 0.22, sd * Wd * 0.55], [-L * 0.38, sd * (Wd + L * 0.076)],
        [-L * 0.45, sd * (Wd + L * 0.062)], [-L * 0.43, sd * Wd * 0.55],
      ];
      extrudeXZ(b, poly, 1.9, mixc(IVORY, HULL_DEEP, 0.18), M.hull, { y0: -0.95 });
      bar3(b, [-L * 0.38, 0.05, sd * (Wd + L * 0.070)], [-L * 0.45, 0.05, sd * (Wd + L * 0.056)], 0.22, 0.22, C.cyanGlow, M.cyan);
    }
    // 鳍尖航行灯（静态 + 闪烁）
    star3(acc, W([-L * 0.40, H * 0.55 + L * 0.075, 0]), C.star, 5.0, 1.4, R);

    // ---- 两侧散热/太阳帆翼：给剪影一对"翅膀"（浅灰蓝薄板 + 黄铜框 + 青灯线）----
    for (const sd of [-1, 1]) {
      const px = -L * 0.06, py = H + L * 0.012, pz = sd * (Wd + L * 0.078);
      const pw = L * 0.30, ph = L * 0.105;
      b.push(m4.translate([px, py, pz]));
      box(b, pw, 0.45, ph, mixc(C.steelLight, HULL_DEEP, 0.30), M.hull);
      b.pop();
      for (const sz2 of [-1, 1]) {
        bar3(b, [px - pw / 2, py, pz + sz2 * ph / 2], [px + pw / 2, py, pz + sz2 * ph / 2], 0.30, 0.30, BRASS_D, M.brassDark);
      }
      bar3(b, [px, py, sd * Wd * 0.86], [px, py, pz], 0.44, 0.40, BRASS_D, M.brassDark);
      for (let j = 0; j < 3; j++) {
        const lx = px - pw * 0.36 + j * pw * 0.36;
        bar3(b, [lx, py + 0.28, pz - ph * 0.40], [lx, py + 0.28, pz + ph * 0.40], 0.11, 0.11, C.cyanGlow, M.cyan);
      }
    }
    // ---- 船腹货舱：悬在龙骨下的三只圆筒挂舱（黄铜箍 + 青色舱门灯）----
    for (let i = 0; i < 3; i++) {
      const gx = -L * 0.20 + i * L * 0.16;
      b.push(m4.translate([gx, -H * 1.34, 0]));
      b.push(m4.rotZ(-Math.PI / 2));
      lathe(b, [[0.02, -L * 0.012], [Wd * 0.26, -L * 0.010], [Wd * 0.30, 0], [Wd * 0.30, L * 0.055], [Wd * 0.24, L * 0.075], [0.02, L * 0.078]], 10, i === 1 ? HULL_TEAL : mixc(IVORY, HULL, 0.3), i === 1 ? M.teal : M.hull);
      b.pop();
      for (const bx of [L * 0.006, L * 0.042]) {
        b.push(m4.translate([gx + bx, -H * 1.34, 0]));
        b.push(m4.rotZ(-Math.PI / 2));
        b.push(m4.translate([0, 0, 0]));
        torus(b, Wd * 0.305, 0.16, 10, 4, BRASS, M.brass, 'y');
        b.pop();
        b.pop();
        b.pop();
      }
      b.pop();
      // 舱门灯（朝下）
      b.push(m4.translate([gx - L * 0.008, -H * 1.34 - Wd * 0.27, 0]));
      cylinder(b, 6, Wd * 0.10, Wd * 0.10, 0.4, C.cyanGlow, M.cyan, { y0: -0.2 });
      b.pop();
    }

    // ---- 小机械（greebles）：甲板上的箱体、管束、铆钉带 ----
    for (let i = 0; i < 12; i++) {
      const t = -0.10 + R() * 0.56;
      const x = t * L * 0.5;
      const sd = R() < 0.5 ? -1 : 1;
      const rz = rzAt(t) * (0.55 + R() * 0.4);
      b.push(m4.translate([x, H * (0.55 + R() * 0.4), sd * rz]));
      const bx = L * (0.010 + R() * 0.016);
      box(b, bx, bx * (0.5 + R() * 0.6), bx * (0.6 + R() * 0.7), i % 3 === 0 ? BRASS_D : mixc(IVORY, HULL, 0.5), i % 3 === 0 ? M.brassDark : M.hull);
      b.pop();
    }
    // 鼻端的黄铜撞角 + 前倾的深蓝艏板（让船头有"舷弧"，不是圆头潜艇）
    b.push(m4.translate([L * 0.47, 0, 0]));
    cylinder(b, 8, Wd * 0.36, Wd * 0.10, L * 0.055, BRASS, M.brass, { y0: -L * 0.0275 });
    b.pop();
    for (const sd of [-1, 1]) {
      b.quad(
        [L * 0.305, -H * 0.95, sd * Wd * 0.70],
        [L * 0.470, -H * 0.62, sd * Wd * 0.30],
        [L * 0.470, H * 0.72, sd * Wd * 0.20],
        [L * 0.300, H * 0.95, sd * Wd * 0.62],
        mixc(HULL_DEEP, PANEL_D, 0.30), M.blue, norm([sd * 0.55, 0, 0.85]));
      bar3(b, [L * 0.30, H * 0.95, sd * Wd * 0.62], [L * 0.47, H * 0.72, sd * Wd * 0.20], 0.55, 0.55, BRASS, M.brass);
      bar3(b, [L * 0.305, -H * 0.95, sd * Wd * 0.70], [L * 0.47, -H * 0.62, sd * Wd * 0.30], 0.45, 0.45, BRASS_D, M.brassDark);
    }
  }

  // ---- 对接环（系泊船）----
  if (spec.dock) {
    b.push(m4.translate([L * 0.5 - 2.4, 0, 0]));
    b.push(m4.rotZ(-Math.PI / 2));
    lathe(b, [[Wd * 0.62, 0], [Wd * 0.62, 1.5], [Wd * 0.48, 3.0], [Wd * 0.30, 4.0]], 14, BRASS, M.brass);
    disc(b, Wd * 0.42, 14, C.cyanGlow, M.cyan);
    b.pop();
    b.pop();
    for (const [sy, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      bar3(b, [L * 0.5 - 1.2, sy * H * 0.55, sz * Wd * 0.55],
        [L * 0.5 + L * 0.055, sy * H * 0.62, sz * Wd * 0.62], 0.55, 0.55, BRASS_D, M.brassDark);
    }
    star2(ctx, W([L * 0.5 + L * 0.02, 0, 0]), C.warmGlow, 7, 0.85);
    acc.beacons.push({ p: W([L * 0.5 + L * 0.01, 0, 0]), col: mulc(C.amber, 1.8), size: 5, w: 2.2, ph: 0.0, base: 0.25 });
    acc.dockLight = W([L * 0.5 + L * 0.02, 0, 0]);
    // 码头泛光灯：挂在船身斜上方，view 3 是背光机位，靠它把船壳从黑底里拉出来
    acc.floodLight = W([-L * 0.10, H * 2.6, -Wd * 2.2]);
    star2(ctx, acc.floodLight, C.warmGlow, 5, 0.55);
  }

  // ---- 引擎：三只黄铜喷口（伸出船尾）+ 喷口辉光 ----
  if (det >= 1) {
    const r0 = L * 0.034;
    for (let n = 0; n < 3; n++) {
      const zo = (n - 1) * Wd * 0.56;
      b.push(m4.translate([-L * 0.5 - L * 0.01, 0, zo]));
      b.push(m4.rotZ(-Math.PI / 2));
      lathe(b, [[r0 * 1.38, 0], [r0 * 1.40, -L * 0.024], [r0 * 1.02, -L * 0.082], [r0 * 0.72, -L * 0.112]], 12, BRASS, M.brass);
      // 喷口内的发光盘
      b.push(m4.translate([0, -L * 0.110, 0]));
      b.push(m4.translate([0, 0, 0]));
      disc(b, r0 * 0.66, 12, spec.plume ? C.ember : C.cyanGlow, spec.plume ? M.plume : M.cyan);
      b.pop();
      b.pop();
      b.pop();
      b.pop();
    }
    // 尾焰：短而亮的喷口焰（几何）+ 3 层 additive 光晕（bbDyn 'plume'）——
    // 只用不透明几何会像一根塑料圆锥，光晕负责"燃气"的软边。
    if (spec.plume) {
      const plen = L * 0.20;
      const seg = 12, rows = 4;
      for (let i = 0; i < rows; i++) {
        const t0 = i / rows, t1 = (i + 1) / rows;
        const rr0 = Math.max(r0 * 0.06, r0 * 1.15 * Math.pow(1 - t0, 0.72));
        const rr1 = Math.max(r0 * 0.06, r0 * 1.15 * Math.pow(1 - t1, 0.72));
        const x0 = -L * 0.5 - L * 0.09 - t0 * plen, x1 = -L * 0.5 - L * 0.09 - t1 * plen;
        const col0 = mixc(PLUME_HOT, PLUME_WARM, Math.pow(t0, 0.55));
        for (let k = 0; k < seg; k++) {
          const a0 = (k / seg) * TAU, a1 = ((k + 1) / seg) * TAU;
          b.quad([x0, Math.cos(a0) * rr0, Math.sin(a0) * rr0],
            [x0, Math.cos(a1) * rr0, Math.sin(a1) * rr0],
            [x1, Math.cos(a1) * rr1, Math.sin(a1) * rr1],
            [x1, Math.cos(a0) * rr1, Math.sin(a0) * rr1], col0, M.plume);
        }
      }
      for (const [tt, rr] of [[0.08, 1.12], [0.26, 0.88], [0.50, 0.56]]) {
        b.push(m4.translate([-L * 0.5 - L * 0.09 - tt * plen, 0, 0]));
        b.push(m4.rotZ(-Math.PI / 2));
        torus(b, r0 * 1.15 * rr, r0 * 0.10, 12, 4, PLUME_HOT, M.plumeRim, 'y');
        b.pop();
        b.pop();
      }
      // 光晕：沿焰轴 4 颗 additive billboard（大而淡，负责柔光与纵深）
      for (const [tt, sz, al] of [[0.05, L * 0.10, 0.55], [0.28, L * 0.16, 0.30], [0.55, L * 0.26, 0.16], [0.95, L * 0.38, 0.08]]) {
        acc.plumes.push({
          p: W([-L * 0.5 - L * 0.09 - tt * plen * 1.6, 0, 0]),
          size: sz, alpha: al, col: mulc(mixc(PLUME_HOT, PLUME_WARM, tt), 1.8),
        });
      }
      const gp = W([-L * 0.5 - L * 0.11, 0, 0]);
      ctx.lanterns.push({ p: gp, size: L * 0.10, rot: 0, alpha: 0.5, shape: 1, col: mulc(rgb('#ffbe7c'), 2.2) });
      acc.plumeLight = gp;
    }
  }

  // ---- 航行灯：左红右绿 + 尾白 ----
  const navY = H * 0.35;
  acc.beacons.push({ p: W([L * 0.10, navY, -Wd * 1.02]), col: mulc(BUOY_RED, 1.9), size: L * 0.045, w: 3.1, ph: 1.2, base: 0.30 });
  acc.beacons.push({ p: W([L * 0.10, navY, Wd * 1.02]), col: mulc(SHIP_GREEN, 1.9), size: L * 0.045, w: 3.1, ph: 3.4, base: 0.30 });
  acc.beacons.push({ p: W([-L * 0.5 - 0.6, 0, 0]), col: mulc(C.star, 1.7), size: L * 0.030, w: 1.4, ph: 0.5, base: 0.22 });

  b.pop();
  acc.ships.push({
    name: spec.name, p: [...spec.p], len: L, radius: L * 0.62,
    dist: Math.hypot(spec.p[0], spec.p[1], spec.p[2]), detail: det,
  });
}

// 小工具：静态 billboard / 动态航行灯记录
function star2(ctx, p, col, size, alpha) {
  ctx.lanterns.push({ p, size, rot: 0, alpha, shape: 1, col: mulc(col, 1.6) });
}
function star3(acc, p, col, size, alpha, R) {
  acc.beacons.push({ p, col: mulc(col, 1.8), size, w: 2.6, ph: R() * TAU, base: 0.28 });
}

// ================================================================ 4. 探针浮标
function buildBuoy(b, ctx, acc, R, spec) {
  const f = frame(spec.p, spec.yaw || 0, 0, (R() - 0.5) * 0.5);
  const W = (p) => applyM(f, p);
  const s = spec.size;
  b.push(f);
  // 主体：黄铜壳身 + 象牙白舱段
  lathe(b, [
    [0.02, -s * 0.50], [s * 0.22, -s * 0.44], [s * 0.30, -s * 0.10],
    [s * 0.30, s * 0.14], [s * 0.20, s * 0.38], [s * 0.07, s * 0.50],
  ], 10, IVORY, M.hull);
  // 黄铜箍
  for (const y of [-s * 0.30, s * 0.06]) {
    b.push(m4.translate([0, y, 0]));
    torus(b, s * 0.30, s * 0.032, 10, 4, BRASS, M.brass, 'y');
    b.pop();
  }
  // 太阳能鳍（两片，深蓝电池 + 黄铜框）
  for (const sd of [-1, 1]) {
    b.push(m4.translate([0, s * 0.06, sd * s * 0.60]));
    box(b, s * 0.90, s * 0.52, s * 0.028, HULL_DEEP, M.blue);
    b.pop();
    for (const yy of [-s * 0.20, s * 0.32]) {
      bar3(b, [-s * 0.44, s * 0.06 + yy, sd * s * 0.60], [s * 0.44, s * 0.06 + yy, sd * s * 0.60], s * 0.03, s * 0.03, BRASS_D, M.brassDark);
    }
  }
  // 顶部桅杆 + 信标灯
  b.push(m4.translate([0, s * 0.44, 0]));
  cylinder(b, 6, s * 0.035, s * 0.022, s * 0.34, BRASS_D, M.brass, { y0: 0 });
  b.pop();
  const lamp = W([0, s * 0.80, 0]);
  b.push(m4.translate([0, s * 0.78, 0]));
  sphere(b, s * 0.055, mulc(C.warmGlow, 1.2), M.win, { rings: 4, seg: 6, jitter: 0 });
  b.pop();
  star2(ctx, lamp, C.warmGlow, s * 0.9, 0.9);
  acc.beacons.push({ p: lamp, col: mulc(BUOY_RED, 1.8), size: s * 0.75, w: 3.6, ph: R() * TAU, base: 0.15 });
  // 天线碟（2 个）
  if (spec.dish) {
    b.push(m4.translate([0, s * 0.46, 0]));
    b.push(m4.rotX(-0.62));
    lathe(b, [[0.04, 0], [s * 0.26, s * 0.05], [s * 0.56, s * 0.17], [s * 0.64, s * 0.25]], 12, mixc(C.panel, IVORY, 0.35), M.dark);
    b.pop();
    b.pop();
    // 三脚馈源
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      bar3(b, [Math.cos(a) * s * 0.52, s * 0.62, Math.sin(a) * s * 0.52], [0, s * 0.80, 0], s * 0.026, s * 0.026, BRASS_D, M.brassDark);
    }
    b.push(m4.translate([0, s * 0.80, 0]));
    sphere(b, s * 0.06, BRASS_HI, M.brass, { rings: 4, seg: 6, jitter: 0 });
    b.pop();
  } else {
    // 侧向探针杆
    for (const sd of [-1, 1]) {
      bar3(b, [0, -s * 0.16, sd * s * 0.28], [s * 0.5, -s * 0.30, sd * s * 0.46], s * 0.03, s * 0.03, BRASS_D, M.brassDark);
      b.push(m4.translate([s * 0.5, -s * 0.30, sd * s * 0.46]));
      sphere(b, s * 0.07, C.panel, M.dark, { rings: 4, seg: 6, jitter: 0 });
      b.pop();
    }
  }
  b.pop();
  acc.buoys.push({ p: [...spec.p], size: s, dish: !!spec.dish, dist: Math.hypot(spec.p[0], spec.p[1], spec.p[2]) });
}

// ================================================================ 5. 远景姊妹站剪影
function buildSister(b, ctx, acc, R, spec) {
  const f = frame(spec.p, spec.yaw, 0, spec.bank || 0);
  const W = (p) => applyM(f, p);
  b.push(f);
  b.push(m4.rotX(spec.tilt));
  const Rr = spec.R;
  const dim = spec.dim;
  const hullCol = mulc(mixc(C.steel, C.ivoryDark, 0.35), dim);
  // 环
  torus(b, Rr, Rr * 0.045, 40, 5, hullCol, M.sister, 'y');
  // 内环
  torus(b, Rr * 0.58, Rr * 0.020, 32, 4, hullCol, M.sister, 'y');
  // 辐条
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    bar3(b, [Math.cos(a) * Rr * 0.10, 0, Math.sin(a) * Rr * 0.10],
      [Math.cos(a) * Rr, 0, Math.sin(a) * Rr], Rr * 0.022, Rr * 0.022, hullCol, M.sister);
  }
  // 脊柱
  b.push(m4.translate([0, 0, 0]));
  lathe(b, [[0.02, -Rr * 0.48], [Rr * 0.075, -Rr * 0.44], [Rr * 0.10, -Rr * 0.10],
    [Rr * 0.10, Rr * 0.30], [Rr * 0.055, Rr * 0.46], [0.02, Rr * 0.50]], 10, hullCol, M.sister);
  b.pop();
  // 微光窗带（低对比，只是让剪影不是死黑）
  for (const yy of [-Rr * 0.03, Rr * 0.03]) {
    b.push(m4.translate([0, yy, 0]));
    torus(b, Rr * 1.006, Rr * 0.005, 40, 4, mulc(C.warmGlow, 0.5 * dim), M.sisterWin, 'y');
    b.pop();
  }
  // 两三点航行灯
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.5;
    const p = W([Math.cos(a) * Rr, Math.sin(a) * Rr * 0.25, Math.sin(a) * Rr]);
    star2(ctx, p, i === 0 ? C.warmGlow : C.cyanGlow, Rr * 0.06, 0.55);
  }
  b.pop();
  b.pop();
  acc.sisters.push({ p: [...spec.p], R: Rr, dist: Math.hypot(spec.p[0], spec.p[1], spec.p[2]) });
  void R;
}

// ================================================================ 6. 光尘 + 航行灯闪烁
function buildDust(ctx, R) {
  const N = 500;
  const motes = [];
  for (let i = 0; i < N; i++) {
    const a = R() * TAU;
    const rr = ST.ringR + (R() * 2 - 1) * 245;         // 环带周围 ±245 m
    const y = (R() * 2 - 1) * 240;
    const warm = R() < 0.58;
    motes.push({
      x: Math.cos(a) * rr, y, z: Math.sin(a) * rr,
      sz: 0.6 + R() * 1.6,
      al: 0.15 + R() * 0.25,
      w1: 0.03 + R() * 0.10,
      w2: 0.02 + R() * 0.09,
      ph: R() * TAU,
      a1: 2.5 + R() * 11,
      a2: 1.5 + R() * 8,
      col: warm ? mulc(C.warmGlow, 1.1) : mulc(C.cyanGlow, 1.1),
    });
  }
  if (!ctx.bbDyn) return;
  ctx.bbDyn.push({
    name: 'dust',
    additive: true,
    fill(t, bb) {
      for (const m of motes) {
        const x = m.x + Math.sin(t * m.w1 + m.ph) * m.a1;
        const y = m.y + Math.sin(t * m.w2 + m.ph * 1.7) * m.a2;
        const z = m.z + Math.cos(t * m.w1 * 0.83 + m.ph) * m.a1;
        bb.add(x, y, z, m.sz, m.ph, m.al, 0, m.col);
      }
    },
  });
}

// 尾焰光晕：additive billboard（大而淡的光团，负责燃气软边与纵深）
function buildPlumeGlow(ctx, plumes) {
  if (!ctx.bbDyn || !plumes.length) return;
  ctx.bbDyn.push({
    name: 'plume',
    additive: true,
    fill(t, bb) {
      for (const p of plumes) {
        const flick = 0.88 + 0.12 * Math.sin(t * 19 + p.p[0] * 0.013 + p.p[1] * 0.007);
        bb.add(p.p[0], p.p[1], p.p[2], p.size * flick, 0, p.alpha * flick, 1, p.col);
      }
    },
  });
}

function buildBeacons(ctx, beacons) {
  if (!ctx.bbDyn) return;
  ctx.bbDyn.push({
    name: 'beacons',
    additive: true,
    fill(t, bb) {
      for (const s of beacons) {
        const pulse = Math.max(0, Math.sin(t * s.w + s.ph));
        const a = s.base + (1 - s.base) * Math.pow(pulse, 3.2);
        bb.add(s.p[0], s.p[1], s.p[2], s.size, 0, a, 1, s.col);
      }
    },
  });
}

// ================================================================ 点光（本模块 ≤8）
function pushLights(ctx, acc) {
  // 进港船的尾焰：唯一一盏较强的点光
  if (acc.plumeLight) {
    ctx.points.push({ p: acc.plumeLight, col: mulc(rgb('#ffb066'), 1.25), range: 320, int: 1.0 });
  }
  // 系泊船的对接环暖光（呼应环站港口）
  if (acc.dockLight) {
    ctx.points.push({ p: acc.dockLight, col: mulc(C.warmGlow, 1.1), range: 170, int: 0.50 });
  }
  // 码头泛光灯：照亮背光机位下的船壳
  if (acc.floodLight) {
    // range 必须覆盖 view 3 的机位（main.js 按"相机在不在 range 内"筛点光），否则背光船身永远打不亮
    ctx.points.push({ p: acc.floodLight, col: mulc(C.warmGlow, 1.15), range: 320, int: 0.95 });
  }
  // 两个带天线碟的浮标各一盏弱红灯
  let n = 0;
  for (const b of acc.buoys) {
    if (!b.dish || n >= 2) continue;
    ctx.points.push({ p: [...b.p], col: mulc(BUOY_RED, 0.8), range: 120, int: 0.4 });
    n++;
  }
  // 远航剪影：一盏冷白航行灯，给远景一点层次
  const far = acc.ships.find((s) => s.detail === 0);
  if (far) ctx.points.push({ p: [...far.p], col: mulc(C.star, 0.7), range: 240, int: 0.35 });
}

// ================================================================ 入口
export function buildSpaceProps(b, ctx) {
  const R = mulberry32(0x57a11003);    // 主种子（任务指定）
  const Rs = mulberry32(0x57a11013);   // 岩体形状用（同一份源码仍然逐三角相同）
  const acc = {
    asteroids: 0,
    rocks: [], ships: [], whales: [], buoys: [], sisters: [], beacons: [], plumes: [],
    plumeLight: null, dockLight: null, floodLight: null,
  };
  buildAsteroidField(b, acc, R, Rs);
  for (const spec of WHALES) buildWhale(b, ctx, acc, spec);
  for (const spec of SHIPS) buildFreighter(b, ctx, acc, Rs, spec);
  for (const spec of BUOYS) buildBuoy(b, ctx, acc, Rs, spec);
  for (const spec of SISTERS) buildSister(b, ctx, acc, Rs, spec);
  buildDust(ctx, R);
  buildBeacons(ctx, acc.beacons);
  buildPlumeGlow(ctx, acc.plumes);
  pushLights(ctx, acc);
  // 模块交接：只写自己的键
  if (ctx.props) {
    ctx.props.props = {
      ships: acc.ships,
      whales: acc.whales,
      asteroids: acc.asteroids,
      asteroidList: acc.rocks,
      buoys: acc.buoys,
      sisters: acc.sisters,
      beacons: acc.beacons.length,
      motes: 500,
    };
  }
}
