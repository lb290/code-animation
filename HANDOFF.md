# 交接 · 星鲸环「ASTRA」（2026-11-27 凌晨，第十六轮：修"一闪一闪的光污染" + 悬灯画廊四间可进入室内）

> **2026-11-27 · 第十六轮**：用户：「**读 HANDOFF.md 继续做 ASTRA。游览的时候会有一闪一闪的光污染，就像截图发给你的那样。
> 根据这几个图分别做可进入游览的精美室内（素材/图片/幻想城市/室内 下的 111530188_p0 / 68499618_p0 / 68390607_p0 / 46454797_p0）**」。
> 两张截图：①环站被一层暖金色雾蒙住（整屏泛白、星星消失）；②正常画面。施工合同：
> [03-notes/astra-round16-interiors-brief.md](03-notes/astra-round16-interiors-brief.md)（四间房的施工合同 + 坐标系 + 家规）。

## 第十六轮现状（先读这段）

- **"一闪一闪的光污染"根因是 bloom 的采样半径写错，不是内容太亮**：`src/main.js` 的 bloom 模糊把
  `uTexel` 当"屏宽比例"传给 `blur.fs`（`uTexel = 1 / 2.4`），实际偏移 ±1.38 / ±3.23 **整屏 UV**；
  纹理又是 `CLAMP_TO_EDGE` → 采样全部钳在屏幕边缘。**屏幕边缘只要有一块高亮内容（环带亮面擦过画面边缘、
  巨行星晨昏线、舷窗），它的颜色就会被"抹"满全屏**；镜头一转边缘变暗，光雾又消失 —— 正是用户看到的
  "一闪一闪"。实测：改之前 132 s 巡游里 t≈24 s 有 +0.154 的平均亮度尖峰（一帧内）；改之后全长巡游
  最大残差 **0.024**、|残差|>0.03 的帧 **0 帧**（60 s 终版构建复测同样是 0 帧）。
  - 修法（只动 ASTRA，CIELO 一个文件都没碰）：① `uTexel` 改成**真实纹素** `1/src.w`，bloom 拆成
    **两级**（半分辨率细节 + 四分之一分辨率柔光，新增 `rtBloomC`）；② `bright.fs` 把单像素 HDR
    贡献钳到 8.0；③ `bill.fs` 加**近场淡出**（按角半径 `size/dist`，镜头贴到光斑上时淡掉，
    否则 500 个光尘里总有一颗会糊满镜头）。
- **新内容「悬灯画廊 THE LANTERN GALLERY」**（`src/room-gallery.js` + `src/room-shell.js` + 4 个房间模块）：
  环带下沿、方位 **250°**（-Z 偏 -X，窗外正对巨行星；避开 270° 对接港与 6 组底部散热鳍）、
  基准半径 636 m、桥面高 y=-86（环带底面 -37 以下 49 m）。一条 **208 m 廊桥**（黄铜栏杆 / 13 盏灯柱 /
  7 根吊索吊到环带底面 + 7 根外侧斜拉索 / 中央塔直抵环带），桥外侧挂**四间 40×26×18 m 的房**：
  每间一扇 **13 m 拱门**（真开口，通向廊桥）和一扇 **30 m 落地拱窗**（真开口，正对巨行星）。
- **四间房（各自独立模块 + 独立体检，各由一名施工员完成）**：
  - `room-painter.js` **彩窗画室 28,879 tri**：青绿木作+珊瑚粉墙、8×8 彩绘玻璃灯箱、鲸鱼画架、黑猫、鱼缸、字母书架、马赛克地面。
  - `room-tearoom.js` **丝绒茶厅 41,386 tri**：猩红织金地毯+金线护墙+绿丝绒沙发、三盏黄铜烛式吊灯、三层点心架/青花茶具。
  - `room-atelier.js` **玻璃工坊 41,273 tri**：蓝白冷调、草皮+玻璃砖地面、15 m 工作台（绘图屏/蓝图卷）、5 盏玻璃圆灯、熔炉。
  - `room-study.js` **青花书房 46,009 tri**：黑白棋盘大理石、三面青花书柜墙、室内苹果树、蓝丝绒贵妃榻、飘浮书与蝴蝶。
- **数字**：画廊壳 **6,766 tri**；四间房合计 **157,547 tri**；ASTRA 静态三角 **281,212 → 445,525（+164,313，
  软上限 90 万）**；单文件 `04-output/ASTRA.html` **377.4 KB / gzip 123.8 KB**（第十五轮 190.6 KB）；
  观景点 **10 → 20**（10 悬灯画廊外观 / 11 画廊长桥 / 12–19 四间房的入门·回望）。
- **四间房的室内质量**（实拍 1280×720 平均亮度 / 过曝像素 / 参考图对照）：画室 0.354 / 8.6%、
  茶厅 0.432 / 4.1%、工坊 0.510 / 2.1%、书房 0.496 / 5.3%；参考图 0.406 / 4.4%、0.450 / 2.8%、
  0.552 / 4.6%、0.556 / 7.4% —— 都落在同一档。每间 6 盏点光、12–19 个静态光斑、77–106 组可读陈设。
- **验收（全部串行）**：`node build.mjs` → **377.4 KB**；`node tools/checkall.mjs` → **9/9 PASS**
  （ring 40 / core 8 组 / **gallery 61** / **painter 42** / **tearoom 12** / **atelier 29** / **study 12** /
  props 46 / 世界体检：静态 445,525 tri、观景点 20、四间房逐 float 确定性、门洞/窗洞射线 0 命中）；
  `node tools/mobile-check.mjs` → **17 PASS / 0 FAIL**；20 个观景点终版静帧在 `04-output/_r16/`（含拼版 contact-sheet.png）；
  终版构建 60 s 巡游复测：最大亮度残差 **0.025**、>0.03 的帧 **0**。
- **线上已发布（2026-11-27 01:45 补记）**：`056e539..f99f05f` 推送后 GitHub Pages 构建 `built`（没有像第十四轮那样 errored）；
  线上 `https://lb290.github.io/code-animation/04-output/ASTRA.html` = **386,504 B**（= 本地成品），页面里已含
  「悬灯画廊 / THE GALLERY BRIDGE」（观景点 20）；CIELO 仍是 1,086,892 B（本轮零改动）。以后发布后照旧
  用 `gh api repos/lb290/code-animation/pages` 核对 `status == built`。
- **本轮新增工具/契约**：`src/interiors-plan.js`（画廊/房间/观景点唯一尺寸真值）、`src/room-shell.js`
  （四间房共用墙/门/窗/地台/顶板/线脚）、`tools/room-gallery-check.mjs`（画廊+四间房集成体检 61 条）、
  `tools/screencast.mjs`（CDP 帧序列，用来量化"闪"）、`?only=a,b` URL 参数（只构建指定模块，房间调试用）、
  `__astra.roomWorld(key, p)` / `__astra.galleryWorld(p)`（局部坐标→世界，摆机位用）。

## 第十六轮 30 秒上手

~~~powershell
cd F:/AI/dsh/code-animation/01-source/astra
node build.mjs                     # → 04-output/ASTRA.html（377.4 KB，单文件）
node tools/checkall.mjs            # 9 项：ring / core / gallery / painter / tearoom / atelier / study / props / 世界
node tools/room-gallery-check.mjs  # 只跑集成体检：61 PASS（门洞/窗洞射线、四间房槽位、确定性）
node tools/mobile-check.mjs        # 触屏 + 桌面回归（需要 Chrome，约 4 分钟）
node tools/views.mjs               # 20 个观景点静帧 → 04-output/_r16/astra-vNN.png（需先起 serve）
# 房间作者单独调试：?only=roomPainter&view=12 / ?only=roomGallery,roomStudy&view=18
# 量"闪"：node tools/screencast.mjs --url=... --seconds=60 --out=... --key=Space@1500（Python 算每帧平均亮度残差）
~~~

机位：`?view=0..19`；`?noui` `?freeze=2` `?cam=x,y,z&look=x,y,z&fov=` `?q=low|mid|high` `?only=模块名`
`?nomod=stationRing,stationCore,spaceProps,roomGallery,roomPainter,...` `?diag`。
传送门不变：CIELO 画架 → `ASTRA.html?from=easel`；ASTRA 按 `R` → `CIELO.html?at=easel`。

## 第十六轮已知遗留 / 注意

1. **画廊在环带阴影里**：它挂在环带下沿（y=-86），主光来自另一侧 → 外立面靠自发光灯带/灯笼顶/室内窗光
   发光，白天从远处看偏"夜色中的灯笼"，这是设计；若想更亮，只改 `room-gallery.js` 的 roof/glow 材质与
   `galleryLights()`（点光 5 盏，上限 8）。**不要动 `bloomInt` 去救它**——那会把本次修好的光污染再放大。
2. **四间房没有玻璃**：引擎无透明材质（CIELO 同款限制），30 m 大窗是"真开口 + 黄铜窗棂"，天冷/下雨不负责；
   窗洞射线在体检里是 0 命中，这是有意为之。
3. **房间可以"飞穿"家具**：世界没有碰撞系统，可进入 = 门洞为真。摆件没有碰撞，别按"走不进去"设计。
4. **每间房的三角预算 12,000–52,000**（`astra-check` 与 `room-gallery-check` 都卡）：房间作者若再加内容，
   先跑 `node tools/checkall.mjs`；世界总量还差 45 万，但单间 52k 是"别把一面墙做成 2 万面"的纪律。
5. **四间房各自有 6 盏点光**：`nearestLights` 按"离相机最近 12 盏"取，站在一间房里只会选到本间的灯；
   站在廊桥上会混合 4 间房门口的灯（already fine）。全站 `ctx.points` 现在 5(画廊)+24(房间)+station 的灯，
   `astra-check` 只卡"每模块 ≤8"，没有总数上限。
6. **光污染修的是 ASTRA 的 `src/glsl/blur.fs` 用法（`uTexel` 语义）**：CIELO 的 blur 仍是旧写法（它的
   美术风格一直是"柔光弥散"，且没有本案这种边缘高亮场景），**谁要动 CIELO 的 bloom 必须重新跑
   `cielo/tools/quality-check.mjs` 与 `mobile-check` 留底**。
7. **`04-output/ASTRA.*.html`（`--as=` 分施工员构建）与 `04-output/_r16/` 静帧都不入库**（.gitignore 已覆盖）；
   入库的只有 `04-output/ASTRA.html` 与源码/文档。
8. **观景点 0–9 的索引没变**（旧 URL、旧截图计划、`mobile-check` 的 Digit5→view4 都不受影响），10–19 只在末尾追加；
   `astra-check` 现在断言 `L.views.length === 20`，加机位要同步改。
9. **PWA 仍只覆盖 CIELO**：ASTRA 没有自己的 manifest/service worker（第十五轮遗留，未变）。

---

## 交接 · 天空鲸城「CIELO」（2026-11-26 深夜，第十五轮：画中世界「星鲸环 ASTRA」—— 第二个可游览世界 + 露台画架传送门）

> **2026-11-26 · 第十五轮**：用户：「**现在天空鲸城项目文件是不是太大了，我设想是再做一个新的世界（项目），
> 「天空鲸城 CIELO」从露台的画架上的画，靠近后触发点击事件，进入新的世界。新的世界是在太空中，