// palette.js — 星鲸环 ASTRA 的色板（线性空间 rgb）与场景 LOOK。
// 太空不是纯黑：底色是极深的靛紫，星云提供颜色，舷窗/灯带提供暖光。
// 船壳延续 CIELO 的象牙白 + 黄铜血统 —— 环站是同一文明的"上游"。
import { rgb } from '../../cielo/src/geo.js';

export const C = {
  // ---- 虚空 / 星云 -------------------------------------------------------
  voidHigh: rgb('#141a44'),        // 天顶方向的深靛
  voidLow: rgb('#05060f'),         // 底部的近黑紫
  star: rgb('#eaf1ff'),
  starWarm: rgb('#ffe0b0'),
  nebA: rgb('#7a3fa8'),            // 品红紫
  nebB: rgb('#2e6ba8'),            // 青蓝
  nebC: rgb('#b04f7a'),            // 玫瑰
  nebD: rgb('#e8b46a'),            // 金尘
  moonShade: rgb('#cfd8e8'),

  // ---- 巨行星 ------------------------------------------------------------
  planetA: rgb('#cf9257'),         // 琥珀
  planetB: rgb('#8a4e52'),         // 暮玫瑰
  planetAtm: rgb('#7fc4e8'),
  ringA: rgb('#e8d6b0'),
  ringB: rgb('#b08455'),

  // ---- 恒星光 ------------------------------------------------------------
  sun: rgb('#fff6e2'),
  sunGlow: rgb('#ffd9a0'),
  keyWarm: rgb('#fff0d8'),
  ambSky: rgb('#4a5fa8'),
  ambGround: rgb('#241f3a'),
  rim: rgb('#8fc8ff'),
  fog: rgb('#0d1130'),
  shadowTint: rgb('#6a78b8'),

  // ---- 船壳 / 金属（CIELO 的象牙白 + 黄铜，换到太空）----------------------
  ivory: rgb('#e8e2d2'),
  ivoryShade: rgb('#c3bcaa'),
  ivoryDark: rgb('#9c9585'),
  panel: rgb('#8e93a3'),
  panelDark: rgb('#4a4f63'),
  panelDeep: rgb('#2b3040'),
  steel: rgb('#5c6478'),
  steelLight: rgb('#8f97a8'),
  steelDark: rgb('#2b3040'),
  brass: rgb('#d9a955'),
  brassHi: rgb('#f2d69a'),
  brassDark: rgb('#8a6a34'),
  copper: rgb('#b07a4a'),
  glass: rgb('#a8d8f0'),
  glassDeep: rgb('#4a7fa8'),
  glassFrame: rgb('#e6eef8'),

  // ---- 光 ----------------------------------------------------------------
  warmGlow: rgb('#ffd9a0'),
  amber: rgb('#f0b24a'),
  cyanGlow: rgb('#7ff0dc'),
  cyan: rgb('#4fd6c8'),
  ember: rgb('#ff9a5c'),
  lampRed: rgb('#ff6a6a'),

  // ---- 岩石 / 小行星 -----------------------------------------------------
  rock: rgb('#5a5148'),
  rockLight: rgb('#7d7266'),
  rockDark: rgb('#332e2a'),
  ice: rgb('#b8d4e8'),

  // ---- 飞船 / 道具 -------------------------------------------------------
  hullWhite: rgb('#dfe4ea'),
  hullBlue: rgb('#3a4f7a'),
  hullTeal: rgb('#2f6a74'),
  whaleBody: rgb('#2b52a8'),      // 与 CIELO 的天空鲸同色：它们是同一种生物
  whaleBelly: rgb('#c3dcf0'),
  whaleFin: rgb('#3f68bd'),

  // ---- 植物（穹顶中庭的"空中园"）-----------------------------------------
  leaf: rgb('#3f7a5c'),
  leafLight: rgb('#6fbf8e'),
  leafDark: rgb('#27503f'),
  bloomPink: rgb('#e8789c'),
  bloomYellow: rgb('#f0c060'),
  soil: rgb('#3a2f2a'),
  marble: rgb('#efe8d8'),
  marbleShade: rgb('#c8c0ae'),
};

// 场景 LOOK：main.js 只认这些字段（与 CIELO 的 LOOK 同名同义，值与太空不同）。
export const LOOK = {
  keyDir: [-0.42, 0.36, 0.83],    // 指向恒星的方向（已近似单位长度）
  keyColor: C.keyWarm,
  keyInt: 1.95,
  ambSky: C.ambSky,
  ambGround: C.ambGround,
  ambMul: 0.13,
  rim: C.rim,
  rimInt: 0.62,
  fogColor: C.fog,
  fogDensity: 0.000035,
  fogHeightFalloff: 0,
  fogMax: 0.5,
  exposure: 1.04,
  bloomThreshold: 0.92,
  bloomInt: 0.46,
  saturation: 1.16,
  contrast: 1.16,
  vignette: 0.34,
  shadowTint: C.shadowTint,
  shadowOn: 1,
};

// 天空 uniforms（space-sky.fs.glsl）：行星/星云/恒星三件套。
// 行星放在默认机位的正前偏右上（相机的默认视线朝 -Z）。
const PL = [-0.26, 0.19, -0.945];
const plLen = Math.hypot(PL[0], PL[1], PL[2]);
export const SKY = {
  starColor: C.star,
  starInt: 1.0,
  voidHigh: C.voidHigh,
  voidLow: C.voidLow,
  voidInt: 1.15,
  nebA: C.nebA,
  nebB: C.nebB,
  nebC: C.nebC,
  nebD: C.nebD,
  nebInt: 0.82,
  sunDir: [0.42, -0.36, -0.83],   // 恒星在行星后下方：行星出现漂亮的弦月
  sunColor: C.sun,
  sunInt: 1.0,
  planetDir: [PL[0] / plLen, PL[1] / plLen, PL[2] / plLen],
  planetAxis: [0.36, 0.78, 0.52], // 环面法线（决定行星环的椭圆姿态）
  planetAng: 0.245,               // 行星角半径（rad，约 14°）
  planetColA: C.planetA,
  planetColB: C.planetB,
  planetAtm: C.planetAtm,
  planetInt: 1.0,
  planetGlow: 1.0,
  ringColA: C.ringA,
  ringColB: C.ringB,
  ringInt: 0.62,
  moonDir: [-0.62, 0.34, -0.71],
  moonAng: 0.022,
  moonCol: C.moonShade,
};
