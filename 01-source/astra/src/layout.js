// layout.js — ASTRA 唯一的锚点表：环站尺寸、穹顶、船坞、观景点。
// 内容模块只从这里读尺寸，不各写一份；改尺寸必须同步体检脚本。
//
// 世界坐标：y 向上，环带平面 = XZ，环站中心 = (0,0,0)。
import { ROOMS, GAL_VIEWS, galleryViewWorld, roomViewWorld } from './interiors-plan.js';

export const ST = {
  ringR: 600,          // 环带中心线半径
  ringW: 92,           // 环带径向厚度
  ringH: 74,           // 环带轴向高度
  ringSeg: 96,         // 环带圆周分段（几何与检查共用）
  hubTop: 460,         // 中央脊柱顶（天线/灯塔）
  hubBottom: -300,     // 脊柱底（配重/反物质机舱）
  hubR: 78,            // 脊柱主体半径
  domeY: 130,          // 玻璃穹顶中心高度
  domeR: 132,          // 穹顶半径（可飞入的内腔）
  domeMouth: 58,       // 穹顶北门洞半角宽度（度，供检查用）
  spokeCount: 6,       // 辐条数量
  dockAngle: -90,      // 对接港所在环角度（度；-90 = -Z 方向）
  dockR: 150,          // 对接港平台半径
  beltY: -520,         // 小行星带基准高度（装饰层，props 用）
};

// 环上的一点（角度用度，0 = +X 方向，逆时针朝 +Z）
export function ringPoint(angDeg, r = ST.ringR, y = 0) {
  const a = (angDeg * Math.PI) / 180;
  return [Math.cos(a) * r, y, Math.sin(a) * r];
}

// 观景点（只追加；索引被 URL / 截图计划引用）
// 0..9 是第十五轮的远景/环站/穹顶机位，10..19 是第十六轮的悬灯画廊与四间房。
const BASE_VIEWS = [
  { name: '画中初降', en: 'ARRIVAL', pos: [150, 235, 1720], look: [0, 55, 0], fov: 52 },
  { name: '环站全景', en: 'THE RING', pos: [0, 330, 1230], look: [0, 40, 0], fov: 56 },
  { name: '环带立面', en: 'HABITAT BAND', pos: [760, 20, 240], look: [420, 0, 90], fov: 58 },
  { name: '对接港', en: 'THE DOCK', pos: [170, 60, -880], look: [0, -20, -650], fov: 60 },
  { name: '穹顶外', en: 'THE DOME', pos: [0, 250, 560], look: [0, 138, 0], fov: 58 },
  { name: '穹顶中庭', en: 'THE CATHEDRAL', pos: [0, 78, 96], look: [0, 116, 0], fov: 82 },
  { name: '鲸骨祭坛', en: 'THE WHALE CRADLE', pos: [0, 120, 86], look: [0, 110, 0], fov: 66 },
  { name: '脊柱塔顶', en: 'THE SPIRE', pos: [40, 560, 330], look: [0, 400, 0], fov: 58 },
  { name: '环下仰望', en: 'UNDER THE RING', pos: [0, -430, 640], look: [0, 0, 0], fov: 64 },
  { name: '星云远眺', en: 'THE NEBULA', pos: [-960, 250, 980], look: [0, 150, 0], fov: 50 },
];

const GALLERY_VIEWS = GAL_VIEWS.map((v) => galleryViewWorld(v));
const ROOM_VIEWS = [];
for (const R of ROOMS) {
  ROOM_VIEWS.push(roomViewWorld(R, 'in'));
  ROOM_VIEWS.push(roomViewWorld(R, 'wide'));
}

export const L = {
  views: [...BASE_VIEWS, ...GALLERY_VIEWS, ...ROOM_VIEWS],
};
