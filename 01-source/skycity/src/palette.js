// Night lantern-festival palette. All colours are linear-space [r,g,b].
import { rgb } from './geo.js';

export const C = {
  zenith: rgb('#080e2a'),
  horizon: rgb('#22335e'),
  haze: rgb('#39466b'),
  glow: rgb('#b8683a'),
  moon: rgb('#ffe7c2'),
  fog: rgb('#26304a'),
  skyAmb: rgb('#26324e'),
  groundAmb: rgb('#6a4034'),
  city: rgb('#ff8a3c'),
  rim: rgb('#6f92ff'),
  key: rgb('#e8dcc8'),
  wood: rgb('#5a3a28'),
  woodMid: rgb('#6a4a34'),
  woodLight: rgb('#8a6242'),
  // --- machiya（建筑精细化，规格见 03-notes/building-spec.md §4.2）
  timberDark: rgb('#3b2418'),   // 窗棂/椽/檐下木        Y .023
  timberPale: rgb('#9a6b3f'),   // 受光木/梁头（少量）    Y .177
  sootBlack: rgb('#1e1f24'),    // 门洞/窗腔/瓦沟         Y .014
  tileSlate: rgb('#353d4a'),    // 瓦（冷青灰，亮于木）   Y .052
  tileRidge: rgb('#4e5866'),    // 瓦行亮带/檐口瓦当     Y .099
  plasterShade: rgb('#8e7f68'), // 灰泥暗部/檐下小壁     Y .219
  paperWindow: rgb('#ffd08a'),  // 窗纸（普通）emissive .5
  paperWindowHot: rgb('#fff3d2'), // 窗纸（灯芯正对）e .9
  goldLeaf: rgb('#d8a44e'),     // 旧金（斗拱/匾边/门钉）
  vermilion: rgb('#932b23'),    // 朱漆柱/挑台栏杆
  norenIndigo: rgb('#2c4166'),  // 暖帘/幡（靛）
  norenRust: rgb('#9c3a2c'),    // 暖帘/幡（锈红）
  signPaper: rgb('#e8d6ae'),    // 招牌纸面（自发光 .3）
  lanternSkin: rgb('#ffbf6e'),  // 灯笼纸（billboard 用）
  plaster: rgb('#b8a98f'),
  roof: rgb('#5a3a30'),
  roofWarm: rgb('#33303e'),
  red: rgb('#b8362a'),
  redLight: rgb('#cf4a30'),
  gold: rgb('#e7b25c'),
  goldBright: rgb('#ffd68a'),
  stone: rgb('#8a8378'),
  stoneDark: rgb('#55504a'),
  moss: rgb('#4a6444'),
  paper: rgb('#ffb45e'),
  paperCore: rgb('#fff0c8'),
  koiGold: rgb('#ffc258'),
  koiRed: rgb('#e8502e'),
  koiWhite: rgb('#fff2d8'),
  water: rgb('#1d3350'),
};

export const PRESETS = [
  {
    name: '灯祭 · 夜',
    zenith: C.zenith, horizon: C.horizon, haze: C.haze, glow: C.glow,
    moonColor: C.moon, fog: C.fog, skyAmb: C.skyAmb, groundAmb: C.groundAmb,
    city: C.city, rim: C.rim, key: C.key, keyInt: 0.85,
    fogDensity: 0.0005, exposure: 1.12, stars: 1.0, bloom: 0.64,
    lift: [0.01, 0.015, 0.045], gain: [1.04, 1.0, 0.97], saturation: 1.1,
  },
  {
    name: '薄暮 · 蓝调',
    zenith: rgb('#12224e'), horizon: rgb('#6a5a7e'), haze: rgb('#8e7a86'),
    glow: rgb('#e0845a'), moonColor: rgb('#ffe8cc'), fog: rgb('#33304e'),
    skyAmb: rgb('#33406a'), groundAmb: rgb('#4a3038'), city: rgb('#ff9a5a'),
    rim: rgb('#aac4ff'), key: rgb('#ffd0b0'), keyInt: 0.8,
    fogDensity: 0.00055, exposure: 1.02, stars: 0.3, bloom: 0.8,
    lift: [0.02, 0.02, 0.05], gain: [1.06, 1.0, 0.95], saturation: 1.04,
  },
];
