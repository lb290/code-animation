// layout.js — the single source of truth for where things are in CIELO.
// Content modules read these anchors; do not hard-code world positions elsewhere.

export const L = {
  // ground / plateau
  plazaY: 0,
  cityRadius: 260,          // built-up area
  distantRadius: 620,       // distant skyline fade-out

  // THE HERO TERRACE (where the visitor starts, and where the girl stands)
  terrace: { x: 0, y: 30, z: 112, w: 96, d: 34, curve: 0.16 },
  // balustrade line of the terrace (outer edge, facing -Z toward the city)
  balustradeY: 30.0,

  // grand boulevard: runs from the terrace foot toward -Z
  boulevard: { x: 0, z0: 96, z1: -210, w: 26 },

  // central plaza with a fountain
  plaza: { x: 0, z: -46, r: 44 },

  // landmarks — round 7: every landmark is axis aligned with the street grid.
  // (The user's top-view screenshot showed the cathedral / station / glass palace
  // rotated off-grid; their rot is now exactly 0, so local +Z = world +Z.)
  cathedral: { x: -96, z: -24, rot: 0 },            // gothic, twin spires, gold clocks
  glassPalace: { x: 104, z: 44, rot: 0 },           // white steel + glass conservatory
  ferris: { x: -196, z: -132, y: 26, r: 40 },
  // round 7: the station now stands ON the ring line (track runs east-west at
  // z=-146, the station's long axis); its front faces +Z toward the boulevard.
  station: { x: 58, z: -146, rot: 0 },

  // round 10: 云上茶席 · the floating tea pavilion. A small sky island beyond the city's
  // south-west rim, high above the distant skyline: nothing else occupies this air
  // (city radius 260, radius of the anchor ≈ 360), and it reads in the left third of
  // the hero terrace view — a lit pavilion hovering in the clouds above the ferris wheel.
  tea: { x: -240, y: 128, z: -268, rot: 0 },

  // round 8: the newly built enterable landmark — the grand opera house. It stands on
  // the east side of the boulevard, facing the central plaza (main facade looks -X,
  // across the boulevard toward the cathedral). Footprint ~72 x 54 m around the anchor.
  // local +Z is the front facade (inFrame convention: local +Z -> world(-sin rot, cos rot)),
  // so rot = +PI/2 makes the main facade look -X, across the boulevard.
  opera: { x: 104, z: -58, rot: Math.PI / 2 },

  // elevated railway: viaduct deck height, and the loop the train runs on
  railY: 27.5,
  // The train loop stays in front of the terrace (z <= 66) so the viaduct never
  // cuts through the belvedere deck or the palace behind it.
  // round 7: re-planned ring line. It runs the ring streets/plazas around the old
  // town instead of cutting diagonally through blocks: a dead-straight east-west
  // platform stretch at z=-146 (the train stops inside the station, x 22..94),
  // then a sweep east and north around the glass palace, back west in front of the
  // terrace, and south past the cathedral's west flank. Every landmark keeps
  // >=12 m clearance; tools/rail-clear-check.mjs proves it.
  railLoop: [
    // round 8: the "behind the palace" loop. The train used to run on the z=64 chord
    // straight across the belvedere's sight-line; the user asked for it to pass
    // BEHIND the palace instead. The ring now keeps the station straight (z=-146),
    // sweeps down both side streets, and closes behind the palace on z=200 — so the
    // whole terrace + palace complex sits inside the ring and nothing crosses the view.
    // 113 control points sampled every ~12 m (min 5.7 m on the fillets, radius 22 m).
    // The station stretch stays dead straight; tools/rail-clear-check.mjs proves it.
    [-106, 27.5, -146], [-94, 27.5, -146], [-82.1, 27.5, -146], [-70.1, 27.5, -146],
    [-58.2, 27.5, -146], [-46.2, 27.5, -146], [-34.3, 27.5, -146], [-22.3, 27.5, -146],
    [-10.4, 27.5, -146], [1.6, 27.5, -146], [13.5, 27.5, -146], [25.5, 27.5, -146],
    [37.5, 27.5, -146], [49.4, 27.5, -146], [61.4, 27.5, -146], [73.3, 27.5, -146],
    [85.3, 27.5, -146], [97.2, 27.5, -146], [109.2, 27.5, -146], [121.1, 27.5, -146],
    [132.8, 27.5, -143.5], [143.4, 27.5, -138.1], [152.3, 27.5, -130.1], [158.7, 27.5, -120.1],
    [162.3, 27.5, -108.7], [163, 27.5, -96.8], [163, 27.5, -84.8], [163, 27.5, -72.9],
    [163, 27.5, -60.9], [163, 27.5, -49.0], [163, 27.5, -37.0], [163, 27.5, -25.1],
    [163, 27.5, -13.1], [163, 27.5, -1.2], [163, 27.5, 10.8], [163, 27.5, 22.7],
    [163, 27.5, 34.7], [163, 27.5, 46.6], [163, 27.5, 58.6], [163, 27.5, 70.5],
    [163, 27.5, 82.5], [163, 27.5, 94.4], [163, 27.5, 106.4], [163, 27.5, 118.3],
    [163, 27.5, 130.3], [163, 27.5, 142.2], [163, 27.5, 154.2], [163, 27.5, 166.1],
    [162.3, 27.5, 176.2], [160.4, 27.5, 182.2], [157.3, 27.5, 187.6], [153.1, 27.5, 192.3],
    [148.0, 27.5, 196.0], [142.3, 27.5, 198.5], [136.1, 27.5, 199.8], [121.0, 27.5, 200],
    [109.1, 27.5, 200], [97.1, 27.5, 200], [85.2, 27.5, 200], [73.2, 27.5, 200],
    [61.3, 27.5, 200], [49.3, 27.5, 200], [37.4, 27.5, 200], [25.4, 27.5, 200],
    [13.5, 27.5, 200], [1.5, 27.5, 200], [-10.4, 27.5, 200], [-22.4, 27.5, 200],
    [-34.3, 27.5, 200], [-46.3, 27.5, 200], [-58.2, 27.5, 200], [-70.2, 27.5, 200],
    [-82.1, 27.5, 200], [-94.1, 27.5, 200], [-106.0, 27.5, 200], [-118.0, 27.5, 200],
    [-126.0, 27.5, 200], [-132.2, 27.5, 199.3], [-138.2, 27.5, 197.4], [-143.6, 27.5, 194.3],
    [-148.3, 27.5, 190.1], [-152.0, 27.5, 185.0], [-154.5, 27.5, 179.3], [-155.8, 27.5, 173.1],
    [-156, 27.5, 158.1], [-156, 27.5, 146.1], [-156, 27.5, 134.2], [-156, 27.5, 122.2],
    [-156, 27.5, 110.3], [-156, 27.5, 98.3], [-156, 27.5, 86.4], [-156, 27.5, 74.4],
    [-156, 27.5, 62.5], [-156, 27.5, 50.5], [-156, 27.5, 38.6], [-156, 27.5, 26.6],
    [-156, 27.5, 14.7], [-156, 27.5, 4.8], [-156, 27.5, -7.2], [-156, 27.5, -19.1],
    [-156, 27.5, -31.1], [-156, 27.5, -43], [-156, 27.5, -55], [-156, 27.5, -66.9],
    [-156, 27.5, -78.9], [-156, 27.5, -90.9], [-155.5, 27.5, -102.8], [-152.5, 27.5, -114.3],
    [-146.9, 27.5, -124.8], [-138.9, 27.5, -133.7], [-129, 27.5, -140.4], [-117.8, 27.5, -144.6],
  ],

  // the whale: a slow patrol above the city. It is drawn 3× its local size
  // (780 m long), so it cruises high enough for its belly to clear every spire
  // and far enough out that it reads as a leviathan instead of a ceiling.
  whale: { cx: 10, cy: 420, cz: -110, radius: 340, speed: 0.0115 },

  // sun / moon directions (unit-ish; normalised by the shader)
  sunDir: [-0.42, 0.66, -0.62],
  moonDir: [-0.62, 0.60, -0.36],

  // the seven viewpoints (camera.js consumes these)
  views: [
    { name: '露台初见', pos: [4, 32.8, 90], look: [-20, 44, -200], fov: 60 },
    { name: '鲸临城上', pos: [-500, 540, 420], look: [-259, 410, -317], fov: 48 },
    { name: '大道长街', pos: [2, 3.0, 62], look: [0, 24, -150], fov: 64 },
    { name: '玻璃宫穹', pos: [105.9, 28, 62.9], look: [104, 85, 19], fov: 70 },
    { name: '高架列车', pos: [140, 55, 60], look: [163, 28, -45], fov: 60 },
    { name: '钟塔之下', pos: [-62, 6, 22], look: [-96, 78, -24], fov: 56 },
    { name: '云上鲸背', pos: [430, 700, -40], look: [-260, 420, -320], fov: 46 },
    { name: '城中俯瞰', pos: [150, 132, 210], look: [0, 20, -80], fov: 50 },
    // round 3 close-ups: the five "make these exquisite" subjects
    { name: '少女与花', pos: [0.15, 31.62, 85.1], look: [3.0, 31.22, 86.15], fov: 42 },
    { name: '空中鱼群', pos: [5.0, 37.4, 88.0], look: [19.5, 36.4, 76], fov: 52 },
    { name: '长颈鹿', pos: [-2.8, 10.5, 88.0], look: [-3.2, 4.6, 40], fov: 42 },
    { name: '气球飘动', pos: [7.6, 31.9, 90.5], look: [11.6, 34.8, 81.0], fov: 56 },
    { name: '白鸽', pos: [3.0, 40.8, 84.0], look: [9.0, 41.3, 71.0], fov: 50 },
    { name: '少女与城', pos: [6.5, 32.1, 91.6], look: [3.0, 31.05, 86.0], fov: 40 },
    // round 4: the enterable palace + the painter's corner beside the girl
    { name: '宫殿门前', pos: [0, 31.6, 98], look: [0, 44, 124], fov: 66 },
    { name: '宫殿内厅', pos: [0, 33.2, 130], look: [0, 42, 152], fov: 74 },
    { name: '宫殿穹顶', pos: [0, 32.2, 140.5], look: [0, 70, 145], fov: 84 },
    { name: '写生角', pos: [-9.0, 31.75, 95.0], look: [2.0, 31.25, 88.0], fov: 48 },
    { name: '宫殿全景', pos: [70, 48, 30], look: [-10, 46, 130], fov: 55 },
    { name: '少女与宫殿', pos: [4.6, 32.15, 83.0], look: [3.0, 31.5, 87.2], fov: 50 },
    // round 5: the palace's ground floor (city level) — the arcaded base + its hall
    { name: '宫殿基座', pos: [0, 12, 34], look: [0, 15, 94], fov: 56 },
    { name: '宫殿门厅', pos: [0, 3.8, 99], look: [0, 8, 117], fov: 84 },
    { name: '宫殿回廊', pos: [-31, 14.5, 103], look: [8, 11, 116], fov: 72 },
    { name: '宫殿回望', pos: [0, 6, 114], look: [0, 5, 92], fov: 78 },
    // round 5: the furnished rotunda (the palace's terrace-level first floor)
    { name: '宫殿王座', pos: [0, 33.4, 150.5], look: [0, 33.2, 161], fov: 60 },
    { name: '宫殿侧厅', pos: [9.5, 33.4, 138], look: [0, 34, 152], fov: 70 },
    // round 5: inside the glass palace (image 2)
    { name: '玻璃宫门廊', pos: [104.6, 4.2, 54.4], look: [105, 8, 36], fov: 62 },
    { name: '玻璃宫内厅', pos: [104, 4.2, 39], look: [104, 8, 4], fov: 72 },
    { name: '玻璃宫镜池', pos: [112, 5.5, 32], look: [94, 8, 10], fov: 72 },
    { name: '玻璃宫天窗', pos: [104, 5.5, 18], look: [105.7, 20.5, 15.9], fov: 82 },
    // round 6: the recentred glass dome + its tropical palm house (owner glass)
    { name: '玻璃宫全景', pos: [114.3, 92, 126.2], look: [104, 50, 19], fov: 62 },
    { name: '玻璃宫鼓座', pos: [82.5, 50, 76.1], look: [104, 45, 19], fov: 60 },
    { name: '温室门口', pos: [104, 24, 60], look: [104, 26, 48], fov: 60 },
    { name: '温室雨林', pos: [88.1, 23.5, 14], look: [112, 32, 26], fov: 75 },
    { name: '温室穹顶', pos: [104, 24, 26], look: [104, 48, 19], fov: 75 },
    // round 6: the two furnished palace wings (owner palace)
    { name: '王宫图书馆', pos: [29.6, 32.9, 127.5], look: [28.6, 34.2, 152], fov: 78 },
    { name: '王宫宴会厅', pos: [-29.6, 32.9, 127.5], look: [-28.6, 34.2, 152], fov: 78 },
    { name: '王宫两翼门', pos: [0, 31.5, 88], look: [0, 35, 124], fov: 100 },
    { name: '图书馆回望', pos: [29.6, 33.0, 131], look: [29.5, 33.0, 123.6], fov: 82 },
    // round 6: the tropical roof garden ring around the palm-house drum
    { name: '玻璃宫前庭', pos: [104, 40, 80.9], look: [101, 32, 39.2], fov: 62 },
    // round 7: the re-planned ring line — the train sweeps around the old town
    // round 8: the ring line now sweeps BEHIND the palace, so this view looks from the
    // inland side across the silver viaduct instead of at the old view-blocking chord.
    { name: '银轨绕宫', pos: [152, 60, 258], look: [0, 24, 190], fov: 56 },
    // round 7: the rebuilt cathedral — hollow, enterable, axis aligned
    { name: '大教堂全景', pos: [-20, 40, 40], look: [-96, 45, -40], fov: 64 },
    { name: '大教堂中殿', pos: [-96, 7, -32], look: [-96, 13, -88], fov: 74 },
    { name: '大教堂回望', pos: [-96, 12, -80], look: [-96, 30, -30], fov: 72 },
    { name: '大教堂拱顶', pos: [-96, 8, -44], look: [-96, 40, -40], fov: 84 },
    // round 7: the rebuilt station the ring line runs through
    { name: '车站正门', pos: [58, 6.5, -103], look: [58, 21, -146], fov: 62 },
    { name: '车站售票厅', pos: [58, 4.8, -133], look: [58, 10, -160], fov: 76 },
    { name: '车站列车', pos: [70, 30.5, -158], look: [24, 29, -146], fov: 72 },
    { name: '车站车棚', pos: [30, 32, -158], look: [80, 40, -146], fov: 78 },
    // round 8: the new "behind the palace" stretch of the silver viaduct and its
    // light-blue train (the train passes this spot every ~12 s).
    { name: '宫后列车', pos: [40, 33, 216], look: [-60, 29, 199], fov: 60 },
    { name: '列车过宫', pos: [110, 36, 222], look: [10, 29, 200], fov: 58 },
    // round 8: the new enterable opera house on the boulevard's east side.
    { name: '歌剧院正门', pos: [34, 15, -58], look: [95, 26, -58], fov: 56 },
    { name: '歌剧院全景', pos: [28, 18, -26], look: [96, 30, -64], fov: 58 },
    { name: '歌剧院门厅', pos: [81, 5.4, -58], look: [94, 9, -58], fov: 70 },
    { name: '歌剧院楼梯', pos: [88, 5.4, -58], look: [88, 7.5, -70], fov: 80 },
    { name: '歌剧院观众厅', pos: [102.5, 6.2, -58], look: [118, 9, -58], fov: 72 },
    { name: '歌剧院穹顶', pos: [105, 6.6, -58], look: [107, 23, -58], fov: 82 },
    { name: '歌剧院舞台', pos: [102, 8.2, -58], look: [120, 6, -58], fov: 68 },
    { name: '歌剧院沙龙', pos: [93.5, 5.6, -28.4], look: [86, 6.5, -28.4], fov: 74 },
    // round 8: the palace's first-floor rear suite (five rooms behind the entrance
    // hall). Cameras were composed and verified by the rooms module owner.
    { name: '宫殿回望套间', pos: [0, 5.0, 112], look: [0, 6.2, 126], fov: 68 },
    { name: '宫殿画廊', pos: [-34, 5.6, 130.4], look: [30, 6.4, 130.6], fov: 70 },
    { name: '宫殿大楼梯', pos: [0, 5.4, 137.8], look: [0, 9.5, 150], fov: 68 },
    { name: '宫殿冬园', pos: [0, 5.2, 156.5], look: [0, 5.6, 169], fov: 70 },
    { name: '宫殿书房', pos: [-13.5, 5.4, 139.5], look: [-30, 6.0, 156], fov: 68 },
    { name: '宫殿音乐厅', pos: [13.5, 5.4, 140.5], look: [30, 6.0, 160], fov: 68 },
    // round 9: the music salon's colourful-cosmos ceiling + the cosmic-curio exhibition wall
    { name: '宫殿宇宙顶', pos: [25.8, 4.2, 168.0], look: [25.8, 13.9, 151.0], fov: 72 },
    { name: '宫殿宇宙收藏墙', pos: [15.6, 5.6, 143.5], look: [11.6, 6.4, 158.0], fov: 72 },
    // round 9: the station platform stair wells after the "floating furniture" fix
    { name: '车站楼梯井', pos: [84, 32.2, -153], look: [72, 28.6, -158], fov: 72 },
    { name: '车站列车特写', pos: [46, 31.2, -139.2], look: [30, 30.0, -146], fov: 52 },
    // round 9: the rebuilt navy-and-brass double-decker express
    { name: '列车车头特写', pos: [-11, 30.6, 205.5], look: [-1, 29.8, 200], fov: 55 },
    // round 9: the formalised central plaza (continuous balustrade + symmetric parterres)
    { name: '中央广场俯瞰', pos: [0, 104, -38], look: [0, 0, -46], fov: 50 },
    { name: '中央广场全景', pos: [0, 150, -30], look: [0, 0, -46], fov: 50 },
    { name: '中央广场大道', pos: [0, 3.4, -6], look: [0, 5, -46], fov: 68 },
    { name: '中央广场环廊', pos: [30, 10, -80], look: [0, 4, -46], fov: 66 },
    // round 9: the fantasy sky-observatory inside the glass palace drum / dome
    { name: '玻璃宫星象台', pos: [104, 25, 42], look: [104, 78, 19], fov: 82 },
    { name: '玻璃宫浑天仪', pos: [104, 50, 34], look: [104, 76, 17], fov: 80 },
    { name: '玻璃宫观星回廊', pos: [104, 57.5, 36], look: [104, 62, 10], fov: 78 },
    // round 10: the floating tea pavilion (L.tea). The module owner refines these three;
    // they exist from the scaffold build so screenshots can target the new content.
    { name: '云上茶席', pos: [-198, 150, -228], look: [-240, 127, -266], fov: 58 },
    { name: '茶席长桌', pos: [-237.5, 130.9, -258.5], look: [-239.2, 129.4, -267.2], fov: 70 },
    { name: '镜池仰观', pos: [-224, 130.2, -259], look: [-241, 137, -267], fov: 74 },
  ],
};