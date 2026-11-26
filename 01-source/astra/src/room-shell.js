// room-shell.js — 四间房共用的「外壳」：厚墙、真门洞、大窗洞、地台、顶板、线脚。
//
// 只建结构与外壳，不建陈设；陈设 / 灯光 / 光斑由各房间模块自己加（同一局部坐标系）：
//   局部坐标：x ∈ [-W/2, W/2]，y ∈ [0, H]，z ∈ [0, D]
//   z = 0 是房门墙（桥在 z<0 一侧），z = D 是大窗墙（朝外，正对巨行星）
// 墙厚 T：门墙实体 z ∈ [-T, 0]，窗墙实体 z ∈ [D, D+T]。
// 所有面都显式给法线（引擎不开背面剔除，显式法线才保证朝向正确）。
//
// 用法：buildRoomShell(b, ctx, R, S) 然后用下面的常量在局部坐标里摆陈设。
import { box, cylinder, m4, mulc, mixc, rgb, TAU } from './engine.js';
import { C } from './palette.js';

const ZP = [0, 0, 1], ZN = [0, 0, -1], XP = [1, 0, 0], XN = [-1, 0, 0], YP = [0, 1, 0];

function at(b, x, y, z) { b.push(m4.translate([x, y, z])); }
function rect(b, x0, x1, y0, y1, z, col, mat, N) {
  if (x1 - x0 < 1e-4 || y1 - y0 < 1e-4) return;
  b.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], col, mat, N);
}
function rectH(b, x0, x1, z0, z1, y, col, mat, N) {
  if (x1 - x0 < 1e-4 || z1 - z0 < 1e-4) return;
  b.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], col, mat, N);
}

// 带拱形洞口的墙：建在 XY 平面，内表面 z=0（法线 +Z），实体向 -Z 延伸 T。
export function archWall(b, W, H, T, o, F) {
  const cx = o.cx || 0, w = o.w, y0 = o.y0 || 0, spring = o.spring, rise = o.rise;
  const hw = w / 2, xl = cx - hw, xr = cx + hw;
  const archY = (x) => {
    const t = (x - cx) / hw;
    return spring + rise * Math.sqrt(Math.max(0, 1 - t * t));
  };
  const N = 20;
  const zIn = 0, zOut = -T;
  // 内表面（+Z）
  rect(b, -W / 2, xl, 0, H, zIn, F.inCol, F.inMat, ZP);
  rect(b, xr, W / 2, 0, H, zIn, F.inCol, F.inMat, ZP);
  if (y0 > 0.01) rect(b, xl, xr, 0, y0, zIn, F.inCol, F.inMat, ZP);
  for (let i = 0; i < N; i++) {
    const x0 = xl + (w * i) / N, x1 = xl + (w * (i + 1)) / N;
    const ya = Math.min(archY(x0), H - 1e-3), yb = Math.min(archY(x1), H - 1e-3);
    b.quad([x0, ya, zIn], [x1, yb, zIn], [x1, H, zIn], [x0, H, zIn], F.inCol, F.inMat, ZP);
  }
  // 外表面（-Z）
  const outCol = F.outCol, outMat = F.outMat;
  rect(b, -W / 2, xl, 0, H, zOut, outCol, outMat, ZN);
  rect(b, xr, W / 2, 0, H, zOut, outCol, outMat, ZN);
  if (y0 > 0.01) rect(b, xl, xr, 0, y0, zOut, outCol, outMat, ZN);
  for (let i = 0; i < N; i++) {
    const x0 = xl + (w * i) / N, x1 = xl + (w * (i + 1)) / N;
    const ya = Math.min(archY(x0), H - 1e-3), yb = Math.min(archY(x1), H - 1e-3);
    b.quad([x1, yb, zOut], [x0, ya, zOut], [x0, H, zOut], [x1, H, zOut], outCol, outMat, ZN);
  }
  // 洞口侧壁
  const revCol = F.revCol, revMat = F.revMat;
  for (const s of [-1, 1]) {
    const x = s < 0 ? xl : xr;
    b.quad([x, y0, zIn], [x, spring, zIn], [x, spring, zOut], [x, y0, zOut], revCol, revMat, s < 0 ? XP : XN);
  }
  if (y0 > 0.01) rectH(b, xl, xr, zOut, zIn, y0, mulc(revCol, 1.06), revMat, YP);
  for (let i = 0; i < N; i++) {
    const x0 = xl + (w * i) / N, x1 = xl + (w * (i + 1)) / N;
    const ya = Math.min(archY(x0), H - 1e-3), yb = Math.min(archY(x1), H - 1e-3);
    if (ya >= H - 2e-3 && yb >= H - 2e-3) continue;
    const mx = (x0 + x1) / 2;
    const nx = (mx - cx) / (hw * hw), ny = (ya - spring) / (rise * rise);
    const nl = Math.hypot(nx, ny) || 1;
    b.quad([x0, ya, zIn], [x1, yb, zIn], [x1, yb, zOut], [x0, ya, zOut], mulc(revCol, 0.82), revMat, [-nx / nl, -ny / nl, 0]);
  }
}

// 拱形线脚（贴在墙面上的扁带）：门套 / 窗套
export function archTrim(b, o, zFace, dirZ, bandW, depth, col, mat) {
  const cx = o.cx || 0, hw = o.w / 2, spring = o.spring, rise = o.rise, y0 = o.y0 || 0;
  const N = 18;
  const faceN = [0, 0, dirZ > 0 ? 1 : -1];
  const P = (t, band) => [cx + (hw + band) * Math.cos(t), spring + (rise + band) * Math.sin(t)];
  for (let i = 0; i < N; i++) {
    const t0 = (Math.PI * i) / N, t1 = (Math.PI * (i + 1)) / N;
    const a0 = P(t0, 0), a1 = P(t1, 0), b0 = P(t0, bandW), b1 = P(t1, bandW);
    const zB = zFace + dirZ * depth;
    b.quad([a0[0], a0[1], zFace], [a1[0], a1[1], zFace], [b1[0], b1[1], zFace], [b0[0], b0[1], zFace], col, mat, faceN);
    const mx = (a0[0] + a1[0]) / 2 - cx, my = (a0[1] + a1[1]) / 2 - spring;
    const nl = Math.hypot(mx, my) || 1;
    b.quad([a0[0], a0[1], zFace], [a1[0], a1[1], zFace], [a1[0], a1[1], zB], [a0[0], a0[1], zB], col, mat, [mx / nl, my / nl, 0]);
  }
  for (const s of [-1, 1]) {
    const xa = cx + s * hw, xb = cx + s * (hw + bandW);
    b.quad([xa, y0, zFace], [xb, y0, zFace], [xb, spring, zFace], [xa, spring, zFace], col, mat, faceN);
    b.quad([xa, y0, zFace], [xa, spring, zFace], [xa, spring, zFace + dirZ * depth], [xa, y0, zFace + dirZ * depth], col, mat, [-s, 0, 0]);
  }
}

// ---------------------------------------------------------------- 主入口
export function buildRoomShell(b, ctx, R, S = {}) {
  const W = R.W, D = R.D, H = R.H, T = S.wallT ?? 0.9;
  const wallIn = S.wallIn || rgb('#d9d2c4');
  const wallInMat = S.wallInMat || [0.095, 0.18];
  const wallOut = S.wallOut || C.ivory;
  const wallOutMat = S.wallOutMat || [0.045, 0.34];
  const revCol = S.revCol || mixc(wallOut, C.brassDark, 0.22);
  const revMat = S.revMat || [0.03, 0.26];
  const floor = S.floor || rgb('#8a7a63');
  const floorMat = S.floorMat || [0.075, 0.22];
  const ceil = S.ceil || rgb('#cfc8b8');
  const ceilMat = S.ceilMat || [0.10, 0.12];
  const trim = S.trim || C.brass;
  const trimMat = S.trimMat || [0.06, 0.78];
  const skirting = S.skirting || mixc(wallIn, C.brassDark, 0.24);
  const skirtingMat = S.skirtingMat || [0.07, 0.3];
  const doorO = { cx: 0, w: S.doorW ?? 13, y0: 0, spring: S.doorSpring ?? 8.5, rise: S.doorRise ?? 6.5 };
  const winO = { cx: 0, w: S.winW ?? 30, y0: S.winY0 ?? 1.5, spring: S.winSpring ?? 12.5, rise: S.winRise ?? 3.5 };
  const F = { inCol: wallIn, inMat: wallInMat, outCol: wallOut, outMat: wallOutMat, revCol, revMat };

  // ---- 地台 / 顶板（出挑 1.1 / 1.3，让整间房从外面看是一个完整体块）
  at(b, 0, -0.65, D / 2);
  box(b, W + 2.2, 1.3, D + 2.6, floor, floorMat, { topCol: S.floorTop || mulc(floor, 1.05), bottomCol: S.hullBottom || mulc(C.panelDark, 0.9) });
  b.pop();
  at(b, 0, H + 0.5, D / 2);
  box(b, W + 2.2, 1.0, D + 2.6, ceil, ceilMat, { topCol: S.roof || wallOut, bottomCol: ceil });
  b.pop();

  // ---- 侧墙（厚 T，实体向房间内）
  for (const s of [-1, 1]) {
    at(b, s * (W / 2 - T / 2), H / 2, D / 2);
    box(b, T, H, D + 2 * T, wallIn, wallInMat, { topCol: wallOut, bottomCol: mulc(wallIn, 0.7) });
    b.pop();
  }

  // ---- 房门墙（z=0，实体 z ∈ [-T,0]）
  archWall(b, W, H, T, doorO, F);
  // 门套（桥那一面，朝 -Z）
  archTrim(b, doorO, -T, -1, 0.85, 0.42, trim, trimMat);
  archTrim(b, doorO, 0.001, 1, 0.5, 0.22, trim, trimMat);
  // 门槛
  at(b, 0, 0.09, -0.25);
  box(b, doorO.w + 1.5, 0.18, 1.3, trim, trimMat);
  b.pop();

  // ---- 大窗墙（z=D）：把坐标系翻到 z=D 再用同一套 archWall
  b.push(m4.mul(m4.translate([0, 0, D]), m4.rotY(Math.PI)));
  archWall(b, W, H, T, winO, F);
  b.pop();
  // 窗套（室内一面 + 桥那一面的外沿）
  archTrim(b, winO, D - 0.001, -1, 0.7, 0.36, trim, trimMat);
  archTrim(b, winO, D + T, 1, 0.9, 0.4, trim, trimMat);
  // 窗棂：竖向 mullions + 横梃 transom（在墙厚里）
  const hw = winO.w / 2, xl = -hw, xr = hw;
  const archY = (x) => winO.spring + winO.rise * Math.sqrt(Math.max(0, 1 - (x / hw) * (x / hw)));
  const mull = S.mullions ?? 4;
  for (let k = 1; k <= mull; k++) {
    const x = xl + (winO.w * k) / (mull + 1);
    const top = archY(x) - 0.2;
    if (top - winO.y0 < 0.8) continue;
    at(b, x, (winO.y0 + top) / 2, D + T * 0.5);
    box(b, 0.34, top - winO.y0, 0.52, S.mullionCol || trim, S.mullionMat || trimMat);
    b.pop();
  }
  const ty = S.transomY ?? 9.2;
  if (ty > winO.y0 + 0.6 && ty < winO.spring) {
    at(b, 0, ty, D + T * 0.5);
    box(b, winO.w - 0.2, 0.42, 0.52, S.mullionCol || trim, S.mullionMat || trimMat);
    b.pop();
  }
  // 窗台（伸进室内）
  at(b, 0, winO.y0 - 0.22, D - 0.75);
  box(b, winO.w + 2.4, 0.44, 1.5, S.sillCol || mixc(trim, C.marble, 0.4), S.sillMat || [0.05, 0.4]);
  b.pop();

  // ---- 室内线脚：踢脚 + 檐口 + 壁柱 + 顶梁
  const innerX = W / 2 - T;
  for (const s of [-1, 1]) {
    at(b, s * (innerX - 0.09), 0.45, D / 2);
    box(b, 0.18, 0.9, D - 0.6, skirting, skirtingMat);
    b.pop();
    at(b, s * (innerX - 0.2), H - 0.5, D / 2);
    box(b, 0.4, 0.62, D - 0.6, trim, trimMat);
    b.pop();
    // 壁柱
    for (const z of S.pilasterZ || [3.4, 9.0, 14.6, 20.2]) {
      at(b, s * (innerX - 0.28), H / 2, z);
      box(b, 0.56, H, 1.05, S.pilasterCol || mulc(wallIn, 0.86), S.pilasterMat || wallInMat);
      b.pop();
      at(b, s * (innerX - 0.3), H - 0.85, z);
      box(b, 0.72, 0.55, 1.25, trim, trimMat);
      b.pop();
      at(b, s * (innerX - 0.3), 0.35, z);
      box(b, 0.7, 0.7, 1.2, trim, trimMat);
      b.pop();
    }
  }
  // 门墙 / 窗墙的踢脚段（避开洞口）
  for (const seg of [[-W / 2 + T, xl - 0.5], [xr + 0.5, W / 2 - T]]) {
    const wseg = seg[1] - seg[0];
    if (wseg <= 0.2) continue;
    at(b, (seg[0] + seg[1]) / 2, 0.45, 0.09);
    box(b, wseg, 0.9, 0.18, skirting, skirtingMat);
    b.pop();
    at(b, (seg[0] + seg[1]) / 2, H - 0.5, 0.2);
    box(b, wseg, 0.62, 0.4, trim, trimMat);
    b.pop();
    at(b, (seg[0] + seg[1]) / 2, 0.45, D - 0.09);
    box(b, wseg, 0.9, 0.18, skirting, skirtingMat);
    b.pop();
    at(b, (seg[0] + seg[1]) / 2, H - 0.5, D - 0.2);
    box(b, wseg, 0.62, 0.4, trim, trimMat);
    b.pop();
  }
  if (S.beams !== false) {
    for (const z of [6.5, 13.0, 19.5]) {
      at(b, 0, H - 0.3, z);
      box(b, W - 1.6, 0.55, 0.8, S.beamCol || mulc(ceil, 0.86), S.beamMat || ceilMat);
      b.pop();
    }
  }

  // ---- 室外：勒脚 / 檐口 / 角柱（画廊外观用）
  at(b, 0, -0.9, D + T + 0.35);
  box(b, W + 3.2, 1.5, 1.4, S.plinthCol || mulc(wallOut, 0.92), S.plinthMat || wallOutMat);
  b.pop();
  at(b, 0, H + 0.35, D + T + 0.4);
  box(b, W + 3.2, 1.05, 1.7, S.corniceCol || trim, S.corniceMat || trimMat);
  b.pop();
  // 窗楣外侧暖光带（从画廊外面看，四间房的窗是一片发亮的灯笼面）
  at(b, 0, S.winSpring ?? 12.5 + 3.5 + 0.75, D + T + 1.15);
  box(b, (S.winW ?? 30) - 1.8, 0.3, 0.3, mulc(C.warmGlow, 1.2), [0.88, 0.2]);
  b.pop();
  at(b, 0, -0.9, -T - 0.35);
  box(b, W + 3.2, 1.5, 1.4, S.plinthCol || mulc(wallOut, 0.92), S.plinthMat || wallOutMat);
  b.pop();
  for (const s of [-1, 1]) {
    at(b, s * (W / 2 + 0.9), H / 2, D + T + 0.55);
    box(b, 1.7, H + 1.1, 1.6, S.pierCol || wallOut, S.pierMat || wallOutMat, { topCol: trim, bottomCol: mulc(wallOut, 0.8) });
    b.pop();
  }
  return { W, D, H, innerX, doorO, winO };
}
