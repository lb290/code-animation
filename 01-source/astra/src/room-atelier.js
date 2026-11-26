
// room-atelier.js — ROUND 16 · 「玻璃工坊」( THE GLASS ATELIER ) 的室内内容模块。
//
// 只负责这一间房的**局部坐标**内容；外壳（墙/门洞/大窗/地台/顶板/线脚）由
// room-shell.js 提供，世界摆放由 world.js 用 roomFrame() 完成。
// 局部坐标：x ∈ [-W/2, W/2] = ±20，y ∈ [0, 18]，z ∈ [0, 26]
//   z = 0 房门墙（桥），z = 26 大窗墙（外面是巨行星）
//
// 美术方向（参考 68390607_p0.jpg）：蓝白冷调玻璃房 + 原木暖色；草皮地面与小野花；
// 窗前一张 15 m 长工作台（绘图屏/数位板/蓝图卷/玻璃器皿/粉色玩偶）；5 盏悬挂玻璃圆灯；
// 左侧高书架与玻璃展示柜（柜里一块蛋糕 + 一只玻璃小鲸）；右侧玻璃熔炉与吹管架；
// 门墙上黄铜珐琅几何牌（不写文字）。签名件 = 长工作台 + 悬挂圆灯阵，窗外就是巨行星。
//
// 确定性：随机数全部来自 mulberry32(R.seed)，且**每次 build 都新建**（体检要连建两遍逐 float 比对）。
import {
  box, cylinder, lathe, sphere, torus, disc, ellipsoid, tubePath, bar3, grid,
  mulc, mixc, rgb, m4, TAU, mulberry32,
} from './engine.js';
import { C } from './palette.js';
import { roomEntry, roomFrame, roomToWorld } from './interiors-plan.js';
import { buildRoomShell } from './room-shell.js';

const R = roomEntry('atelier');
const W = R.W, D = R.D, H = R.H;
const IN = W / 2 - 0.9;   // 19.1 = 内墙面（保留给注释/后续调整用）

// ---------------------------------------------------------------- 色板
const K = {
  ice:       rgb('#aecbe3'),   // 室内墙（冷蓝）
  snow:      rgb('#e9f0f5'),
  glassPale: rgb('#c3dfee'),
  glassCyan: rgb('#7cc4de'),
  aquaGlow:  rgb('#7fe2d4'),
  wood:      rgb('#c8a878'),
  woodMid:   rgb('#ac8b60'),
  woodDark:  rgb('#7a5a3d'),
  woodPale:  rgb('#dcc7a2'),
  steel:     rgb('#8d99a6'),
  steelDark: rgb('#414a56'),
  brass:     C.brass,
  brassHi:   C.brassHi,
  bronze:    mixc(C.brass, rgb('#e9f0f5'), 0.52),   // 墙上的浅青铜饰条（不要满屋金色）
  stone:     rgb('#b3bfc9'),
  stoneLt:   rgb('#c9d4dc'),
  stoneDk:   rgb('#8f9da8'),
  grassLt:   rgb('#7d9450'),
  grassDk:   rgb('#39512f'),
  soil:      C.soil,
  leaf:      C.leaf,
  leafLt:    C.leafLight,
  leafDk:    C.leafDark,
  clay:      rgb('#c07a58'),
  clayLt:    rgb('#e3a884'),
  cream:     rgb('#f7efdd'),
  blush:     rgb('#f0a9bf'),
  blushDk:   rgb('#d9829e'),
  butter:    rgb('#f4d873'),
  ember:     rgb('#ff9a5c'),
  mint:      rgb('#a9e6c8'),
  paper:     rgb('#f6f1e4'),
  ceramic:   rgb('#f2f6f9'),
  ink:       rgb('#39424e'),
  charcoal:  rgb('#2f3742'),
  rugBlue:   rgb('#5f7f9c'),
  screen:    rgb('#2f7d99'),   // 绘图屏底色（发光面用亮色线条）
  screenLit: rgb('#bff6ff'),
};
// 材质 = [emissive, gloss]；结构/家具 0.02–0.15，灯罩/屏幕/釉光 0.4–0.95
const MT = {
  paint:   [0.030, 0.18],
  wood:    [0.035, 0.34],
  woodHi:  [0.045, 0.58],
  metal:   [0.040, 0.55],
  brass:   [0.055, 0.82],
  glass:   [0.090, 0.90],
  fabric:  [0.028, 0.08],
  cloth:   [0.032, 0.14],
  ceramic: [0.045, 0.66],
  leaf:    [0.045, 0.16],
  paper:   [0.028, 0.10],
  lamp:    [0.55, 0.50],
  screen:  [0.42, 0.42],
  ember:   [0.90, 0.30],
  glow:    [0.34, 0.62],
};

// ---------------------------------------------------------------- 小工具
const TR = (x, y, z) => m4.translate([x, y, z]);
function wf(b, m, fn) { b.push(m); fn(); b.pop(); }
// 位置 + 欧拉角（先 Z、再 X、后 Y）摆一个局部帧
function put(b, x, y, z, fn, ry = 0, rx = 0, rz = 0) {
  wf(b, m4.mul(TR(x, y, z), m4.mul(m4.rotY(ry), m4.mul(m4.rotX(rx), m4.rotZ(rz)))), fn);
}
function jit(c, rng, a = 0.08) { return mulc(c, 1 + (rng() - 0.5) * 2 * a); }
function cyl(b, seg, r0, r1, h, col, mat, y0 = 0) {
  cylinder(b, seg, r0, r1, h, col, mat, { y0 });
}
// 一片叶子：局部 +Y 是叶尖，叶面朝 ±Z，中央折起（8 个三角，双面）
function leafShape(b, len, halfW, col, mat, curl = 0.3) {
  const A = [0, 0, 0], Tip = [0, len, 0];
  const L = [-halfW, len * 0.45, 0], Rr = [halfW, len * 0.45, 0];
  const Mf = [0, len * 0.40, curl * len], Mb = [0, len * 0.40, -curl * len];
  b.tri(A, L, Mf, mulc(col, 0.88), mat);
  b.tri(A, Mf, Rr, col, mat);
  b.tri(Mf, L, Tip, mulc(col, 1.06), mat);
  b.tri(Mf, Tip, Rr, mulc(col, 0.86), mat);
  b.tri(A, Mb, L, mulc(col, 0.58), mat);
  b.tri(A, Rr, Mb, mulc(col, 0.60), mat);
  b.tri(Mb, L, Tip, mulc(col, 0.68), mat);
  b.tri(Mb, Tip, Rr, mulc(col, 0.66), mat);
}
// 一盆植物：陶盆 + 盆沿 + 土 + 若干带叶的枝
function pottedPlant(b, x, z, s, rng, o = {}) {
  const pr = 0.33 * s, ph = 0.48 * s;
  put(b, x, 0, z, () => {
    cyl(b, 14, pr * 0.76, pr, ph, o.potCol || K.clay, MT.ceramic, 0);
    cyl(b, 14, pr * 1.06, pr * 1.06, 0.09, o.potCol || K.clay, MT.ceramic, ph - 0.05);
    wf(b, TR(0, ph - 0.005, 0), () => disc(b, pr * 0.9, 12, K.soil, MT.leaf));
    const n = o.leaves ?? 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rng() * 0.6;
      const tilt = (o.tilt ?? 0.15) + rng() * 0.5;
      const len = (o.leafLen ?? 0.62) * s * (0.72 + rng() * 0.55);
      const bx = Math.cos(a) * 0.06 * s, bz = Math.sin(a) * 0.06 * s;
      const reach = (0.26 + rng() * 0.3) * s;
      const tx = Math.cos(a) * reach, tz = Math.sin(a) * reach;
      const ty = ph + (0.42 + rng() * 0.45) * s;
      bar3(b, [bx, ph - 0.02, bz], [tx, ty, tz], 0.03 * s, 0.03 * s, K.leafDk, MT.leaf);
      put(b, tx, ty, tz, () => leafShape(b, len, len * 0.42, o.leafCol || K.leaf, MT.leaf, 0.3),
        a, tilt, (rng() - 0.5) * 0.9);
    }
  });
}
// 一排书：局部 +X 方向，书脊朝 +Z
function bookRow(b, x0, x1, yBase, z, depth, rng, cols) {
  const palette = cols || [K.ice, K.cream, K.blush, K.mint, K.butter, K.steel, K.clayLt, K.glassPale, K.paper, K.leafLt];
  let x = x0, guard = 0;
  while (x < x1 - 0.06 && guard++ < 240) {
    const w = 0.042 + rng() * 0.062;
    if (x + w > x1) break;
    const h = 0.24 + rng() * 0.24;
    const c = palette[(rng() * palette.length) | 0];
    if (rng() < 0.4) { x += 0.16 + rng() * 0.36; continue; }
    const lean = rng() < 0.1 ? (rng() - 0.5) * 0.22 : 0;
    put(b, x + w / 2, yBase + h / 2, z, () => {
      box(b, w, h, depth, jit(c, rng, 0.06), MT.paper,
        { topCol: mulc(c, 1.12), bottomCol: mulc(c, 0.78) });
    }, 0, 0, lean);
    x += w + 0.008 + rng() * 0.014;
  }
}
// 一叠平放的书
function bookStack(b, x, y, z, rng, n = 4, w = 0.44, d = 0.32) {
  let yy = y;
  const palette = [K.ice, K.cream, K.blush, K.mint, K.butter, K.clayLt];
  for (let i = 0; i < n; i++) {
    const th = 0.055 + rng() * 0.03;
    const c = palette[(rng() * palette.length) | 0];
    const rot = (rng() - 0.5) * 0.16;
    const ww = w * (0.86 + rng() * 0.2), dd = d * (0.86 + rng() * 0.2);
    put(b, x + (rng() - 0.5) * 0.06, yy + th / 2, z + (rng() - 0.5) * 0.05, () => {
      box(b, ww, th, dd, c, MT.paper, { topCol: mulc(c, 1.1), bottomCol: mulc(c, 0.8) });
    }, rot);
    yy += th + 0.005;
  }
}
// 悬挂玻璃圆灯：玻璃罩发光 + 黄铜帽 + 吊线 + 赤道铜环
function pendantGlobe(b, x, y, z, rad, ceilY = 17.4) {
  const capY = y + rad * 0.92;
  const cordLen = Math.max(0.25, ceilY - capY);
  wf(b, TR(x, capY + cordLen / 2, z), () => cyl(b, 6, 0.024, 0.024, cordLen, K.charcoal, MT.metal, -cordLen / 2));
  wf(b, TR(x, capY, z), () => cyl(b, 12, rad * 0.2, rad * 0.3, rad * 0.4, K.brass, MT.brass, 0));
  put(b, x, y, z, () => {
    sphere(b, rad, mixc(K.glassPale, K.aquaGlow, 0.45), MT.lamp, { rings: 7, seg: 10, jitter: 0.02 });
  });
  wf(b, TR(x, y, z), () => torus(b, rad * 1.02, rad * 0.045, 12, 3, K.brass, MT.brass, 'y'));
}

// ================================================================ 01 地面
function buildFloor(b, P, rng) {
  // ── 草皮（高度场 + 色斑）
  wf(b, TR(0, 0, 15.4), () => {
    grid(b, 36.4, 17.2, 36, 17,
      (x, z) => 0.048 + 0.026 * Math.sin(x * 0.62 + 0.4) * Math.cos(z * 0.55 - 0.2)
                     + 0.012 * Math.sin(x * 1.7 + z * 1.3),
      (x, z) => {
        const t = 0.5 + 0.34 * Math.sin(x * 0.21 + 0.7) * Math.cos(z * 0.17 - 0.4)
                      + 0.16 * Math.sin(x * 0.47 - z * 0.31 + 1.9);
        return mixc(K.grassDk, K.grassLt, 0.18 + 0.46 * Math.max(0, Math.min(1, t)));
      }, MT.leaf);
  });
  P.items++;                                        // 01 草皮

  // ── 草坪镶边石
  wf(b, TR(0, 0, 6.86), () => box(b, 36.8, 0.15, 0.36, K.stone, MT.paint, { topCol: mulc(K.stone, 1.1) }));
  for (const s of [-1, 1]) {
    wf(b, TR(s * 18.3, 0, 15.4), () => box(b, 0.36, 0.15, 17.2, K.stone, MT.paint, { topCol: mulc(K.stone, 1.1) }));
  }
  P.items++;                                        // 02 草坪镶边石

  // ── 入口地面拼花（低于 0.2 m，不挡进门通道）
  wf(b, TR(0, 0, 3.6), () => box(b, 12.2, 0.09, 7.0, K.stoneLt, MT.paint, { topCol: mulc(K.stoneLt, 1.06) }));
  for (const zz of [1.4, 3.6, 5.8]) {
    wf(b, TR(0, 0.092, zz), () => box(b, 11.2, 0.02, 0.1, K.brass, MT.brass));
  }
  for (const xx of [-3.7, 0, 3.7]) {
    wf(b, TR(xx, 0.092, 3.6), () => box(b, 0.1, 0.02, 6.2, K.brass, MT.brass));
  }
  P.items++;                                        // 03 入口石材拼花

  // ── 迎宾垫
  wf(b, TR(0, 0.1, 1.7), () => box(b, 5.2, 0.04, 2.0, K.steelDark, MT.cloth,
    { topCol: mixc(K.steelDark, K.ice, 0.3) }));
  P.items++;                                        // 04 迎宾垫

  // ── 圆形玻璃砖地面拼花（房间中央的地面主设计）
  const IX = -4.6, IZ = 16.4, IR = 3.7;
  put(b, IX, 0, IZ, () => {
    disc(b, IR, 40, mixc(K.glassCyan, C.glassDeep, 0.45), [0.12, 0.8], { y: 0.085 });
    for (let k = 0; k < 4; k++) {
      const ro = IR - k * (IR / 4), ri = ro - IR / 4;
      const c = k % 2 ? mixc(K.glassCyan, K.glassPale, 0.35) : mixc(C.glassDeep, K.glassCyan, 0.5);
      disc(b, ro, 40, c, [0.16, 0.86], { inner: ri, y: 0.092 + k * 0.003 });
    }
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU, a1 = a + 0.026;
      const c0 = Math.cos(a), s0 = Math.sin(a), c1 = Math.cos(a1), s1 = Math.sin(a1);
      b.quad([c0 * 0.6, 0.106, s0 * 0.6], [c0 * IR, 0.106, s0 * IR],
             [c1 * IR, 0.106, s1 * IR], [c1 * 0.6, 0.106, s1 * 0.6], K.brass, MT.brass, [0, 1, 0]);
    }
    wf(b, TR(0, 0.09, 0), () => torus(b, IR + 0.06, 0.075, 32, 5, K.brass, MT.brass, 'y'));
  });
  P.items++;                                        // 05 圆形玻璃砖地面拼花

  // ── 窗前木地台（工作区）
  wf(b, TR(1.0, 0, 22.9), () => box(b, 20.6, 0.15, 4.5, mixc(K.wood, K.woodPale, 0.4), MT.wood, { topCol: mixc(K.wood, K.woodPale, 0.55) }));
  for (let i = 0; i < 8; i++) {
    wf(b, TR(-8.8 + i * 2.55, 0.152, 22.9), () => box(b, 0.06, 0.014, 4.4, mulc(K.wood, 0.82), MT.wood));
  }
  P.items++;                                        // 06 窗前木地台

  // ── 圆形编织地毯（沙发角）
  put(b, -13.2, 0, 20.6, () => {
    disc(b, 2.9, 32, K.cream, [0.08, 0.1], { y: 0.1 });
    disc(b, 2.9, 32, mixc(K.cream, K.clayLt, 0.5), [0.08, 0.1], { inner: 2.2, y: 0.105 });
    disc(b, 2.2, 32, mixc(K.cream, K.blush, 0.28), [0.08, 0.1], { inner: 1.1, y: 0.11 });
    disc(b, 1.1, 32, mulc(K.cream, 1.05), [0.08, 0.1], { y: 0.115 });
  });
  P.items++;                                        // 07 编织地毯

  // ── 小野花（三色成组撒在草坪上）
  const flowerSets = [
    { col: K.snow, n: 17 },
    { col: K.blush, n: 16 },
    { col: K.butter, n: 14 },
  ];
  for (const fs of flowerSets) {
    for (let i = 0; i < fs.n; i++) {
      const x = -17.4 + rng() * 34.4;
      const z = 7.2 + rng() * 13.4;
      if (Math.hypot(x - IX, z - IZ) < IR + 0.35) continue;
      if (Math.hypot(x + 13.2, z - 20.6) < 3.1) continue;
      if (x > -8.7 && z > 20.5) continue;
      const h = 0.16 + rng() * 0.14, sw = 0.05 + rng() * 0.05;
      const ry = rng() * TAU;
      wf(b, TR(x, 0.06, z), () => {
        b.quad([-0.012, 0, 0], [0.012, 0, 0], [0.01, h, 0], [-0.01, h, 0], K.leafDk, MT.leaf, [0, 0, 1]);
        b.quad([0, 0, -0.012], [0, 0, 0.012], [0, h, 0.01], [0, h, -0.01], K.leafDk, MT.leaf, [1, 0, 0]);
        put(b, 0, h, 0, () => {
          b.quad([-sw, 0, 0], [0, 0.022, -sw], [sw, 0, 0], [0, 0.022, sw], fs.col, [0.16, 0.22], [0, 1, 0]);
          b.quad([0, 0, -sw], [sw, 0.022, 0], [0, 0, sw], [-sw, 0.022, 0], mulc(fs.col, 0.92), [0.13, 0.22], [0, 1, 0]);
        }, ry);
      });
    }
    P.items++;                                      // 08/09/10 白花 / 粉花 / 黄花
  }

  // ── 地上的图纸与铅笔
  const scraps = [[4.2, 12.6, 0.6], [-7.8, 12.0, -0.4], [7.6, 18.4, 1.2], [-2.4, 20.6, 0.2], [9.2, 14.2, -0.9]];
  for (const s of scraps) {
    put(b, s[0], 0.078, s[1], () => box(b, 0.44, 0.012, 0.32, K.paper, MT.paper,
      { topCol: K.snow }), s[2]);
  }
  const penCols = [K.butter, K.blush, K.mint];
  for (let i = 0; i < 3; i++) {
    const x = -1.2 + rng() * 3.4, z = 12.0 + rng() * 2.6;
    put(b, x, 0.1, z, () => cyl(b, 5, 0.018, 0.018, 0.5, penCols[i], MT.wood, -0.25), rng() * TAU, 0, Math.PI / 2);
  }
  P.items++;                                        // 11 散落图纸与铅笔

  // ── 落地发光玻璃球
  const orbs = [[-8.4, 10.2, 0.22], [-7.3, 11.0, 0.15], [10.4, 12.6, 0.19]];
  for (const o of orbs) {
    put(b, o[0], o[2], o[1], () => {
      sphere(b, o[2], mixc(K.aquaGlow, K.glassPale, 0.35), MT.glow, { rings: 6, seg: 9, jitter: 0.02 });
    });
  }
  P.items++;                                        // 12 落地玻璃浮球
}

// ================================================================ 02 中央玻璃星仪
function buildOrrery(b, P, rng) {
  put(b, 3.2, 0, 14.8, () => {
    // 基座
    cyl(b, 18, 1.0, 0.92, 0.16, K.stoneLt, MT.paint, 0);
    cyl(b, 18, 0.86, 0.62, 0.22, K.stone, MT.paint, 0.16);
    cyl(b, 14, 0.52, 0.46, 0.72, K.woodMid, MT.wood, 0.38);
    wf(b, TR(0, 1.12, 0), () => torus(b, 0.52, 0.055, 20, 5, K.brass, MT.brass, 'y'));
    cyl(b, 10, 0.13, 0.1, 0.62, K.brass, MT.brass, 1.12);
    // 三个黄铜环
    const rings = [[1.06, 0.0, 0.0, 0.0], [0.92, 0.9, 0.0, 0.35], [0.8, -0.6, 1.1, -0.2]];
    for (const r of rings) {
      wf(b, m4.mul(TR(0, 1.76, 0), m4.mul(m4.rotY(r[3]), m4.mul(m4.rotX(r[1]), m4.rotZ(r[2])))), () => {
        torus(b, r[0], 0.035, 30, 5, K.brassHi, MT.brass, 'y');
      });
    }
    // 中心：一颗小小的琥珀巨行星 + 环
    wf(b, TR(0, 1.76, 0), () => {
      sphere(b, 0.38, mixc(C.planetA, C.planetB, 0.35), [0.3, 0.5], { rings: 8, seg: 14, jitter: 0.03 });
      wf(b, m4.mul(TR(0, 0, 0), m4.mul(m4.rotX(0.42), m4.rotZ(0.18))), () => {
        torus(b, 0.62, 0.026, 26, 4, mixc(C.ringA, C.ringB, 0.4), [0.26, 0.5], 'y');
      });
    });
    // 环上的小玻璃珠
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.3, rr = 0.86 + (i % 2) * 0.14;
      put(b, Math.cos(a) * rr, 1.76 + Math.sin(a * 1.7) * 0.34, Math.sin(a) * rr, () => {
        sphere(b, 0.085, [K.aquaGlow, K.blush, K.mint, K.butter, K.glassPale, K.snow][i],
          MT.glow, { rings: 5, seg: 8, jitter: 0.03 });
      });
    }
    // 底座旁的工具盘
    put(b, 0.95, 0.2, 0.6, () => {
      disc(b, 0.3, 12, K.steel, MT.metal, { y: 0 });
      for (let i = 0; i < 4; i++) {
        const a = i * 1.7;
        put(b, Math.cos(a) * 0.14, 0.01, Math.sin(a) * 0.14, () => {
          cyl(b, 6, 0.03, 0.03, 0.16, K.brass, MT.brass, 0);
        });
      }
    });
  });
  P.items++;                                        // 13 中央玻璃星仪
}

// ================================================================ 03 长工作台（签名件之一）
function buildWorkTable(b, P, rng) {
  const TX = 1.0, TZ = 22.85, TL = 15.0, TD = 1.9, TOP = 0.99;
  // ── 台面结构
  wf(b, TR(TX, TOP - 0.065, TZ), () => box(b, TL, 0.13, TD, K.woodPale, MT.woodHi,
    { topCol: mulc(K.woodPale, 1.06) }));
  wf(b, TR(TX, TOP - 0.17, TZ), () => box(b, TL - 0.24, 0.1, TD - 0.12, K.wood, MT.wood));
  wf(b, TR(TX, TOP - 0.16, TZ - TD / 2 - 0.03), () => box(b, TL - 0.04, 0.3, 0.07, mulc(K.wood, 0.92), MT.wood));
  // 桌腿 + 横撑
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      wf(b, TR(TX + sx * (TL / 2 - 0.3), 0.45, TZ + sz * (TD / 2 - 0.22)), () => {
        box(b, 0.11, 0.9, 0.11, K.steelDark, MT.metal);
      });
    }
    wf(b, TR(TX + sx * (TL / 2 - 0.3), 0.42, TZ), () => box(b, 0.09, 0.09, TD - 0.32, K.steelDark, MT.metal));
  }
  // 下层搁板 + 板上的箱子
  wf(b, TR(TX, 0.24, TZ), () => box(b, TL - 0.6, 0.07, TD - 0.36, K.wood, MT.wood,
    { topCol: mulc(K.wood, 1.06) }));
  for (let i = 0; i < 3; i++) {
    wf(b, TR(TX - 4.6 + i * 4.4, 0.42, TZ + 0.1), () => box(b, 0.9, 0.3, 0.62, K.clayLt, MT.paper,
      { topCol: mulc(K.clayLt, 1.1) }));
  }
  // 抽屉（前侧三个）+ 黄铜拉手
  for (let i = 0; i < 3; i++) {
    const dx = TX - 3.4 + i * 3.4;
    wf(b, TR(dx, 0.66, TZ - TD / 2 + 0.06), () => box(b, 2.6, 0.3, 0.5, K.woodMid, MT.woodHi));
    wf(b, TR(dx, 0.66, TZ - TD / 2 - 0.16), () => cyl(b, 8, 0.032, 0.032, 0.34, K.brass, MT.brass, -0.17));
  }
  // 后沿工具槽
  wf(b, TR(TX, TOP + 0.02, TZ + TD / 2 - 0.18), () => box(b, TL - 0.4, 0.09, 0.22, K.steel, MT.metal));
  P.items++;                                        // 14 长工作台本体

  // ── 绘图屏（青蓝自发光）
  put(b, TX + 4.5, TOP, TZ - 0.12, () => {
    wf(b, TR(0, 0.03, 0.14), () => box(b, 0.92, 0.06, 0.5, K.steel, MT.metal));
    wf(b, TR(0, 0.34, 0.16), () => box(b, 0.13, 0.62, 0.13, K.steelDark, MT.metal));
    wf(b, TR(0, 0.64, 0.02), () => box(b, 0.52, 0.1, 0.26, K.steel, MT.metal));
    wf(b, m4.mul(TR(0, 1.36, 0.02), m4.rotX(-0.2)), () => {
      box(b, 2.5, 1.5, 0.1, K.charcoal, MT.metal, { topCol: mulc(K.charcoal, 1.25) });
      b.quad([-1.16, -0.68, -0.056], [1.16, -0.68, -0.056], [1.16, 0.68, -0.056], [-1.16, 0.68, -0.056],
        K.screen, MT.screen, [0, 0, -1]);
      b.quad([-1.04, 0.42, -0.064], [0.52, 0.42, -0.064], [0.52, 0.47, -0.064], [-1.04, 0.47, -0.064],
        K.screenLit, [0.78, 0.2], [0, 0, -1]);
      b.quad([-1.04, -0.5, -0.064], [0.2, -0.5, -0.064], [0.2, -0.2, -0.064], [-1.04, -0.2, -0.064],
        mixc(K.aquaGlow, K.screenLit, 0.5), [0.6, 0.2], [0, 0, -1]);
      b.quad([0.3, -0.5, -0.064], [0.94, -0.5, -0.064], [0.94, 0.12, -0.064], [0.3, 0.12, -0.064],
        mixc(K.blush, K.screenLit, 0.4), [0.5, 0.2], [0, 0, -1]);
      wf(b, TR(0, 1.5, 0.045), () => box(b, 2.54, 0.07, 0.12, K.steel, MT.metal));
    });
  });
  P.items++;                                        // 15 绘图屏

  // ── 数位板与压感笔
  put(b, TX + 2.9, TOP, TZ - 0.16, () => {
    wf(b, m4.mul(TR(0, 0.03, 0), m4.rotX(-0.08)), () => {
      box(b, 1.35, 0.045, 0.9, K.charcoal, MT.metal);
      b.quad([-0.6, 0.028, -0.38], [0.6, 0.028, -0.38], [0.6, 0.028, 0.38], [-0.6, 0.028, 0.38],
        mixc(K.ice, K.screen, 0.22), [0.18, 0.4], [0, 1, 0]);
    });
    put(b, 0.74, 0.09, -0.25, () => cyl(b, 6, 0.016, 0.012, 0.3, K.ink, MT.metal, -0.15), 0, 0, Math.PI / 2, 0.6);
  });
  P.items++;                                        // 16 数位板与压感笔

  // ── 笔筒与彩笔
  put(b, TX + 1.25, TOP, TZ - 0.05, () => {
    cyl(b, 12, 0.13, 0.15, 0.3, K.cream, MT.ceramic, 0);
    const cols = [K.blush, K.butter, K.mint, K.steel, K.clayLt, K.aquaGlow, K.snow];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      put(b, Math.cos(a) * 0.06, 0.25, Math.sin(a) * 0.06, () => {
        cyl(b, 5, 0.012, 0.008, 0.34, cols[i], MT.wood, 0);
      }, 0, 0.16, 0);
    }
  });
  P.items++;                                        // 17 笔筒与彩笔

  // ── 蓝图卷与摊开的图纸
  put(b, TX - 0.5, TOP, TZ + 0.18, () => {
    const cols = [K.ice, mixc(K.ice, K.glassCyan, 0.4), K.paper];
    for (let i = 0; i < 3; i++) {
      put(b, -0.16 + i * 0.17, 0.07, 0, () => cyl(b, 8, 0.062, 0.062, 1.2, cols[i], MT.paper), 0, 0, Math.PI / 2);
    }
    for (const sx of [-0.6, 0.52]) {
      wf(b, TR(sx, 0.07, 0), () => box(b, 0.05, 0.13, 0.46, K.brass, MT.brass));
    }
    wf(b, m4.mul(TR(0.72, 0.02, -0.34), m4.rotY(0.22)), () => {
      box(b, 0.9, 0.012, 0.62, K.ice, MT.paper, { topCol: K.snow });
      b.quad([-0.34, 0.012, -0.24], [0.34, 0.012, -0.24], [0.34, 0.012, 0.24], [-0.34, 0.012, 0.24],
        mixc(K.screen, K.snow, 0.6), [0.2, 0.2], [0, 1, 0]);
    });
  });
  P.items++;                                        // 18 蓝图卷与摊开的图纸

  // ── 书堆与立书
  bookStack(b, TX - 1.95, TOP, TZ - 0.32, rng, 4, 0.46, 0.32);
  put(b, TX - 2.62, TOP, TZ + 0.3, () => {
    box(b, 0.06, 0.42, 0.3, K.clayLt, MT.paper);
    box(b, 0.05, 0.38, 0.28, K.ice, MT.paper);
  }, 0, 0, 0.12);
  P.items++;                                        // 19 书堆与立书

  // ── 粉色猫咪玩偶
  put(b, TX - 3.55, TOP, TZ - 0.3, () => {
    ellipsoid(b, 0.26, 0.2, 0.2, 10, 6, K.blush, MT.fabric);
    put(b, 0, 0.3, 0.04, () => {
      sphere(b, 0.19, jit(K.blush, rng, 0.05), MT.fabric, { rings: 6, seg: 10, jitter: 0.02 });
      for (const s of [-1, 1]) {
        b.tri([s * 0.05, 0.13, 0], [s * 0.15, 0.31, 0.01], [s * 0.02, 0.27, 0.04], K.blushDk, MT.fabric);
      }
      for (const s of [-1, 1]) {
        put(b, s * 0.07, 0.03, 0.16, () => sphere(b, 0.024, K.ink, MT.paper, { rings: 4, seg: 6, jitter: 0 }));
      }
      put(b, 0.02, -0.05, 0.17, () => sphere(b, 0.018, K.blushDk, MT.fabric, { rings: 4, seg: 6, jitter: 0 }));
    });
    tubePath(b, [[0.18, 0.04, -0.14], [0.3, 0.06, -0.02], [0.26, 0.1, 0.12], [0.14, 0.12, 0.2]],
      [0.06, 0.05, 0.045, 0.034], 6, K.blush, MT.fabric);
  });
  P.items++;                                        // 20 粉色猫咪玩偶

  // ── 小黄鸭
  put(b, TX - 4.55, TOP + 0.02, TZ + 0.05, () => {
    ellipsoid(b, 0.19, 0.14, 0.24, 10, 6, K.butter, MT.fabric);
    put(b, 0, 0.2, 0.16, () => {
      sphere(b, 0.13, K.butter, MT.fabric, { rings: 6, seg: 9, jitter: 0.02 });
      put(b, 0, 0.0, 0.12, () => cyl(b, 8, 0.06, 0.02, 0.07, K.ember, MT.ceramic, -0.035), 0, Math.PI / 2);
      for (const s of [-1, 1]) {
        put(b, s * 0.06, 0.05, 0.07, () => sphere(b, 0.02, K.ink, MT.paper, { rings: 4, seg: 6, jitter: 0 }));
      }
    });
  }, 0.5);
  P.items++;                                        // 21 小黄鸭

  // ── 马克杯（猫脸）+ 茶碟
  put(b, TX + 0.3, TOP, TZ + 0.3, () => {
    disc(b, 0.12, 14, K.snow, MT.ceramic, { y: 0.012 });
    cyl(b, 14, 0.085, 0.1, 0.17, K.snow, MT.ceramic, 0.02);
    wf(b, TR(0, 0.1, 0), () => cyl(b, 14, 0.082, 0.082, 0.02, mixc(K.ink, K.cream, 0.1), MT.ceramic, 0));
    wf(b, TR(0.1, 0.1, 0), () => torus(b, 0.055, 0.016, 12, 5, K.snow, MT.ceramic, 'z'));
    for (const s of [-1, 1]) {
      b.quad([s * 0.02 - 0.012, 0.11, 0.096], [s * 0.02 + 0.012, 0.11, 0.096],
             [s * 0.02 + 0.012, 0.13, 0.096], [s * 0.02 - 0.012, 0.13, 0.096], K.ink, MT.paper, [0, 0, 1]);
    }
    b.quad([-0.02, 0.085, 0.096], [0.02, 0.085, 0.096], [0.02, 0.095, 0.096], [-0.02, 0.095, 0.096],
      K.blushDk, MT.paper, [0, 0, 1]);
  });
  P.items++;                                        // 22 马克杯与茶碟

  // ── 头戴耳机（挂在桌沿的小架上）
  put(b, TX + 3.9, TOP, TZ + 0.28, () => {
    wf(b, TR(0, 0.14, 0), () => cyl(b, 8, 0.05, 0.05, 0.28, K.steelDark, MT.metal, -0.14));
    wf(b, m4.mul(TR(0, 0.3, 0.02), m4.rotX(0.1)), () => {
      const pts = [];
      for (let i = 0; i <= 10; i++) {
        const a = Math.PI * (i / 10);
        pts.push([Math.cos(a) * 0.2, Math.sin(a) * 0.22, 0]);
      }
      tubePath(b, pts, 0.022, 6, K.charcoal, MT.metal);
      for (const s of [-1, 1]) {
        put(b, s * 0.2, 0.0, 0, () => cyl(b, 12, 0.085, 0.075, 0.1, K.steelDark, MT.metal, -0.05),
          0, 0, Math.PI / 2);
      }
    });
  });
  P.items++;                                        // 23 头戴耳机

  // ── 台灯（暖光锥罩）
  put(b, TX + 7.4, TOP, TZ + 0.28, () => {
    wf(b, TR(0, 0.06, 0), () => box(b, 0.26, 0.1, 0.26, K.steel, MT.metal));
    wf(b, m4.mul(TR(0, 0.26, 0), m4.rotZ(0.12)), () => cyl(b, 8, 0.035, 0.03, 0.5, K.steel, MT.metal, -0.25));
    wf(b, m4.mul(TR(0.12, 0.62, 0), m4.rotZ(-0.9)), () => cyl(b, 8, 0.03, 0.028, 0.52, K.steel, MT.metal, -0.26));
    put(b, 0.42, 0.72, 0, () => {
      cyl(b, 12, 0.19, 0.06, 0.2, K.cream, MT.glow, -0.1);
      wf(b, TR(0, -0.13, 0), () => sphere(b, 0.07, K.cream, [0.92, 0.2], { rings: 5, seg: 8, jitter: 0 }));
    }, 0, 0.35);
  });
  P.items++;                                        // 24 桌面工作台灯

  // ── 桌面音箱一对
  for (const s of [-1, 1]) {
    put(b, TX + (s < 0 ? -6.0 : 8.1), TOP, TZ + 0.3, () => {
      box(b, 0.26, 0.34, 0.24, K.snow, MT.paint, { topCol: mulc(K.snow, 1.05) });
      wf(b, TR(0, -0.04, -0.13), () => cyl(b, 12, 0.08, 0.08, 0.04, K.steelDark, MT.metal, -0.02));
      wf(b, TR(0, 0.11, -0.13), () => cyl(b, 10, 0.035, 0.035, 0.04, K.steelDark, MT.metal, -0.02));
      wf(b, TR(0, -0.14, 0), () => cyl(b, 8, 0.1, 0.1, 0.03, K.steel, MT.metal, -0.015));
    }, s < 0 ? 0.12 : -0.12);
  }
  P.items++;                                        // 25 桌面音箱一对

  // ── 桌面工具组（尺/剪刀/美工刀/胶带）
  put(b, TX + 0.9, TOP, TZ - 0.35, () => {
    wf(b, m4.mul(TR(0, 0.008, 0), m4.rotY(0.18)), () => box(b, 0.9, 0.012, 0.06, K.steel, MT.metal));
    put(b, 0.5, 0.02, 0.06, () => {
      for (const s of [-1, 1]) {
        wf(b, m4.mul(TR(0, 0, s * 0.02), m4.rotY(s * 0.16)), () => box(b, 0.26, 0.012, 0.026, K.steel, MT.metal));
        wf(b, TR(-0.14, 0, s * 0.045), () => torus(b, 0.035, 0.011, 10, 4, K.brass, MT.brass, 'y'));
      }
    }, 0.5);
    wf(b, TR(-0.42, 0.008, 0.1), () => box(b, 0.2, 0.03, 0.05, K.butter, MT.paint));
    wf(b, TR(0.24, 0.04, -0.16), () => torus(b, 0.075, 0.032, 14, 5, K.ice, MT.paper, 'z'));
  }, 0.6);
  P.items++;                                        // 26 桌面工具组

  // ── 玻璃器皿组（烧杯/试管，工坊身份）
  put(b, TX - 2.7, TOP, TZ - 0.05, () => {
    const gcols = [K.aquaGlow, K.blush, K.butter];
    for (let i = 0; i < 3; i++) {
      const x = -0.3 + i * 0.26;
      wf(b, TR(x, 0.01, 0), () => {
        cyl(b, 12, 0.08, 0.09, 0.2, K.glassPale, MT.glass, 0);
        cyl(b, 10, 0.075, 0.082, 0.11, mixc(gcols[i], K.snow, 0.35), [0.4, 0.85], 0.01);
        cyl(b, 12, 0.092, 0.092, 0.03, mixc(K.glassPale, K.snow, 0.3), MT.glass, 0.19);
      });
    }
    wf(b, TR(0.18, 0.12, 0), () => box(b, 0.42, 0.02, 0.16, K.wood, MT.wood));
    for (let i = 0; i < 3; i++) {
      wf(b, TR(0.06 + i * 0.12, 0.05, 0), () => cyl(b, 8, 0.032, 0.032, 0.16, K.glassPale, MT.glass, 0));
    }
  });
  P.items++;                                        // 27 玻璃器皿与试管架

  // ── 工作凳（三张）
  for (const sx of [-3.2, 1.4, 6.0]) {
    put(b, TX + sx, 0, TZ - 1.55, () => {
      cyl(b, 14, 0.31, 0.34, 0.1, K.cream, MT.cloth, 0.62);
      wf(b, TR(0, 0.6, 0), () => cyl(b, 14, 0.3, 0.3, 0.05, K.steel, MT.metal, 0));
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + 0.78;
        bar3(b, [Math.cos(a) * 0.2, 0.62, Math.sin(a) * 0.2], [Math.cos(a) * 0.36, 0.02, Math.sin(a) * 0.36],
          0.04, 0.04, K.steelDark, MT.metal);
      }
      wf(b, TR(0, 0.28, 0), () => torus(b, 0.3, 0.018, 16, 4, K.steelDark, MT.metal, 'y'));
    });
  }
  P.items++;                                        // 28 工作凳三张

  // ── 桌下的纸箱与线缆
  put(b, TX + 5.6, 0, TZ + 0.1, () => {
    box(b, 0.8, 0.5, 0.6, K.clayLt, MT.paper, { topCol: mulc(K.clayLt, 1.1) });
    wf(b, TR(0, 0.26, 0), () => box(b, 0.82, 0.03, 0.12, K.woodMid, MT.paper));
  }, 0.3);
  put(b, TX - 6.2, 0.62, TZ + 0.2, () => {
    torus(b, 0.28, 0.05, 18, 6, K.charcoal, MT.metal, 'y');
    torus(b, 0.24, 0.05, 18, 6, K.charcoal, MT.metal, 'y');
  });
  P.items++;                                        // 29 桌下纸箱与收线盘
}

// ================================================================ 04 大窗区（30 m 拱窗是主角）
function buildWindowZone(b, P, rng) {
  const sillY = 1.28;
  // ── 窗台盆栽（坐在窗台上）
  const pots = [[-11.6, 0.85], [-9.4, 0.7], [10.2, 0.8]];
  for (const p of pots) {
    wf(b, TR(p[0], sillY, 25.1), () => {
      pottedPlant(b, 0, 0, p[1], rng, { potCol: K.cream, leaves: 6, leafLen: 0.46, tilt: 0.28 });
    });
  }
  P.items++;                                        // 30 窗台盆栽

  // ── 窗台玻璃罐三只
  put(b, 6.2, sillY, 25.15, () => {
    const lc = [K.aquaGlow, K.blush, K.butter];
    for (let i = 0; i < 3; i++) {
      const x = -0.34 + i * 0.34;
      wf(b, TR(x, 0, 0), () => {
        cyl(b, 12, 0.11, 0.1, 0.34, K.glassPale, MT.glass, 0);
        cyl(b, 10, 0.1, 0.1, 0.03, K.brass, MT.brass, 0.3);
        cyl(b, 10, 0.09, 0.09, 0.2, mixc(lc[i], K.snow, 0.4), [0.3, 0.7], 0.04);
      });
    }
  });
  P.items++;                                        // 31 窗台玻璃罐三只

  // ── 窗台书与玻璃小雕
  put(b, 1.1, sillY, 25.3, () => {
    box(b, 0.42, 0.06, 0.3, K.ice, MT.paper, { topCol: K.snow });
    box(b, 0.38, 0.05, 0.27, K.blush, MT.paper);
    wf(b, TR(0, 0.16, 0), () => {
      sphere(b, 0.13, mixc(K.aquaGlow, K.glassCyan, 0.4), MT.glow, { rings: 6, seg: 10, jitter: 0.05 });
      cyl(b, 8, 0.06, 0.06, 0.05, K.brass, MT.brass, -0.2);
    });
  });
  P.items++;                                        // 32 窗台书与玻璃小雕

  // ── 纱帘（两侧成组褶）与黄铜帘杆
  for (const side of [-1, 1]) {
    const bx = side * 13.4;
    for (let i = 0; i < 7; i++) {
      const x = bx + side * (i - 3) * 0.22;
      const zz = 24.55 + (i % 2) * 0.16;
      const hh = 15.3 - (i % 3) * 0.18;
      wf(b, TR(x, 0.35 + hh / 2, zz), () => box(b, 0.16, hh, 0.1,
        mixc(K.ice, K.snow, 0.55), [0.035, 0.1]));
    }
    wf(b, m4.mul(TR(side * 12.6, 16.6, 24.62), m4.rotZ(Math.PI / 2)), () => {
      cyl(b, 8, 0.05, 0.05, 5.4, K.brass, MT.brass, 0);
    });
    wf(b, TR(side * 15.35, 16.6, 24.62), () => sphere(b, 0.11, K.brassHi, MT.brass, { rings: 5, seg: 8, jitter: 0 }));
    wf(b, TR(side * 14.4, 16.6, 24.45), () => box(b, 0.08, 0.08, 0.36, K.brass, MT.brass));
  }
  P.items++;                                        // 33 窗侧纱帘与黄铜帘杆

  // ── 拱窗里的玻璃风铃
  const drops = [[-7.4, 14.6], [-3.6, 15.2], [0.4, 14.9], [4.2, 15.4], [7.8, 14.7]];
  for (const d of drops) {
    const cord = 16.4 - d[1];
    wf(b, TR(d[0], d[1] + cord / 2, 25.9), () => cyl(b, 5, 0.012, 0.012, cord, K.brass, MT.brass, -cord / 2));
    put(b, d[0], d[1], 25.9, () => {
      lathe(b, [[0.005, -0.34], [0.09, -0.14], [0.08, 0.04], [0.005, 0.14]],
        6, mixc(K.aquaGlow, K.snow, 0.35), MT.glow);
    });
  }
  P.items++;                                        // 34 拱窗玻璃风铃

  // ── 窗台坐垫（迎向窗外的坐处）
  for (const c of [[-6.6, 0.34], [-5.6, 0.3], [-4.4, 0.32]]) {
    put(b, c[0], sillY + 0.06, 25.2, () => {
      box(b, 0.62, 0.16, 0.56, mixc(K.cream, K.blush, 0.3), MT.fabric,
        { topCol: mixc(K.cream, K.blush, 0.5) });
    }, c[1]);
  }
  P.items++;                                        // 35 窗台坐垫三只
}

// ================================================================ 05 沙发角（浴缸形躺椅 / 望远镜）
function buildLounge(b, P, rng) {
  const LX = -13.4, LZ = 21.0;
  // ── 白色浴缸形圆沙发
  put(b, LX, 0, LZ, () => {
    // 低矮宽大的圆躺椅：石台 + 白色陶瓷碗 + 三只圆靠枕
    cyl(b, 20, 1.86, 1.9, 0.3, K.stoneLt, MT.paint, 0);
    cyl(b, 24, 1.94, 1.94, 0.1, K.ceramic, MT.ceramic, 0.3);
    lathe(b, [[1.78, 0.3], [1.72, 0.56], [1.56, 0.74], [1.14, 0.86], [0.5, 0.9], [0.16, 0.88]],
      24, K.snow, MT.ceramic);
    cyl(b, 24, 1.94, 1.9, 0.58, K.snow, MT.ceramic, 0.3);
    wf(b, TR(0, 0.9, 0), () => torus(b, 1.86, 0.1, 28, 6, mulc(K.snow, 1.02), MT.ceramic, 'y'));
    put(b, 0, 0.6, 0, () => {
      ellipsoid(b, 1.22, 0.13, 1.14, 16, 6, mixc(K.cream, K.ice, 0.3), MT.cloth);
      ellipsoid(b, 1.0, 0.1, 0.96, 14, 5, K.cream, MT.cloth);
    });
    for (const bc of [[-0.78, 0.9, -0.78, 0.5], [0.0, 0.96, -1.04, 0.1], [0.78, 0.9, -0.78, -0.5]]) {
      put(b, bc[0], bc[1], bc[2], () => {
        ellipsoid(b, 0.52, 0.34, 0.3, 10, 6, mixc(K.snow, K.ice, 0.35), MT.cloth);
        ellipsoid(b, 0.4, 0.24, 0.2, 8, 4, K.cream, MT.cloth);
      }, bc[3], -0.25);
    }
    wf(b, TR(0, 0.34, 0), () => cyl(b, 20, 1.82, 1.82, 0.04, mulc(K.stoneLt, 1.05), MT.paint, 0));
  });
  P.items++;                                        // 36 白色浴缸形圆沙发

  // ── 抱枕与毛毯
  const pillows = [[-0.55, 0.7, -0.55, 0.5, K.blush], [0.5, 0.7, -0.4, -0.7, K.mint], [0.1, 0.78, 0.2, 0.1, K.butter]];
  for (const p of pillows) {
    put(b, LX + p[0], p[1], LZ + p[2], () => {
      ellipsoid(b, 0.32, 0.2, 0.16, 10, 5, p[4], MT.cloth);
      ellipsoid(b, 0.2, 0.13, 0.1, 8, 4, mulc(p[4], 1.12), MT.cloth);
    }, p[3], 0.5);
  }
  put(b, LX + 0.2, 0.68, LZ + 1.0, () => {
    ellipsoid(b, 0.62, 0.1, 0.4, 10, 4, mixc(K.cream, K.ice, 0.5), MT.fabric);
    for (let i = 0; i < 3; i++) {
      wf(b, TR(-0.4 + i * 0.4, 0.06, 0), () => box(b, 0.36, 0.02, 0.78, mulc(K.cream, 0.94), MT.fabric));
    }
  });
  P.items++;                                        // 37 抱枕与针织毛毯

  // ── 边桌 + 茶具 + 书
  put(b, LX + 2.6, 0, LZ + 0.5, () => {
    cyl(b, 14, 0.42, 0.46, 0.06, K.woodPale, MT.woodHi, 0.62);
    cyl(b, 10, 0.08, 0.08, 0.62, K.steelDark, MT.metal, 0);
    cyl(b, 16, 0.3, 0.32, 0.04, K.steelDark, MT.metal, 0);
    put(b, 0.1, 0.68, 0.05, () => {
      lathe(b, [[0.005, 0], [0.14, 0.01], [0.16, 0.1], [0.12, 0.2], [0.06, 0.24], [0.02, 0.25]], 14,
        mixc(K.ice, K.snow, 0.4), MT.ceramic);
      wf(b, TR(0.16, 0.13, 0), () => torus(b, 0.06, 0.02, 10, 4, K.ice, MT.ceramic, 'z'));
      wf(b, TR(0, 0.26, 0), () => sphere(b, 0.03, K.brass, MT.brass, { rings: 4, seg: 6, jitter: 0 }));
    });
    put(b, -0.24, 0.66, 0.12, () => {
      cyl(b, 12, 0.07, 0.08, 0.1, K.cream, MT.ceramic, 0);
      disc(b, 0.12, 12, K.cream, MT.ceramic, { y: 0.005 });
      cyl(b, 10, 0.06, 0.06, 0.01, mixc(K.clayLt, K.woodMid, 0.5), MT.ceramic, 0.075);
    });
    bookStack(b, -0.2, 0.66, -0.24, rng, 2, 0.34, 0.26);
  });
  P.items++;                                        // 38 边桌与茶具

  // ── 落地弧形灯
  put(b, LX - 2.4, 0, LZ + 1.2, () => {
    cyl(b, 16, 0.32, 0.34, 0.06, K.steelDark, MT.metal, 0);
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      pts.push([Math.sin(t * 1.5) * 0.9, 0.06 + t * 2.3, Math.cos(t * 1.5) * 0.12 * t]);
    }
    tubePath(b, pts, 0.045, 6, K.steel, MT.metal);
    const tip = pts[8];
    put(b, tip[0], tip[1], tip[2], () => {
      cyl(b, 14, 0.28, 0.1, 0.26, K.cream, MT.glow, -0.26);
      wf(b, TR(0, -0.3, 0), () => sphere(b, 0.09, K.cream, [0.93, 0.2], { rings: 5, seg: 8, jitter: 0 }));
    });
  });
  P.items++;                                        // 39 落地弧形灯

  // ── 黄铜望远镜（正对窗外巨行星）
  put(b, -8.9, 0, 23.2, () => {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.4;
      bar3(b, [Math.cos(a) * 0.05, 1.32, Math.sin(a) * 0.05],
        [Math.cos(a) * 0.72, 0.02, Math.sin(a) * 0.72], 0.05, 0.05, K.woodDark, MT.wood);
      wf(b, TR(Math.cos(a) * 0.66, 0.05, Math.sin(a) * 0.66), () => sphere(b, 0.07, K.brass,
        MT.brass, { rings: 4, seg: 6, jitter: 0 }));
    }
    wf(b, TR(0, 1.3, 0), () => cyl(b, 12, 0.16, 0.16, 0.12, K.brass, MT.brass, -0.06));
    wf(b, m4.mul(TR(0, 1.55, 0.05), m4.rotX(1.05)), () => {
      cyl(b, 14, 0.17, 0.13, 2.3, K.brass, MT.brass, -1.15);
      cyl(b, 14, 0.2, 0.2, 0.14, K.brassHi, MT.brass, 1.02);
      cyl(b, 12, 0.13, 0.13, 0.1, K.steelDark, MT.metal, -1.22);
      cyl(b, 12, 0.05, 0.05, 0.18, K.steelDark, MT.metal, 1.1);
      wf(b, TR(0, 0.55, 0), () => torus(b, 0.19, 0.03, 14, 4, K.brassHi, MT.brass, 'y'));
      wf(b, TR(0, -0.55, 0), () => torus(b, 0.18, 0.03, 14, 4, K.brassHi, MT.brass, 'y'));
    });
    wf(b, m4.mul(TR(0.22, 1.9, 0.1), m4.rotX(1.05)), () => cyl(b, 8, 0.05, 0.045, 0.6, K.brass, MT.brass, -0.3));
    put(b, 0.85, 0.18, -0.4, () => box(b, 0.34, 0.05, 0.26, K.paper, MT.paper, { topCol: K.snow }), 0.4);
  });
  P.items++;                                        // 40 黄铜望远镜

  // ── 藤编收纳篮与毛线球
  put(b, LX - 1.9, 0, LZ - 1.9, () => {
    cyl(b, 14, 0.34, 0.38, 0.36, K.clayLt, MT.cloth, 0);
    wf(b, TR(0, 0.36, 0), () => torus(b, 0.38, 0.035, 16, 4, K.woodMid, MT.wood, 'y'));
    for (let i = 0; i < 3; i++) {
      put(b, -0.12 + i * 0.12, 0.4, (i % 2) * 0.08, () => sphere(b, 0.09, [K.blush, K.mint, K.butter][i],
        MT.fabric, { rings: 5, seg: 8, jitter: 0.06 }));
    }
  });
  P.items++;                                        // 41 藤编篮与毛线球

  // ── 地毯上摊开的画册
  put(b, LX + 1.1, 0.13, LZ - 1.5, () => {
    wf(b, m4.mul(TR(0, 0.01, 0), m4.rotX(-0.05)), () => {
      box(b, 0.5, 0.02, 0.36, K.blush, MT.paper);
      b.quad([-0.24, 0.012, -0.15], [0.24, 0.012, -0.15], [0.24, 0.012, 0.15], [-0.24, 0.012, 0.15],
        K.snow, MT.paper, [0, 1, 0]);
    });
  }, 0.7);
  P.items++;                                        // 42 摊开的画册
}

// ================================================================ 06 左墙：吹制工位 / 高书架 / 展示柜 / 玻璃作品架
function buildLeftWall(b, P, rng) {
  // ── 玻璃吹制工位（长条工作台 + 吹管架 + 熔料罐 + 铁皮桶）
  {
    const bx0 = -18.42, bx1 = -17.0, bz0 = 2.2, bz1 = 6.6, bh = 0.92;
    const bw = bx1 - bx0, bl = bz1 - bz0, cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2;
    wf(b, TR(cx, bh - 0.06, cz), () => box(b, bw, 0.12, bl, K.woodMid, MT.woodHi,
      { topCol: mulc(K.woodMid, 1.05) }));
    wf(b, TR(cx, bh - 0.16, cz), () => box(b, bw - 0.12, 0.09, bl - 0.1, K.woodDark, MT.wood));
    for (const sz of [-1, 1]) {
      wf(b, TR(cx, bh / 2 - 0.06, cz + sz * (bl / 2 - 0.1)), () => box(b, bw - 0.1, bh - 0.12, 0.1,
        K.woodDark, MT.wood));
    }
    wf(b, TR(cx, 0.28, cz), () => box(b, bw - 0.2, 0.06, bl - 0.2, K.wood, MT.wood));
    // 耐火砖 + 小工具
    wf(b, TR(cx, bh + 0.03, cz - 1.2), () => box(b, 0.8, 0.08, 0.5, K.stoneDk, MT.paint));
    for (let i = 0; i < 3; i++) {
      wf(b, TR(cx - 0.2 + i * 0.2, bh + 0.1, cz - 1.2), () => cyl(b, 6, 0.035, 0.03, 0.12, K.brass, MT.brass, 0));
    }
    P.items++;                                      // 43 玻璃吹制工位
    // 铁皮桶
    wf(b, TR(bx0 + 0.35, 0, bz1 - 0.55), () => {
      cyl(b, 14, 0.28, 0.3, 0.55, K.steel, MT.metal, 0);
      wf(b, TR(0, 0.56, 0), () => torus(b, 0.29, 0.03, 16, 4, K.steelDark, MT.metal, 'y'));
    });
    P.items++;                                      // 44 铁皮桶
    // 熔料罐三只
    const frit = [K.aquaGlow, K.blush, K.butter];
    for (let i = 0; i < 3; i++) {
      wf(b, TR(cx + 0.25, bh, cz + 0.55 + i * 0.42), () => {
        cyl(b, 12, 0.14, 0.15, 0.3, K.glassPale, MT.glass, 0);
        cyl(b, 10, 0.13, 0.13, 0.2, mixc(frit[i], K.snow, 0.25), [0.34, 0.7], 0.03);
        cyl(b, 12, 0.15, 0.15, 0.04, K.woodMid, MT.wood, 0.3);
      });
    }
    P.items++;                                      // 45 熔料罐与耐火砖
    // 吹管架
    for (let i = 0; i < 2; i++) {
      bar3(b, [cx + 0.1, bh + 0.02, cz + 0.1 + i * 0.18], [cx + 0.5, bh + 2.3, cz + 0.18 + i * 0.2],
        0.055, 0.055, K.steel, MT.metal);
    }
    wf(b, TR(cx + 0.1, bh + 2.35, cz + 0.24), () => box(b, 0.7, 0.06, 0.06, K.steelDark, MT.metal));
    P.items++;                                      // 46 吹管架
  }

  // ── 高书架（左侧，5 层画册 + 顶层画册）
  put(b, -18.42, 0, 12.0, () => {
    const L = 6.6, Dp = 0.5, Ht = 4.9;
    for (const sx of [-1, 1]) {
      wf(b, TR(sx * (L / 2 - 0.04), Ht / 2, Dp / 2), () => box(b, 0.08, Ht, Dp, K.woodMid, MT.wood));
    }
    wf(b, TR(0, Ht / 2, 0.03), () => box(b, L, Ht, 0.06, mulc(K.wood, 0.86), MT.wood));
    const ys = [0.12, 1.08, 2.04, 3.0, 3.9];
    for (const y of ys) {
      wf(b, TR(0, y, Dp / 2), () => box(b, L - 0.14, 0.06, Dp - 0.04, K.wood, MT.wood,
        { topCol: mulc(K.wood, 1.07) }));
      wf(b, TR(0, y - 0.045, Dp - 0.02), () => box(b, L - 0.3, 0.025, 0.02, K.brass, MT.brass));
    }
    for (let k = 0; k < 5; k++) {
      bookRow(b, -L / 2 + 0.16, L / 2 - 0.16, ys[k] + 0.03, 0.28, 0.26, rng);
    }
    P.items++;                                      // 47 高书架（5 层）
    // 顶层：立着的画册 + 玻璃小件
    for (let i = 0; i < 4; i++) {
      wf(b, TR(-1.7 + i * 0.86, 3.96 + 0.42, 0.28), () => box(b, 0.72, 0.84, 0.3,
        [K.ice, K.cream, K.blush, K.mint][i], MT.paper, { topCol: mulc(K.cream, 1.08) }));
    }
    wf(b, TR(2.2, 3.96, 0.26), () => {
      cyl(b, 12, 0.16, 0.1, 0.3, K.glassPale, MT.glass, 0);
      wf(b, TR(0, 0.32, 0), () => sphere(b, 0.13, mixc(K.aquaGlow, K.snow, 0.3), MT.glow,
        { rings: 5, seg: 8, jitter: 0.04 }));
    });
    P.items++;                                      // 48 书架画册与顶层玻璃小件
  }, Math.PI / 2);

  // ── 玻璃展示柜（柜里一块蛋糕 + 一只玻璃小鲸）
  {
    const cx = -17.98, cz = 17.1, dep = 0.88, wid = 1.7;
    wf(b, TR(cx, 0.42, cz), () => box(b, dep, 0.84, wid, K.woodMid, MT.woodHi,
      { topCol: mulc(K.woodMid, 1.06) }));
    wf(b, TR(cx, 0.1, cz), () => box(b, dep + 0.06, 0.2, wid + 0.06, K.woodDark, MT.wood));
    wf(b, TR(cx, 1.6, cz), () => box(b, dep - 0.06, 1.5, wid - 0.06, K.glassPale, MT.glass));
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        wf(b, TR(cx + sx * (dep / 2 - 0.04), 1.6, cz + sz * (wid / 2 - 0.04)), () => {
          box(b, 0.06, 1.52, 0.06, K.brass, MT.brass);
        });
      }
    }
    for (const y of [0.86, 2.36]) {
      wf(b, TR(cx, y, cz), () => {
        box(b, dep, 0.05, 0.05, K.brass, MT.brass);
        box(b, 0.05, 0.05, wid, K.brass, MT.brass);
      });
    }
    wf(b, TR(cx, 2.4, cz), () => box(b, dep + 0.06, 0.06, wid + 0.06, K.woodDark, MT.wood));
    P.items++;                                      // 49 玻璃展示柜
    // 柜内：黄铜托盘 + 三层蛋糕
    wf(b, TR(cx, 0.88, cz), () => {
      cyl(b, 16, 0.36, 0.34, 0.04, K.glassPale, MT.glass, 0);
      cyl(b, 14, 0.05, 0.05, 0.14, K.brass, MT.brass, 0.04);
      cyl(b, 16, 0.3, 0.3, 0.035, K.brassHi, MT.brass, 0.18);
    });
    put(b, cx, 1.1, cz, () => {
      cyl(b, 18, 0.27, 0.27, 0.14, K.cream, [0.14, 0.4], 0);
      cyl(b, 18, 0.25, 0.25, 0.1, mixc(K.cream, K.blush, 0.55), [0.24, 0.5], 0.14);
      cyl(b, 18, 0.2, 0.2, 0.09, K.snow, [0.18, 0.45], 0.24);
      cyl(b, 16, 0.21, 0.2, 0.03, mixc(K.blush, K.snow, 0.4), [0.3, 0.55], 0.33);
      wf(b, TR(0, 0.37, 0), () => sphere(b, 0.05, K.blushDk, [0.24, 0.8], { rings: 4, seg: 8, jitter: 0 }));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU;
        wf(b, TR(Math.cos(a) * 0.16, 0.35, Math.sin(a) * 0.16), () => sphere(b, 0.022,
          [K.butter, K.snow, K.mint][i % 3], [0.3, 0.6], { rings: 3, seg: 5, jitter: 0 }));
      }
    });
    P.items++;                                      // 50 柜内三层蛋糕
    // 柜内：玻璃小鲸（呼应天空鲸）
    put(b, cx, 1.32, cz + 0.5, () => {
      wf(b, TR(0, 0.02, 0), () => disc(b, 0.2, 12, K.brass, MT.brass, { y: 0 }));
      wf(b, m4.mul(TR(0, 0.26, 0), m4.rotY(0.5)), () => {
        ellipsoid(b, 0.42, 0.2, 0.22, 12, 7, C.whaleBody, [0.34, 0.86]);
        ellipsoid(b, 0.3, 0.1, 0.16, 10, 5, C.whaleBelly, [0.3, 0.8]);
        b.tri([-0.36, 0.02, 0], [-0.62, 0.16, 0.16], [-0.58, 0.02, -0.02], C.whaleFin, [0.3, 0.8]);
        b.tri([-0.36, 0.02, 0], [-0.58, 0.02, -0.02], [-0.62, -0.1, 0.1], C.whaleFin, [0.3, 0.8]);
        b.tri([0.06, -0.1, 0.14], [0.2, -0.22, 0.3], [0.24, -0.08, 0.12], C.whaleFin, [0.3, 0.8]);
        b.tri([0.06, -0.1, -0.14], [0.24, -0.08, -0.12], [0.2, -0.22, -0.3], C.whaleFin, [0.3, 0.8]);
      });
    });
    P.items++;                                      // 51 柜内玻璃小鲸
    // 柜前黄铜说明牌
    wf(b, TR(cx + dep / 2 + 0.02, 1.05, cz), () => box(b, 0.03, 0.16, 0.44, K.brassHi, MT.brass));
    P.items++;                                      // 52 柜前黄铜说明牌
  }

  // ── 玻璃作品架（黄铜 + 玻璃，六件成组）
  {
    const cx = -18.16, cz = 19.8, dep = 0.62, wid = 2.6;
    for (const y of [0.5, 1.5, 2.5]) {
      wf(b, TR(cx, y, cz), () => box(b, dep, 0.05, wid, K.glassPale, MT.glass));
      wf(b, TR(cx, y - 0.03, cz), () => box(b, dep + 0.04, 0.03, wid + 0.04, K.brass, MT.brass));
    }
    for (const sz of [-1, 1]) {
      wf(b, TR(cx - 0.02, 1.5, cz + sz * (wid / 2 - 0.03)), () => box(b, dep, 3.1, 0.06, K.brass, MT.brass));
    }
    wf(b, TR(cx - dep / 2 + 0.02, 1.5, cz), () => box(b, 0.05, 3.1, wid, K.woodMid, MT.wood));
    const glassCols = [K.aquaGlow, K.blush, K.butter, K.mint, K.glassCyan, K.snow];
    const shapes = [
      [0, 0.5, 0.16, 'vase'], [0.42, 0.5, 0.13, 'orb'], [-0.42, 0.5, 0.12, 'cone'],
      [0.2, 1.5, 0.15, 'drop'], [-0.3, 1.5, 0.11, 'orb'], [0.5, 1.5, 0.12, 'vase'],
    ];
    for (let i = 0; i < shapes.length; i++) {
      const sh = shapes[i];
      put(b, cx + 0.03, sh[1], cz + sh[0], () => {
        const col = mixc(glassCols[i], K.snow, 0.2);
        if (sh[3] === 'vase') {
          lathe(b, [[0.01, 0], [sh[2], 0.01], [sh[2] * 1.1, 0.18], [sh[2] * 0.7, 0.4], [sh[2] * 0.9, 0.5], [sh[2] * 0.8, 0.52]],
            12, col, MT.glow);
        } else if (sh[3] === 'orb') {
          sphere(b, sh[2], col, MT.glow, { rings: 6, seg: 10, jitter: 0.06 });
          put(b, 0, sh[2], 0, () => cyl(b, 6, 0.02, 0.02, 0.06, K.brass, MT.brass, 0));
        } else if (sh[3] === 'cone') {
          cyl(b, 12, sh[2], sh[2] * 0.15, 0.44, col, MT.glow, 0);
        } else {
          lathe(b, [[0.005, 0.5], [sh[2] * 0.5, 0.4], [sh[2], 0.2], [sh[2] * 0.8, 0.04], [0.02, 0]],
            10, col, MT.glow);
        }
      });
    }
    P.items++;                                      // 53 玻璃作品架与六件玻璃器
  }

  // ── 左后角大蕨与角落小盆栽
  pottedPlant(b, -17.4, 23.6, 1.5, rng, { potCol: K.cream, leaves: 15, leafLen: 0.48, tilt: 0.12, leafCol: mixc(K.leaf, K.leafLt, 0.45) });
  P.items++;                                        // 54 左后角大蕨
  pottedPlant(b, -16.2, 25.0, 0.9, rng, { potCol: K.clay, leaves: 10, leafLen: 0.42, tilt: 0.24, leafCol: mixc(K.leaf, K.leafLt, 0.5) });
  P.items++;                                        // 55 角落小盆栽

  // ── 墙上的蓝图挂画（书架上方两幅）
  for (const f of [[9.9, 0.95], [12.6, 1.2]]) {
    const wz = f[1] * 1.3, hy = f[1] * 1.1;
    wf(b, TR(-19.02, 6.7, f[0]), () => {
      box(b, 0.08, 1.55, wz, K.woodDark, MT.wood, { topCol: mulc(K.woodDark, 1.1) });
      box(b, 0.055, hy, f[1], K.paper, MT.paper, { topCol: K.snow });
      b.quad([0.04, -hy / 2 + 0.06, -f[1] / 2 + 0.06], [0.04, -hy / 2 + 0.06, f[1] / 2 - 0.06],
             [0.04, hy / 2 - 0.06, f[1] / 2 - 0.06], [0.04, hy / 2 - 0.06, -f[1] / 2 + 0.06],
             mixc(K.screen, K.snow, 0.55), [0.16, 0.2], [1, 0, 0]);
      for (let i = 0; i < 3; i++) {
        b.quad([0.045, -hy / 2 + 0.18 + i * 0.26, -f[1] / 2 + 0.14],
               [0.045, -hy / 2 + 0.18 + i * 0.26, f[1] / 2 - 0.14],
               [0.045, -hy / 2 + 0.22 + i * 0.26, f[1] / 2 - 0.14],
               [0.045, -hy / 2 + 0.22 + i * 0.26, -f[1] / 2 + 0.14],
               mixc(K.aquaGlow, K.snow, 0.55), [0.2, 0.2], [1, 0, 0]);
      }
    });
  }
  P.items++;                                        // 56 墙上蓝图挂画两幅
}

// ================================================================ 07 右墙：纸箱 / 木格栅 / 梯子 / 灯箱 / 玻璃熔炉 / 植物角
function buildRightWall(b, P, rng) {
  // ── 纸箱堆与胶带
  put(b, 17.5, 0, 2.5, () => {
    box(b, 1.1, 0.9, 1.4, K.clayLt, MT.paper, { topCol: mulc(K.clayLt, 1.08) });
    wf(b, TR(0, 0.47, 0), () => box(b, 1.14, 0.03, 0.16, K.woodMid, MT.paper));
    wf(b, TR(0.05, 0.48, 0.4), () => box(b, 0.8, 0.5, 0.7, K.paper, MT.paper));
    wf(b, TR(-0.1, 0.75, -0.1), () => box(b, 0.5, 0.3, 0.42, mulc(K.clayLt, 0.94), MT.paper));
    wf(b, TR(0.5, 0.94, 0.2), () => torus(b, 0.09, 0.035, 14, 5, K.ice, MT.paper, 'z'));
  }, 0.12);
  P.items++;                                        // 57 纸箱堆与胶带

  // ── 木格栅墙板
  for (let i = 0; i < 15; i++) {
    const z = 4.7 + i * 0.32;
    wf(b, TR(18.86, 1.75, z), () => box(b, 0.18, 3.5, 0.13, K.woodMid, MT.wood,
      { topCol: mulc(K.woodMid, 1.1) }));
  }
  wf(b, TR(18.86, 3.55, 7.0), () => box(b, 0.22, 0.1, 5.0, K.woodDark, MT.wood));
  wf(b, TR(18.86, 0.5, 7.0), () => box(b, 0.22, 0.1, 5.0, K.woodDark, MT.wood));
  P.items++;                                        // 58 木格栅墙板

  // ── 格栅下的低木箱
  put(b, 17.9, 0, 6.4, () => {
    box(b, 0.9, 0.7, 1.3, K.woodMid, MT.wood, { topCol: mulc(K.woodMid, 1.06) });
    wf(b, TR(0, 0.36, 0), () => box(b, 0.94, 0.05, 1.34, K.woodDark, MT.wood));
    for (let i = 0; i < 3; i++) {
      wf(b, TR(0, 0.6 - i * 0.02, 0), () => box(b, 0.06, 0.04, 0.5, K.brass, MT.brass));
    }
  });
  P.items++;                                        // 59 格栅下木箱

  // ── 木梯（斜靠右墙）
  put(b, 18.0, 0, 9.6, () => {
    for (const s of [-1, 1]) {
      bar3(b, [s * 0.2, 0.02, 0.5], [s * 0.2, 3.6, -0.45], 0.07, 0.07, K.woodPale, MT.wood);
    }
    for (let i = 0; i < 5; i++) {
      const t = 0.1 + i * 0.19;
      bar3(b, [-0.2, 0.1 + t * 3.4, 0.46 - t * 0.9], [0.2, 0.1 + t * 3.4, 0.46 - t * 0.9],
        0.05, 0.03, mulc(K.woodPale, 0.95), MT.wood);
    }
  }, 0.1);
  P.items++;                                        // 60 木梯

  // ── 墙面灯箱（发光蓝图）
  put(b, 18.98, 3.0, 11.6, () => {
    box(b, 0.16, 2.0, 2.4, K.brass, MT.brass);
    b.quad([-0.09, -0.85, -1.05], [-0.09, -0.85, 1.05], [-0.09, 0.85, 1.05], [-0.09, 0.85, -1.05],
      mixc(K.aquaGlow, K.snow, 0.55), [0.62, 0.2], [-1, 0, 0]);
    for (let i = 0; i < 4; i++) {
      b.quad([-0.1, -0.6 + i * 0.34, -0.9], [-0.1, -0.6 + i * 0.34, 0.9],
             [-0.1, -0.56 + i * 0.34, 0.9], [-0.1, -0.56 + i * 0.34, -0.9],
             mixc(K.screen, K.snow, 0.3), [0.8, 0.2], [-1, 0, 0]);
    }
  });
  P.items++;                                        // 61 墙面发光灯箱

  // ── 工具推车
  put(b, 17.3, 0, 12.9, () => {
    for (const y of [0.2, 0.72, 1.18]) {
      wf(b, TR(0, y, 0), () => box(b, 0.8, 0.05, 1.1, K.steel, MT.metal));
    }
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        wf(b, TR(sx * 0.36, 0.6, sz * 0.5), () => box(b, 0.05, 1.2, 0.05, K.steelDark, MT.metal));
      }
    }
    for (let i = 0; i < 4; i++) {
      wf(b, TR(-0.28 + (i % 2) * 0.56, 0.12, -0.4 + ((i / 2) | 0) * 0.8), () => {
        cyl(b, 8, 0.09, 0.09, 0.06, K.charcoal, MT.metal, 0);
      });
    }
    wf(b, TR(0, 0.77, 0.2), () => box(b, 0.6, 0.22, 0.5, K.woodMid, MT.wood));
    for (let i = 0; i < 3; i++) {
      wf(b, TR(-0.2 + i * 0.2, 1.24, -0.2), () => cyl(b, 8, 0.06, 0.06, 0.24, K.brass, MT.brass, 0));
    }
  }, -0.04);
  P.items++;                                        // 62 工具推车

  // ── 玻璃熔炉（砖砌炉体 + 发光炉口 + 烟道）
  put(b, 17.3, 0, 15.0, () => {
    wf(b, TR(0, 0.22, 0), () => box(b, 2.4, 0.44, 2.4, K.stoneDk, MT.paint,
      { topCol: mulc(K.stoneDk, 1.08) }));
    wf(b, TR(0, 1.3, 0), () => box(b, 2.2, 1.5, 2.2, mixc(K.clay, K.stoneDk, 0.45), MT.paint,
      { topCol: mulc(K.clay, 1.02) }));
    for (let i = 0; i < 3; i++) {
      wf(b, TR(0, 0.7 + i * 0.42, 0), () => box(b, 2.26, 0.035, 2.26, mixc(K.stoneDk, K.ink, 0.3), MT.paint));
    }
    // 炉口（朝室内 -X）
    wf(b, TR(-1.08, 1.1, 0), () => {
      box(b, 0.22, 0.95, 1.0, K.charcoal, MT.metal);
      b.quad([-0.12, -0.4, -0.4], [-0.12, -0.4, 0.4], [-0.12, 0.4, 0.4], [-0.12, 0.4, -0.4],
        K.ember, MT.ember, [-1, 0, 0]);
      b.quad([-0.13, -0.3, -0.28], [-0.13, -0.3, 0.28], [-0.13, 0.3, 0.28], [-0.13, 0.3, -0.28],
        K.butter, [0.95, 0.2], [-1, 0, 0]);
    });
    for (const y of [0.12, 1.55]) {
      wf(b, TR(-1.1, y, 0), () => box(b, 0.1, 0.1, 1.3, K.steelDark, MT.metal));
    }
    wf(b, TR(0, 2.15, 0), () => box(b, 1.9, 0.4, 1.9, K.stoneDk, MT.paint, { topCol: mulc(K.stoneDk, 1.1) }));
    // 烟道直通顶棚
    wf(b, TR(0.4, 2.35, 0), () => {
      cyl(b, 12, 0.24, 0.24, 14.9, K.steel, MT.metal, 0);
      wf(b, TR(0, 14.9, 0), () => cyl(b, 12, 0.3, 0.24, 0.3, K.steelDark, MT.metal, 0));
    });
    wf(b, TR(-1.5, 0.06, 0), () => box(b, 0.8, 0.12, 1.8, K.stoneDk, MT.paint));
  });
  P.items++;                                        // 63 玻璃熔炉

  // ── 吹管架（三根）
  for (let i = 0; i < 3; i++) {
    bar3(b, [16.0, 0.1, 16.6 + i * 0.22], [17.4, 2.6, 16.2 + i * 0.2], 0.05, 0.05, K.steel, MT.metal);
  }
  wf(b, TR(16.7, 2.62, 16.5), () => box(b, 1.7, 0.07, 0.07, K.steelDark, MT.metal));
  P.items++;                                        // 64 吹管架

  // ── 玻璃碎料桶
  put(b, 16.9, 0, 18.1, () => {
    cyl(b, 14, 0.36, 0.4, 0.6, K.woodMid, MT.wood, 0);
    wf(b, TR(0, 0.6, 0), () => torus(b, 0.39, 0.04, 16, 4, K.steel, MT.metal, 'y'));
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU, rr = 0.1 + rng() * 0.18;
      wf(b, TR(Math.cos(a) * rr, 0.65 + rng() * 0.14, Math.sin(a) * rr), () => sphere(b,
        0.06 + rng() * 0.05, [K.aquaGlow, K.blush, K.mint, K.glassPale, K.butter][i % 5],
        MT.glow, { rings: 4, seg: 7, jitter: 0.12 }));
    }
  });
  P.items++;                                        // 65 玻璃碎料桶

  // ── 植物角（龟背竹 / 蕨 / 仙人掌）
  pottedPlant(b, 17.2, 21.4, 1.7, rng, { potCol: K.cream, leaves: 15, leafLen: 0.5, tilt: 0.16, leafCol: mixc(K.leaf, K.leafLt, 0.4) });
  P.items++;                                        // 66 大龟背竹
  pottedPlant(b, 17.7, 24.1, 1.25, rng, { potCol: K.clay, leaves: 13, leafLen: 0.45, tilt: 0.24, leafCol: mixc(K.leaf, K.leafLt, 0.45) });
  P.items++;                                        // 67 大蕨
  put(b, 16.4, 0, 18.9, () => {
    cyl(b, 14, 0.4, 0.42, 0.34, K.cream, MT.cloth, 0);
    wf(b, TR(0, 0.34, 0), () => cyl(b, 14, 0.42, 0.42, 0.05, K.woodMid, MT.wood, 0));
    const cs = [[-0.14, 0, 0.05], [0.14, 0, -0.06], [0.0, 0, 0.16]];
    for (let i = 0; i < 3; i++) {
      const c = cs[i];
      wf(b, TR(c[0], 0.4, c[2]), () => {
        cyl(b, 10, 0.1, 0.12, 0.16, K.clay, MT.ceramic, 0);
        cyl(b, 9, 0.055, 0.05, 0.26 + i * 0.08, K.leafLt, MT.leaf, 0.14);
        wf(b, TR(0, 0.4 + i * 0.08, 0), () => sphere(b, 0.055, K.leaf, MT.leaf,
          { rings: 4, seg: 7, jitter: 0.06 }));
      });
    }
  });
  P.items++;                                        // 68 小毡凳与仙人掌三盆
}

// ================================================================ 08 门墙：挂衣 / 工具板 / 图纸架 / 铜牌
function buildDoorWall(b, P, rng) {
  // ── 挂衣杆与三件外套
  wf(b, m4.mul(TR(-12.6, 2.3, 0.24), m4.rotZ(Math.PI / 2)), () => {
    cyl(b, 8, 0.04, 0.04, 8.4, K.brass, MT.brass, 0);
  });
  for (const h of [-16.2, -14.4, -12.6, -10.8]) {
    wf(b, TR(h, 2.28, 0.3), () => sphere(b, 0.06, K.brassHi, MT.brass, { rings: 4, seg: 6, jitter: 0 }));
  }
  const coats = [[-15.9, K.ice, 1.0], [-14.1, K.cream, 0.9], [-11.1, K.blush, 0.85]];
  for (const c of coats) {
    put(b, c[0], 2.2, 0.36, () => {
      box(b, 0.62 * c[2], 1.15, 0.24, c[1], MT.fabric,
        { topCol: mulc(c[1], 1.06), bottomCol: mulc(c[1], 0.8) });
      wf(b, TR(0, 0.56, 0), () => box(b, 0.2, 0.16, 0.2, mulc(c[1], 0.94), MT.fabric));
      wf(b, TR(-0.3, -0.1, 0), () => box(b, 0.14, 0.7, 0.2, mulc(c[1], 0.92), MT.fabric));
      wf(b, TR(0.3, -0.1, 0), () => box(b, 0.14, 0.7, 0.2, mulc(c[1], 0.92), MT.fabric));
    });
  }
  P.items++;                                        // 69 挂衣杆与三件外套

  // ── 围巾与帆布包
  wf(b, TR(-13.5, 1.5, 0.36), () => {
    box(b, 0.16, 1.2, 0.1, mixc(K.blush, K.butter, 0.4), MT.cloth);
    wf(b, TR(0.02, -0.55, 0), () => box(b, 0.2, 0.12, 0.12, K.blushDk, MT.cloth));
  });
  wf(b, TR(-10.2, 1.25, 0.4), () => box(b, 0.5, 0.55, 0.2, K.clayLt, MT.cloth,
    { topCol: mulc(K.clayLt, 1.05) }));
  P.items++;                                        // 70 围巾与帆布包

  // ── 雨伞架与工靴
  put(b, -17.9, 0, 0.8, () => {
    cyl(b, 14, 0.3, 0.34, 0.6, K.steel, MT.metal, 0);
    wf(b, TR(0, 0.6, 0), () => torus(b, 0.33, 0.035, 16, 4, K.steelDark, MT.metal, 'y'));
    for (let i = 0; i < 2; i++) {
      bar3(b, [i * 0.1 - 0.05, 0.3, 0], [i * 0.16 - 0.08, 1.5, 0.06], 0.05, 0.05,
        i ? K.ice : K.blushDk, MT.cloth);
      wf(b, TR(i * 0.16 - 0.08, 1.52, 0.06), () => torus(b, 0.07, 0.02, 10, 4, K.woodDark, MT.wood, 'z'));
    }
  });
  P.items++;                                        // 71 雨伞架与两把伞
  put(b, -8.6, 0, 0.75, () => {
    for (const s of [-1, 1]) {
      wf(b, m4.mul(TR(s * 0.24, 0.14, 0), m4.rotZ(s * 0.1)), () => {
        box(b, 0.2, 0.28, 0.34, K.woodDark, MT.wood, { topCol: mulc(K.woodDark, 1.1) });
      });
    }
  }, 0.3);
  P.items++;                                        // 72 一双工靴

  // ── 工具挂板（门右）
  put(b, 11.6, 2.1, 0.06, () => {
    box(b, 6.0, 2.2, 0.09, K.woodMid, MT.wood, { topCol: mulc(K.woodMid, 1.05) });
    for (let i = 0; i < 9; i++) {
      wf(b, TR(-2.7 + i * 0.66, 0.9, 0.08), () => sphere(b, 0.035, K.brass, MT.brass,
        { rings: 4, seg: 6, jitter: 0 }));
    }
    // 锤子
    wf(b, TR(-2.1, 0.55, 0.16), () => {
      bar3(b, [0, 0, 0], [0, -0.5, 0], 0.05, 0.05, K.woodPale, MT.wood);
      box(b, 0.28, 0.16, 0.14, K.steelDark, MT.metal);
    });
    // 扳手
    wf(b, TR(-1.0, 0.4, 0.16), () => {
      bar3(b, [0, 0, 0], [0.06, -0.62, 0], 0.06, 0.05, K.steel, MT.metal);
      bar3(b, [0.0, -0.6, 0], [0.26, -0.7, 0], 0.05, 0.04, K.steel, MT.metal);
    });
    // 剪刀
    wf(b, TR(0.1, 0.3, 0.16), () => {
      for (const s of [-1, 1]) {
        bar3(b, [s * 0.03, 0, 0], [s * 0.12, -0.55, 0], 0.035, 0.03, K.steel, MT.metal);
      }
      wf(b, TR(0, 0.06, 0), () => torus(b, 0.06, 0.016, 10, 4, K.brass, MT.brass, 'z'));
    });
    // 卷尺
    wf(b, TR(1.1, 0.55, 0.18), () => {
      cyl(b, 14, 0.14, 0.14, 0.1, K.butter, MT.paint, 0);
      bar3(b, [0, 0, 0], [0.34, -0.4, 0], 0.03, 0.02, K.steelDark, MT.metal);
    });
    // 钳子
    wf(b, TR(2.0, 0.45, 0.16), () => {
      for (const s of [-1, 1]) {
        bar3(b, [s * 0.02, 0, 0], [s * 0.16, -0.5, 0], 0.03, 0.03, K.steelDark, MT.metal);
      }
    });
    // 两只玻璃小瓶
    for (let i = 0; i < 2; i++) {
      wf(b, TR(2.5 - i * 0.3, 0.5, 0.16), () => {
        cyl(b, 8, 0.07, 0.05, 0.24, mixc(K.aquaGlow, K.snow, 0.3), MT.glow, 0);
      });
    }
  });
  P.items++;                                        // 73 工具挂板与工具组

  // ── 图纸挂架（门右，三张蓝图）
  put(b, 16.0, 3.3, 0.22, () => {
    bar3(b, [-1.5, 0, 0], [1.5, 0, 0], 0.05, 0.05, K.brass, MT.brass);
    for (const sx of [-1.4, 1.4]) {
      wf(b, TR(sx, 0, 0.06), () => box(b, 0.08, 0.08, 0.24, K.brass, MT.brass));
    }
    for (let i = 0; i < 3; i++) {
      const x = -1.0 + i * 1.0;
      wf(b, TR(x, 0, 0), () => {
        box(b, 0.06, 0.06, 0.06, K.steelDark, MT.metal);
        b.quad([-0.36, 0, -0.02], [0.36, 0, -0.02], [0.36, -1.3, 0.04], [-0.36, -1.3, 0.04],
          K.paper, MT.paper, [0, 0, 1]);
        b.quad([-0.3, -0.2, 0.0], [0.3, -0.2, 0.0], [0.3, -1.1, 0.06], [-0.3, -1.1, 0.06],
          mixc(K.screen, K.snow, 0.55), [0.2, 0.2], [0, 0, 1]);
      });
    }
  });
  P.items++;                                        // 74 图纸挂架与三张蓝图

  // ── 门上方黄铜珐琅几何牌（不写文字）
  put(b, 0, 16.4, 0.07, () => {
    box(b, 5.4, 1.05, 0.12, K.brass, MT.brass, { topCol: mulc(K.brass, 1.1) });
    box(b, 5.1, 0.8, 0.07, K.brassHi, MT.brass);
    // 三角形 / 圆 / 菱形 三块珐琅
    b.tri([-1.55, -0.22, 0.05], [-0.85, -0.22, 0.05], [-1.2, 0.28, 0.05],
      mixc(K.aquaGlow, K.glassCyan, 0.5), [0.3, 0.7]);
    wf(b, m4.mul(TR(0, 0.02, 0.05), m4.rotX(Math.PI / 2)), () => {
      cyl(b, 18, 0.28, 0.28, 0.05, mixc(K.blush, K.snow, 0.35), [0.3, 0.7], 0);
    });
    b.quad([1.0, 0.26, 0.05], [1.42, 0.0, 0.05], [1.0, -0.26, 0.05], [0.58, 0.0, 0.05],
      mixc(K.butter, K.snow, 0.3), [0.3, 0.7], [0, 0, 1]);
    for (const x of [-2.4, 2.4]) {
      for (const y of [-0.35, 0.35]) {
        wf(b, TR(x, y, 0.06), () => sphere(b, 0.05, K.brassHi, MT.brass, { rings: 4, seg: 6, jitter: 0 }));
      }
    }
  });
  P.items++;                                        // 75 门上方黄铜珐琅几何牌

  // ── 门侧黄铜壁灯一对（从桥上看得见）
  for (const s of [-1, 1]) {
    wf(b, TR(s * 7.9, 6.6, 0.1), () => {
      box(b, 0.24, 0.24, 0.18, K.brass, MT.brass);
      bar3(b, [0, 0, 0.06], [0, 0.34, 0.34], 0.07, 0.07, K.brass, MT.brass);
      wf(b, TR(0, 0.46, 0.4), () => {
        cyl(b, 10, 0.11, 0.15, 0.42, K.cream, MT.glow, -0.21);
        wf(b, TR(0, -0.24, 0), () => cylinder(b, 10, 0.15, 0.06, 0.1, K.brass, MT.brass, 0));
        wf(b, TR(0, -0.02, 0), () => sphere(b, 0.07, K.cream, [0.93, 0.2], { rings: 4, seg: 8, jitter: 0 }));
      });
    });
  }
  P.items++;                                        // 76 门侧黄铜壁灯一对

  // ── 门右侧小桌与玻璃弹珠盘
  put(b, 8.2, 0, 1.35, () => {
    cyl(b, 14, 0.36, 0.4, 0.05, K.woodPale, MT.woodHi, 0.76);
    cyl(b, 10, 0.07, 0.07, 0.76, K.steelDark, MT.metal, 0);
    cyl(b, 16, 0.26, 0.28, 0.04, K.steelDark, MT.metal, 0);
    wf(b, TR(0.02, 0.81, 0), () => {
      cyl(b, 14, 0.2, 0.22, 0.05, K.brass, MT.brass, 0);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU;
        wf(b, TR(Math.cos(a) * 0.1, 0.07, Math.sin(a) * 0.1), () => sphere(b, 0.05,
          [K.aquaGlow, K.blush, K.butter, K.mint, K.glassPale][i % 5], MT.glow,
          { rings: 4, seg: 7, jitter: 0.02 }));
      }
    });
  });
  P.items++;                                        // 77 门侧小桌与玻璃弹珠盘
}

// ================================================================ 09 顶部：悬挂圆灯阵 / 轨道灯 / 织物遮板 / 气球 / 悬浮玻璃球
function buildCeiling(b, P, rng) {
  // ── 悬挂玻璃圆灯阵（签名件之二）
  const lamps = [
    [-8.4, 12.0, 19.8, 1.05, 17.42],
    [-2.6, 11.2, 21.2, 0.85, 17.95],
    [3.4, 12.5, 19.9, 1.15, 17.42],
    [9.2, 11.6, 21.3, 0.9, 17.95],
    [0.6, 12.4, 13.0, 1.0, 17.42],
  ];
  for (const l of lamps) pendantGlobe(b, l[0], l[1], l[2], l[3], l[4]);
  P.items++;                                        // 78 悬挂玻璃圆灯阵（五盏）

  // ── 白色鼓形吊灯（门厅上方，从桥上看得见）
  put(b, 7.8, 12.6, 6.3, () => {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      bar3(b, [Math.cos(a) * 0.7, 0.3, Math.sin(a) * 0.7], [Math.cos(a) * 0.55, 4.75, Math.sin(a) * 0.55],
        0.022, 0.022, K.charcoal, MT.metal);
    }
    wf(b, TR(0, 0.32, 0), () => cyl(b, 22, 1.08, 1.08, 0.66, K.snow, [0.13, 0.22], 0));
    wf(b, TR(0, 0.02, 0), () => cyl(b, 22, 1.0, 1.0, 0.08, K.cream, [0.72, 0.3], 0));
    wf(b, TR(0, 0.66, 0), () => torus(b, 1.06, 0.05, 24, 5, K.brass, MT.brass, 'y'));
    wf(b, TR(0, 0.98, 0), () => cyl(b, 10, 0.24, 0.2, 0.3, K.brass, MT.brass, 0));
  });
  P.items++;                                        // 79 白色鼓形吊灯

  // ── 轨道射灯（沿 z=18 挂一排）
  wf(b, TR(0, 16.85, 18.0), () => {
    box(b, 30, 0.11, 0.15, K.charcoal, MT.metal);
    for (let i = 0; i < 7; i++) {
      const x = -13.5 + i * 4.5;
      put(b, x, -0.2, 0.05, () => {
        cyl(b, 10, 0.15, 0.15, 0.34, K.charcoal, MT.metal, 0);
        wf(b, TR(0, 0.02, 0), () => cyl(b, 10, 0.13, 0.13, 0.03, K.cream, [0.78, 0.35], 0));
        wf(b, TR(0, 0.2, 0), () => box(b, 0.06, 0.1, 0.06, K.steelDark, MT.metal));
      }, 0, 0.42, 0);
    }
  });
  P.items++;                                        // 80 轨道射灯排

  // ── 顶梁间的白色织物遮板（吸音帆布）
  for (const bz of [9.85, 16.35]) {
    for (const bx of [-12.6, 0, 12.6]) {
      wf(b, TR(bx, 17.9, bz), () => box(b, 8.2, 0.07, 2.3, mixc(K.snow, K.ice, 0.35), [0.12, 0.1]));
    }
  }
  P.items++;                                        // 81 顶梁间织物遮板

  // ── 发光顶灯带（把房间真正照亮）
  for (const bz of [11.0, 15.2]) {
    wf(b, TR(0, 17.62, bz), () => {
      box(b, 30, 0.08, 1.1, K.snow, [0.10, 0.3]);
      wf(b, TR(0, -0.05, 0), () => box(b, 30.2, 0.03, 1.24, K.cream, [0.14, 0.25]));
    });
  }
  P.items++;                                        // 82 发光顶灯带

  // ── 吊篮绿植（三只）
  const hang = [[-15.6, 12.0, 11.6, 0.6], [14.6, 11.4, 8.6, 0.55], [-5.4, 12.6, 24.2, 0.5]];
  for (const h of hang) {
    put(b, h[0], h[1], h[2], () => {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + 0.4;
        bar3(b, [0, 0.24, 0], [Math.cos(a) * h[3] * 0.9, 5.3, Math.sin(a) * h[3] * 0.9],
          0.014, 0.014, K.steelDark, MT.metal);
      }
      cyl(b, 14, h[3] * 0.8, h[3], h[3] * 0.9, K.cream, MT.ceramic, -h[3] * 0.45);
      wf(b, TR(0, h[3] * 0.45, 0), () => torus(b, h[3] * 0.95, 0.03, 14, 4, K.woodMid, MT.wood, 'y'));
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU + rng();
        const rr = h[3] * (0.8 + rng() * 0.4);
        bar3(b, [Math.cos(a) * h[3] * 0.6, h[3] * 0.4, Math.sin(a) * h[3] * 0.6],
          [Math.cos(a) * rr, -h[3] * (0.5 + rng() * 0.9), Math.sin(a) * rr],
          0.02, 0.02, K.leafDk, MT.leaf);
        put(b, Math.cos(a) * rr, -h[3] * (0.5 + rng() * 0.8), Math.sin(a) * rr, () => {
          leafShape(b, 0.3 + rng() * 0.2, 0.13, K.leafLt, MT.leaf, 0.4);
        }, a, Math.PI * 0.92, rng());
      }
    });
  }
  P.items++;                                        // 83 吊篮绿植三只

  // ── 气球（静态浮空）
  const balloons = [
    [-11.3, 9.9, 15.2, 0.44, K.blush],
    [-10.1, 10.9, 16.5, 0.38, K.snow],
    [11.7, 10.4, 13.4, 0.4, K.mint],
    [-12.7, 11.2, 13.7, 0.35, K.butter],
  ];
  for (const bl of balloons) {
    put(b, bl[0], bl[1], bl[2], () => {
      sphere(b, bl[3], bl[4], MT.cloth, { rings: 7, seg: 11, jitter: 0.02 });
      wf(b, TR(0, -bl[3] * 0.98, 0), () => cyl(b, 6, 0.05, 0.03, 0.07, mulc(bl[4], 0.92), MT.cloth, 0));
      bar3(b, [0, -bl[3] * 1.02, 0], [0.05, -bl[3] * 2.1, 0.04], 0.012, 0.012, mulc(bl[4], 0.8), MT.cloth);
    });
  }
  P.items++;                                        // 84 气球四只

  // ── 悬浮的玻璃球（魔法感：静态停在半空）
  const fly = [
    [-6.2, 4.6, 18.2, 0.19], [7.4, 5.8, 16.0, 0.15], [-9.6, 6.4, 12.4, 0.22],
    [12.2, 4.2, 19.4, 0.17], [1.6, 3.4, 20.8, 0.14], [-3.4, 6.9, 21.6, 0.16],
  ];
  for (const f of fly) {
    put(b, f[0], f[1], f[2], () => {
      sphere(b, f[3], mixc(K.aquaGlow, K.glassPale, 0.35), MT.glow, { rings: 6, seg: 9, jitter: 0.03 });
    });
  }
  P.items++;                                        // 85 悬浮玻璃球
}


// ================================================================ 09 墙体设计：木护墙板 / 上部横梁 / 画框 / 玻璃砖墙 / 发光玻璃柱
// 说明：外壳只给了一面素墙，这里补"墙裙 + 木饰条 + 挂饰"，四壁才有设计感。
function wallBand(b, kind, a0, a1) {
  // kind: 'door'（z=0，朝 +Z）/ 'win'（z=26，朝 -Z）/ 'left'（x=-19.1，朝 +X）/ 'right'（x=19.1，朝 -X）
  const len = a1 - a0, mid = (a0 + a1) / 2;
  const H0 = 0.18, H1 = 2.42;
  const wood = mixc(mixc(K.woodMid, K.woodPale, 0.4), rgb('#cfd9e2'), 0.3), woodD = mulc(wood, 0.88);
  if (kind === 'door' || kind === 'win') {
    const zc = kind === 'door' ? 0.1 : 25.9;
    wf(b, TR(mid, (H0 + H1) / 2, zc), () => box(b, len, H1 - H0, 0.2, wood, MT.wood,
      { topCol: mulc(wood, 1.06), bottomCol: mulc(wood, 0.8) }));
    // 竖向木饰条
    const n = Math.max(1, Math.round(len / 1.55));
    for (let i = 1; i < n; i++) {
      const x = a0 + (len * i) / n;
      wf(b, TR(x, (H0 + H1) / 2, zc + (kind === 'door' ? 0.13 : -0.13)), () => box(b, 0.1, H1 - H0 - 0.1, 0.06,
        mulc(woodD, 1.0), MT.wood));
    }
    // 黄铜压顶
    wf(b, TR(mid, H1 + 0.06, zc + (kind === 'door' ? 0.14 : -0.14)), () => box(b, len, 0.12, 0.28, K.bronze, MT.brass));
  } else {
    const xc = kind === 'left' ? -19.0 : 19.0;
    const sx = 0.2, sz = 1;
    wf(b, TR(xc, (H0 + H1) / 2, mid), () => box(b, sx, H1 - H0, len, wood, MT.wood,
      { topCol: mulc(wood, 1.06), bottomCol: mulc(wood, 0.8) }));
    const n = Math.max(1, Math.round(len / 1.55));
    for (let i = 1; i < n; i++) {
      const z = a0 + (len * i) / n;
      wf(b, TR(xc + (kind === 'left' ? 0.13 : -0.13), (H0 + H1) / 2, z), () => box(b, 0.06, H1 - H0 - 0.1, 0.1,
        woodD, MT.wood));
    }
    wf(b, TR(xc + (kind === 'left' ? 0.14 : -0.14), H1 + 0.06, mid), () => box(b, 0.28, 0.12, len, K.bronze, MT.brass));
  }
}

// 一幅"蓝图挂画"（贴墙，法线朝房内）
function wallPicture(b, x, y, z, w, h, ry, col) {
  put(b, x, y, z, () => {
    box(b, w + 0.14, h + 0.14, 0.07, K.woodDark, MT.wood, { topCol: mulc(K.woodDark, 1.12) });
    box(b, w, h, 0.1, K.paper, MT.paper, { topCol: K.snow });
    b.quad([-w / 2 + 0.06, -h / 2 + 0.06, 0.06], [w / 2 - 0.06, -h / 2 + 0.06, 0.06],
           [w / 2 - 0.06, h / 2 - 0.06, 0.06], [-w / 2 + 0.06, h / 2 - 0.06, 0.06],
           col, [0.16, 0.2], [0, 0, 1]);
    for (let i = 0; i < 3; i++) {
      const yy = -h / 2 + 0.2 + i * (h / 4);
      b.quad([-w / 2 + 0.16, yy, 0.065], [w / 2 - 0.16, yy, 0.065],
             [w / 2 - 0.16, yy + 0.05, 0.065], [-w / 2 + 0.16, yy + 0.05, 0.065],
             mixc(K.aquaGlow, K.snow, 0.55), [0.2, 0.2], [0, 0, 1]);
    }
  }, ry);
}

function buildWalls(b, P, rng) {
  // ── 木护墙板（门墙两段 / 窗墙两侧 / 左右墙）
  wallBand(b, 'door', -19.0, -6.9); wallBand(b, 'door', 6.9, 19.0);
  wallBand(b, 'win', -19.0, -15.4); wallBand(b, 'win', 15.4, 19.0);
  wallBand(b, 'left', 0.4, 25.6); wallBand(b, 'right', 0.4, 25.6);
  P.items++;                                        // 86 木护墙板与黄铜压顶

  // ── 上部木饰横梁（把高墙分成两段，压住"白墙一片"）
  for (const s2 of [-1, 1]) {
    wf(b, TR(s2 * 19.0, 8.8, 13.0), () => box(b, 0.14, 0.18, 25.0, mixc(K.woodDark, K.woodPale, 0.45), MT.wood));
    wf(b, TR(s2 * 19.0, 15.45, 13.0), () => box(b, 0.14, 0.18, 25.0, mixc(K.woodDark, K.woodPale, 0.45), MT.wood));
  }
  for (const s2 of [-1, 1]) {
    wf(b, TR(s2 * 13.0, 8.8, 0.1), () => box(b, 12.0, 0.18, 0.14, mixc(K.woodDark, K.woodPale, 0.45), MT.wood));
    wf(b, TR(s2 * 13.0, 15.45, 0.1), () => box(b, 12.0, 0.18, 0.14, mixc(K.woodDark, K.woodPale, 0.45), MT.wood));
  }
  P.items++;                                        // 87 上部木饰横梁

  // ── 门墙左侧：玻璃砖发光墙（4 × 3.4 m）
  wf(b, TR(-9.0, 2.55, 0.14), () => {
    box(b, 4.2, 3.4, 0.16, mixc(K.glassPale, K.glassCyan, 0.35), [0.16, 0.88]);
    for (let i = 0; i < 7; i++) {
      wf(b, TR(0, -1.5 + i * 0.5, 0.1), () => box(b, 4.2, 0.05, 0.06, K.snow, [0.2, 0.5]));
    }
    for (let i = 0; i < 5; i++) {
      wf(b, TR(-1.7 + i * 0.85, 0, 0.1), () => box(b, 0.05, 3.4, 0.06, K.snow, [0.2, 0.5]));
    }
    // 黄铜边
    for (const yy of [-1.7, 1.7]) {
      wf(b, TR(0, yy, 0.12), () => box(b, 4.3, 0.08, 0.1, K.brass, MT.brass));
    }
    for (const xx of [-2.1, 2.1]) {
      wf(b, TR(xx, 0, 0.12), () => box(b, 0.08, 3.44, 0.1, K.brass, MT.brass));
    }
  });
  P.items++;                                        // 88 玻璃砖发光墙

  // ── 门墙左侧：三幅蓝图 + 玻璃浮搁板
  wallPicture(b, -17.2, 5.6, 0.08, 1.0, 1.35, 0, mixc(K.screen, K.snow, 0.55));
  wallPicture(b, -14.6, 5.6, 0.08, 1.2, 1.5, 0, mixc(K.blush, K.snow, 0.5));
  wallPicture(b, -11.9, 5.6, 0.08, 1.0, 1.3, 0, mixc(K.butter, K.snow, 0.5));
  wf(b, TR(-14.6, 3.85, 0.3), () => box(b, 5.4, 0.07, 0.42, K.glassPale, MT.glass));
  for (const xx of [-16.6, -14.6, -12.6]) {
    wf(b, TR(xx, 3.7, 0.3), () => box(b, 0.05, 0.3, 0.34, K.brass, MT.brass));
  }
  const shelfGlass = [K.aquaGlow, K.blush, K.butter, K.mint];
  for (let i = 0; i < 4; i++) {
    wf(b, TR(-16.4 + i * 1.2, 3.95, 0.3), () => {
      cyl(b, 10, 0.11, 0.09, 0.24, mixc(shelfGlass[i], K.snow, 0.25), MT.glow, 0);
      cyl(b, 8, 0.06, 0.05, 0.06, K.brass, MT.brass, 0.24);
    });
  }
  P.items++;                                        // 89 门墙蓝图与玻璃浮搁板

  // ── 门墙右侧：两幅蓝图 + 一排挂钩
  wallPicture(b, 17.4, 5.2, 0.08, 1.4, 1.1, 0, mixc(K.aquaGlow, K.snow, 0.55));
  wallPicture(b, 15.2, 4.6, 0.08, 1.0, 0.9, 0, mixc(K.mint, K.snow, 0.5));
  for (let i = 0; i < 5; i++) {
    wf(b, TR(8.4 + i * 0.9, 4.3, 0.1), () => box(b, 0.6, 0.08, 0.12, K.brass, MT.brass));
  }
  P.items++;                                        // 90 门墙右侧挂画与挂钩排

  // ── 右墙：挂画 / 圆镜 / 玻璃搁板
  wallPicture(b, 19.01, 5.4, 6.4, 1.2, 1.5, -Math.PI / 2, mixc(K.screen, K.snow, 0.5));
  wallPicture(b, 19.01, 5.4, 9.0, 1.0, 1.2, -Math.PI / 2, mixc(K.blush, K.snow, 0.45));
  put(b, 19.0, 5.6, 2.9, () => {
    cylinder(b, 24, 0.62, 0.62, 0.1, mixc(K.glassPale, K.ice, 0.4), [0.14, 0.92], { y0: 0 });
    wf(b, TR(0, 0, 0), () => torus(b, 0.66, 0.05, 20, 5, K.brass, MT.brass, 'y'));
  }, 0, 0, Math.PI / 2);
  wf(b, TR(18.85, 4.35, 17.4), () => box(b, 0.4, 0.07, 3.4, K.glassPale, MT.glass));
  for (const zz of [16.0, 17.4, 18.8]) {
    wf(b, TR(18.85, 4.2, zz), () => box(b, 0.34, 0.3, 0.05, K.brass, MT.brass));
  }
  for (let i = 0; i < 3; i++) {
    wf(b, TR(18.85, 4.5, 16.4 + i * 0.9), () => {
      sphere(b, 0.16, [K.aquaGlow, K.butter, K.mint][i], MT.glow, { rings: 5, seg: 8, jitter: 0.05 });
      cyl(b, 8, 0.05, 0.05, 0.06, K.brass, MT.brass, -0.19);
    });
  }
  P.items++;                                        // 91 右墙挂画/圆镜/玻璃搁板

  // ── 窗墙两侧：发光玻璃柱（把 30 m 拱窗框起来）
  for (const s2 of [-1, 1]) {
    wf(b, TR(s2 * 17.3, 7.6, 25.8), () => {
      box(b, 0.62, 11.4, 0.14, mixc(K.aquaGlow, K.snow, 0.45), [0.20, 0.86]);
      for (const yy of [-5.7, 5.7]) {
        wf(b, TR(0, yy, 0.09), () => box(b, 0.72, 0.12, 0.12, K.brass, MT.brass));
      }
      for (const yy of [-2.6, 0.4, 3.4]) {
        wf(b, TR(0, yy, 0.09), () => box(b, 0.66, 0.05, 0.1, K.brass, MT.brass));
      }
    });
  }
  P.items++;                                        // 92 窗侧发光玻璃柱

  // ── 门口第二道轨道灯（照亮门厅，back 机位上方不再是白板）
  wf(b, TR(0, 16.9, 7.2), () => {
    box(b, 22, 0.1, 0.14, K.charcoal, MT.metal);
    for (let i = 0; i < 5; i++) {
      const x = -9 + i * 4.5;
      put(b, x, -0.16, 0.04, () => {
        cyl(b, 8, 0.12, 0.12, 0.28, K.charcoal, MT.metal, 0);
        wf(b, TR(0, 0.02, 0), () => cyl(b, 8, 0.1, 0.1, 0.03, K.cream, [0.7, 0.35], 0));
      }, 0, 0.4, 0);
    }
  });
  P.items++;                                        // 93 门厅轨道灯
  // ── 墙上玻璃壁灯（右墙三盏 / 左墙两盏，暖光块面）
  const sconces = [[18.94, 6.6, 4.4, -1], [18.94, 6.6, 12.9, -1], [18.94, 6.6, 20.6, -1],
                   [-18.94, 6.6, 7.6, 1], [-18.94, 6.6, 19.4, 1]];
  for (const sc of sconces) {
    // 局部 +Z = 朝房内
    put(b, sc[0], sc[1], sc[2], () => {
      box(b, 0.24, 0.3, 0.18, K.bronze, MT.brass);
      wf(b, TR(0, 0.16, 0.14), () => box(b, 0.1, 0.06, 0.3, K.bronze, MT.brass));
      wf(b, TR(0, 0.36, 0.28), () => {
        cyl(b, 12, 0.11, 0.14, 0.42, mixc(K.cream, K.butter, 0.2), MT.glow, 0);
        wf(b, TR(0, 0.42, 0), () => cyl(b, 12, 0.14, 0.06, 0.08, K.bronze, MT.brass, 0));
      });
    }, sc[3] < 0 ? -Math.PI / 2 : Math.PI / 2);
  }
  P.items++;                                        // 94 墙面玻璃壁灯五盏

}

// ================================================================ 10 房间中段：玻璃板架 / 切割台 / 大树 / 木栈道
function buildCenter(b, P, rng) {
  // ── 木栈道（门 → 窗，把两端的动线连起来）
  wf(b, TR(0.6, 0.055, 13.9), () => box(b, 2.5, 0.11, 13.4, mixc(K.wood, K.woodPale, 0.35), MT.wood,
    { topCol: mixc(K.wood, K.woodPale, 0.5), bottomCol: mulc(K.wood, 0.8) }));
  for (let i = 0; i < 11; i++) {
    wf(b, TR(0.6, 0.112, 7.6 + i * 1.22), () => box(b, 2.42, 0.012, 0.06, mulc(K.wood, 0.82), MT.wood));
  }
  P.items++;                                        // 94 连接门与窗的木栈道

  // ── 玻璃板架（A 字木架 + 五张染色玻璃板）
  put(b, -12.8, 0, 8.8, () => {
    for (const sz of [-1, 1]) {
      wf(b, TR(0, 0.06, sz * 0.62), () => box(b, 3.3, 0.12, 0.14, K.woodMid, MT.wood));
      for (const sx of [-1, 1]) {
        bar3(b, [sx * 1.55, 0.06, sz * 0.62], [sx * 1.5, 2.45, sz * 0.28], 0.1, 0.1, K.woodMid, MT.wood);
      }
    }
    wf(b, TR(0, 2.42, 0.28), () => box(b, 3.1, 0.1, 0.12, K.woodDark, MT.wood));
    const tints = [K.glassCyan, K.aquaGlow, K.glassPale, K.blush, K.mint];
    for (let i = 0; i < 5; i++) {
      const z = 0.34 - i * 0.16;
      wf(b, m4.mul(TR(0, 1.28, z), m4.rotX(0.16 + i * 0.012)), () => {
        box(b, 2.85, 2.3, 0.045, mixc(tints[i], K.snow, 0.25), [0.24, 0.9],
          { topCol: mulc(mixc(tints[i], K.snow, 0.3), 1.1) });
      });
      wf(b, TR(0.0, 2.44, z), () => box(b, 2.9, 0.05, 0.06, K.brass, MT.brass));
    }
    // 立在地面前的一张待裁玻璃
    wf(b, m4.mul(TR(0.1, 0.62, -0.75), m4.rotX(-0.22)), () => {
      box(b, 2.2, 1.24, 0.04, mixc(K.glassPale, K.glassCyan, 0.5), [0.22, 0.9]);
    });
  }, 0.3);
  P.items++;                                        // 95 玻璃板架与五张染色玻璃

  // ── 玻璃切割台
  put(b, -8.8, 0, 14.6, () => {
    wf(b, TR(0, 0.9, 0), () => box(b, 3.0, 0.12, 1.5, K.woodPale, MT.woodHi,
      { topCol: mulc(K.woodPale, 1.05) }));
    wf(b, TR(0, 0.78, 0), () => box(b, 2.8, 0.12, 1.3, K.wood, MT.wood));
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        wf(b, TR(sx * 1.35, 0.38, sz * 0.6), () => box(b, 0.1, 0.78, 0.1, K.steelDark, MT.metal));
      }
    }
    wf(b, TR(0, 0.28, 0), () => box(b, 2.7, 0.06, 1.2, K.wood, MT.wood));
    // 台面：待裁的玻璃 + 黄铜直尺 + 玻璃刀
    wf(b, m4.mul(TR(-0.2, 0.97, 0), m4.rotY(0.06)), () => {
      box(b, 1.9, 0.03, 1.05, mixc(K.glassPale, K.glassCyan, 0.45), [0.2, 0.92]);
    });
    wf(b, TR(-0.2, 1.0, 0.42), () => box(b, 2.0, 0.035, 0.07, K.brassHi, MT.brass));
    wf(b, TR(0.5, 1.0, -0.3), () => box(b, 0.22, 0.04, 0.05, K.butter, MT.paint));
    // 水盆
    wf(b, TR(1.0, 0.96, -0.45), () => {
      cyl(b, 14, 0.2, 0.22, 0.14, K.steel, MT.metal, 0);
      wf(b, TR(0, 0.11, 0), () => cyl(b, 12, 0.16, 0.16, 0.02, mixc(K.glassCyan, K.snow, 0.3), [0.3, 0.9], 0));
    });
    // 手套 + 护目镜 + 小玻璃砖
    for (const s2 of [-1, 1]) {
      wf(b, TR(-1.1 + s2 * 0.14, 0.97, -0.42), () => box(b, 0.16, 0.04, 0.3, K.cream, MT.cloth));
    }
    wf(b, TR(1.24, 1.02, 0.35), () => {
      cyl(b, 12, 0.13, 0.13, 0.08, K.steelDark, MT.metal, 0);
      wf(b, TR(0, 0.05, -0.14), () => box(b, 0.24, 0.05, 0.1, mixc(K.aquaGlow, K.snow, 0.4), [0.3, 0.7]));
    });
    const tiles = [K.aquaGlow, K.blush, K.butter, K.mint];
    for (let i = 0; i < 4; i++) {
      wf(b, TR(-1.0 + i * 0.2, 0.99, 0.55), () => box(b, 0.18, 0.05, 0.18,
        mixc(tiles[i], K.snow, 0.3), [0.28, 0.85]));
    }
    // 台下收纳
    wf(b, TR(-0.9, 0.16, 0), () => box(b, 0.7, 0.3, 0.8, K.clayLt, MT.paper));
  }, -0.12);
  P.items++;                                        // 96 玻璃切割台

  // ── 切割台上方的宽罩吊灯
  put(b, -8.8, 8.1, 14.6, () => {
    const cord = 17.4 - 8.1 - 0.3;
    wf(b, TR(0, 0.3 + cord / 2, 0), () => cyl(b, 5, 0.022, 0.022, cord, K.charcoal, MT.metal, -cord / 2));
    cyl(b, 18, 0.62, 0.2, 0.22, K.cream, MT.glow, 0);
    wf(b, TR(0, 0.02, 0), () => torus(b, 0.58, 0.04, 18, 5, K.brass, MT.brass, 'y'));
    wf(b, TR(0, -0.1, 0), () => sphere(b, 0.18, K.cream, [0.93, 0.2], { rings: 5, seg: 8, jitter: 0 }));
  });
  P.items++;                                        // 97 宽罩工作吊灯

  // ── 玻璃房大树（把中段的竖向量填起来）
  put(b, 7.6, 0, 9.0, () => {
    cyl(b, 16, 0.52, 0.62, 0.72, K.ceramic, MT.ceramic, 0);
    cyl(b, 16, 0.64, 0.64, 0.09, K.ceramic, MT.ceramic, 0.65);
    wf(b, TR(0, 0.7, 0), () => disc(b, 0.56, 14, K.soil, MT.leaf));
    // 主干与分枝
    bar3(b, [0, 0.68, 0], [0.16, 1.8, 0.1], 0.2, 0.2, K.woodDark, MT.wood);
    bar3(b, [0.16, 1.8, 0.1], [-0.1, 2.7, -0.12], 0.15, 0.15, K.woodDark, MT.wood);
    const tips = [[-0.7, 3.1, 0.2], [0.6, 3.3, -0.1], [0.1, 3.5, 0.6], [-0.3, 3.0, -0.6]];
    for (const t of tips) {
      bar3(b, [-0.1, 2.65, -0.12], t, 0.08, 0.08, K.woodDark, MT.wood);
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU + rng();
        put(b, t[0], t[1] + (rng() - 0.5) * 0.2, t[2], () => {
          leafShape(b, 0.34 + rng() * 0.16, 0.15, mixc(K.leafLt, K.mint, rng() * 0.55), MT.leaf, 0.32);
        }, a, 1.1 + rng() * 0.6, (rng() - 0.5) * 1.2);
      }
    }
    // 树上挂着两只玻璃灯球
    for (const g of [[-0.62, 2.9, 0.18], [0.52, 3.05, -0.08]]) {
      wf(b, TR(g[0], g[1], g[2]), () => {
        sphere(b, 0.15, mixc(K.aquaGlow, K.snow, 0.3), MT.glow, { rings: 5, seg: 8, jitter: 0.04 });
        wf(b, TR(0, 0.2, 0), () => cyl(b, 5, 0.012, 0.012, 0.3, K.charcoal, MT.metal, 0));
      });
    }
  });
  P.items++;                                        // 98 玻璃房大树

  // ── 栈道旁的长凳与垫子
  put(b, 4.4, 0, 12.2, () => {
    wf(b, TR(0, 0.45, 0), () => box(b, 3.0, 0.1, 0.55, K.woodPale, MT.woodHi,
      { topCol: mulc(K.woodPale, 1.06) }));
    for (const sx of [-1, 1]) {
      wf(b, TR(sx * 1.3, 0.22, 0), () => box(b, 0.1, 0.44, 0.5, K.woodMid, MT.wood));
    }
    wf(b, TR(0, 0.28, 0), () => box(b, 2.7, 0.05, 0.4, K.woodMid, MT.wood));
    for (const c of [[-0.8, K.blush], [0.35, K.mint]]) {
      wf(b, TR(c[0], 0.56, 0), () => box(b, 0.62, 0.12, 0.45, mixc(c[1], K.cream, 0.35), MT.cloth,
        { topCol: mixc(c[1], K.cream, 0.55) }));
    }
    wf(b, TR(1.0, 0.55, 0), () => box(b, 0.5, 0.04, 0.36, K.cream, MT.fabric));
  }, -0.3);
  P.items++;                                        // 99 栈道长凳与垫子

  // ── 地面上成组的玻璃砖与边角料
  for (let i = 0; i < 5; i++) {
    const x = -9.6 + rng() * 1.4, z = 13.4 + rng() * 1.6;
    wf(b, m4.mul(TR(x, 0.06 + i * 0.045, z), m4.rotY(rng() * TAU)), () => {
      box(b, 0.42, 0.035, 0.42, mixc([K.glassCyan, K.aquaGlow, K.blush, K.mint, K.glassPale][i], K.snow, 0.3),
        [0.24, 0.88]);
    });
  }

  P.items++;                                        // 100 地面玻璃砖与边角料

  // ── 中段共作长桌（把大片空地填起来：长桌 + 圆凳 + 地毯 + 桌面器皿）
  put(b, -5.6, 0, 10.4, () => {
    // 地毯
    wf(b, TR(0, 0.105, 0), () => box(b, 7.4, 0.03, 3.8, K.rugBlue, MT.cloth,
      { topCol: mixc(K.rugBlue, K.ice, 0.2) }));
    wf(b, TR(0, 0.115, 0), () => box(b, 6.6, 0.012, 3.0, mixc(K.rugBlue, K.cream, 0.45), MT.cloth));
    // 桌面
    wf(b, TR(0, 0.89, 0), () => box(b, 6.0, 0.12, 1.9, mixc(K.wood, K.woodPale, 0.5), MT.woodHi,
      { topCol: mixc(K.wood, K.woodPale, 0.66) }));
    wf(b, TR(0, 0.77, 0), () => box(b, 5.7, 0.12, 1.62, K.wood, MT.wood));
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        wf(b, TR(sx * 2.7, 0.42, sz * 0.68), () => box(b, 0.12, 0.84, 0.12, K.woodMid, MT.wood));
      }
    }
    wf(b, TR(0, 0.3, 0), () => box(b, 5.4, 0.06, 1.4, K.wood, MT.wood));
    // 桌面：两座玻璃钟罩（里面各一株小植物）
    for (const gx of [-1.7, 1.5]) {
      wf(b, TR(gx, 0.95, 0), () => {
        disc(b, 0.26, 14, K.brass, MT.brass, { y: 0.01 });
        wf(b, TR(0, 0.03, 0), () => pottedPlant(b, 0, 0, 0.32, rng, { potCol: K.cream, leaves: 5, leafLen: 0.26, tilt: 0.3 }));
        wf(b, TR(0, 0.2, 0), () => ellipsoid(b, 0.24, 0.42, 0.24, 10, 4,
          mixc(K.glassPale, K.snow, 0.3), MT.glass, { v0: 0.5, v1: 1.0 }));
        wf(b, TR(0, 0.62, 0), () => sphere(b, 0.045, K.brass, MT.brass, { rings: 4, seg: 6, jitter: 0 }));
      });
    }
    // 桌面：咖啡壶 + 两只杯 + 摊开的册子 + 卷起的图纸
    wf(b, TR(-0.3, 0.95, 0.42), () => {
      lathe(b, [[0.005, 0], [0.14, 0.02], [0.16, 0.12], [0.11, 0.24], [0.05, 0.28], [0.02, 0.29]], 14,
        mixc(K.ice, K.snow, 0.35), MT.ceramic);
      wf(b, TR(0.16, 0.15, 0), () => torus(b, 0.07, 0.02, 10, 4, K.ice, MT.ceramic, 'z'));
      wf(b, TR(0, 0.3, 0), () => sphere(b, 0.03, K.brass, MT.brass, { rings: 4, seg: 6, jitter: 0 }));
    });
    for (const cx of [0.35, 0.62]) {
      wf(b, TR(cx, 0.95, 0.36), () => {
        cyl(b, 10, 0.075, 0.085, 0.1, K.cream, MT.ceramic, 0);
        disc(b, 0.1, 10, K.cream, MT.ceramic, { y: 0.005 });
        cyl(b, 10, 0.065, 0.065, 0.012, mixc(K.clayLt, K.woodMid, 0.5), MT.ceramic, 0.075);
      });
    }
    bookStack(b, -2.9, 0.95, 0.4, rng, 3, 0.4, 0.3);
    wf(b, TR(2.6, 1.02, 0.4), () => cyl(b, 8, 0.06, 0.06, 0.9, K.ice, MT.paper), 0, 0, Math.PI / 2);
    wf(b, m4.mul(TR(0.6, 0.96, -0.5), m4.rotY(0.24)), () => {
      box(b, 0.62, 0.03, 0.44, K.paper, MT.paper, { topCol: K.snow });
      b.quad([-0.25, 0.02, -0.16], [0.25, 0.02, -0.16], [0.25, 0.02, 0.16], [-0.25, 0.02, 0.16],
        mixc(K.screen, K.snow, 0.6), [0.2, 0.2], [0, 1, 0]);
    });
    // 桌面：小台灯
    wf(b, TR(2.2, 0.95, -0.55), () => {
      cyl(b, 10, 0.1, 0.12, 0.05, K.steel, MT.metal, 0);
      cyl(b, 6, 0.02, 0.02, 0.5, K.steel, MT.metal, 0);
      wf(b, TR(0, 0.5, 0), () => {
        cyl(b, 10, 0.16, 0.05, 0.16, K.cream, MT.glow, 0);
        wf(b, TR(0, -0.02, 0), () => sphere(b, 0.055, K.cream, [0.9, 0.2], { rings: 4, seg: 7, jitter: 0 }));
      });
    });
    // 四张圆凳
    for (const sx of [-1.7, 1.7]) {
      for (const sz of [-1.35, 1.35]) {
        wf(b, TR(sx + sx * 0.05, 0, sz), () => {
          cyl(b, 9, 0.24, 0.26, 0.08, mixc(K.cream, K.ice, 0.3), MT.fabric, 0.52);
          wf(b, TR(0, 0.5, 0), () => cyl(b, 8, 0.22, 0.22, 0.04, K.woodMid, MT.wood, 0));
          for (let i = 0; i < 4; i++) {
            const a = (i / 4) * TAU + 0.78;
            bar3(b, [Math.cos(a) * 0.15, 0.52, Math.sin(a) * 0.15],
              [Math.cos(a) * 0.27, 0.02, Math.sin(a) * 0.27], 0.035, 0.035, K.woodMid, MT.wood);
          }
        });
      }
    }
  }, 0.16);
  P.items++;                                        // 101 中段共作长桌与四张圆凳
  P.items++;                                        // 102 桌面钟罩/茶具/画册/小台灯

  // ── 长桌上方三盏小圆灯（把中段的高度也点亮）
  for (const lx of [-7.6, -5.6, -3.6]) {
    const rad = 0.36, capY = 7.4 + rad * 0.92, cordLen = 17.4 - capY;
    wf(b, TR(lx, capY + cordLen / 2, 10.4), () => cyl(b, 4, 0.02, 0.02, cordLen, K.charcoal, MT.metal, -cordLen / 2));
    wf(b, TR(lx, capY, 10.4), () => cyl(b, 8, rad * 0.22, rad * 0.32, rad * 0.4, K.brass, MT.brass, 0));
    put(b, lx, 7.4, 10.4, () => sphere(b, rad, mixc(K.glassPale, K.aquaGlow, 0.45), MT.lamp,
      { rings: 6, seg: 9, jitter: 0.02 }));
  }
  P.items++;                                        // 103 长桌上方的三盏小圆灯

  // ── 纸箱堆与胶带（左后角，工作坊的杂物感）
  put(b, -16.7, 0, 7.4, () => {
    box(b, 1.2, 0.8, 1.0, K.clayLt, MT.paper, { topCol: mulc(K.clayLt, 1.06) });
    wf(b, TR(0.05, 0.42, 0.1), () => box(b, 0.85, 0.62, 0.7, K.paper, MT.paper));
    wf(b, TR(-0.1, 0.68, -0.15), () => box(b, 0.55, 0.34, 0.5, mulc(K.clayLt, 0.94), MT.paper));
    wf(b, TR(0.45, 0.4, 0.3), () => torus(b, 0.09, 0.035, 12, 4, K.ice, MT.paper, 'z'));
    wf(b, TR(0, 0.85, 0), () => box(b, 1.22, 0.03, 0.1, K.woodMid, MT.paper));
  }, 0.2);
  P.items++;                                        // 104 纸箱堆与胶带

  // ── 高盆栽（门左侧，进门就能看到）
  pottedPlant(b, -16.3, 1.9, 1.7, rng, { potCol: K.ceramic, leaves: 16, leafLen: 0.46, tilt: 0.22, leafCol: mixc(K.leaf, K.leafLt, 0.5) });
  P.items++;                                        // 105 门旁高盆栽
}

// ================================================================ 11 灯光与光斑（世界坐标！）
function buildLights(b, ctx) {
  const P = (x, y, z) => roomToWorld(R.cx, [x, y, z]);
  // 主灯：工作台与房间中前部（暖金）
  ctx.points.push({ p: P(0.0, 12.6, 18.5), col: mulc(C.warmGlow, 1.18), range: 42, int: 2.35 });
  // 窗侧补光：巨行星的冷暖混合光从 30 m 拱窗打进来
  ctx.points.push({ p: P(0.0, 9.4, 24.4), col: mulc(mixc(C.planetAtm, C.sun, 0.42), 1.05), range: 26, int: 1.5 });
  // 桌面工作灯（暖，小范围）
  ctx.points.push({ p: P(8.4, 2.6, 23.1), col: mulc(C.warmGlow, 1.05), range: 13, int: 1.6 });
  // 沙发角
  ctx.points.push({ p: P(-13.4, 4.4, 20.9), col: mulc(C.warmGlow, 1.0), range: 20, int: 1.55 });
  // 门口迎宾灯（从桥上透进来是亮的）
  ctx.points.push({ p: P(0.0, 10.4, 5.6), col: mulc(C.warmGlow, 1.1), range: 28, int: 1.85 });
  // 玻璃熔炉的炉火（琥珀/橙）
  ctx.points.push({ p: P(16.4, 1.6, 15.0), col: mulc(C.ember, 1.0), range: 15, int: 1.55 });

  // 静态光斑（吊灯罩外叠一层）
  ctx.lanterns.push({ p: P(-8.4, 12.0, 19.8), size: 1.66, rot: 0, alpha: 0.34, shape: 1, col: mulc(C.warmGlow, 1.1) });
  ctx.lanterns.push({ p: P(-2.6, 11.2, 21.2), size: 1.37, rot: 0, alpha: 0.31, shape: 1, col: mulc(C.warmGlow, 1.05) });
  ctx.lanterns.push({ p: P(3.4, 12.5, 19.9), size: 1.80, rot: 0, alpha: 0.35, shape: 1, col: mulc(C.warmGlow, 1.12) });
  ctx.lanterns.push({ p: P(9.2, 11.6, 21.3), size: 1.44, rot: 0, alpha: 0.31, shape: 1, col: mulc(C.warmGlow, 1.05) });
  ctx.lanterns.push({ p: P(0.6, 12.4, 13.0), size: 1.58, rot: 0, alpha: 0.32, shape: 1, col: mulc(C.warmGlow, 1.1) });
  ctx.lanterns.push({ p: P(7.8, 12.2, 6.3), size: 2.02, rot: 0, alpha: 0.28, shape: 1, col: mulc(C.warmGlow, 1.0) });
  ctx.lanterns.push({ p: P(-1.0, 8.4, 21.0), size: 2.6, rot: 0, alpha: 0.26, shape: 0, col: mulc(C.warmGlow, 1.0) });
  ctx.lanterns.push({ p: P(0.0, 11.6, 25.0), size: 2.8, rot: 0, alpha: 0.25, shape: 0,
    col: mulc(mixc(C.planetAtm, C.sun, 0.5), 1.0) });
  ctx.lanterns.push({ p: P(16.2, 2.8, 15.0), size: 1.58, rot: 0, alpha: 0.35, shape: 1, col: mulc(C.ember, 1.0) });
  ctx.lanterns.push({ p: P(-13.4, 4.2, 20.9), size: 1.80, rot: 0, alpha: 0.36, shape: 1, col: mulc(C.warmGlow, 1.0) });
  ctx.lanterns.push({ p: P(-7.9, 7.1, 0.6), size: 1.00, rot: 0, alpha: 0.36, shape: 1, col: mulc(C.warmGlow, 1.05) });
  ctx.lanterns.push({ p: P(7.9, 7.1, 0.6), size: 1.00, rot: 0, alpha: 0.36, shape: 1, col: mulc(C.warmGlow, 1.05) });
}

// ================================================================ 世界摆放入口
export function buildAtelierAssets(b, ctx) {
  const P = { items: 0 };
  const rng = mulberry32(R.seed);       // 每次构建都新建：保证逐 float 可复现
  const t0 = b.i.length / 3;

  // ---- 壳（墙/门洞/大窗/地台/顶板/线脚）
  buildRoomShell(b, ctx, R, {
    wallIn: K.ice, wallInMat: [0.05, 0.22],
    wallOut: C.ivory, wallOutMat: [0.02, 0.34],
    floor: mixc(K.stone, K.ice, 0.3), floorTop: mulc(K.stone, 1.04), floorMat: [0.03, 0.26],
    ceil: rgb('#d3e2ec'), ceilMat: [0.05, 0.10],
    trim: K.bronze, trimMat: [0.045, 0.8],
    skirting: mixc(K.ice, C.brassDark, 0.28), skirtingMat: [0.035, 0.3],
    revCol: mixc(K.ice, C.brassDark, 0.1),
    pilasterCol: mulc(K.ice, 0.9), pilasterMat: [0.035, 0.22],
    beamCol: rgb('#bb9668'), beamMat: [0.04, 0.36],
    mullions: 4, transomY: 9.4,
    mullionCol: rgb('#cbdae5'), mullionMat: [0.042, 0.7],
    sillCol: rgb('#bccbd6'), sillMat: [0.03, 0.42],
  });

  buildFloor(b, P, rng);
  buildOrrery(b, P, rng);
  buildWorkTable(b, P, rng);
  buildWindowZone(b, P, rng);
  buildLounge(b, P, rng);
  buildLeftWall(b, P, rng);
  buildRightWall(b, P, rng);
  buildDoorWall(b, P, rng);
  buildCeiling(b, P, rng);
  buildWalls(b, P, rng);
  buildCenter(b, P, rng);
  buildLights(b, ctx);

  // 交接给体检 / 集成：可读陈设组数 + 本模块三角数
  ctx.props.roomAtelier = { items: P.items, tris: b.i.length / 3 - t0 };
}

// 世界摆放（world.js 调这个）
export function buildAtelierRoom(b, ctx) {
  b.push(roomFrame(R.cx));
  buildAtelierAssets(b, ctx);
  b.pop();
}
