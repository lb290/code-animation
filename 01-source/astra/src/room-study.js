
// room-study.js — ROUND 16 · 「青花书房」( THE PORCELAIN STUDY ) 的室内内容模块。
//
// 只负责这一间房的**局部坐标**内容；外壳（墙/门洞/大窗/地台/顶板/线脚）由
// room-shell.js 提供，世界摆放由 world.js 用 roomFrame() 完成。
// 局部坐标：x ∈ [-20, 20]，y ∈ [0, 18]，z ∈ [0, 26]
//   z = 0 房门墙（桥），z = 26 大窗墙（外面是巨行星）
//
// 美术方向（ref: 46454797_p0.jpg 蓝白瓷书房）：黑白棋盘大理石地面 + 青花瓷陈设、
// 室内苹果树（铜盆）、蓝丝绒贵妃榻、水晶吊灯、飘浮的书与茶杯、蝴蝶、老座钟、
// 蘑菇玻璃罩、梯子、挂画；白瓷 + 钴蓝 + 黄铜 + 一点苹果红。
import {
  box, cylinder, lathe, sphere, torus, disc, ellipsoid, tubePath, bar3,
  mulc, mixc, rgb, m4, TAU, mulberry32,
} from './engine.js';
import { C } from './palette.js';
import { roomEntry, roomFrame, roomToWorld } from './interiors-plan.js';
import { buildRoomShell } from './room-shell.js';

const R = roomEntry('study');
const W = R.W, D = R.D, H = R.H;
const INX = W / 2 - 0.9;       // 19.1：侧墙内表面
const ZW = D;                  // 26：大窗墙内表面

// ---------------------------------------------------------------- 色板
const CL = {
  porc: rgb('#eef3f8'), porcWarm: rgb('#e6dece'), porcS: rgb('#d3dfec'),
  cobalt: rgb('#1f4f96'), cobaltD: rgb('#14316a'), azure: rgb('#3d79c6'),
  ice: rgb('#a9cae6'), sky: rgb('#d6e8f4'),
  velvet: rgb('#28509e'), velvetD: rgb('#1a3770'), velvetHi: rgb('#4170c4'),
  gold: C.brass, goldHi: C.brassHi, goldD: C.brassDark,
  wood: rgb('#cfb894'), woodDk: rgb('#a58a63'),
  marbleB: rgb('#171b24'), marbleW: rgb('#eef2f6'), marbleG: rgb('#b6c0ca'),
  apple: rgb('#c2352c'), appleLt: rgb('#e0604a'),
  bloom: rgb('#f0a6c2'), bloomD: rgb('#dd7ea6'), bloomB: rgb('#8fb8e8'),
  leaf: rgb('#3d7a5c'), leafLt: rgb('#71bf8e'), leafDk: rgb('#264e3d'),
  flame: C.ember, glow: C.warmGlow, cyan: C.cyanGlow,
  crystal: rgb('#d6ecff'), crystalHi: rgb('#f0f9ff'),
  glass: rgb('#c2e0f2'), black: rgb('#241f28'), paper: rgb('#f6efdd'),
  red: rgb('#8d2b2c'), soil: rgb('#3a2c22'), brassIn: rgb('#c8994a'),
  ember: C.ember, cyanGlow: C.cyanGlow, glassDeep: C.glassDeep, bark: rgb('#6b4f38'),
};
// 材质 = [emissive, gloss]
const M = {
  porc: [0.045, 0.46], porcS: [0.038, 0.30], glaz: [0.055, 0.70],
  cobalt: [0.06, 0.56], gold: [0.08, 0.88], goldD: [0.05, 0.55],
  velvet: [0.05, 0.16], velvetD: [0.04, 0.10],
  wood: [0.05, 0.28], woodD: [0.05, 0.40],
  marbleB: [0.07, 0.55], marbleW: [0.06, 0.34],
  stone: [0.05, 0.22], black: [0.02, 0.12],
  flame: [0.92, 0.10], lamp: [0.60, 0.14],
  crystal: [0.44, 0.95], glass: [0.18, 0.86],
  leaf: [0.05, 0.12], apple: [0.09, 0.60], bloom: [0.11, 0.30],
  paper: [0.09, 0.08], cloth: [0.05, 0.07],
  brass: [0.07, 0.80], brassD: [0.05, 0.50],
};

// ---------------------------------------------------------------- 小工具
let rng = null;
let ITEMS = 0;
const rr = (a, b) => a + (b - a) * rng();
const pick = (a) => a[Math.min(a.length - 1, (rng() * a.length) | 0)];
const item = () => { ITEMS++; };
const at = (b, x, y, z, fn) => { b.push(m4.translate([x, y, z])); fn(); b.pop(); };
const ry = (b, x, y, z, a, fn) => {
  b.push(m4.translate([x, y, z])); b.push(m4.rotY(a)); fn(); b.pop(); b.pop();
};
const rx = (b, x, y, z, a, fn) => {
  b.push(m4.translate([x, y, z])); b.push(m4.rotX(a)); fn(); b.pop(); b.pop();
};
const ZP = [0, 0, 1], ZN = [0, 0, -1], YN = [0, -1, 0], YP = [0, 1, 0];
function rect(b, x0, y0, x1, y1, z, col, mat, N = ZP) {
  if (x1 - x0 < 1e-5 || y1 - y0 < 1e-5) return;
  b.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], col, mat, N);
}
function circleXY(b, r, seg, col, mat, z = 0, N = ZP) {
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    b.tri([0, 0, z], [Math.cos(a1) * r, Math.sin(a1) * r, z], [Math.cos(a0) * r, Math.sin(a0) * r, z], col, mat, N, N, N);
  }
}
function circleXZ(b, r, seg, col, mat, y, N = YP) {
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    b.tri([0, y, 0], [Math.cos(a0) * r, y, Math.sin(a0) * r], [Math.cos(a1) * r, y, Math.sin(a1) * r], col, mat, N, N, N);
  }
}
// 青花带纹（白釉 + 钴蓝弦纹）
const blueWhite = (h, base = CL.porc, acc = CL.cobalt) => (y) => {
  const t = h > 0 ? y / h : 0;
  if (t < 0.10 || t > 0.92) return mixc(acc, CL.cobaltD, 0.35);
  if (t > 0.20 && t < 0.28) return acc;
  if (t > 0.40 && t < 0.49) return mixc(acc, base, 0.18);
  if (t > 0.56 && t < 0.61) return mixc(acc, base, 0.35);
  if (t > 0.70 && t < 0.78) return mixc(acc, base, 0.25);
  return base;
};

// ---------------------------------------------------------------- 青花器皿
function vaseBaluster(b, s = 1, seg = 12) {
  const h = 2.05 * s;
  const prof = [[0.44, 0], [0.58, 0.05], [0.76, 0.20], [0.84, 0.42], [0.74, 0.63],
    [0.46, 0.79], [0.33, 0.88], [0.40, 0.96], [0.35, 1.0]].map(([r, y]) => [r * s, y * h]);
  lathe(b, prof, seg, CL.porc, M.porc, { colFn: blueWhite(h) });
  // 腹部青花团花（4 片）
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU + 0.4;
    const px = Math.cos(a) * 0.855 * s, pz = Math.sin(a) * 0.855 * s;
    ry(b, px, h * 0.44, pz, -a + Math.PI / 2, () => {
      b.quad([-0.16 * s, -0.30 * s, 0], [0.16 * s, -0.30 * s, 0], [0.13 * s, 0.30 * s, 0], [-0.13 * s, 0.30 * s, 0],
        CL.cobalt, M.cobalt, [0, 0, 1]);
    });
  }
}
function gingerJar(b, s = 1, seg = 12) {
  const h = 1.15 * s;
  const prof = [[0.40, 0], [0.60, 0.05], [0.86, 0.22], [0.90, 0.46], [0.72, 0.72], [0.48, 0.82], [0.44, 0.87]]
    .map(([r, y]) => [r * s, y * h]);
  lathe(b, prof, seg, CL.porc, M.porc, { colFn: blueWhite(h) });
  at(b, 0, h * 0.87, 0, () => {
    lathe(b, [[0.47 * s, 0], [0.52 * s, 0.05 * s], [0.33 * s, 0.12 * s], [0.17 * s, 0.20 * s], [0.10 * s, 0.26 * s]],
      10, CL.porc, M.glaz, { colFn: blueWhite(0.26 * s) });
  });
}
function bowl(b, rad, h, seg = 12) {
  lathe(b, [[rad * 0.46, 0], [rad * 0.74, h * 0.22], [rad * 0.95, h * 0.72], [rad, h], [rad * 0.94, h * 0.99]],
    seg, CL.porc, M.glaz, { colFn: blueWhite(h) });
}
function teapot(b, s = 1) {
  ellipsoid(b, 0.52 * s, 0.44 * s, 0.52 * s, 10, 5, CL.porc, M.glaz);
  at(b, 0, 0.40 * s, 0, () => lathe(b, [[0.30 * s, 0], [0.34 * s, 0.05 * s], [0.18 * s, 0.1 * s]], 10, CL.porc, M.glaz));
  tubePath(b, [[0.42 * s, 0.16 * s, 0], [0.66 * s, 0.42 * s, 0], [0.62 * s, 0.62 * s, 0]], 0.09 * s, 5, CL.porc, M.glaz);
  torus(b, 0.3 * s, 0.055 * s, 8, 4, CL.cobalt, M.cobalt, 'z');
  at(b, -0.52 * s, 0, 0, () => {});
  // 把手
  ry(b, -0.5 * s, 0, 0, Math.PI / 2, () => { torus(b, 0.26 * s, 0.05 * s, 8, 4, CL.porc, M.porc, 'z'); });
}
function cup(b, s = 1) {
  lathe(b, [[0.26 * s, 0], [0.36 * s, 0.06 * s], [0.44 * s, 0.12 * s], [0.46 * s, 0.34 * s], [0.41 * s, 0.36 * s]],
    10, CL.porc, M.glaz, { colFn: blueWhite(0.36 * s) });
  ry(b, 0.44 * s, 0.18 * s, 0, Math.PI / 2, () => { torus(b, 0.13 * s, 0.035 * s, 7, 3, CL.porc, M.porc, 'z'); });
}
function saucer(b, s = 1) {
  lathe(b, [[0.1 * s, 0], [0.62 * s, 0.02 * s], [0.78 * s, 0.07 * s], [0.74 * s, 0.1 * s]], 12, CL.porc, M.glaz,
    { colFn: blueWhite(0.1 * s) });
}
function wallPlate(b, rad, seg = 14) {
  circleXY(b, rad, seg, CL.porc, M.glaz, 0.02);
  circleXY(b, rad * 0.62, seg, mixc(CL.porc, CL.cobalt, 0.35), M.glaz, 0.05);
  circleXY(b, rad * 0.34, seg, CL.cobalt, M.cobalt, 0.07);
  torus(b, rad * 0.98, rad * 0.09, 12, 3, CL.porc, M.glaz, 'z');
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU;
    b.quad([Math.cos(a) * rad * 0.40, Math.sin(a) * rad * 0.40, 0.075],
      [Math.cos(a + 0.18) * rad * 0.40, Math.sin(a + 0.18) * rad * 0.40, 0.075],
      [Math.cos(a + 0.09) * rad * 0.62, Math.sin(a + 0.09) * rad * 0.62, 0.075],
      [Math.cos(a - 0.09) * rad * 0.62, Math.sin(a - 0.09) * rad * 0.62, 0.075],
      CL.cobalt, M.cobalt, ZP);
  }
}

// ---------------------------------------------------------------- 框 / 画 / 镜
function frameRect(b, w, h, t, dep, col, mat) {
  const zc = dep / 2;
  at(b, 0, h / 2 - t / 2, zc, () => box(b, w, t, dep, col, mat));
  at(b, 0, -h / 2 + t / 2, zc, () => box(b, w, t, dep, col, mat));
  at(b, w / 2 - t / 2, 0, zc, () => box(b, t, h - 2 * t, dep, col, mat));
  at(b, -w / 2 + t / 2, 0, zc, () => box(b, t, h - 2 * t, dep, col, mat));
}
function landscapePainting(b, w, h) {
  const t = Math.min(w, h) * 0.075;
  frameRect(b, w, h, t, 0.20, CL.gold, M.gold);
  at(b, 0, 0, 0.16, () => {
    rect(b, -w / 2 + t, -h / 2 + t, w / 2 - t, h / 2 - t, 0, CL.sky, M.paper);
    // 远山
    for (let k = 0; k < 5; k++) {
      const x0 = -w / 2 + t + ((w - 2 * t) * k) / 5;
      const x1 = -w / 2 + t + ((w - 2 * t) * (k + 1)) / 5;
      const py = -h * 0.10 + ((k * 37) % 5) * h * 0.045;
      b.tri([x0, -h * 0.28, 0.004], [x1, -h * 0.28, 0.004], [x0 + (x1 - x0) * 0.55, py, 0.004],
        mixc(CL.azure, CL.cobaltD, 0.35 + 0.1 * (k % 3)), M.paper, ZP, ZP, ZP);
    }
    rect(b, -w / 2 + t, -h / 2 + t, w / 2 - t, -h * 0.28, 0.002, mixc(CL.leafLt, CL.ice, 0.4), M.paper);
    rect(b, -w / 2 + t, h * 0.34, w / 2 - t, h / 2 - t, 0.003, mixc(CL.sky, CL.porc, 0.6), M.paper);
    // 一朵云
    for (let k = 0; k < 3; k++) {
      const cx = -w * 0.18 + k * w * 0.13, cy = h * 0.24 + (k % 2) * 0.06 * h;
      circleXY(b, w * 0.055, 8, CL.porc, M.paper, 0.006);
      at(b, cx, cy, 0, () => circleXY(b, w * 0.055, 8, CL.porc, M.paper, 0.008));
    }
  });
}
function portraitPainting(b, w, h) {
  const t = Math.min(w, h) * 0.09;
  frameRect(b, w, h, t, 0.16, CL.goldD, M.goldD);
  at(b, 0, 0, 0.13, () => {
    rect(b, -w / 2 + t, -h / 2 + t, w / 2 - t, h / 2 - t, 0, mixc(CL.sky, CL.velvet, 0.35), M.paper);
    ellipsoid(b, w * 0.16, h * 0.20, 0.02, 8, 4, CL.porcS, M.paper);
    at(b, 0, h * 0.16, 0.02, () => circleXY(b, w * 0.075, 10, CL.porcWarm, M.paper));
    rect(b, -w * 0.15, -h * 0.46 + t, w * 0.15, -h * 0.18, 0.01, CL.velvetD, M.paper);
  });
}
function mirror(b, w, h) {
  const t = Math.min(w, h) * 0.1;
  frameRect(b, w, h, t, 0.18, CL.gold, M.gold);
  rect(b, -w / 2 + t, -h / 2 + t, w / 2 - t, h / 2 - t, 0.10, mixc(CL.ice, CL.porc, 0.45), [0.14, 0.92]);
  for (let k = 0; k < 3; k++) {
    rect(b, -w * 0.20 + k * w * 0.16, -h * 0.34, -w * 0.16 + k * w * 0.16, h * 0.32, 0.104,
      mixc(CL.porc, CL.ice, 0.3), [0.16, 0.94]);
  }
}

// ---------------------------------------------------------------- 灯
function candleFlame(b, y, s = 1) {
  at(b, 0, y, 0, () => {
    ellipsoid(b, 0.055 * s, 0.16 * s, 0.055 * s, 6, 3, CL.glow, M.flame);
  });
}
function wallSconce(b) {
  // 贴墙壁灯：黄铜臂 + 蜡烛 + 白瓷罩
  at(b, 0, 0, 0.10, () => box(b, 0.34, 0.62, 0.20, CL.gold, M.gold));
  bar3(b, [0, 0.1, 0.16], [0, 0.28, 0.62], 0.10, 0.10, CL.gold, M.gold, [1, 0, 0]);
  at(b, 0, 0.34, 0.62, () => {
    cylinder(b, 8, 0.16, 0.20, 0.10, CL.gold, M.gold, { y0: 0 });
    cylinder(b, 8, 0.07, 0.07, 0.42, CL.porc, M.porc, { y0: 0.10 });
    lathe(b, [[0.34, 0], [0.30, 0.26], [0.20, 0.44], [0.13, 0.52]], 10, CL.porc, M.lamp);
  });
  at(b, 0, 0.62, 0.62, () => candleFlame(b, 0.10, 1.1));
}

// ============================================================ 地面：黑白棋盘大理石 + 钴蓝边 + 中央徽章
function buildFloor(b) {
  const Y = 0.004;
  const X0 = -18.3, X1 = 18.3, ZA = 1.3, ZB = 25.2;
  const NX = 18, NZ = 12;
  const tw = (X1 - X0) / NX, td = (ZB - ZA) / NZ;
  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NZ; j++) {
      const xa = X0 + i * tw, za = ZA + j * td;
      const dark = (i + j) % 2 === 0;
      const col = dark ? mulc(CL.marbleB, 1 + ((i * 7 + j * 3) % 3) * 0.06)
        : mulc(rgb('#c8d4e2'), 1 - ((i * 5 + j * 11) % 3) * 0.03);
      b.quad([xa, Y, za], [xa + tw, Y, za], [xa + tw, Y, za + td], [xa, Y, za + td],
        col, dark ? M.marbleB : M.marbleW, YP);
    }
  }
  // 钴蓝边带（棋盘区外圈）
  const bandC = mixc(CL.cobaltD, CL.cobalt, 0.25);
  b.quad([-INX, Y, 0], [X0, Y, 0], [X0, Y, ZW], [-INX, Y, ZW], bandC, M.marbleB, YP);
  b.quad([X1, Y, 0], [INX, Y, 0], [INX, Y, ZW], [X1, Y, ZW], bandC, M.marbleB, YP);
  b.quad([X0, Y, 0], [X1, Y, 0], [X1, Y, ZA], [X0, Y, ZA], bandC, M.marbleB, YP);
  b.quad([X0, Y, ZB], [X1, Y, ZB], [X1, Y, ZW], [X0, Y, ZW], bandC, M.marbleB, YP);
  // 金线（棋盘区边界）
  const gl = mixc(CL.gold, CL.porc, 0.25);
  const glY = Y + 0.006;
  b.quad([X0 - 0.14, glY, ZA - 0.14], [X1 + 0.14, glY, ZA - 0.14], [X1 + 0.14, glY, ZA], [X0 - 0.14, glY, ZA], gl, M.gold, YP);
  b.quad([X0 - 0.14, glY, ZB], [X1 + 0.14, glY, ZB], [X1 + 0.14, glY, ZB + 0.14], [X0 - 0.14, glY, ZB + 0.14], gl, M.gold, YP);
  b.quad([X0 - 0.14, glY, ZA], [X0, glY, ZA], [X0, glY, ZB], [X0 - 0.14, glY, ZB], gl, M.gold, YP);
  b.quad([X1, glY, ZA], [X1 + 0.14, glY, ZA], [X1 + 0.14, glY, ZB], [X1, glY, ZB], gl, M.gold, YP);
  // 中央徽章（吊灯正下方）
  const cy = Y + 0.012;
  disc(b, 4.6, 36, mixc(CL.cobaltD, CL.marbleB, 0.3), M.marbleB, { inner: 4.1, y: cy, center: [0, 0, 11.0] });
  disc(b, 4.1, 36, mixc(CL.porc, CL.ice, 0.5), M.marbleW, { inner: 3.7, y: cy, center: [0, 0, 11.0] });
  disc(b, 2.2, 28, mixc(CL.cobalt, CL.azure, 0.4), M.marbleB, { inner: 1.95, y: cy + 0.002, center: [0, 0, 11.0] });
  disc(b, 1.2, 20, mixc(CL.gold, CL.porc, 0.3), M.gold, { y: cy + 0.004, center: [0, 0, 11.0] });
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * TAU;
    const x0 = Math.cos(a) * 2.3, z0 = Math.sin(a) * 2.3 + 12.2;
    const x1 = Math.cos(a + 0.04) * 4.2, z1 = Math.sin(a + 0.04) * 4.2 + 12.2;
    b.quad([x0, cy + 0.003, z0], [x0 + 0.10 * Math.cos(a + 1.5), cy + 0.003, z0 + 0.10 * Math.sin(a + 1.5)],
      [x1, cy + 0.003, z1], [x1 + 0.10 * Math.cos(a + 1.5), cy + 0.003, z1 + 0.10 * Math.sin(a + 1.5)],
      mixc(CL.ice, CL.porc, 0.4), M.marbleW, YP);
  }
  item(); // 1 棋盘地面
  item(); // 2 中央徽章
}

// ============================================================ 天花：藻井 + 金肋 + 顶心玫瑰
function buildCeiling(b) {
  const Y = H - 0.03;
  const bands = [[0.5, 6.1], [6.9, 12.6], [13.4, 19.1], [19.9, 25.5]];
  const cols = [-19.05, -14.2, -9.5, -4.8, 0, 4.8, 9.5, 14.2, 19.05];
  for (let bi = 0; bi < bands.length; bi++) {
    const [za, zb] = bands[bi];
    for (let ci = 0; ci < cols.length - 1; ci++) {
      const xa = cols[ci], xb = cols[ci + 1];
      const alt = (bi + ci) % 2 === 0;
      b.quad([xa, Y, za], [xa, Y, zb], [xb, Y, zb], [xb, Y, za],
        alt ? mixc(CL.cobaltD, CL.cobalt, 0.35) : mixc(CL.cobaltD, CL.azure, 0.22), M.porcS, YN);
      b.quad([xa + 0.5, Y - 0.004, za + 0.5], [xa + 0.5, Y - 0.004, zb - 0.5], [xb - 0.5, Y - 0.004, zb - 0.5], [xb - 0.5, Y - 0.004, za + 0.5],
        mixc(CL.cobalt, CL.ice, 0.30), M.porcS, YN);
    }
  }
  // 金肋（沿 z）+ 沿 x 的次肋
  for (const x of cols) {
    at(b, x, Y + 0.02, 13.0, () => box(b, 0.16, 0.20, 25.2, CL.gold, M.gold, { bottomCol: CL.goldD }));
  }
  for (const z of [3.3, 9.5, 16.2, 22.6]) {
    at(b, 0, Y + 0.03, z, () => box(b, 38.1, 0.16, 0.14, mixc(CL.gold, CL.porc, 0.2), M.gold));
  }
  // 顶心大玫瑰（吊灯底座）
  at(b, 0, Y + 0.02, 11.0, () => {
    torus(b, 3.3, 0.20, 24, 3, CL.gold, M.gold, 'y');
    torus(b, 2.4, 0.16, 20, 3, CL.goldHi, M.gold, 'y');
    circleXZ(b, 2.1, 20, mixc(CL.porc, CL.ice, 0.4), M.porcS, -0.01, YN);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      const px = Math.cos(a) * 2.75, pz = Math.sin(a) * 2.75;
      ry(b, px, 0, pz, -a, () => {
        b.tri([-0.34, 0, 0], [0.34, 0, 0], [0, 0, 0.55], mixc(CL.porc, CL.cobalt, 0.25), M.porcS, YP, YP, YP);
      });
    }
  });
  // 8 个小金玫瑰
  for (let k = 0; k < 4; k++) {
    const px = -13.5 + k * 9.0, pz = 9.5;
    at(b, px, Y + 0.01, pz, () => {
      torus(b, 0.62, 0.09, 12, 3, CL.gold, M.gold, 'y');
      circleXZ(b, 0.5, 12, mixc(CL.porc, CL.gold, 0.2), M.gold, -0.01, YN);
    });
  }
  item(); // 3 藻井天花
  item(); // 4 顶心玫瑰
}

// ============================================================ 墙板 / 壁柱 / 檐部
function wallPanel(b, w, h, t, fieldCol, frameCol, frameMat, fieldMat, line) {
  rect(b, -w / 2, -h / 2, w / 2, h / 2, 0.002, fieldCol, fieldMat, ZP);
  const zc = 0.06;
  at(b, 0, h / 2 - t / 2, zc, () => box(b, w, t, 0.12, frameCol, frameMat));
  at(b, 0, -h / 2 + t / 2, zc, () => box(b, w, t, 0.12, frameCol, frameMat));
  at(b, w / 2 - t / 2, 0, zc, () => box(b, t, h - 2 * t, 0.12, frameCol, frameMat));
  at(b, -w / 2 + t / 2, 0, zc, () => box(b, t, h - 2 * t, 0.12, frameCol, frameMat));
  if (line) {
    const inset = t * 1.5;
    rect(b, -w / 2 + inset, -h / 2 + inset, w / 2 - inset, h / 2 - inset, 0.005, line, M.gold, ZP);
  }
}
function sideWallDecor(b, s) {
  const x = s * (INX - 0.02);
  const yaw = s < 0 ? Math.PI / 2 : -Math.PI / 2;
  const bays = [[0.9, 2.9], [3.9, 8.5], [9.5, 14.1], [15.1, 19.7], [20.7, 24.9]];
  const field = s < 0 ? mixc(CL.ice, CL.porc, 0.42) : mixc(CL.ice, CL.porc, 0.32);
  for (let bi = 0; bi < bays.length; bi++) {
    const [za, zb] = bays[bi];
    const w = zb - za - 0.5, zc = (za + zb) / 2;
    if (w < 0.6) continue;
    // 只有左墙（观景面）与右墙空余处做整面墙板；书柜/壁炉背后省三角
    const skip = s > 0 && (bi === 1 || bi === 2 || bi === 3);
    if (!skip) {
      ry(b, x, 2.55, zc, yaw, () => wallPanel(b, w, 2.6, 0.26, mixc(CL.cobaltD, CL.cobalt, 0.3), CL.porc, M.porc, M.porcS, mixc(CL.gold, CL.porc, 0.5)));
      ry(b, x, 8.2, zc, yaw, () => wallPanel(b, w, 7.0, 0.34, field, CL.porc, M.porc, M.porcS, mixc(CL.gold, CL.porc, 0.45)));
    } else {
      // 书柜上方的高墙板
      ry(b, x, 12.0, zc, yaw, () => wallPanel(b, w, 3.4, 0.30, field, CL.porc, M.porc, M.porcS, mixc(CL.gold, CL.porc, 0.4)));
    }
    // 檐下小饰板（两段）
    ry(b, x, 14.9, zc, yaw, () => {
      rect(b, -w / 2, -0.75, w / 2, 0.75, 0.002, mixc(CL.porc, CL.cobalt, 0.10), M.porcS, ZP);
      at(b, 0, 0, 0.05, () => box(b, w, 0.12, 0.08, CL.gold, M.gold));
    });
  }
  // 壁柱上的蓝白瓷盘（左墙才加，右墙被书柜挡住）
  if (s < 0) {
    for (const z of [9.5, 14.1, 20.7, 24.9]) {
      ry(b, x, 6.4, z, yaw, () => wallPlate(b, 0.55, 12));
    }
  }
  // 上檐金线
  ry(b, x, 16.9, 13.0, yaw, () => {
    at(b, 0, 0, 0.10, () => box(b, 25.8, 0.16, 0.16, CL.gold, M.gold));
  });
}
function doorWallDecor(b) {
  const field = mixc(CL.ice, CL.porc, 0.38);
  for (const s of [-1, 1]) {
    for (let k = 0; k < 2; k++) {
      const xc = s * (9.9 + k * 5.6);
      ry(b, xc, 2.55, 0.02, 0, () => wallPanel(b, 4.0, 2.6, 0.24, field, CL.porc, M.porc, M.porcS, mixc(CL.gold, CL.porc, 0.45)));
      ry(b, xc, 8.2, 0.02, 0, () => wallPanel(b, 4.0, 7.0, 0.30, field, CL.porc, M.porc, M.porcS, mixc(CL.gold, CL.porc, 0.45)));
      ry(b, xc, 14.9, 0.02, 0, () => {
        rect(b, -2.0, -0.75, 2.0, 0.75, 0.002, mixc(CL.porc, CL.cobalt, 0.10), M.porcS, ZP);
        at(b, 0, 0, 0.05, () => box(b, 4.0, 0.12, 0.08, CL.gold, M.gold));
      });
    }
  }
  // 门上拱心石上方的大圆瓷板
  ry(b, 0, 16.35, 0.03, 0, () => {
    torus(b, 1.55, 0.20, 20, 4, CL.gold, M.gold, 'z');
    circleXY(b, 1.42, 20, CL.porc, M.glaz, 0.05);
    circleXY(b, 0.95, 20, mixc(CL.porc, CL.cobalt, 0.22), M.glaz, 0.07);
    circleXY(b, 0.52, 16, CL.cobalt, M.cobalt, 0.09);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      b.quad([Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0.085], [Math.cos(a + 0.16) * 0.55, Math.sin(a + 0.16) * 0.55, 0.085],
        [Math.cos(a + 0.08) * 1.30, Math.sin(a + 0.08) * 1.30, 0.085], [Math.cos(a - 0.08) * 1.30, Math.sin(a - 0.08) * 1.30, 0.085],
        CL.cobalt, M.cobalt, ZP);
    }
  });
  item(); // 5 门墙瓷板
}
function windowWallDecor(b) {
  const field = mixc(CL.ice, CL.porc, 0.38);
  // 两侧窗间墙
  for (const s of [-1, 1]) {
    const xc = s * 17.0;
    ry(b, xc, 2.55, ZW - 0.02, Math.PI, () => wallPanel(b, 3.2, 2.6, 0.24, field, CL.porc, M.porc, M.porcS, CL.gold));
    ry(b, xc, 8.4, ZW - 0.02, Math.PI, () => wallPanel(b, 3.2, 7.4, 0.30, field, CL.porc, M.porc, M.porcS, CL.gold));
    ry(b, xc, 15.0, ZW - 0.02, Math.PI, () => {
      rect(b, -1.6, -0.7, 1.6, 0.7, 0.002, mixc(CL.porc, CL.cobalt, 0.12), M.porcS, ZP);
      at(b, 0, 0, 0.05, () => box(b, 3.2, 0.12, 0.08, CL.gold, M.gold));
    });
    // 窗间墙上的青花大盘
    ry(b, xc, 6.2, ZW - 0.05, Math.PI, () => wallPlate(b, 0.9, 16));
  }
  // 窗套内侧一圈金线（贴窗洞内缘）
  ry(b, 0, 0, ZW - 0.03, Math.PI, () => {
    rect(b, -15.5, 16.0, 15.5, 16.4, 0.02, CL.gold, M.gold, ZP);
  });
  item(); // 6 窗间墙板 + 瓷盘
}

// ============================================================ 窗帘 + 帘幔（窗内两侧）
function drape(b, w, h, folds, col, mat, zOff) {
  const NX = folds * 2, NY = 5;
  const P = (i, j) => {
    const u = i / NX, v = j / NY;
    const x = (u - 0.5) * w;
    const y = h * (1 - v);
    const zz = zOff + 0.26 * Math.sin(u * Math.PI * folds * 2.0) * (0.35 + 0.65 * v);
    return [x, y, zz];
  };
  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NY; j++) {
      const a = P(i, j + 1), bb = P(i + 1, j + 1), c = P(i + 1, j), d = P(i, j);
      b.quad(a, bb, c, d, mulc(col, 0.86 + 0.14 * ((i + j) % 2)), mat, ZN);
    }
  }
}
function swag(b, w, yTop, z, sag, col, mat) {
  const N = 12;
  for (let i = 0; i < N; i++) {
    const t0 = i / N, t1 = (i + 1) / N;
    const x0 = -w / 2 + w * t0, x1 = -w / 2 + w * t1;
    const y0 = yTop - sag * Math.sin(Math.PI * t0), y1 = yTop - sag * Math.sin(Math.PI * t1);
    b.quad([x0, yTop, z], [x1, yTop, z], [x1, y1, z + 0.30], [x0, y0, z + 0.30], mulc(col, 0.94), mat, ZN);
    b.quad([x0, y0, z + 0.30], [x1, y1, z + 0.30], [x1, y1 - 0.16, z + 0.34], [x0, y0 - 0.16, z + 0.34],
      mulc(col, 0.8), mat, ZN);
  }
}

// ============================================================ 蓝丝绒贵妃榻 / 扶手椅 / 桌 / 猫
function chaiseLongue(b) {
  const L = 8.4, Dp = 2.7;
  // 六条鎏金弯腿
  for (const lx of [-3.5, 0, 3.5]) {
    for (const lz of [-1.0, 1.0]) {
      at(b, lx, 0, lz, () => {
        lathe(b, [[0.24, 0], [0.16, 0.30], [0.28, 0.60], [0.17, 0.88], [0.22, 1.02]], 8, CL.gold, M.gold);
        at(b, 0, 0.07, 0, () => sphere(b, 0.17, CL.goldHi, M.gold, { rings: 2, seg: 6, jitter: 0.04, seed: 3 }));
      });
    }
  }
  // 座框（金）+ 座垫
  at(b, 0, 1.06, 0, () => box(b, L, 0.22, Dp, CL.goldD, M.goldD, { topCol: CL.gold }));
  at(b, 0, 1.40, 0.02, () => box(b, L - 0.24, 0.48, Dp - 0.22, CL.velvet, M.velvet, { topCol: CL.velvetHi }));
  // 前沿卷边
  at(b, 0, 1.44, Dp / 2 - 0.12, () => {
    b.push(m4.rotZ(Math.PI / 2));
    cylinder(b, 10, 0.24, 0.24, L - 0.3, CL.velvetHi, M.velvet, { y0: -(L - 0.3) / 2, caps: true });
    b.pop();
  });
  // 靠背（微后倾）+ 金边
  at(b, 0, 0, -Dp / 2 + 0.34, () => {
    b.push(m4.rotX(-0.12));
    at(b, 0, 2.30, 0, () => box(b, L - 0.16, 1.80, 0.34, CL.velvet, M.velvet, { topCol: CL.velvetHi }));
    at(b, 0, 3.22, 0.02, () => box(b, L - 0.06, 0.16, 0.46, CL.gold, M.gold));
    b.pop();
  });
  // 拉扣（菱形排布）
  for (let k = 0; k < 7; k++) {
    for (let j = 0; j < 2; j++) {
      at(b, -2.9 + k * 0.98, 2.06 + j * 0.66 + (k % 2) * 0.10, -Dp / 2 + 0.50, () => sphere(b, 0.07, CL.velvetD, M.velvetD, { rings: 2, seg: 5, jitter: 0.02, seed: 7 + k }));
    }
  }
  // 两端扶手（卷轴 + 金球）
  for (const sx of [-1, 1]) {
    at(b, sx * (L / 2 - 0.18), 1.62, 0.05, () => box(b, 0.34, 0.60, Dp - 0.30, CL.velvetD, M.velvetD));
    at(b, sx * (L / 2 - 0.18), 1.98, 0.05, () => {
      b.push(m4.rotX(Math.PI / 2));
      cylinder(b, 10, 0.28, 0.28, Dp - 0.44, CL.velvet, M.velvet, { y0: -(Dp - 0.44) / 2, caps: true });
      b.pop();
    });
    at(b, sx * (L / 2 - 0.18), 1.98, Dp / 2 - 0.18, () => sphere(b, 0.28, CL.gold, M.gold, { rings: 2, seg: 7, jitter: 0.02, seed: 5 }));
    at(b, sx * (L / 2 - 0.18), 1.98, -Dp / 2 + 0.22, () => sphere(b, 0.28, CL.gold, M.gold, { rings: 2, seg: 7, jitter: 0.02, seed: 6 }));
    at(b, sx * (L / 2 - 0.18), 2.60, -Dp / 2 + 0.50, () => box(b, 0.30, 1.30, 0.60, CL.velvet, M.velvet));
  }
  // 抱枕（深蓝 / 冰蓝 / 赭金）
  const pil = [[-2.6, CL.velvetHi, 0.4], [2.5, mixc(CL.velvetD, CL.cobalt, 0.5), -0.3], [0.0, mixc(CL.gold, CL.wood, 0.5), 0.15]];
  for (let k = 0; k < pil.length; k++) {
    const px = pil[k][0], pc = pil[k][1], a = pil[k][2];
    at(b, px, 1.98, -0.62, () => {
      b.push(m4.rotY(a));
      box(b, 1.42, 0.52, 1.25, pc, M.velvet, { topCol: mixc(pc, CL.porc, 0.18) });
      b.pop();
    });
  }
  // 搭在靠背上的丝毯
  at(b, 3.2, 2.55, -Dp / 2 + 0.30, () => {
    b.push(m4.rotY(-0.14));
    b.quad([-0.9, -0.95, 0.20], [0.9, -0.95, 0.20], [0.85, 0.55, 0.30], [-0.85, 0.55, 0.30], mixc(CL.azure, CL.ice, 0.35), M.cloth, ZP);
    b.quad([-0.85, 0.55, 0.30], [0.85, 0.55, 0.30], [0.80, 0.96, -0.05], [-0.80, 0.96, -0.05], mixc(CL.ice, CL.porc, 0.45), M.cloth, ZP);
    b.quad([-0.88, -0.40, 0.24], [0.88, -0.40, 0.24], [0.86, -0.28, 0.26], [-0.86, -0.28, 0.26], mixc(CL.cobalt, CL.azure, 0.35), M.cloth, ZP);
    b.pop();
  });
  // 鎏金流苏裙边
  at(b, 0, 0.86, 0, () => box(b, L + 0.04, 0.14, Dp + 0.04, CL.gold, M.gold));
  for (let k = 0; k < 9; k++) {
    at(b, -3.6 + k * 0.9, 0.72, Dp / 2 + 0.02, () => box(b, 0.10, 0.24, 0.06, CL.goldHi, M.gold));
  }
  item();
  item(); // 抱枕
}
function armchair(b) {
  at(b, 0, 1.35, 0, () => box(b, 2.5, 0.40, 2.3, CL.gold, M.goldD, { topCol: CL.gold }));
  at(b, 0, 1.66, 0.05, () => box(b, 2.2, 0.36, 2.0, CL.velvet, M.velvet, { topCol: CL.velvetHi }));
  at(b, 0, 2.62, -0.92, () => box(b, 2.4, 2.05, 0.38, CL.velvet, M.velvet, { topCol: CL.velvetHi }));
  at(b, 0, 3.60, -0.92, () => box(b, 2.54, 0.18, 0.48, CL.gold, M.gold));
  for (let k = 0; k < 2; k++) {
    for (let j = 0; j < 3; j++) {
      at(b, -0.6 + k * 1.2, 2.15 + j * 0.6, -0.70, () => sphere(b, 0.07, CL.velvetD, M.velvetD, { rings: 2, seg: 5, jitter: 0.02, seed: 2 }));
    }
  }
  for (const sx of [-1, 1]) {
    at(b, sx * 1.15, 1.98, 0.1, () => box(b, 0.32, 0.52, 2.05, CL.gold, M.goldD, { topCol: CL.gold }));
    at(b, sx * 1.15, 2.30, 0.1, () => {
      b.push(m4.rotX(Math.PI / 2));
      cylinder(b, 10, 0.18, 0.18, 1.95, CL.gold, M.gold, { y0: -0.975, caps: true });
      b.pop();
    });
    at(b, sx * 1.05, 0.55, -0.9, () => lathe(b, [[0.16, 0], [0.12, 0.38], [0.20, 0.85], [0.13, 1.05]], 8, CL.gold, M.gold));
    at(b, sx * 1.05, 0.55, 0.9, () => lathe(b, [[0.16, 0], [0.12, 0.38], [0.20, 0.85], [0.13, 1.05]], 8, CL.gold, M.gold));
  }
  at(b, 0, 1.86, 0.05, () => box(b, 1.9, 0.16, 1.8, mixc(CL.velvet, CL.ice, 0.35), M.velvet));
  item();
}
function roundTable(b, r = 1.5, h = 2.25) {
  at(b, 0, 0, 0, () => {
    lathe(b, [[0.62, 0], [0.72, 0.10], [0.34, 0.35], [0.28, 0.9], [0.42, 1.55], [0.78, h - 0.3], [1.02, h - 0.12]],
      14, CL.gold, M.goldD);
  });
  at(b, 0, h, 0, () => {
    circleXZ(b, r, 22, CL.marbleW, M.marbleW, 0, YP);
    torus(b, r, 0.11, 26, 4, CL.gold, M.gold, 'y');
  });
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU;
    at(b, Math.cos(a) * 0.55, 0.09, Math.sin(a) * 0.55, () => {
      bar3(b, [0, 0, 0], [Math.cos(a) * 0.65, -0.02, Math.sin(a) * 0.65], 0.24, 0.18, CL.goldD, M.goldD);
    });
  }
}
function catOnRug(b) {
  at(b, 0, 0.46, 0, () => ellipsoid(b, 1.05, 0.44, 0.56, 12, 6, CL.black, M.black));
  at(b, 0.92, 0.72, 0, () => sphere(b, 0.36, CL.black, M.black, { rings: 4, seg: 8, jitter: 0.05, seed: 5 }));
  for (const sz of [-1, 1]) {
    at(b, 1.02, 0.98, sz * 0.19, () => cylinder(b, 4, 0.13, 0.0, 0.28, CL.black, M.black));
    at(b, 1.20, 0.78, sz * 0.14, () => sphere(b, 0.06, CL.cyan, [0.55, 0.9], { rings: 2, seg: 5, jitter: 0 }));
  }
  tubePath(b, [[-0.95, 0.34, 0], [-1.45, 0.52, 0.26], [-1.62, 0.86, 0.58]], 0.11, 5, CL.black, M.black);
  for (const [x, z] of [[0.5, 0.42], [0.5, -0.42], [-0.5, 0.42], [-0.5, -0.42]]) {
    at(b, x, 0.16, z, () => sphere(b, 0.19, CL.black, M.black, { rings: 2, seg: 5, jitter: 0.03, seed: 1 }));
  }
  item();
}
function rug(b, cx, cz, r) {
  const y = 0.035;
  disc(b, r, 40, mixc(CL.cobaltD, CL.cobalt, 0.28), M.cloth, { y, center: [cx, 0, cz] });
  disc(b, r * 0.955, 40, mixc(CL.azure, CL.ice, 0.62), M.cloth, { y: y + 0.002, center: [cx, 0, cz] });
  disc(b, r * 0.90, 40, mixc(CL.ice, CL.porc, 0.55), M.cloth, { y: y + 0.003, center: [cx, 0, cz] });
  for (const k of [0.78, 0.50]) {
    disc(b, r * k, 36, mixc(CL.cobalt, CL.azure, 0.35), M.cloth, { inner: r * (k - 0.012), y: y + 0.004, center: [cx, 0, cz] });
  }
  disc(b, r * 0.30, 28, mixc(CL.cobalt, CL.azure, 0.28), M.cloth, { inner: r * 0.255, y: y + 0.005, center: [cx, 0, cz] });
  disc(b, r * 0.16, 20, mixc(CL.gold, CL.porc, 0.45), M.cloth, { y: y + 0.006, center: [cx, 0, cz] });
  item();
}

// ============================================================ 书桌 / 椅 / 文具
function writingDesk(b) {
  const L = 4.6, Dp = 2.0, h = 2.30;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      at(b, sx * (L / 2 - 0.28), 0, sz * (Dp / 2 - 0.28), () => {
        lathe(b, [[0.22, 0], [0.15, 0.30], [0.26, 0.95], [0.17, h - 0.4]], 8, CL.woodDk, M.woodD);
      });
    }
  }
  at(b, 0, h - 0.12, 0, () => box(b, L, 0.24, Dp, CL.wood, M.wood, { topCol: mixc(CL.wood, CL.porc, 0.45) }));
  at(b, 0, h - 0.06, Dp / 2 - 0.10, () => box(b, L - 0.1, 0.12, 0.26, CL.gold, M.gold));
  at(b, 0, h - 0.44, Dp / 2 - 0.35, () => box(b, L - 0.5, 0.44, 0.22, CL.porc, M.porc));
  for (const sx of [-1, 1]) {
    at(b, sx * 0.9, h - 0.44, Dp / 2 - 0.24, () => {
      torus(b, 0.10, 0.03, 8, 3, CL.gold, M.gold, 'z');
    });
  }
  // 桌垫 + 信纸
  at(b, -0.6, h + 0.01, 0.1, () => box(b, 2.2, 0.04, 1.3, mixc(CL.leafDk, CL.cobaltD, 0.4), M.cloth, { topCol: CL.velvet }));
  at(b, -0.6, h + 0.04, 0.05, () => {
    const pp = [CL.paper, mixc(CL.paper, CL.porc, 0.4), CL.paper];
    for (let k = 0; k < 3; k++) at(b, rr(-0.1, 0.1), k * 0.012, rr(-0.1, 0.1), () => box(b, 1.0, 0.01, 0.72, pp[k], M.paper));
  });
  // 墨水瓶 + 羽毛笔
  at(b, 0.85, h + 0.02, 0.22, () => {
    lathe(b, [[0.18, 0], [0.22, 0.10], [0.16, 0.26], [0.09, 0.30]], 10, CL.cobaltD, M.glaz);
    at(b, 0, 0.30, 0, () => cylinder(b, 8, 0.10, 0.07, 0.10, CL.gold, M.gold, { y0: 0 }));
  });
  at(b, 1.05, h + 0.35, 0.24, () => {
    b.push(m4.rotZ(0.45));
    tubePath(b, [[0, -0.1, 0], [0.10, 0.9, 0], [0.24, 1.9, 0.05], [0.42, 2.7, 0.1]], (t) => 0.035 + t * 0.02, 4, CL.porc, M.porc, { caps: false });
    // 羽片
    for (let k = 0; k < 5; k++) {
      const ty = 0.9 + k * 0.30;
      b.quad([0.02 + k * 0.02, ty, 0.02], [0.12 + k * 0.025, ty + 0.2, 0.02], [0.08 + k * 0.03, ty + 0.42, 0.02], [0.0 + k * 0.02, ty + 0.18, 0.02],
        mixc(CL.porc, CL.ice, 0.4), M.porc, [0, 0, 1]);
    }
    b.pop();
  });
  // 书 + 书立
  at(b, -1.55, h + 0.02, 0.3, () => bookStack(b, 4, 0.95, [CL.cobalt, CL.porcWarm, CL.azure, CL.red]));
  at(b, 1.6, h + 0.02, 0.35, () => {
    bookStack(b, 2, 0.9, [CL.porc, CL.cobalt]);
    at(b, 0.55, 0.5, 0, () => box(b, 0.16, 1.3, 1.0, CL.gold, M.gold));
  });
  // 台灯
  at(b, 1.82, h + 0.02, -0.42, () => {
    lathe(b, [[0.44, 0], [0.40, 0.10], [0.16, 0.24], [0.12, 0.9], [0.16, 1.30]], 10, CL.gold, M.gold);
    at(b, 0, 1.36, 0, () => {
      lathe(b, [[0.22, 0], [0.46, 0.30], [0.52, 0.62], [0.42, 0.92], [0.20, 1.02]], 12, CL.porc, M.lamp);
    });
    at(b, 0, 1.30, 0, () => sphere(b, 0.16, CL.glow, M.lamp, { rings: 2, seg: 6, jitter: 0 }));
  });
  item(); // 书桌
  item(); // 桌上文具
  item(); // 台灯
}
function deskChair(b) {
  at(b, 0, 1.62, 0, () => box(b, 2.0, 0.36, 1.9, CL.velvet, M.velvet, { topCol: CL.velvetHi }));
  at(b, 0, 2.42, -0.82, () => box(b, 2.0, 1.6, 0.34, CL.velvet, M.velvet, { topCol: CL.velvetHi }));
  at(b, 0, 3.24, -0.82, () => box(b, 2.12, 0.16, 0.42, CL.gold, M.gold));
  for (const sx of [-1, 1]) {
    at(b, sx * 0.9, 1.98, 0.05, () => box(b, 0.18, 0.42, 1.7, CL.gold, M.goldD));
    at(b, sx * 0.88, 0.75, -0.74, () => lathe(b, [[0.15, 0], [0.11, 0.4], [0.18, 1.05], [0.12, 1.28]], 8, CL.gold, M.gold));
    at(b, sx * 0.88, 0.75, 0.74, () => lathe(b, [[0.15, 0], [0.11, 0.4], [0.18, 1.05], [0.12, 1.28]], 8, CL.gold, M.gold));
  }
  at(b, 0, 1.44, 0.05, () => box(b, 1.7, 0.14, 1.6, mixc(CL.ice, CL.porc, 0.55), M.velvet));
  item(); // 书桌椅
}

// ============================================================ 水晶吊灯（冰晶枝形）
function chandelier(b) {
  // 原点 = 天花吊点，向下建
  cylinder(b, 8, 0.10, 0.10, 2.3, CL.gold, M.gold, { y0: -2.3, caps: false });
  for (let k = 0; k < 4; k++) {
    at(b, 0, -0.42 - k * 0.52, 0, () => torus(b, 0.17, 0.055, 8, 3, CL.goldHi, M.gold, 'z'));
  }
  at(b, 0, -2.55, 0, () => lathe(b, [[0.14, 0], [0.62, 0.16], [0.70, 0.36], [0.44, 0.54], [0.16, 0.62]], 12, CL.gold, M.gold));
  at(b, 0, -3.18, 0, () => lathe(b, [[0.16, 0], [0.34, 0.52], [0.24, 1.12], [0.50, 1.82], [0.34, 2.42], [0.16, 2.92]], 12, CL.gold, M.gold));
  const ringY = -4.9;
  at(b, 0, ringY, 0, () => torus(b, 1.62, 0.11, 20, 3, CL.gold, M.gold, 'y'));
  at(b, 0, ringY - 0.95, 0, () => torus(b, 1.05, 0.09, 16, 3, CL.goldHi, M.gold, 'y'));
  for (let k = 0; k < 8; k++) {
    ry(b, 0, 0, 0, (k / 8) * TAU, () => {
      tubePath(b, [[0.12, -3.55, 0], [0.85, -3.72, 0], [1.44, -3.68, 0], [1.64, -3.46, 0]], 0.075, 4, CL.gold, M.gold, { caps: false });
      at(b, 1.64, -3.40, 0, () => {
        lathe(b, [[0.22, 0], [0.28, 0.10], [0.10, 0.20]], 6, CL.gold, M.gold);
        cylinder(b, 6, 0.085, 0.085, 0.64, CL.porc, M.porc, { y0: 0.16 });
        candleFlame(b, 0.88, 1.3);
      });
    });
  }
  // 冰晶挂坠（上环 20 + 内环 10）
  for (let k = 0; k < 20; k++) {
    const a = (k / 20) * TAU;
    const len = 1.0 + ((k * 37) % 7) * 0.24;
    at(b, Math.cos(a) * 1.62, ringY - 0.06, Math.sin(a) * 1.62, () => {
      cylinder(b, 4, 0.085, 0.012, len, CL.crystal, M.crystal, { y0: -len, caps: false });
    });
  }
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * TAU + 0.3;
    const len = 0.7 + ((k * 23) % 5) * 0.22;
    at(b, Math.cos(a) * 1.05, ringY - 0.95, Math.sin(a) * 1.05, () => {
      cylinder(b, 5, 0.07, 0.01, len, CL.crystal, M.crystal, { y0: -len, caps: false });
    });
  }
  at(b, 0, ringY - 1.65, 0, () => {
    sphere(b, 0.62, CL.crystal, M.crystal, { rings: 3, seg: 8, jitter: 0.10, seed: 9 });
    torus(b, 0.40, 0.08, 12, 3, CL.gold, M.gold, 'y');
  });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;
    at(b, Math.cos(a) * 0.88, -2.85, Math.sin(a) * 0.88, () => {
      cylinder(b, 4, 0.06, 0.012, 0.6, CL.crystal, M.crystal, { caps: false });
    });
  }
  item();
}

// ============================================================ 飘浮的书 / 茶具 / 羽毛笔 / 蝴蝶
function floatingBook(b, w, h, d, cover) {
  // 封面 + 两侧书口 + 书脊，底下留一道青光
  box(b, w, h, d, cover, M.paper, { topCol: mixc(cover, CL.porc, 0.28) });
  at(b, 0, 0, d / 2 + 0.012, () => box(b, w * 0.90, h * 0.62, 0.024, mixc(CL.paper, CL.ice, 0.35), M.paper));
  at(b, 0, 0, -d / 2 - 0.012, () => box(b, w * 0.90, h * 0.62, 0.024, mixc(CL.paper, CL.ice, 0.35), M.paper));
  at(b, -w / 2 - 0.010, 0, 0, () => box(b, 0.02, h * 0.9, d * 0.92, mixc(cover, CL.gold, 0.35), M.paper));
  at(b, 0, -h * 0.55, 0, () => {
    b.quad([-w * 0.58, 0, -d * 0.58], [w * 0.58, 0, -d * 0.58], [w * 0.58, 0, d * 0.58], [-w * 0.58, 0, d * 0.58],
      mulc(CL.cyanGlow, 1.15), [0.7, 0.1], YN);
  });
}
function floatSet(b) {
  const spec = [
    [-6.8, 6.7, 20.4, 1.30, 0.35, -0.30, CL.cobalt],
    [-5.2, 8.0, 21.6, 1.15, -0.55, 0.42, CL.velvet],
    [-8.4, 5.6, 22.2, 1.05, 0.85, 0.15, mixc(CL.cobaltD, CL.azure, 0.4)],
    [-4.4, 6.1, 19.4, 1.20, 0.20, -0.70, CL.azure],
    [4.4, 7.0, 21.2, 1.25, -0.35, 0.55, CL.cobalt],
    [6.2, 8.3, 22.4, 1.10, 0.65, -0.25, mixc(CL.cobalt, CL.azure, 0.3)],
    [3.2, 5.7, 19.8, 1.00, -0.80, 0.35, CL.velvet],
    [7.6, 6.4, 20.0, 1.15, 0.40, 0.70, mixc(CL.cobaltD, CL.velvet, 0.5)],
    [-2.9, 9.4, 22.8, 0.95, 0.15, -0.45, CL.azure],
  ];
  for (let k = 0; k < spec.length; k++) {
    const [x, y, z, s, ax, az, col] = spec[k];
    at(b, x, y, z, () => {
      b.push(m4.rotY(ax)); b.push(m4.rotX(ax * 0.6)); b.push(m4.rotZ(az));
      floatingBook(b, 0.92 * s, 0.16 * s, 0.70 * s, col);
      b.pop(); b.pop(); b.pop();
    });
  }
  item(); // 飘浮书群
  // 飘浮茶具
  at(b, -2.0, 5.4, 19.6, () => {
    b.push(m4.rotX(0.35)); b.push(m4.rotZ(0.15));
    saucer(b, 0.95);
    at(b, 0, 0.10, 0, () => cup(b, 0.95));
    b.pop(); b.pop();
  });
  at(b, 2.6, 6.2, 20.6, () => {
    b.push(m4.rotX(-0.28)); b.push(m4.rotY(0.6));
    teapot(b, 0.95);
    b.pop(); b.pop();
  });
  item(); // 飘浮茶具
  // 飘浮羽毛笔 + 小书
  at(b, -4.6, 7.4, 18.6, () => {
    b.push(m4.rotZ(0.9)); b.push(m4.rotY(0.4));
    tubePath(b, [[0, -0.4, 0], [0.15, 0.8, 0], [0.35, 1.9, 0.05]], 0.045, 4, CL.porc, M.porc, { caps: false });
    for (let k = 0; k < 4; k++) {
      const ty = 0.8 + k * 0.34;
      b.quad([0.03 + k * 0.03, ty, 0.02], [0.16 + k * 0.03, ty + 0.22, 0.02], [0.11 + k * 0.04, ty + 0.46, 0.02], [0.01 + k * 0.03, ty + 0.2, 0.02],
        mixc(CL.ice, CL.porc, 0.35), M.porc, [0, 0, 1]);
    }
    b.pop(); b.pop();
  });
  item(); // 飘浮羽毛笔
}
function butterfly(b, s, c1, c2) {
  at(b, 0, 0, 0, () => {
    cylinder(b, 4, 0.035 * s, 0.022 * s, 0.58 * s, CL.black, M.black, { caps: false });
    const up = [[0.02, 0.10], [0.44, 0.50], [0.64, 0.18], [0.10, -0.02]];
    const lo = [[0.02, -0.06], [0.38, -0.38], [0.46, -0.10], [0.08, 0.02]];
    for (const sgn of [-1, 1]) {
      for (const w of [up, lo]) {
        b.quad([w[0][0] * sgn * s, w[0][1] * s, 0.02], [w[1][0] * sgn * s, w[1][1] * s, 0.02],
          [w[2][0] * sgn * s, w[2][1] * s, 0.02], [w[3][0] * sgn * s, w[3][1] * s, 0.02],
          w === up ? c1 : c2, [0.22, 0.45], ZP);
      }
    }
  });
}
function specimenFrame(b, w, h) {
  const t = Math.min(w, h) * 0.085;
  frameRect(b, w, h, t, 0.18, CL.gold, M.gold);
  rect(b, -w / 2 + t, -h / 2 + t, w / 2 - t, h / 2 - t, 0.10, mixc(CL.porc, CL.sky, 0.45), M.paper, ZP);
  for (let k = 0; k < 3; k++) {
    at(b, -w * 0.27 + k * w * 0.27, (k % 2 ? 0.12 : -0.10) * h, 0.14, () => {
      b.push(m4.rotZ(k % 2 ? 0.2 : -0.15));
      butterfly(b, 1.35, k === 1 ? CL.azure : CL.cobalt, k === 1 ? CL.cobaltD : CL.velvet);
      b.pop();
    });
  }
  item();
}

// ============================================================ 蘑菇玻璃罩 / 望远镜 / 花 / 蕨 / 条案 / 瓮
function mushroomCloche(b) {
  // 大理石小几 + 玻璃钟罩 + 淡青蓝蘑菇
  at(b, 0, 0, 0, () => {
    lathe(b, [[0.82, 0], [0.92, 0.12], [0.52, 0.36], [0.44, 0.95], [0.58, 1.45], [0.74, 1.58]], 12, CL.marbleW, M.marbleW);
    circleXZ(b, 0.96, 16, CL.marbleW, M.marbleW, 1.64, YP);
    torus(b, 0.96, 0.07, 16, 3, CL.gold, M.gold, 'y');
  });
  at(b, 0, 1.70, 0, () => {
    lathe(b, [[0.84, 0], [0.88, 0.18], [0.86, 0.78], [0.70, 1.30], [0.40, 1.68], [0.12, 1.86]], 14,
      mixc(CL.glass, CL.ice, 0.35), [0.10, 0.95]);
    circleXZ(b, 0.84, 14, CL.soil, M.stone, 0.02, YP);
    at(b, 0, 1.92, 0, () => sphere(b, 0.12, CL.gold, M.gold, { rings: 2, seg: 6, jitter: 0 }));
  });
  const ms = [[-0.32, 0.20, 0.62], [0.34, -0.12, 0.78], [0.10, 0.40, 0.50], [-0.16, -0.40, 0.56]];
  for (const [x, z, hh] of ms) {
    at(b, x, 1.72, z, () => {
      cylinder(b, 6, 0.09, 0.12, hh, CL.porc, M.porc, { y0: 0 });
      at(b, 0, hh, 0, () => lathe(b, [[0.04, 0], [0.34, 0.07], [0.38, 0.19], [0.22, 0.30], [0.04, 0.33]], 10,
        mixc(CL.ice, CL.azure, 0.5), [0.16, 0.40]));
    });
  }
  at(b, 0, 1.70, 0, () => {
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU;
      at(b, Math.cos(a) * 0.5, 0.06, Math.sin(a) * 0.5, () => sphere(b, 0.16, CL.leafDk, M.leaf, { rings: 2, seg: 5, jitter: 0.25, seed: 40 + k }));
    }
  });
  item(); // 蘑菇玻璃罩
  item(); // 温室小几
}
function telescope(b) {
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU + 0.4;
    bar3(b, [Math.cos(a) * 1.15, 0, Math.sin(a) * 1.15], [0, 3.5, 0], 0.16, 0.16, CL.goldD, M.goldD);
    at(b, Math.cos(a) * 1.15, 0.08, Math.sin(a) * 1.15, () => sphere(b, 0.17, CL.gold, M.gold, { rings: 2, seg: 5, jitter: 0 }));
  }
  at(b, 0, 3.62, 0, () => {
    sphere(b, 0.44, CL.gold, M.gold, { rings: 3, seg: 8, jitter: 0.03, seed: 4 });
    at(b, 0, 0.4, 0, () => box(b, 0.9, 0.18, 0.7, CL.goldD, M.goldD));
  });
  at(b, 0, 3.9, 0, () => {
    b.push(m4.rotX(0.72));
    cylinder(b, 12, 0.26, 0.32, 3.8, CL.gold, M.gold, { y0: -1.5, caps: true });
    at(b, 0, 2.36, 0, () => cylinder(b, 12, 0.36, 0.40, 0.5, CL.brassIn, M.brassD, { y0: 0 }));
    at(b, 0, -1.9, 0, () => cylinder(b, 10, 0.18, 0.15, 0.42, CL.goldD, M.goldD, { y0: -0.42 }));
    at(b, 0, 0.4, 0, () => torus(b, 0.30, 0.06, 10, 3, CL.goldHi, M.gold, 'y'));
    b.pop();
  });
  item(); // 望远镜
}
function hydrangea(b, s = 1, blue = true) {
  at(b, 0, 0, 0, () => {
    lathe(b, [[0.52, 0], [0.64, 0.12], [0.58, 0.55], [0.44, 1.15], [0.54, 1.45], [0.50, 1.55]].map(([r, y]) => [r * s, y * s]), 14, CL.porc, M.porc,
      { colFn: blueWhite(1.55 * s) });
  });
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * TAU + 0.2;
    const r = rr(0.30, 0.85) * s, y = rr(1.95, 3.0) * s;
    tubePath(b, [[0, 1.45 * s, 0], [r * 0.45, y - 0.6 * s, r * 0.3], [r, y, r * 0.75]], 0.05 * s, 4, CL.leaf, M.leaf, { caps: false });
    at(b, r, y, r * 0.75, () => {
      const cc = blue ? (k % 2 ? CL.bloomB : mixc(CL.bloomB, CL.ice, 0.4)) : (k % 2 ? CL.bloom : mixc(CL.bloom, CL.porc, 0.35));
      sphere(b, rr(0.24, 0.34) * s, cc, M.bloom, { rings: 2, seg: 6, jitter: 0.26, seed: k });
      for (let j = 0; j < 2; j++) {
        at(b, rr(-0.22, 0.22) * s, rr(-0.18, 0.22) * s, rr(-0.22, 0.22) * s, () => sphere(b, 0.12 * s, mixc(cc, CL.porc, 0.3), M.bloom, { rings: 2, seg: 5, jitter: 0.2, seed: k * 5 + j }));
      }
    });
  }
  leafCluster(b, 1.15 * s, CL.leafDk);
  item();
}
function fern(b, s = 1) {
  at(b, 0, 0, 0, () => {
    lathe(b, [[0.56, 0], [0.66, 0.20], [0.68, 0.95], [0.60, 1.05]], 12, CL.porc, M.porc, { colFn: blueWhite(1.05) });
    circleXZ(b, 0.6, 12, CL.soil, M.stone, 1.0, YP);
  });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU + 0.3;
    const len = rr(1.5, 2.6) * s, up = rr(0.4, 1.0) * s;
    ry(b, 0, 1.02, 0, a, () => {
      b.quad([0, 0, 0], [len, up, 0.1], [len * 0.90, up + 0.30, 0.1], [0.10, 0.16, 0],
        pick([CL.leaf, CL.leafDk, CL.leafLt]), M.leaf, [0, 1, 0]);
      for (let j = 1; j < 5; j++) {
        const t = j / 5;
        b.quad([len * t, up * t, 0.02], [len * t + 0.30 * (1 - t), up * t + 0.34, 0.02],
          [len * t + 0.22 * (1 - t), up * t + 0.20, 0.02], [len * t - 0.02, up * t - 0.04, 0.02],
          mulc(CL.leaf, 0.85), M.leaf, [0, 1, 0]);
      }
    });
  }
  item();
}
function consoleTable(b, w = 2.9) {
  at(b, 0, 2.4, 0, () => box(b, w, 0.20, 0.92, CL.marbleW, M.marbleW, { topCol: mixc(CL.marbleW, CL.porc, 0.5) }));
  at(b, 0, 2.52, 0, () => box(b, w * 0.98, 0.06, 0.88, CL.gold, M.gold));
  for (const sx of [-1, 1]) {
    at(b, sx * (w / 2 - 0.22), 0, 0.28, () => {
      lathe(b, [[0.16, 0], [0.11, 0.55], [0.19, 1.55], [0.13, 2.3]], 8, CL.gold, M.gold);
      sphere(b, 0.17, CL.goldHi, M.gold, { rings: 2, seg: 5, jitter: 0.02, seed: 2 });
    });
    at(b, sx * (w / 2 - 0.22), 0, -0.28, () => {
      lathe(b, [[0.16, 0], [0.11, 0.55], [0.19, 1.55], [0.13, 2.3]], 8, CL.gold, M.gold);
    });
  }
  bar3(b, [-w / 2 + 0.22, 0.55, 0.28], [w / 2 - 0.22, 0.55, 0.28], 0.10, 0.10, CL.goldD, M.goldD);
  item();
}
function doorUrn(b) {
  at(b, 0, 0, 0, () => {
    box(b, 1.8, 0.55, 1.8, CL.marbleW, M.marbleW, { topCol: CL.porc });
    at(b, 0, 0.55, 0, () => gingerJar(b, 2.0));
    at(b, 0, 0.42, 0, () => torus(b, 0.95, 0.07, 16, 3, CL.gold, M.gold, 'y'));
  });
  item();
}
function floorVase(b) {
  at(b, 0, 0, 0, () => {
    lathe(b, [[0.72, 0], [0.88, 0.18], [0.80, 0.95], [0.56, 1.75], [0.62, 2.15], [0.76, 2.35]], 14, CL.porc, M.porc,
      { colFn: blueWhite(2.35) });
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + 0.3;
      tubePath(b, [[0, 2.2, 0], [Math.cos(a) * 0.55, 3.3, Math.sin(a) * 0.55], [Math.cos(a) * 0.95, 4.5, Math.sin(a) * 0.95]],
        0.05, 4, CL.woodDk, M.woodD, { caps: false });
      at(b, Math.cos(a) * 0.95, 4.5, Math.sin(a) * 0.95, () => leafCluster(b, 0.9, CL.leafDk));
    }
  });
  item();
}
function libraryLadder(b, x0, z0) {
  const h = 5.4, reach = 0.85;
  const zs = [z0 - 0.55, z0 + 0.55];
  for (const z of zs) {
    bar3(b, [x0 - reach, 0, z], [x0, h, z], 0.18, 0.22, CL.gold, M.gold, [0, 0, 1]);
  }
  for (let k = 1; k < 10; k++) {
    const t = k / 10;
    const x = x0 - reach + reach * t, y = h * t;
    bar3(b, [x, y, zs[0]], [x, y, zs[1]], 0.15, 0.10, CL.goldD, M.goldD, [1, 0, 0]);
  }
  // 顶上挂钩
  for (const z of zs) {
    at(b, x0 + 0.08, h + 0.08, z, () => torus(b, 0.18, 0.05, 8, 3, CL.goldHi, M.gold, 'y'));
  }
  item(); // 梯子
}

// ============================================================ 主入口
export function buildStudyAssets(b, ctx) {
  rng = mulberry32(R.seed);
  ITEMS = 0;
  const tri0 = b.i.length / 3;
  const S = {
    wallIn: rgb('#c6d7e8'), wallOut: C.ivory, floor: rgb('#222b40'), floorTop: rgb('#d9e2ec'),
    ceil: rgb('#cfdcea'), trim: rgb('#dde6f0'), skirting: mixc(CL.cobaltD, CL.cobalt, 0.35),
    mullions: 4, transomY: 9.2, pilasterCol: rgb('#cfdeec'),
    sillCol: rgb('#e6edf6'), beamCol: rgb('#c9d8e8'), revCol: mixc(CL.cobaltD, CL.porc, 0.18),
  };
  buildRoomShell(b, ctx, R, {
    ...S,
    floor: S.floor, floorTop: S.floorTop, ceil: S.ceil, trim: S.trim,
    skirting: S.skirting, pilasterCol: S.pilasterCol, sillCol: S.sillCol, beamCol: S.beamCol,
    revCol: S.revCol,
  });

  // ---- 建筑内装
  buildFloor(b);
  buildCeiling(b);
  sideWallDecor(b, -1);
  sideWallDecor(b, 1);
  doorWallDecor(b);
  windowWallDecor(b);

  // ---- 壁炉 + 上方大画 + 炉台瓷器（左墙）
  ry(b, -INX, 0, 11.8, Math.PI / 2, () => fireplace(b));

  // ---- 室内苹果树（铜盆）
  at(b, -8.2, 0, 14.2, () => appleTree(b));

  // ---- 右墙：三座书柜 + 瓷柜 + 老座钟 + 梯子
  for (const z of [6.2, 11.8, 17.4]) ry(b, INX, 0, z, -Math.PI / 2, () => bookcase(b, 4.3));
  ry(b, INX, 0, 22.8, -Math.PI / 2, () => displayCabinet(b, 4.1));
  ry(b, INX, 0, 1.9, -Math.PI / 2, () => grandfatherClock(b));
  libraryLadder(b, 18.4, 19.05);

  // ---- 门墙：条案 + 镜 + 大瓮 + 壁灯
  for (const s of [-1, 1]) {
    ry(b, s * 9.9, 0, 0.05, 0, () => consoleTable(b, 2.9));
    ry(b, s * 9.9, 5.9, 0.10, 0, () => mirror(b, 3.0, 4.2));
    ry(b, s * 15.5, 7.9, 0.10, 0, () => portraitPainting(b, 3.2, 4.0));
    ry(b, s * 7.8, 0, 1.45, 0, () => doorUrn(b));
    // 条案上青花
    ry(b, s * 9.9, 2.6, 0.05, 0, () => {
      at(b, -0.85, 0, 0, () => gingerJar(b, 1.15));
      at(b, 0.55, 0, 0, () => vaseBaluster(b, 1.0));
      at(b, 0.0, 0, 0, () => { bowl(b, 0.40, 0.30, 10); at(b, 0, 0.3, 0, () => gingerJar(b, 0.5)); });
    });
    // 壁灯
    ry(b, s * 7.6, 7.4, 0.06, 0, () => wallSconce(b));
  }
  item(); // 门墙条案
  item(); // 条案青花
  item(); // 门墙镜
  item(); // 门墙肖像画
  item(); // 壁灯
  item(); // 门侧大瓮

  // ---- 左墙：扶手椅 + 边几 + 标本框 + 蝴蝶标本 + 瓷盘 + 条案 + 镜 + 落地瓶 + 蕨
  ry(b, -INX + 3.4, 0, 6.4, 1.35, () => armchair(b));
  at(b, -15.2, 0, 4.1, () => roundTable(b, 1.15, 2.1));
  at(b, -15.2, 2.1, 4.1, () => {
    at(b, -0.2, 0, 0.2, () => bookStack(b, 3, 0.5, [CL.cobalt, CL.porcWarm, CL.azure]));
    at(b, 0.3, 0, -0.25, () => cup(b, 1.05));
  });
  item(); // 扶手椅
  item(); // 边几与书
  ry(b, -INX, 6.6, 5.0, Math.PI / 2, () => specimenFrame(b, 2.6, 2.2));
  ry(b, -INX, 9.0, 7.6, Math.PI / 2, () => specimenFrame(b, 2.6, 2.2));
  item(); // 蝴蝶标本框 ×2
  ry(b, -INX, 6.6, 16.6, Math.PI / 2, () => {
    for (let k = 0; k < 6; k++) {
      at(b, -1.9 + (k % 3) * 1.9, k < 3 ? 0.95 : -0.95, 0.05, () => wallPlate(b, 0.62, 12));
    }
  });
  item(); // 六只青花挂盘
  ry(b, -INX, 0, 17.4, Math.PI / 2, () => consoleTable(b, 3.2));
  ry(b, -INX, 6.2, 17.4, Math.PI / 2, () => mirror(b, 3.2, 4.0));
  ry(b, -INX, 2.6, 17.4, Math.PI / 2, () => {
    at(b, -0.9, 0, 0, () => vaseBaluster(b, 1.0));
    at(b, 0.9, 0, 0, () => gingerJar(b, 1.0));
  });
  item(); // 左墙条案
  item(); // 左墙镜
  item(); // 条案青花
  ry(b, -INX, 8.2, 22.6, Math.PI / 2, () => wallSconce(b));
  ry(b, INX, 8.2, 24.6, -Math.PI / 2, () => wallSconce(b));
  at(b, -16.9, 0, 23.6, () => floorVase(b));
  at(b, 15.4, 0, 23.6, () => fern(b, 1.3));
  at(b, 10.4, 0, 15.2, () => fern(b, 1.1));
  at(b, -17.0, 0, 2.3, () => fern(b, 1.1));
  item(); // 落地大瓶
  item(); // 蕨 ×3

  // ---- 蘑菇玻璃罩（左墙前）
  at(b, 8.4, 0, 11.4, () => mushroomCloche(b));

  // ---- 贵妃榻 + 地毯 + 猫 + 靠几
  rug(b, 1.0, 18.2, 5.6);
  ry(b, 0.6, 0, 18.0, Math.PI - 0.28, () => chaiseLongue(b));
  at(b, -3.2, 0, 16.0, () => catOnRug(b));
  at(b, 7.9, 0, 16.2, () => roundTable(b, 1.0, 1.9));
  at(b, 7.9, 1.9, 16.2, () => {
    at(b, 0, 0, 0, () => cup(b, 1.1));
    at(b, 0.45, 0, 0.3, () => saucer(b, 1.1));
  });
  item(); // 地毯
  item(); // 边几茶具
  // ---- 榻前矮几 + 茶具 + 地上摊开的书 + 搭毯（生活感）
  at(b, 2.2, 0, 14.4, () => roundTable(b, 1.3, 1.55));
  at(b, 2.2, 1.55, 14.4, () => {
    at(b, -0.15, 0, 0.15, () => teapot(b, 1.0));
    at(b, 0.45, 0, -0.30, () => cup(b, 0.9));
    at(b, -0.55, 0, -0.35, () => { saucer(b, 0.9); at(b, 0, 0.1, 0, () => cup(b, 0.9)); });
    at(b, 0.1, 0, 0.55, () => bookStack(b, 2, 0.6, [CL.cobalt, CL.porcWarm]));
  });
  item(); // 榻前矮几茶具
  at(b, -1.5, 0.06, 16.3, () => {
    b.push(m4.rotY(0.5));
    at(b, -0.62, 0.02, 0, () => { b.push(m4.rotZ(0.12)); box(b, 1.15, 0.06, 1.55, CL.porc, M.paper); b.pop(); });
    at(b, 0.62, 0.02, 0, () => { b.push(m4.rotZ(-0.12)); box(b, 1.15, 0.06, 1.55, CL.porc, M.paper); b.pop(); });
    at(b, 0, 0.04, 0, () => box(b, 0.16, 0.10, 1.55, CL.cobaltD, M.paper));
    b.pop();
  });
  item(); // 摊开的书
  at(b, 3.1, 1.66, 18.4, () => {
    b.push(m4.rotY(-0.18));
    at(b, 0, 0, 0, () => box(b, 1.5, 0.12, 1.9, mixc(CL.ice, CL.porc, 0.35), M.cloth, { topCol: mixc(CL.porc, CL.ice, 0.4) }));
    at(b, 0, 0.08, -0.5, () => box(b, 1.5, 0.06, 0.35, mixc(CL.cobalt, CL.azure, 0.4), M.cloth));
    at(b, 0, 0.08, 0.5, () => box(b, 1.5, 0.06, 0.35, mixc(CL.cobalt, CL.azure, 0.4), M.cloth));
    b.pop();
  });


  // ---- 窗边一组"迎向窗外"：两把扶手椅 + 茶桌 + 望远镜
  ry(b, 8.4, 0, 19.4, -0.30, () => armchair(b));
  ry(b, 13.4, 0, 21.6, 0.42, () => armchair(b));
  ry(b, 10.9, 0, 21.2, 0.1, () => roundTable(b, 1.35, 2.2));
  at(b, 10.9, 2.2, 21.2, () => {
    at(b, -0.2, 0, 0.1, () => teapot(b, 1.2));
    at(b, 0.5, 0, -0.4, () => cup(b, 1.05));
    at(b, -0.6, 0, -0.5, () => saucer(b, 1.05));
    at(b, 0.0, 0, 0.7, () => bowl(b, 0.4, 0.28, 10));
  });
  item(); // 窗边扶手椅 ×2
  item(); // 窗边茶桌与茶具
  at(b, -9.4, 0, 22.0, () => telescope(b));

  // ---- 窗台青花 + 蓝绣球
  const sillY = 1.5, sillZ = 25.1;
  at(b, -12.9, sillY, sillZ, () => vaseBaluster(b, 1.15));
  at(b, -10.1, sillY, sillZ, () => gingerJar(b, 1.3));
  at(b, 4.0, sillY, sillZ, () => vaseBaluster(b, 1.25));
  at(b, 7.0, sillY, sillZ, () => gingerJar(b, 1.2));
  at(b, 12.2, sillY, sillZ, () => vaseBaluster(b, 1.1));
  at(b, -5.4, sillY, sillZ, () => hydrangea(b, 1.2, true));
  at(b, 9.6, sillY, sillZ, () => hydrangea(b, 1.0, false));
  item(); // 窗台青花
  item(); // 蓝绣球
  // 窗两侧的落地大青花（剪影在巨行星前）
  for (const sx of [-1, 1]) {
    at(b, sx * 11.6, 0, 23.9, () => {
      lathe(b, [[0.92, 0], [1.0, 0.14], [0.86, 0.34], [0.92, 0.62]], 12, CL.marbleB, M.marbleB);
      at(b, 0, 0.62, 0, () => vaseBaluster(b, 1.5));
    });
  }
  item(); // 落地大青花 ×2

  // ---- 书桌 + 椅 + 左墙前蓝绣球
  at(b, -3.0, 0, 22.4, () => writingDesk(b));
  at(b, -3.0, 0, 20.4, () => deskChair(b));
  at(b, -17.1, 0, 8.3, () => hydrangea(b, 1.25, true));

  // ---- 窗帘 + 帘幔（窗内侧）
  for (const s of [-1, 1]) {
    ry(b, s * 14.4, 0, 24.6, 0, () => drape(b, 2.9, 16.8, 4, CL.porc, M.porc, 0.0));
    ry(b, s * 17.0, 0, 24.6, 0, () => drape(b, 2.2, 16.4, 3, mixc(CL.cobalt, CL.velvet, 0.35), M.velvet, -0.12));
  }
  at(b, 0, 15.9, 24.75, () => swag(b, 12.0, 0, 0, 1.55, CL.porc, M.porc));
  at(b, 0, 15.9, 24.75, () => {
    b.push(m4.translate([-11.0, 0, 0.06]));
    swag(b, 10.0, -0.15, 0, 1.3, CL.porc, M.porc);
    b.pop();
    b.push(m4.translate([11.0, 0, 0.06]));
    swag(b, 10.0, -0.15, 0, 1.3, CL.porc, M.porc);
    b.pop();
  });
  at(b, 0, 17.0, 24.3, () => box(b, 31.0, 0.16, 0.16, CL.gold, M.gold));
  item(); // 窗帘
  item(); // 帘幔

  // ---- 飘浮的书 / 茶 / 羽毛笔 / 蝴蝶
  floatSet(b);
  at(b, 13.0, 4.2, 24.2, () => { b.push(m4.rotX(0.4)); butterfly(b, 1.6, CL.azure, CL.cobaltD); b.pop(); });
  at(b, -11.6, 6.0, 23.4, () => { b.push(m4.rotY(0.7)); b.push(m4.rotX(-0.3)); butterfly(b, 1.5, CL.cobalt, CL.velvet); b.pop(); b.pop(); });
  at(b, 5.2, 5.0, 24.4, () => { b.push(m4.rotY(-0.5)); b.push(m4.rotZ(0.3)); butterfly(b, 1.4, CL.azure, CL.cobalt); b.pop(); b.pop(); });
  at(b, -6.4, 4.6, 24.0, () => { b.push(m4.rotX(-0.45)); butterfly(b, 1.5, CL.cobaltD, CL.azure); b.pop(); });
  item(); // 蝴蝶 ×6

  // ---- 水晶吊灯
  at(b, 0, H - 0.05, 11.0, () => chandelier(b));

  // ---- 灯光（世界坐标）+ 光斑 billboard
  const P = (x, y, z) => roomToWorld(R.cx, [x, y, z]);
  ctx.points.push({ p: P(0, 13.4, 11.0), col: mulc(mixc(C.warmGlow, C.sun, 0.55), 1.10), range: 40, int: 2.55 });
  ctx.points.push({ p: P(0, 9.6, 23.0), col: mulc(mixc(C.ice, C.glass, 0.5), 1.25), range: 44, int: 2.6 });
  ctx.points.push({ p: P(10.8, 7.2, 20.4), col: mulc(C.glass, 1.15), range: 24, int: 1.30 });
  ctx.points.push({ p: P(-17.4, 2.6, 11.8), col: mulc(C.ember, 1.1), range: 18, int: 1.60 });
  ctx.points.push({ p: P(-3.0, 4.8, 22.0), col: mulc(mixc(C.warmGlow, C.sun, 0.5), 1.1), range: 14, int: 1.20 });
  ctx.points.push({ p: P(0, 9.2, 3.2), col: mulc(mixc(C.warmGlow, C.sun, 0.5), 1.0), range: 22, int: 1.00 });

  const L = (x, y, z, size, col, alpha, shape) => ctx.lanterns.push({ p: P(x, y, z), size, rot: 0, alpha, shape, col });
  L(0, 13.2, 11.0, 4.2, mulc(C.warmGlow, 1.15), 0.40, 1);
  L(0, 12.0, 11.0, 2.8, mulc(C.warmGlow, 1.05), 0.28, 0);
  L(0, 9.4, 25.2, 6.4, mulc(C.glass, 1.15), 0.24, 0);
  L(-10.6, 8.4, 25.2, 5.0, mulc(C.glass, 1.05), 0.22, 0);
  L(10.6, 8.4, 25.2, 5.0, mulc(C.glass, 1.05), 0.22, 0);
  L(-18.4, 2.6, 11.8, 2.6, mulc(C.ember, 1.2), 0.38, 1);
  L(0, 16.5, 0.6, 2.2, mulc(C.warmGlow, 1.15), 0.24, 1);
  L(-7.6, 8.5, 0.7, 1.7, mulc(C.warmGlow, 1.15), 0.34, 1);
  L(7.6, 8.5, 0.7, 1.7, mulc(C.warmGlow, 1.15), 0.34, 1);
  L(-18.4, 8.3, 17.4, 1.6, mulc(C.warmGlow, 1.1), 0.28, 1);
  L(-18.4, 8.3, 6.0, 1.6, mulc(C.warmGlow, 1.1), 0.28, 1);
  L(-12.6, 8.4, 12.0, 1.0, mulc(C.warmGlow, 1.15), 0.30, 0);
  L(-10.0, 9.6, 14.2, 1.0, mulc(C.warmGlow, 1.15), 0.28, 0);
  L(-13.4, 6.8, 15.4, 1.0, mulc(C.warmGlow, 1.15), 0.26, 0);
  L(-9.4, 7.4, 11.6, 1.0, mulc(C.warmGlow, 1.15), 0.28, 0);
  L(-6.6, 6.8, 20.6, 1.1, mulc(C.cyanGlow, 1.0), 0.28, 0);
  L(4.6, 7.4, 21.4, 1.1, mulc(C.cyanGlow, 1.0), 0.28, 0);
  L(-1.8, 5.6, 19.8, 1.0, mulc(C.cyanGlow, 1.0), 0.26, 0);
  L(8.4, 2.9, 11.4, 1.2, mulc(C.cyanGlow, 1.0), 0.26, 0);

  ctx.props.roomStudy = { items: ITEMS, tris: b.i.length / 3 - tri0 };
}


// ============================================================ 壁炉（左墙 z 9.5–14.1）
function fireplace(b) {
  const dep = 0.42;
  at(b, -2.0, 5.6, dep / 2, () => box(b, 0.62, 11.2, dep, CL.porc, M.porc));
  at(b, 2.0, 5.6, dep / 2, () => box(b, 0.62, 11.2, dep, CL.porc, M.porc));
  at(b, 0, 7.0, dep / 2, () => box(b, 3.4, 8.4, dep, CL.porc, M.porc));
  at(b, 0, 1.25, -0.28, () => box(b, 3.0, 2.5, 0.5, mulc(CL.marbleB, 1.1), M.marbleB, { bottomCol: CL.marbleB }));
  const tileAt = (x, y, w, h, flip) => {
    at(b, x, y, dep + 0.02, () => {
      rect(b, -w / 2, -h / 2, w / 2, h / 2, 0, flip ? CL.porc : mixc(CL.porc, CL.cobalt, 0.10), M.glaz, ZP);
      rect(b, -w * 0.34, -h * 0.34, w * 0.34, h * 0.34, 0.006, CL.cobalt, M.cobalt, ZP);
      b.tri([-w * 0.10, -h * 0.30, 0.008], [w * 0.10, -h * 0.30, 0.008], [0, h * 0.32, 0.008], mixc(CL.porc, CL.cobalt, 0.2), M.glaz, ZP, ZP, ZP);
    });
  };
  for (let k = 0; k < 2; k++) {
    for (let j = 0; j < 7; j++) {
      tileAt(-2.16 + k * 0.33, 0.5 + j * 0.33, 0.30, 0.30, (k + j) % 2 === 0);
      tileAt(1.83 + k * 0.33, 0.5 + j * 0.33, 0.30, 0.30, (k + j) % 2 === 1);
    }
  }
  for (let k = 0; k < 10; k++) tileAt(-1.65 + k * 0.33, 2.68, 0.30, 0.30, k % 2 === 0);
  at(b, 0, 3.55, dep * 0.5 + 0.30, () => box(b, 4.9, 0.30, 1.0, CL.marbleW, M.marbleW, { topCol: mixc(CL.marbleW, CL.porc, 0.5) }));
  at(b, 0, 3.74, dep * 0.5 + 0.30, () => box(b, 4.8, 0.06, 0.9, CL.gold, M.gold));
  at(b, 0, 0.09, dep + 0.55, () => box(b, 4.9, 0.18, 1.4, CL.marbleB, M.marbleB, { topCol: CL.marbleG }));
  at(b, 0, 0.42, -0.12, () => {
    for (let k = 0; k < 3; k++) {
      const zz = -0.20 + k * 0.18;
      ry(b, 0.1 * k, 0.18 + k * 0.16, zz, -0.25 + k * 0.25, () => {
        cylinder(b, 7, 0.15, 0.13, 2.2, CL.woodDk, M.woodD, { y0: -1.1, caps: true });
      });
    }
    for (let k = 0; k < 3; k++) {
      at(b, -0.8 + k * 0.7, 0.30 + (k % 2) * 0.18, 0.1, () => {
        ellipsoid(b, 0.24, 0.52, 0.20, 7, 3, CL.flame, M.flame);
        ellipsoid(b, 0.13, 0.30, 0.12, 6, 3, CL.glow, M.flame);
      });
    }
    circleXZ(b, 1.30, 14, mixc(CL.flame, CL.ember, 0.4), M.flame, 0.02, YP);
  });
  at(b, 0, 0.18, dep + 1.05, () => {
    box(b, 4.2, 0.10, 0.12, CL.gold, M.gold);
    for (let k = 0; k < 9; k++) at(b, -1.8 + k * 0.45, 0.18, 0, () => box(b, 0.07, 0.5, 0.07, CL.gold, M.gold));
  });
  const mantelY = 3.70, mz = dep * 0.5 + 0.28;
  at(b, -1.75, mantelY, mz, () => gingerJar(b, 0.95));
  at(b, -0.85, mantelY, mz, () => vaseBaluster(b, 0.85));
  at(b, 0.0, mantelY, mz, () => { bowl(b, 0.55, 0.42, 12); at(b, 0, 0.42, 0, () => gingerJar(b, 0.55)); });
  at(b, 0.9, mantelY, mz, () => vaseBaluster(b, 0.95));
  at(b, 1.8, mantelY, mz, () => gingerJar(b, 0.9));
  at(b, 0, 7.2, dep + 0.10, () => landscapePainting(b, 4.2, 3.2));
  item(); item(); item(); item(); item();
}

// ============================================================ 室内苹果树 + 铜盆
function leafCluster(b, s, col) {
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU + 0.35;
    const tilt = -0.55 + (k % 3) * 0.45;
    at(b, Math.cos(a) * 0.18 * s, Math.sin(a * 1.7) * 0.14 * s, Math.sin(a) * 0.18 * s, () => {
      b.push(m4.rotY(a));
      b.push(m4.rotX(tilt));
      b.quad([-0.36 * s, 0, -0.22 * s], [0.36 * s, 0, -0.22 * s], [0.31 * s, 0, 0.24 * s], [-0.31 * s, 0, 0.24 * s], col, M.leaf, YP);
      b.quad([-0.31 * s, 0, 0.24 * s], [0.31 * s, 0, 0.24 * s], [0.36 * s, 0, -0.22 * s], [-0.36 * s, 0, -0.22 * s], mulc(col, 0.82), M.leaf, YN);
      b.pop();
      b.pop();
    });
  }
}
function blossom(b, s) {
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU;
    at(b, Math.cos(a) * 0.11 * s, Math.sin(a) * 0.11 * s, 0.03, () => {
      circleXY(b, 0.10 * s, 5, k % 2 ? CL.bloom : mixc(CL.bloom, CL.porc, 0.35), M.bloom, 0);
    });
  }
  circleXY(b, 0.05 * s, 5, CL.bloomD, M.bloom, 0.02);
}
function appleTree(b) {
  at(b, 0, 0, 0, () => {
    lathe(b, [[1.36, 0], [1.42, 0.10], [1.30, 0.30], [1.36, 0.70], [1.58, 1.05], [1.72, 1.20], [1.62, 1.26]],
      16, CL.brassIn, M.brassD, { colFn: (y) => (y > 0.95 ? mixc(CL.gold, CL.brassIn, 0.5) : CL.brassIn) });
    torus(b, 1.66, 0.075, 16, 3, CL.goldHi, M.gold, 'y');
    torus(b, 1.45, 0.055, 14, 3, CL.goldHi, M.gold, 'y');
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU;
      at(b, Math.cos(a) * 0.95, 0.0, Math.sin(a) * 0.95, () => box(b, 0.22, 0.42, 0.22, CL.goldD, M.goldD));
    }
    at(b, 0, 1.12, 0, () => { circleXZ(b, 1.55, 16, CL.soil, M.stone, 0, YP); });
  });
  const trunk = [[0, 1.10, 0], [0.10, 2.0, 0.05], [0.06, 3.0, 0.16], [0.22, 3.9, 0.10], [0.30, 4.7, 0.0]];
  tubePath(b, trunk, (t) => 0.62 * (1 - t) + 0.26 * t, 7, CL.bark, M.woodD);
  const br = [
    [-0.4, 0.5, 0.2], [2.9, 0.4, -0.6], [-2.5, 1.4, 0.9], [1.6, 1.5, 1.7],
    [-1.4, 2.4, -1.7], [3.2, 2.2, 0.9], [-3.1, 2.9, -0.4], [0.6, 3.3, 2.2],
    [0.2, 3.0, -2.4],
  ];
  for (let k = 0; k < br.length; k++) {
    const ex = br[k][0], ey = br[k][1], ez = br[k][2];
    const base = [trunk[3][0] + 0.05, trunk[3][1] + 0.15, trunk[3][2]];
    const p0 = [base[0], base[1] - 0.5 * (k % 3) * 0.3, base[2]];
    const p1 = [base[0] + ex * 0.35, base[1] + ey * 0.55, base[2] + ez * 0.35];
    const p2 = [base[0] + ex * 0.75, base[1] + ey * 0.9, base[2] + ez * 0.75];
    const p3 = [base[0] + ex * 0.55, base[1] + ey + 3.1 + (k % 3) * 0.6, base[2] + ez * 0.55];
    tubePath(b, [p0, p1, p2, p3], (t) => 0.24 * (1 - t) + 0.05 * t, 5, CL.bark, M.woodD, { caps: false });
    for (let j = 0; j < 10; j++) {
      const t = 0.32 + j * 0.072;
      const lx = p0[0] + (p3[0] - p0[0]) * t + rr(-0.35, 0.35);
      const ly = p0[1] + (p3[1] - p0[1]) * t + rr(-0.25, 0.35);
      const lz = p0[2] + (p3[2] - p0[2]) * t + rr(-0.35, 0.35);
      ry(b, lx, ly, lz, rr(0, TAU), () => leafCluster(b, rr(0.42, 0.70), pick([CL.leaf, CL.leafDk, CL.leafLt])));
    }
    for (let j = 0; j < 3; j++) {
      const t = 0.48 + j * 0.18;
      const ax = p0[0] + (p3[0] - p0[0]) * t + rr(-0.25, 0.25);
      const ay = p0[1] + (p3[1] - p0[1]) * t + rr(-0.2, 0.1);
      const az = p0[2] + (p3[2] - p0[2]) * t + rr(-0.25, 0.25);
      at(b, ax, ay, az, () => {
        sphere(b, rr(0.17, 0.24), CL.apple, M.apple, { rings: 3, seg: 8, jitter: 0.06, seed: k * 7 + j });
        at(b, 0, 0.20, 0, () => cylinder(b, 5, 0.03, 0.03, 0.16, CL.woodDk, M.woodD));
      });
    }
    if (k % 2 === 0) {
      for (let j = 0; j < 2; j++) {
        const t = 0.72 + j * 0.2;
        at(b, p0[0] + (p3[0] - p0[0]) * t + rr(-0.3, 0.3), p0[1] + (p3[1] - p0[1]) * t + 0.2,
          p0[2] + (p3[2] - p0[2]) * t + rr(-0.3, 0.3), () => blossom(b, rr(1.0, 1.6)));
      }
    }
  }
  for (let k = 0; k < 6; k++) {
    const a = rr(0, TAU), r = rr(1.9, 3.1);
    at(b, Math.cos(a) * r, 0.24, Math.sin(a) * r, () => {
      sphere(b, rr(0.22, 0.30), k % 3 === 0 ? CL.appleLt : CL.apple, M.apple, { rings: 2, seg: 6, jitter: 0.08, seed: 30 + k });
    });
  }
  item(); item(); item();
}

// ============================================================ 书柜 / 书 / 老座钟 / 瓷柜
const BOOKCOLS = [
  mixc(CL.cobaltD, CL.velvet, 0.3), CL.cobalt, CL.azure, mixc(CL.porc, CL.ice, 0.55),
  CL.red, mixc(CL.leafDk, CL.azure, 0.45), CL.porcWarm, mixc(CL.cobalt, CL.black, 0.35),
];
function bookRun(b, x0, x1, y, zc, hMin, hMax, dep) {
  let x = x0;
  while (x < x1 - 0.14) {
    const w = rr(0.20, 0.38);
    if (x + w > x1) break;
    const h = rr(hMin, hMax);
    const col = pick(BOOKCOLS);
    const band = rng() < 0.20;
    const bc = pick([CL.gold, CL.porc, CL.cobaltD]);
    at(b, x + w / 2, y + h / 2, zc, () => {
      box(b, w, h, dep, col, M.paper, { topCol: mixc(col, CL.porc, 0.35) });
      if (band) at(b, 0, h * 0.30, dep / 2 + 0.006, () => box(b, w * 0.82, 0.075, 0.012, bc, M.gold));
    });
    x += w + rr(0.010, 0.035);
  }
}
function bookStack(b, n, s, cols) {
  for (let k = 0; k < n; k++) {
    const w = rr(1.5, 2.0) * s, d = rr(1.1, 1.4) * s, h = 0.20 * s;
    ry(b, 0, 0, 0, rr(-0.12, 0.12), () => {
      at(b, 0, 0.10 * s + k * h, 0, () => box(b, w, h, d, cols[k % cols.length], M.paper, { topCol: CL.porc }));
    });
  }
}
function bookcase(b, w) {
  const dep = 0.66, baseH = 1.55, topShelfY = 9.9;
  at(b, 0, 0.30, dep / 2, () => box(b, w + 0.16, 0.60, dep + 0.12, CL.porcWarm, M.porc, { topCol: CL.porc }));
  at(b, 0, (0.60 + baseH) / 2, dep / 2, () => box(b, w, baseH - 0.60, dep, CL.porc, M.porc));
  for (const sx of [-1, 1]) {
    at(b, sx * w * 0.24, (0.60 + baseH) / 2, dep + 0.02, () => { frameRect(b, w * 0.42, baseH - 0.85, 0.10, 0.10, CL.porcS, M.porcS); });
    at(b, sx * w * 0.06, (0.60 + baseH) / 2, dep + 0.06, () => { torus(b, 0.09, 0.03, 8, 3, CL.gold, M.gold, 'z'); });
  }
  at(b, -w / 2 + 0.10, (baseH + topShelfY) / 2, dep / 2, () => box(b, 0.20, topShelfY - baseH, dep, CL.porc, M.porc));
  at(b, w / 2 - 0.10, (baseH + topShelfY) / 2, dep / 2, () => box(b, 0.20, topShelfY - baseH, dep, CL.porc, M.porc));
  at(b, 0, (baseH + topShelfY) / 2, 0.05, () => box(b, w, topShelfY - baseH, 0.10, mixc(CL.porc, CL.ice, 0.35), M.porcS));
  at(b, 0, topShelfY + 0.04, dep / 2, () => box(b, w + 0.10, 0.14, dep, CL.porc, M.porc, { bottomCol: CL.porcS }));
  const sh = [1.55, 3.10, 4.65, 6.20, 7.75, 9.30];
  for (let k = 0; k < sh.length; k++) {
    at(b, 0, sh[k], dep / 2, () => box(b, w - 0.20, 0.12, dep - 0.06, CL.porcWarm, M.porcS, { topCol: CL.porc }));
    if (k < sh.length - 1) {
      const y0 = sh[k] + 0.06;
      const hMax = Math.min(1.05, sh[k + 1] - sh[k] - 0.25);
      bookRun(b, -w / 2 + 0.24, w / 2 - 0.24, y0, dep / 2 + 0.02, hMax * 0.62, hMax, 0.42);
      if (k % 2 === 1) at(b, w * 0.30, y0 + 0.10, dep / 2 + 0.02, () => bookStack(b, 2, 0.55, [CL.cobalt, CL.porcWarm, CL.azure]));
      if (k === 2) at(b, -w * 0.32, y0 + 0.02, dep / 2, () => gingerJar(b, 0.62));
      if (k === 4) at(b, w * 0.32, y0 + 0.02, dep / 2, () => vaseBaluster(b, 0.55));
    }
  }
  at(b, 0, topShelfY + 0.22, dep / 2 + 0.04, () => box(b, w + 0.24, 0.26, dep + 0.14, CL.porc, M.porc, { topCol: CL.gold }));
  at(b, -w * 0.32, topShelfY + 0.35, dep / 2, () => gingerJar(b, 1.30));
  at(b, -w * 0.12, topShelfY + 0.35, dep / 2, () => vaseBaluster(b, 1.15));
  at(b, w * 0.12, topShelfY + 0.35, dep / 2, () => bowl(b, 0.62, 0.42, 12));
  at(b, w * 0.34, topShelfY + 0.35, dep / 2, () => gingerJar(b, 1.15));
  item(); item();
}
function grandfatherClock(b) {
  at(b, 0, 0.25, 0.34, () => box(b, 1.55, 0.50, 0.68, CL.porcWarm, M.porc, { topCol: CL.porc }));
  at(b, 0, 3.1, 0.30, () => box(b, 1.30, 5.1, 0.60, CL.porc, M.porc));
  at(b, 0, 2.4, 0.62, () => {
    rect(b, -0.42, -1.55, 0.42, 1.55, 0, mixc(CL.cobaltD, CL.marbleB, 0.4), [0.10, 0.92], ZP);
    frameRect(b, 0.96, 3.20, 0.08, 0.08, CL.gold, M.gold);
    bar3(b, [0, -1.30, 0.10], [0, 0.75, 0.10], 0.07, 0.07, CL.goldHi, M.gold, [1, 0, 0]);
    at(b, 0, -1.20, 0.10, () => { circleXY(b, 0.34, 14, CL.goldHi, M.gold, 0.03); circleXY(b, 0.20, 12, CL.gold, M.gold, 0.05); });
  });
  at(b, 0, 6.35, 0.30, () => box(b, 1.62, 1.90, 0.72, CL.porcWarm, M.porc, { topCol: CL.porc }));
  at(b, 0, 6.35, 0.68, () => {
    torus(b, 0.68, 0.10, 20, 4, CL.gold, M.gold, 'z');
    circleXY(b, 0.60, 20, CL.porc, M.glaz, 0.03);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU;
      at(b, Math.cos(a) * 0.48, Math.sin(a) * 0.48, 0.05, () => box(b, 0.07, 0.16, 0.02, CL.cobaltD, M.cobalt));
    }
    bar3(b, [0, 0, 0.09], [0.34, 0.22, 0.09], 0.055, 0.03, mixc(CL.cobaltD, CL.black, 0.3), M.cobalt, [0, 0, 1]);
    bar3(b, [0, 0, 0.10], [-0.10, 0.44, 0.10], 0.05, 0.03, mixc(CL.cobaltD, CL.black, 0.3), M.cobalt, [0, 0, 1]);
    circleXY(b, 0.06, 8, CL.gold, M.gold, 0.12);
  });
  at(b, 0, 7.45, 0.30, () => box(b, 1.80, 0.35, 0.86, CL.porc, M.porc, { topCol: CL.gold }));
  for (const sx of [-1, 1]) {
    at(b, sx * 0.62, 7.95, 0.30, () => lathe(b, [[0.20, 0], [0.13, 0.22], [0.06, 0.44]], 8, CL.gold, M.gold));
  }
  item();
}
function displayCabinet(b, w) {
  const dep = 0.62;
  at(b, 0, 0.35, dep / 2, () => box(b, w + 0.18, 0.70, dep + 0.16, CL.porcWarm, M.porc));
  at(b, 0, 3.4, dep / 2, () => box(b, w, 6.6, dep, CL.porc, M.porc));
  at(b, 0, 3.4, 0.06, () => rect(b, -w / 2 + 0.1, 0.6, w / 2 - 0.1, 6.7, 0.02, mixc(CL.ice, CL.porc, 0.25), [0.16, 0.5], ZP));
  for (const yy of [1.5, 3.4, 5.3]) {
    at(b, 0, yy, dep / 2 - 0.02, () => box(b, w - 0.1, 0.14, dep - 0.10, CL.porcWarm, M.porcS, { topCol: CL.porc }));
  }
  for (let k = 0; k < 3; k++) {
    const yy = 2.4 + k * 1.9;
    at(b, 0, yy, dep + 0.02, () => {
      at(b, -w * 0.28, 0, 0, () => box(b, 0.14, 1.7, 0.10, CL.gold, M.gold));
      at(b, w * 0.28, 0, 0, () => box(b, 0.14, 1.7, 0.10, CL.gold, M.gold));
    });
  }
  const bays = [
    [1.5, [[-1.0, 0.95], [-0.1, 0.75], [0.85, 1.05]]],
    [3.4, [[-1.1, 0.70], [-0.2, 1.00], [0.8, 0.80]]],
    [5.3, [[-0.9, 1.05], [0.15, 0.85], [1.0, 0.70]]],
  ];
  for (const bay of bays) {
    const yy = bay[0], list = bay[1];
    for (let k = 0; k < list.length; k++) {
      const x = list[k][0], s = list[k][1];
      at(b, x, yy + 0.07, dep / 2 + 0.02, () => {
        if (k % 2 === 0) vaseBaluster(b, s); else gingerJar(b, s);
      });
    }
  }
  at(b, 0, 6.85, dep / 2 + 0.02, () => box(b, w + 0.24, 0.28, dep + 0.12, CL.porc, M.porc, { topCol: CL.gold }));
  at(b, -w * 0.22, 7.15, dep / 2, () => vaseBaluster(b, 0.8));
  at(b, w * 0.2, 7.15, dep / 2, () => gingerJar(b, 0.9));
  item(); item();
}

// 世界摆放（world.js 调这个）
export function buildStudyRoom(b, ctx) {
  b.push(roomFrame(R.cx));
  buildStudyAssets(b, ctx);
  b.pop();
}

