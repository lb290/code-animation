// routes.js — 三条主题航线（导览巴士）/ GUIDED ROUTES for the almanac.
// Pure data + one lookup helper: no DOM, no GL, no side effects, so node can
// import it directly (tools/routes-check.mjs does exactly that).
//
// Each route is an ordered list of bus stops:
//   view  — index into L.views (src/layout.js), 0-based, 0..79
//   lore  — 'id' of an entry in LORE (src/lore.js), 31 pages
//   stay  — seconds the camera holds at the stop (10..18)
//   title — stop name shown in the "第 n / N 站 · 下一站 …" HUD
//   note  — one-line hook under the stop name (≤ 18 chars)
//
// The state machine (main.js) walks `stops`, calls cam.setView(stop.view) and
// guide.openAt(stop.lore); this file only says what to see and in what order.
//
// Notes on the viewpoint picks (see the route comments):
//   · wherever a view name matches the stop semantics it is used verbatim;
//   · the cloud-sea stop has no dedicated viewpoint — see route 'secret'.

export const ROUTES = [
  {
    id: 'architecture',
    name: '建筑朝圣',
    en: 'ARCHITECTURE',
    blurb: '沿着柱廊与穹顶，把这座城的骨架看一遍',
    // The straight architectural line: cathedral (from outside to nave), the
    // station shed, the opera auditorium, the palace rotunda, then the two
    // glass-palace set pieces (blue hall → observatory under the dome).
    // view 24「宫殿王座」is the furnished rotunda the plan calls 王宫圆厅;
    // view 27「玻璃宫内厅」is the blue hall (lore 'glasshall').
    stops: [
      { view: 41, lore: 'cathedral',   stay: 14, title: '大教堂全景',       note: '双塔与玫瑰窗钉住天际线' },
      { view: 42, lore: 'cathedral',   stay: 13, title: '大教堂中殿',       note: '束柱、彩窗、一路往上的拱' },
      { view: 48, lore: 'station',     stay: 12, title: '车站车棚',         note: '钢铁雨棚把列车罩在光里' },
      { view: 55, lore: 'opera',       stay: 15, title: '歌剧院观众厅',     note: '丝绒座位围着金色马蹄形' },
      { view: 24, lore: 'throne',      stay: 13, title: '王宫圆厅',         note: '圆厅正中一把金王座' },
      { view: 27, lore: 'glasshall',   stay: 14, title: '玻璃宫蓝色大厅',   note: '蓝玻璃把大厅泡进海水里' },
      { view: 74, lore: 'observatory', stay: 16, title: '玻璃宫星象台',     note: '抬头就是一整个黄铜星空' },
    ],
  },
  {
    id: 'wonder',
    name: '童话奇观',
    en: 'FAIRY TALE',
    blurb: '从露台的石栏一路看进夜空，七处最像童话的地方',
    // Terrace opening → the girl and her flower → koi overhead → the floating
    // tea island → the palm-house rainforest → the mirror pool → flip to night
    // for the lit city + fireworks (view 7 is the wide city overlook; the night
    // page has no arrival zone, it is unlocked by the day/night switch).
    stops: [
      { view: 0,  lore: 'belvedere',  stay: 15, title: '露台初见',     note: '石栏、气球，和整座城的开场' },
      { view: 8,  lore: 'girl',       stay: 14, title: '少女与花',     note: '她正低头看手里那朵花' },
      { view: 9,  lore: 'koi',        stay: 12, title: '空中鱼群',     note: '锦鲤在头顶慢慢游过' },
      { view: 77, lore: 'tea',        stay: 15, title: '云上茶席',     note: '云上的亭子，茶还温着' },
      { view: 33, lore: 'greenhouse', stay: 13, title: '温室雨林',     note: '棕榈叶把天光切成碎片' },
      { view: 28, lore: 'pool',       stay: 12, title: '玻璃宫镜池',   note: '水面把穹顶翻了一倍' },
      { view: 7,  lore: 'night',      stay: 16, title: '夜空白昼切换', note: '昼夜一换，灯火与烟花登场' },
    ],
  },
  {
    id: 'secret',
    name: '云端秘境',
    en: 'CLOUD SECRETS',
    blurb: '飞出城去，看鲸背、云海、银轨与漂在云上的茶席',
    // The sky line: whale over the city → down onto the whale's back → the
    // cloud-sea rim → the silver viaduct looping behind the palace → landing
    // at the tea table (view 78 is the close-up inside the pavilion).
    // No viewpoint is named 云海边缘: view 77「云上茶席」is the only camera whose
    // frame sits out in the cloud layer at the island's rim (pavilion afloat in
    // cloud, city far below), so the cloud-sea page rides on it; the closing tea
    // stop then uses the interior view 78「茶席长桌」instead of repeating 77.
    stops: [
      { view: 1,  lore: 'whale',    stay: 16, title: '鲸临城上',   note: '巨鲸驮着整座城慢慢巡过' },
      { view: 6,  lore: 'whale',    stay: 16, title: '云上鲸背',   note: '落到鲸背上，城就在脚边' },
      { view: 77, lore: 'cloudsea', stay: 15, title: '云海边缘',   note: '亭外就是云海的边，雾漫上来' },
      { view: 40, lore: 'viaduct',  stay: 14, title: '银轨绕宫',   note: '银轨从宫后绕过一整圈' },
      { view: 78, lore: 'tea',      stay: 15, title: '云上茶席',   note: '在云海上落座，喝完这杯' },
    ],
  },
];

// Lookup helper for the state machine / UI: null instead of throwing on bad ids.
export function routeById(id) {
  return ROUTES.find((r) => r.id === id) || null;
}
