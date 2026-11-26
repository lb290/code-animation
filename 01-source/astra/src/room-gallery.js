// room-gallery.js — 悬灯画廊的"房子"本身：廊桥、吊索、四间房之间的立面、屋顶、
// 中央塔、名牌、廊灯。四间房的室内由 room-<key>.js 各自建。
//
// 全部建在画廊局部坐标系（G 系，y=0 就是世界 y = GAL.y = -86）：
//   x = 沿桥（切向），y = 上，z = 径向外（朝巨行星，房间门墙在 z=GAL.bridgeZ1=8）
//   y = 49 ⇔ 世界 -37 = 环带底面（吊索的锚固高度）
import { box, cylinder, sphere, lathe, bar3, railing, roofGable, tubePath, m4, mulc, mixc, rgb, TAU } from './engine.js';
import { C } from './palette.js';
import { GAL, ROOMS, gpt } from './interiors-plan.js';

const GY = (y) => y; // 局部 y
const DECK_Y = 0;
const RING_BOTTOM = 49;     // 局部 y：环带底面
const ROOF_Y = GAL.roomH + 1.0;

export function galleryLights(ctx) {
  const add = (p, col, range, int) => ctx.points.push({ p, col, range, int });
  const W = (x, y, z) => gpt(x, y, z);
  for (const R of ROOMS) add(W(R.cx, 7.5, 8.5), mulc(C.warmGlow, 1.05), 30, 1.45);
  add(W(-52, 5.5, -3), mulc(C.warmGlow, 1.0), 30, 1.1);
  add(W(52, 5.5, -3), mulc(C.warmGlow, 1.0), 30, 1.1);
  add(W(0, 15, 20), mulc(C.amber, 1.0), 42, 1.2);
}

export function galleryLanterns(ctx) {
  const W = (x, y, z) => gpt(x, y, z);
  const L = (p, size, col, alpha, shape = 1) => ctx.lanterns.push({ p, size, rot: 0, alpha, shape, col });
  for (let i = -6; i <= 6; i++) L(W(i * 16, 4.6, -8.4), 3.4, mulc(C.warmGlow, 1.05), 0.5);
  for (const R of ROOMS) {
    L(W(R.cx, GAL.roomH - 1.0, 8.8), 2.6, mulc(C.warmGlow, 1.1), 0.55);
    L(W(R.cx, ROOF_Y + 4.0, 21), 5.0, mulc(C.amber, 1.0), 0.35);
  }
  L(W(0, RING_BOTTOM - 4.0, 20), 9.0, mulc(C.warmGlow, 1.1), 0.45);
  L(W(0, 8.0, 34.5), 4.0, mulc(C.cyanGlow, 0.9), 0.3);
}

export function buildGalleryShell(b, ctx) {
  const { bridgeHalfX, bridgeZ0, bridgeZ1, railH, roomH } = GAL;
  const deckLen = bridgeHalfX * 2;
  const deckZ = (bridgeZ0 + bridgeZ1) / 2;
  const deckD = bridgeZ1 - bridgeZ0;
  const brass = C.brass, brassHi = C.brassHi, brassDark = C.brassDark;
  const M = {
    hull: [0.02, 0.34], brass: [0.07, 0.85], brassD: [0.05, 0.6], deck: [0.03, 0.24],
    glow: [0.85, 0.2], beam: [0.02, 0.3],
  };
  const at = (x, y, z) => b.push(m4.translate([x, y, z]));

  // ---- 桥面 + 桥底桁架 ------------------------------------------------
  at(0, DECK_Y - 0.7, deckZ);
  box(b, deckLen, 1.4, deckD, mulc(C.ivoryShade, 0.9), [0.04, 0.24], { topCol: mulc(C.ivoryDark, 1.05), bottomCol: mulc(C.panelDark, 0.85) });
  b.pop();
  // 桥底两侧发光边（远看是一条悬在环带下的灯廊）
  for (const z of [bridgeZ0 + 0.25, bridgeZ1 - 0.25]) {
    at(0, DECK_Y - 1.32, z);
    box(b, deckLen - 2.0, 0.22, 0.3, mulc(C.warmGlow, 1.2), M.glow);
    b.pop();
  }
  // 黄铜分格线
  for (let i = -12; i <= 12; i++) {
    at(i * 8, DECK_Y + 0.02, deckZ);
    box(b, 0.34, 0.08, deckD - 0.6, brassDark, M.brassD);
    b.pop();
  }
  at(0, DECK_Y + 0.02, bridgeZ0 + 0.55);
  box(b, deckLen, 0.07, 0.5, brass, M.brass);
  b.pop();
  at(0, DECK_Y + 0.02, bridgeZ1 - 0.55);
  box(b, deckLen, 0.07, 0.5, brass, M.brass);
  b.pop();
  // 纵向主梁 + 横向肋
  for (const z of [-6.0, 0.0, 6.0]) {
    at(0, -1.9, z);
    box(b, deckLen - 2.0, 0.9, 0.9, brassDark, M.brassD);
    b.pop();
  }
  for (let i = -12; i <= 12; i++) {
    at(i * 8, -1.9, deckZ);
    box(b, 0.8, 0.85, deckD, brassDark, M.brassD);
    b.pop();
  }
  at(0, -3.1, deckZ);
  box(b, deckLen - 8, 1.5, 2.2, mulc(C.ivoryShade, 0.8), M.hull, { bottomCol: mulc(C.panelDark, 0.9) });
  b.pop();
  // 桥底检修灯笼
  for (let i = -3; i <= 3; i++) {
    at(i * 30, -3.9, deckZ);
    sphere(b, 0.7, mulc(C.warmGlow, 1.2), M.glow, { rings: 3, seg: 6, jitter: 0 });
    b.pop();
  }

  // ---- 桥栏（内沿朝站心；两端封口）------------------------------------
  at(0, DECK_Y, bridgeZ0 + 0.35);
  railing(b, deckLen, railH, brass, M.brass, { n: 40 });
  b.pop();
  for (const s of [-1, 1]) {
    b.push(m4.mul(m4.translate([s * (bridgeHalfX - 0.35), DECK_Y, deckZ]), m4.rotY(Math.PI / 2)));
    railing(b, deckD - 0.7, railH, brass, M.brass, { n: 6 });
    b.pop();
  }
  // 栏杆灯柱 + 灯头
  for (let i = -6; i <= 6; i++) {
    const x = i * 16;
    at(x, DECK_Y, bridgeZ0 + 0.55);
    cylinder(b, 8, 0.32, 0.24, railH + 1.9, brass, M.brass, { y0: 0, caps: false });
    b.pop();
    at(x, DECK_Y + railH + 2.1, bridgeZ0 + 0.55);
    sphere(b, 0.85, mulc(C.warmGlow, 1.25), M.glow, { rings: 3, seg: 8, jitter: 0 });
    b.pop();
    at(x, DECK_Y + railH + 2.9, bridgeZ0 + 0.55);
    lathe(b, [[1.0, 0], [0.7, 0.5], [0.2, 1.1]], 8, brassHi, M.brass, { smooth: false });
    b.pop();
  }

  // ---- 吊索：7 根主索吊到环带底面 + 房间外侧斜拉 ----------------------
  for (let i = -3; i <= 3; i++) {
    const x = i * 30;
    at(x, DECK_Y, 0.6);
    cylinder(b, 8, 0.55, 0.46, RING_BOTTOM, brass, M.brass, { y0: 0, caps: false });
    b.pop();
    at(x, DECK_Y + 0.2, 0.6);
    cylinder(b, 10, 1.25, 1.0, 0.8, brassDark, M.brassD, { y0: 0, caps: true });
    b.pop();
    at(x, RING_BOTTOM - 1.0, 0.6);
    cylinder(b, 10, 1.5, 1.9, 1.1, brassDark, M.brassD, { y0: 0, caps: true });
    b.pop();
    // 斜撑（把桥面两侧吊在索脚上）
    for (const z of [-6.5, 7.5]) {
      bar3(b, [x, 0.1, z], [x, 7.2, 0.6], 0.22, 0.22, brassDark, M.brassD);
    }
  }
  // 外侧斜拉索：从屋顶外沿拉回环带下沿
  for (const cx of [-96, -64, -32, 0, 32, 64, 96]) {
    tubePath(b, [[cx, ROOF_Y + 0.4, 34.6], [cx, ROOF_Y + 9.0, 30.0], [cx, RING_BOTTOM - 2.0, 11.5]], 0.24, 5, brassDark, M.brassD, { caps: false });
  }

  // ---- 每间房：屋顶 + 屋脊灯笼 + 名牌 --------------------------------
  for (const R of ROOMS) {
    const cx = R.cx;
    // 出挑檐口
    at(cx, ROOF_Y - 0.1, GAL.bridgeZ1 + GAL.roomD / 2);
    box(b, GAL.roomW + 5.0, 0.7, GAL.roomD + 6.0, brassDark, M.brassD, { topCol: brass });
    b.pop();
    // 坡屋顶（沿桥向为脊）
    at(cx, ROOF_Y + 0.25, GAL.bridgeZ1 + GAL.roomD / 2);
    roofGable(b, GAL.roomW + 1.0, GAL.roomD + 2.0, 3.6, mulc(C.brassDark, 0.92), [0.16, 0.36], { tiles: 0, rafters: 0, rows: 4, cols: 4, over: 1.4, sideOver: 0.8 });
    b.pop();
    // 灯笼顶：两坡各铺 5 块暖光"纸窗"，外面由黄铜脊/檐压住（不另立肋，免得在天空里竖黑条）
    for (const side of [-1, 1]) {
      b.push(m4.mul(m4.translate([cx, ROOF_Y + 0.3, GAL.bridgeZ1 + GAL.roomD / 2]), m4.rotX(side * 0.14)));
      for (let k = -2; k <= 2; k++) {
        at(k * 8.0, 0.55, side * 5.2);
        box(b, 6.6, 0.12, 9.0, mulc(C.warmGlow, 1.12), [0.5, 0.2]);
        b.pop();
      }
      b.pop();
    }
    // 屋脊发光条
    at(cx, ROOF_Y + 3.95, GAL.bridgeZ1 + GAL.roomD / 2);
    box(b, GAL.roomW + 1.2, 0.2, 0.45, mulc(C.warmGlow, 1.3), M.glow);
    b.pop();
    // 檐下暖光带（从外面看像灯笼的灯口）
    at(cx, ROOF_Y - 0.55, GAL.bridgeZ1 + GAL.roomD + 1.2);
    box(b, GAL.roomW + 1.8, 0.34, 0.42, mulc(C.warmGlow, 1.25), M.glow);
    b.pop();
    at(cx, ROOF_Y - 0.55, GAL.bridgeZ1 - 1.1);
    box(b, GAL.roomW + 1.8, 0.34, 0.42, mulc(C.warmGlow, 1.25), M.glow);
    b.pop();
    // 屋脊灯亭 + 尖顶
    at(cx, ROOF_Y + 3.9, GAL.bridgeZ1 + GAL.roomD / 2);
    box(b, 2.4, 1.6, 2.4, brass, M.brass, { topCol: brassHi });
    b.pop();
    at(cx, ROOF_Y + 5.1, GAL.bridgeZ1 + GAL.roomD / 2);
    sphere(b, 1.0, mulc(C.warmGlow, 1.3), M.glow, { rings: 3, seg: 8, jitter: 0 });
    b.pop();
    at(cx, ROOF_Y + 6.3, GAL.bridgeZ1 + GAL.roomD / 2);
    lathe(b, [[0.55, 0], [0.28, 1.1], [0.06, 2.0]], 8, brassHi, M.brass, { smooth: false });
    b.pop();
    // 门楣名牌（桥侧）
    at(cx, 16.3, GAL.bridgeZ1 - GAL.wallT - 0.18);
    box(b, 12.0, 2.3, 0.3, mulc(C.ivory, 0.92), M.hull, { topCol: brassHi });
    b.pop();
    at(cx, 15.0, GAL.bridgeZ1 - GAL.wallT - 0.25);
    box(b, 10.4, 0.3, 0.16, mulc(C.cyanGlow, 1.2), M.glow);
    b.pop();
    // 门口两级台阶（从桥面到房间地面，找平 0）
    at(cx, -0.1, GAL.bridgeZ1 + 0.9);
    box(b, 14.2, 0.24, 1.6, brassDark, M.brassD);
    b.pop();
  }

  // ---- 房间之间的立面（三处凹进的"灯笼窗"）--------------------------
  for (const gx of [-56, 0, 56]) {
    const gapW = 16;
    at(gx, 9.5, 30.4);
    box(b, gapW, 19, 1.8, mulc(C.ivoryShade, 0.86), M.hull, { topCol: C.ivory, bottomCol: mulc(C.panelDark, 0.9) });
    b.pop();
    // 三条发光竖窗
    for (let k = -1; k <= 1; k++) {
      at(gx + k * 4.2, 9.2, 29.4);
      box(b, 2.2, 12.5, 0.35, mulc(k === 0 ? C.cyanGlow : C.warmGlow, 1.15), M.glow);
      b.pop();
      at(gx + k * 4.2, 9.2, 29.2);
      box(b, 2.8, 13.1, 0.16, brassDark, M.brassD);
      b.pop();
    }
    // 檐口 + 勒脚
    at(gx, 19.4, 30.4);
    box(b, gapW + 2.0, 0.8, 2.4, brass, M.brass, { topCol: brassHi });
    b.pop();
    at(gx, -0.4, 30.4);
    box(b, gapW + 2.0, 1.2, 2.2, mulc(C.ivoryShade, 0.8), M.hull);
    b.pop();
  }

  // ---- 中央塔：从桥面直抵环带底面，把画廊"挂"在环上 -------------------
  const tw = 7.0, tz0 = 12.0, tz1 = 27.0, tzc = (tz0 + tz1) / 2;
  at(0, RING_BOTTOM / 2, tzc);
  box(b, tw * 2, RING_BOTTOM, tz1 - tz0, mulc(C.ivory, 1.02), M.hull, { topCol: C.ivory, bottomCol: mulc(C.panelDark, 0.9) });
  b.pop();
  // 塔身黄铜线脚 + 玻璃灯带
  for (let k = 0; k < 5; k++) {
    const y = 6 + k * 8.2;
    at(0, y, tzc);
    box(b, tw * 2 + 0.6, 0.7, tz1 - tz0 + 0.6, brass, M.brass, { topCol: brassHi });
    b.pop();
    at(0, y + 2.6, tz1 + 0.05);
    box(b, 1.4, 3.4, 0.2, mulc(C.warmGlow, 1.15), M.glow);
    b.pop();
    at(0, y + 2.6, tz0 - 0.05);
    box(b, 1.4, 3.4, 0.2, mulc(C.cyanGlow, 1.0), M.glow);
    b.pop();
  }
  // 塔顶灯室
  at(0, RING_BOTTOM - 6.0, tzc);
  box(b, tw * 2 + 2.4, 6.0, tz1 - tz0 + 2.4, brass, M.brass, { topCol: brassHi, bottomCol: brassDark });
  b.pop();
  at(0, RING_BOTTOM - 5.4, tz1 + 1.3);
  box(b, 6.0, 4.0, 0.3, mulc(C.warmGlow, 1.25), M.glow);
  b.pop();
  // 基座
  at(0, 1.4, tzc);
  box(b, tw * 2 + 3.0, 2.8, tz1 - tz0 + 3.0, mulc(C.ivoryShade, 0.9), M.hull, { topCol: C.ivoryDark });
  b.pop();

  // ---- 画廊底部吊灯（从桥底垂下的黄铜灯笼）---------------------------
  for (const x of [-80, -40, 40, 80]) {
    tubePath(b, [[x, -3.6, deckZ], [x, -6.4, deckZ]], 0.09, 4, brassDark, M.brassD, { caps: false });
    at(x, -7.4, deckZ);
    lathe(b, [[0.15, 0], [0.85, 0.35], [1.05, 1.3], [0.7, 2.3], [0.18, 2.7]], 10, mulc(C.warmGlow, 1.15), M.glow, { smooth: false });
    b.pop();
  }
}
