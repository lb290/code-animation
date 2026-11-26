// room-painter.js — ROUND 16 · 「彩窗画室」( THE PAINTER'S LOFT ) 的室内内容模块。
//
// 只负责这一间房的**局部坐标**内容；外壳（墙/门洞/大窗/地台/顶板/线脚）由
// room-shell.js 提供，世界摆放由 world.js 用 roomFrame() 完成。
// 局部坐标：x ∈ [-W/2, W/2] = ±20，y ∈ [0, 18]，z ∈ [0, 26]
//   z = 0 房门墙（桥），z = 26 大窗墙（外面是巨行星）
//
// 美术方向（参考 111530188_p0.jpg）：青绿木作 + 珊瑚粉墙 + 奶白；彩绘玻璃（鱼形纹样）；
// 红罩吊灯；吊篮绿植；鱼缸与鱼；字母书架（A、B…）+ 地球仪；画架 + 未完成的鲸鱼画；
// 桌面（铅笔、剪刀、糖罐、玩具相机）；一堆抱枕的床 + 黑猫；鱼形抱枕；拖鞋；
// 门墙上的星星贴纸；彩色马赛克地面；纸灯笼。
//
// 尺度：房间 40×26×18 m 是"巨厅"尺度（大窗 30 m 宽），所以陈设按约 2.6~3× 人用尺度做，
// 这样从 y≈7 的机位看进去才读得出"家具"而不是"玩具"。
import { box, cylinder, lathe, sphere, bar3, torus, disc, ellipsoid, tubePath, extrudeXY,
         mulc, mixc, rgb, m4, TAU, mulberry32, catenary } from './engine.js';
import { C } from './palette.js';
import { roomEntry, roomFrame, roomToWorld } from './interiors-plan.js';
import { buildRoomShell } from './room-shell.js';

const R = roomEntry('painter');
const W = R.W, D = R.D, H = R.H;
let rnd = mulberry32(R.seed);
const rr = (a, b) => a + rnd() * (b - a);
const ri = (a, b) => Math.floor(a + rnd() * (b - a + 1));
const pickc = (arr) => arr[Math.min(arr.length - 1, Math.floor(rnd() * arr.length))];

// ---------------------------------------------------------------- 调色板（线性 rgb）
const K = {
  wall: rgb('#d99a84'),      // 珊瑚粉墙
  wallDk: rgb('#b9785f'),
  teal: rgb('#3a7c6e'),      // 青绿木作
  tealLt: rgb('#5aa08b'),
  tealDk: rgb('#204d47'),
  cream: rgb('#ecdfc0'),
  creamDk: rgb('#d9c8a4'),
  coral: rgb('#e28a72'),
  coralDk: rgb('#b35a44'),
  coralLt: rgb('#f4b7a2'),
  pink: rgb('#efadb8'),
  pinkLt: rgb('#f7ccd2'),
  gold: rgb('#c99a4a'),
  goldHi: rgb('#f6dea4'),
  mint: rgb('#93d1b6'),
  glassB: rgb('#a9dcee'),
  glassD: rgb('#4f8fb4'),
  violet: rgb('#8f74b8'),
  red: rgb('#c9453a'),
  redDk: rgb('#8b2f27'),
  wood: rgb('#a0704a'),
  woodDk: rgb('#6b4830'),
  black: rgb('#242830'),
  catFur: rgb('#2b2d36'),
  paper: rgb('#f2e7ce'),
  water: rgb('#8fd0dc'),
  leaf: rgb('#4a8f62'),
  leafLt: rgb('#7cc48f'),
  leafDk: rgb('#2a5740'),
  soil: rgb('#3a2f26'),
  porcelain: rgb('#dbecee'),
  blue: rgb('#3a6cab'),
  orange: rgb('#e8a24a'),
  night: rgb('#2b3a63'),
  ruby: rgb('#a83448'),
  cobalt: rgb('#2d4f96'),
  emerald: rgb('#1f6f52'),
  amber: rgb('#c98a2e'),
  plum: rgb('#5e3f7e'),
  seaLt: rgb('#2e8272'),
};

// 材质 = [emissive, gloss]；结构 0.03~0.16，发光件 0.4~0.9
const M = {
  wall: [0.10, 0.20], wallDk: [0.09, 0.18],
  wood: [0.065, 0.30], woodDk: [0.06, 0.26],
  teal: [0.058, 0.28], tealDk: [0.052, 0.22],
  cream: [0.085, 0.18], trim: [0.08, 0.30],
  cloth: [0.085, 0.06], wool: [0.09, 0.05],
  gloss: [0.11, 0.66], ceramic: [0.13, 0.70],
  glass: [0.10, 0.92], water: [0.11, 0.86],
  glow: [0.44, 0.30], glowHi: [0.62, 0.20], glowSoft: [0.28, 0.26],
  metal: [0.05, 0.74], gold: [0.06, 0.56], brassDark: [0.055, 0.60],
  leaf: [0.048, 0.12], leafSoft: [0.06, 0.10],
  paper: [0.115, 0.09], paint: [0.12, 0.24],
  cat: [0.035, 0.13], dark: [0.045, 0.20], mirror: [0.18, 0.95],
  stone: [0.055, 0.16], tile: [0.05, 0.20],
};

let ITEMS = 0;
const item = () => { ITEMS++; };

// ---------------------------------------------------------------- 小工具
const T3 = (x, y, z) => m4.translate([x, y, z]);
function at(b, x, y, z, fn) { b.push(T3(x, y, z)); fn(); b.pop(); }
function atY(b, x, y, z, ry, fn) { b.push(m4.mul(T3(x, y, z), m4.rotY(ry))); fn(); b.pop(); }
function atX(b, x, y, z, rx, fn) { b.push(m4.mul(T3(x, y, z), m4.rotX(rx))); fn(); b.pop(); }
function atZ(b, x, y, z, rz, fn) { b.push(m4.mul(T3(x, y, z), m4.rotZ(rz))); fn(); b.pop(); }
function BX(b, x, y, z, sx, sy, sz, col, mat, opts) { at(b, x, y, z, () => box(b, sx, sy, sz, col, mat, opts)); }
function CY(b, x, y, z, seg, rb, rt, h, col, mat, opts) { at(b, x, y, z, () => cylinder(b, seg, rb, rt, h, col, mat, opts || {})); }
function SP(b, x, y, z, r, col, mat, opts) { at(b, x, y, z, () => sphere(b, r, col, mat, opts || {})); }
function LT(b, x, y, z, prof, seg, col, mat, opts) { at(b, x, y, z, () => lathe(b, prof, seg, col, mat, opts || {})); }
function TR(b, x, y, z, Rr, r2, sR, sT, col, mat, axis) { at(b, x, y, z, () => torus(b, Rr, r2, sR, sT, col, mat, axis || 'y')); }
function DS(b, x, y, z, r, seg, col, mat, opts) { at(b, x, y, z, () => disc(b, r, seg, col, mat, opts || {})); }
function EL(b, x, y, z, rx, ry, rz, su, sv, col, mat, opts) { at(b, x, y, z, () => ellipsoid(b, rx, ry, rz, su, sv, col, mat, opts || {})); }
function TUB(b, pts, r, seg, col, mat, opts) { tubePath(b, pts, r, seg, col, mat, opts || {}); }
function BAR(b, p0, p1, w, h, col, mat, up) { bar3(b, p0, p1, w, h, col, mat, up); }
function QXZ(b, x0, x1, z0, z1, y, col, mat) { b.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], col, mat, [0, 1, 0]); }
function QXY(b, x0, x1, y0, y1, z, col, mat, nz) { b.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], col, mat, [0, 0, nz]); }
function QYZ(b, y0, y1, z0, z1, x, col, mat, nx) { b.quad([x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0], col, mat, [nx, 0, 0]); }
function DISCXY(b, cx, cy, z, r, seg, col, mat, nz) {
  const N = [0, 0, nz];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    b.tri([cx, cy, z], [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, z],
      [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, z], col, mat, N, N, N);
  }
}
function RINGXY(b, cx, cy, z, rx, ry, w, seg, col, mat, nz) {
  const N = [0, 0, nz];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    const ox0 = Math.cos(a0) * rx, oy0 = Math.sin(a0) * ry;
    const ox1 = Math.cos(a1) * rx, oy1 = Math.sin(a1) * ry;
    const ix0 = Math.cos(a0) * (rx - w), iy0 = Math.sin(a0) * (ry - w);
    const ix1 = Math.cos(a1) * (rx - w), iy1 = Math.sin(a1) * (ry - w);
    b.quad([cx + ix0, cy + iy0, z], [cx + ox0, cy + oy0, z], [cx + ox1, cy + oy1, z], [cx + ix1, cy + iy1, z], col, mat, N);
  }
}
function RINGYZ(b, x, cy, cz, ry, rz, w, seg, col, mat, nx) {
  const N = [nx, 0, 0];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    const oy0 = Math.sin(a0) * ry, oz0 = Math.cos(a0) * rz;
    const oy1 = Math.sin(a1) * ry, oz1 = Math.cos(a1) * rz;
    const iy0 = Math.sin(a0) * (ry - w), iz0 = Math.cos(a0) * (rz - w);
    const iy1 = Math.sin(a1) * (ry - w), iz1 = Math.cos(a1) * (rz - w);
    b.quad([x, cy + iy0, cz + iz0], [x, cy + oy0, cz + oz0], [x, cy + oy1, cz + oz1], [x, cy + iy1, cz + iz1], col, mat, N);
  }
}
function DISCYZ(b, x, cy, cz, r, seg, col, mat, nx) {
  const N = [nx, 0, 0];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    b.tri([x, cy, cz], [x, cy + Math.sin(a0) * r, cz + Math.cos(a0) * r],
      [x, cy + Math.sin(a1) * r, cz + Math.cos(a1) * r], col, mat, N, N, N);
  }
}
function STARXY(b, cx, cy, z, rOut, rIn, pts, col, mat, nz) {
  const N = [0, 0, nz];
  for (let i = 0; i < pts * 2; i++) {
    const a0 = (i / (pts * 2)) * TAU - Math.PI / 2;
    const a1 = ((i + 1) / (pts * 2)) * TAU - Math.PI / 2;
    const r0 = i % 2 === 0 ? rOut : rIn, r1 = i % 2 === 0 ? rIn : rOut;
    b.tri([cx, cy, z], [cx + Math.cos(a0) * r0, cy + Math.sin(a0) * r0, z],
      [cx + Math.cos(a1) * r1, cy + Math.sin(a1) * r1, z], col, mat, N, N, N);
  }
}
// 墙面上的鱼（贴在 XY 平面，朝 ±Z）：椭球身体 + 三角尾 + 眼睛
function fishXY(b, x, y, z, len, hgt, col, mat, nz) {
  const body = [0, 0, z];
  b.push(m4.mul(T3(x, y, z), m4.scale([len / 2, hgt / 2, 1])));
  EL(b, 0, 0, 0, 1, 1, 0.16, 8, 4, col, mat);
  b.pop();
  const N = [0, 0, nz];
  const zz = z;
  b.tri([x - len * 0.5, y, zz], [x - len * 0.95, y + hgt * 0.55, zz], [x - len * 0.95, y - hgt * 0.55, zz], mulc(col, 0.92), mat, N, N, N);
  void body;
}
function STARXZ(b, cx, y, cz, rOut, rIn, pts, col, mat) {
  const N = [0, 1, 0];
  for (let i = 0; i < pts * 2; i++) {
    const a0 = (i / (pts * 2)) * TAU - Math.PI / 2;
    const a1 = ((i + 1) / (pts * 2)) * TAU - Math.PI / 2;
    const r0 = i % 2 === 0 ? rOut : rIn, r1 = i % 2 === 0 ? rIn : rOut;
    b.tri([cx, y, cz], [cx + Math.cos(a0) * r0, y, cz + Math.sin(a0) * r0],
      [cx + Math.cos(a1) * r1, y, cz + Math.sin(a1) * r1], col, mat, N, N, N);
  }
}
// 地面上的鱼（躺在 XZ 平面）
function fishXZ(b, x, y, z, len, wid, col, mat) {
  b.push(m4.mul(T3(x, y, z), m4.scale([1, 1, 1])));
  EL(b, 0, 0, 0, len / 2, wid / 2, wid / 2 * 0.9, 8, 4, col, mat);
  b.pop();
}

// ============================================================ 地面：彩马赛克 + 中央徽章
function buildFloor(b) {
  item(); // 01 马赛克地面
  const y = 0.014, TW = 38 / 19, TD = 26 / 13;
  const teals = [rgb('#2f6a5c'), rgb('#38796a'), rgb('#28594e'), rgb('#3d8270'), rgb('#24534a')];
  const accents = [K.coral, mulc(K.coral, 0.82), K.gold, K.orange, K.pink, K.creamDk, K.mint, K.ruby];
  for (let i = 0; i < 19; i++) {
    for (let j = 0; j < 13; j++) {
      const x0 = -19 + i * TW, z0 = j * TD;
      let col = teals[Math.floor(rnd() * teals.length)];
      if (rnd() < 0.17) col = accents[Math.floor(rnd() * accents.length)];
      QXZ(b, x0 + 0.035, x0 + TW - 0.035, z0 + 0.035, z0 + TD - 0.035, y, col, M.tile);
    }
  }
  // 深青勾缝
  for (let i = 1; i < 19; i++) { const x = -19 + i * TW; QXZ(b, x - 0.02, x + 0.02, 0.03, 25.97, y + 0.002, K.tealDk, M.stone); }
  for (let j = 1; j < 13; j++) { const z = j * TD; QXZ(b, -18.97, 18.97, z - 0.02, z + 0.02, y + 0.002, K.tealDk, M.stone); }
  // 沿墙压边：深青 + 金线
  for (const zz of [[0.0, 1.05], [24.95, 26.0]]) {
    QXZ(b, -19.05, 19.05, zz[0], zz[1], y + 0.007, K.tealDk, M.stone);
    QXZ(b, -19.05, 19.05, zz[0] + 0.3, zz[1] - 0.3, y + 0.011, mulc(K.tealDk, 1.25), M.stone);
    QXZ(b, -19.05, 19.05, zz[0] + 0.52, zz[1] - 0.52, y + 0.009, K.gold, M.stone);
  }
  for (const xx of [[-19.05, -18.0], [18.0, 19.05]]) {
    QXZ(b, xx[0], xx[1], 0.0, 26.0, y + 0.007, K.tealDk, M.stone);
    QXZ(b, xx[0] + 0.3, xx[1] - 0.3, 0.0, 26.0, y + 0.011, mulc(K.tealDk, 1.25), M.stone);
    QXZ(b, xx[0] + 0.52, xx[1] - 0.52, 0.0, 26.0, y + 0.009, K.gold, M.stone);
  }

  item(); // 02 中央星盘徽章（马赛克镶嵌）
  const cy = y + 0.012, cxz = 13.0;
  const FLOORM = [0.03, 0.18];
  DS(b, 0, cy, cxz, 5.6, 44, mixc(K.coralLt, K.teal, 0.35), FLOORM);
  DS(b, 0, cy + 0.002, cxz, 5.6, 44, K.coralDk, FLOORM, { inner: 5.25 });
  DS(b, 0, cy + 0.004, cxz, 5.0, 42, mixc(K.coral, K.coralDk, 0.42), FLOORM);
  DS(b, 0, cy + 0.006, cxz, 5.0, 42, mixc(K.gold, K.coralDk, 0.35), FLOORM, { inner: 4.7 });
  DS(b, 0, cy + 0.008, cxz, 3.1, 36, mixc(K.teal, K.tealDk, 0.25), FLOORM);
  DS(b, 0, cy + 0.010, cxz, 3.1, 36, mixc(K.gold, K.teal, 0.3), FLOORM, { inner: 2.82 });
  DS(b, 0, cy + 0.012, cxz, 2.5, 32, mixc(K.teal, K.tealDk, 0.45), FLOORM);
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * TAU - Math.PI / 2, a1 = ((i + 0.5) / 8) * TAU - Math.PI / 2, a2 = ((i + 1) / 8) * TAU - Math.PI / 2;
    const R0 = 2.3, RI = 0.95, yy = cy + 0.014;
    b.tri([0, yy, cxz], [Math.cos(a0) * R0, yy, cxz + Math.sin(a0) * R0], [Math.cos(a1) * RI, yy, cxz + Math.sin(a1) * RI], mixc(K.gold, K.coral, 0.3), FLOORM, [0, 1, 0], [0, 1, 0], [0, 1, 0]);
    b.tri([0, yy, cxz], [Math.cos(a1) * RI, yy, cxz + Math.sin(a1) * RI], [Math.cos(a2) * R0, yy, cxz + Math.sin(a2) * R0], mixc(K.gold, K.coral, 0.3), FLOORM, [0, 1, 0], [0, 1, 0], [0, 1, 0]);
  }
  DS(b, 0, cy + 0.016, cxz, 0.52, 16, K.ruby, FLOORM);
  // 徽章外圈 4 条小鱼
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    atY(b, Math.cos(a) * 4.3, cy + 0.018, cxz + Math.sin(a) * 4.3, -a + Math.PI / 2, () => {
      EL(b, 0, 0.05, 0, 0.8, 0.11, 0.3, 8, 4, i % 2 ? K.mint : K.goldHi, M.tile);
      b.tri([-0.7, 0, 0], [-1.25, 0.4, 0], [-1.25, -0.4, 0], i % 2 ? K.teal : K.amber, M.tile, [0, 1, 0], [0, 1, 0], [0, 1, 0]);
    });
  }

  item(); // 03 画架旁的圆形编织地垫
  DS(b, -3.6, y + 0.02, 17.6, 2.9, 28, mixc(K.coral, K.cream, 0.26), M.wool);
  DS(b, -3.6, y + 0.024, 17.6, 2.9, 28, mixc(K.cream, K.gold, 0.30), M.wool, { inner: 2.35 });
  DS(b, -3.6, y + 0.028, 17.6, 1.5, 24, mixc(K.coralDk, K.coral, 0.3), M.wool);
  DS(b, -3.6, y + 0.032, 17.6, 0.6, 18, mixc(K.cream, K.gold, 0.2), M.wool);
}
// ============================================================ 窗下：带一堆抱枕的矮床 + 黑猫
function buildWindowBed(b) {
  const x0 = -14.2, x1 = 1.4, cx = (x0 + x1) / 2, zw0 = 21.0, zw1 = 24.6, cz = (zw0 + zw1) / 2;
  item(); // 04 窗下矮床台
  BX(b, cx, 0.5, cz, x1 - x0, 1.0, zw1 - zw0, K.teal, M.teal, { topCol: mulc(K.teal, 1.12) });
  BX(b, cx, 0.34, zw0 - 0.06, x1 - x0 + 0.2, 0.16, 0.14, K.gold, M.gold);
  for (const sx of [x0, x1]) BX(b, sx, 0.55, cz, 0.18, 0.9, zw1 - zw0, K.tealDk, M.tealDk);
  // 台面下的格子柜（画册 / 颜料罐）
  for (let i = 0; i < 4; i++) {
    BX(b, x0 + 2.0 + i * 3.4, 0.46, zw0 + 0.08, 2.9, 0.72, 0.12, mixc(K.tealDk, K.teal, 0.3), M.tealDk);
    BX(b, x0 + 2.0 + i * 3.4, 0.46, zw0 + 0.1, 2.7, 0.6, 0.06, K.wood, M.woodDk);
  }
  item(); // 05 床垫
  BX(b, cx, 1.36, cz, x1 - x0 - 0.5, 0.72, zw1 - zw0 - 0.45, mixc(K.coralLt, K.pink, 0.42), M.cloth, { topCol: K.pinkLt });
  for (let i = 0; i < 5; i++) {
    const xx = x0 + 1.4 + i * 2.6;
    QXZ(b, xx - 0.03, xx + 0.03, zw0 + 0.5, zw1 - 0.4, 1.73, mulc(K.pink, 0.86), M.cloth);
  }
  item(); // 06 靠窗三个大靠垫
  const backs = [[-11.4, K.pink, 0.18], [-6.4, K.coral, 0.1], [-1.4, K.gold, -0.12]];
  for (const [bx, bc, tilt] of backs) {
    atZ(b, bx, 2.5, 24.0, tilt * 0.5, () => atX(b, 0, 0, 0, -0.16, () => BX(b, 0, 0, 0, 4.2, 1.95, 0.72, bc, M.cloth, { topCol: mulc(bc, 1.06) })));
    atX(b, bx, 2.55, 23.6, -0.16, () => {
      EL(b, 0, 0, 0, 0.8, 0.32, 0.12, 8, 4, K.teal, M.cloth);
      b.tri([-0.78, 0, 0], [-1.3, 0.4, 0], [-1.3, -0.4, 0], mulc(K.teal, 0.88), M.cloth, [0, 0, -1], [0, 0, -1], [0, 0, -1]);
      SP(b, 0.55, 0.08, 0.14, 0.07, K.cream, M.cloth, { rings: 2, seg: 4 });
    });
  }
  item(); // 07 一排小抱枕
  const pil = [[-12.4, K.cream], [-9.4, K.coralDk], [-4.3, K.mint], [0.2, K.plum]];
  for (const [px, pc] of pil) {
    atY(b, px, 2.05, 22.75, rr(-0.24, 0.24), () => BX(b, 0, 0, 0, 1.45, 1.05, 0.5, pc, M.cloth, { topCol: mulc(pc, 1.07) }));
  }
  item(); // 08 立起来的大鱼抱枕
  atY(b, -2.1, 2.62, 23.85, 0.12, () => {
    EL(b, 0, 0, 0, 1.35, 1.0, 0.22, 10, 5, K.coral, M.cloth);
    EL(b, 0.15, -0.05, 0.3, 1.0, 0.55, 0.12, 8, 4, K.coralLt, M.cloth);
    b.tri([-1.25, 0, 0], [-2.15, 0.62, 0], [-2.15, -0.62, 0], mulc(K.coral, 0.88), M.cloth, [0, 0, -1], [0, 0, -1], [0, 0, -1]);
    SP(b, 0.82, 0.2, 0.25, 0.14, K.cream, M.cloth, { rings: 2, seg: 5 });
    SP(b, 0.82, 0.2, 0.34, 0.07, K.black, M.cloth, { rings: 2, seg: 4 });
    for (let i = 0; i < 3; i++) SP(b, -0.2 + i * 0.4, 0.45 - i * 0.1, 0.18, 0.12, K.goldHi, M.cloth, { rings: 2, seg: 4 });
  });
  item(); // 09 叠好的被子
  for (let k = 0; k < 3; k++) {
    BX(b, -13.0, 1.82 + k * 0.24, 22.4, 2.0, 0.22, 2.4, k % 2 ? mixc(K.mint, K.teal, 0.2) : mixc(K.cream, K.teal, 0.18), M.wool);
  }
  BX(b, -13.0, 2.56, 22.4, 2.2, 0.16, 2.6, mixc(K.coral, K.cream, 0.25), M.wool);
  item(); // 10 垂在床沿的毯子
  BX(b, -7.6, 1.5, 21.12, 5.2, 0.14, 1.3, mixc(K.coral, K.ruby, 0.28), M.wool, { topCol: K.pinkLt });
  BX(b, -7.6, 0.95, 21.02, 5.2, 0.14, 0.7, mixc(K.coral, K.ruby, 0.28), M.wool);
  for (let i = 0; i < 8; i++) BX(b, -9.9 + i * 0.68, 0.82, 20.95, 0.08, 0.28, 0.08, K.cream, M.wool);

  item(); // 11 黑猫（睡在床角）
  atY(b, -10.3, 2.05, 23.15, 0.5, () => {
    EL(b, 0, 0, 0, 1.45, 0.52, 0.92, 10, 5, K.catFur, M.cat);
    EL(b, 0.4, 0.18, 0, 1.0, 0.34, 0.68, 8, 4, mulc(K.catFur, 0.9), M.cat);
    SP(b, 1.25, 0.28, 0.15, 0.58, K.catFur, M.cat, { rings: 4, seg: 7, jitter: 0.05 });
    atZ(b, 1.05, 0.82, 0.05, -0.32, () => CY(b, 0, 0, 0, 5, 0.24, 0.02, 0.42, K.catFur, M.cat, { y0: 0 }));
    atZ(b, 1.52, 0.8, 0.1, 0.3, () => CY(b, 0, 0, 0, 5, 0.22, 0.02, 0.4, K.catFur, M.cat, { y0: 0 }));
    SP(b, 1.5, 0.08, 0.22, 0.22, mixc(K.cream, K.catFur, 0.55), M.cat, { rings: 3, seg: 6, jitter: 0.1 });
    TR(b, 1.1, 0.2, 0.1, 0.5, 0.09, 10, 2, K.red, M.cloth, 'z');
    SP(b, 1.1, -0.22, 0.42, 0.13, K.goldHi, M.gold, { rings: 2, seg: 5 });
    TUB(b, [[-1.3, -0.1, 0.5], [-1.9, 0.05, 0.9], [-2.1, 0.1, 0.35], [-1.7, 0.15, -0.15], [-1.2, 0.12, -0.05]], (t) => 0.14 - 0.05 * t, 5, K.catFur, M.cat, { caps: true });
  });
  // 床上摊开的画册 + 茶杯
  item(); // 12 床上的画册与茶杯
  atY(b, -6.2, 1.78, 22.2, 0.22, () => {
    BX(b, 0, 0, 0, 1.45, 0.08, 1.05, K.cream, M.paper, { topCol: K.paper });
    BX(b, 0, 0.02, -0.52, 1.5, 0.1, 0.07, K.coralDk, M.paper);
    QXZ(b, -0.62, 0.62, -0.42, 0.42, 0.06, K.paper, M.paper);
    for (let i = 0; i < 3; i++) QXZ(b, -0.5, 0.5, -0.3 + i * 0.24, -0.27 + i * 0.24, 0.07, mulc(K.creamDk, 0.7), M.paper);
  });
  LT(b, -8.4, 1.76, 22.5, [[0, 0], [0.26, 0], [0.3, 0.3], [0.2, 0.5]], 10, K.porcelain, M.ceramic);
  TR(b, -8.4, 2.2, 22.5, 0.2, 0.04, 10, 2, K.gold, M.gold, 'y');

  item(); // 13 床下的颜料罐一排
  const tins = [[-12.2, 0.52, K.teal], [-10.4, 0.44, K.coral], [-8.6, 0.58, K.cream], [-6.6, 0.42, K.gold], [-4.9, 0.5, K.plum]];
  for (const [tx, tr, tc] of tins) {
    CY(b, tx, 0, 20.35, 12, tr, tr, 0.78, tc, M.metal, { y0: 0 });
    CY(b, tx, 0.52, 20.35, 12, tr * 0.86, tr * 0.86, 0.1, mulc(tc, 1.2), M.metal, { y0: 0 });
    TR(b, tx, 0.4, 20.35, tr * 0.9, 0.04, 10, 2, K.gold, M.gold, 'y');
    BAR(b, [tx + tr * 0.3, 0.55, 20.35], [tx + 1.4, 1.7, 20.5], 0.06, 0.06, K.wood, M.wood);
    SP(b, tx + 1.4, 1.72, 20.5, 0.11, pickc([K.red, K.teal, K.gold, K.plum]), M.paint, { rings: 2, seg: 5 });
  }
  item(); // 14 靠窗长凳
  BX(b, 8.4, 0.55, 23.55, 9.6, 0.5, 2.3, K.wood, M.wood, { topCol: mulc(K.creamDk, 1.05) });
  for (let i = 0; i < 5; i++) BX(b, 3.9 + i * 2.25, 0.95, 23.55, 0.16, 0.34, 2.1, K.woodDk, M.woodDk);
  BX(b, 8.4, 0.92, 23.55, 9.4, 0.12, 2.1, K.cream, M.wood);
  for (const lx of [4.2, 12.6]) for (const lz of [22.6, 24.5]) BAR(b, [lx, 0.3, lz], [lx, 0.9, lz], 0.28, 0.28, K.teal, M.teal);
  item(); // 15 长凳靠垫
  BX(b, 5.4, 1.15, 23.4, 2.4, 0.5, 2.0, K.coral, M.cloth);
  BX(b, 10.1, 1.2, 23.3, 2.6, 0.6, 2.1, mixc(K.cream, K.gold, 0.22), M.cloth);
  item(); // 16 长凳上的蕨盆
  LT(b, 12.4, 1.0, 23.5, [[0.0, 0], [0.7, 0], [0.85, 0.55], [0.9, 0.9]], 12, K.porcelain, M.ceramic);
  DS(b, 12.4, 1.85, 23.5, 0.75, 12, K.soil, M.stone);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU;
    SP(b, 12.4 + Math.cos(a) * 0.6, 2.35 + rr(0.1, 0.7), 23.5 + Math.sin(a) * 0.6, rr(0.34, 0.5),
      mixc(K.leafDk, K.leafLt, rnd()), M.leafSoft, { rings: 3, seg: 5, jitter: 0.3, seed: i + 3 });
  }
  item(); // 17 长凳上的画册堆
  for (let k = 0; k < 4; k++) {
    atY(b, 4.5, 1.02 + k * 0.2, 22.9, rr(-0.15, 0.15), () => BX(b, 0, 0, 0, 1.9, 0.16, 1.35, pickc([K.teal, K.coral, K.cream, K.gold]), M.paper));
  }
  // 地上的坐垫与陶壶
  item(); // 18 地上坐垫 + 陶壶
  atY(b, -0.4, 0.3, 19.6, 0.3, () => {
    CY(b, 0, 0, 0, 16, 0.85, 0.75, 0.6, mixc(K.coral, K.coralDk, 0.2), M.wool, { y0: 0 });
    SP(b, 0, 0.62, 0, 0.6, K.coralDk, M.wool, { rings: 3, seg: 6, jitter: 0.05 });
    SP(b, 0, 0.78, 0, 0.12, K.gold, M.gold, { rings: 2, seg: 4 });
  });
  LT(b, -1.5, 0, 18.9, [[0, 0], [0.3, 0], [0.38, 0.35], [0.26, 0.6], [0.3, 0.8]], 12, K.porcelain, M.ceramic);
  BAR(b, [-1.5, 0.55, 18.9], [-1.15, 1.05, 18.9], 0.1, 0.1, K.porcelain, M.ceramic);
}
// ============================================================ 窗帘 + 吊挂物
function buildHangings(b) {
  const cz = 24.12;
  item(); // 19 左窗帘（珊瑚红 + 蓝鱼贴布）
  const panels = 8, cw = 0.42, cxx = -17.5;
  for (let i = 0; i < panels; i++) {
    const x = cxx + (i - panels / 2) * cw + cw / 2;
    const zz = cz + Math.sin(i * 1.1) * 0.1;
    BX(b, x, 9.6, zz, cw + 0.03, 13.6, 0.34, i % 2 ? mixc(K.coral, K.ruby, 0.22) : mixc(K.coral, K.coralDk, 0.38), M.wool);
  }
  for (let i = 0; i < 6; i++) {
    const x = -18.8 + i * 0.66, y = 5.4 + (i % 3) * 3.5;
    at(b, x, y, cz - 0.19, () => {
      EL(b, 0, 0, 0, 0.56, 0.24, 0.1, 7, 4, K.glassB, M.cloth);
      b.tri([-0.5, 0, 0], [-0.94, 0.34, 0], [-0.94, -0.34, 0], K.glassD, M.cloth, [0, 0, -1], [0, 0, -1], [0, 0, -1]);
      b.tri([-0.1, -0.2, 0.02], [0.25, -0.42, 0.02], [0.05, -0.05, 0.02], K.glassD, M.cloth, [0, 0, -1], [0, 0, -1], [0, 0, -1]);
      SP(b, 0.36, 0.06, 0.08, 0.05, K.cream, M.cloth, { rings: 2, seg: 4 });
    });
  }
  BX(b, -17.5, 7.2, cz - 0.1, 3.5, 0.52, 0.52, K.gold, M.gold);
  SP(b, -15.8, 7.2, cz - 0.4, 0.3, K.goldHi, M.gold, { rings: 2, seg: 6 });
  item(); // 20 右窗帘
  for (let i = 0; i < 6; i++) {
    const x = 16.9 + (i - 3) * 0.4;
    BX(b, x, 9.6, cz + Math.sin(i * 1.3) * 0.09, 0.38, 13.6, 0.34, i % 2 ? mixc(K.coral, K.ruby, 0.22) : mixc(K.coral, K.coralDk, 0.38), M.wool);
  }
  BX(b, 16.9, 7.5, cz - 0.1, 2.7, 0.48, 0.48, K.gold, M.gold);
  item(); // 21 窗帘杆
  BAR(b, [-18.8, 16.85, cz], [18.8, 16.85, cz], 0.17, 0.17, K.gold, M.gold);
  for (const sx of [-18.9, 18.9]) SP(b, sx, 16.85, cz, 0.26, K.goldHi, M.gold, { rings: 2, seg: 6 });
  for (let i = 0; i < 9; i++) {
    TR(b, -18.3 + i * 0.28, 16.64, cz, 0.21, 0.045, 8, 2, K.gold, M.gold, 'y');
    TR(b, 16.0 + i * 0.26, 16.64, cz, 0.21, 0.045, 8, 2, K.gold, M.gold, 'y');
  }

  // ---- 吊篮绿植 ×3
  const plants = [[-13.6, 22.7, 13.0, 1.0], [10.9, 20.1, 13.9, 0.92], [-6.2, 24.9, 14.4, 0.82]];
  for (let pi = 0; pi < plants.length; pi++) {
    item(); // 22 吊篮绿植（三只各计一组）
    const [px, pz, by, sc] = plants[pi];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU + 0.5;
      BAR(b, [px + Math.cos(a) * 0.55 * sc, 17.42, pz + Math.sin(a) * 0.55 * sc],
        [px + Math.cos(a) * 0.24 * sc, by + 0.42 * sc, pz + Math.sin(a) * 0.24 * sc], 0.06, 0.06, K.gold, M.metal);
    }
    LT(b, px, by, pz, [[0, 0], [0.55 * sc, 0], [0.78 * sc, 0.22 * sc], [0.85 * sc, 0.5 * sc], [0.72 * sc, 0.8 * sc]], 12, K.wood, M.wood);
    TR(b, px, by + 0.8 * sc, pz, 0.74 * sc, 0.06, 12, 2, K.woodDk, M.woodDk, 'y');
    DS(b, px, by + 0.76 * sc, pz, 0.66 * sc, 12, K.soil, M.stone);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + pi;
      SP(b, px + Math.cos(a) * rr(0.2, 0.85) * sc, by + rr(0.85, 1.75) * sc, pz + Math.sin(a) * rr(0.2, 0.85) * sc,
        rr(0.3, 0.55) * sc, mixc(K.leafDk, K.leafLt, rnd()), M.leafSoft, { rings: 3, seg: 5, jitter: 0.28, seed: 11 + i + pi * 7 });
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + pi * 2;
      SP(b, px + Math.cos(a) * 0.62 * sc, by + 1.55 * sc, pz + Math.sin(a) * 0.62 * sc, 0.16 * sc,
        pickc([K.pink, K.coralLt, K.cream]), M.leafSoft, { rings: 2, seg: 5, jitter: 0.3 });
    }
    for (let v = 0; v < 2; v++) {
      const a = v * 2.1 + pi, len = rr(2.4, 3.8) * sc;
      const pts = [];
      for (let k = 0; k < 5; k++) {
        const t = k / 4;
        pts.push([px + Math.cos(a) * (0.62 + t * 0.5) * sc, by + 0.7 * sc - t * len, pz + Math.sin(a) * (0.62 + t * 0.4) * sc]);
      }
      TUB(b, pts, 0.055 * sc, 4, K.leafDk, M.leaf, { caps: true });
      for (let k = 1; k < 5; k++) {
        SP(b, pts[k][0] + rr(-0.1, 0.1), pts[k][1], pts[k][2] + rr(-0.1, 0.1), rr(0.15, 0.24) * sc, K.leaf, M.leaf, { rings: 2, seg: 4, jitter: 0.2 });
      }
    }
  }

  item(); // 23 纸灯笼串（暖桃色）
  const lanterns = [
    [10.3, 13.7, 17.2, 1.0], [11.5, 12.1, 18.3, 0.78], [9.5, 10.9, 18.8, 0.66],
    [13.7, 11.5, 15.0, 0.8], [12.2, 14.5, 14.2, 0.7], [-14.6, 12.7, 16.6, 0.72],
  ];
  for (const [lx, ly, lz, lr] of lanterns) {
    BAR(b, [lx, ly + lr * 1.02, lz], [lx, 17.4, lz], 0.04, 0.04, K.creamDk, M.paper);
    SP(b, lx, ly, lz, lr, mixc(K.paper, K.coral, 0.62), [0.24, 0.16], { rings: 5, seg: 8, jitter: 0.02, seed: 5 });
    for (let k = -1; k <= 1; k++) {
      TR(b, lx, ly + k * lr * 0.58, lz, Math.sqrt(Math.max(0.05, 1 - (k * 0.58) * (k * 0.58))) * lr, 0.035, 10, 2, mixc(K.coralDk, K.gold, 0.35), M.paper, 'y');
    }
    CY(b, lx, ly + lr * 1.0, lz, 8, 0.16, 0.16, 0.1, K.gold, M.gold, { y0: 0 });
    CY(b, lx, ly - lr * 1.02, lz, 8, 0.14, 0.1, 0.1, K.gold, M.gold, { y0: 0 });
    for (let k = 0; k < 3; k++) SP(b, lx + Math.cos(k * 2.1) * 0.06, ly - lr * 1.06, lz + Math.sin(k * 2.1) * 0.06, 0.04, K.coralDk, M.paper, { rings: 2, seg: 4 });
  }

  item(); // 24 彩绘玻璃鱼吊饰（签名件 · 窗前）
  const MX = 10.6, MY = 12.35, MZ = 23.85;
  TR(b, MX, MY, MZ, 2.95, 0.1, 26, 3, mixc(K.gold, K.woodDk, 0.72), [0.025, 0.1], 'y');
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU + Math.PI / 2;
    BAR(b, [MX + Math.cos(a) * 2.85, MY, MZ + Math.sin(a) * 2.85], [MX + Math.cos(a) * 2.5, 17.4, MZ + Math.sin(a) * 2.5], 0.045, 0.045, mixc(K.gold, K.woodDk, 0.68), [0.025, 0.12]);
    SP(b, MX + Math.cos(a) * 2.85, MY, MZ + Math.sin(a) * 2.85, 0.12, K.gold, M.gold, { rings: 2, seg: 5 });
  }
  const fishCols = [K.ruby, K.cobalt, K.emerald, K.amber, K.plum, K.glassB];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU + 0.4;
    const px = MX + Math.cos(a) * 2.6, pz = MZ + Math.sin(a) * 2.6;
    const py = MY - 1.25 - (k % 3) * 0.55;
    BAR(b, [px, MY, pz], [px, py + 0.62, pz], 0.04, 0.04, mixc(K.gold, K.woodDk, 0.68), [0.025, 0.12]);
    atY(b, px, py, pz, a, () => {
      EL(b, 0, 0, 0, 1.05, 0.4, 0.12, 9, 5, fishCols[k], [0.2, 0.5]);
      EL(b, 0.08, -0.12, 0.06, 0.8, 0.2, 0.08, 7, 4, mulc(fishCols[k], 1.5), [0.22, 0.42]);
      b.tri([-0.95, 0, 0], [-1.65, 0.48, 0], [-1.6, -0.46, 0], mulc(fishCols[k], 0.82), [0.3, 0.55], [0, 0, 1], [0, 0, 1], [0, 0, 1]);
      b.tri([0.2, 0.3, 0], [0.5, 0.72, 0], [-0.1, 0.36, 0], mulc(fishCols[k], 1.2), [0.3, 0.55], [0, 0, 1], [0, 0, 1], [0, 0, 1]);
      SP(b, 0.72, 0.08, 0.15, 0.09, K.cream, M.glowSoft, { rings: 2, seg: 4 });
      SP(b, 0.72, 0.08, 0.22, 0.045, K.black, M.dark, { rings: 2, seg: 4 });
    });
  }
  SP(b, MX + 2.2, MY - 1.1, MZ + 0.8, 0.38, K.glassB, [0.3, 0.9], { rings: 3, seg: 6, jitter: 0.05 });
  SP(b, MX - 2.0, MY - 0.8, MZ - 1.0, 0.3, K.pinkLt, [0.3, 0.9], { rings: 3, seg: 6, jitter: 0.05 });
  SP(b, MX + 0.2, MY - 2.6, MZ - 1.9, 0.26, mixc(K.goldHi, K.cream, 0.4), [0.34, 0.9], { rings: 3, seg: 6, jitter: 0.05 });
}
// ============================================================ 画架 + 鲸鱼画
function buildEasel(b) {
  item(); // 25 画架
  atY(b, 4.7, 0, 19.35, 0.30, () => {
    BAR(b, [-1.9, 0, -0.95], [0, 8.05, 0.3], 0.26, 0.32, K.wood, M.wood);
    BAR(b, [1.9, 0, -0.95], [0, 8.05, 0.3], 0.26, 0.32, K.wood, M.wood);
    BAR(b, [0, 0, 2.1], [0, 7.35, 0.4], 0.22, 0.26, K.woodDk, M.woodDk);
    BAR(b, [-1.55, 1.75, -0.58], [1.55, 1.75, -0.58], 0.22, 0.22, K.woodDk, M.woodDk);
    BAR(b, [-0.9, 3.4, -0.38], [0, 8.0, 0.3], 0.11, 0.11, K.gold, M.gold);
    BAR(b, [0.9, 3.4, -0.38], [0, 8.0, 0.3], 0.11, 0.11, K.gold, M.gold);
    // 画布（略向后倾）
    b.push(m4.mul(T3(0, 0, -0.05), m4.rotX(0.14)));
    item(); // 26 未完成的鲸鱼画
    BX(b, 0, 4.35, -0.42, 4.35, 5.9, 0.2, K.cream, M.wood, { topCol: K.paper, bottomCol: K.creamDk });
    // ---- 画底：深靛夜空 + 星云
    QXY(b, -1.98, 1.98, 1.52, 7.18, -0.53, rgb('#1b2454'), M.paint, -1);
    QXY(b, -1.98, 1.98, 5.5, 7.18, -0.535, rgb('#25306b'), M.paint, -1);
    QXY(b, -1.98, 1.98, 2.2, 3.4, -0.536, mixc(rgb('#25306b'), K.plum, 0.35), M.paint, -1);
    QXY(b, -1.98, 0.2, 3.4, 4.4, -0.537, mixc(K.plum, K.cobalt, 0.4), M.paint, -1);
    // ---- 巨行星（琥珀 + 大气 + 环）
    DISCXY(b, 0.5, 5.35, -0.545, 1.72, 22, C.planetA, M.paint, -1);
    DISCXY(b, 0.1, 4.95, -0.548, 1.5, 20, mixc(C.planetA, C.planetB, 0.5), M.paint, -1);
    DISCXY(b, 0.5, 5.35, -0.542, 1.82, 22, mixc(C.planetA, K.cream, 0.30), M.paint, -1);
    DISCXY(b, 0.5, 5.35, -0.544, 1.72, 22, C.planetA, M.paint, -1);
    DISCXY(b, 0.82, 4.98, -0.546, 1.5, 20, mixc(C.planetB, K.ruby, 0.25), M.paint, -1);
    DISCXY(b, 0.28, 5.72, -0.548, 0.72, 16, mixc(C.planetA, K.cream, 0.45), M.paint, -1);
    RINGXY(b, 0.5, 5.35, -0.552, 2.55, 0.72, 0.2, 22, C.ringA, M.paint, -1);
    RINGXY(b, 0.5, 5.35, -0.553, 2.95, 0.86, 0.1, 22, mulc(C.ringA, 0.82), M.paint, -1);
    RINGXY(b, 0.5, 5.35, -0.554, 3.32, 0.96, 0.07, 22, mulc(C.ringA, 0.6), M.paint, -1);
    // ---- 天空鲸（呼应 ASTRA 的蓝鲸）
    EL(b, -0.35, 2.35, -0.565, 1.5, 0.62, 0.1, 10, 5, C.whaleBody, M.paint);
    EL(b, -0.15, 2.1, -0.568, 1.15, 0.3, 0.06, 8, 4, C.whaleBelly, M.paint);
    EL(b, 0.95, 2.62, -0.57, 0.55, 0.4, 0.08, 8, 4, C.whaleBody, M.paint);
    b.tri([-1.65, 2.45, -0.565], [-2.5, 3.05, -0.565], [-2.35, 1.95, -0.565], C.whaleFin, M.paint, [0, 0, -1], [0, 0, -1], [0, 0, -1]);
    b.tri([-1.62, 2.35, -0.565], [-2.4, 1.9, -0.565], [-1.5, 2.1, -0.565], C.whaleFin, M.paint, [0, 0, -1], [0, 0, -1], [0, 0, -1]);
    b.tri([-0.3, 1.85, -0.566], [0.25, 1.62, -0.566], [-0.45, 2.3, -0.566], mulc(C.whaleFin, 0.9), M.paint, [0, 0, -1], [0, 0, -1], [0, 0, -1]);
    SP(b, 1.28, 2.6, -0.572, 0.075, K.black, M.paint, { rings: 2, seg: 4 });
    for (let i = 0; i < 8; i++) {
      SP(b, -1.28 + i * 0.34, 2.5 + Math.sin(i * 1.9) * 0.2, -0.573, 0.05, C.cyanGlow, M.glowHi, { rings: 2, seg: 4 });
    }
    // 星点
    for (let i = 0; i < 16; i++) {
      const sx = rr(-1.9, 1.9), sy = rr(1.8, 7.0);
      SP(b, sx, sy, -0.55, rr(0.035, 0.075), K.paper, M.glowHi, { rings: 2, seg: 4 });
    }
    // ---- 未画完：左上角留白 + 铅笔稿
    QXY(b, -1.98, -0.85, 5.55, 7.18, -0.54, K.paper, M.paper, -1);
    QXY(b, -1.98, -0.2, 7.02, 7.18, -0.54, K.creamDk, M.paper, -1);
    for (let i = 0; i < 4; i++) BAR(b, [-1.8, 5.8 + i * 0.32, -0.545], [-0.85, 5.86 + i * 0.3, -0.545], 0.025, 0.025, rgb('#3a3a48'), M.paper);
    // 颜料滴
    for (let i = 0; i < 5; i++) SP(b, rr(-1.8, 1.8), 1.62 + rr(0, 0.2), -0.556, rr(0.05, 0.1), pickc([K.coral, K.teal, K.gold, K.plum]), M.paint, { rings: 2, seg: 4 });
    b.pop();
    // 托 + 铜夹 + 抹布
    BX(b, 0, 1.52, -0.58, 4.55, 0.16, 0.52, K.woodDk, M.woodDk);
    BX(b, 0, 1.62, -0.58, 4.55, 0.06, 0.44, K.gold, M.gold);
    for (const sx of [-1.7, 1.7]) BX(b, sx, 7.05, -0.62, 0.26, 0.4, 0.3, K.gold, M.gold);
    BX(b, 1.6, 2.6, -0.36, 0.9, 1.5, 0.1, mixc(K.cream, K.teal, 0.35), M.wool);
    // 画布背面：木内框 + 标签 + 挂绳
    for (const sy of [-2.55, 2.55]) BX(b, 0, 4.35 + sy, -0.28, 4.1, 0.16, 0.24, K.woodDk, M.woodDk);
    for (const sx of [-1.95, 1.95]) BX(b, sx, 4.35, -0.28, 0.16, 5.3, 0.24, K.woodDk, M.woodDk);
    BX(b, 0, 4.35, -0.3, 3.6, 0.12, 0.16, K.woodDk, M.woodDk);
    BX(b, 1.85, 1.92, -0.2, 0.7, 0.5, 0.05, K.paper, M.paper);
    BAR(b, [-1.2, 4.9, -0.18], [1.2, 4.7, -0.18], 0.03, 0.03, K.woodDk, M.metal);
  });
  item(); // 27 画架前的矮凳 + 调色板
  atY(b, 2.55, 0, 18.15, 0.62, () => {
    CY(b, 0, 1.35, 0, 14, 0.78, 0.74, 0.2, K.teal, M.teal, { y0: 0 });
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU + 0.4;
      BAR(b, [Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45], [Math.cos(a) * 0.55, 1.35, Math.sin(a) * 0.55], 0.16, 0.16, K.woodDk, M.woodDk);
    }
    EL(b, 0.1, 1.62, 0.15, 1.25, 0.08, 0.85, 9, 4, K.creamDk, M.wood);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      SP(b, 0.1 + Math.cos(a) * 0.75, 1.7, 0.15 + Math.sin(a) * 0.5, 0.14, pickc([K.coral, K.teal, K.gold, K.plum, K.cobalt, K.ruby]), M.paint, { rings: 2, seg: 5 });
    }
    CY(b, -0.9, 1.35, -0.4, 10, 0.34, 0.3, 0.42, K.glassB, M.glass, { y0: 0 });
    for (let i = 0; i < 4; i++) BAR(b, [-0.9 + i * 0.1, 1.5, -0.4], [-1.1 + i * 0.16, 2.5, -0.5], 0.05, 0.05, K.wood, M.wood);
  });
  item(); // 28 地上的颜料管与画稿
  for (let i = 0; i < 5; i++) {
    atY(b, rr(1.4, 6.6), 0.09, rr(16.2, 18.4), rr(0, TAU), () => {
      CY(b, 0, 0, 0, 6, 0.13, 0.13, 0.56, pickc([K.coral, K.teal, K.cream, K.gold]), M.metal, { y0: 0 });
      CY(b, 0, 0.56, 0, 6, 0.06, 0.06, 0.16, K.gold, M.gold, { y0: 0 });
    });
  }
  for (let i = 0; i < 3; i++) {
    atY(b, rr(0.0, 3.4), 0.02, rr(15.6, 18.0), rr(0, TAU), () => {
      QXZ(b, -0.7, 0.7, -0.9, 0.9, 0, K.paper, M.paper);
      for (let k = 0; k < 2; k++) QXZ(b, -0.5, 0.5, -0.4 + k * 0.55, -0.37 + k * 0.55, 0.012, mulc(K.creamDk, 0.7), M.paper);
    });
  }
}
// ============================================================ 书桌（右前）
function buildDesk(b) {
  item(); // 27 红面工作桌
  const tx = 8.8, tz = 13.3, ty = 2.06;
  BX(b, tx, ty, tz, 5.6, 0.36, 2.9, K.wood, M.wood, { topCol: K.red, bottomCol: K.woodDk });
  // 桌面木边 + 铜护角
  for (const s of [-1, 1]) {
    BX(b, tx + s * 2.75, ty, tz, 0.12, 0.3, 3.0, K.gold, M.brassDark);
    BX(b, tx, ty, tz + s * 1.42, 5.7, 0.3, 0.12, K.gold, M.brassDark);
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      CY(b, tx + sx * 2.35, 0, tz + sz * 1.05, 12, 0.19, 0.15, 1.9, K.teal, M.teal, { y0: 0 });
    }
  }
  BAR(b, [tx - 2.35, 0.55, tz - 1.05], [tx + 2.35, 0.55, tz - 1.05], 0.12, 0.12, K.teal, M.teal);
  BAR(b, [tx - 2.35, 0.55, tz + 1.05], [tx + 2.35, 0.55, tz + 1.05], 0.12, 0.12, K.teal, M.teal);
  // 桌下抽屉柜
  BX(b, tx - 1.5, 0.85, tz, 1.9, 1.2, 2.0, K.cream, M.cream, { topCol: K.wood });
  for (let i = 0; i < 2; i++) {
    BX(b, tx - 1.5, 0.55 + i * 0.5, tz - 1.02, 1.5, 0.36, 0.08, K.teal, M.teal);
    SP(b, tx - 1.5, 0.55 + i * 0.5, tz - 1.08, 0.09, K.goldHi, M.gold, { rings: 2, seg: 5 });
  }
  // 桌上铺的画布 + 颜料盒
  QXZ(b, tx - 2.4, tx + 2.4, tz - 1.3, tz + 1.3, ty + 0.19, K.paper, M.paper);
  item(); // 28 摊开的速写本
  atY(b, tx - 1.35, ty + 0.24, tz - 0.55, -0.18, () => {
    BX(b, 0, 0, 0, 1.9, 0.1, 1.4, K.coral, M.paper, { topCol: K.cream });
    QXZ(b, -0.85, 0.85, -0.6, 0.6, 0.06, K.paper, M.paper);
    for (let i = 0; i < 4; i++) BAR(b, [-0.6, 0.07, -0.35 + i * 0.24], [0.55, 0.07, -0.4 + i * 0.26], 0.025, 0.025, mulc(K.black, 1.3), M.paper);
    // 速写：一只猫
    DISCXY(b, -0.3, 0.14, 0.07, 0.24, 10, K.cream, M.paper, 1);
  });
  item(); // 29 笔筒 + 铅笔
  CY(b, tx + 1.75, ty + 0.18, tz + 0.6, 14, 0.42, 0.4, 1.15, K.orange, M.ceramic, { y0: 0 });
  TR(b, tx + 1.75, ty + 1.15, tz + 0.6, 0.4, 0.06, 12, 2, K.gold, M.gold, 'y');
  // 筒上的几何花纹
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.4;
    BX(b, tx + 1.75 + Math.cos(a) * 0.4, ty + 0.62, tz + 0.6 + Math.sin(a) * 0.4, 0.1, 0.5, 0.16, K.tealDk, M.ceramic);
  }
  const penCols = [K.red, K.teal, K.gold, K.blue, K.violet, K.coral, K.cream];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU, r0 = 0.18 + (i % 3) * 0.08;
    BAR(b, [tx + 1.75 + Math.cos(a) * r0, ty + 0.9, tz + 0.6 + Math.sin(a) * r0],
      [tx + 1.75 + Math.cos(a) * (r0 + 0.35), ty + 2.05 + (i % 4) * 0.1, tz + 0.6 + Math.sin(a) * (r0 + 0.35)],
      0.07, 0.07, penCols[i % penCols.length], M.paint);
  }
  item(); // 30 剪刀 + 糖罐 + 玩具相机
  // 剪刀
  atY(b, tx + 0.95, ty + 0.3, tz - 0.7, 0.5, () => {
    BX(b, 0.42, 0, 0, 0.9, 0.05, 0.14, K.goldHi, M.metal);
    BX(b, -0.42, 0, 0, 0.9, 0.05, 0.14, K.goldHi, M.metal);
    TR(b, -0.95, 0, 0, 0.17, 0.05, 8, 2, K.teal, M.metal, 'z');
    TR(b, -0.95, 0, 0.2, 0.17, 0.05, 8, 2, K.teal, M.metal, 'z');
  });
  // 糖罐
  LT(b, tx - 2.0, ty + 1.55, tz + 1.0, [[0, 0], [0.42, 0], [0.5, 0.3], [0.44, 0.6], [0.34, 0.72]], 12, K.porcelain, M.ceramic);
  LT(b, tx - 2.0, ty + 1.55, tz + 1.0, [[0, 0.72], [0.36, 0.74], [0.2, 0.9], [0, 0.92]], 12, K.pinkLt, M.ceramic);
  BAR(b, [tx - 1.55, ty + 1.6, tz + 1.2], [tx - 1.1, ty + 2.3, tz + 1.3], 0.05, 0.05, K.gold, M.metal);
  // 玩具相机
  atY(b, tx - 0.1, ty + 0.55, tz - 1.0, 0.35, () => {
    BX(b, 0, 0, 0, 1.0, 0.62, 0.56, K.teal, M.gloss, { topCol: K.tealLt });
    atX(b, 0, 0, -0.3, Math.PI / 2, () => CY(b, 0, 0, 0, 12, 0.24, 0.26, 0.2, K.cream, M.glass, { y0: 0 }));
    BX(b, 0.3, 0.42, 0, 0.3, 0.16, 0.3, K.coral, M.gloss);
    BX(b, -0.42, 0.4, 0, 0.14, 0.12, 0.14, K.goldHi, M.gold);
  });
  item(); // 31 闹钟 + 糖果
  atY(b, tx + 0.1, ty + 0.95, tz + 1.15, -0.3, () => {
    atX(b, 0, 0, 0, Math.PI / 2, () => CY(b, 0, 0, 0, 16, 0.58, 0.58, 0.26, K.teal, M.gloss, { y0: 0 }));
    DISCXY(b, 0, 0, -0.15, 0.46, 14, K.cream, M.ceramic, -1);
    BX(b, 0, 0.12, -0.17, 0.05, 0.3, 0.03, K.black, M.dark);
    BX(b, 0.1, 0.02, -0.17, 0.24, 0.05, 0.03, K.black, M.dark);
    for (const sx of [-0.45, 0.45]) SP(b, sx, 0.52, 0, 0.18, K.coral, M.gloss, { rings: 2, seg: 5 });
    for (const sx of [-0.35, 0.35]) BAR(b, [sx, -0.4, 0], [sx * 1.25, -0.85, -0.1], 0.09, 0.09, K.gold, M.metal);
  });
  for (let i = 0; i < 4; i++) {
    atY(b, tx + rr(-2.2, 2.2), ty + 0.28, tz + rr(-0.9, 1.1), rr(0, TAU), () => {
      EL(b, 0, 0, 0, 0.24, 0.1, 0.1, 6, 3, K.goldHi, M.paint);
      b.tri([0.2, 0, 0], [0.42, 0.1, 0.1], [0.4, -0.1, -0.1], K.gold, M.paint);
    });
  }
  item(); // 32 绿罩台灯
  atY(b, tx - 2.2, ty + 0.18, tz - 0.7, 0.3, () => {
    CY(b, 0, 0, 0, 12, 0.34, 0.3, 0.16, K.gold, M.gold, { y0: 0 });
    BAR(b, [0, 0.16, 0], [0, 1.5, 0], 0.12, 0.12, K.gold, M.metal);
    atX(b, 0, 1.55, -0.1, 0.4, () => {
      LT(b, 0, 0, 0, [[0, 0], [0.62, 0.06], [0.55, 0.34], [0.2, 0.5]], 12, mixc(K.teal, K.tealDk, 0.3), M.glass);
    });
    SP(b, 0, 1.62, -0.1, 0.2, mixc(K.paper, K.amber, 0.45), [0.36, 0.22], { rings: 2, seg: 6 });
  });
  item(); // 33 桌上黑猫
  atY(b, tx - 0.4, ty + 0.62, tz - 0.35, -0.18, () => {
    EL(b, 0, 0, 0, 1.25, 0.36, 0.55, 10, 5, K.catFur, M.cat);
    EL(b, -0.2, 0.12, 0, 0.9, 0.24, 0.42, 8, 4, mulc(K.catFur, 0.92), M.cat);
    SP(b, -1.15, 0.28, 0.1, 0.42, K.catFur, M.cat, { rings: 4, seg: 7, jitter: 0.05 });
    atZ(b, -1.32, 0.66, 0.06, -0.3, () => CY(b, 0, 0, 0, 5, 0.18, 0.02, 0.3, K.catFur, M.cat, { y0: 0 }));
    atZ(b, -0.95, 0.66, 0.1, 0.3, () => CY(b, 0, 0, 0, 5, 0.17, 0.02, 0.3, K.catFur, M.cat, { y0: 0 }));
    TR(b, -0.82, 0.1, 0.1, 0.36, 0.07, 10, 2, K.red, M.cloth, 'z');
    SP(b, -0.82, -0.25, 0.3, 0.1, K.goldHi, M.gold, { rings: 2, seg: 5 });
    TUB(b, [[1.1, 0, 0.2], [1.7, 0.1, 0.6], [1.85, 0.05, 0.2], [1.5, 0.02, -0.15], [1.1, 0, -0.05]], (t) => 0.11 - 0.04 * t, 5, K.catFur, M.cat);
  });
  item(); // 34 桌面多肉小盆
  LT(b, tx + 2.2, ty + 0.18, tz - 1.05, [[0, 0], [0.34, 0], [0.4, 0.32], [0.3, 0.42]], 10, K.porcelain, M.ceramic);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    SP(b, tx + 2.2 + Math.cos(a) * 0.14, ty + 0.62 + (i % 2) * 0.1, tz - 1.05 + Math.sin(a) * 0.14, 0.15, K.leaf, M.leaf, { rings: 2, seg: 4, jitter: 0.25 });
  }
  item(); // 35 桌前的木椅
  atY(b, tx + 0.4, 0, tz + 2.35, 0.1, () => {
    BX(b, 0, 1.15, 0, 1.5, 0.18, 1.4, K.wood, M.wood, { topCol: K.creamDk });
    BX(b, 0, 1.2, 0, 1.2, 0.1, 1.1, K.coral, M.cloth);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) BAR(b, [sx * 0.6, 0, sz * 0.55], [sx * 0.6, 1.1, sz * 0.55], 0.14, 0.14, K.woodDk, M.woodDk);
    for (const sx of [-1, 1]) BAR(b, [sx * 0.6, 1.1, -0.6], [sx * 0.6, 2.5, -0.72], 0.14, 0.14, K.woodDk, M.woodDk);
    for (let i = 0; i < 3; i++) BAR(b, [-0.6, 1.55 + i * 0.42, -0.64 - i * 0.03], [0.6, 1.55 + i * 0.42, -0.64 - i * 0.03], 0.1, 0.1, K.woodDk, M.woodDk);
  });
}

// ============================================================ 左墙：彩绘玻璃灯箱 + 斗柜 + 鱼缸
function buildLeftWall(b) {
  const xw = -19.05;
  item(); // 36 彩绘玻璃灯箱（签名件 · 整面）
  const z0 = 8.1, z1 = 17.1, y0 = 3.0, y1 = 13.2, zc = (z0 + z1) / 2, yc = (y0 + y1) / 2;
  BX(b, xw + 0.16, yc, zc, 0.32, y1 - y0 + 0.9, z1 - z0 + 0.9, K.tealDk, M.tealDk);
  // 青绿木框 + 黄铜内唇
  BX(b, xw + 0.34, y0 - 0.24, zc, 0.5, 0.6, z1 - z0 + 1.2, K.teal, M.teal);
  BX(b, xw + 0.34, y1 + 0.24, zc, 0.5, 0.6, z1 - z0 + 1.2, K.teal, M.teal);
  BX(b, xw + 0.34, yc, z0 - 0.24, 0.5, y1 - y0 + 1.0, 0.6, K.teal, M.teal);
  BX(b, xw + 0.34, yc, z1 + 0.24, 0.5, y1 - y0 + 1.0, 0.6, K.teal, M.teal);
  BX(b, xw + 0.52, y0 - 0.1, zc, 0.1, 0.16, z1 - z0 + 0.7, K.gold, M.gold);
  BX(b, xw + 0.52, y1 + 0.1, zc, 0.1, 0.16, z1 - z0 + 0.7, K.gold, M.gold);
  BX(b, xw + 0.52, yc, z0 - 0.1, 0.1, y1 - y0 + 0.7, 0.16, K.gold, M.gold);
  BX(b, xw + 0.52, yc, z1 + 0.1, 0.1, y1 - y0 + 0.7, 0.16, K.gold, M.gold);
  // 6×6 镶嵌玻璃
  const NX = 8, NY = 8, pw = (z1 - z0) / NX, ph = (y1 - y0) / NY;
  const jewel = [rgb('#1f5f63'), rgb('#7d2f42'), rgb('#2f4d8c'), rgb('#4a6b3a'), rgb('#b07a30'), rgb('#8a5560'), rgb('#2e7a72')];
  const pale = [mixc(K.glassB, K.cream, 0.35), mixc(K.mint, K.cream, 0.32), mixc(K.cream, K.gold, 0.42), mixc(K.pinkLt, K.cream, 0.3)];
  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NY; j++) {
      const border = i === 0 || i === NX - 1 || j === 0 || j === NY - 1;
      const pc = border ? jewel[(i * 3 + j * 5 + 1) % jewel.length] : pale[(i + j) % pale.length];
      const em = border ? [0.14, 0.5] : [0.19, 0.45];
      QYZ(b, y0 + j * ph + 0.07, y0 + (j + 1) * ph - 0.07, z0 + i * pw + 0.07, z0 + (i + 1) * pw - 0.07,
        xw + 0.36, pc, em, 1);
    }
  }
  // 铅条
  for (let i = 0; i <= NX; i++) BX(b, xw + 0.42, yc, z0 + i * pw, 0.08, y1 - y0, 0.075, K.tealDk, M.dark);
  for (let j = 0; j <= NY; j++) BX(b, xw + 0.42, y0 + j * ph, zc, 0.08, 0.075, z1 - z0, K.tealDk, M.dark);
  // 中央两条大鱼（玻璃镶嵌，YZ 平面）
  const FISH = [[xw + 0.46, 8.5, 14.1, 1, mixc(K.cream, K.gold, 0.35), K.coralDk], [xw + 0.46, 8.0, 10.9, -1, mixc(K.cream, K.coral, 0.3), K.coral]];
  for (const [fx, fy, fz, dir, cb, cf] of FISH) {
    EL(b, fx, fy, fz, 0.1, 0.62, 1.5, 10, 5, cb, [0.22, 0.55]);
    EL(b, fx + 0.1, fy - 0.2, fz, 0.05, 0.28, 1.15, 8, 4, mulc(cb, 1.25), [0.24, 0.45]);
    const tip = fz - dir * 1.35;
    b.tri([fx, fy, tip], [fx, fy + 0.75, tip - dir * 0.95], [fx, fy - 0.72, tip - dir * 0.9], cf, [0.24, 0.55], [1, 0, 0], [1, 0, 0], [1, 0, 0]);
    b.tri([fx, fy + 0.6, fz - dir * 0.2], [fx, fy + 1.15, fz + dir * 0.25], [fx, fy + 0.5, fz + dir * 0.35], cf, [0.24, 0.55], [1, 0, 0], [1, 0, 0], [1, 0, 0]);
    SP(b, fx + 0.12, fy + 0.14, fz + dir * 0.95, 0.11, K.tealDk, M.dark, { rings: 2, seg: 4 });
    for (let i = 0; i < 3; i++) SP(b, fx + 0.12, fy - 0.05 + i * 0.16, fz - dir * (0.4 + i * 0.25), 0.08, mulc(cb, 1.3), [0.26, 0.45], { rings: 2, seg: 4 });
  }
  // 玻璃气泡
  for (let i = 0; i < 7; i++) {
    SP(b, xw + 0.48, rr(5.2, 11.6), rr(9.2, 16.2), rr(0.09, 0.2), mixc(K.glassB, K.cream, 0.4), [0.34, 0.5], { rings: 2, seg: 5 });
  }
  // 灯箱前的小铜壁灯
  for (const zz of [z0 + 0.6, z1 - 0.6]) {
    BX(b, xw + 0.66, y0 + 0.4, zz, 0.16, 0.44, 0.16, K.gold, M.gold);
    SP(b, xw + 0.66, y0 + 0.64, zz, 0.16, mixc(K.paper, K.goldHi, 0.4), [0.5, 0.25], { rings: 2, seg: 5 });
  }

  item(); // 37 左墙斗柜
  BX(b, -18.0, 1.3, 3.9, 2.05, 2.6, 4.2, K.cream, M.cream, { topCol: K.wood });
  BX(b, -18.0, 2.62, 3.9, 2.2, 0.12, 4.4, K.teal, M.teal);
  for (let i = 0; i < 2; i++) {
    BX(b, -16.99, 1.75 - i * 1.0, 3.9, 0.06, 0.8, 3.5, K.teal, M.teal);
    SP(b, -16.93, 1.75 - i * 1.0, 2.6, 0.1, K.goldHi, M.gold, { rings: 2, seg: 5 });
    SP(b, -16.93, 1.75 - i * 1.0, 5.2, 0.1, K.goldHi, M.gold, { rings: 2, seg: 5 });
  }
  item(); // 38 斗柜上的陶罐与花
  LT(b, -18.2, 2.68, 2.55, [[0, 0], [0.3, 0], [0.36, 0.5], [0.26, 0.95], [0.18, 1.0]], 10, K.porcelain, M.ceramic);
  LT(b, -17.5, 2.68, 3.1, [[0, 0], [0.26, 0], [0.3, 0.32], [0.16, 0.62]], 10, K.coralLt, M.ceramic);
  LT(b, -18.3, 2.68, 4.7, [[0, 0], [0.34, 0], [0.38, 0.42], [0.2, 0.7], [0.22, 0.9]], 10, K.mint, M.ceramic);
  LT(b, -17.4, 2.68, 5.4, [[0, 0], [0.22, 0], [0.3, 0.28], [0.14, 0.54], [0.2, 0.72]], 12, K.glassB, M.glass);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU, ln = rr(1.2, 2.2);
    BAR(b, [-17.4, 3.3, 5.4], [-17.4 + Math.cos(a) * 0.5, 3.3 + ln, 5.4 + Math.sin(a) * 0.5], 0.04, 0.04, K.leafDk, M.leaf);
    SP(b, -17.4 + Math.cos(a) * 0.5, 3.3 + ln, 5.4 + Math.sin(a) * 0.5, 0.2, pickc([K.pink, K.coral, K.cream, K.goldHi]), M.leafSoft, { rings: 2, seg: 5, jitter: 0.3 });
  }
  CY(b, -18.4, 2.68, 4.05, 10, 0.2, 0.16, 0.5, K.gold, M.gold, { y0: 0 });
  CY(b, -18.4, 3.18, 4.05, 8, 0.1, 0.1, 0.5, K.cream, M.paper, { y0: 0 });
  SP(b, -18.4, 3.78, 4.05, 0.1, mixc(K.paper, K.goldHi, 0.4), [0.5, 0.25], { rings: 2, seg: 5 });
  item(); // 39 斗柜上方两幅挂画
  for (const [py, ph, pcol] of [[6.5, 3.0, K.cobalt], [9.6, 2.2, K.plum]]) {
    BX(b, -19.0, py, 3.9, 0.14, ph + 0.4, ph * 0.82 + 0.4, K.gold, M.gold);
    QYZ(b, py - ph / 2, py + ph / 2, 3.9 - ph * 0.36, 3.9 + ph * 0.36, -18.9, mixc(pcol, K.cream, 0.28), M.paint, 1);
    QYZ(b, py - ph * 0.3, py + ph * 0.1, 3.2, 4.6, -18.88, mixc(pcol, K.teal, 0.4), M.paint, 1);
    QYZ(b, py + ph * 0.16, py + ph * 0.22, 3.1, 4.7, -18.86, K.goldHi, M.paint, 1);
  }

  item(); // 40 窗边三脚架上的玻璃鱼缸（花鱼共养）
  const ax = -16.7, az = 22.4;
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU + 0.5;
    BAR(b, [ax + Math.cos(a) * 1.15, 0, az + Math.sin(a) * 1.15], [ax + Math.cos(a) * 0.5, 1.55, az + Math.sin(a) * 0.5], 0.16, 0.16, K.woodDk, M.woodDk);
  }
  CY(b, ax, 1.55, az, 16, 1.35, 1.3, 0.22, K.wood, M.wood, { y0: 0 });
  LT(b, ax, 1.7, az, [[0.0, 0], [0.7, 0.02], [1.12, 0.32], [1.25, 0.75], [1.12, 1.22], [0.86, 1.5], [0.72, 1.56]], 16, K.glassB, M.glass);
  DS(b, ax, 2.32, az, 1.1, 16, K.water, M.water);
  DS(b, ax, 1.92, az, 1.0, 12, mixc(K.soil, K.creamDk, 0.25), M.stone);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU, r0 = rr(0.2, 0.8);
    BAR(b, [ax + Math.cos(a) * r0, 1.95, az + Math.sin(a) * r0], [ax + Math.cos(a) * r0 * 1.2, 2.75, az + Math.sin(a) * r0 * 1.2], 0.05, 0.05, K.leafDk, M.leaf);
    SP(b, ax + Math.cos(a) * r0 * 1.2, 2.78, az + Math.sin(a) * r0 * 1.2, 0.2, pickc([K.pink, K.coral, K.cream]), M.leafSoft, { rings: 2, seg: 5, jitter: 0.25 });
  }
  for (const [fx, fy, fz] of [[ax + 0.4, 2.2, az - 0.35], [ax - 0.45, 2.12, az + 0.3]]) {
    atY(b, fx, fy, fz, rr(0, TAU), () => {
      EL(b, 0, 0, 0, 0.3, 0.13, 0.08, 7, 4, K.coral, M.paint);
      b.tri([-0.26, 0, 0], [-0.45, 0.16, 0], [-0.45, -0.16, 0], K.coralDk, M.paint, [0, 1, 0], [0, 1, 0], [0, 1, 0]);
    });
  }
  item(); // 41 左窗角的大盆栽
  LT(b, -18.2, 0, 20.2, [[0, 0], [0.95, 0], [1.1, 0.75], [1.0, 1.35], [1.15, 1.5]], 14, K.teal, M.ceramic);
  DS(b, -18.2, 1.4, 20.2, 1.0, 14, K.soil, M.stone);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const hx = -18.2 + Math.cos(a) * rr(0.4, 1.0), hz = 20.2 + Math.sin(a) * rr(0.4, 1.0);
    BAR(b, [-18.2, 1.4, 20.2], [hx, 3.0 + rr(0, 1.8), hz], 0.1, 0.1, K.leafDk, M.leaf);
    SP(b, hx, 3.2 + rr(0, 1.8), hz, rr(0.45, 0.72), mixc(K.leafDk, K.leafLt, rnd()), M.leafSoft, { rings: 3, seg: 5, jitter: 0.3, seed: i + 21 });
  }
  item(); // 42 卷起画布的藤筐
  LT(b, -17.6, 0, 18.5, [[0, 0], [0.9, 0], [1.0, 0.9], [0.85, 1.1]], 12, K.wood, M.wood);
  for (let i = 0; i < 4; i++) {
    atZ(b, -17.9 + i * 0.28, 1.5, 18.5 + (i % 2) * 0.2, rr(-0.2, 0.2), () => CY(b, 0, 0, 0, 8, 0.17, 0.17, 2.6, i % 2 ? K.paper : K.creamDk, M.paper, { y0: 0 }));
  }
  item(); // 43 左墙小搁板 + 颜料罐
  for (const [sy, sz] of [[6.0, 21.6], [8.4, 21.6]]) BX(b, -18.7, sy, sz, 0.7, 0.14, 3.0, K.wood, M.wood);
  for (let i = 0; i < 4; i++) CY(b, -18.7, 6.1, 20.5 + i * 0.75, 10, 0.24, 0.2, 0.5, [K.teal, K.coral, K.gold, K.plum][i], M.metal, { y0: 0 });
  for (let i = 0; i < 3; i++) SP(b, -18.7, 8.55, 20.7 + i * 0.9, 0.26, [K.porcelain, K.coralLt, K.mint][i], M.ceramic, { rings: 3, seg: 6, jitter: 0.08 });
}
// ============================================================ 右墙：字母书架 + 地球仪 + 梯子
function buildRightWall(b) {
  const xw = 19.05, z0 = 6.8, z1 = 18.6;
  item(); // 44 字母书架主体
  BX(b, xw - 0.12, 5.7, (z0 + z1) / 2, 0.24, 11.4, z1 - z0, K.tealDk, M.tealDk);
  for (const sz of [z0, z1]) BX(b, 17.65, 5.7, sz, 2.9, 11.4, 0.3, K.teal, M.teal);
  BX(b, 17.65, 0.15, (z0 + z1) / 2, 2.9, 0.3, z1 - z0, K.tealDk, M.tealDk);
  BX(b, 17.65, 11.32, (z0 + z1) / 2, 3.1, 0.34, z1 - z0 + 0.3, K.wood, M.wood, { topCol: K.creamDk });
  const shelfY = [1.55, 3.65, 5.75, 7.85, 9.95];
  for (const sy of shelfY) BX(b, 17.65, sy, (z0 + z1) / 2, 2.85, 0.22, z1 - z0 - 0.5, K.wood, M.wood, { topCol: mulc(K.creamDk, 1.05) });
  for (const dz of [9.55, 12.35, 15.15]) BX(b, 17.65, 5.7, dz, 2.8, 10.9, 0.18, K.teal, M.teal);
  for (let i = 0; i < 4; i++) BX(b, xw - 0.24, 5.7, z0 + 1.6 + i * 2.9, 0.06, 10.6, 0.5, K.creamDk, M.cream);

  item(); // 45 一层层书（四层）
  const bookCols = [rgb('#8a4a3c'), rgb('#3d6b64'), rgb('#c9b98a'), rgb('#a9762e'), rgb('#5d5a86'),
    rgb('#a8687a'), rgb('#6b7f4a'), rgb('#7a5a3a'), rgb('#3f5d7a'), rgb('#9c8a6a'), K.ruby, K.teal];
  for (let li = 0; li < 4; li++) {
    const sy = shelfY[li] + 0.11;
    const bays = [[z0 + 0.4, 9.45], [9.75, 12.25], [12.55, 15.05], [15.35, z1 - 0.4]];
    for (const [bz0, bz1] of bays) {
      let z = bz0;
      while (z < bz1 - 0.38) {
        const w = rr(0.3, 0.5), h = rr(0.85, 1.5), dep = rr(0.75, 1.0);
        const bc = bookCols[Math.floor(rnd() * bookCols.length)];
        BX(b, 17.55 - (1 - dep) * 0.3, sy + h / 2, z + w / 2, 0.95 * dep, h, w * 0.92, bc, M.paper, { topCol: mulc(bc, 1.12) });
        if (rnd() < 0.6) BX(b, 17.05 - (1 - dep) * 0.3, sy + h * 0.8, z + w / 2, 0.03, 0.05, w * 0.7, K.goldHi, M.gold);
        if (rnd() < 0.3) BX(b, 17.05 - (1 - dep) * 0.3, sy + h * 0.35, z + w / 2, 0.03, 0.04, w * 0.5, mulc(K.cream, 0.8), M.paper);
        z += w + rr(0.02, 0.1);
      }
    }
  }
  // 横放在书堆上的书
  for (let i = 0; i < 3; i++) {
    const bx = 17.55, bz = 10.7 + i * 3.0;
    for (let k = 0; k < 3; k++) BX(b, bx, shelfY[1] + 0.22 + k * 0.26, bz + k * 0.06, 1.05, 0.24, 1.5 - k * 0.12, bookCols[(i * 3 + k) % bookCols.length], M.paper);
  }
  item(); // 46 字母书挡 A B C D
  const letters = [[7.3, 'A', K.teal], [10.6, 'B', K.coral], [13.4, 'C', K.gold], [16.4, 'D', K.plum]];
  const ly = 10.06;
  for (const [lz, ch, lc] of letters) {
    BX(b, 17.5, ly + 0.06, lz, 0.9, 0.12, 1.5, K.woodDk, M.woodDk);
    if (ch === 'A') {
      BAR(b, [17.45, ly + 0.1, lz - 0.55], [17.45, ly + 1.5, lz], 0.24, 0.24, lc, M.ceramic);
      BAR(b, [17.45, ly + 0.1, lz + 0.55], [17.45, ly + 1.5, lz], 0.24, 0.24, lc, M.ceramic);
      BAR(b, [17.45, ly + 0.72, lz - 0.3], [17.45, ly + 0.72, lz + 0.3], 0.2, 0.2, lc, M.ceramic);
    } else if (ch === 'B') {
      BAR(b, [17.45, ly + 0.1, lz - 0.45], [17.45, ly + 1.5, lz - 0.45], 0.24, 0.24, lc, M.ceramic);
      EL(b, 17.45, ly + 1.18, lz - 0.05, 0.14, 0.3, 0.42, 8, 4, lc, M.ceramic);
      EL(b, 17.45, ly + 0.5, lz - 0.05, 0.14, 0.28, 0.42, 8, 4, lc, M.ceramic);
    } else if (ch === 'C') {
      BAR(b, [17.45, ly + 1.42, lz - 0.5], [17.45, ly + 1.42, lz + 0.5], 0.24, 0.24, lc, M.ceramic);
      BAR(b, [17.45, ly + 0.16, lz - 0.5], [17.45, ly + 0.16, lz + 0.5], 0.24, 0.24, lc, M.ceramic);
      BAR(b, [17.45, ly + 0.16, lz - 0.5], [17.45, ly + 1.42, lz - 0.5], 0.24, 0.24, lc, M.ceramic);
    } else {
      BAR(b, [17.45, ly + 0.1, lz - 0.5], [17.45, ly + 1.5, lz - 0.5], 0.24, 0.24, lc, M.ceramic);
      EL(b, 17.45, ly + 0.8, lz + 0.1, 0.14, 0.62, 0.6, 8, 4, lc, M.ceramic);
    }
  }

  item(); // 47 地球仪
  BX(b, 17.4, 10.1, 15.9, 1.0, 0.12, 1.0, K.woodDk, M.woodDk);
  CY(b, 17.4, 10.16, 15.9, 10, 0.12, 0.1, 0.5, K.gold, M.gold, { y0: 0 });
  SP(b, 17.4, 11.6, 15.9, 0.62, K.blue, M.paint, {
    rings: 5, seg: 8, jitter: 0.03, seed: 9,
    colFn: (v) => (v > 0.55 ? K.cream : v > 0.3 ? mixc(K.blue, K.mint, 0.35) : K.blue),
  });
  atZ(b, 17.4, 11.6, 15.9, 0.25, () => TR(b, 0, 0, 0, 0.68, 0.05, 16, 2, K.goldHi, M.gold, 'z'));
  TR(b, 17.4, 11.16, 15.9, 0.42, 0.06, 12, 2, K.gold, M.gold, 'y');

  item(); // 48 玻璃鱼缸（书架层）
  LT(b, 17.4, 5.86, 11.1, [[0, 0], [0.55, 0], [0.72, 0.3], [0.78, 0.7], [0.7, 0.95]], 14, K.glassB, M.glass);
  DS(b, 17.4, 6.62, 11.1, 0.66, 14, K.water, M.water);
  for (const [fx, fy, fz] of [[17.55, 6.5, 10.9], [17.2, 6.42, 11.35]]) {
    atY(b, fx, fy, fz, rr(0, TAU), () => {
      EL(b, 0, 0, 0, 0.26, 0.11, 0.07, 6, 4, K.orange, M.paint);
      b.tri([-0.22, 0, 0], [-0.4, 0.14, 0], [-0.4, -0.14, 0], K.coralDk, M.paint, [0, 1, 0], [0, 1, 0], [0, 1, 0]);
    });
  }
  for (let i = 0; i < 5; i++) SP(b, 17.4 + rr(-0.5, 0.5), 6.2, 11.1 + rr(-0.5, 0.5), rr(0.06, 0.13), pickc([K.coral, K.cream, K.teal]), M.ceramic, { rings: 2, seg: 4 });

  item(); // 49 书架上的陶罐与蜡烛
  for (let i = 0; i < 4; i++) LT(b, 17.5, shelfY[2] + 0.11, 7.3 + i * 0.7, [[0, 0], [0.3, 0], [0.34, 0.42], [0.2, 0.66]], 10, [K.porcelain, K.coralLt, K.mint, K.cream][i], M.ceramic);
  CY(b, 17.5, shelfY[3] + 0.11, 7.2, 8, 0.18, 0.18, 0.5, K.cream, M.paper, { y0: 0 });
  SP(b, 17.5, shelfY[3] + 0.66, 7.2, 0.11, mixc(K.paper, K.goldHi, 0.4), [0.5, 0.25], { rings: 2, seg: 5 });
  // 书架上方的三联挂画（填补 +x 墙上部）
  item(); // 50 书架上方三联画
  const framePaint = [[8.6, K.cobalt], [12.6, K.teal], [16.6, K.ruby]];
  for (const [fz, fc] of framePaint) {
    BX(b, 19.0, 13.8, fz, 0.16, 3.2, 2.6, K.gold, M.gold);
    QYZ(b, 12.35, 15.25, fz - 1.05, fz + 1.05, 18.88, mixc(fc, K.cream, 0.25), M.paint, -1);
    QYZ(b, 12.6, 13.6, fz - 0.9, fz + 0.9, 18.86, mixc(fc, K.tealDk, 0.4), M.paint, -1);
    SP(b, 18.84, 14.6, fz + 0.3, 0.22, K.goldHi, M.glowSoft, { rings: 2, seg: 5 });
  }

  item(); // 51 靠墙的梯子
  BAR(b, [16.9, 0, 20.9], [18.95, 8.4, 19.2], 0.18, 0.18, K.wood, M.wood);
  BAR(b, [17.7, 0, 20.9], [18.95, 8.4, 20.1], 0.18, 0.18, K.wood, K.wood && M.wood);
  for (let i = 0; i < 7; i++) {
    const t = (i + 0.5) / 7;
    BAR(b, [16.9 + (18.95 - 16.9) * t, 8.4 * t, 20.9 + (19.2 - 20.9) * t],
      [17.7 + (18.95 - 17.7) * t, 8.4 * t, 20.9 + (20.1 - 20.9) * t], 0.1, 0.1, K.woodDk, M.woodDk);
  }
  item(); // 52 梯子旁的画框堆
  for (let i = 0; i < 3; i++) {
    atY(b, 17.6, 0.9, 21.9, rr(-0.1, 0.1), () => {
      atZ(b, 0, 0, 0, -0.1 - i * 0.04, () => {
        BX(b, 0, 0, 0, 0.2, 2.4, 1.9, K.gold, M.gold);
        QYZ(b, -1.0, 1.0, -0.78, 0.78, -0.11, [K.teal, K.coralLt, K.mint][i], M.paint, -1);
      });
    });
  }

  item(); // 53 门边墙上大画：行星与海（+x 墙）
  BX(b, 19.0, 7.4, 3.3, 0.16, 3.5, 4.7, K.gold, M.gold);
  QYZ(b, 5.7, 9.1, 1.05, 5.55, 18.9, rgb('#1d2a58'), M.paint, -1);
  DISCYZ(b, 18.88, 7.9, 3.3, 1.35, 18, C.planetA, M.paint, -1);
  DISCYZ(b, 18.87, 7.55, 3.25, 1.05, 16, mixc(C.planetA, C.planetB, 0.45), M.paint, -1);
  DISCYZ(b, 18.86, 8.06, 3.36, 1.18, 16, rgb('#1d2a58'), M.paint, -1);
  RINGYZ(b, 18.885, 7.4, 3.3, 1.75, 0.5, 0.16, 20, C.ringA, M.paint, -1);
  EL(b, 18.86, 6.3, 3.0, 0.1, 0.32, 1.05, 8, 4, C.whaleBody, M.paint);
  EL(b, 18.85, 6.2, 3.0, 0.06, 0.16, 0.8, 8, 4, C.whaleBelly, M.paint);
  b.tri([18.86, 6.25, 1.9], [18.86, 6.55, 1.25], [18.86, 5.95, 1.45], C.whaleFin, M.paint, [-1, 0, 0], [-1, 0, 0], [-1, 0, 0]);
  for (let i = 0; i < 8; i++) SP(b, 18.86, rr(6.0, 8.8), rr(1.4, 5.2), rr(0.03, 0.07), K.paper, M.glowHi, { rings: 2, seg: 4 });

  item(); // 54 门边矮几 + 颜料罐 + 靠墙画布
  BX(b, 17.9, 1.55, 3.6, 2.1, 0.18, 3.4, K.wood, M.wood, { topCol: K.creamDk });
  for (const sz of [-1, 1]) BAR(b, [17.1, 0, 3.6 + sz * 1.3], [17.1, 1.5, 3.6 + sz * 1.3], 0.14, 0.14, K.teal, M.teal);
  BAR(b, [18.6, 0, 2.4], [18.6, 1.5, 4.8], 0.14, 0.14, K.teal, M.teal);
  for (let i = 0; i < 4; i++) {
    CY(b, 17.6, 1.64, 2.5 + i * 0.7, 10, 0.22, 0.18, 0.5, [K.teal, K.coral, K.gold, K.plum][i], M.metal, { y0: 0 });
  }
  LT(b, 18.2, 1.64, 4.4, [[0, 0], [0.2, 0], [0.26, 0.4], [0.14, 0.52]], 10, K.porcelain, M.ceramic);
  for (let i = 0; i < 3; i++) {
    atZ(b, 17.9, 1.7, 5.5 + i * 0.16, -0.08 - i * 0.05, () => {
      BX(b, -0.15, 0, 0, 0.16, 3.6 + i * 0.3, 2.5 + i * 0.25, K.gold, M.gold);
      QYZ(b, -1.4, 1.4, -1.0, 1.0, -0.25, [K.cobalt, K.coralLt, K.mint][i], M.paint, -1);
      QYZ(b, -0.3, 0.9, -0.7, 0.7, -0.27, [K.teal, K.gold, K.plum][i], M.paint, -1);
    });
  }
}
// ============================================================ 门墙：星星贴纸 + 镜子 + 衣帽 + 门垫
function buildDoorWall(b) {
  item(); // 52 门墙星星贴纸
  const stars = [[-10.6, 10.6, 1.0, K.goldHi], [-8.4, 13.4, 0.7, K.mint], [-12.6, 6.6, 0.8, K.pinkLt],
  [-15.2, 11.2, 0.6, K.glassB], [10.4, 11.4, 0.9, K.goldHi], [8.3, 6.4, 0.65, K.pinkLt],
  [12.8, 8.8, 0.75, K.mint], [11.2, 14.0, 0.6, K.violet], [14.6, 6.2, 0.55, K.coralLt], [-9.6, 16.2, 0.8, K.glassB]];
  for (const [sx, sy, sr, sc] of stars) {
    STARXY(b, sx, sy, 0.1, sr, sr * 0.44, 5, sc, M.glowSoft, 1);
    STARXY(b, sx, sy, 0.16, sr * 0.72, sr * 0.32, 5, mulc(sc, 1.15), M.glow, 1);
  }
  item(); // 53 门上方的三角彩旗
  const gp = catenary([-16.5, 15.7, 0.35], [16.5, 15.7, 0.35], 1.0, 16);
  TUB(b, gp, 0.05, 3, K.creamDk, M.paper);
  for (let i = 1; i < gp.length - 1; i++) {
    const p = gp[i];
    const pc = [K.coral, K.teal, K.goldHi, K.mint, K.pinkLt, K.violet][i % 6];
    b.tri([p[0] - 0.34, p[1], 0.4], [p[0] + 0.34, p[1], 0.4], [p[0], p[1] - 0.75, 0.4], pc, M.paint, [0, 0, 1], [0, 0, 1], [0, 0, 1]);
  }
  item(); // 54 铜框椭圆镜
  TR(b, -13.2, 8.3, 0.28, 2.3, 0.22, 22, 4, K.gold, M.gold, 'z');
  DISCXY(b, -13.2, 8.3, 0.2, 2.15, 24, K.glassB, M.mirror, 1);
  DISCXY(b, -13.2, 8.3, 0.19, 1.8, 20, mixc(K.glassB, K.cream, 0.45), M.mirror, 1);
  // 镜框上挂的小挂件
  TUB(b, [[-13.2, 10.6, 0.3], [-13.2, 9.6, 0.4], [-12.9, 8.8, 0.4]], 0.035, 3, K.gold, M.metal);
  SP(b, -12.9, 8.6, 0.42, 0.18, K.coral, M.ceramic, { rings: 2, seg: 5 });

  item(); // 55 衣帽钩 + 画师围裙 + 草帽
  for (let i = 0; i < 3; i++) {
    const hx = -9.4 + i * 1.2;
    BX(b, hx, 9.5, 0.16, 0.7, 0.16, 0.16, K.gold, M.gold);
    SP(b, hx + 0.34, 9.5, 0.3, 0.13, K.goldHi, M.gold, { rings: 2, seg: 5 });
  }
  atY(b, -9.6, 7.0, 0.42, 0.06, () => {
    BX(b, 0, 0, 0, 1.9, 4.6, 0.2, K.coral, M.wool, { topCol: mulc(K.coral, 1.05) });
    BX(b, -0.55, -1.3, 0.14, 0.8, 0.7, 0.08, K.coralDk, M.wool);
    BX(b, 0.55, -1.3, 0.14, 0.8, 0.7, 0.08, K.coralDk, M.wool);
    for (let i = 0; i < 5; i++) SP(b, rr(-0.75, 0.75), rr(-2.1, 1.8), 0.13, rr(0.05, 0.11), pickc([K.teal, K.cream, K.gold, K.violet]), M.paint, { rings: 2, seg: 4 });
    // 系带
    BAR(b, [-0.6, 2.3, 0], [-0.75, 3.1, 0.1], 0.1, 0.1, K.coral, M.wool);
    BAR(b, [0.6, 2.3, 0], [0.75, 3.1, 0.1], 0.1, 0.1, K.coral, M.wool);
  });
  BX(b, -12.7, 8.9, 0.3, 1.2, 2.2, 0.16, K.cream, M.wool);
  // 草帽
  atY(b, 9.9, 9.0, 0.35, 0.2, () => {
    CY(b, 0, 0, 0, 14, 1.0, 1.0, 0.1, K.creamDk, M.paper, { y0: 0 });
    CY(b, 0, 0.1, 0, 12, 0.55, 0.42, 0.5, K.creamDk, M.paper, { y0: 0 });
    TR(b, 0, 0.22, 0, 0.52, 0.07, 12, 2, K.coral, M.wool, 'y');
  });

  item(); // 56 软木告示板 + 画稿
  BX(b, 12.4, 7.4, 0.14, 4.4, 3.2, 0.16, K.wood, M.wood, { topCol: K.creamDk });
  BX(b, 12.4, 7.4, 0.24, 4.0, 2.8, 0.06, mixc(K.woodDk, K.creamDk, 0.55), M.wood);
  for (let i = 0; i < 6; i++) {
    const px = 11.0 + (i % 3) * 1.4, py = 6.5 + Math.floor(i / 3) * 1.5;
    atY(b, px, py, 0.3, rr(-0.18, 0.18), () => {
      QXY(b, -0.55, 0.55, -0.7, 0.7, 0, K.paper, M.paper, 1);
      for (let k = 0; k < 3; k++) BAR(b, [-0.4, 0.3 - k * 0.28, 0.02], [0.4, 0.32 - k * 0.28, 0.02], 0.02, 0.02, mulc(K.black, 1.3), M.paper);
      SP(b, 0.55, 0.7, 0.06, 0.06, K.coral, M.paint, { rings: 2, seg: 4 });
    });
  }
  item(); // 57 门垫
  BX(b, 0, 0.05, 2.1, 4.4, 0.1, 2.2, K.teal, M.wool, { topCol: mulc(K.teal, 1.15) });
  for (let i = 0; i < 3; i++) BX(b, 0, 0.11, 1.3 + i * 0.8, 4.0, 0.06, 0.3, i % 2 ? K.cream : K.coral, M.wool);
  item(); // 58 拖鞋两双
  for (const [sx, sz, sc, rot] of [[-3.6, 20.0, K.pink, 0.3], [5.4, 21.0, K.glassB, -0.2]]) {
    for (let k = 0; k < 2; k++) {
      atY(b, sx + k * 0.7, 0.14, sz + k * 0.16, rot + k * 0.12, () => {
        EL(b, 0, 0, 0, 0.46, 0.13, 0.72, 8, 4, sc, M.wool);
        SP(b, 0, 0.1, -0.42, 0.28, mulc(sc, 1.1), M.wool, { rings: 2, seg: 5 });
        BX(b, 0, 0.16, 0.1, 0.7, 0.1, 0.3, mulc(sc, 0.9), M.wool);
      });
    }
  }
  item(); // 59 地上的画稿与铅笔
  for (let i = 0; i < 6; i++) {
    atY(b, rr(-16, 16), 0.03, rr(9.5, 19.5), rr(0, TAU), () => {
      QXZ(b, -0.75, 0.75, -0.95, 0.95, 0, K.paper, M.paper);
      for (let k = 0; k < 3; k++) QXZ(b, -0.5, 0.5, -0.6 + k * 0.45, -0.58 + k * 0.45, 0.01, mulc(K.creamDk, 0.7), M.paper);
    });
  }
  for (let i = 0; i < 4; i++) {
    atY(b, rr(-14, 14), 0.07, rr(11, 19), rr(0, TAU), () => BX(b, 0, 0, 0, 0.75, 0.06, 0.06, pickc([K.gold, K.coral, K.teal]), M.paint));
  }
  item(); // 60 青绿浇水壶
  atY(b, -2.8, 0, 19.6, 0.5, () => {
    LT(b, 0, 0, 0, [[0, 0], [0.5, 0], [0.56, 0.5], [0.4, 0.8]], 12, K.tealLt, M.metal);
    BAR(b, [0.4, 0.5, 0], [1.4, 1.1, 0], 0.12, 0.12, K.tealLt, M.metal);
    SP(b, 1.45, 1.15, 0, 0.2, K.tealLt, M.metal, { rings: 2, seg: 5 });
    TR(b, -0.3, 0.6, 0, 0.4, 0.06, 10, 2, K.tealDk, M.metal, 'z');
  });

  item(); // 61 门墙右段：三联小画
  for (const [fx, fy, fw, fh, fc] of [[15.9, 6.4, 1.5, 1.9, K.cobalt], [17.9, 6.7, 1.4, 2.2, K.coral], [16.9, 9.3, 1.9, 1.4, K.teal]]) {
    BX(b, fx, fy, 0.12, fw + 0.32, fh + 0.32, 0.14, K.gold, M.gold);
    QXY(b, fx - fw / 2, fx + fw / 2, fy - fh / 2, fy + fh / 2, 0.21, mixc(fc, K.cream, 0.3), M.paint, 1);
    QXY(b, fx - fw / 3, fx + fw / 3, fy - fh / 6, fy + fh / 4, 0.22, mixc(fc, K.tealDk, 0.35), M.paint, 1);
    SP(b, fx + fw * 0.25, fy + fh * 0.24, 0.23, 0.11, K.goldHi, M.glowSoft, { rings: 2, seg: 5 });
  }
  // 门墙左段：壁板压条 + 搁板 + 小陶罐
  item(); // 62 门墙左段壁板与搁板
  for (const [x0, x1, y0, y1] of [[-18.8, -15.6, 5.2, 11.6]]) {
    BX(b, (x0 + x1) / 2, y0, 0.12, x1 - x0, 0.16, 0.1, K.cream, M.trim);
    BX(b, (x0 + x1) / 2, y1, 0.12, x1 - x0, 0.16, 0.1, K.cream, M.trim);
    BX(b, x0, (y0 + y1) / 2, 0.12, 0.16, y1 - y0, 0.1, K.cream, M.trim);
    BX(b, x1, (y0 + y1) / 2, 0.12, 0.16, y1 - y0, 0.1, K.cream, M.trim);
    BX(b, (x0 + x1) / 2, (y0 + y1) / 2, 0.1, x1 - x0 - 0.4, y1 - y0 - 0.4, 0.06, mixc(K.wallDk, K.cream, 0.25), M.wall);
  }
  BX(b, -17.2, 4.5, 0.22, 2.8, 0.16, 0.56, K.wood, M.wood);
  for (let i = 0; i < 3; i++) LT(b, -18.2 + i * 1.0, 4.58, 0.28, [[0, 0], [0.2, 0], [0.24, 0.36], [0.14, 0.5]], 10, [K.porcelain, K.coralLt, K.mint][i], M.ceramic);
  item(); // 63 门墙上的干花串
  for (let i = 0; i < 3; i++) {
    const gx = -11.6 + i * 1.1;
    TUB(b, [[gx, 13.6, 0.28], [gx + 0.15, 11.6, 0.3], [gx - 0.1, 9.4, 0.3]], 0.035, 3, K.woodDk, M.leaf);
    for (let k = 0; k < 4; k++) SP(b, gx + Math.sin(k * 1.7) * 0.2, 13.0 - k * 1.1, 0.32, 0.16, pickc([K.pink, K.cream, K.goldHi, K.coralLt]), M.leafSoft, { rings: 2, seg: 5, jitter: 0.3 });
  }
  // 地面上的小颜料点（画室的生活痕迹）
  item(); // 64 地面颜料点
  for (let i = 0; i < 9; i++) {
    const px = rr(-9, 12), pz = rr(12, 20);
    atY(b, px, 0.03, pz, rr(0, TAU), () => {
      DS(b, 0, 0, 0, rr(0.1, 0.26), 8, pickc([K.coral, K.teal, K.gold, K.plum, K.ruby]), M.paint);
    });
  }
}

// ============================================================ 顶：梁 + 主吊灯 + 干花花环
function buildCeiling(b) {
  item(); // 61 纵向顶梁
  for (const bx of [-12, 0, 12]) {
    BX(b, bx, 17.28, 13, 0.62, 0.42, 26, K.tealDk, M.tealDk, { topCol: K.teal, bottomCol: mulc(K.tealDk, 0.8) });
  }
  // 梁托
  for (const bz of [6.5, 13.0, 19.5]) {
    for (const bx of [-12, 0, 12]) {
      BX(b, bx, 16.95, bz, 0.9, 0.24, 0.5, K.creamDk, M.cream);
    }
  }
  item(); // 62 红罩主吊灯（廊桥正对）
  const px = 0, pz = 13.0;
  CY(b, px, 11.0, pz, 8, 0.06, 0.06, 6.3, K.woodDk, M.metal, { y0: 0 });
  CY(b, px, 17.2, pz, 10, 0.5, 0.4, 0.3, K.gold, M.gold, { y0: 0 });
  LT(b, px, 10.85, pz, [[0.34, 1.62], [1.15, 1.38], [1.95, 0.98], [2.5, 0.5], [2.72, 0.02], [2.6, -0.24]], 20, K.red, M.gloss, { smooth: true });
  TR(b, px, 10.62, pz, 2.66, 0.08, 20, 3, K.gold, M.gold, 'y');
  SP(b, px, 10.62, pz, 0.6, K.warmGlow || C.warmGlow, M.glowHi, { rings: 3, seg: 8, jitter: 0.03 });
  // 灯罩下的黄铜小珠
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    SP(b, px + Math.cos(a) * 2.55, 10.5, pz + Math.sin(a) * 2.55, 0.1, K.goldHi, M.gold, { rings: 2, seg: 4 });
  }
  item(); // 63 窗侧的珊瑚罩小吊灯
  CY(b, -7.0, 10.2, 22.4, 6, 0.05, 0.05, 7.2, K.woodDk, M.metal, { y0: 0 });
  LT(b, -7.0, 9.95, 22.4, [[0.24, 1.05], [0.8, 0.92], [1.35, 0.62], [1.62, 0.12], [1.55, -0.1]], 16, K.coral, M.gloss);
  TR(b, -7.0, 9.85, 22.4, 1.58, 0.06, 16, 2, K.gold, M.gold, 'y');
  SP(b, -7.0, 9.86, 22.4, 0.38, K.warmGlow || C.warmGlow, M.glowHi, { rings: 2, seg: 6 });
  item(); // 64 两道干花花环
  for (const gz of [6.5, 19.5]) {
    const gp = catenary([-18.2, 16.65, gz], [18.2, 16.65, gz], 0.95, 18);
    TUB(b, gp, 0.045, 3, K.woodDk, M.leaf);
    for (let i = 1; i < gp.length - 1; i += 1) {
      const p = gp[i];
      SP(b, p[0], p[1] - 0.14, p[2], rr(0.11, 0.19), pickc([K.pink, K.coralLt, K.cream, K.goldHi, K.mint]), M.leafSoft, { rings: 2, seg: 5, jitter: 0.3 });
    }
  }
  item(); // 65 窗墙两侧壁灯
  for (const s of [-1, 1]) {
    const sx = s * 17.1;
    BX(b, sx, 7.2, 25.82, 0.5, 1.4, 0.3, K.gold, M.gold);
    LT(b, sx, 7.85, 25.62, [[0.0, 0], [0.32, 0.04], [0.4, 0.34], [0.22, 0.52]], 10, K.creamDk, M.paper);
    SP(b, sx, 8.06, 25.6, 0.16, K.warmGlow || C.warmGlow, M.glowHi, { rings: 2, seg: 6 });
  }
  item(); // 66 天花板圆顶装饰画
  for (const cx of [-8, 8]) {
    DS(b, cx, 17.97, 9.8, 2.0, 20, mixc(K.cream, K.pink, 0.2), M.cream);
    DS(b, cx, 17.965, 9.8, 2.0, 20, K.goldHi, M.cream, { inner: 1.8 });
    STARXZ(b, cx, 17.955, 9.8, 1.5, 0.6, 8, K.gold, M.cream);
  }
}

// ============================================================ 主入口
export function buildPainterAssets(b, ctx) {
  ITEMS = 0;
  rnd = mulberry32(R.seed);   // 每次构建重置随机序列 → 确定性
  const S = {
    wallIn: rgb('#d38f7a'),
    wallInMat: M.wall,
    wallOut: rgb('#e8e2d2'),
    floor: rgb('#2c5c54'),
    floorTop: rgb('#2a5f56'),
    floorMat: M.stone,
    ceil: rgb('#e5d5b5'),
    ceilMat: [0.10, 0.14],
    trim: K.cream,
    trimMat: M.trim,
    skirting: K.teal,
    skirtingMat: M.teal,
    pilasterZ: [6.2, 19.2],
    pilasterCol: K.teal,
    pilasterMat: M.teal,
    beamCol: K.tealDk,
    beamMat: M.tealDk,
    mullions: 4,
    transomY: 8.7,
    mullionCol: mixc(K.teal, K.woodDk, 0.3),
    mullionMat: [0.06, 0.32],
    sillCol: mixc(K.cream, C.marble, 0.4),
    sillMat: [0.06, 0.30],
    revCol: mixc(K.cream, K.gold, 0.25),
  };
  buildRoomShell(b, ctx, R, S);

  buildFloor(b);
  buildWindowBed(b);
  buildHangings(b);
  buildEasel(b);
  buildDesk(b);
  buildLeftWall(b);
  buildRightWall(b);
  buildDoorWall(b);
  buildCeiling(b);

  // 门墙 / 窗墙的墙裙压条（在 shell 之后加，避开洞口）
  for (const [x0, x1] of [[-19.0, -6.6], [6.6, 19.0]]) {
    BX(b, (x0 + x1) / 2, 4.2, 0.12, x1 - x0, 0.22, 0.16, K.cream, M.trim);
    BX(b, (x0 + x1) / 2, 3.7, 0.1, x1 - x0, 0.16, 0.1, mulc(K.cream, 0.94), M.trim);
  }
  for (const [x0, x1] of [[-18.9, -15.4], [15.4, 18.9]]) {
    BX(b, (x0 + x1) / 2, 4.2, 25.88, x1 - x0, 0.22, 0.16, K.cream, M.trim);
  }

  // ---------------------------------------------------------------- 灯光（世界坐标！）
  const P = (x, y, z) => roomToWorld(R.cx, [x, y, z]);
  ctx.points.push({ p: P(0, 10.3, 13.0), col: mulc(C.warmGlow, 1.02), range: 44, int: 2.85 });
  ctx.points.push({ p: P(0, 8.6, 23.2), col: mixc(C.warmGlow, C.glass, 0.55), range: 32, int: 1.95 });
  ctx.points.push({ p: P(7.2, 3.6, 13.6), col: mulc(C.amber, 1.0), range: 16, int: 2.2 });
  ctx.points.push({ p: P(-17.2, 8.6, 12.6), col: mixc(C.warmGlow, C.lampRed, 0.35), range: 20, int: 2.3 });
  ctx.points.push({ p: P(0, 9.2, 2.2), col: mulc(C.warmGlow, 1.0), range: 28, int: 2.35 });
  ctx.points.push({ p: P(14.6, 8.2, 21.4), col: mixc(C.warmGlow, C.cyanGlow, 0.45), range: 24, int: 2.4 });

  // ---------------------------------------------------------------- 静态光斑 billboard
  const L = (p, size, alpha, shape, col, rot) => ctx.lanterns.push({ p, size, rot: rot || 0, alpha, shape, col });
  L(P(0, 10.3, 13.0), 4.6, 0.50, 1, mulc(C.warmGlow, 1.05));
  L(P(0, 10.3, 13.0), 1.8, 0.80, 0, mulc(C.warmGlow, 1.3));
  L(P(0, 9.0, 23.6), 6.0, 0.30, 0, mixc(C.glass, C.warmGlow, 0.35));
  L(P(7.2, 3.55, 13.6), 1.0, 0.45, 0, mulc(C.amber, 0.95));
  L(P(-17.4, 8.5, 12.6), 5.0, 0.40, 0, mixc(C.warmGlow, C.lampRed, 0.3));
  L(P(3.5, 11.8, 21.6), 3.4, 0.45, 1, mulc(C.cyanGlow, 1.0));
  L(P(3.5, 10.8, 21.6), 1.6, 0.55, 0, mulc(C.warmGlow, 1.2));
  // 纸灯笼的光
  for (const [lx, ly, lz] of [[10.3, 13.7, 17.2], [11.5, 12.1, 18.3], [9.5, 10.9, 18.8], [13.7, 11.5, 15.0], [12.2, 14.5, 14.2], [-14.6, 12.7, 16.6]]) {
    L(P(lx, ly, lz), 1.5, 0.42, 0, mixc(C.warmGlow, C.lampRed, 0.2));
  }
  L(P(0, 9.2, 2.2), 2.2, 0.35, 1, mulc(C.warmGlow, 1.0));
  L(P(-16.7, 2.7, 22.4), 1.3, 0.45, 0, mixc(C.glass, C.cyanGlow, 0.5));
  L(P(17.1, 7.8, 25.6), 1.6, 0.55, 0, mulc(C.warmGlow, 1.1));
  L(P(-17.1, 7.8, 25.6), 1.6, 0.55, 0, mulc(C.warmGlow, 1.1));
  L(P(-7.0, 9.9, 22.4), 2.0, 0.5, 1, mixc(C.warmGlow, C.lampRed, 0.25));

  ctx.props.roomPainter = { items: ITEMS, tris: b.i.length / 3 };
}

// 世界摆放（world.js 调这个）
export function buildPainterRoom(b, ctx) {
  b.push(roomFrame(R.cx));
  buildPainterAssets(b, ctx);
  b.pop();
}
