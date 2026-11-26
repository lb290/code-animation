// interiors-plan.js — ROUND 16 · ASTRA「悬灯画廊 THE LANTERN GALLERY」的冻结契约。
//
// 这是画廊、四间房、观景点、体检共用的唯一尺寸真值。房间模块只从这里读 R（自己的
// 那一间）与局部坐标系约定，不各写一份。改尺寸必须同步改 tools/astra-check.mjs 与
// 各房间体检的期望值。
//
// ---------------------------------------------------------------- 坐标系
// 世界坐标与 station-ring.js 一致：P(a, r) = (cos a * r, y, sin a * r)，y 向上。
// 画廊挂在环带下沿：方位 250°（-Z 偏 -X，窗外正对巨行星；避开 270° 对接港和
// 20/86/154/222/300/344° 的底部散热鳍，也在 146/205° 两组太阳帆之间）。
//
// 画廊局部坐标系（G 系）：原点 = P(250°, 636, -86)；+X 沿环带切向（桥的方向），
// +Y = 世界 +Y，+Z = 径向朝外（正对巨行星）。G 系是右手系（-U × Y = V）。
// 每间房在 G 系里是一块 (cx ± W/2, 0..H, DOOR_Z..DOOR_Z+D) 的盒子：
//   z = 0     房门墙（贴着桥的外沿，桥面在 z<0）
//   z = D     大窗墙（朝外，望巨行星 / 星云）
// 房间模块在**自己的局部坐标系**里建模：x ∈ [-W/2, W/2]，y ∈ [0, H]，
// z ∈ [0, D]；不要自己做世界变换，world.js 用 roomFrame() 统一摆放。
//
// ---------------------------------------------------------------- 房间预算
// 每间：三角 14000..42000；点光 ≤6（range ≤ 60、int ≤ 6）；静态 billboard ≤ 24；
// 室内材质 emissive ≤ 0.18（灯罩/窗棂等"发光件"可到 0.95），albedo 不要死黑。
import { m4 } from './engine.js';

export const DEG = Math.PI / 180;

export const GAL = {
  azDeg: 250,
  r: 636,            // 画廊基准半径（环带外沿 646 内侧 10 m）
  y: -86,            // 桥面 / 房间地面世界高度（环带底面 -37 以下 49 m）
  bridgeHalfX: 104,  // 桥沿切向半长
  bridgeZ0: -9,      // 桥内沿（朝站心）
  bridgeZ1: 8,       // 桥外沿（房间门墙所在 z）
  railH: 1.15,
  roomW: 40,
  roomD: 26,
  roomH: 18,
  doorW: 13, doorSpring: 8.5, doorRise: 6.5,   // 房门：拱顶 = spring + rise = 15 m
  winW: 30, winY0: 1.5, winSpring: 12.5, winRise: 3.5, // 大窗：拱顶 16 m
  wallT: 0.9,
};

const AZ = GAL.azDeg * DEG;
const _U = [-Math.sin(AZ), 0, Math.cos(AZ)];   // 切向（u = 沿桥）
const _V = [Math.cos(AZ), 0, Math.sin(AZ)];    // 径向朝外（v = 朝巨行星）
const _G0 = [Math.cos(AZ) * GAL.r, GAL.y, Math.sin(AZ) * GAL.r];

// G 系 → 世界：x 轴 = -U，y 轴 = +Y，z 轴 = +V（右手系）
const GX = [-_U[0], 0, -_U[2]];
const GZ = [_V[0], 0, _V[2]];
export const GALLERY = { origin: _G0, U: _U, V: _V, xAxis: GX, zAxis: GZ };

// G 系插值：p = (u 沿桥, y, v 径向)
export function gpt(u, y, v) {
  return [_G0[0] + GX[0] * u + GZ[0] * v, y, _G0[2] + GX[2] * u + GZ[2] * v];
}
// 世界点（G 系坐标）→ 世界，供 layout.js / 体检用
export function galleryFrame() {
  const m = m4.identity();
  m[0] = GX[0]; m[1] = 0; m[2] = GX[2];
  m[4] = 0; m[5] = 1; m[6] = 0;
  m[8] = GZ[0]; m[9] = 0; m[10] = GZ[2];
  m[12] = _G0[0]; m[13] = _G0[1]; m[14] = _G0[2];
  return m;
}
// 房间局部坐标（x∈[-W/2,W/2], y∈[0,H], z∈[0,D]）→ 世界
export function roomFrame(cx) {
  const m = galleryFrame();
  m[12] += GX[0] * cx + GZ[0] * GAL.bridgeZ1;
  m[14] += GX[2] * cx + GZ[2] * GAL.bridgeZ1;
  return m;
}
export function roomToWorld(cx, p) {
  const m = roomFrame(cx);
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}

// ---------------------------------------------------------------- 四间房
// cx：房间中心在 G 系里的沿桥坐标。四间房在桥外侧排成一列，门都开向桥。
// cams：房间局部坐标里的两个默认机位（宽景 / 细节），layout.js 直接引用。
export const ROOMS = [
  {
    key: 'painter', name: '彩窗画室', en: "THE PAINTER'S LOFT", cx: -84, seed: 0x57a11021,
    ref: '素材/图片/幻想城市/室内/111530188_p0.jpg',
    hint: '少女的阁楼画室：青绿木作 + 珊瑚粉墙 + 奶白，彩绘玻璃鱼窗、红罩吊灯、吊篮绿植、鱼缸、画架与散落画稿、字母书架、黑猫',
    cams: {
      in: { pos: [-13, 7.2, 5.0], look: [6, 4.5, 22], fov: 74 },
      wide: { pos: [11, 8.0, 21.0], look: [-9, 4.0, 2.0], fov: 68 },
    },
  },
  {
    key: 'tearoom', name: '丝绒茶厅', en: 'THE VELVET TEAROOM', cx: -28, seed: 0x57a11022,
    ref: '素材/图片/幻想城市/室内/68499618_p0.jpg',
    hint: '午后茶会：猩红地毯 + 金线墙板 + 绿丝绒沙发，三层点心架、茶具、书堆卷轴、盆栽、黄铜烛台',
    cams: {
      in: { pos: [-13, 6.8, 4.6], look: [7, 4.0, 22], fov: 72 },
      wide: { pos: [12, 7.6, 21.5], look: [-10, 3.6, 2.0], fov: 68 },
    },
  },
  {
    key: 'atelier', name: '玻璃工坊', en: 'THE GLASS ATELIER', cx: 28, seed: 0x57a11023,
    ref: '素材/图片/幻想城市/室内/68390607_p0.jpg',
    hint: '玻璃观景工坊：蓝白玻璃、草皮地面与小花、长工作台（绘图屏/笔记本/工具）、悬挂圆灯、书架、盆栽、气球',
    cams: {
      in: { pos: [-14, 7.0, 4.6], look: [8, 4.2, 22], fov: 74 },
      wide: { pos: [12, 7.4, 21.0], look: [-9, 3.8, 2.0], fov: 68 },
    },
  },
  {
    key: 'study', name: '青花书房', en: 'THE PORCELAIN STUDY', cx: 84, seed: 0x57a11024,
    ref: '素材/图片/幻想城市/室内/46454797_p0.jpg',
    hint: '蓝白瓷书房：黑白棋盘地、青花瓷柜与瓷瓶、室内苹果树、挂画与蝴蝶、水晶吊灯、蓝丝绒长椅上飘浮的书',
    cams: {
      in: { pos: [-14, 7.0, 4.8], look: [9, 4.4, 22], fov: 74 },
      wide: { pos: [13, 7.8, 21.0], look: [-10, 3.8, 2.0], fov: 68 },
    },
  },
];

export function roomEntry(key) {
  const r = ROOMS.find((x) => x.key === key);
  if (!r) throw new Error('unknown room: ' + key);
  return { W: GAL.roomW, D: GAL.roomD, H: GAL.roomH, ...r };
}

// ---------------------------------------------------------------- 观景点
// 只追加：0..9 保持原样（URL ?view=、截图计划、mobile-check 都引用旧索引）。
// 新增 10：画廊外观 / 11：廊桥 / 12..19：四间房的宽景与细节。
export const GAL_VIEWS = [
  // 画廊外观：从环站外侧下方仰看环带下吊着的一排灯阁
  // 注意：pos/look 的第二个分量是**世界高度**（桥面 = GAL.y = -86），不是画廊局部高度。
  { name: '悬灯画廊', en: 'THE LANTERN GALLERY', pos: [18, -152, 180], look: [0, -62, 10], fov: 55 },
  // 廊桥：站在桥的西端，向东看四扇门与中央塔（局部 y=5.6 → 世界 -80.4）
  { name: '画廊长桥', en: 'THE GALLERY BRIDGE', pos: [-96, -80.4, -2.0], look: [80, -82.4, 7.0], fov: 66 },
];

export function galleryViewWorld(v) {
  const p = gpt(v.pos[0], v.pos[1], v.pos[2]);
  const l = gpt(v.look[0], v.look[1], v.look[2]);
  return { pos: p, look: l, fov: v.fov, name: v.name, en: v.en };
}

export function roomViewWorld(R, which) {
  const cam = R.cams[which];
  const p = roomToWorld(R.cx, cam.pos);
  const l = roomToWorld(R.cx, cam.look);
  const label = which === 'in' ? '入门' : '望窗';
  return { pos: p, look: l, fov: cam.fov, name: R.name + ' · ' + label, en: R.en };
}

// 房间局部坐标里的"体检探针"（各房间 check 共用）
export const PROBES = {
  entry: { from: [0, 6.5, -14], to: [0, 6.5, 4] },      // 从桥上穿门进来：必须 0 命中
  window: { from: [0, 8.0, 6], to: [0, 8.0, 60] },      // 从室内穿窗出去：必须 0 命中
  wallAboveDoor: { from: [0, 16.6, -14], to: [0, 16.6, 4] }, // 门上方实墙：必须命中
  wallBesideDoor: { from: [17, 6.5, -14], to: [17, 6.5, 4] }, // 门侧实墙：必须命中
  floor: { from: [0, 8, 13], to: [0, -4, 13] },         // 地板：必须命中
  ceiling: { from: [0, 8, 13], to: [0, 30, 13] },       // 顶板：必须命中
};
