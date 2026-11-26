// engine.js — ASTRA 与 CIELO 共享的引擎库再导出。
//
// 为什么这样拆：数学/几何/GL 是「引擎」，世界内容与美术是「作品」。ASTRA 是第二个世界，
// 复用引擎、不复用内容（CIELO 的 73 个模块里有 60 个是它的城市/建筑内容）。
// 纪律：这些文件 **只读引用**，不在这里改；要改引擎先跑 CIELO 的 checkall + mobile-check。
export {
  B, rgb, mixc, mulc, addc,
  box, cylinder, lathe, roof, archWall, torus, sphere, ribbon, rockBlob, grid,
  bar3, fretGrid, railing, eaveRoof, roofGable, catenary,
} from '../../cielo/src/geo.js';
export {
  MT, ellipsoid, tubePath, disc, extrudeXY, extrudeXZ, mirrorX, radialSlabs,
  catmullPts, bez3, bez2,
} from '../../cielo/src/lib3d.js';
export {
  TAU, clamp, lerp, smoothstep, mix3, mulberry32, hash2, hash3,
  noise2, noise3, fbm2, fbm3, ridged2, v3, add, sub, scale, dot, cross, len, norm, mixv,
  m4, ease, catmull, damp,
} from '../../cielo/src/math.js';
