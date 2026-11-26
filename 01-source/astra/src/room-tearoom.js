// room-tearoom.js — ROUND 16 · 「丝绒茶厅」( THE VELVET TEAROOM ) 的室内内容模块。
//
// 只负责这一间房的**局部坐标**内容；外壳（墙/门洞/大窗/地台/顶板/线脚）由
// room-shell.js 提供，世界摆放由 world.js 用 roomFrame() 完成。
// 局部坐标：x ∈ [-W/2, W/2] = ±20，y ∈ [0, 18]，z ∈ [0, 26]
//   z = 0 房门墙（桥），z = 26 大窗墙（外面是巨行星）
//
// 美术方向（参考 68499618_p0.jpg「午后茶会」）：
//   猩红地毯 + 金线护墙板 + 绿丝绒（金边、抱枕）+ 白/黄铜茶桌 + 三层点心架 +
//   青花茶具 + 书堆卷轴 + 盆栽棕榈 + 鎏金边柜 + 红丝绒窗帘 + 金框肖像 + 黄铜烛台吊灯。
//   签名件 = 三层点心架 + 绿丝绒沙发角；构图 = 大窗是主角，窗前一排"迎向窗外"的座位。
// 家规：确定性（mulberry32 / R.seed，禁 Math.random、Date）、点光 ≤6（世界坐标）、
//   billboard ≤24、三角 14k–42k、材质 emissive ≤0.95 / gloss ≤1.0。
import {
  box, cylinder, lathe, sphere, bar3, torus, disc, ellipsoid, tubePath, ribbon,
  mulc, mixc, rgb, m4, TAU, mulberry32,
} from './engine.js';
import { C } from './palette.js';
import { roomEntry, roomFrame, roomToWorld } from './interiors-plan.js';
import { buildRoomShell } from './room-shell.js';

const R = roomEntry('tearoom');
const W = R.W, D = R.D, H = R.H;
const IX = W / 2 - 0.9;   // 侧墙内表面 |x| = 19.1（墙厚 0.9）
const ZW = D;             // 大窗墙内表面 z = 26

// ---------------------------------------------------------------- 色板
const PAL = {
  wall: rgb('#8d2b37'),      // 墙底：猩红
  wallDk: rgb('#641a26'),
  panel: rgb('#6c1f2b'),     // 护墙板面：比墙面深，读成凹板
  panelDk: rgb('#571722'),
  gold: rgb('#d8a855'),      // 黄铜
  goldHi: rgb('#f0d089'),
  goldDk: rgb('#966f33'),
  cream: rgb('#e0cd9f'),     // 奶油石（墙面/壁柱）
  creamDk: rgb('#ab9668'),   // 顶棚嵌板（离吊灯最近，压暗一档）
  bronze: rgb('#a8813f'),
  olive: rgb('#4b5138'),     // 参考图里墨绿-橄榄的木作
  oliveDk: rgb('#333827'),
  wood: rgb('#6a4527'),
  woodDk: rgb('#3a2415'),
  woodLight: rgb('#8a5d33'),
  velvet: rgb('#3e6b46'),    // 绿丝绒
  velvetDk: rgb('#2a4a31'),
  velvetHi: rgb('#537f5b'),
  crim: rgb('#a02a3a'),      // 地毯
  crimDk: rgb('#631724'),
  carpet: rgb('#8e2b39'),
  blue: rgb('#2b4a86'),      // 蓝色抱枕（参考图里那只）
  blueHi: rgb('#3f66ad'),
  porc: rgb('#d9e2ee'),      // 青花瓷
  porcBlue: rgb('#2a4f9c'),
  silver: rgb('#a4b0bc'),
  marble: rgb('#b7ab8e'),
  marbleDk: rgb('#9c9077'),
  flame: rgb('#ffd9a0'),
  candle: rgb('#eadcc0'),
  cake: rgb('#e8c78c'),
  choco: rgb('#4a2c1c'),
  cream2: rgb('#f2e0c0'),
  berry: rgb('#b03442'),
  pista: rgb('#9ec27a'),
  pink: rgb('#e88aa6'),
  tea: rgb('#a8662c'),
  leaf: C.leaf,
  leafLight: C.leafLight,
  leafDark: C.leafDark,
  soil: C.soil,
  ceramic: rgb('#b0a086'),
  paper: rgb('#efe6cc'),
  mirror: rgb('#cfe0ea'),
  cool: rgb('#bcd4ff'),
  red: rgb('#c0453f'),
};

// ---------------------------------------------------------------- 材质 [emissive, gloss]
const MT = {
  wall: [0.050, 0.12],
  panel: [0.060, 0.22],
  gold: [0.062, 0.86],
  goldSoft: [0.048, 0.58],
  goldDk: [0.050, 0.44],
  wood: [0.030, 0.32],
  woodDk: [0.025, 0.22],
  velvet: [0.050, 0.16],
  fabric: [0.045, 0.14],
  marble: [0.055, 0.62],
  porcelain: [0.070, 0.88],
  silver: [0.080, 0.92],
  glass: [0.140, 0.95],
  flame: [0.920, 0.25],
  glow: [0.560, 0.30],
  plant: [0.045, 0.16],
  ceramic: [0.060, 0.70],
  paper: [0.050, 0.20],
  cloth: [0.085, 0.12],
  dark: [0.040, 0.38],
  food: [0.070, 0.40],
  candle: [0.180, 0.20],
  mirror: [0.150, 0.90],
};

// ---------------------------------------------------------------- 小工具
const T = (x, y, z) => m4.translate([x, y, z]);
const RY = (a) => m4.rotY(a);
const RX = (a) => m4.rotX(a);
const RZ = (a) => m4.rotZ(a);
const at = (b, x, y, z, fn) => { b.push(T(x, y, z)); fn(); b.pop(); };
const atR = (b, x, y, z, ry, fn) => { b.push(T(x, y, z)); b.push(RY(ry)); fn(); b.pop(); b.pop(); };

// 朝上的水平四边形（显式法线，免得两面光照不一致）
function quadUp(b, x0, x1, z0, z1, y, col, mat) {
  b.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], col, mat, [0, 1, 0]);
}
// 局部 XY 平面、朝 +z 的四边形
function quadFace(b, x0, x1, y0, y1, z, col, mat) {
  b.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], col, mat, [0, 0, 1]);
}
// 竖直圆盘（朝 +z），用来画钟面 / 徽章
function discFace(b, r, seg, col, mat) {
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    b.tri([0, 0, 0], [Math.cos(a0) * r, Math.sin(a0) * r, 0], [Math.cos(a1) * r, Math.sin(a1) * r, 0], col, mat, [0, 0, 1], [0, 0, 1], [0, 0, 1]);
  }
}
// 平行四边形（地毯上的菱形 / 木片）
function quadFlat(b, cx, cy, cz, ax, az, bx, bz, col, mat) {
  b.quad([cx - ax, cy, cz - az], [cx + bx, cy, cz - bz], [cx + ax, cy, cz + az], [cx - bx, cy, cz + bz],
    col, mat, [0, 1, 0]);
}
// 矩形金框（局部 XY，朝 +z，向 +z 出挑 dep）
function frameZ(b, w, h, t, dep, col, mat, z0 = 0) {
  const zc = z0 + dep / 2;
  at(b, 0, h / 2 - t / 2, zc, () => box(b, w, t, dep, col, mat));
  at(b, 0, -h / 2 + t / 2, zc, () => box(b, w, t, dep, col, mat));
  at(b, -w / 2 + t / 2, 0, zc, () => box(b, t, h - 2 * t, dep, col, mat));
  at(b, w / 2 - t / 2, 0, zc, () => box(b, t, h - 2 * t, dep, col, mat));
}

// 一块护墙板：底色 + 外金框 + 内金线 + 中央菱形
function giltPanel(b, w, h, o = {}) {
  const t = o.t ?? 0.20;             // 外框宽
  const dep = o.dep ?? 0.15;         // 外框出挑
  const field = o.field ?? PAL.panel;
  const fieldMat = o.fieldMat ?? MT.panel;
  quadFace(b, -w / 2 + 0.04, w / 2 - 0.04, -h / 2 + 0.04, h / 2 - 0.04, 0.018, field, fieldMat);
  frameZ(b, w, h, t, dep, PAL.gold, MT.gold, 0.02);
  if (o.bead !== false) {
    frameZ(b, w - 2 * t - 0.02, h - 2 * t - 0.02, o.bt ?? 0.055, 0.075, PAL.goldHi, MT.gold, 0.05);
  }
  if (o.diamond !== false) {
    const dz = 0.06, s = o.ds ?? 0.30;
    b.quad([-s * 0.82, 0, dz], [0, s * 1.3, dz], [s * 0.82, 0, dz], [0, -s * 1.3, dz], PAL.goldDk, MT.goldSoft, [0, 0, 1]);
    // 上下各一颗小菱：一串三颗，读成金线雕花
    for (const sy of [-1, 1]) {
      const yy = sy * h * 0.24, s2 = s * 0.52;
      b.quad([-s2, yy, dz], [0, yy + s2 * 1.6, dz], [s2, yy, dz], [0, yy - s2 * 1.6, dz], PAL.goldDk, MT.goldSoft, [0, 0, 1]);
    }
  }
}

// 书脊一本书（局部原点 = 底面中心）
function bookAt(b, w, h, d, col) {
  at(b, 0, h / 2, 0, () => box(b, w, h, d, col, MT.paper, { topCol: mulc(col, 1.12), bottomCol: mulc(col, 0.7) }));
}

// ================================================================ 地面
function buildFloor(b, P) {
  const rnd = P.rnd;
  // 木地板拼条（地毯之外露出的一圈）
  for (let i = 0; i < 26; i++) {
    const z0 = i * 1.0;
    quadUp(b, -IX, IX, z0 + 0.03, z0 + 0.97, 0.012, i % 2 ? PAL.wood : PAL.woodLight, MT.wood);
  }
  // 沿墙一圈深色木压边
  for (const s of [-1, 1]) {
    quadUp(b, s * (IX - 1.1), s * IX, 0.1, ZW - 0.1, 0.02, PAL.woodDk, MT.woodDk);
  }
  quadUp(b, -IX, IX, 0.0, 1.1, 0.02, PAL.woodDk, MT.woodDk);
  quadUp(b, -IX, IX, ZW - 1.0, ZW, 0.02, PAL.woodDk, MT.woodDk);
  P.items++; // 拼花木地面

  // ---- 猩红地毯
  const cx0 = -15.6, cx1 = 15.6, cz0 = 2.4, cz1 = 24.4;
  quadUp(b, cx0, cx1, cz0, cz1, 0.030, PAL.carpet, MT.cloth);
  // 外圈金边 + 内圈细金线
  quadUp(b, cx0 + 0.18, cx1 - 0.18, cz0 + 0.18, cz0 + 0.44, 0.062, PAL.gold, MT.goldSoft);
  quadUp(b, cx0 + 0.18, cx1 - 0.18, cz1 - 0.44, cz1 - 0.18, 0.062, PAL.gold, MT.goldSoft);
  quadUp(b, cx0 + 0.18, cx0 + 0.44, cz0 + 0.44, cz1 - 0.44, 0.062, PAL.gold, MT.goldSoft);
  quadUp(b, cx1 - 0.44, cx1 - 0.18, cz0 + 0.44, cz1 - 0.44, 0.062, PAL.gold, MT.goldSoft);
  quadUp(b, cx0 + 0.95, cx1 - 0.95, cz0 + 0.95, cz0 + 1.08, 0.070, PAL.goldDk, MT.goldSoft);
  quadUp(b, cx0 + 0.95, cx1 - 0.95, cz1 - 1.08, cz1 - 0.95, 0.070, PAL.goldDk, MT.goldSoft);
  quadUp(b, cx0 + 0.95, cx0 + 1.08, cz0 + 1.08, cz1 - 1.08, 0.070, PAL.goldDk, MT.goldSoft);
  quadUp(b, cx1 - 1.08, cx1 - 0.95, cz0 + 1.08, cz1 - 1.08, 0.070, PAL.goldDk, MT.goldSoft);
  P.items++; // 猩红地毯 + 金边

  // ---- 地毯上的暗金菱格纹（织纹读法）
  for (let ix = 0; ix < 11; ix++) {
    const x = -13.2 + ix * 2.64;
    for (let iz = 0; iz < 9; iz++) {
      const z = 4.4 + iz * 2.2;
      if (Math.hypot(x, z - 13.4) < 3.6) continue;
      if (Math.hypot(x - 3.2, z - 20.8) < 2.2) continue;
      quadFlat(b, x, 0.082, z, 0.21, 0.18, 0.21, 0.18, mixc(PAL.goldDk, PAL.carpet, 0.30), MT.goldSoft);
    }
  }
  // 靠边一圈内金线（比整片格纹安静，地毯仍读成织物）
  quadUp(b, cx0 + 1.55, cx1 - 1.55, cz0 + 1.55, cz0 + 1.63, 0.076, PAL.goldDk, MT.goldSoft);
  quadUp(b, cx0 + 1.55, cx1 - 1.55, cz1 - 1.63, cz1 - 1.55, 0.076, PAL.goldDk, MT.goldSoft);
  quadUp(b, cx0 + 1.55, cx0 + 1.63, cz0 + 1.55, cz1 - 1.55, 0.076, PAL.goldDk, MT.goldSoft);
  quadUp(b, cx1 - 1.63, cx1 - 1.55, cz0 + 1.55, cz1 - 1.55, 0.076, PAL.goldDk, MT.goldSoft);
  for (let i = 0; i < 19; i++) {
    const x = cx0 + 1.2 + i * ((cx1 - cx0 - 2.4) / 18);
    quadFlat(b, x, 0.080, cz0 + 0.70, 0.20, 0.17, 0.20, 0.17, PAL.goldDk, MT.goldSoft);
    quadFlat(b, x, 0.080, cz1 - 0.70, 0.20, 0.17, 0.20, 0.17, PAL.goldDk, MT.goldSoft);
  }
  P.items++; // 地毯菱格纹 + 内金线

  // ---- 中央团花
  at(b, 0, 0.09, 13.4, () => {
    disc(b, 3.25, 24, mixc(PAL.carpet, PAL.crimDk, 0.5), MT.cloth);
    at(b, 0, 0.006, 0, () => torus(b, 3.05, 0.085, 24, 3, PAL.gold, MT.goldSoft, 'y'));
    at(b, 0, 0.008, 0, () => disc(b, 2.35, 24, mixc(PAL.carpet, PAL.crimDk, 0.7), MT.cloth));
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * TAU;
      const r0 = 1.15, r1 = 2.28;
      const w = 0.055;
      b.quad([Math.cos(a) * r0 - Math.sin(a) * w, 0.010, Math.sin(a) * r0 + Math.cos(a) * w],
        [Math.cos(a) * r1 - Math.sin(a) * w, 0.010, Math.sin(a) * r1 + Math.cos(a) * w],
        [Math.cos(a) * r1 + Math.sin(a) * w, 0.010, Math.sin(a) * r1 - Math.cos(a) * w],
        [Math.cos(a) * r0 + Math.sin(a) * w, 0.010, Math.sin(a) * r0 - Math.cos(a) * w],
        PAL.gold, MT.goldSoft, [0, 1, 0]);
    }
    at(b, 0, 0.012, 0, () => disc(b, 1.12, 20, mixc(PAL.carpet, PAL.gold, 0.30), MT.goldSoft));
    at(b, 0, 0.016, 0, () => disc(b, 0.46, 16, PAL.goldHi, MT.gold));
  });
  P.items++; // 中央团花

  // ---- 门口过门毯（把门与地毯连起来）
  quadUp(b, -3.5, 3.5, 0.05, 2.55, 0.028, PAL.crimDk, MT.cloth);
  quadUp(b, -3.5, -3.22, 0.05, 2.55, 0.040, PAL.gold, MT.goldSoft);
  quadUp(b, 3.22, 3.5, 0.05, 2.55, 0.040, PAL.gold, MT.goldSoft);
  for (let k = 0; k < 5; k++) {
    quadFlat(b, 0, 0.046, 0.45 + k * 0.46, 0.55, 0.16, 0.55, 0.16, PAL.goldDk, MT.goldSoft);
  }
  P.items++; // 过门毯
}

// ================================================================ 墙面（金线护墙板 / 壁柱之间的分格）
const PIL_Z = [3.4, 9.0, 14.6, 20.2];
const SEGS = [[0.42, 2.87], [3.93, 8.47], [9.53, 14.07], [15.13, 19.67], [20.73, 25.4]];

function buildWalls(b, P) {
  // ---- 两侧长墙：5 段 × (上护墙板 + 木裙板)
  for (const s of [-1, 1]) {
    const x = s * IX;
    const ry = s < 0 ? Math.PI / 2 : -Math.PI / 2;
    for (const [z0, z1] of SEGS) {
      const w = z1 - z0 - 0.30;
      const zc = (z0 + z1) / 2;
      atR(b, x, 0, zc, ry, () => {
        at(b, 0, 10.35, 0, () => giltPanel(b, w, 12.4, {}));
        at(b, 0, 2.38, 0, () => giltPanel(b, w, 2.78, {
          field: PAL.olive, fieldMat: MT.woodDk, t: 0.16, dep: 0.13, bead: false, ds: 0.26,
        }));
        // 裙板上的竖向板缝
        for (let k = 1; k <= 3; k++) {
          at(b, -w / 2 + (w * k) / 4, 2.38, 0.075, () => box(b, 0.045, 2.4, 0.05, PAL.goldDk, MT.goldSoft));
        }
      });
    }
    // 通长腰线 + 画镜线 + 檐下金线
    at(b, x - s * 0.02, 3.95, 13.0, () => box(b, 0.22, 0.20, 25.6, PAL.gold, MT.gold, {}));
    at(b, x - s * 0.02, 16.72, 13.0, () => box(b, 0.18, 0.16, 25.6, PAL.gold, MT.goldSoft, {}));
    at(b, x - s * 0.02, 17.10, 13.0, () => box(b, 0.24, 0.12, 25.6, PAL.goldDk, MT.goldSoft, {}));
  }
  P.items++; // 侧墙金线护墙板
  P.items++; // 侧墙木裙板

  // ---- 门墙两翼（x 7.4 .. 18.7）
  for (const s of [-1, 1]) {
    atR(b, s * 13.0, 0, 0.02, 0, () => {
      at(b, 0, 8.70, 0, () => giltPanel(b, 10.9, 10.6, {}));
      at(b, 0, 2.36, 0, () => giltPanel(b, 10.9, 2.74, {
        field: PAL.olive, fieldMat: MT.woodDk, t: 0.16, dep: 0.13, bead: false, ds: 0.26,
      }));
      at(b, 0, 15.35, 0, () => giltPanel(b, 7.4, 1.55, { t: 0.14, dep: 0.12, diamond: false }));
    });
    // 腰线（避开 13 m 门洞：只做两翼）
    at(b, s * 13.0, 3.95, 0.02, () => box(b, 11.4, 0.20, 0.22, PAL.gold, MT.gold, {}));
    at(b, s * 13.0, 16.72, -0.84, () => box(b, 11.4, 0.16, 0.18, PAL.gold, MT.goldSoft, {}));
  }
  // 门上方横贯金线（拱顶 15 m 以上都是实墙）
  at(b, 0, 16.72, -0.84, () => box(b, 13.6, 0.16, 0.18, PAL.gold, MT.goldSoft, {}));
  P.items++; // 门墙护墙板

  // ---- 门楣上的「茶烟」徽记：黄铜茶杯 + 三缕热气（不写文字）
  at(b, 0, 16.55, 0.03, () => {
    b.push(RX(Math.PI / 2));
    lathe(b, [[0, 0], [0.42, 0.02], [0.46, 0.10], [0.36, 0.40], [0.40, 0.46], [0.30, 0.50], [0, 0.50]], 14, PAL.gold, MT.gold);
    b.pop();
    at(b, 0.30, 0.18, 0, () => { b.push(RZ(-0.5)); torus(b, 0.20, 0.045, 10, 3, PAL.gold, MT.gold, 'z'); b.pop(); });
    for (let k = -1; k <= 1; k++) {
      const pts = [];
      for (let i = 0; i < 4; i++) {
        const t = i / 3;
        pts.push([k * 0.28 + Math.sin(t * 4 + k) * 0.06, 0.56 + t * 0.62, 0]);
      }
      tubePath(b, pts, 0.030, 4, PAL.goldHi, MT.gold);
    }
  });
  P.items++; // 门楣茶烟徽记

  // ---- 大窗墙两翼
  for (const s of [-1, 1]) {
    atR(b, s * 17.05, 0, ZW - 0.02, Math.PI, () => {
      at(b, 0, 9.30, 0, () => giltPanel(b, 3.35, 10.4, {}));
      at(b, 0, 2.38, 0, () => giltPanel(b, 3.35, 2.78, {
        field: PAL.olive, fieldMat: MT.woodDk, t: 0.15, dep: 0.12, bead: false, ds: 0.24,
      }));
    });
  }
  // 窗上金线 + 太阳徽记（从门口望进来正好压在拱窗上）
  at(b, 0, 16.74, ZW - 0.02, () => box(b, 13.8, 0.15, 0.16, PAL.gold, MT.goldSoft, {}));
  atR(b, 0, 17.35, ZW - 0.04, Math.PI, () => {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU;
      b.quad([Math.cos(a) * 0.18, Math.sin(a) * 0.18, 0], [Math.cos(a + 0.11) * 0.62, Math.sin(a + 0.11) * 0.62, 0],
        [Math.cos(a + 0.11) * 0.62, Math.sin(a + 0.11) * 0.62, 0.02], [Math.cos(a) * 0.18, Math.sin(a) * 0.18, 0.02],
        PAL.gold, MT.goldSoft, [0, 0, 1]);
    }
    discFace(b, 0.20, 10, PAL.goldHi, MT.gold);
  });
  P.items++; // 窗墙护墙板 + 窗上太阳徽记
}

// ================================================================ 顶棚
function buildCeiling(b, P) {
  const BAYS = [[0.35, 6.05], [6.95, 12.6], [13.4, 19.1], [19.9, 25.65]];
  const XDIV = [-9.5, 0, 9.5];
  for (const [z0, z1] of BAYS) {
    const zc = (z0 + z1) / 2, zl = z1 - z0;
    for (const x of XDIV) {
      at(b, x, 17.90, zc, () => box(b, 0.20, 0.20, zl, PAL.gold, MT.goldSoft, {}));
    }
    // 藻井内的浅色嵌板（比顶板亮一号，读得出方格）
    for (let k = 0; k < 4; k++) {
      const xa = -IX + 0.4 + k * 9.55, xb = xa + 9.2;
      quadUp(b, xa + 0.2, xb - 0.2, z0 + 0.2, z1 - 0.2, 17.965, PAL.creamDk, MT.panel);
    }
  }
  // 四周一圈金色平顶檐带（把顶与墙的交接收干净）
  for (const s of [-1, 1]) {
    at(b, s * (IX - 0.55), 17.80, 13.0, () => box(b, 1.30, 0.34, 25.6, PAL.creamDk, MT.panel));
    at(b, s * (IX - 0.55), 17.62, 13.0, () => box(b, 1.38, 0.10, 25.7, PAL.gold, MT.goldSoft));
  }
  at(b, 0, 17.80, 0.55, () => box(b, 38.0, 0.34, 1.10, PAL.creamDk, MT.panel));
  at(b, 0, 17.62, 0.55, () => box(b, 38.2, 0.10, 1.16, PAL.gold, MT.goldSoft));
  at(b, 0, 17.80, 25.4, () => box(b, 38.0, 0.34, 1.10, PAL.creamDk, MT.panel));
  at(b, 0, 17.62, 25.4, () => box(b, 38.2, 0.10, 1.16, PAL.gold, MT.goldSoft));
  P.items++; // 顶棚藻井金梁 + 檐带

  // 中央吊灯顶盘
  at(b, 0, 17.90, 13.0, () => {
    disc(b, 3.15, 24, PAL.cream, MT.panel);
    at(b, 0, 0.02, 0, () => torus(b, 3.10, 0.10, 24, 3, PAL.gold, MT.goldSoft, 'y'));
    at(b, 0, 0.03, 0, () => torus(b, 2.55, 0.05, 20, 3, PAL.goldDk, MT.goldSoft, 'y'));
    at(b, 0, 0.03, 0, () => disc(b, 1.05, 18, PAL.gold, MT.goldSoft));
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * TAU;
      at(b, Math.cos(a) * 2.85, 0.03, Math.sin(a) * 2.85, () => {
        cylinder(b, 6, 0.10, 0.07, 0.06, PAL.goldHi, MT.gold, { y0: 0 });
      });
    }
  });
  P.items++; // 吊灯顶盘
}

// ================================================================ 红丝绒窗帘 + 帘盒
function buildCurtains(b, P) {
  const rnd = P.rnd;
  const X0 = 13.2, X1 = 16.6;
  for (const s of [-1, 1]) {
    const zc = 24.28;
    // 褶皱：一条条竖直的圆管，越往下越鼓，中间被束带收一下
    const n = 6;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const x = s * (X0 + (X1 - X0) * t);
      const pts = [];
      const rad = [];
      for (let k = 0; k < 6; k++) {
        const yy = 0.32 + k * 3.28;
        const pinch = 1 - 0.34 * Math.exp(-Math.pow((yy - 5.6) / 2.2, 2)); // 束带处收腰
        const wave = 0.10 * Math.sin(t * 9.5 + 1.2);
        pts.push([x + s * wave, yy, zc + Math.cos(t * 6.2) * 0.16]);
        rad.push((0.20 + 0.13 * t) * pinch);
      }
      tubePath(b, pts, rad, 5, mixc(PAL.crim, PAL.crimDk, 0.25 + 0.3 * t), MT.cloth, {});
    }
    // 束带 + 流苏
    at(b, s * (X0 + (X1 - X0) * 0.52), 5.6, zc + 0.05, () => {
      b.push(RZ(0));
      torus(b, 0.62, 0.075, 14, 3, PAL.gold, MT.gold, 'y');
      b.pop();
    });
    at(b, s * (X0 + (X1 - X0) * 0.52), 4.7, zc + 0.05, () => {
      lathe(b, [[0.0, 0], [0.14, -0.12], [0.10, -0.40], [0.03, -0.62], [0.0, -0.66]], 8, PAL.gold, MT.gold);
    });
    // 窗帘内侧的纱帘（薄一层浅色，亮部）
    at(b, s * (X0 - 0.55), 0, zc - 0.30, () => {
      quadFace(b, -0.5, 0.5, 0.5, 16.2, 0, mulc(PAL.cream, 0.92), [0.16, 0.10]);
    });
    P.items++; // 左/右 红丝绒帘
  }
  // 帘盒（鎏金帷幔）
  at(b, 0, 17.32, 24.55, () => {
    box(b, 36.0, 0.62, 1.0, PAL.goldDk, MT.goldSoft, { topCol: PAL.gold });
    box(b, 36.4, 0.16, 1.14, PAL.goldHi, MT.gold);
    // 垂花饰：一串小球
    for (let i = 0; i < 13; i++) {
      const x = -16.2 + i * 2.7;
      at(b, x, -0.46, 0.45, () => sphere(b, 0.13, PAL.gold, MT.gold, { rings: 2, seg: 5, jitter: 0.02, seed: 3 + i }));
    }
  });
  P.items++; // 鎏金帘盒
}

// ================================================================ 座椅
// 绿丝绒沙发（局部：坐面向 +z，背在 -z）
function buildSofa(b, o = {}) {
  const len = o.len ?? 3.0, dep = o.dep ?? 1.30;
  const col = o.col ?? PAL.velvet, dk = o.dk ?? PAL.velvetDk;
  const hw = len / 2, hd = dep / 2;
  // 木底座
  at(b, 0, 0.13, 0, () => box(b, len - 0.10, 0.26, dep - 0.10, PAL.woodDk, MT.woodDk));
  // 座框
  at(b, 0, 0.42, 0.04, () => box(b, len, 0.34, dep - 0.22, dk, MT.velvet));
  // 坐垫（3 块）
  const n = o.seats ?? 3, cw = (len - 0.56) / n;
  for (let i = 0; i < n; i++) {
    at(b, -len / 2 + 0.28 + cw * (i + 0.5), 0.665, 0.06, () => box(b, cw - 0.06, 0.27, dep - 0.62, col, MT.velvet,
      { topCol: mulc(col, 1.10) }));
  }
  // 靠背
  at(b, 0, 0.98, -hd + 0.17, () => box(b, len, 1.44, 0.30, dk, MT.velvet));
  // 靠背顶卷
  at(b, 0, 1.665, -hd + 0.17, () => {
    tubePath(b, [[-hw + 0.14, 0, 0], [-hw * 0.4, 0.02, 0], [hw * 0.4, 0.02, 0], [hw - 0.14, 0, 0]], 0.165, 6, col, MT.velvet, {});
  });
  // 扶手
  for (const s of [-1, 1]) {
    at(b, s * (hw - 0.19), 0.70, 0.03, () => box(b, 0.38, 0.98, dep - 0.14, dk, MT.velvet));
    at(b, s * (hw - 0.19), 1.225, 0.03, () => {
      tubePath(b, [[0, 0, -hd + 0.20], [0, 0.02, -hd * 0.3], [0, 0.02, hd * 0.3], [0, 0, hd - 0.16]], 0.16, 6, col, MT.velvet, {});
    });
    // 金边
    at(b, s * (hw - 0.19), 1.40, 0.03, () => box(b, 0.42, 0.055, dep - 0.10, PAL.gold, MT.gold));
  }
  at(b, 0, 1.855, -hd + 0.17, () => box(b, len - 0.24, 0.05, 0.36, PAL.gold, MT.gold));
  // 绗缝扣
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 2; j++) {
      at(b, -hw + 0.46 + i * ((len - 0.92) / 4), 1.16 + j * 0.30, -hd + 0.33, () => {
        sphere(b, 0.075, mulc(col, 0.82), MT.velvet, { rings: 2, seg: 4, jitter: 0.02, seed: 9 + i + j });
      });
    }
  }
  // 木脚
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      at(b, sx * (hw - 0.18), 0.0, sz * (hd - 0.16), () => {
        lathe(b, [[0, 0], [0.13, 0.02], [0.10, 0.20], [0.14, 0.24], [0, 0.26]], 8, PAL.goldDk, MT.goldSoft);
      });
    }
  }
}

// 抱枕（局部原点 = 底面中心）
function buildCushion(b, w, h, d, col, o = {}) {
  at(b, 0, h / 2, 0, () => {
    box(b, w * 0.94, h * 0.86, d, col, MT.fabric, { topCol: mulc(col, 1.10) });
    box(b, w, h * 0.52, d * 0.94, col, MT.fabric);
  });
  if (o.gold) {
    at(b, 0, h * 0.52, 0, () => box(b, w + 0.02, 0.035, d + 0.02, PAL.gold, MT.goldSoft));
  }
  if (o.tassel) {
    for (const s of [-1, 1]) {
      at(b, s * w * 0.44, h * 0.28, d * 0.42, () => {
        lathe(b, [[0.0, 0.14], [0.05, 0.06], [0.09, -0.02], [0.05, -0.20], [0.0, -0.24]], 6, PAL.gold, MT.goldSoft);
      });
    }
  }
}

// 单人扶手椅（带翼）
function buildArmchair(b, o = {}) {
  const col = o.col ?? PAL.velvet, dk = o.dk ?? PAL.velvetDk;
  const dep = o.dep ?? 1.32, len = o.len ?? 1.42;
  const hw = len / 2, hd = dep / 2;
  at(b, 0, 0.12, 0, () => box(b, len - 0.08, 0.24, dep - 0.08, PAL.woodDk, MT.woodDk));
  at(b, 0, 0.40, 0.04, () => box(b, len, 0.30, dep - 0.18, dk, MT.velvet));
  at(b, 0, 0.615, 0.06, () => box(b, len - 0.30, 0.26, dep - 0.50, col, MT.velvet, { topCol: mulc(col, 1.10) }));
  at(b, 0, 0.95, -hd + 0.16, () => box(b, len, 1.52, 0.28, dk, MT.velvet));
  at(b, 0, 1.60, -hd + 0.16, () => {
    tubePath(b, [[-hw + 0.12, 0, 0], [-hw * 0.4, 0.02, 0], [hw * 0.4, 0.02, 0], [hw - 0.12, 0, 0]], 0.155, 6, col, MT.velvet, {});
  });
  for (const s of [-1, 1]) {
    at(b, s * (hw - 0.17), 0.68, -0.02, () => box(b, 0.34, 1.00, dep - 0.18, dk, MT.velvet));
    at(b, s * (hw - 0.17), 1.205, -0.02, () => {
      tubePath(b, [[0, 0, -hd + 0.22], [0, 0.02, 0], [0, 0, hd - 0.18]], 0.145, 6, col, MT.velvet, {});
    });
    at(b, s * (hw - 0.17), 1.37, -0.02, () => box(b, 0.38, 0.05, dep - 0.14, PAL.gold, MT.gold));
    // 翼板
    at(b, s * (hw - 0.06), 1.24, -hd + 0.78, () => box(b, 0.16, 1.10, 0.72, dk, MT.velvet));
  }
  at(b, 0, 1.79, -hd + 0.16, () => box(b, len - 0.20, 0.05, 0.34, PAL.gold, MT.gold));
  for (let k = -1; k <= 1; k++) {
    at(b, k * 0.34, 1.14, -hd + 0.03, () => box(b, 0.045, 1.16, 0.04, PAL.goldDk, MT.goldSoft));
    at(b, k * 0.34, 1.14, -hd + 0.28, () => box(b, 0.045, 1.16, 0.04, PAL.goldDk, MT.goldSoft));
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      at(b, sx * (hw - 0.16), 0, sz * (hd - 0.14), () => {
        lathe(b, [[0, 0], [0.11, 0.02], [0.085, 0.18], [0.12, 0.22], [0, 0.24]], 8, PAL.goldDk, MT.goldSoft);
      });
    }
  }
  buildCushion(b, 0.92, 0.34, 0.34, o.pillow ?? PAL.blue);
}

// 贵妃榻（face +z，长向沿 x，一端有靠背）
function buildChaise(b, o = {}) {
  const len = o.len ?? 2.6, dep = o.dep ?? 1.05;
  const col = PAL.velvet, dk = PAL.velvetDk;
  at(b, 0, 0.14, 0, () => box(b, len - 0.10, 0.28, dep - 0.10, PAL.woodDk, MT.woodDk));
  at(b, 0, 0.44, 0.02, () => box(b, len, 0.34, dep - 0.16, dk, MT.velvet));
  at(b, 0, 0.665, 0.04, () => box(b, len - 0.30, 0.28, dep - 0.42, col, MT.velvet, { topCol: mulc(col, 1.10) }));
  // 一端靠背（+x 端）
  at(b, len / 2 - 0.22, 1.02, -dep / 2 + 0.16, () => box(b, 0.34, 1.30, dep, dk, MT.velvet));
  at(b, len / 2 - 0.22, 1.63, -dep / 2 + 0.16, () => {
    tubePath(b, [[0, 0, -dep / 2 + 0.16], [0, 0.02, 0], [0, 0, dep / 2 - 0.14]], 0.15, 6, col, MT.velvet, {});
  });
  at(b, len / 2 - 0.22, 1.79, -dep / 2 + 0.16, () => box(b, 0.38, 0.05, dep - 0.10, PAL.gold, MT.gold));
  // 尾端微翘
  at(b, -len / 2 + 0.30, 0.80, 0, () => {
    b.push(RZ(0.18));
    box(b, 0.62, 0.22, dep - 0.28, col, MT.velvet);
    b.pop();
  });
  at(b, 0, 1.74, -dep / 2 + 0.16, () => box(b, len - 0.3, 0.05, 0.30, PAL.gold, MT.gold));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      at(b, sx * (len / 2 - 0.22), 0, sz * (dep / 2 - 0.14), () => {
        lathe(b, [[0, 0], [0.12, 0.02], [0.09, 0.20], [0.12, 0.24], [0, 0.26]], 8, PAL.goldDk, MT.goldSoft);
      });
    }
  }
}

// ================================================================ 桌面 / 茶具
function buildTeaTable(b, P) {
  const w = 5.6, d = 2.8, topY = 0.90;
  // 黄铜腿
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      at(b, sx * (w / 2 - 0.34), 0, sz * (d / 2 - 0.30), () => {
        lathe(b, [[0, 0], [0.16, 0.02], [0.11, 0.30], [0.10, 0.62], [0.16, 0.70], [0.16, 0.74], [0, 0.74]], 10, PAL.gold, MT.gold);
      });
    }
  }
  // 横撑 + 中间花盘
  at(b, 0, 0.22, 0, () => {
    box(b, w - 0.9, 0.10, 0.10, PAL.gold, MT.goldSoft);
    box(b, 0.10, 0.10, d - 0.8, PAL.gold, MT.goldSoft);
  });
  // 桌面（白大理石 + 木边）
  at(b, 0, topY - 0.09, 0, () => box(b, w, 0.18, d, PAL.marble, MT.marble, { topCol: PAL.marble }));
  at(b, 0, topY - 0.20, 0, () => box(b, w - 0.10, 0.14, d - 0.10, PAL.woodDk, MT.woodDk));
  // 桌面金线镶边
  at(b, 0, topY - 0.005, 0, () => {
    box(b, w + 0.06, 0.035, 0.10, PAL.gold, MT.gold);
    box(b, 0.10, 0.035, d + 0.06, PAL.gold, MT.gold);
  });
  for (const sz of [-1, 1]) {
    at(b, 0, topY - 0.005, sz * (d / 2 - 0.06), () => box(b, w, 0.035, 0.09, PAL.gold, MT.gold));
  }
  for (const sx of [-1, 1]) {
    at(b, sx * (w / 2 - 0.06), topY - 0.005, 0, () => box(b, 0.09, 0.035, d, PAL.gold, MT.gold));
  }
  P.items++; // 白大理石茶桌
}

// 青花茶杯（含碟）
function buildCup(b, x, y, z, s = 1) {
  at(b, x, y, z, () => {
    b.push(m4.scale([s, s, s]));
    lathe(b, [[0, 0.16], [0.17, 0.14], [0.21, 0.06], [0.17, 0.02], [0, 0.02]], 8, PAL.porc, MT.porcelain, {
      colFn: (yy) => (yy > 0.115 ? PAL.porcBlue : PAL.porc),
    });
    at(b, 0, 0.018, 0, () => { cylinder(b, 10, 0.36, 0.33, 0.03, PAL.porc, MT.porcelain, { y0: 0 }); });
    at(b, 0, 0.048, 0, () => { torus(b, 0.345, 0.020, 10, 2, PAL.porcBlue, MT.porcelain, 'y'); });
    at(b, 0, 0.10, 0, () => { disc(b, 0.15, 8, PAL.tea, MT.food); });
    b.pop();
  });
}
// 青花茶壶
function buildTeapot(b, x, y, z, s = 1) {
  at(b, x, y, z, () => {
    b.push(m4.scale([s, s, s]));
    lathe(b, [[0, 0.02], [0.22, 0.02], [0.30, 0.08], [0.36, 0.26], [0.33, 0.42], [0.24, 0.50], [0.26, 0.55], [0.22, 0.58], [0.16, 0.60], [0.16, 0.66], [0.07, 0.68], [0, 0.70]], 11, PAL.porc, MT.porcelain, {
      colFn: (yy) => (yy > 0.30 && yy < 0.38 ? PAL.porcBlue : (yy > 0.56 ? PAL.porcBlue : PAL.porc)),
    });
    // 壶嘴
    tubePath(b, [[0.30, 0.30, 0], [0.46, 0.34, 0], [0.56, 0.46, 0], [0.58, 0.58, 0]], [0.075, 0.06, 0.05, 0.045], 6, PAL.porc, MT.porcelain, {});
    // 把手
    tubePath(b, [[-0.30, 0.24, 0], [-0.52, 0.30, 0], [-0.54, 0.44, 0], [-0.34, 0.52, 0]], 0.045, 5, PAL.gold, MT.gold, {});
    at(b, 0, 0.72, 0, () => sphere(b, 0.065, PAL.gold, MT.gold, { rings: 2, seg: 5, jitter: 0.02, seed: 4 }));
    b.pop();
  });
}

// 三层点心架（签名件）
function buildDessertStand(b, P) {
  const rnd = P.rnd;
  const cx = 2.55, cz = 20.75, y0 = 0.905;
  at(b, cx, y0, cz, () => {
    // 底盘
    lathe(b, [[0, 0], [0.60, 0], [0.60, 0.05], [0.10, 0.09], [0.055, 0.10], [0.055, 2.00], [0, 2.02]], 12, PAL.gold, MT.gold);
    at(b, 0, 0.02, 0, () => torus(b, 0.60, 0.035, 12, 2, PAL.goldHi, MT.gold, 'y'));
    // 三层盘
    const tiers = [[0.30, 0.86], [1.06, 0.72], [1.80, 0.58]];
    for (const [yy, rr] of tiers) {
      at(b, 0, yy, 0, () => {
        lathe(b, [[0, 0], [rr, 0], [rr, 0.035], [rr - 0.06, 0.05], [0.06, 0.05], [0.06, 0.0]], 12, PAL.porc, MT.porcelain, {
          colFn: (t) => (t > 0.02 ? PAL.porcBlue : PAL.porc),
        });
        at(b, 0, 0.055, 0, () => torus(b, rr - 0.015, 0.026, 12, 2, PAL.goldHi, MT.gold, 'y'));
      });
    }
    // 顶端小提手
    at(b, 0, 2.02, 0, () => {
      tubePath(b, [[0.0, 0, -0.30], [0.34, 0.12, 0], [0.0, 0.24, 0.30], [-0.34, 0.12, 0], [0.0, 0, -0.30]], 0.032, 5, PAL.goldHi, MT.gold, {});
    });

    // ---- 甜点
    // 第一层：马卡龙 + 小挞
    const mCols = [PAL.pink, PAL.pista, PAL.cream2, PAL.berry, PAL.cake, PAL.pink];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + 0.2;
      const rr = 0.60;
      at(b, Math.cos(a) * rr, 0.36, Math.sin(a) * rr, () => {
        cylinder(b, 7, 0.09, 0.09, 0.07, mCols[i % mCols.length], MT.food, { y0: 0 });
        at(b, 0, 0.07, 0, () => cylinder(b, 7, 0.085, 0.085, 0.04, mCols[i % mCols.length], MT.food, { y0: 0 }));
      });
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.9;
      at(b, Math.cos(a) * 0.34, 0.36, Math.sin(a) * 0.34, () => {
        cylinder(b, 8, 0.13, 0.15, 0.05, PAL.cake, MT.food, { y0: 0 });
        at(b, 0, 0.05, 0, () => cylinder(b, 8, 0.10, 0.10, 0.04, PAL.berry, MT.food, { y0: 0 }));
        at(b, 0, 0.09, 0, () => sphere(b, 0.04, PAL.red, MT.food, { rings: 2, seg: 4, jitter: 0.1, seed: 11 + i }));
      });
    }
    // 第二层：小蛋糕 + 巧克力
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      at(b, Math.cos(a) * 0.48, 1.12, Math.sin(a) * 0.48, () => {
        cylinder(b, 8, 0.12, 0.13, 0.14, PAL.cream2, MT.food, { y0: 0 });
        at(b, 0, 0.14, 0, () => cylinder(b, 8, 0.13, 0.11, 0.05, PAL.pink, MT.food, { y0: 0 }));
        at(b, 0, 0.19, 0, () => sphere(b, 0.045, PAL.red, MT.food, { rings: 2, seg: 4, jitter: 0.1, seed: 21 + i }));
      });
    }
    for (let i = 0; i < 3; i++) {
      at(b, -0.20 + i * 0.20, 1.12, -0.05, () => {
        box(b, 0.16, 0.12, 0.16, PAL.choco, MT.food);
        at(b, 0, 0.075, 0, () => box(b, 0.13, 0.03, 0.13, PAL.cake, MT.food));
      });
    }
    // 第三层：小方糕
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.4;
      at(b, Math.cos(a) * 0.34, 1.86, Math.sin(a) * 0.34, () => {
        box(b, 0.15, 0.10, 0.15, PAL.pista, MT.food);
        at(b, 0, 0.06, 0, () => box(b, 0.13, 0.02, 0.13, PAL.cream2, MT.food));
      });
    }
    void rnd;
  });
  P.items++; // 三层点心架
  P.items++; // 架上甜点
}

// 茶具组（托盘 + 壶 + 4 杯 + 糖罐 + 奶罐）
function buildTeaSet(b, P) {
  const cx = 4.90, cz = 20.75, y = 0.905;
  // 银托盘
  at(b, cx, y, cz, () => {
    lathe(b, [[0, 0], [1.00, 0], [1.03, 0.04], [0.98, 0.05], [0.98, 0.02], [0.05, 0.02], [0, 0.02]], 14, PAL.silver, MT.silver);
    at(b, 0, 0.055, 0, () => torus(b, 1.01, 0.028, 14, 2, PAL.silver, MT.silver, 'y'));
  });
  buildTeapot(b, cx - 0.34, y + 0.02, cz - 0.10, 1.0);
  buildCup(b, cx + 0.36, y + 0.02, cz - 0.34, 1.0);
  buildCup(b, cx + 0.52, y + 0.02, cz + 0.14, 1.0);
  buildCup(b, cx - 0.30, y + 0.02, cz + 0.44, 1.0);
  // 糖罐
  at(b, cx + 0.05, y + 0.02, cz + 0.52, () => {
    lathe(b, [[0, 0], [0.20, 0], [0.24, 0.12], [0.22, 0.24], [0.16, 0.28], [0.20, 0.32], [0.20, 0.36], [0, 0.36]], 12, PAL.porc, MT.porcelain, {
      colFn: (yy) => (yy > 0.26 ? PAL.porcBlue : PAL.porc),
    });
  });
  // 奶罐
  at(b, cx + 0.72, y + 0.02, cz - 0.06, () => {
    lathe(b, [[0, 0], [0.15, 0], [0.20, 0.14], [0.17, 0.28], [0.22, 0.34], [0, 0.34]], 10, PAL.porc, MT.porcelain);
    tubePath(b, [[-0.18, 0.14, 0], [-0.30, 0.22, 0], [-0.20, 0.30, 0]], 0.032, 5, PAL.porc, MT.porcelain, {});
  });
  P.items++; // 青花茶具
  P.items++; // 银托盘
}

// 玻璃罩蛋糕
function buildCakeDome(b, P) {
  at(b, 4.35, 0.905, 22.05, () => {
    lathe(b, [[0, 0], [0.48, 0], [0.50, 0.04], [0.44, 0.05], [0, 0.05]], 16, PAL.silver, MT.silver);
    at(b, 0, 0.05, 0, () => cylinder(b, 14, 0.32, 0.32, 0.16, PAL.cream2, MT.food, { y0: 0 }));
    at(b, 0, 0.21, 0, () => cylinder(b, 14, 0.33, 0.30, 0.04, PAL.pink, MT.food, { y0: 0 }));
    at(b, 0, 0.25, 0, () => cylinder(b, 14, 0.28, 0.28, 0.05, PAL.cream2, MT.food, { y0: 0 }));
    at(b, 0, 0.30, 0, () => sphere(b, 0.05, PAL.red, MT.food, { rings: 2, seg: 4, jitter: 0.1, seed: 31 }));
    // 玻璃罩
    lathe(b, [[0.50, 0.05], [0.50, 0.10], [0.44, 0.34], [0.30, 0.52], [0.12, 0.62], [0, 0.64]], 14, PAL.mirror, [0.10, 0.95], { smooth: true });
    at(b, 0, 0.64, 0, () => sphere(b, 0.06, PAL.gold, MT.gold, { rings: 2, seg: 5, jitter: 0.02, seed: 5 }));
  });
  P.items++; // 玻璃罩蛋糕
}

// 三臂黄铜烛台
function buildCandelabra(b, P, x, y, z) {
  at(b, x, y, z, () => {
    lathe(b, [[0, 0], [0.24, 0.0], [0.22, 0.04], [0.10, 0.10], [0.08, 0.30], [0.14, 0.40], [0.10, 0.46], [0, 0.48]], 10, PAL.gold, MT.gold);
    for (let k = -1; k <= 1; k++) {
      const ax = k * 0.30;
      tubePath(b, [[0, 0.42, 0], [ax * 0.55, 0.52, 0], [ax, 0.60, 0]], 0.035, 4, PAL.gold, MT.gold, {});
      at(b, ax, 0.60, 0, () => {
        lathe(b, [[0, 0], [0.10, 0], [0.10, 0.05], [0.05, 0.06], [0.05, 0.10], [0, 0.10]], 8, PAL.gold, MT.gold);
        cylinder(b, 6, 0.045, 0.042, 0.30, PAL.candle, MT.candle, { y0: 0.10 });
        at(b, 0, 0.42, 0, () => sphere(b, 0.055, PAL.flame, MT.flame, { rings: 2, seg: 5, jitter: 0.06, seed: 41 + k }));
      });
    }
  });
  P.items++; // 三臂烛台
}

// ================================================================ 书架 / 边柜
function buildBookcase(b, P, w, h, d, seed) {
  const rnd = mulberry32(seed);
  at(b, 0, 0, 0, () => {
    // 背板 + 侧板 + 顶底
    at(b, 0, h / 2, -d / 2 + 0.03, () => box(b, w, h, 0.06, PAL.woodDk, MT.woodDk));
    for (const s of [-1, 1]) {
      at(b, s * (w / 2 - 0.06), h / 2, 0, () => box(b, 0.12, h, d, PAL.wood, MT.wood));
      at(b, s * (w / 2 - 0.05), h - 0.04, 0, () => box(b, 0.20, 0.08, d + 0.04, PAL.gold, MT.goldSoft));
    }
    at(b, 0, h - 0.10, 0, () => box(b, w, 0.14, d + 0.06, PAL.wood, MT.wood, { topCol: PAL.woodLight }));
    at(b, 0, 0.12, 0, () => box(b, w, 0.24, d + 0.04, PAL.woodDk, MT.woodDk));
    // 隔板 + 书
    const rows = 4;
    for (let r = 0; r < rows; r++) {
      const y = 0.32 + r * ((h - 0.75) / rows);
      at(b, 0, y, 0.01, () => box(b, w - 0.18, 0.06, d - 0.08, PAL.wood, MT.wood));
      if (r === 3) continue; // 最上层放摆件
      const n = 8 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) {
        const bw = 0.09 + rnd() * 0.07;
        const bh = 0.24 + rnd() * 0.10;
        const bx = -w / 2 + 0.28 + i * ((w - 0.62) / n) + rnd() * 0.02;
        const cols = [PAL.crimDk, PAL.blue, PAL.oliveDk, PAL.woodDk, PAL.goldDk, PAL.creamDk, PAL.crim, PAL.panelDk];
        const cc = cols[Math.floor(rnd() * cols.length)];
        at(b, bx, y + 0.06, 0.04 + rnd() * 0.02, () => {
          if (rnd() < 0.14) {
            b.push(RZ(-0.22));
            bookAt(b, bw, bh, d - 0.20, cc);
            b.pop();
          } else {
            bookAt(b, bw, bh, d - 0.20, cc);
          }
        });
      }
      // 横叠的一摞
      if (r < 2) {
        for (let k = 0; k < 4; k++) {
          at(b, w / 2 - 0.75, y + 0.09 + k * 0.075, 0.0, () => {
            b.push(RZ(0.04 * k));
            box(b, 0.62 - k * 0.05, 0.07, d - 0.22, [PAL.crimDk, PAL.blue, PAL.oliveDk, PAL.creamDk][k], MT.paper);
            b.pop();
          });
        }
      }
    }
  });
}

// 鎏金边柜
function buildSideboard(b, P, w, h, d) {
  at(b, 0, 0, 0, () => {
    at(b, 0, h / 2, 0, () => box(b, w - 0.20, h - 0.30, d - 0.10, PAL.woodDk, MT.woodDk));
    // 三道柜门
    for (let i = -1; i <= 1; i++) {
      at(b, i * (w - 0.4) / 3, h / 2 - 0.14, d / 2 - 0.02, () => {
        box(b, (w - 0.6) / 3, h - 0.55, 0.05, PAL.wood, MT.wood);
        frameZ(b, (w - 0.6) / 3 - 0.10, h - 0.72, 0.05, 0.04, PAL.gold, MT.goldSoft, 0.03);
        at(b, (w - 0.6) / 3 / 2 - 0.14, 0, 0.06, () => sphere(b, 0.045, PAL.goldHi, MT.gold, { rings: 2, seg: 5, jitter: 0.02, seed: 6 }));
      });
    }
    // 台面
    at(b, 0, h - 0.20, 0, () => box(b, w, 0.14, d + 0.06, PAL.marble, MT.marble, { topCol: PAL.marble }));
    at(b, 0, h - 0.30, 0, () => box(b, w + 0.04, 0.08, d + 0.10, PAL.gold, MT.gold));
    // 腿
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        at(b, sx * (w / 2 - 0.30), 0, sz * (d / 2 - 0.22), () => {
          lathe(b, [[0, 0], [0.13, 0.02], [0.09, 0.24], [0.13, 0.30], [0, 0.32]], 8, PAL.gold, MT.gold);
        });
      }
    }
  });
}

// 银汤盅
function buildTureen(b, P, x, y, z, s = 1) {
  at(b, x, y, z, () => {
    b.push(m4.scale([s, s, s]));
    lathe(b, [[0, 0.10], [0.18, 0.08], [0.34, 0.10], [0.42, 0.26], [0.38, 0.40], [0.28, 0.46], [0.30, 0.50], [0.24, 0.54], [0.26, 0.58], [0.20, 0.62], [0, 0.64]], 10, PAL.silver, MT.silver);
    for (const s2 of [-1, 1]) {
      tubePath(b, [[s2 * 0.38, 0.30, 0], [s2 * 0.50, 0.36, 0], [s2 * 0.42, 0.44, 0]], 0.035, 4, PAL.silver, MT.silver, {});
    }
    at(b, 0, 0.64, 0, () => sphere(b, 0.06, PAL.goldHi, MT.gold, { rings: 2, seg: 5, jitter: 0.02, seed: 7 }));
    b.pop();
  });
  P.items++; // 银汤盅
}

// ================================================================ 画 / 镜 / 烛台 / 花瓶
function buildPortrait(b, P, w, h, seed) {
  at(b, 0, 0, 0, () => {
    // 金框（外框 + 内线）
    frameZ(b, w, h, 0.17, 0.16, PAL.gold, MT.gold, 0);
    frameZ(b, w - 0.30, h - 0.30, 0.055, 0.09, PAL.goldHi, MT.gold, 0.05);
    // 画布（深绿褐）+ 一点天光
    quadFace(b, -w / 2 + 0.17, w / 2 - 0.17, -h / 2 + 0.17, h / 2 - 0.17, 0.012, rgb('#2e3226'), MT.panel);
    b.quadc(
      [-w / 2 + 0.17, -h / 2 + 0.17, 0.02], [w / 2 - 0.17, -h / 2 + 0.17, 0.02],
      [w / 2 - 0.17, h / 2 - 0.17, 0.02], [-w / 2 + 0.17, h / 2 - 0.17, 0.02],
      rgb('#4a5238'), rgb('#6a6a48'), rgb('#9a9166'), rgb('#5e6244'), MT.panel);
    // 人物：肩 + 头 + 衣
    const hh = h * 0.44;
    at(b, 0, -h * 0.10, 0.04, () => {
      // 肩/衣
      b.quad([-w * 0.30, -h * 0.30, 0], [w * 0.30, -h * 0.30, 0], [w * 0.22, h * 0.06, 0], [-w * 0.22, h * 0.06, 0],
        rgb('#6d2a34'), MT.fabric, [0, 0, 1]);
      // 颈 / 头
      at(b, 0, h * 0.13, 0.05, () => {
        ellipsoid(b, hh * 0.28, hh * 0.36, hh * 0.06, 8, 4, rgb('#c8a084'), MT.panel);
      });
      // 头发
      at(b, 0, h * 0.255, 0.03, () => {
        ellipsoid(b, hh * 0.32, hh * 0.24, hh * 0.07, 8, 3, rgb('#4a3324'), MT.panel);
      });
      // 领口金饰
      at(b, 0, h * 0.055, 0.075, () => box(b, w * 0.28, 0.05, 0.03, PAL.gold, MT.goldSoft));
    });
    // 底部黄铜名牌（几何，不写字）
    at(b, 0, -h / 2 + 0.03, 0.12, () => {
      box(b, w * 0.34, 0.10, 0.03, PAL.gold, MT.gold);
      for (let i = 0; i < 4; i++) {
        at(b, -w * 0.10 + i * 0.07, 0, 0.02, () => box(b, 0.022, 0.06, 0.012, PAL.goldDk, MT.goldSoft));
      }
    });
    void seed;
  });
  P.items++; // 金框肖像画
}

// 壁镜（金框 + 微亮的镜面）
function buildMirror(b, P, w, h) {
  at(b, 0, 0, 0, () => {
    frameZ(b, w, h, 0.19, 0.17, PAL.gold, MT.gold, 0);
    frameZ(b, w - 0.34, h - 0.34, 0.05, 0.10, PAL.goldHi, MT.gold, 0.05);
    b.quadc(
      [-w / 2 + 0.19, -h / 2 + 0.19, 0.015], [w / 2 - 0.19, -h / 2 + 0.19, 0.015],
      [w / 2 - 0.19, h / 2 - 0.19, 0.015], [-w / 2 + 0.19, h / 2 - 0.19, 0.015],
      rgb('#55637a'), rgb('#7c8ea4'), rgb('#98aabb'), rgb('#6a7c92'), MT.mirror);
    // 镜面斜光条
    for (let i = 0; i < 3; i++) {
      const x = -w * 0.22 + i * w * 0.20;
      b.quad([x, -h / 2 + 0.25, 0.02], [x + 0.22, -h / 2 + 0.25, 0.02], [x + 0.62, h / 2 - 0.25, 0.02], [x + 0.40, h / 2 - 0.25, 0.02],
        rgb('#b6c6d6'), [0.10, 0.9], [0, 0, 1]);
    }
  });
  P.items++; // 金框壁镜
}

// 墙上烛台（黄铜回旋臂 + 蜡烛）
function buildSconce(b, P) {
  at(b, 0, 0, 0, () => {
    lathe(b, [[0, 0], [0.20, 0.02], [0.24, 0.12], [0.16, 0.20], [0, 0.22]], 8, PAL.gold, MT.gold);
    at(b, 0, 0.20, 0.10, () => {
      tubePath(b, [[0, 0, 0], [0, 0.16, 0.22], [0, 0.34, 0.28]], 0.032, 4, PAL.gold, MT.gold, {});
      at(b, 0, 0.34, 0.30, () => {
        lathe(b, [[0, 0], [0.13, 0], [0.12, 0.05], [0.06, 0.06], [0.06, 0.10], [0, 0.10]], 8, PAL.gold, MT.gold);
        cylinder(b, 6, 0.05, 0.046, 0.28, PAL.candle, MT.candle, { y0: 0.10 });
        at(b, 0, 0.40, 0, () => sphere(b, 0.055, PAL.flame, MT.flame, { rings: 2, seg: 5, jitter: 0.06, seed: 51 }));
      });
    });
    // 背面反光片
    at(b, 0, 0.26, 0.03, () => {
      b.push(RZ(0.4));
      b.quad([-0.30, 0, 0], [0.30, 0, 0], [0.22, 0.34, 0], [-0.22, 0.34, 0], PAL.goldHi, MT.gold, [0, 0, 1]);
      b.pop();
    });
  });
  P.items++; // 黄铜壁烛台
}

// 大花瓶 + 花枝
function buildVase(b, P, x, y, z, s = 1, seed = 1) {
  const rnd = mulberry32(seed);
  at(b, x, y, z, () => {
    b.push(m4.scale([s, s, s]));
    lathe(b, [[0, 0], [0.26, 0], [0.24, 0.06], [0.34, 0.26], [0.30, 0.52], [0.18, 0.64], [0.20, 0.70], [0.24, 0.74], [0, 0.74]], 12, PAL.porc, MT.porcelain, {
      colFn: (yy) => (yy > 0.18 && yy < 0.34 ? PAL.porcBlue : PAL.porc),
    });
    // 花枝
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + 0.3;
      const hh = 0.9 + rnd() * 0.7;
      const pts = [[0, 0.70, 0], [Math.cos(a) * 0.16 * s, 0.70 + hh * 0.5, Math.sin(a) * 0.16 * s],
        [Math.cos(a) * 0.34 * s, 0.70 + hh, Math.sin(a) * 0.34 * s]];
      tubePath(b, pts, 0.022, 4, PAL.leafDark, MT.plant, {});
      at(b, Math.cos(a) * 0.34 * s, 0.70 + hh, Math.sin(a) * 0.34 * s, () => {
        const pc = [PAL.pink, PAL.cream2, PAL.crim][i % 3];
        ellipsoid(b, 0.13, 0.10, 0.13, 6, 3, pc, MT.fabric);
      });
    }
    b.pop();
  });
  P.items++; // 青花瓶与花枝
}

// ================================================================ 盆栽
function buildPalm(b, P, x, z, sc, seed) {
  const rnd = mulberry32(seed);
  at(b, x, 0, z, () => {
    // 陶盆（金箍）
    lathe(b, [[0, 0], [0.66, 0], [0.72, 0.10], [0.84, 0.62], [0.78, 0.96], [0.90, 1.02], [0.86, 1.10], [0, 1.10]], 12, PAL.ceramic, MT.ceramic);
    at(b, 0, 0.82, 0, () => torus(b, 0.83, 0.045, 14, 3, PAL.goldDk, MT.goldSoft, 'y'));
    at(b, 0, 1.02, 0, () => disc(b, 0.80, 12, PAL.soil, MT.plant));
    // 树干
    const top = 3.9 * sc;
    tubePath(b, [[0, 1.02, 0], [0.14, 1.6, 0.10], [-0.10, 2.4, 0.14], [0.10, 3.2, 0.04], [0, top, 0]],
      (t) => 0.22 * (1 - 0.42 * t), 6, PAL.woodLight, MT.wood, {});
    // 棕榈叶
    const nF = 7;
    for (let i = 0; i < nF; i++) {
      const a = (i / nF) * TAU + 0.35;
      const tilt = 0.30 + 0.55 * rnd();
      const len = (2.8 + 1.0 * rnd()) * sc;
      const crown = [0.04, top + 0.06, 0.02];
      const pts = [], wid = [];
      for (let k = 0; k <= 5; k++) {
        const t = k / 5;
        const droop = Math.pow(t, 1.8) * 1.9 * sc;
        const rr = len * t;
        pts.push([
          crown[0] + Math.cos(a) * rr * Math.cos(tilt),
          crown[1] + Math.sin(tilt) * len * t * 0.62 - droop,
          crown[2] + Math.sin(a) * rr * Math.cos(tilt),
        ]);
        wid.push(0.06 + 0.86 * Math.sin(Math.PI * Math.min(1, t * 1.12)));
      }
      ribbon(b, pts, wid, i % 2 ? PAL.leaf : PAL.leafLight, MT.plant);
      tubePath(b, pts, 0.04, 4, PAL.leafDark, MT.plant, {});
    }
  });
  P.items++; // 陶盆棕榈
}

function buildFern(b, P, x, z, sc, seed) {
  const rnd = mulberry32(seed);
  at(b, x, 0, z, () => {
    lathe(b, [[0, 0], [0.34, 0], [0.38, 0.08], [0.44, 0.40], [0.40, 0.52], [0, 0.54]], 10, PAL.porc, MT.porcelain, {
      colFn: (y) => (y > 0.30 ? PAL.porcBlue : PAL.porc),
    });
    at(b, 0, 0.48, 0, () => disc(b, 0.36, 10, PAL.soil, MT.plant));
    for (let i = 0; i < 13; i++) {
      const a = (i / 13) * TAU + 0.2;
      const ll = (0.55 + 0.35 * rnd()) * sc;
      at(b, 0, 0.50, 0, () => {
        b.push(RY(a));
        b.push(RZ(-0.75));
        ribbon(b, [[0, 0, 0], [ll * 0.5, 0.16 * sc, 0], [ll, 0.22 * sc, 0]], [0.10, 0.20, 0.05], PAL.leafLight, MT.plant, [0, 0, 1]);
        b.pop(); b.pop();
      });
    }
  });
  P.items++; // 蕨类盆栽
}

// ================================================================ 吊灯
function buildChandelier(b, P, z, scale, tiers, seed) {
  const yTop = 17.92;
  const yBody = 13.0 + (1 - scale) * 0.6;
  at(b, 0, 0, z, () => {
    // 顶部吸盘 + 吊链
    at(b, 0, yTop, 0, () => {
      lathe(b, [[0, 0.0], [0.34, 0.0], [0.38, 0.10], [0.14, 0.22], [0, 0.24]], 10, PAL.gold, MT.gold);
    });
    at(b, 0, (yTop + yBody + 1.2) / 2, 0, () => {
      cylinder(b, 6, 0.045, 0.045, yTop - yBody - 1.15, PAL.gold, MT.gold, { y0: 0 });
    });
    // 主体
    at(b, 0, yBody, 0, () => {
      b.push(m4.scale([scale, scale, scale]));
      lathe(b, [[0, -0.9], [0.34, -0.86], [0.28, -0.5], [0.20, -0.2], [0.34, 0.2], [0.24, 0.5], [0.30, 0.8], [0.16, 1.1], [0, 1.22]], 10, PAL.gold, MT.gold);
      // 挂环 + 坠饰
      for (let k = 0; k < 8; k++) {
        const a = (k / 12) * TAU;
        at(b, Math.cos(a) * 0.30, -0.86, Math.sin(a) * 0.30, () => {
          sphere(b, 0.075, PAL.goldHi, MT.gold, { rings: 2, seg: 5, jitter: 0.03, seed: 61 + k });
        });
      }
      b.pop();

      // ---- 第一层烛环
      const R1 = 1.85 * scale;
      at(b, 0, 0, 0, () => torus(b, R1, 0.075, 16, 2, PAL.gold, MT.gold, 'y'));
      const n1 = tiers === 2 ? 10 : 8;
      for (let k = 0; k < n1; k++) {
        const a = (k / n1) * TAU + 0.15;
        const px = Math.cos(a) * R1, pz = Math.sin(a) * R1;
        // 支臂
        tubePath(b, [[Math.cos(a) * 0.28, 0.18, Math.sin(a) * 0.28], [px * 0.72, 0.05, pz * 0.72], [px, 0.02, pz]], 0.032, 4, PAL.gold, MT.gold, {});
        at(b, px, 0.03, pz, () => {
          lathe(b, [[0, 0], [0.13, 0], [0.06, 0.05], [0.06, 0.10], [0, 0.10]], 6, PAL.gold, MT.gold);
          cylinder(b, 5, 0.048, 0.044, 0.30, PAL.candle, MT.candle, { y0: 0.10 });
          at(b, 0, 0.42, 0, () => sphere(b, 0.062, PAL.flame, MT.flame, { rings: 2, seg: 4, jitter: 0.06, seed: 71 + k }));
        });
      }
      // ---- 第二层（小）
      if (tiers === 2) {
        const R2 = 1.05 * scale;
        at(b, 0, -0.86, 0, () => torus(b, R2, 0.06, 12, 2, PAL.gold, MT.gold, 'y'));
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * TAU + 0.6;
          const px = Math.cos(a) * R2, pz = Math.sin(a) * R2;
          at(b, px, -0.83, pz, () => {
            cylinder(b, 5, 0.10, 0.08, 0.06, PAL.gold, MT.gold, { y0: 0 });
            cylinder(b, 5, 0.042, 0.040, 0.26, PAL.candle, MT.candle, { y0: 0.06 });
            at(b, 0, 0.34, 0, () => sphere(b, 0.055, PAL.flame, MT.flame, { rings: 2, seg: 4, jitter: 0.06, seed: 81 + k }));
          });
        }
      }
      // 底坠
      at(b, 0, -1.0, 0, () => {
        lathe(b, [[0, -0.34], [0.16, -0.20], [0.20, -0.05], [0.10, 0.02], [0, 0.04]], 10, PAL.gold, MT.gold);
        at(b, 0, -0.40, 0, () => sphere(b, 0.12, PAL.goldHi, MT.gold, { rings: 2, seg: 6, jitter: 0.05, seed: 91 }));
      });
    });
  });
  void seed;
  P.items++; // 黄铜烛式吊灯
}

// 餐椅（比扶手椅便宜：无翼、无绗缝）
function buildChair(b, o = {}) {
  const col = o.col ?? PAL.velvet, dk = o.dk ?? PAL.velvetDk;
  const len = 1.10, dep = 1.05;
  const hw = len / 2, hd = dep / 2;
  at(b, 0, 0.10, 0, () => box(b, len - 0.10, 0.20, dep - 0.10, PAL.woodDk, MT.woodDk));
  at(b, 0, 0.42, 0.5 - 0.02, () => box(b, len - 0.12, 0.24, dep - 0.24, col, MT.velvet, { topCol: mulc(col, 1.10) }));
  at(b, 0, 0.90, -hd + 0.14, () => box(b, len - 0.16, 1.20, 0.24, dk, MT.velvet));
  at(b, 0, 1.44, -hd + 0.14, () => box(b, len - 0.10, 0.06, 0.30, PAL.gold, MT.gold));
  for (const sx of [-1, 1]) {
    at(b, sx * (hw - 0.06), 0.44, 0.04, () => box(b, 0.10, 0.62, dep - 0.10, PAL.gold, MT.goldSoft));
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      at(b, sx * (hw - 0.10), 0, sz * (hd - 0.10), () => {
        lathe(b, [[0, 0], [0.09, 0.01], [0.06, 0.20], [0.09, 0.24], [0, 0.26]], 6, PAL.goldDk, MT.goldSoft);
      });
    }
  }
}

// 中央圆茶台（轴线上、主吊灯正下方）：花盘 + 茶点
function buildCenterTable(b, P) {
  const seed = R.seed + 91;
  const rnd = mulberry32(seed);
  at(b, 0.15, 0, 13.15, () => {
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU + 0.4;
      at(b, Math.cos(a) * 0.72, 0, Math.sin(a) * 0.72, () => {
        lathe(b, [[0, 0], [0.15, 0.02], [0.11, 0.30], [0.09, 0.58], [0.16, 0.64], [0, 0.66]], 7, PAL.gold, MT.gold);
      });
    }
    at(b, 0, 0.66, 0, () => {
      lathe(b, [[0, 0], [0.44, 0.02], [0.34, 0.14], [0.30, 0.22], [0, 0.24]], 9, PAL.gold, MT.gold);
      at(b, 0, 0.30, 0, () => {
        cylinder(b, 16, 1.72, 1.72, 0.14, PAL.marble, MT.marble, { y0: 0 });
        at(b, 0, 0.14, 0, () => torus(b, 1.72, 0.045, 16, 2, PAL.gold, MT.gold, 'y'));
      });
      // 中央银花盘
      at(b, 0, 0.46, 0, () => {
        lathe(b, [[0, 0], [0.52, 0.02], [0.60, 0.22], [0.46, 0.30], [0, 0.32]], 11, PAL.silver, MT.silver);
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * TAU + 0.2;
          const rr = 0.10 + 0.24 * rnd();
          const hh = 0.34 + 0.42 * rnd();
          const px = Math.cos(a) * rr, pz = Math.sin(a) * rr;
          tubePath(b, [[px * 0.4, 0.24, pz * 0.4], [px * 0.8, 0.24 + hh * 0.5, pz * 0.8], [px * 1.5, 0.24 + hh, pz * 1.5]], 0.022, 4, PAL.leafDark, MT.plant, {});
          at(b, px * 1.5, 0.24 + hh, pz * 1.5, () => {
            ellipsoid(b, 0.15, 0.11, 0.15, 5, 2, [PAL.pink, PAL.cream2, PAL.crim, PAL.goldHi][i % 4], MT.fabric);
          });
        }
      });
      // 台面四周的小碟与杯
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + 0.7;
        buildCup(b, Math.cos(a) * 1.30, 0.44, Math.sin(a) * 1.30, 0.95);
      }
      // 小蛋糕塔
      at(b, -1.05, 0.44, 0.55, () => {
        cylinder(b, 10, 0.26, 0.24, 0.05, PAL.porc, MT.porcelain, { y0: 0 });
        at(b, 0, 0.05, 0, () => cylinder(b, 10, 0.20, 0.19, 0.14, PAL.cream2, MT.food, { y0: 0 }));
        at(b, 0, 0.19, 0, () => cylinder(b, 10, 0.21, 0.17, 0.05, PAL.pink, MT.food, { y0: 0 }));
        at(b, 0, 0.24, 0, () => sphere(b, 0.05, PAL.red, MT.food, { rings: 2, seg: 4, jitter: 0.1, seed: 44 }));
      });
      // 两只小烛台
      for (const sx of [-1, 1]) {
        at(b, sx * 0.95, 0.44, -0.75, () => {
          lathe(b, [[0, 0], [0.09, 0], [0.06, 0.06], [0.05, 0.26], [0.09, 0.30], [0, 0.32]], 7, PAL.gold, MT.gold);
          cylinder(b, 5, 0.045, 0.042, 0.24, PAL.candle, MT.candle, { y0: 0.30 });
          at(b, 0, 0.58, 0, () => sphere(b, 0.055, PAL.flame, MT.flame, { rings: 2, seg: 4, jitter: 0.06, seed: 45 + sx }));
        });
      }
    });
  });
  P.items++; // 中央圆茶台
  P.items++; // 中央花盘
  P.items++; // 台面茶点
}

// ================================================================ 其它陈设
function buildConsole(b, P, w, h, d) {
  at(b, 0, 0, 0, () => {
    at(b, 0, h - 0.08, 0, () => box(b, w, 0.16, d, PAL.marble, MT.marble, { topCol: PAL.marble }));
    at(b, 0, h - 0.20, 0, () => box(b, w - 0.06, 0.10, d - 0.04, PAL.gold, MT.gold));
    at(b, 0, h - 0.44, 0, () => box(b, w - 0.16, 0.34, d - 0.14, PAL.woodDk, MT.woodDk));
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        at(b, sx * (w / 2 - 0.16), 0, sz * (d / 2 - 0.14), () => {
          lathe(b, [[0, 0], [0.10, 0.02], [0.07, h * 0.5], [0.10, h - 0.4], [0, h - 0.36]], 8, PAL.gold, MT.gold);
        });
      }
    }
    // 底部横撑
    at(b, 0, 0.24, 0, () => {
      box(b, w - 0.40, 0.08, 0.08, PAL.gold, MT.goldSoft);
      box(b, 0.08, 0.08, d - 0.28, PAL.gold, MT.goldSoft);
    });
  });
  P.items++; // 大理石面长条几
}

// 落地灯（黄铜杆 + 奶油灯罩）
function buildFloorLamp(b, P, x, z) {
  at(b, x, 0, z, () => {
    lathe(b, [[0, 0], [0.36, 0], [0.34, 0.08], [0.10, 0.16], [0.06, 0.30], [0, 0.32]], 10, PAL.gold, MT.gold);
    cylinder(b, 8, 0.05, 0.05, 2.3, PAL.gold, MT.gold, { y0: 0.30 });
    at(b, 0, 2.62, 0, () => {
      lathe(b, [[0.52, -0.30], [0.54, -0.20], [0.44, 0.02], [0.26, 0.16], [0, 0.20]], 12, PAL.cream, [0.26, 0.34]);
      at(b, 0, -0.16, 0, () => sphere(b, 0.13, PAL.flame, MT.glow, { rings: 2, seg: 6, jitter: 0.05, seed: 12 }));
    });
    // 小托架
    at(b, 0, 1.10, 0, () => {
      b.push(RZ(-0.1));
      box(b, 0.36, 0.05, 0.36, PAL.gold, MT.goldSoft);
      b.pop();
    });
  });
  P.items++; // 黄铜落地灯
}

// 高座钟
function buildClock(b, P, x, z) {
  const h = 3.4;
  at(b, x, 0, z, () => {
    at(b, 0, 0.20, 0, () => box(b, 1.06, 0.40, 0.62, PAL.woodDk, MT.woodDk));
    at(b, 0, h / 2, 0, () => box(b, 1.00, h, 0.56, PAL.wood, MT.wood));
    // 拱顶
    at(b, 0, h, 0, () => {
      b.push(RX(Math.PI / 2));
      b.push(m4.scale([1.0, 1.0, 1.0]));
      cylinder(b, 12, 0.52, 0.52, 0.28, PAL.woodDk, MT.woodDk, { y0: -0.52, caps: true });
      b.pop(); b.pop();
      at(b, 0, 0, 0.29, () => torus(b, 0.50, 0.04, 14, 3, PAL.gold, MT.gold, 'z'));
    });
    // 钟面
    at(b, 0, h - 0.55, 0.30, () => {
      discFace(b, 0.36, 18, PAL.cream, MT.marble);
      at(b, 0, 0, 0.01, () => torus(b, 0.36, 0.035, 18, 3, PAL.gold, MT.gold, 'z'));
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * TAU;
        at(b, Math.cos(a) * 0.28, Math.sin(a) * 0.28, 0.02, () => box(b, 0.035, 0.09, 0.02, PAL.goldDk, MT.goldSoft));
      }
      at(b, 0, 0, 0.03, () => {
        b.push(RZ(1.2));
        box(b, 0.03, 0.24, 0.02, PAL.woodDk, MT.woodDk);
        b.pop();
      });
      at(b, 0, 0, 0.035, () => {
        b.push(RZ(2.6));
        box(b, 0.03, 0.16, 0.02, PAL.woodDk, MT.woodDk);
        b.pop();
      });
    });
    // 钟摆窗
    at(b, 0, h * 0.45, 0.29, () => {
      quadFace(b, -0.26, 0.26, -0.85, 0.85, 0, rgb('#2b2416'), MT.panel);
      cylinder(b, 6, 0.035, 0.035, 0.9, PAL.gold, MT.gold, { y0: 0.0 });
      at(b, 0, -0.80, 0, () => discFace(b, 0.13, 12, PAL.gold, MT.gold));
    });
    // 顶部金饰
    at(b, 0, h + 0.30, 0, () => sphere(b, 0.13, PAL.goldHi, MT.gold, { rings: 2, seg: 6, jitter: 0.05, seed: 13 }));
  });
  P.items++; // 高座钟
}

// 卷轴
function buildScrolls(b, P, x, z, seed) {
  const rnd = mulberry32(seed);
  at(b, x, 0, z, () => {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const r = 0.20 + rnd() * 0.16;
      const len = 1.1 + rnd() * 0.5;
      at(b, Math.cos(a) * r, 0.16, Math.sin(a) * r, () => {
        b.push(RZ(Math.PI / 2));
        b.push(RY(rnd() * TAU));
        cylinder(b, 10, 0.11, 0.11, len, PAL.paper, MT.paper, { y0: -len / 2 });
        b.pop(); b.pop();
      });
    }
    // 两条丝带
    for (let i = 0; i < 2; i++) {
      at(b, -0.3 + i * 0.6, 0.20, 0.0, () => {
        b.push(RZ(Math.PI / 2));
        torus(b, 0.24, 0.035, 10, 3, i ? PAL.crim : PAL.gold, MT.cloth, 'z');
        b.pop();
      });
    }
  });
  P.items++; // 卷轴堆
}

// 地上书堆
function buildBookPile(b, P, x, z, seed) {
  const rnd = mulberry32(seed);
  at(b, x, 0, z, () => {
    const cols = [PAL.crimDk, PAL.blue, PAL.oliveDk, PAL.creamDk, PAL.woodDk, PAL.goldDk];
    let y = 0;
    for (let i = 0; i < 7; i++) {
      const hh = 0.10 + rnd() * 0.08;
      const w = 0.46 + rnd() * 0.16;
      const d = 0.34 + rnd() * 0.12;
      at(b, (rnd() - 0.5) * 0.10, y + hh / 2, (rnd() - 0.5) * 0.10, () => {
        b.push(RY((rnd() - 0.5) * 0.5));
        box(b, w, hh, d, cols[Math.floor(rnd() * cols.length)], MT.paper, { topCol: PAL.cream2 });
        b.pop();
      });
      y += hh;
    }
  });
  P.items++; // 地上书堆
}

// 铜制望远镜（三脚架，指向窗外）
function buildTelescope(b, P, x, z) {
  at(b, x, 0, z, () => {
    // 三条腿
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU + 0.5;
      bar3(b, [0, 1.32, 0], [Math.cos(a) * 0.62, 0.02, Math.sin(a) * 0.62], 0.06, 0.06, PAL.brassLeg ?? PAL.goldDk, MT.goldSoft);
      at(b, Math.cos(a) * 0.62, 0.03, Math.sin(a) * 0.62, () => sphere(b, 0.07, PAL.goldDk, MT.goldSoft, { rings: 2, seg: 5, jitter: 0.03, seed: 14 + k }));
    }
    at(b, 0, 1.32, 0, () => {
      sphere(b, 0.12, PAL.gold, MT.gold, { rings: 2, seg: 6, jitter: 0.03, seed: 15 });
    });
    // 镜筒：朝 +z 并略微上仰
    at(b, 0, 1.60, 0.10, () => {
      b.push(RX(-Math.PI / 2 + 0.30));
      lathe(b, [[0.10, -0.55], [0.14, -0.30], [0.16, 0.30], [0.20, 0.62], [0.24, 0.72], [0.20, 0.74], [0.16, 0.70], [0.12, 0.40], [0.08, -0.30], [0.06, -0.55]], 12, PAL.gold, MT.gold);
      // 目镜
      b.push(RY(0));
      b.pop();
      b.pop();
      at(b, 0, 0, -0.60, () => {
        b.push(RX(-Math.PI / 2 + 0.30));
        lathe(b, [[0.06, 0], [0.10, 0.06], [0.08, 0.14], [0, 0.16]], 10, PAL.goldDk, MT.goldSoft);
        b.pop();
      });
      at(b, 0, 0, 0.66, () => {
        b.push(RX(-Math.PI / 2 + 0.30));
        cylinder(b, 14, 0.24, 0.22, 0.06, PAL.mirror, [0.20, 0.95], { y0: 0 });
        b.pop();
      });
    });
  });
  P.items++; // 黄铜望远镜
}

// 睡猫
function buildCat(b, P, x, y, z) {
  at(b, x, y, z, () => {
    b.push(RY(0.5));
    // 身
    ellipsoid(b, 0.34, 0.20, 0.52, 9, 5, PAL.cream, MT.fabric);
    // 头
    at(b, -0.10, 0.02, 0.46, () => {
      ellipsoid(b, 0.19, 0.17, 0.18, 8, 4, PAL.cream, MT.fabric);
      // 耳朵
      for (const s of [-1, 1]) {
        at(b, s * 0.10, 0.15, 0.0, () => {
          b.tri([-0.06, 0, 0.05], [0.06, 0, 0.05], [0, 0.15, 0], PAL.cream, MT.fabric, [0, 0, 1], [0, 0, 1], [0, 0, 1]);
          b.tri([0.06, 0, 0.05], [-0.06, 0, 0.05], [0, 0.15, 0], PAL.cream, MT.fabric, [0, 0, -1], [0, 0, -1], [0, 0, -1]);
        });
      }
      // 鼻/眼（闭眼）
      at(b, 0, -0.02, 0.17, () => sphere(b, 0.03, PAL.pink, MT.fabric, { rings: 2, seg: 4, jitter: 0.05, seed: 16 }));
    });
    // 卷尾
    tubePath(b, [[0.02, -0.02, -0.52], [0.30, 0.02, -0.42], [0.36, 0.02, -0.10]], 0.085, 5, PAL.cream, MT.fabric, {});
    // 花纹
    for (let i = 0; i < 4; i++) {
      at(b, 0.0, 0.16, -0.30 + i * 0.18, () => { box(b, 0.22, 0.03, 0.10, PAL.cake, MT.fabric); });
    }
    b.pop();
  });
  P.items++; // 睡猫
}

// 蓝白瓷盘墙饰
function buildPlateWall(b, P) {
  at(b, 0, 0, 0, () => {
    for (let k = 0; k < 5; k++) {
      const a = (k / 4 - 0.5) * 1.9;
      at(b, Math.sin(a) * 1.0, Math.cos(a) * 1.0, 0, () => {
        b.push(RZ(-a));
        discFace(b, 0.32, 10, PAL.porc, MT.porcelain);
        at(b, 0, 0, 0.01, () => torus(b, 0.32, 0.03, 10, 2, PAL.porcBlue, MT.porcelain, 'z'));
        discFace2(b, 0.13, 8, PAL.porcBlue, MT.porcelain);
        b.pop();
      });
    }
  });
  P.items++; // 瓷盘墙饰
}
function discFace2(b, r, seg, col, mat) {
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    b.tri([0, 0, 0.015], [Math.cos(a0) * r, Math.sin(a0) * r, 0.015], [Math.cos(a1) * r, Math.sin(a1) * r, 0.015], col, mat, [0, 0, 1], [0, 0, 1], [0, 0, 1]);
  }
}

// 小天车（点心车）
function buildTrolley(b, P, x, z) {
  at(b, x, 0, z, () => {
    for (const yy of [0.42, 0.86]) {
      at(b, 0, yy, 0, () => box(b, 1.30, 0.08, 0.74, PAL.marble, MT.marble, { topCol: PAL.marble }));
      at(b, 0, yy - 0.06, 0, () => box(b, 1.34, 0.06, 0.78, PAL.gold, MT.gold));
    }
    for (const sx of [-1, 1]) {
      at(b, sx * 0.58, 0.62, 0, () => box(b, 0.06, 0.50, 0.66, PAL.gold, MT.gold));
      for (const sz of [-1, 1]) {
        at(b, sx * 0.58, 0.09, sz * 0.26, () => {
          b.push(RZ(Math.PI / 2));
          torus(b, 0.09, 0.035, 8, 3, PAL.goldDk, MT.goldSoft, 'z');
          b.pop();
        });
      }
    }
    // 上面的小蛋糕与杯
    at(b, 0, 0.90, 0, () => {
      cylinder(b, 10, 0.24, 0.24, 0.05, PAL.porc, MT.porcelain, { y0: 0 });
      at(b, 0, 0.05, 0, () => cylinder(b, 10, 0.18, 0.18, 0.16, PAL.cream2, MT.food, { y0: 0 }));
      at(b, 0, 0.21, 0, () => cylinder(b, 10, 0.19, 0.16, 0.05, PAL.pink, MT.food, { y0: 0 }));
      at(b, 0, 0.26, 0, () => sphere(b, 0.05, PAL.red, MT.food, { rings: 2, seg: 4, jitter: 0.1, seed: 33 }));
    });
    at(b, 0.42, 0.90, 0.0, () => {
      buildTeapot(b, 0, 0, 0, 0.75);
    });
  });
  P.items++; // 点心手推车
}

// 边几 + 书 + 茶杯
function buildSideTable(b, P) {
  at(b, 0, 0, 0, () => {
    at(b, 0, 0.60, 0, () => box(b, 1.5, 0.14, 1.1, PAL.woodDk, MT.woodDk, { topCol: PAL.marble }));
    at(b, 0, 0.52, 0, () => box(b, 1.44, 0.06, 1.04, PAL.gold, MT.gold));
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        at(b, sx * 0.62, 0, sz * 0.44, () => {
          lathe(b, [[0, 0], [0.08, 0.01], [0.06, 0.5], [0, 0.54]], 8, PAL.gold, MT.gold);
        });
      }
    }
    at(b, 0, 0.20, 0, () => box(b, 1.20, 0.05, 0.86, PAL.gold, MT.goldSoft));
    // 上面：书 + 咖啡杯
    at(b, -0.26, 0.72, 0.02, () => {
      box(b, 0.52, 0.10, 0.38, PAL.crimDk, MT.paper, { topCol: PAL.cream2 });
    });
    at(b, -0.22, 0.80, 0.0, () => {
      b.push(RY(0.25));
      buildCup(b, 0, 0, 0, 0.85);
      b.pop();
    });
  });
  P.items++; // 边几 + 书与茶杯
}

// 墙角小凳（脚凳）
function buildOttoman(b, P, x, z) {
  at(b, x, 0, z, () => {
    at(b, 0, 0.40, 0, () => {
      ellipsoid(b, 0.62, 0.34, 0.62, 12, 4, PAL.velvet, MT.velvet);
    });
    at(b, 0, 0.70, 0, () => torus(b, 0.55, 0.05, 14, 3, PAL.gold, MT.goldSoft, 'y'));
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + 0.8;
      at(b, Math.cos(a) * 0.34, 0, Math.sin(a) * 0.34, () => {
        lathe(b, [[0, 0], [0.09, 0.02], [0.06, 0.12], [0, 0.14]], 6, PAL.goldDk, MT.goldSoft);
      });
    }
  });
  P.items++; // 绿丝绒脚凳
}

// 窗台陈设
function buildSill(b, P) {
  const y = 1.50;
  // 靠窗的丝绒坐垫三只
  for (let i = 0; i < 3; i++) {
    const x = -12.4 + i * 2.6;
    at(b, x, y, 25.15, () => {
      b.push(RX(-0.32));
      box(b, 1.5, 0.26, 0.80, i === 1 ? PAL.crim : PAL.velvet, MT.fabric, { topCol: mulc(i === 1 ? PAL.crim : PAL.velvet, 1.1) });
      b.pop();
      at(b, 0, 0, -0.30, () => box(b, 1.5, 0.02, 0.06, PAL.gold, MT.goldSoft));
    });
  }
  P.items++; // 窗台丝绒垫

  // 窗台茶盘
  at(b, 2.6, y, 25.15, () => {
    lathe(b, [[0, 0], [0.78, 0], [0.80, 0.035], [0.74, 0.045], [0.74, 0.02], [0.05, 0.02], [0, 0.02]], 18, PAL.silver, MT.silver);
    buildTeapot(b, -0.24, 0.03, 0.0, 0.80);
    buildCup(b, 0.34, 0.03, 0.16, 0.82);
    buildCup(b, 0.20, 0.03, -0.32, 0.82);
  });
  P.items++; // 窗台茶盘

  // 窗台兰花
  at(b, -5.6, y, 25.20, () => {
    lathe(b, [[0, 0], [0.26, 0], [0.30, 0.06], [0.34, 0.34], [0.30, 0.40], [0, 0.40]], 10, PAL.porc, MT.porcelain, {
      colFn: (yy) => (yy > 0.26 ? PAL.porcBlue : PAL.porc),
    });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      const pts = [[0, 0.32, 0], [Math.cos(a) * 0.22, 0.52, Math.sin(a) * 0.22], [Math.cos(a) * 0.40, 0.74, Math.sin(a) * 0.40]];
      tubePath(b, pts, 0.022, 4, PAL.leafDark, MT.plant, {});
      at(b, Math.cos(a) * 0.40, 0.78, Math.sin(a) * 0.40, () => {
        ellipsoid(b, 0.11, 0.09, 0.11, 6, 3, PAL.pink, MT.fabric);
      });
    }
  });
  P.items++; // 窗台兰花

  // 窗台摊开的书
  at(b, 6.4, y, 25.10, () => {
    b.push(RX(-0.1));
    box(b, 0.70, 0.04, 0.50, PAL.cream2, MT.paper);
    at(b, -0.18, 0.03, 0, () => { b.push(RZ(0.08)); box(b, 0.34, 0.02, 0.48, PAL.paper, MT.paper); b.pop(); });
    at(b, 0.18, 0.03, 0, () => { b.push(RZ(-0.08)); box(b, 0.34, 0.02, 0.48, PAL.paper, MT.paper); b.pop(); });
    b.pop();
  });
  P.items++; // 窗台摊开的书

  // 睡猫
  buildCat(b, P, -1.4, y, 25.10);
}

// ================================================================ 主入口
export function buildTearoomAssets(b, ctx) {
  const S = {
    wallIn: PAL.wall, wallInMat: MT.wall,
    wallOut: C.ivory, wallOutMat: [0.02, 0.34],
    floor: PAL.wood, floorTop: PAL.woodLight, floorMat: MT.wood,
    ceil: rgb('#b5a077'), ceilMat: [0.075, 0.11],
    trim: PAL.gold, trimMat: MT.gold,
    skirting: PAL.woodDk, skirtingMat: MT.woodDk,
    pilasterCol: PAL.cream, pilasterMat: MT.panel,
    pilasterZ: PIL_Z,
    mullions: 4, transomY: 9.2,   // 4 道竖棂 = 5 根棂条，中央留出 6 m 的大玻璃（体检射线 x=0 必须穿得出去）
    mullionCol: PAL.bronze, mullionMat: MT.goldSoft,
    sillCol: PAL.marble, sillMat: MT.marble,
    beamCol: PAL.cream, beamMat: MT.panel,
    revCol: mixc(PAL.cream, PAL.gold, 0.25), revMat: [0.05, 0.3],
    corniceCol: PAL.gold, corniceMat: MT.goldSoft,
  };
  buildRoomShell(b, ctx, R, S);

  const P = { items: 0, rnd: mulberry32(R.seed | 0) };
  const rnd = P.rnd;

  // ---- 结构内的装饰
  buildFloor(b, P);
  buildWalls(b, P);
  buildCeiling(b, P);
  buildCurtains(b, P);
  buildSill(b, P);

  // ---- 轴线中央的圆茶台（主吊灯正下方，从桥上透过 13 m 拱门一眼看到）
  buildCenterTable(b, P);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.35;
    atR(b, 0.15 + Math.cos(a) * 2.55, 0, 13.15 + Math.sin(a) * 2.55, -(Math.PI / 2 + a), () => buildChair(b, { col: PAL.velvet }));
    P.items++; // 中央茶台餐椅
  }

  // ---- 茶座区（签名：绿丝绒沙发角 + 三层点心架）
  buildTeaTable(b, P);
  buildDessertStand(b, P);
  buildTeaSet(b, P);
  buildCakeDome(b, P);
  buildCandelabra(b, P, 1.30, 0.905, 20.72);

  // 沙发 A（面向 +x，背朝左墙）
  atR(b, -1.55, 0, 20.85, Math.PI / 2, () => {
    buildSofa(b, { len: 3.0, dep: 1.32 });
    // 抱枕
    at(b, -1.05, 0.78, -0.34, () => { b.push(RX(0.22)); b.push(RZ(0.10)); buildCushion(b, 0.62, 0.42, 0.16, PAL.blue, { gold: true }); b.pop(); b.pop(); });
    at(b, 0.98, 0.78, -0.34, () => { b.push(RX(0.22)); b.push(RZ(-0.10)); buildCushion(b, 0.62, 0.42, 0.16, PAL.crim, { tassel: true }); b.pop(); b.pop(); });
    at(b, 0.0, 0.78, -0.36, () => { b.push(RX(0.20)); buildCushion(b, 0.70, 0.46, 0.16, PAL.cream2, {}); b.pop(); });
  });
  P.items++; // 绿丝绒沙发（左）
  P.items++; // 沙发抱枕组

  // 沙发 B（面向 -x，背朝右墙）
  atR(b, 8.65, 0, 20.80, -Math.PI / 2, () => {
    buildSofa(b, { len: 3.2, dep: 1.34 });
    at(b, -1.10, 0.78, -0.35, () => { b.push(RX(0.22)); b.push(RZ(0.08)); buildCushion(b, 0.64, 0.44, 0.16, PAL.cream2, { gold: true }); b.pop(); b.pop(); });
    at(b, 1.05, 0.78, -0.35, () => { b.push(RX(0.22)); b.push(RZ(-0.08)); buildCushion(b, 0.64, 0.44, 0.16, PAL.blueHi, { gold: true }); b.pop(); b.pop(); });
    at(b, 0.0, 0.78, -0.36, () => { b.push(RX(0.20)); buildCushion(b, 0.70, 0.46, 0.16, PAL.velvetHi, {}); b.pop(); });
  });
  P.items++; // 绿丝绒沙发（右）
  P.items++; // 沙发抱枕组

  // 两把「迎向窗外」的扶手椅
  atR(b, 1.55, 0, 23.35, 0, () => buildArmchair(b, { col: PAL.velvet, pillow: PAL.crim }));
  P.items++; // 扶手椅（窗左）
  atR(b, 5.75, 0, 23.35, 0.06, () => buildArmchair(b, { col: PAL.velvet, pillow: PAL.blue }));
  P.items++; // 扶手椅（窗右）

  // 贵妃榻：窗左侧，正对巨行星
  atR(b, -10.2, 0, 23.10, 0.04, () => {
    buildChaise(b, { len: 2.6, dep: 1.05 });
    at(b, 0.35, 0.78, -0.16, () => { b.push(RX(0.3)); buildCushion(b, 0.56, 0.40, 0.15, PAL.crim, { tassel: true }); b.pop(); });
    at(b, -0.45, 0.78, 0.10, () => { b.push(RX(0.24)); buildCushion(b, 0.52, 0.38, 0.15, PAL.cream2, {}); b.pop(); });
  });
  P.items++; // 贵妃榻

  // 脚凳 + 边几 + 落地灯
  buildOttoman(b, P, -4.35, 19.05);
  buildSideTable(b, P);

  // 近门的小坐区（一进门的左手边：看书/等人的位置）
  atR(b, -10.3, 0, 11.20, Math.PI / 2 + 0.12, () => {
    buildSofa(b, { len: 2.15, dep: 1.15, seats: 2 });
    at(b, -0.55, 0.78, -0.30, () => { b.push(RX(0.22)); b.push(RZ(0.10)); buildCushion(b, 0.50, 0.36, 0.14, PAL.crim, { gold: true }); b.pop(); b.pop(); });
    at(b, 0.55, 0.78, -0.30, () => { b.push(RX(0.22)); b.push(RZ(-0.10)); buildCushion(b, 0.50, 0.36, 0.14, PAL.blue, { tassel: true }); b.pop(); b.pop(); });
  });
  P.items++; // 近门双人沙发
  atR(b, -6.45, 0, 9.55, 0.0, () => {
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU + 0.6;
      at(b, Math.cos(a) * 0.44, 0, Math.sin(a) * 0.44, () => {
        lathe(b, [[0, 0], [0.07, 0.01], [0.05, 0.34], [0.06, 0.52], [0, 0.54]], 6, PAL.gold, MT.gold);
      });
    }
    at(b, 0, 0.54, 0, () => {
      cylinder(b, 12, 0.64, 0.64, 0.09, PAL.marble, MT.marble, { y0: 0 });
      at(b, 0, 0.09, 0, () => torus(b, 0.64, 0.035, 12, 2, PAL.gold, MT.gold, 'y'));
      buildCup(b, -0.16, 0.10, 0.10, 0.85);
    });
  });
  P.items++; // 近门小圆几
  buildFloorLamp(b, P, -6.55, 19.55);

  // ---- 左墙：书架 + 画 + 边几
  atR(b, -IX, 0, 6.35, Math.PI / 2, () => buildBookcase(b, P, 3.0, 3.9, 0.60, R.seed + 11));
  P.items++; // 书架（左·书）
  atR(b, -IX, 0, 16.60, Math.PI / 2, () => {
    buildBookcase(b, P, 3.2, 4.2, 0.64, R.seed + 12);
    // 顶上摆件：地球仪 + 一摞书
    at(b, -0.60, 4.20, 0.0, () => {
      lathe(b, [[0, 0], [0.26, 0.01], [0.10, 0.10], [0.06, 0.30], [0, 0.32]], 10, PAL.gold, MT.gold);
      at(b, 0, 0.46, 0, () => sphere(b, 0.30, PAL.blue, MT.marble, { rings: 3, seg: 8, jitter: 0.05, seed: 17 }));
      at(b, 0, 0.46, 0, () => torus(b, 0.34, 0.03, 12, 3, PAL.gold, MT.gold, 'z'));
    });
    at(b, 0.72, 4.20, 0.0, () => {
      for (let k = 0; k < 3; k++) box(b, 0.62 - k * 0.05, 0.09, 0.42, [PAL.crimDk, PAL.blue, PAL.oliveDk][k], MT.paper);
    });
  });
  P.items++; // 书架（左·摆件）
  P.items++; // 地球仪

  // 左墙肖像画
  atR(b, -IX, 9.35, 11.25, Math.PI / 2, () => buildPortrait(b, P, 2.3, 3.0, R.seed + 21));
  atR(b, -IX, 9.35, 18.60, Math.PI / 2, () => buildPortrait(b, P, 2.0, 2.7, R.seed + 22));

  // 左墙壁烛台
  atR(b, -IX, 6.25, 4.55, Math.PI / 2, () => buildSconce(b, P));
  atR(b, -IX, 6.25, 19.90, Math.PI / 2, () => buildSconce(b, P));

  // ---- 右墙：鎏金边柜 + 陈列柜 + 画 + 瓷盘
  atR(b, IX - 0.65, 0, 13.30, -Math.PI / 2, () => {
    buildSideboard(b, P, 4.4, 1.10, 0.80);
    // 台面陈设
    buildTureen(b, P, -1.30, 1.14, 0.0, 1.0);
    buildTureen(b, P, -0.35, 1.14, 0.06, 0.85);
    buildVase(b, P, 1.35, 1.14, 0.0, 0.9, R.seed + 31);
    // 高烛台两只
    for (const sx of [-1, 1]) {
      at(b, sx * 0.85, 1.14, 0.24, () => {
        lathe(b, [[0, 0], [0.14, 0], [0.12, 0.05], [0.06, 0.18], [0.05, 0.68], [0.10, 0.74], [0.06, 0.78], [0, 0.80]], 10, PAL.gold, MT.gold);
        cylinder(b, 6, 0.055, 0.05, 0.30, PAL.candle, MT.candle, { y0: 0.78 });
        at(b, 0, 1.12, 0, () => sphere(b, 0.06, PAL.flame, MT.flame, { rings: 2, seg: 5, jitter: 0.06, seed: 18 }));
      });
    }
    // 果盘
    at(b, 0.45, 1.14, 0.30, () => {
      lathe(b, [[0, 0], [0.30, 0.02], [0.42, 0.16], [0.36, 0.18], [0.24, 0.06], [0, 0.06]], 14, PAL.silver, MT.silver);
      const fc = [PAL.red, PAL.pink, PAL.cake, PAL.berry, PAL.pista];
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU;
        at(b, Math.cos(a) * 0.16, 0.13, Math.sin(a) * 0.16, () => sphere(b, 0.10, fc[i], MT.food, { rings: 2, seg: 5, jitter: 0.08, seed: 19 + i }));
      }
    });
  });
  P.items++; // 鎏金边柜
  P.items++; // 边柜银器与果盘
  P.items++; // 边柜高烛台

  // 右墙肖像 / 瓷盘
  atR(b, IX, 9.10, 9.60, -Math.PI / 2, () => buildPortrait(b, P, 2.1, 2.8, R.seed + 23));
  atR(b, IX, 7.55, 4.30, -Math.PI / 2, () => buildPlateWall(b, P));
  atR(b, IX, 6.25, 6.90, -Math.PI / 2, () => buildSconce(b, P));
  atR(b, IX, 6.25, 17.60, -Math.PI / 2, () => buildSconce(b, P));

  // 右墙陈列柜（玻璃门后青花瓷）
  atR(b, IX - 0.55, 0, 4.35, -Math.PI / 2, () => {
    at(b, 0, 0, 0, () => {
      at(b, 0, 1.30, 0, () => box(b, 2.4, 2.6, 0.70, PAL.woodDk, MT.woodDk));
      at(b, 0, 2.62, 0, () => box(b, 2.5, 0.12, 0.76, PAL.marble, MT.marble, { topCol: PAL.marble }));
      at(b, 0, 2.72, 0, () => box(b, 2.54, 0.05, 0.80, PAL.gold, MT.gold));
      // 玻璃门
      at(b, 0, 1.35, 0.36, () => quadFace(b, -1.10, 1.10, -1.16, 1.16, 0, rgb('#5d6d80'), [0.06, 0.95]));
      for (let k = -1; k <= 1; k++) {
        at(b, k * 0.55, 1.35, 0.38, () => box(b, 0.05, 2.36, 0.04, PAL.gold, MT.goldSoft));
      }
      at(b, 0, 1.35, 0.38, () => box(b, 2.24, 0.05, 0.04, PAL.gold, MT.goldSoft));
      // 层板 + 瓷器
      for (const yy of [0.62, 1.30, 1.98]) {
        at(b, 0, yy, 0.06, () => box(b, 2.2, 0.05, 0.58, PAL.wood, MT.wood));
      }
      for (let i = 0; i < 3; i++) {
        const yy = [0.67, 1.35, 2.03][i];
        for (let k = -1; k <= 1; k++) {
          at(b, k * 0.66, yy, 0.08, () => {
            lathe(b, [[0, 0], [0.13, 0], [0.16, 0.10], [0.13, 0.22], [0.09, 0.26], [0.11, 0.30], [0, 0.32]], 10, PAL.porc, MT.porcelain, {
              colFn: (t) => (t > 0.12 && t < 0.24 ? PAL.porcBlue : PAL.porc),
            });
          });
        }
      }
      // 玻璃门金框
      frameZ(b, 2.3, 2.4, 0.06, 0.05, PAL.gold, MT.gold, 0.36);
    });
  });
  P.items++; // 玻璃陈列柜（青花瓷）

  // ---- 门墙两翼：条几 + 镜/画 + 高座钟 + 铜瓶
  atR(b, -13.2, 0, 0.62, 0, () => {
    buildConsole(b, P, 3.6, 0.94, 0.56);
    buildVase(b, P, -0.9, 0.96, 0.0, 1.0, R.seed + 41);
    at(b, 0.75, 0.96, 0.0, () => {
      lathe(b, [[0, 0], [0.20, 0.02], [0.26, 0.14], [0.20, 0.30], [0.24, 0.36], [0, 0.38]], 10, PAL.gold, MT.gold);
      cylinder(b, 6, 0.05, 0.045, 0.28, PAL.candle, MT.candle, { y0: 0.36 });
      at(b, 0, 0.72, 0, () => sphere(b, 0.055, PAL.flame, MT.flame, { rings: 2, seg: 5, jitter: 0.06, seed: 24 }));
    });
  });
  P.items++; // 门左条几
  atR(b, -13.2, 9.10, 0.10, 0, () => buildMirror(b, P, 2.5, 3.4));
  buildClock(b, P, -17.3, 0.72);
  atR(b, -8.9, 6.40, 0.12, 0, () => buildSconce(b, P));
  atR(b, -17.4, 1.20, 0.62, 0, () => {
    lathe(b, [[0, 0], [0.34, 0], [0.30, 0.10], [0.44, 0.44], [0.34, 0.72], [0.38, 0.82], [0, 0.84]], 12, PAL.porc, MT.porcelain, {
      colFn: (yy) => (yy > 0.30 && yy < 0.55 ? PAL.porcBlue : PAL.porc),
    });
  });
  P.items++; // 门左铜瓶

  atR(b, 13.2, 0, 0.62, 0, () => {
    buildConsole(b, P, 3.6, 0.94, 0.56);
    buildTureen(b, P, -0.75, 0.96, 0.0, 1.0);
    buildTureen(b, P, 0.55, 0.96, 0.0, 0.85);
    // 一对高烛台
    for (const sx of [-1, 1]) {
      at(b, sx * 1.42, 0.96, 0.0, () => {
        lathe(b, [[0, 0], [0.13, 0], [0.10, 0.06], [0.06, 0.22], [0.05, 0.70], [0.09, 0.76], [0, 0.78]], 8, PAL.gold, MT.gold);
        cylinder(b, 6, 0.05, 0.045, 0.26, PAL.candle, MT.candle, { y0: 0.76 });
        at(b, 0, 1.06, 0, () => sphere(b, 0.055, PAL.flame, MT.flame, { rings: 2, seg: 5, jitter: 0.06, seed: 25 }));
      });
    }
  });
  P.items++; // 门右条几
  atR(b, 13.2, 9.35, 0.10, 0, () => buildPortrait(b, P, 2.6, 3.2, R.seed + 24));
  atR(b, 8.9, 6.40, 0.12, 0, () => buildSconce(b, P));
  atR(b, 17.4, 1.20, 0.62, 0, () => {
    lathe(b, [[0, 0], [0.30, 0], [0.26, 0.10], [0.40, 0.40], [0.30, 0.66], [0.34, 0.76], [0, 0.78]], 12, PAL.gold, MT.gold);
  });
  P.items++; // 门右铜瓶

  // ---- 门内两翼的一对石座铜瓶（回望门口时的对景）
  for (const s of [-1, 1]) {
    atR(b, s * 8.75, 0, 1.45, 0, () => {
      at(b, 0, 0.22, 0, () => box(b, 0.86, 0.44, 0.86, PAL.creamDk, MT.panel, { topCol: PAL.cream }));
      at(b, 0, 0.30, 0, () => box(b, 0.94, 0.10, 0.94, PAL.gold, MT.goldSoft));
      at(b, 0, 1.02, 0, () => box(b, 0.60, 1.20, 0.60, PAL.cream, MT.panel, { topCol: PAL.cream }));
      at(b, 0, 1.66, 0, () => box(b, 0.78, 0.14, 0.78, PAL.gold, MT.goldSoft));
      at(b, 0, 1.73, 0, () => {
        lathe(b, [[0, 0], [0.26, 0.02], [0.34, 0.16], [0.30, 0.40], [0.18, 0.52], [0.22, 0.58], [0, 0.62]], 10, PAL.porc, MT.porcelain, {
          colFn: (yy) => (yy > 0.20 && yy < 0.36 ? PAL.porcBlue : PAL.porc),
        });
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * TAU;
          const pts = [[0, 0.55, 0], [Math.cos(a) * 0.18, 0.75, Math.sin(a) * 0.18], [Math.cos(a) * 0.34, 0.98, Math.sin(a) * 0.34]];
          tubePath(b, pts, 0.02, 4, PAL.leafDark, MT.plant, {});
          at(b, Math.cos(a) * 0.34, 1.02, Math.sin(a) * 0.34, () => {
            ellipsoid(b, 0.10, 0.08, 0.10, 5, 2, i % 2 ? PAL.pink : PAL.cream2, MT.fabric);
          });
        }
      });
    });
    P.items++; // 门内石座铜瓶
  }

  // ---- 角落盆栽
  buildPalm(b, P, -17.4, 24.55, 1.10, R.seed + 51);
  buildPalm(b, P, 17.4, 24.60, 1.00, R.seed + 52);
  buildFern(b, P, -16.6, 1.35, 1.0, R.seed + 53);

  // ---- 书堆 / 卷轴 / 望远镜 / 手推车
  buildScrolls(b, P, -15.6, 20.20, R.seed + 61);
  buildBookPile(b, P, -13.2, 17.90, R.seed + 62);
  buildBookPile(b, P, 12.4, 17.60, R.seed + 63);
  buildBookPile(b, P, 0.9, 17.55, R.seed + 64);
  buildTelescope(b, P, -8.6, 22.60);
  buildTrolley(b, P, 9.9, 17.60);
  // 茶几上的一摞书
  at(b, 5.55, 0.905, 21.55, () => {
    for (let k = 0; k < 3; k++) {
      at(b, 0, 0.04 + k * 0.075, 0, () => {
        b.push(RY(0.1 * k));
        box(b, 0.56 - k * 0.05, 0.07, 0.40, [PAL.crimDk, PAL.blue, PAL.oliveDk][k], MT.paper, { topCol: PAL.cream2 });
        b.pop();
      });
    }
  });
  P.items++; // 茶几上的书

  // ---- 吊灯 ×3
  buildChandelier(b, P, 6.60, 0.82, 1, R.seed + 71);
  buildChandelier(b, P, 13.00, 1.00, 2, R.seed + 72);
  buildChandelier(b, P, 19.60, 0.86, 1, R.seed + 73);

  // ---- 点光（世界坐标！6 盏分层）
  const Pw = (x, y, z) => roomToWorld(R.cx, [x, y, z]);
  ctx.points.push({ p: Pw(0, 12.55, 13.0), col: mulc(C.warmGlow, 1.05), range: 58, int: 4.6 });   // 主吊灯（射程拉长到远墙）
  ctx.points.push({ p: Pw(0, 12.75, 19.6), col: mulc(C.warmGlow, 1.0), range: 46, int: 3.9 });    // 窗侧吊灯
  ctx.points.push({ p: Pw(0, 12.75, 6.6), col: mulc(C.warmGlow, 1.0), range: 40, int: 3.6 });     // 门口吊灯
  ctx.points.push({ p: Pw(2.8, 8.2, 20.4), col: mixc(C.warmGlow, PAL.cool, 0.22), range: 42, int: 2.9 }); // 窗边沙发角的暖补光
  ctx.points.push({ p: Pw(-6.55, 2.55, 19.55), col: mulc(C.warmGlow, 1.0), range: 17, int: 2.8 }); // 落地灯
  ctx.points.push({ p: Pw(17.9, 2.05, 13.3), col: mulc(C.amber, 0.95), range: 18, int: 2.5 });    // 边柜烛光

  // ---- 静态光斑（世界坐标，≤24）
  const Lw = (x, y, z, size, alpha, shape, col, rot) => ctx.lanterns.push({ p: Pw(x, y, z), size, rot, alpha, shape, col });
  Lw(0, 12.4, 13.0, 4.6, 0.62, 1, mulc(C.warmGlow, 1.05), 0.0);
  Lw(0, 12.9, 13.0, 2.2, 0.5, 0, mulc(C.warmGlow, 1.2), 0.4);
  Lw(0, 12.2, 19.6, 3.4, 0.5, 1, mulc(C.warmGlow, 1.0), 0.2);
  Lw(0, 12.2, 6.6, 3.4, 0.5, 1, mulc(C.warmGlow, 1.0), 0.3);
  Lw(0, 8.6, 24.8, 8.5, 0.44, 0, mulc(PAL.cool, 0.9), 0.0);
  Lw(-6.55, 2.5, 19.55, 1.9, 0.55, 1, mulc(C.warmGlow, 1.0), 0.0);
  Lw(17.1, 2.9, 13.3, 1.7, 0.5, 1, mulc(C.amber, 0.95), 0.0);
  Lw(-18.3, 6.7, 4.55, 1.1, 0.42, 1, mulc(C.warmGlow, 0.95), 0.0);
  Lw(-18.3, 6.7, 19.9, 1.1, 0.42, 1, mulc(C.warmGlow, 0.95), 0.0);
  Lw(18.3, 6.7, 6.9, 1.1, 0.40, 1, mulc(C.warmGlow, 0.95), 0.0);
  Lw(18.3, 6.7, 17.6, 1.1, 0.40, 1, mulc(C.warmGlow, 0.95), 0.0);
  Lw(2.55, 2.55, 20.75, 1.15, 0.34, 0, mulc(PAL.goldHi, 1.0), 0.0);
  Lw(-13.2, 1.35, 0.85, 1.0, 0.36, 1, mulc(C.warmGlow, 0.95), 0.0);
  Lw(13.2, 1.35, 0.85, 1.0, 0.36, 1, mulc(C.warmGlow, 0.95), 0.0);

  ctx.props.roomTearoom = { items: P.items, tris: b.i.length / 3 };
  void rnd;
}

// 世界摆放（world.js 调这个）
export function buildTearoomRoom(b, ctx) {
  b.push(roomFrame(R.cx));
  buildTearoomAssets(b, ctx);
  b.pop();
}
