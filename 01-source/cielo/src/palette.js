// CIELO — bright anime-daylight palette. All colours are LINEAR-space rgb from sRGB hex.
import { rgb } from './geo.js';

export const C = {
  // ---- sky / light -------------------------------------------------------
  zenith: rgb('#1a44c8'),     // deep cobalt overhead
  skyMid: rgb('#3a8ce0'),     // mid sky
  horizon: rgb('#cfe9fb'),    // pale cyan horizon
  haze: rgb('#d8eef8'),
  sun: rgb('#fff8e6'),
  sunGlow: rgb('#ffe6b0'),
  cloudLit: rgb('#fdfeff'),
  cloudShade: rgb('#a8bde6'),  // lavender-blue cloud shadow
  cloudDeep: rgb('#8fa8dc'),
  moon: rgb('#dfe8f5'),

  key: rgb('#fff4dc'),        // warm key light
  skyAmb: rgb('#7fa8e8'),     // cool sky ambient
  groundAmb: rgb('#c9b795'),  // warm bounce off the stone plaza
  rim: rgb('#bfe4ff'),
  fog: rgb('#c8e4f6'),
  cityGlow: rgb('#ffe9c0'),

  // ---- stone / marble ----------------------------------------------------
  stone: rgb('#ddd2b8'),      // cream limestone
  stoneWarm: rgb('#d6c8aa'),
  stonePale: rgb('#e8dec8'),
  stoneCool: rgb('#cfd4dd'),  // cool-cut stone (blue shadow side)
  stoneDark: rgb('#b6ab96'),
  marble: rgb('#efe8d8'),
  marbleShade: rgb('#d8d1c0'),
  plaster: rgb('#dbd0b8'),

  // ---- roofs / metal -----------------------------------------------------
  slate: rgb('#4c63a6'),      // blue slate roof
  slateDark: rgb('#3a4c85'),
  slateLight: rgb('#6b84c4'),
  copper: rgb('#79a897'),     // verdigris
  gold: rgb('#e8b45f'),
  goldBright: rgb('#ffdca0'),
  bronze: rgb('#8a7350'),
  iron: rgb('#2b3345'),       // dark steel viaduct / lamp posts
  ironLight: rgb('#4a5568'),
  brass: rgb('#c9a24a'),

  // ---- glass / water -----------------------------------------------------
  glass: rgb('#bfe2f4'),
  glassDeep: rgb('#7fb6de'),
  glassFrame: rgb('#f4f7fa'),
  water: rgb('#4fa8d8'),
  waterDeep: rgb('#2a6ea8'),

  // ---- foliage / flowers -------------------------------------------------
  leaf: rgb('#4f9a4e'),
  leafLight: rgb('#7cc463'),
  leafDark: rgb('#2f6b40'),
  vine: rgb('#3f8a4a'),
  lawn: rgb('#6cb95e'),
  bloomPink: rgb('#f2718e'),
  bloomRed: rgb('#e04a5c'),
  bloomYellow: rgb('#f7c948'),
  bloomBlue: rgb('#6f8ff0'),
  bloomWhite: rgb('#fff8f0'),

  // ---- balloons / props --------------------------------------------------
  ballPink: rgb('#f58fb2'),
  ballCream: rgb('#f6e3b0'),
  ballSky: rgb('#9fd9ee'),
  ballLilac: rgb('#c3b3ea'),
  ballMint: rgb('#a8e6c4'),
  ballCoral: rgb('#f5a07e'),

  // ---- creatures ---------------------------------------------------------
  whaleBody: rgb('#2b52a8'),
  whaleBodyLit: rgb('#4a7ad4'),
  whaleBelly: rgb('#c3dcf0'),
  whaleFin: rgb('#3f68bd'),
  koiRed: rgb('#e8542c'),
  koiGold: rgb('#f2b23c'),
  koiWhite: rgb('#fff4e2'),
  koiBlue: rgb('#3b7fd4'),
  dove: rgb('#ffffff'),
  doveShade: rgb('#d6e2f0'),
  giraffe: rgb('#eeB98a'),
  giraffeSpot: rgb('#c47a4e'),
  giraffeCream: rgb('#f8e3c8'),
  catBlack: rgb('#232733'),

  // ---- train -------------------------------------------------------------
  trainNavy: rgb('#22304e'),
  trainGreen: rgb('#1f4038'),
  trainBlack: rgb('#1a1d26'),
  trainRed: rgb('#a8332b'),
  smoke: rgb('#f2f6fa'),

  // ---- character ---------------------------------------------------------
  skin: rgb('#ffe2cc'),
  hairBlonde: rgb('#f6d68e'),
  hairBlondeShade: rgb('#e0b866'),
  dressWhite: rgb('#fdfaf4'),
  dressPink: rgb('#f7cdd8'),
  ribbonBlue: rgb('#5b8fd8'),
  eyeBlue: rgb('#3f74c8'),
};

// Scene-wide look preset (single preset: bright noon-ish anime daylight).
export const LOOK = {
  skyZenith: C.zenith,
  skyMid: C.skyMid,
  skyHorizon: C.horizon,
  haze: C.haze,
  sunDir: [-0.46, 0.56, 0.69],    // from the camera side: facades face the light
  sunColor: C.sun,
  sunInt: 1.55,
  cloudLit: C.cloudLit,
  cloudShade: C.cloudShade,
  cloudDeep: C.cloudDeep,
  keyInt: 1.20,
  ambSky: C.skyAmb,
  ambGround: C.groundAmb,
  ambMul: 0.23,
  rim: C.rim,
  rimInt: 0.42,
  fogColor: C.fog,
  fogDensity: 0.00080,        // aerial perspective: 1-exp(-(d*density)^1.25)
  fogHeightFalloff: 0.0009,
  fogMax: 0.88,
  exposure: 0.98,
  bloomThreshold: 1.22,
  bloomInt: 0.22,
  saturation: 1.26,
  contrast: 1.14,
  vignette: 0.22,
  shadowTint: rgb('#9fb0df'),  // blue-violet shadow multiplier
};
