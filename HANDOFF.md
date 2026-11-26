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
> 你先制作一个美丽的太空环境，做一个巨大空间站出来。如果你有更好的想法可以进行实现。**」
> 施工合同：[03-notes/cielo-round15-astra-brief.md](03-notes/cielo-round15-astra-brief.md)（§1 是"文件是不是太大"的实测答案）。

## 第十五轮现状（先读这段）

- **结论是"不塞进同一个文件，另开一个世界"**：CIELO.html 1,061.4 KB / gzip 355.8 KB、静态几何 2,163,136 tri
  （软上限 220 万，已无余量）；把太空世界塞进同一个构建会让单文件与显存一起变重、两套美术互相牵制。
  所以本轮把它做成**第二个项目** `01-source/astra/` → 独立单文件 `04-output/ASTRA.html`
  **195,206 B（190.6 KB）/ gzip 67.3 KB / 静态 281,212 tri**，只在你推门进去时才下载。
  同时**清掉 10 个过期的分施工员构建**（`CIELO.cathedral/opera/salon/rooms/station/train/plaza/orbital/lead/plaza.dev.html`，
  合计 **8.15 MB**），并把 `.gitignore` 里 `04-output/<作品>.*.html`（`--as=` 产物）设成忽略，只留正式成品与 `.dev`。
- **新世界「星鲸环 ASTRA」**（`01-source/astra/`，37 个文件 / 363 KB；**共享引擎、各自世界**）：
  `engine.js` 只读再导出 CIELO 的 `geo/lib3d/math/gl/actor/fx/touch`；本体只有自己的
  `main/world/camera/layout/palette/shaders + glsl/` 与三个内容模块。**主循环从第十三轮管线移植**
  （三档 + 自适应分辨率 + FXAA + bloom + 输出分辨率 unsharp），`lit/bill/inst/add/post` 着色器原样复制，
  **只有天空是新写的**（`space-sky.fs.glsl`）。
- **太空环境**（全解析、无贴图）：深靛紫虚空 + 三瓣星云（大云/丝状/暗尘裂谷）+ 斜贯天空的银河带 +
  **三维格点星场**（不是等距圆柱投影——上一版在天顶会出现"幕布竖纹"）+ 少数四芒亮星 + **环带巨行星**
  （气态条带 / 晨昏线暖边 / 夜面环反照 / 行星环 + 行星在环上的投影）+ 一颗小卫星 + 远处恒星与光晕。
- **环站「鲸环站 THE WHALE CRADLE」**（281,212 tri，三个模块各配纯 node 体检）：
  - `station-ring.js` **129,388 tri**：直径 1,200 m 居住环带（截面 92×74 m、96 扇区、12 道肋拱）、
    **4,512 扇舷窗**（暖金/青绿/熄灯、逐窗亮度抖动）、**可飞入的对接港**（楔形真开口 70.4×52 m + 150 m 舌台
    + 2 座导引塔 + 港内暖光机库/货箱/门式吊车）、**6 组花瓣太阳能帆**（每组 4 片错开）、散热鳍、桅杆信标、检修 greebles；
    内圈回廊 4 条连续光环 + 4 排内壁窗（第一版内圈是黑洞，看不见）。
  - `station-core.js` **128,050 tri**：中央脊柱塔（-300..+460，底部配重引擎 + 顶部灯塔）、**6 条辐条**（肋环/窗带/胶囊舱）、
    鼓座 + **24 肋玻璃穹顶**（r=132）、**北门洞 110 m 宽 × 72 m 高（真开口，门套/门柱/导向灯）**、
    可飞行中庭（r≤120、y 66..252）：星图地面、**56 m 黄铜鲸骨**（6 根吊索）、环廊 + 4 座浑天仪 + 12 串风铃 + 祭坛铜灯。
  - `space-props.js` **23,774 tri**：69 块小行星/冰屑、**3 头「星座鲸」**（401 颗星点 + 淡轮廓管，900/780/700 m，
    1200–3000 m 外）、3 艘货船（系泊/进港/远航剪影）、8 个浮标、远景姊妹站、光尘。
- **可游览**：10 个观景点（0 画中初降 / 1 环站全景 / 2 环带立面 / 3 对接港 / 4 穹顶外 / 5 穹顶中庭 /
  6 鲸骨祭坛 / 7 脊柱塔顶 / 8 环下仰望 / 9 星云远眺）、自由飞行（三档画质；触屏沿用 CIELO 的摇杆/环视/升降/菜单）、
  空格自动巡游（132 s 绕站一周）；`?from=easel` 落地即自动开画（不再要求点第二次）。
- **传送门（CIELO 侧）**：`src/portal.js`（323 行）+ `main.js`（+69 行，全带 Round 15 注释）+ `template.html`（+78 行）。
  画布世界锚点 `(-1.865, 31.24, 88.824)`、法线 `(0.8725, 0, -0.4886)`；近距 ≤5.5 m 且视线夹角 ≤25.8° → 提示 →
  点击画布 / 回车 /（触屏）轻点 → **2.4 s 坠入过渡**（dolly-in + FOV 46→26 + 白/星光扩散）→ `ASTRA.html?from=easel`；
  ASTRA 里按 `R` → `CIELO.html?at=easel`，跳过标题页直接站在画架前并 toast「你从画中归来」。
  **热点未激活时 canvas 点击仍是原来的指针锁定**（桌面零回归）。
- **验收（全部串行）**：
  - CIELO：`node build.mjs` → **1,061.4 KB**；`node tools/checkall.mjs` → **31/31 PASS**（静态三角仍 **2,163,136**）；
    `node tools/portal-check.mjs` → **34 PASS / 0 FAIL**；`node tools/mobile-check.mjs` → **PASS**。
  - ASTRA：`node build.mjs` → **190.6 KB**；`node tools/checkall.mjs` → **4/4 PASS**
    （ring 40 条 / core 8 组 / props 46 条 / 世界体检 24 条；含真门洞射线、内腔 0 顶点、两次构建逐 float 确定性）；
    `node tools/mobile-check.mjs` → **17 PASS / 0 FAIL**。
  - **端到端**：CIELO 画架前点击 → 2.4 s 后 `location.href = ASTRA.html?from=easel` → ASTRA 加载 281,212 tri、
    自动落位观景点 0；ASTRA 按 R → CIELO?at=easel 站在画架前（两条都实测，截图 `04-output/_r15/{e2e_arrive,rt_return}.png`）。
- **抄本**：第 32 页「写生角」补第三段（"画布比画面深一点…那是天空鲸的摇篮在唱歌"），源仍是 `src/lore.js`，
  32 页 / 11,202 字不变，`lore-check` PASS。

## 第十五轮 30 秒上手

~~~powershell
# 新世界（第二项目）
cd F:/AI/dsh/code-animation/01-source/astra
node build.mjs                  # → 04-output/ASTRA.html（190.6 KB，单文件，零外部请求）
node tools/checkall.mjs         # 4 项：ring / core / props / 世界体检
node tools/mobile-check.mjs     # 触屏 + 桌面回归（需要 Chrome，约 3 分钟）
node tools/views.mjs ../../../04-output/_r15/astra   # 10 个观景点静帧（需先起 serve）

# 原世界（回归）
cd F:/AI/dsh/code-animation/01-source/cielo
node build.mjs                  # → 04-output/CIELO.html（1,061.4 KB）
node tools/checkall.mjs         # 31/31
node tools/portal-check.mjs     # 34 条：画架传送门
node tools/mobile-check.mjs     # 触屏/画质/抄本/明信片 + 桌面回归
~~~

机位：`ASTRA.html?view=0..9`；`?noui` `?freeze=2` `?cam=x,y,z&look=x,y,z&fov=` `?q=low|mid|high`
`?nomod=stationRing,stationCore,spaceProps` `?diag`。传送门：`CIELO.html?cam=0.23,31.39,87.65&look=-1.86,31.24,88.82`
是画架前；`CIELO.html?at=easel` 是从画中归来的落位。

## 第十五轮已知遗留 / 注意

1. **两个世界共享引擎、各自持有着色器**：`astra/src/engine.js` 只读引用 CIELO 的 geo/lib3d/math/gl/actor/fx/touch；
   `lit/bill/inst/add/post` 在 ASTRA 是**复制件**。谁要动被共享的引擎文件，必须先跑 CIELO 的 `checkall` + `mobile-check`。
2. **长帆张线在个别机位读成"细竖线"**：太阳能帆的细张线在某些视角近乎正对相机，会在天空里画出发丝般的竖线
   （view 7 上方可见）。**不是渲染 bug** —— core 做过全量射线排查，只有 `no=world` 时消失，就是几何本身。
   要彻底消掉只能给张线加粗或改帆角（`station-ring.js` 的 `SAILS` 常量）。
3. **室内仍偏亮**：中庭已是"暖金大厅"而非白爆（core 把室内 emissive 0.10→0.062、点光 int 降到 0.45–0.80），
   但比 CIELO 室内亮一档；想更沉可先把 `astra/src/palette.js` 的 `LOOK.exposure` 1.04 降到 0.98。
4. **巨行星/星云是天空着色器不是几何**：改行星大小、环倾角、星云颜色只动 `palette.js` 的 `SKY` 与 `space-sky.fs.glsl`；
   `SKY.planetAng` 是角半径（rad），`SKY.planetAxis` 决定环的椭圆姿态。
5. **星场是三维格点**：为消掉等距圆柱投影在天顶的"幕布竖纹"改成 3D 格胞；改 `starLayer` 的 `scale` 即改密度
   （128/240/420 三层，阈值 0.982/0.975/0.962）。
6. **无音频**：ASTRA 本轮没接音频（CIELO 的 `audio.js` 是城市环境音，不适用）；要加就新写一个太空 drone。
7. **观景点只追加**：`astra/src/layout.js` 的 `L.views` 与 `astra-check` 的"观景点 10 个"断言绑定；加机位要同时改断言。
8. **PWA 只覆盖 CIELO**：ASTRA 没有自己的 manifest / service worker，靠静态目录相对链接跳转；
   装主屏幕离线玩仍只有 CIELO。要覆盖照 `cielo.webmanifest / cielo-sw.js` 再来一份（下一轮可选）。
9. **分施工员产物已忽略**：`04-output/CIELO.*.html / ASTRA.*.html`（`--as=` 构建）现在被 `.gitignore` 忽略，
   只留 `CIELO.html / ASTRA.html / CELESTIA.html` 与三份 `.dev.html`。别再把这些中间构建提交进仓库。

---

# 交接 · 天空鲸城「CIELO」（2026-11-25 深夜，第十四轮：云井塔 —— 运河上的水门塔）

> **2026-11-25 · 第十四轮**：用户：「本轮任务（Round 14 · 内容轮）：**精细制作一座新的可飞入幻想建筑（高塔型建筑，
> 内部参考 素材/图片/幻想城市/室内/74981085_p0.jpg）**」——选题不得与既有可进入建筑重复（宫殿/玻璃宫/大教堂/
> 高架车站/歌剧院/云上茶席），需写进 `layout.js` 锚点 + `city.js` 保留矩形（铁路 ≥12 m、不压街区、不挡露台视野带），
> 新模块 + `world.js` 末尾一个 tag + 自有种子，三角 8–14 万，真门洞（飞入射线 0 命中）、内部可读陈设 ≥40 件、
> 室内 albedo 0.42–0.53 / emissive ≤0.145 / 点光 ≤8，追加 3–4 个观景点、1 页抄本 + 1 条 zone、新体检并注册，
> 不许回归第十三轮画质系统。施工合同：[03-notes/cielo-round14-cloudwell-brief.md](03-notes/cielo-round14-cloudwell-brief.md)

## 第十四轮现状（先读这段）

- **新地标「云井塔 THE CLOUDWELL」**：城南大运河上、大道正南尽头的水门塔（`L.cloudwell = {x:0, z:-232, rot:0}`）。
  基座是 42×40 m 水门平台，22 m 宽运河从东西两道拱下穿过；北面 16 级大台阶接回桥头，平台吞掉了原来的 x=0 桥
  （桥栏/桥灯/桥墩落在不透明台体内，**没有删 city.js 任何几何**）。塔身 36 m 直径玻璃+黄铜幕墙（7→89 m），
  北面真门洞 9.2 m 宽（拱脚 16.4 / 拱顶 20.2）；塔内是一座**云井中庭**：地面 r=3.3 圆井（玻璃盖在水面上）+ 12 柱
  黄铜云井亭（玻璃环顶 r=2.7 井口），11 层环形回廊 20→80 m（每层 6 m，内沿 r 9.5、走道到 r 16.8），塔冠 92.4 m
  屋面 + 16 铜柱 + 浅穹顶 + r=2.4 采光洞（直通天空），南侧外挂 7.4 m 直径螺旋楼梯塔（到 84 m）。
- **数字**：新模块 `cloudwell` **65,330 tri** + `cloudwell-hall` **49,077 tri** = **114,407**（预算 8–14 万）；
  场景静态 **2,048,729 → 2,163,136 tri**（+11.4 万，软上限约 220 万）；`04-output/CIELO.html` **1,049.7 KB**；
  世界批数仍 **7 批**（新几何走既有 chunked 分批上传）；点光 +8（室内，全局取最近 12）。
- **室内质量**：门厅 9 组 + 11 层回廊每层 4–5 件 + 6 组吊灯 + 8 面绸幡，合计 **126 组可读陈设**；材质 emissive 最大
  **0.140**、室内反照率中位 **0.477**、8 盏点光按 `CW_LIGHTS` 分布 4→88 m；门厅可飞行体积内摆件全部压到 ≤1.15 m。
- **选址零回归**：平台整体落在 `city.js` 运河走廊保留区（z −248..−216）里，新增的 `RES_RECTS [0,-232,42,40,4]`
  **没有重掷任何街区**——加脚手架前后城市三角逐字节同值（2,048,729 不变）；铁路最近点 66 m（车站直线 z=−146）。
- **观景点 80 → 84**（只追加末尾）：80「云井塔」（运河西岸长焦看全塔）、81「水门大厅」（门厅仰视云井亭）、
  82「云井回廊」（第 6 层正中向上看 11 圈回廊 + 塔冠采光洞）、83「塔顶观云」（塔冠环廊向北看全城）。
- **抄本 31 → 32 页**（+1 区域「云井塔」）：文案源 `03-notes/lore-scene/group-d.json`（3 段 516 字，尺寸全部可核），
  生成物 `src/lore-scene.js` 由 `node tools/build-lore-scene.mjs` 重建；`src/lore.js` 末尾加 1 条 zone
  `{at:[0,20,-232], r:46}`。**建筑朝圣航线加第 8 站**（view 81 + lore cloudwell）。
- **体检 +1**：`tools/cloudwell-check.mjs`（三角预算 / 世界包围盒 / 8 条飞入射线 0 命中 / 5 个内部空腔 0 顶点 /
  真门洞（接近段 0 命中 + 长弦首撞 z<14.4）/ 云井通到 y≥105 / 8 点光 / 两次构建逐 float 确定性），已注册进
  `checkall`：**30 → 31 项，31/31 PASS**。
- **线上发布（2026-11-26 晚补记）**：上一晚推送后 GitHub Pages 没有更新——`6caf700` 的 Pages 构建状态是
  `errored`（Page build failed），`99f2cad` 的构建卡在 `building` 超过 20 小时，线上仍是第十三轮
  旧文件（1,010,205 B）。用 `gh api -X POST repos/lb290/code-animation/pages/builds` 手动重建 → 23 s 后
  `built`；核对线上 `04-output/CIELO.html` = **1,074,887 B**、构建戳 `2026-11-26 12:01 · 99f2cad`（UTC）。
  同时把 PWA 缓存版本升到 `cielo-v14.0-2026-11-26`，新塔进离线包。**以后发布后要核对 Pages 状态**
  （`gh api repos/lb290/code-animation/pages` 的 `status` 必须是 `built`，不能只看 push 输出）。

## 第十四轮 30 秒上手

~~~powershell
cd F:/AI/dsh/code-animation/01-source/cielo
node build.mjs                  # → 04-output/CIELO.html（1,049.7 KB，单文件）
node tools/checkall.mjs         # 31 项几何/数据体检（含 cloudwell-check）
node tools/cloudwell-check.mjs  # 只跑新塔：114,407 tri / 8 rays / 5 cavities / deterministic
node tools/mobile-check.mjs     # 触屏/画质/航线/明信片 + 桌面零回归（需 Chrome，约 4 分钟）
node tools/mem-check.mjs        # 受限堆手机模拟 + 桌面
node tools/build-lore-scene.mjs # 改抄本「景」文案后重建 src/lore-scene.js（不要手改生成物）
~~~

机位：`?view=80|81|82|83`（或按 1–0/Z X 翻）。四张留档：`04-output/cielo/_r14_v{80..83}.png`。

## 第十四轮已知遗留 / 注意

1. **楼梯塔只有外壳**：外筒 + 竖肋 + 铜箍 + 锥顶 + 顶饰做了，但 12 开间拱窗与内部螺旋踏步/中柱没做（23:20 截稿），
   从外面看偏「实心筒」。补的时候只改 `src/cloudwell.js buildTurret()`，跑 `cloudwell-check` 即可（塔体在空腔
   豁免圆柱内，不会触发 cavity 断言）。
2. **回廊第 0/1/5 层与楼梯塔咬口**：楼板在 180° 收窄处底面抬高 0.43 m、第 0 层 2.2 m 缺口两侧没有门套收边，
   极近距离可能看到细缝；不影响飞行与体检。
3. **云井亭环顶外缘 r=5.97（brief 写 6.6）**：因为 entrance-hall 空腔从 r=6.0 起算，6.6 会侵入可飞行体积；
   塔冠顶饰改成**镂空中空金冠**，否则会挡第 7 条飞入射线（(0,86,0)→(0,110,0)）。契约 `src/cloudwell-plan.js`
   已把这两处写成注释，改塔时别改回去。
4. **mem-check 与 mobile-check 必须串行**：本轮第一次把两个验收脚本同时跑，两个 headless Chrome 抢同一个
   CDP 端口，桌面堆被读成 324–339 MB（假的，门槛 300 撑爆）、mobile-check 的「新记载角标」也假失败；
   各自单独重跑 → mem-check **15 PASS / 0 FAIL**（手机受限堆 19.7 MB / 桌面 25.1 MB，5 s +160 帧）、
   mobile-check 全 PASS。脚本门槛没有放宽，只是加了注释。
5. **主视角构图**：大道尽头现在被塔挡住（设计即对景）。「露台初见」里塔在画面正中偏小，若觉得碍事可按
   「下一步」里的方案微调（不删塔）。
6. **画质系统零改动**：本轮没有改 `src/main.js` 的分辨率模型/后处理/三档/`?q=?px=?gputarget=`，
   第十三轮验收基线保持不变（手机 2×2 同色块 ≤4%、LapVar ≥200）。

---

# 交接 · 天空鲸城「CIELO」（2026-11-25 晚，第十三轮：画质系统 v2 —— 手机端「不糊了」）

> **2026-11-25 · 第十三轮**：用户：「现在手机上打开不会卡死了，但是建筑的显示效果非常粗糙，你继续优化显示效果，
> 既要流畅，又要精细分辨率高。」配图是手机横屏截图（宫殿门厅，HUD `60 FPS / 2.5 ms cpu / 2049k tris`），
> 柱子和栏杆都是 3–4 像素的大方块。
> 施工/技术记录：[03-notes/cielo-round13-quality.md](03-notes/cielo-round13-quality.md)（含**量出来的根因**、
> 方案、指标前后对比、试过并放弃的背面剔除、已知限制）。

## 第十三轮现状（先读这段）

- **根因是分辨率模型，不是内容**：旧 `resize()` 用 `canvas.width = innerWidth * W.scale`，**完全没算 `devicePixelRatio`**。
  触屏默认档 `scale=0.6` → 手机（dpr 2–3）上场景只渲染 768×349（0.27 MP）再被浏览器双线性放大 **3.3×**；
  低画质档还关掉了 FXAA；自适应只有「开局测一次、只降不升」，档位上限 0.68 → 能跑的手机也永远停在模糊档。
  `tools/quality-check.mjs` 量化：手机 相邻等值像素 **28.4%**、2×2 同色块 **11.0%**、LapVar **115.7**。
- **新分辨率模型**：输出画布按设备像素出（`outScale=min(dpr,2)`，受档位 outCap 限制，dpr≤2 时与屏幕 1:1）；
  场景内部是 `scenePx` 像素预算（三档 0.55–3.2 MP），实际尺寸 = min(预算, 输出像素)；
  预算是「意图」、可保留，转屏/拉大窗口后能自己长回去。
- **两段后处理**：composite（场景内部：FXAA + bloom + tonemap）→ 新 **upscale**（输出分辨率：
  双线性 + 4 tap unsharp + 晕影 + 颗粒 + dither）。FXAA 三档全开。放大不再交给浏览器。
- **自适应分辨率 v2**：用 `EXT_disjoint_timer_query_webgl2` 量真实 GPU ms（避开 vsync 量化），
  每 30 帧一个窗口、降快升慢（0.86× / 1.05×，冷却 3/5 窗口），目标 12.5–14.5 ms；
  最优点按档位写进 `localStorage`（`cielo.px.v2`）→ 第二次打开直接命中。
  兜底：场景预算到 `pxMin` 还超预算 → 降输出分辨率系数 `outMul`（0.62–1.0）。
- **顺手砍成本**：天空从「先全屏画再被建筑盖住」改成**实体之后画、LEQUAL 只着色深度 1.0 的像素**
  （天空 shader ~380 次噪声/像素，室内机位省 90%+）；同机位截图 **逐像素一致**（max diff 1 / mean 0.0）。
- **三档 + 交互**：流畅/均衡/精细（触屏默认**精细**，任何档位在触屏上都不开阴影）；触屏动作条新增
  **「画质」**按钮（选择持久化 `cielo.q.v1`）；桌面 `V` 键；`?q=` / `?px=` / `?gputarget=` 可强制。
- **结果（手机 4 视图均值）**：相邻等值 28.39 → **15.95%**、纹理区重复 9.41 → 2.44%、2×2 同色块
  11.01 → **3.33%**、LapVar 115.7 → **225.2**、边缘 p95 112.2 → 139.3。桌面 1:1 下 LapVar 1283.8 → 2061.5
  （锐化温和，几何/配色零变化）。三档在手机视口：流畅 2.2 MP 输出/0.95 MP 场景/LapVar 227；
  均衡 2.7 MP/1.35 MP/259；精细 **2.56×1.16 MP 输出 = 设备像素**/1.90 MP/463。
- **验收**：`checkall` **30/30 PASS**（几何未动）+ `mem-check` + `mobile-check`（新增画质断言，见
  提交信息与 STATUS 事实块）；手机/桌面 old vs new 截图在 `04-output/_r13/`、指标在 `04-output/_quality/`。
- **成本曲线**（`tools/perf-split.mjs`，headless 桌面 GPU）：`frame_ms ≈ 4.09 + 2.83·MP`（R²=0.99，
  填充率主导）；后处理 1 MP ≈ 2.5 ms 上界（bloom 0.2 ms）；输出分辨率边际 0.2–0.6 ms/MP。

## 第十三轮 30 秒上手

~~~powershell
cd F:/AI/dsh/code-animation/01-source/cielo
node build.mjs                  # → 04-output/CIELO.html（986.5 KB，单文件）
node tools/checkall.mjs         # 30 项几何/数据体检
node tools/mobile-check.mjs     # 触屏 + 画质断言 + 主题航线 + 桌面回归（需要 Chrome，约 4 分钟）
node tools/mem-check.mjs        # 内存/完整性验收（受限堆手机模拟 + 桌面）
node tools/quality-check.mjs --tag=baseline --mobile   # 图像指标（锐度/像素化/锯齿），需先起 serve
node tools/perf-split.mjs       # 渲染成本曲线（分辨率 × 世界/天空/后处理开关）
node tools/serve.mjs --host=0.0.0.0
~~~

新 URL 参数：`?q=low|mid|high`（画质档）、`?px=<像素数>`（强制场景预算）、`?gputarget=<ms>`（强制自适应目标）、
`?adaptlog`（控制台打印每次调节窗口的 gpu/预算/动作）。HUD 现在显示 `FPS / gpu ms · cpu ms / 场景 MP · 输出 MP`。

## 第十三轮已知遗留 / 注意

0. **真机验证已通过（2026-11-25 晚）**：用户在手机上实测后反馈「**手机测试效果可以**」——第十三轮画质
   系统验收通过，不再有「建筑粗糙」问题。这一轮的技术结论可以当作后续轮次的基线：
   **动渲染管线（`src/main.js` 的分辨率模型 / 后处理 / 三档）前先跑 `node tools/quality-check.mjs` 留一份指标**，
   改完再对比，别把手机上的清晰度改回去。下一轮（Round 14 · 内容轮）的开场词见
   [03-notes/round14-kickoff-prompt.md](03-notes/round14-kickoff-prompt.md)。
1. **真机帧率仍未测**：只有桌面 GPU 的 GPU ms 与拟合曲线。等 Round 14 新建筑加完，
   再在真机看右上 HUD（`FPS / gpu ms · cpu ms / 场景 MP · 输出 MP`）记录「室外杂乱机位 / 室内」两组数；
   若 `?diag` 里 `sceneEff` 明显低于 `px0`，说明该机型需要在 `src/main.js` 的 `TIERS` 里调低 `gpuMs` 或 `px0`。
2. **首次打开可能先抖 1–2 秒**：自适应收敛期（每 0.5 s 一个窗口），之后稳定；第二台次打开走
   `localStorage` 的已测最优点，抖动基本消失。
3. **放大 pass 的成本上限**：输出 2.2–3.0 MP × 5 tap 在极弱 GPU 上可能 3–10 ms；`outMul` 会兜底
   （输出降到 ~62%²），观感会退一点但不会卡死。
4. **手机默认档仍不是 1:1**：默认精细是「1.4× 上采样 + 输出锐化」；要真 1:1 得用「精细」并让
   自适应把场景预算顶到输出像素（强机型可以）。再往上要移动端几何降级（第十二轮遗留）。
5. **背面剔除不可用**：实测 winding 不一致（view 0 有 12.4% 像素差、view 40 有 28.3%，是墙上的洞），
   修 winding 等于重写全部 module 顶点顺序 —— 已放弃，开关删除，别再试。详见技术记录 §4。
6. **天空后置的深度契约**：天空顶点 z 固定 1.0（= 清屏深度）、必须在所有写深度的实体之后、透明 billboard
   之前画。以后若加「半透明但写深度」的物体，要复查这个顺序。
7. **画质档是设备级持久化**：用户选了「精细」下次打开仍精细；清 localStorage 恢复默认。开局 <30 fps
   时自动降一档（不写 localStorage）。
8. **`W.scale` 语义变了**：现在是「场景像素 / CSS 像素」，可能 >1（旧版 ≤1）。旧的脚本/文档若用
   `scale` 判断画质请改用 `__cielo.stats()` 的 `outW/outH/outPx/scenePx/sceneEff`。
9. 本轮没动任何几何/抄本/航线/明信片内容，`checkall` 30 项全过；明信片改为「把场景预算临时抬到输出像素」
   再 `readPixels`（更清晰，尺寸仍是 1440×960 卡片）。

---
# 交接 · 天空鲸城「CIELO」（2026-11-25 凌晨，第十二轮：手机崩溃（内存）修复 + 主题航线）

> **2026-11-24 23:37**：用户：「先解决两个问题，我发的图片，**1 是在手机上的 chrome 打开崩溃问题**，
> https://lb290.github.io/code-animation/04-output/CIELO.html 这个。**2 是用手机自带浏览器打开没有显示教堂，
> 火车站，大剧院**，打开的是这个地址 …。**解决之后提交推送代码，然后再按产品需要的功能迭代开发**。」
> 配图：① 安卓 Chrome 崩溃页（sad tab）；② 自带浏览器能进城市但 cathedral / station / opera 缺失。
> 施工合同：[03-notes/cielo-round12-mobile-oom-brief.md](03-notes/cielo-round12-mobile-oom-brief.md)。

## 第十二轮现状（先读这段）

- **根因是构建期内存峰值，两个现象同一个病**：桌面打开成品后 `usedJSHeapSize = 1276 MB`（安卓 Chrome renderer 堆上限通常 300–500 MB → 整页 OOM/sad tab）；`src/geo.js` 的 `B` 把顶点 push 进普通 JS number 数组 —— 205 万三角 = 6770 万个 double（542 MB）+ 610 万索引（49 MB），上传前再整块拷 Float32Array/Uint32Array（296 MB）。自带浏览器没崩到底，是因为 `world.js` 的 `tag()` 捕获模块异常后继续构建，内存耗尽时刻落在最后几个模块 → cathedral(122,824) / station(101,910) / opera(101,695) 静默缺失。复现：`--js-flags=--max-old-space-size=350` 时只有 city 模块打印完成，之后构建卡死。
- **修复（只改内存，不动内容）**：`B` 增加 `chunked` 模式（Float32Array/Uint32Array 分块 + 每块有效长度 `used[k]`）；`gl.js` 新增 `meshChunked()`（bufferData 定长 + 逐块 bufferSubData）；`world.js` 按 20 万三角预算在模块边界分批上传（本轮 **7 批**，`world.meshes`），上传后 `reset()` 复用块、构建结束 `release()`；`main.js` 主渲染/阴影 pass 遍历 `world.meshes`。
- **数字**：JS 堆 **1276 MB → 29 MB**；构建 2155 → 1551 ms；静态三角 **2,048,729 不变**；draw calls **60 → 66**；单文件 `04-output/CIELO.html` **978.0 KB**。
- **静默失败变可见**：新增 `ctx.failures`（模块构建失败 / GPU 上传 `gl.getError()` 非零），`?diag` 显示「世界批数 / 构建 ms / JS 堆 / 失败列表」，控制台同步告警。
- **开机画质探测**改为跳过前 40 帧再取 120 帧平均，且**只降不升**（触屏默认 low；自动升档会改变用户看到的画质与发热，要更高画质用 `?q=mid|high`）。
- **新体检**：`tools/geo-acc-check.mjs`（跨块时 chunked 输出与普通数组逐字节相同、`used[]` 覆盖率、`reset()` 复用一致）与 `tools/mem-check.mjs`（受限堆 350 MB 手机模拟 + 桌面，15 条断言：构建完成/无模块失败/分块生效/内容完整/堆 <300MB/帧循环/无异常）。`checkall` 现 **30 项**。
- **产品改进 B「主题航线 · 导览巴士」**（本轮推进）：`src/routes.js` 三条航线（建筑朝圣 7 站 / 童话奇观 7 站 / 云端秘境 5 站，19 站覆盖 16 个抄本页）；抄本头部「主题航线」面板 → 启程 → 相机 `cam.setView()` 逐站过渡 + 停留 12–16 s；顶部航线条显示「第 N / M 站 · 站名」，可暂停/继续/退出/读这一站；手动操作（摇杆/拖视角/WASD/观景键）在镜头稳定 2.4 s 后被判「用户接管」自动退出。`?route=architecture|wonder|secret` 可直接启程（截图/演示）。
- **验收**：`node tools/checkall.mjs` **30/30 PASS**；`node tools/mobile-check.mjs` 全 PASS（新增航线断言：启程 → 18 s 内推进到第 2 站 → 手动拖视角自动退出）；`node tools/mem-check.mjs` **15 PASS / 0 FAIL**；旧 vs 新构建同机位截图（view 0/40/70，1280×720，`?noui&freeze=2&tod=day`）**逐像素一致（max diff 0–1）**；手机模拟（`--mobile --touch --dpr=2`、`--js-flags=--max-old-space-size=200`）全量三角、21 模块、`ctx.failures=[]`、JS 堆 29.3 MB。

## 第十二轮 30 秒上手

~~~powershell
cd F:/AI/dsh/code-animation/01-source/cielo
node build.mjs                  # → 04-output/CIELO.html（978.0 KB，单文件，7 批几何）
node tools/checkall.mjs         # 30 项几何/数据体检
node tools/mobile-check.mjs     # 触屏 + 主题航线 + 桌面回归（需要 Chrome，约 4 分钟）
node tools/mem-check.mjs        # 内存/完整性验收：受限堆手机模拟 + 桌面
node tools/serve.mjs --host=0.0.0.0
~~~

URL 新增：`?batch=<tri>` 调分批上传预算（默认 200000，调试用）、`?route=architecture|wonder|secret` 直接启程主题航线（可配 `?freeze=` 截图）。

## 第十二轮已知遗留 / 注意

1. **显存没变小**：顶点缓冲仍是 2.05M tri（≈271 MB VBO + 25 MB IBO，7 个 buffer）。本轮修的是 JS 堆崩溃；若真机仍报 `CONTEXT_LOST_WEBGL`，下一步做**移动端几何降级**（从 city 776k tri 起按档减细分，不删内容）。
2. **城市单批 776,371 tri**（≈103 MB JS 峰值）：批次边界落在模块边界上，city 一个模块就超预算，所以它是单批上限。要更小只能把 city 内部再切段（需给模块加 flush 钩子）。
3. **航线条在窄屏**（`max-width:820px`）贴底显示；真机若与明信片/卡片遮挡再上移。
4. **航线站间是直线镜头过渡**（只过渡位置不做避障），会穿墙 —— 属「导览车」可接受范围；退出航线**不恢复**用户原机位（退出即停在当前站，想回去按露台/观景键）。
5. **抄本不自动打开**：原方案写「每站自动翻页」，实现改成航线条上的「读这一站」按钮（抄本是全屏面板，自动打开会挡住要看的画面）；抵达仍静默记为已显影。
6. **真机帧率仍未测**：只有 headless 相对数据（1280×720：high 17.8 ms/帧）。下一轮请真机 `?perf=1` 记录三档 × 3 观景点。
7. **lore 的 `zone.view` 有多处与观景点序号错位**（如 cathedral→43、opera→54、throne→25），航线按名字/语义配对、用 lore id 打开，不依赖 `zone.view`；下一轮若改抄本 zone 需同步复查 routes-check。

---
# 交接 · 天空鲸城「CIELO」（2026-11-24 晚，第十一轮：安卓平板 + 抄本「景」+ 沙龙星空）

> **2026-11-24 · 第十一轮**：用户：「你作为产品负责人兼技术，继续完善天空鲸城。① 提交并推送代码；② 规定好工作记录格式，为了新开会话也能知道项目情况；③ 天空鲸城需要支持安卓平板使用，局域网连接电脑访问或安卓平板独立运行都可以；④ 你再列出两个产品改进方案并推进一个。」
> 中途追加：⑤「游览中，把建筑的介绍详细……这样标准的介绍就挺好。然后才是跟这个地点有关的故事。」⑥「音乐沙龙的天花板的银河不好看。星象剧场的星空就挺好看的。」
> 施工合同：[03-notes/cielo-round11-android-brief.md](03-notes/cielo-round11-android-brief.md)；记录规范：[03-notes/worklog-format.md](03-notes/worklog-format.md)；产品方案：[03-notes/cielo-product-ideas.md](03-notes/cielo-product-ideas.md)。

## 第十一轮现状（先读这段）

- **安卓平板/手机触屏**（新模块 `src/touch.js`，只在 `html.touch` 下启用）：左半屏按住 = 模拟量摇杆（推得越远越快），右半屏拖动 = 环视（`cam.onMouse` 增益 1.65），右侧「升/降」按住升降，底部 11 个按钮（巡游 / ‹景 / 景› / 导览 / 昼夜 / 烟花 / 摄影 / 明信片 / 露台 / 帮助 / 全屏）。触屏不再请求 pointer lock；桌面端一条触摸事件都不注册。
- **移动质量档**（`src/main.js` 顶部 `TIERS`）：high（阴影开、倍率 0.55–1.0）/ mid / low（关阴影、倍率 0.40–0.68、点光 8、关 FXAA）。触屏默认 low，桌面默认 high；`?q=low|mid|high` 可强制；开局 150 帧按实测帧时间自动调一档（>40 ms 降 low，触屏 <18 ms 升 mid）。
- **PWA / 平板独立运行**：`04-output/cielo.webmanifest` + `cielo-sw.js` + `assets/pwa/icon-{192,512,maskable-512}.png`（图标是鲸背城机位渲染出来的）。GitHub Pages（https）可「添加到主屏幕」，装好后断网可开；`?sw0` 可关。局域网仍是 `node tools/serve.mjs --host=0.0.0.0`（会打印 `http://192.168.x.x:8099/CIELO.html`），http 下浏览器不允许安装/离线缓存，页面照常能玩。
- **抄本「景 → 故事」**：新增 `src/lore-scene.js`（**自动生成**，31 页 / 10,717 字，单一事实源 `03-notes/lore-scene/group-*.json`，用 `node tools/build-lore-scene.mjs` 合成）。guide.js 渲染顺序：标题/引言 → 「景 · 建筑与场景」2–4 段 → 「故事 · 记载」原有 body → 去这里。触屏抄本加了 ✕、上一页/下一页/预读全部。
- **音乐沙龙天花板**（`palace-chambers.js` `cosmosCeiling`）：撤掉 round-9 的宽半透明银河带（用户说像塑料膜），改成星象剧场 `glass-orbital.js skyChart` 的做法：880 颗小星（银河走向上密度渐增）+ 14 颗带光晕与四芒十字的亮星 + 3 组金色星座 + 2 条流星 + 用多层渐变圆盘堆的柔边星云（无硬边色带）。salon 模块 132,264 → **151,610 tri（+19,346，预算 +28,000 内）**，`salon-cosmos-check` 780/780 天花板覆盖 PASS。
- **产品改进 A「明信片工坊」**（新模块 `src/postcard.js`，本轮推进）：任意机位按 `C`（触屏「明信片」）→ 1440×960 明信片（纸边/金框/院徽/编号），画面只取 WebGL 帧缓冲不含 UI；低画质档临时抬到 1.0 倍渲染一帧再截；地名按城区锚点判断（11 片城区，阈值外「云端漫游」）；保存 PNG 或 Web Share 分享。方案 B「主题航线 · 导览巴士」写入 [03-notes/cielo-product-ideas.md](03-notes/cielo-product-ideas.md) 留待下一轮。
- **验收**：`node tools/checkall.mjs` **28/28 PASS**；新增 `node tools/mobile-check.mjs`（CDP 移动视口 + 触摸模拟：触屏层/质量档/摇杆位移/拖拽转向/抄本「景」段/明信片出片/PWA 离线缓存 + 桌面零回归，全 PASS）；单文件 `04-output/CIELO.html` **957.9 KB**；观景点 80、抄本 31 页。

## 第十一轮修订 · 真机试用反馈（2026-11-24 深夜）

用户第一次在手机上试用后提了 4 点，本轮已全部处理：

1. **「手机上的单文件少了大教堂/宫殿一层/茶席」**：同一份构建在 file:// 下实测静态三角 **2,048,729**、抄本 31 页，内容是全的——根因是拷到手机上的是旧构建（或传输不完整）。已加两样东西便于自查：标题页/帮助面板显示**构建戳**（如 2026-11-24 14:57 · 6ab0ef8），以及 `?diag` 诊断面板（构建、协议、静态三角、actor 数、观景/抄本页数、绘制次数）。打开 LAN 版/Pages 和手机版各看一眼，构建戳或三角数不一致就是旧文件。
2. **导览内容默认不显示**：抵达不再自动弹卡片，只静默记入抄本；右下 ☰ 菜单挂「新」角标（桌面是左下角「抄本 · N 条新记载」小胶囊），点开才读。旧的自动卡片行为保留为 `?cards=1`。
3. **按钮太占地方**：底部 11 键动作条默认收起，只留右下角 ☰；点开是动作条，选完自动收起。升/降键保留在右缘（飞行时要一直按）。
4. **不能边飞边转视角**：代码本来就支持双手多点触控（本轮用 CDP 双指实测：左摇杆推进 + 右半屏拖动，位移与 yaw 同时变化），实际体感差主要来自按钮遮挡与视角增益偏钝；增益已从 1.65 提到 2.4，首次进入提示改成「右手同时拖动转视角」。

**新增验收**：`tools/mobile-check.mjs` 增加「菜单默认收起 / 点 ☰ 展开 / 选完自动收起 / 无自动卡片但有新记载角标 / 双指同时移动+转向 / 桌面构建戳」断言；28/28 体检仍 PASS。
## 第十一轮 30 秒上手

~~~powershell
cd F:/AI/dsh/code-animation/01-source/cielo
node build.mjs                 # → 04-output/CIELO.html（≈958 KB，单文件）
node tools/checkall.mjs        # 28 项几何/数据体检
node tools/mobile-check.mjs    # 触屏 + 桌面回归（需要 Chrome，1–2 分钟）
node tools/serve.mjs --host=0.0.0.0   # 平板联调，会打印局域网地址
# 抄本「景」文案改动后：
node tools/build-lore-scene.mjs && node build.mjs
~~~

桌面快捷键新增 `C` 明信片；触屏：左摇杆 / 右环视 / 右侧升降 / 底部动作条。URL 新增 `?touch=0|1`、`?q=low|mid|high`、`?sw0`、`?postcard=1`。

## 第十一轮已知遗留 / 注意

1. **真机帧率没测**：只有 headless 相对数据（1280×800，`--disable-gpu-vsync`）：high ~190/167 fps、low ~350/311 fps（v0/v7），相对约 1.8×；不代表安卓平板。下一轮请在真机 `?perf=1` 记录三档 × 3 个观景点的 fps 写回本文件。
2. **PWA 图标 404 只在本地 `serve.mjs` 默认根（04-output）出现**：manifest 图标用 `../assets/pwa/` 相对路径，Pages 上正确；本地要看图标用 `node tools/mobile-check.mjs`（它用仓库根作静态根）或 `node tools/serve.mjs --root=../../..`。
3. **bars 活动条在 390 px 竖屏会横向滚动**（手机横屏/平板无此问题）；如要更完美，窄屏改成两行按钮。
4. **音乐沙龙的星云**仍是"柔和色斑"，不是纯星点；若用户还想更"星象剧场"，下一步只保留星点+星座、把 10 团星云缩到 6 团、透明度再降 30%。
5. **触摸与键盘混用**：接上蓝牙键盘后按键仍可用，触屏层不会自动隐藏（不冲突，只是按钮还在）。
6. **iOS Safari 未适配**（用户只要求安卓）；PWA 的 `orientation: landscape` 在 iOS 上部分忽略。

---
# 交接 · 天空鲸城「CIELO」（2026-11-24 凌晨，第十轮：城市导览抄本 / 云上茶席）

> **2026-11-24 · 第十轮**：用户：「你作为产品负责人兼技术。继续制作天空鲸城。你最近的几次制作我很满意，尤其是 大教堂、音乐沙龙的宇宙顶和展示柜、奇幻「云端星象台」、玻璃宫殿1层爱丽丝奇境风格。天空鲸城内主要建筑、景点、场景的介绍和故事，我希望在游览的时候可以读到，你设计一下。然后其他方面，你继续按照美丽奇幻风格去创造吧。」

## 第十轮现状（先读这段）

- **导览抄本（按 G）**：src/lore.js 31 条记载 / 9 个区域 / 30 个抵达区域；src/guide.js 负责抵达检测、卡片、抄本 UI、进度；template.html 里有卡片与抄本两套 DOM/CSS。
  - 抵达：每 0.22 s 检一次，进入 zone 半径即"显影"。卡片 9 s 自动收起，两卡之间 6.5 s 节流，期间解锁的排进队列依次补弹（不会漏，也不会连弹）。
  - 抄本：左栏按区域分组（已抵达 / 未抵达 / 新），右栏正文 + "去这里（观景点 n）"；未抵达隐藏正文，U 预读全部；进度与预读开关存在 localStorage 的 cielo.almanac.v1 键里。
  - 夜间那一页由 guide.unlockSpecial("night") 在第一次按 N 到夜晚时解锁。
  - 按键优先级：抄本打开时 main.js 的 keydown 直接吞掉所有键（相机不动）：G / Esc 收起、↑↓ / Z X 翻页、U 预读。打开抄本会 exitPointerLock()。
- **云上茶席（src/tea-pavilion.js，本轮新模块）**：L.tea = { x:-240, y:128, z:-268 }，城西南高空的一座浮空小岛（岛上 r≈22 m）：八根金柱 + 浅玻璃穹顶 + 绸幔的开放茶亭、黑白棋盘露台、长桌（茶壶/茶杯/点心架/留声机/扑克牌）、镜池、三龛记忆瓶收藏柜、捧怀表的白兔先生、岛下一圈云。观景点 78「云上茶席」/ 79「茶席长桌」/ 80「镜池仰观」。
- **场景规模**：静态 2,044,187 tri（tea +38,319）、点光 194、静态 billboard 2,113、动态 actor 47、60 draw calls；单文件 04-output/CIELO.html ≈ 872 KB（r9 797 KB）。
- **体检 28/28 PASS**：原 26 个 + 新增 lore-check（数据完整性）+ tea-check（茶席几何，模块 owner 提供）。
- **观景点 80 个**（0..79）。

## 第十轮 30 秒上手

~~~powershell
cd F:/AI/dsh/code-animation/01-source/cielo
node build.mjs                 # → 04-output/CIELO.html（≈867 KB，单文件）
node tools/serve.mjs           # http://127.0.0.1:8099
node tools/checkall.mjs        # 28 个体检
# 冻结帧截图（?freeze= 时相机过渡不会推进：新场景用 view= 或 cam= 定位）
node tools/shot.mjs --url="http://127.0.0.1:8099/CIELO.html?noui=1&freeze=2&view=77&tod=day" --w=1280 --h=720 --out=a.png --do=wait:2600 --do=shot:a.png
~~~

浏览器快捷键：G 导览抄本（新）、N 昼夜、F 烟花、P 摄影、H 帮助；URL 参数不变（?view= ?cam= ?tod= ?freeze= ?noui= ?nomod=）。

## 第十轮已知遗留 / 注意

1. **抵达半径是按观景点位置估的**：露台一带 6 条记载彼此很近，一落地就会解锁 2–3 条（靠卡片节流 + 排队保证不连弹）。想更"慢热"就把 lore.js 里这几个 zone.r 调小（当前 8–42 m）。
2. **鲸与云海两页的 zone 很大**（鲸 r=260 以观景点 2 为心；云海是岛缘 r=120），只有真的飞过去/飞到岛缘才会触发。
3. **抄本关闭后不会自动重新锁定指针**，需要点一下画面（浏览器要求用户手势）。
4. **?freeze= 下相机过渡与昼夜过渡都不推进**（既有行为）：截图新场景用 ?view= / ?cam= / ?tod=，不要依赖 setView() 动画；抵达检测在冻结帧下用固定步长 0.24，所以卡片仍会出现。
5. **云上茶席在城西南高空**（y=128），从露台看不见（被大教堂挡住），从城西的观景点只能看到轮廓——发现路径是抄本 LORE 31 + 观景点 78–80。若要让它进主视觉，需要挪 L.tea 并同步 tea-pavilion.js 里的 CITY_A（朝城方位角）。
6. **茶席室内偏高亮**：玻璃穹顶是全透光材质，白天室内几乎没有暗部（想要更沉就降 tea-pavilion.js 的 M_GLASS emissive 或加顶棚软阴影）。
7. **77 机位远处天际线有一根塔尖**会从穹顶后探出一点（不属于茶席，是 city.js 的 distant skyline）——构图时已被云挡掉大半，可接受。
8. **抄本字体依赖系统宋体**（Songti SC / Noto Serif SC / 思源宋体），Linux/Mac 上回退 Georgia；正文宽度按 1070px 设，窄屏 820px 以下左栏收起。

---
# 交接 · 天空鲸城「CIELO」（2026-11-23 深夜，第九轮：彩色宇宙音乐厅 + 宇宙收藏展墙 / 车站二层浮空修复 / 玻璃宫上层星象台 / 深藏青黄铜双层列车 / 中央广场名广场化）

> **2026-11-23 · 第九轮**：用户五条要求：
> ①「刚才做的室内房间有星空顶的那间房，星空顶做成彩色宇宙的效果，有一面墙太空荡了，做成展览区，从宇宙收集来的奇幻物品。」
> ②「火车站二层楼梯的部分，东西浮空了，是为什么？」
> ③「玻璃宫殿的最上层的里面很空旷，并且有很大空间，你做成奇幻风格。」
> ④「火车按图片效果重做，做精细 …… 一节车头，三节车厢，车厢是双层的。」
> ⑤（附图「中央广场」）「地上有一些不整齐的栏杆，不美观。你参考世界著名的广场，把中央广场做好。」
> 施工合同 `03-notes/cielo-round9-brief.md`，静帧清单 `03-notes/cielo-r9-stills.json`，制作笔记 §12。

## 第九轮现状（先读这段）

- **① 音乐沙龙（`palace-chambers.js` 的 SAL，132,264 → 147,068 tri，+14,804）**：
  `skyCeiling()` 换成分层彩色星云顶 `cosmosCeiling()`（深靛紫底 + 品红/青绿/金橙/玫瑰星云 + 银河带 + 星核爆发 + 300 颗彩色星 + 流星），
  西墙（x=x0=11.15，原空白墙）改成**宇宙收藏展墙**：底护墙 → 7 个金龛展柜（瓶中星云 / 陨星碎片 / 被俘获的彗星 /
  星鲸之牙 / 星盘浑天仪 / 月光石 / 异星植物玻璃箱）→ 檐口 → 星图画廊 → 星座饰带 → 悬挂小行星；
  每个展柜有落地基座 + 金标签牌 + 玻璃顶盖（材质系统无透明，正面留空以便看到展品）。
- **② 车站二层浮空**：根因是**站台家具与 4 根车棚柱按等差网格摆放，没有避开楼板上的两个楼梯井开口**（详见下方「为什么浮空」）。
  修法：`station.js` 新增 `platformPlan()` 单一事实源（柱子/长椅/棕榈/行李/推车/时钟/站名牌/花箱/闸机全部井感知），
  井上方柱子改为边柱 + 转移横梁，井口补石材压边 + 连续栏杆（只在楼梯到达口断开）；三角 102,106 → **101,910（−196）**。
- **③ 玻璃宫上层（新模块 `src/glass-orbital.js`，+28,870 tri）**：鼓座/穹顶内部 y 50.7..104.8 的巨大空腔做成
  **云端星象台**：中央巨型黄铜浑天仪/太阳系仪（发光星体 + 行星 + 吊索连到灯笼顶）、y≈53.4 r17.2..20 的**观星回廊**
  （栏杆/望远镜/吊灯，8 根斜拉杆落在 round-6 的 y55.6 环廊下沿）、4 座浮空岛（苔藓/小树/发光果实）、
  300 颗星 / 9 组星座金线 / 8 件吊饰 / 月牙星笼；点光仅 3 个（ORB_POINTS），其余靠 emissive + 205 个 billboard。
- **④ 列车（`rail.js`）**：深藏青近黑 + 黄铜金 · Bell Époque 蒸汽快车。车头重建锅炉/黄铜箍/金冠烟囱/汽包沙箱/
  大前灯/排障器/司机室拱窗/三大动轮+导轮+连杆/缓冲梁；**3 节双层车厢**：两排拱窗（上层更华丽）、金窗框壁柱、
  黄铜腰线、弧形车顶气窗、风挡门、转向架、夜间暖黄窗光。动态三角 5,708 → **27,558**（车头 7,620 / 车厢 6,774+6,390），
  静态 rail 54,918 不变；车宽 3.21 m（限 3.24）、车体高 6.56/6.36 m、地板=轨面+0.62≈站台 28.40；
  间距 0.73 / 1.46 m；`TRAIN_METRICS` 单一来源，`WAKE_LAG`=60.52 与末节后端面一致。
- **⑤ 中央广场（`city.js`）**：删掉旧的 8 段碎弧栏杆（R=45.4、开口与街道无关）、24 个散点花箱、16 棵散树、8 张乱朝向长椅；
  改成一圈 **R=44 连续石栏杆 + 8 根墩柱 + 4 座 boulevard pylon**，只按**真实街口**开 6 个门（x=0 南北大道、z=−14/−60 两条横街）；
  两圈对称 parterre（大理石压边 + 修剪绿篱 + 草坪 + 花带），4 座成对雕像（r=18.5，喷泉轴线两侧）、8 盏铜黑路灯、
  16 张朝喷泉长椅、32 棵同尺寸行道树、16 个石台座修剪球；铺装整体抬到 y=0.075..0.158 并用同心环 × 扇区拼贴，
  **旧横街 0.05 路缘石不再戳出**；共享 rng 精确烧 40 次（后续街区不重掷）。city 三角 +13,952（plaza stage 19,156）。
- **场景规模（1280×720 headless）**：静态 **2,005,868 tri / 60 draw calls / CPU 3.7–9.2 ms**（v70 265 FPS、v7 162 FPS，其余 180–205）；
  点光 **188**、动态 actor 47；单文件 `04-output/CIELO.html` **797.0 KB**（round8 734.4 KB）。
- **体检 26 个全 PASS**：原 21 个 + 新增 `salon-cosmos-check` / `station-stair-check` / `glass-orbital-check` /
  `train-check` / `plaza-check`（统一用 `node tools/checkall.mjs` 跑）。
  为配合新内容，改了 3 条旧断言（都有注释）：`palace-chambers-check` 模块上限 140k→175k；
  `glass-dome-check` 的「palm-house 内部净空」y 带 23..57.4→23..46、upDome 射线到 46、
  玻璃宫点光数 8→8+ORB_POINTS（=11）。
- **观景点 77 个**（0..76；本轮新增 65 宫殿宇宙顶 / 66 宫殿宇宙收藏墙 / 67 车站楼梯井 / 68 车站列车特写 /
  69 列车车头特写 / 70–73 中央广场俯瞰·全景·大道·环廊 / 74–76 玻璃宫星象台·浑天仪·观星回廊）。
- **成品静帧 88 张**（77 观景点 + 顶视日夜 / 夜景露台 / 夜景银轨 / 夜景星顶 / 夜景展墙 / 夜景广场 / 夜景星象台 /
  夜景列车 / 夜景楼梯井 / 黄昏城市），`VIEW_PLAN=03-notes/cielo-r9-stills.json`，拼贴 `python tools/sheet.py`
  → `04-output/cielo/00-contact-sheet.png`（2130×6676）。

## 为什么车站二层「浮空」（给用户的答案）

二层家具（长椅/棕榈/行李）和 4 根车棚立柱过去是按**等差网格**摆的：柱子 x=30+8i、长椅 x=34+11i、棕榈 x=38+14i、行李 x+4。
但站台楼板上挖了**两个楼梯井**（x 36.5–48.5 / 67.5–79.5，z 范围见 `WELLS`）。网格不看洞口，于是 x=38/46、70/78 的柱子
和整排长椅/棕榈/行李正好画在洞口正上方，脚下没有楼板 → 悬空；另有两排长椅 z=−162.2 / −129.8 直接落在前后墙里。
现在柱子/家具全部经 `platformPlan()` 落位：与井口留 0.6 m、只在实心板上、不进墙；井上方车棚改边柱+转移横梁；
井口做石材压边 + 连续栏杆，只在楼梯到达口留口；`station-stair-check.mjs` 在真实几何上从每个 footprint 向下打射线证明有楼板。

## 第九轮 30 秒上手

~~~powershell
cd F:/AI/dsh/code-animation/01-source/cielo
node build.mjs                        # → 04-output/CIELO.html（797.0 KB，单文件）
node tools/serve.mjs                  # http://127.0.0.1:8099（已在跑就复用）
node tools/checkall.mjs               # 26 个体检（几何，纯 node，PASS/FAIL 汇总）
$env:VIEW_PLAN='03-notes/cielo-r9-stills.json'; node tools/final-stills.mjs   # 88 张静帧
python tools/sheet.py                 # 拼贴 → 04-output/cielo/00-contact-sheet.png
# 快速看图（绝对路径；SHOT_PORT 每次换一个，避免残留 Chrome 抢端口出现黑帧）：
#   node tools/look.mjs 'F:/AI/dsh/code-animation/04-output/_tmp' 'a=40,33,216|-60,29,199|60'
# 性能（bench 已改到 window.__cielo API）：
#   node tools/bench.mjs 'http://127.0.0.1:8099/CIELO.html?noui=1' '0,4,7,40,70,74' 1280 720 2000 default
~~~

浏览器快捷键不变：**N** 昼夜（白天 → 紫金黄昏 → 星空月夜）；**F** 烟花；URL 参数 `?tod=` `?fw=` `?freeze=` `?cam=` `?look=` `?fov=` `?view=` `?nomod=`。

## 第九轮已知遗留 / 注意

1. **展柜没有正面玻璃**：渲染器材质只有 `[emissive, gloss]`、无透明；正面玻璃会整块挡住展品，所以做成「金柱 + 两侧玻璃 + 玻璃顶盖 + 开放正面」。
2. **音乐沙龙点光已到顶（18 盏）**：`palace-chambers-check` 的 10..18 断言已满；以后任何模块再给套间加灯都要同步放宽。
3. **车站站台家具数量/位置变了**：长椅 8/侧、棕榈 2/侧、行李 2/侧、推车 1/侧、花箱 5/侧（井口那格有意跳过）；时钟/闸机已挪位。
   柱子轴线不完全在原 8 m 栅格上（井两侧是转移跨），近看个别柱头托架与雨棚玻璃肋不对位（纯视觉）。
4. **`glass-dome-check` 的 3 条断言被放宽**（见上）；以后若继续往鼓座内部加东西，注意「y 23..46 净空」这条仍然有效。
5. **星象台的吊索锚在 round-6 的环廊上**（`orbitalHangers()` 的 rod 终点 = r24.2 / y54.95）；内表面半径 DRUM_RIN 26.30 /
   DOME rx29.1 ry45.4 是复制值，landmark 改尺寸必须同步 `glass-orbital.js`。
   极端仰拍 fov ≥85 时画面最上缘会露出既有穹顶灯笼缺口，机位用 fov 78–82。
6. **列车车宽只剩 15 mm 余量**（3.21 / 上限 3.24）；车头↔首车间隙 0.73 m（联轴器尺度），要放松必须同时改
   `TRAIN_METRICS.spacing.first` 与 `buildRailway` 的 `FIRST`；`buildRailway` 仍显式烧掉 192 次共享 rng（不要删）。
7. **广场 6 个门的位置由真实街道决定**：z=−14 / z=−60 两条横街相对广场中心 (−46) 不对称，所以门角不是中心对称，
   但东西镜像严格成立；横街在广场内部被抬高铺装覆盖（广场是步行平台），街口以门柱+门槛收边。
8. **广场外林荫大道的既有深度冲突未动**（boulevard 0.025/0.04 与地面 y=0 叠层）；要修就把 boulevard 铺装整体抬到 0.055+。
9. **`buildPlaza` 固定烧 40 次共享 rng**（保证下游街区不重掷）；改广场时别动这个数。城市街景其余一切照旧。
10. `0x2` 级细节：`tools/_orbdbg.mjs` 是 orbital 施工期临时脚本，可删；`04-output/CIELO.<agent>.html` 是各施工员的分文件构建，最终交付只用 `CIELO.html`。

---
# 交接 · 天空鲸城「CIELO」（2026-11-23，第八轮：铁路改到宫殿背后 / 银钢高架 / 浅蓝科幻列车 / 宫殿一层后部五套间 / 新歌剧院）

> **2026-11-23 · 第八轮**：用户给了一张红框俯视图 + 五条要求：
> ①「你把铁路按我红色标记的路线改一下，现在从宫殿前面通过会影响宫殿的视野，改成从宫殿后面过去。
>    注意把相应的建筑移动一下，不要被火车穿模。」
> ②「高架铁路改成银色钢铁结构。」③「火车改成浅蓝色科幻样式。」
> ④「宫殿1层后面还有很多空间的房间室内没有制作，你按这个路径 `F:\AI\dsh\素材\图片\幻想城市\室内`
>    挑选一些图片作为参考，制作精美的房间，可以进入游览。」
> ⑤「其他主要的建筑，你再找一个，精细制作，可以进入游览。」
> 红框四边反推成世界坐标后（x≈−145..155 / z≈−154..205），只有**南段从 z=64 挪到 z≈200** 是真正要改的，
> 其余三边与旧环线几乎重合 —— 于是只重规划南段 + 两端过渡弯；施工合同 `03-notes/cielo-round8-brief.md`，
> 静帧清单 `03-notes/cielo-r8-stills.json`，制作笔记 `03-notes/cielo-production.md` §11。

## 第八轮现状（先读这段）

- 新模块：`src/palace-chambers.js`（132,264 tri：宫殿一层后部五间可进入豪华套房）、
  `src/opera.js`（101,695 tri：新建可进入的新巴洛克歌剧院）。
- 改线：`src/layout.js` 的 `L.railLoop` 由 82 点重写为 **112 点 / 全长 1263 m**：
  车站直线 z=−146 不变 → 东侧 x=163 延伸到 z=178 → **R=30 圆角** → **南直道 z=200（宫殿后墙 z=182 之后 17.3 m，
  x 133..−126）** → R=30 圆角 → 西侧 x=−156 → 原有西北圆角回车站。最小曲率半径 30 m。
  露台+宫殿被环线整个包住；露台视野带 z 50..92 / |x|<130 内 **0 个采样点**。
- 城市：`city.js` 露台保留区扩到 `|x|≤66 / z≥52`（旧弦让出的前庭不再长楼）；新增歌剧院保留矩形
  `[99,−58,72,82,4]`（按 opera 真实包络 x 67..131 / z −94..−22 反推）；楼栋仍用 `railRectDist()<6.0` 自动退让，
  换线导致街区 rng **重掷一次**（风格/大道/广场/地标不变）。
- 银钢高架：`rail.js` 本地色板换成四级银灰 + 枕木浅灰 + 栏杆顶杆铬色；桥侧檐口下加**青色能量灯带**绕全环。
- 浅蓝科幻列车：`buildLocomotive`/`buildCarriage` 整体重写（流线圆车体 + 收尖车鼻 + 包裹式驾驶舱 + 发光窗带 +
  青色能量线 + 裙板/转向架），**蒸汽系统删除** → 车尾能量尾迹 + 车头冷色火花（解析式）；
  车间距 17.0 / 17.7 m，列车总长 ≈76 m。
- 场景规模（1280×720 headless）：静态 **1,945,898 三角 / 60 draw calls / CPU ≈0.88 ms**，build ≈2.10 s；
  点光 **182**、静止 billboard **1766**、动态 actor 47；单文件 `04-output/CIELO.html` **734.4 KB**。
- **体检 21 个全 PASS**：palace / palace-hall / palace-salon / palace-base / palace-rooms / **palace-chambers** /
  glass-hall / glass-dome / terrace-set / whale / backcity / hero / doves / fish / giraffe / balloons / night /
  **rail-clear** / cathedral / station / **opera**。
- 铁路总检 `rail-clear-check`：城市 477 栋楼到真实曲线最近 **6.36 m**；歌剧院 30.0 m / 宫殿后墙 17.3 m /
  露台+宫殿保留盒 12.0 m / 大教堂 23.8 m / 玻璃宫 20.0 m / 摩天轮 9.5 m / 广场 54 m；桥墩 ≥1.6 m；
  车站段 81 个采样点笔直误差 **0.000 m**；
  **视野带 0 点 / 宫殿背后 270 点 / 八方向射线 8/8 打到环线**（这三条是本轮新增的断言）。
- 可进入性断言：宫殿套间 5 间房中心柱 y1.2..8.0 全空、门厅中心→各房中心射线 0 命中、6 面首撞法线朝内；
  歌剧院 16 段飞入射线 0 命中、外壳 83 条射线 0 泄漏、包厢/舞台/台口 0 命中。
- 观景点 **65 个**（键 1–9 / 0 + Z/X 循环）：49 银轨绕宫 / 50 宫后列车 / 51 列车过宫 /
  52 歌剧院正门 / 53 歌剧院全景 / 54 歌剧院门厅 / 55 歌剧院楼梯 / 56 歌剧院观众厅 / 57 歌剧院穹顶 /
  58 歌剧院舞台 / 59 歌剧院沙龙 / 60 宫殿回望套间 / 61 宫殿画廊 / 62 宫殿大楼梯 / 63 宫殿冬园 /
  64 宫殿书房 / 65 宫殿音乐厅（注：数组下标 0..64，上面是"第几个"）。
- 成品静帧 **73 张**（65 观景点 + 顶视日夜 / 夜景露台 / 夜景银轨 / 夜景套间 / 夜景歌剧院大厅 / 夜景歌剧院外观 /
  黄昏城市），`VIEW_PLAN=03-notes/cielo-r8-stills.json`，拼贴 `python tools/sheet.py`。

## 第八轮 30 秒上手

~~~powershell
cd F:/AI/dsh/code-animation/01-source/cielo
node build.mjs                        # → 04-output/CIELO.html（734.4 KB，单文件）
node tools/serve.mjs                  # http://127.0.0.1:8099（已在跑就复用）
node tools/rail-clear-check.mjs       # 铁路：真实曲线距离 + 视野带/宫殿背后/包住宫殿三条新断言
node tools/palace-chambers-check.mjs  # 宫殿套间：空腔/门洞视线/包络/确定性
node tools/opera-check.mjs            # 歌剧院：飞入射线/外壳/净空/确定性
# 73 张成品静帧（PLAN 里逐张带 v/cam/tod/freeze）
$env:VIEW_PLAN='03-notes/cielo-r8-stills.json'; node tools/final-stills.mjs
python tools/sheet.py                 # 拼贴 → 04-output/cielo/00-contact-sheet.png
# 快速看图（绝对路径输出目录；SHOT_PORT 换一个避免和别的任务撞）：
#   node tools/look.mjs 'F:/AI/dsh/code-animation/04-output/_tmp' 'a=40,33,216|-60,29,199|60'
~~~

浏览器快捷键不变：**N** 昼夜（白天 → 紫金黄昏 → 星空月夜）；**F** 烟花；URL 参数 `?tod=` `?fw=` `?freeze=` `?cam=` `?look=` `?fov=` `?view=` `?nomod=`。

## 第八轮已知遗留 / 注意

1. **换线导致街区重掷**：这是挪铁路的必然后果（与第七轮同理）。风格/大道/广场/地标锚点全部不变，
   但具体楼栋与第七轮不同；露台前的 z 52..92 现在是开敞前庭（刻意留空，别再加楼挡视野）。
2. **南直道离宫殿后墙只有 17.3 m**：再往回收会撞进"北区"最后一个街区带（z 196..226），
   所以 z=200 是几何上的折中；列车通过时从露台上看不见（在宫殿背后），从空中看是"银轨绕宫"。
3. **最小曲率半径 30 m**：60 m 长列车过弯有 ~0.9 m 弦切偏移，视觉可接受；再要更顺就把 R 提到 40，
   南直道可用的 x 区间会缩短（要把两端圆角再往外挪）。
4. **银钢在顶视里很亮**：俯视图里环线偏白（银钢 + 青色灯带的代价），斜视/透视下才读出钢结构；
   若想让顶视更清楚，把 `rail.js` 的 `S_LIT` 调暗 10~15% 即可。
5. **青色能量灯带是 MT.glow 几何**：夜里靠 bloom 发光，白天是浅青线；不要把它调成全白（会过曝成白线）。
6. **列车不再是蒸汽**：没有烟柱/汽笛火星了，改成能量尾迹 + 冷色火花；`tools/bench.mjs` 里的页面 API 仍是旧 `__sky`。
7. **宫殿套间与歌剧院都是"掏空 + 内装"**：套间把台基 back mass 换成绕 void 的块体（外观不变），
   门洞契约是 `palace-base.js` 导出的 `CHAMBER_DOORS`；歌剧院是全新体量，城市保留区已按它的包络重算，
   **以后调歌剧院尺寸必须同步 `city.js` 的 `[99,−58,72,82,4]`**，否则街区会被重掷进台阶。
8. **室内亮度仍是项目基线**：套间 albedo 0.42..0.53 / emissive 0.075..0.145；歌剧院中位反照率 0.46 / p95 0.60 /
   最大 emissive 0.14。别把 emissive 抬到 0.2+。
9. **点光候选 182 个、全局只取最近 12**：套间 15 盏、歌剧院 32 盏都排在最后，远处机位里它们挤不进前 12，属预期。
10. **新增模块用自己的本地 mulberry32**（套间 0x8f31a2c7 一类 / 歌剧院 0x3a71e5d9），不消耗 world.js 共享 rng；
    `world.js` 的两个新 tag 排在最后。
11. **宫殿台基外观包围盒不变**（palace-check 的 bbox 仍是 z 95.85..182.94），套间全在内部；`palace-base.js`
   的 `BASE_METRICS` 多了一项 `chamberDoors`，旧断言未改。

---
# 交接 · 天空鲸城「CIELO」（2026-11-22 深夜，第七轮：三个地标摆正 / 大教堂可进入 / 铁路重规划 / 车站可进入）

> **2026-11-22 深夜 · 第七轮**：用户给了一张俯视夜景截图，用红框圈了三个建筑：
> ①「图片是俯视图，红色圈住的几个建筑方向不正，你给摆正了。」
> ②「把教堂制作精美，可以进入。」
> ③「铁路的路线再规划下，不要让铁路火车直接穿透建筑。图片中右上方圈出的建筑，制作精美，可以进入。」
> 逐框对角核对：左框 = **大教堂**（L.cathedral）、上框 = **车站**（L.station）、右框 = **玻璃宫**（L.glassPalace）——
> 三者原来分别 rot=0.10 / 0.40 / -0.22，本轮全部 `rot = 0` 摆正。铁路整条环线按「圆角街道环 + 真实曲线预留」重规划，
> 车站正落在环线直线段上、列车从站内穿过；大教堂与车站都重建成**可进入**的豪华室内。
> 施工合同 `03-notes/cielo-round7-brief.md`，静帧清单 `03-notes/cielo-r7-stills.json`，制作笔记 `03-notes/cielo-production.md` §10。

## 第七轮现状（先读这段）

- 新模块：`src/rail-path.js`（铁路真实曲线唯一来源 + 点到曲线/矩形到曲线距离）、
  `src/cathedral.js`（122,824 tri：掏空可进入的哥特大教堂 + 内装）、`src/station.js`（102,106 tri：环线穿过的高架车站 + 售票厅/站台/车棚）。
- 改动：`layout.js`（三地标 rot=0、`station` 移到 **(58,-146)**、`railLoop` 换成 82 点解析路径、观景点 40→49、view 4 换机位、
  玻璃宫 11 个机位按 rot=0 重算）；`city.js`（铁路走廊改测真实曲线 ≥6 m、大教堂/车站矩形保留区 `RES_RECTS`、
  `nearLandmark()` 补矩形、修掉「挤压时 dd 算了却仍用 d」和「庭院塔 margin -3 绕过保留区」两个旧 bug）；
  `rail.js`（车站范围内不落桥墩）；`arch.js`（`buildBuilding` 可选记录 `ctx.footprints`）；
  `landmark.js`（删掉旧 `buildCathedral` / `buildStation`，只留玻璃宫 + 摩天轮；共享 rng 调用数不变）；
  `world.js`（末尾挂 `cathedral` / `station` 两个 tag）。
- 场景规模（1280×720 headless）：静态 **1,819,518 三角 / 5,317,789 顶点**，build ≈1.87 s；
  夜间另有独立夜窗层 12,750 三角 / 6,363 窗；单文件 `04-output/CIELO.html` **631.0 KB**（第六轮 558.6 KB），2.2M 上限余量约 38 万。
- **体检 19 个全 PASS**：palace / palace-hall / palace-salon / palace-base / palace-rooms / glass-hall / glass-dome /
  terrace-set / whale / backcity / hero / doves / fish / giraffe / balloons / night / **rail-clear** / **cathedral** / **station**。
- 铁路总检 `rail-clear-check`：城市 498 栋楼到真实曲线最近 **6.2 m**；大教堂 23.8 m / 玻璃宫 10.8 m / 露台+王宫 28 m /
  摩天轮轮盘 9.5 m（A 架 31 m）/ 下层露台碗 5.5 m / 广场 54 m；桥墩 ≥7.4 m；车站段 111 个采样点笔直误差 **0.000 m**；
  地标保留区内 0 栋楼。
- 可进入性已断言：大教堂 29 条门洞飞入射线 0 命中、中殿/侧廊/后殿空腔 0 顶点；车站列车包络（z -150..-142、y 27..35.5、
  x 22..94）0 命中、两端 12×14.55 m 车行拱 36 条射线 0 命中、售票厅中轴 0 命中。
- 观景点 **49 个**（键 1–9 / 0 + Z/X 循环；本轮新增 45–48：车站正门 / 售票厅 / 车站列车 / 车站车棚；41–44：大教堂全景 / 中殿 / 回望 / 拱顶；
  40：列车与露台）。
- 成品静帧 **57 张**（49 观景点 + 顶视日夜 / 夜景露台 / 夜景大教堂 / 夜景中殿 / 夜景车站 / 夜景烟花 / 黄昏），
  `VIEW_PLAN=03-notes/cielo-r7-stills.json`，拼贴 `python tools/sheet.py`。

## 第七轮 30 秒上手

~~~powershell
cd F:/AI/dsh/code-animation/01-source/cielo
node build.mjs                        # → 04-output/CIELO.html（631.0 KB，单文件）
node tools/serve.mjs                  # http://127.0.0.1:8099（已在跑就复用）
node tools/rail-clear-check.mjs       # 铁路 vs 城市/地标：真实曲线距离总检
node tools/cathedral-check.mjs        # 大教堂：门洞飞入射线 / 中殿空腔 / 包围盒 / 确定性
node tools/station-check.mjs          # 车站：列车包络 / 两端拱 / 售票厅 / 确定性
node tools/palace-check.mjs && node tools/glass-hall-check.mjs && node tools/night-check.mjs
# 57 张成品静帧（PLAN 里逐张带 v/cam/tod/fw/freeze）
$env:VIEW_PLAN='03-notes/cielo-r7-stills.json'; node tools/final-stills.mjs
python tools/sheet.py                 # 拼贴 → 04-output/cielo/00-contact-sheet.png
# 快速看图（绝对路径输出目录；SHOT_PORT 换一个避免和别的任务撞）：
#   node tools/look.mjs 'F:/AI/dsh/code-animation/04-output/_tmp' 'a=-20,40,40|-96,45,-40|64'
~~~

浏览器快捷键不变：**N** 昼夜（白天 → 紫金黄昏 → 星空月夜）；**F** 烟花；URL 参数 `?tod=` `?fw=` `?freeze=` `?cam=` `?look=` `?fov=` `?view=`。

## 第七轮已知遗留 / 注意

1. **城市街区重新掷了一次骰子**：铁路走廊预留改测真实曲线后 `freeSpace()` 的通过/拒绝变了，
   街区建筑的随机序列跟着变——风格/网格/大道/广场不变，但具体楼栋与第六轮不同。这是移动铁路的必然后果。
2. **顶视图里三栋楼已摆正**：大教堂/车站/玻璃宫 rot=0；但玻璃宫机位与内装世界坐标是按旧 rot 换算来的，
   以后再加玻璃宫机位请直接按 rot=0 世界坐标算（不要再套 frameMap 的旧符号）。
3. **铁路最小曲率半径 ≈31 m**（东北角）：60 m 长的列车过弯时车厢有 ~1.4 m 弦切偏移，视觉可接受；
   若要更顺，把 `layout.js railLoop` 第 36~40 点（x≈158~163 / z 34~56 那段）往外挪 3~5 m。
4. **北段 z=64 从露台前掠过**：这是绕开下层露台「碗」（z 71..78.6）与露台崖壁的必然结果，
   观景点 0「露台初见」前景会看到高架桥（刻意保留的构图，列车偶尔从眼前过）。
5. **车站车棚玻璃仍是不透明着色玻璃**（项目全局限制）：室内靠两端车行拱与站台层视角读出，
   拱内已加内层玻璃/内肋/端部钢桁架。
6. **车站前庭大台阶到 z=-106**（属 site 元素，超出建筑 footprint，但在 `city.js` 保留区 x18..98/z-168..-99 内）；
   车站建筑本体严格在 x[22.05,93.95] / z[-165.95,-126.02] / y≤56。
7. **车站站台边缘故意退 0.02 m**（z=-150.02/-141.98）以让整个列车包络盒全空；站台与桥面之间约 0.7 m 设备缝是刻意的。
8. **大教堂门平面在世界 z=-24**（立面塔楼 9 m 厚，穿过塔楼才是中殿；中殿 world z -33..-97，地面 y 0.8、拱顶 y 46）。
9. **室内偏亮仍是项目基线**：新两馆靠 albedo 0.42~0.50 + emissive 0.105~0.115 + 暖点光（大教堂 7 / 车站 8）+ 烛光 billboard。
   别把 emissive 抬到 0.2+，会白到读不出细节。
10. **点光候选更多了**：全局仍只有最近 12 个生效；大教堂/车站的点光在远处机位排不进去，属预期。
11. **新增文件都用自己的本地 mulberry32**（大教堂 0x7cad3d1、车站 0x57a7104e）；world.js 共享 rng 序列未被平移。
    `landmark.js` 里 3 处共享 rng 调用位置/次数不变。
12. `tools/bench.mjs` 里的页面 API 还是旧的 `__sky`，现在是 `window.__cielo`（本轮没修工具，量性能用 shot.mjs eval）。

---
# 交接 · 天空鲸城「CIELO」（2026-11-22 夜，第六轮：玻璃宫归中+热带温室 / 王宫两翼豪华厅 / 昼夜+夜灯+烟花）

> **2026-11-22 夜 · 第六轮**：按用户三条反馈做：
> ①「玻璃宫殿的圆顶有一部分伸出来悬空了，你把它移动到建筑的中心，把玻璃宫殿圆顶做精细豪华，
>    做成植物园热带温室的效果」；
> ②「王宫的宫殿还有一些房间空着，你把那些房间都制作精美可以进入游览」；
> ③「增加白天黑夜的切换，夜晚灯光效果，可以控制放烟花，鲸鱼城市也加上夜晚灯光效果」。
> 本轮把玻璃宫的鼓座/穹顶**归中**（原来整个上体量压在台基前缘、向街面悬挑 30 m），穹顶做成金肋水晶风格，
> 鼓座内部做成**可进入的热带温室**（16 樘开敞拱窗 + 室内雨林 + 台基顶热带花园环）；
> 把王宫两翼的**实心空房间**掏空成两间可飞入的豪华厅（东翼皇家图书馆、西翼大宴会厅），
> 正面各开 7.6 m 拱门；新增**三档昼夜切换**（紫金黄昏 / 星空月夜）、**城市+鲸背城夜灯**、
> **可控烟花**（F 键连发，夜晚自动）。观景点 **30 → 40**，成品静帧 **50 张**（40 日景 + 9 夜/烟花 + 黄昏）。
> 施工合同 `03-notes/cielo-round6-brief.md`，静帧清单 `03-notes/cielo-r6-stills.json`，
> 制作笔记 `03-notes/cielo-production.md` §9。

## 第六轮现状（先读这段）

- 新模块：`src/glass-greenhouse.js`（热带温室 + 台基顶热带花园，~90k tri）、`src/palace-rooms.js`（两厅内装 124,260 tri）、
  `src/daynight.js`（三档调色 + 3 s 过渡）、`src/night-lights.js`（城市夜窗层）、`src/fireworks.js`（解析式烟花）。
- 改动：`src/landmark.js` buildGlassPalace（鼓座/穹顶/灯塔/尖顶/螺旋梯归中 local z=-25 + 16 樘开敞 loggia + 穹顶金肋 +
  台基顶花园）；`src/palace.js`（两翼实心体量→外壳 + 正面拱门 + 调用 palace-rooms）；`src/terrace-set.js` 宫前花箱拆短让门；
  `src/main.js`（昼夜合成、夜窗层、烟花系统、N/F 键、太阳眩光改动态）；`src/palette.js`/glsl（uNight 系列）；
  `src/arch.js`（窗位收集）；`src/whale.js`/`whale-city.js`（鲸背城灯 22→120）；`template.html`（HUD/帮助/加载页）；
  `layout.js` 观景点 30→40；`final-stills.mjs` 支持逐张 PLAN（`VIEW_PLAN`）。
- 场景规模（1280×720 headless）：静态 **1,533,910 三角 / 60 draw calls（夜间 61）/ CPU ≈0.4–0.7 ms**；
  夜间另有独立夜窗层 **12,750 三角（6,103 窗）/ +1 draw call**；build ≈1.7 s；
  单文件 `04-output/CIELO.html` **558.6 KB**（第五轮 468.2 KB），2.2M 上限余量约 66 万。
- **体检 16 个全 PASS**：palace / palace-hall / palace-salon / palace-base / **palace-rooms** / glass-hall /
  **glass-dome** / terrace-set / whale / backcity / hero / doves / fish / giraffe / balloons / **night**。
- 可进入性已断言：玻璃宫温室门廊→鼓座大门→温室内中轴/跨天窗脊/仰视穹顶 0 面；王宫两厅四向入口射线 0 命中、空腔无残留。
- 观景点 **40 个**（键 1–9 / 0 + Z/X 循环）：
  0 露台初见 / 1 鲸临城上 / 2 大道长街 / 3 玻璃宫穹 / 4 高架列车 / 5 钟塔之下 / 6 云上鲸背 /
  7 城中俯瞰 / 8 少女与花 / 9 空中鱼群 / 10 长颈鹿 / 11 气球飘动 / 12 白鸽 / 13 少女与城 /
  14 宫殿门前 / 15 宫殿内厅 / 16 宫殿穹顶 / 17 写生角 / 18 宫殿全景 / 19 少女与宫殿 /
  20 宫殿基座 / 21 宫殿门厅 / 22 宫殿回廊 / 23 宫殿回望 / 24 宫殿王座 / 25 宫殿侧厅 /
  26 玻璃宫门廊 / 27 玻璃宫内厅 / 28 玻璃宫镜池 / 29 玻璃宫天窗 /
  **30 玻璃宫全景 / 31 玻璃宫鼓座 / 32 温室门口 / 33 温室雨林 / 34 温室穹顶 /
  35 王宫图书馆 / 36 王宫宴会厅 / 37 王宫两翼门 / 38 图书馆回望 / 39 玻璃宫前庭**。

## 第六轮 30 秒上手

~~~powershell
cd F:/AI/dsh/code-animation/01-source/cielo
node build.mjs                        # → 04-output/CIELO.html（558.6 KB，单文件）
node tools/serve.mjs                  # http://127.0.0.1:8099（已在跑就复用）
node tools/glass-dome-check.mjs       # 玻璃宫：归中/悬挑/温室净空/确定性
node tools/palace-rooms-check.mjs     # 王宫两厅：空腔/门洞射线/三角/确定性
node tools/night-check.mjs            # 昼夜调色/夜窗/烟花解析式/确定性
node tools/palace-check.mjs && node tools/glass-hall-check.mjs && node tools/terrace-set-check.mjs
# 50 张成品静帧（40 日景 + 9 夜景 + 黄昏；PLAN 里逐张带 tod/fw/freeze）
$env:VIEW_PLAN='03-notes/cielo-r6-stills.json'; node tools/final-stills.mjs
python tools/sheet.py                 # 拼贴 → 04-output/cielo/00-contact-sheet.png
# 快速看图（绝对路径输出目录；SHOT_PORT 换一个避免和别的任务撞）：
#   node tools/look.mjs 'F:/AI/dsh/code-animation/04-output/_tmp' 'a=4,33,90|-20,55,-200|62'
~~~

浏览器新按键：**N** 昼夜（白天 → 紫金黄昏 → 星空月夜，3 s 平滑过渡）；**F** 放烟花（一按连发 2~3 发，
夜晚每 6~12 s 自动一发）。URL 参数：`?tod=day|dusk|night`（定档）、`?fw=N`（预置 N 发，静帧用）、
`?fw=0`（完全关闭烟花）、`?freeze=N`（冻结时间，夜窗/烟花逐像素可复现）。

## 第六轮已知遗留 / 注意

1. **穹顶前后檐口各 2.45 m 是对称悬挑**：穹顶 r30 > 台基半深 25，归中后前后各 2.45 m 出檐（视觉上是檐口，
   不再是原来临街 30 m 的悬空）。若想收到 0，需要把穹顶 r 缩到 ≤27.5，会改标志轮廓——留作可选。
2. **玻璃穹顶/鼓座玻璃仍是"不透明着色玻璃"**（没有 alpha 混合）：温室效果靠 16 樘开敞 loggia + 台基顶浓密热带花园
   从外面读出来。要真正透明需要给 lit pass 加透明通道（排序/深度），本轮没做。
3. **螺旋梯踏步底面是白色平板**：个别低机位（如 view 3 仰视、view 39 前庭）会看到梯板从绿带里伸出来，
   不是新几何 bug；要更美需给踏步加金托架/雕花。
4. **室内偏亮仍是项目基线**：室内没有真实光照通道；新两厅靠 albedo 0.68~0.94 + emissive 0.10~0.14 + 暖点光；
   别把 emissive 抬到 0.2+，会白到读不出书架/挂毯细节。
5. **点光候选 114 个、只有最近 12 个生效**：新温室 8 盏、两厅各 7 盏，远处机位里它们排不进最近 12，属预期。
6. **夜间阴影关闭**（shadowOn=0）：夜景靠月光 + 自发光；白天逻辑与第五轮逐像素一致（C 已做同日对照）。
7. **烟花尺寸旋钮**：`src/fireworks.js` 的 `FW_LIMITS.sparkSize`（现 2.8 → 火花 2.5~4.3 世界单位）；
   不要单独放大 gSize 爆闪，会糊成星云。
8. **夜窗数量自适应**：城市窗户 17,610 个，超过 12,000 上限时按 stride 抽样（现 stride 2 → 6,103 窗）。
   以后再加城市窗户，夜景亮度会自动均摊，不会爆三角/预算。
9. **landmark 的 `wp` 已改为 inFrame 约定**（第五轮遗留的 frameMap 符号相反问题本轮一并修掉）；
   老工具 `glass-hall-check` 的 `toL` 仍是旧约定（只用于宽松 bbox 断言，未改别人的工具）。
10. **新增文件都用自己的本地 mulberry32**：不消耗 world.js 共享 rng；landmark/palace 的共享 rng 调用次数不变
    （glass 92 次、palace 0 次），所以第六轮没有平移任何旧模块的随机序列。

---

# 交接 · 天空鲸城「CIELO」（2026-11-22 傍晚，第五轮：宫殿 1 层豪华门厅 + 玻璃宫内装）

> **2026-11-22 傍晚 · 第五轮**：按用户反馈「继续改进天空鲸城。把宫殿的1层做豪华，可以进入游览
> （图1：宫殿下方大片空白挡土墙）」+「把图二的建筑（玻璃宫）做豪华，可以进入游览，
> 参考图3的内饰（深蓝+金、星空彩绘拱顶、黑白棋盘地面、金框怪兔画、拱门外绿色温室、漂浮扑克/茶杯）」，
> 做了两座**真能走进去的豪华室内**：
> ① **宫殿基座层（城市标高 y=0）**：台基掏空成 80×26×22.7 m 的入口大厅，从大道经挡土墙原有大拱门飞入；
>    城市面新增豪华基座立面（巨柱拱廊 / 壁龛雕像 / 大台阶 / 红旗 / 灯柱），内厅有棋盘大理石、金柱拱廊、
>    3 层金格天窗、11.6 m 环廊 + 两侧 45 级大楼梯、后墙 4.4 m 雕像、中央喷泉、5 组吊灯。
> ② **玻璃宫（图2）**：台基由实心块改成壳 + 真门洞 + 敞开金门 + 台基顶玻璃天窗脊；内装是参考图风格的
>    **蓝金奇幻温室大厅**：黑白棋盘地面、镀金拱廊、深蓝+紫粉星云+620 金星的彩绘拱顶、中央玻璃天窗井、
>    青绿温室拱窗、12 幅金框怪奇画（兔/猫/风景）、8 座兔雕像、8 盏烛台吊灯、漂浮扑克与茶杯、镜池莲花喷泉。
> ③ **露台层圆厅 1F 豪华化**：王座+华盖、红金地毯、天鹅绒家具、金框画/镜、蓝织锦、6 盏吊灯、入口金门侍卫。
> 观景点 **20 → 30**；点光名额 8 → 12。施工合同 `03-notes/cielo-round5-brief.md`，
> 制作笔记 `03-notes/cielo-production.md` §8。

## 第五轮现状（先读这段）

- 新模块：`src/palace-base.js`（67,196 tri）、`src/palace-salon.js`（66,056 tri）、
  `src/glass-hall.js`（82,241 tri）、`src/palace-forecourt.js`（lead，5,095 tri）。
- 改动：`src/palace.js` buildPodium（台基挖空 + 门洞）；`src/landmark.js` buildGlassPalace
  （台基壳 + 门洞 + 金门 + 天窗脊，外观其余未动，+1,350 tri）；`src/main.js` + `glsl/lit.fs.glsl` /
  `glsl/whale.fs.glsl` 点光 8→12；`src/world.js` 末尾追加 4 个 tag；`src/layout.js` 观景点 20→30；
  `template.html` 加载页提示；`tools/final-stills.mjs` 0..29。
- 场景规模（1280×720 headless）：静态 **1,298,865 三角 / 59 draw calls / CPU 0.47 ms**；build 1.37 s；
  单文件 `04-output/CIELO.html` **468.2 KB**（第四轮 362.3 KB）。2.2M 上限余量约 90 万。
- 可进入性已断言：宫殿基座 (0,2,60)→(0,3,96)→(0,4,101) 0 遮挡；玻璃宫 local (0,3,6)→(0,4,-10)→(0,5,-30) 0 面；
  抬头天窗视线、后墙绿色温室拱门视线均 0 面。
- 观景点 30 个（键 1–9 / 0 + Z/X 循环）：
  0 露台初见 / 1 鲸临城上 / 2 大道长街 / 3 玻璃宫穹 / 4 高架列车 / 5 钟塔之下 / 6 云上鲸背 /
  7 城中俯瞰 / 8 少女与花 / 9 空中鱼群 / 10 长颈鹿 / 11 气球飘动 / 12 白鸽 / 13 少女与城 /
  14 宫殿门前 / 15 宫殿内厅 / 16 宫殿穹顶 / 17 写生角 / 18 宫殿全景 / 19 少女与宫殿 /
  **20 宫殿基座 / 21 宫殿门厅 / 22 宫殿回廊 / 23 宫殿回望 / 24 宫殿王座 / 25 宫殿侧厅 /
  26 玻璃宫门廊 / 27 玻璃宫内厅 / 28 玻璃宫镜池 / 29 玻璃宫天窗**。

## 第五轮 30 秒上手

~~~powershell
cd F:/AI/dsh/code-animation/01-source/cielo
node build.mjs                       # → 04-output/CIELO.html（468.2 KB，单文件）
node tools/serve.mjs                 # http://127.0.0.1:8099（已在跑就复用）
node tools/palace-base-check.mjs     # 基座立面 + 门厅：三角/bbox/门洞净空/确定性
node tools/palace-salon-check.mjs    # 圆厅陈设：三角/中心保护/彩窗净空/确定性
node tools/glass-hall-check.mjs      # 玻璃宫内装：三角/门洞净空/天窗/飞入射线/确定性
node tools/final-stills.mjs          # 30 个观景点静帧 → python tools/sheet.py 拼贴
# 任意机位快速看图（注意输出目录给绝对路径）：
#   node tools/look.mjs 'F:/AI/dsh/code-animation/04-output/_tmp' 'a=0,4,99|0,8,117|84'
~~~

## 第五轮已知遗留 / 注意

1. **室内必然偏亮**：lit.fs 的 key light 对朝上面照加光，室内没有真实光照通道；新室内全部靠
   albedo 0.42~0.62 + emissive ≤0.135 + 点光/烛光 billboard 压住，别把 emissive 调回 0.17+，会白到看不清细节。
2. **点光 95 个、只取最近 12 个**：深室（宫殿门厅 26 m、玻璃宫内厅 46 m）远端只靠自发光；加灯要顺着动线放。
3. **玻璃宫 inFrame rotY 与 landmark frameMap 符号相反**：glass-hall 用 inFrame 约定
   （local X→(cos,0,sin)）；后续往内厅加点光/家具别混用公式，否则整体偏 ~5 m。
4. **台基挖空是"块体重拼"**：palace.js buildPodium 现在由侧块/后块/顶板/前墙 5 块组成，
   改尺寸要同步 `PAL.base.hall` 与 palace-base.js 的墙位（内墙比空腔缩 0.2 m 防闪面）。
5. **挡土墙前不可贴面**：新立面全部在 z≤92.2，与 z=92.6 的墙留 0.25 m；改立面别越过 92.28。
6. **玻璃宫天窗脊有 14 m 在鼓座投影里**：正立面看不到（只有侧后/空中），这是原图布局（穹顶压台基前缘）。
7. **漂浮扑克/茶杯是静态几何**：想要动感要改成 actor（可缓慢升降/自转）。
8. **新模块 rng 全部本地 mulberry32**：不消耗 world.js 的共享 rng，加模块请继续保持；
   world.js 里新 tag 依旧排在最后。
9. **静帧 freeze=9**：花瓣 billboard 在 freeze=3 时可能贴镜头；重拍用 `VIEW_Q="freeze=9"`。

---

# 交接 · 天空鲸城「CIELO」（2026-11-22 下午，第四轮：可进入的欧式宫殿 + 少女写生角）

> **2026-11-22 下午 · 第四轮**：按用户反馈「女孩所在的平台和楼房，做成立体的，能进入的豪华建筑，
> 欧式宫殿；女孩旁边有画架、圆桌椅，地上有植物」，把原来 z=124 那道 **4.6 m 厚的扁平宫殿墙**
> 换成一座**真正能飞进去的宫殿**：30 m 石砌台基 + 6 柱门廊 + 三角山花 + 蓝石板穹顶（开放采光洞）
> + 两翼曼萨德 + 两端角楼 + **直径 30 m 的圆厅内装**（12 柱柱廊 / 壁龛雕像 / 鼓座高窗 / 藻井穹顶 /
> 地面大理石拼花 / 后龛彩窗 / 金色吊灯）；少女旁边加了**画架（带画布/颜料箱/调色板）、欧式圆桌椅、
> 盆栽/花池/宫殿前花箱**。观景点扩到 **20 个**（新增：宫殿门前 / 宫殿内厅 / 宫殿穹顶 / 写生角 /
> 宫殿全景 / 少女与宫殿）。施工契约在 `src/palace-plan.js`，制作笔记见 `03-notes/cielo-production.md` §7。

## 第四轮现状（先读这段）

- 新模块（4 个）：
  - `src/palace-plan.js`（lead 写，**契约**：PAL 尺寸表 + PC 色板 + PM 材质 + pAt/pBox/palaceFrame/YAW）
  - `src/palace.js`（81,528 tri，导出 `buildPalace`）：台基 / 中央主体 / 真开洞大门+筒拱隧道 /
      6 柱门廊+山花 / 两翼+曼萨德 / 端楼 / 鼓座+穹顶（顶部开放采光洞）/ 圆厅结构壳
  - `src/palace-hall.js`（35,025 tri，`buildPalaceHall`）：圆厅内装（12 柱、檐部、10 壁龛+雕像/镜板、
      12 樘鼓座高窗、内穹顶藻井、地面拼花、后龛彩窗、吊灯、室内 10 盏点光）
  - `src/terrace-set.js`（27,834 tri，`buildTerraceSet`）：画架+画布+颜料箱/调色板/笔筒、圆桌+3 椅+
      茶具/画册/烛台、观赏树/盆花/花池/宫殿前两条长花箱
  - 工具：`tools/palace-check.mjs`、`palace-hall-check.mjs`、`terrace-set-check.mjs`、`look.mjs`（任意机位快速出图）
- 集成改动：`world.js` 末尾新增 3 个 tag（palace / palaceHall / terraceSet，放在最后，避免改变
  既有 city/hero/life 的 rng 序列）；`terrace.js` 删除旧 `buildFacade`（未调用的死代码一并清掉）；
  `city.js` 的保留区扩大为 x±60 / z 86..188（不再有街区穿进宫殿）；`life.js` 花瓣 z 上限收到 122
  （不让花瓣飘进圆厅）；`layout.js` 观景点 14 → 20；`final-stills.mjs` 拍 0..19。
- 场景规模（1600×900 headless / 1280×720 CPU 实测）：静态 **1,076,855 三角 / 317.4 万顶点 / 59 draw calls /
  CPU 0.70 ms**；build 1.28 s；单文件 `04-output/CIELO.html` **362.3 KB**（第三轮 277.7 KB）。
- 观景点 20 个（键 1–9 / 0 + Z/X 循环）：
  0 露台初见 / 1 鲸临城上 / 2 大道长街 / 3 玻璃宫穹 / 4 高架列车 / 5 钟塔之下 / 6 云上鲸背 /
  7 城中俯瞰 / 8 少女与花 / 9 空中鱼群 / 10 长颈鹿 / 11 气球飘动 / 12 白鸽 / 13 少女与城 /
  **14 宫殿门前 / 15 宫殿内厅 / 16 宫殿穹顶 / 17 写生角 / 18 宫殿全景 / 19 少女与宫殿**。
- 「能进入」是真的：露台 y=30 从 z=110 沿 +Z 直飞，穿大门（x±4.6、起拱 43.5、顶点 48.1 的筒拱隧道）
  进入圆厅；palace-check 用两条中心线射线 + 净空盒断言保证。圆厅顶部采光洞、后龛彩窗都能看到天空/光。

## 第四轮 30 秒上手

~~~powershell
cd F:/AI/dsh/code-animation/01-source/cielo
node build.mjs                     # → 04-output/CIELO.html（362.3 KB，单文件）
node tools/serve.mjs               # http://127.0.0.1:8099（注意：本项目的 serve 默认 8099 端口已在跑就复用）
node tools/palace-check.mjs        # 宫殿外观：面数/包围盒/门洞净空/大厅空腔/射线/确定性
node tools/palace-hall-check.mjs   # 圆厅：半径包络/采光洞净空/拼花半径/灯光数量/确定性
node tools/terrace-set-check.mjs   # 写生角：面数/包围盒/避让少女黑猫/确定性
node tools/final-stills.mjs        # 20 个观景点静帧 → python tools/sheet.py 拼贴
# 任意机位快速看图（不写 final-stills）：
#   node tools/look.mjs 04-output/_tmp "name=camX,camY,camZ|lookX,lookY,lookZ|fov"
~~~

## 第四轮已知遗留 / 注意（改之前看）

1. **宫殿正面是背光面**（太阳在 +Z，宫殿朝 -Z）：外观靠 `PM.*` 的自发光 lift + 门廊前 6 盏暖色
   `ctx.points` 提亮；改材质时别把 emissive 改成 0，否则整面墙会变成蓝灰剪影。
2. **门厅是真筒拱**（起拱 43.5 / 顶点 48.1）：palace-check 的顶点净空盒压到 y<43.4 + 中心线射线，
   不是「x±4.4/y31..46 全空」——因为半圆拱在 |x|=4.4 处拱面就是 44.84。想改平顶要同时改顶棚/肩角板。
3. **圆厅内装全在 r≤15.25 内**（palace-hall）；后龛彩窗在 z≈164.36（契约指定，单独豁免包络）。
   内壁/门洞/后龛口径由 palace.js 与 palace-hall.js 互锁，改任一侧要两边一起改。
4. **点光只有 8 个名额**（main.js nearestLights 取相机附近 8 个）：宫殿门廊补光 / 圆厅室内灯都靠
   这个名额，室内机位能看到，远处看不到——这是预期行为。
5. **花瓣/花雨是动态 billboard**：z 已限制在 52..122，但某个 freeze 时刻仍可能有花瓣贴着相机
   （静帧会看到一个很大的粉色椭圆）。拍静帧时换一个 freeze 值即可（final-stills 支持 `VIEW_Q="freeze=9"`）。
6. **侧视机位 (88,40,150) 会被城市 north-quarter 的楼挡住**（城市保留区只到 x±60）；干净侧视用
   `(100,52,205)→(30,42,138)` 或观景点 18（宫殿全景）。
7. **下层露台托座那只白色「碗」**（terrace.js buildLowerTerrace，z≈78.6）不是宫殿几何，低机位会看到。
8. 新模块的 rng 顺序：palace/palaceHall/terraceSet 都排在 world.js 最后，**新增模块请继续往后排**，
   否则会平移 hero/life 的随机数（第三轮的坑，见下）。

---

## 第三轮（历史）

> **2026-11-22**：按用户反馈「把鸽子、空中的鱼群、女孩、长颈鹿做精细，气球要飘动」，
> 重写了四个生灵模块和少女，并把栏杆气球做成真的钟摆动画。场景规模仍是一张静态世界 mesh
> （93.4 万三角）+ 46 个动态 actor（鱼 4 / 鸽 3 / 长颈鹿 16 / 气球 10 / 列车 5 / 摩天轮 2 / 鲸 5 / 飞艇）。
> 新增 6 个观景点（共 14 个）、视频逐帧工具与一版展示片。第三轮详情见 `05-daily/2026-11-22.md`。

- **少女 / 白鸽 / 空中鱼群 / 长颈鹿 / 气球**五个模块已拆分：
  `src/hero.js`、`src/creatures-doves.js`、`src/creatures-fish.js`、`src/creatures-giraffe.js`、
  `src/props-balloons.js`，由 `life.js` 统一调用。每个模块有独立 node 几何体检（`tools/*-check.mjs`）。
- 实例 shader `inst.vs.glsl` 支持三种形变 mode：0 鸟翼、1 鱼尾行波、2 布料慢飘；
  `InstActor.set(i, mt, phase, sway, alpha, mode)` 第 6 参是 mode。
- 观景点 14 个（`layout.js` L.views）：0–7 旧景，8 少女与花、9 空中鱼群、10 长颈鹿、11 气球飘动、
  12 白鸽、13 少女与城。键盘 1–9 / 0 + Z/X 循环。
- 展示片：`04-output/CIELO_天空巡礼.mp4`；相机路径 `03-notes/cielo-r3-video-path.json`；
  逐帧工具 `tools/capture.mjs`（forceTime + 路径 JSON），配乐工程 `.anyaudio/projects/prj_w9xatkb2`。

## 30 秒上手（第三轮版）

~~~powershell
cd F:/AI/dsh/code-animation/01-source/cielo
node build.mjs                 # → 04-output/CIELO.html（278 KB，单文件）
node tools/serve.mjs           # http://127.0.0.1:8099
node tools/final-stills.mjs F:/AI/dsh/code-animation/04-output/cielo/view   # 14 张静帧
node tools/hero-check.mjs && node tools/doves-check.mjs && node tools/fish-check.mjs
node tools/giraffe-check.mjs && node tools/balloons-check.mjs
~~~

第三轮新增/重要文件：
- `src/creatures-doves.js`、`creatures-fish.js`、`creatures-giraffe.js`、`props-balloons.js`
- `src/hero.js`（重写，16.8k tris）、`src/life.js`（拆分后的装配）
- `tools/capture.mjs`、`tools/final-stills.mjs`（14 机位）、五个 `*-check.mjs`
- `03-notes/cielo-round3-brief.md`（给子代理的契约）、`03-notes/cielo-r3-video-path.json`、
  `03-notes/cielo-r3-score.json`（配乐）

---

# 交接 · 天空鲸城「CIELO」（2026-11-21，第二轮：鲸鱼重做）

> **2026-11-21 下午第二轮**：按用户四条反馈（城堡太靠后 / 城堡下有块大圆盘土地 /
> 鲸鱼要放大好几倍、背上应该是另一个城市、角色城市只是众多鲸城之一 / 鲸鱼要更像更精细）
> 重做了整头巨鲸与它背上的城市。和「天空之城 · 灯祭」（CELESTIA）共用同一套自研单文件
> WebGL2 引擎思路，但美术、世界、内容模块全部重写。
> 参考图：`F:/AI/dsh/素材/图片/幻想城市/整体原图.png`（+ 建筑/、空中巨大鲸鱼/、高架铁轨火车/ 三组子图）。

## 30 秒上手

~~~powershell
cd F:/AI/dsh/code-animation/01-source/cielo
node build.mjs              # → 04-output/CIELO.html（单文件，双击离线可开）
node build.mjs --dev        # → 04-output/CIELO.dev.html（真实行号）
node tools/serve.mjs        # http://127.0.0.1:8111
node tools/whale-check.mjs  # 鲸 + 鲸背城市几何体检（面数/包围盒/NaN/栈泄漏/确定性）
node tools/backcity-check.mjs  # 鲸背城市单独体检（面数/占地/穿模/确定性）
VIEW_Q="freeze=8" node tools/final-stills.mjs 04-output/cielo/view   # 拍 8 个观景点
~~~

浏览器快捷键：WASD 飞行 / 鼠标 环视 / QE 升降 / Shift 加速 / 空格 自动巡游（108 s 一圈）/
1–8 观景点 / P 摄影模式 / H 帮助 / M 声音。

## 一句话现状

一座**浮在云海上的白金石造欧陆幻想都市**：30 m 高的弧形大理石露台（少女与黑猫在此）俯瞰
8 万面的城市 —— 120 m 哥特双塔金钟、125 m 白钢玻璃穹顶宫、钢桁架高架蒸汽列车、摩天轮、
广场喷泉、运河。**头顶巡游的是一头 780 m 的浮空巨鲸（局部 260 m × 世界 3 倍放大）**，
**背上驮着一座 236 m 长的人类尺度要塞城市**（73 m 哥特双塔大教堂、25 栋街区、城墙城门、
喷泉广场、花园），鲸背城市在鲸鱼局部空间里以 1:1 米制建造再缩进去；
**远空还有 4 头同样驮着城市的鲸** —— 角色所在的城只是众多鲸城之一。

## 2026-11-21 第二轮做了什么（鲸鱼重做）

| 用户反馈 | 做法 | 落点 |
|---|---|---|
| 城堡太靠后 | 城市整体前移到鲸背**前段**（局部 z≈0…+87，鼻子在 +130），从鲸头方向能看到正门；城中心 z=43 | `whale.js` `CITY_Z/CITY_Y`；`whale-city.js` 内部轴向布局 |
| 城堡下面的大圆盘 | 删掉旧 `ellipsoid` 圆盘地基，改成**贴合鲸背弧度的岩台**：石砌挡土墙（三段岩层）+ 岩石露头 + 藤蔓 + 外圈**鲸皮起隆**（蓝色皮肤鼓起来托住城市），台地只比城市大 1 m 左右 | `whale.js` `backShelf()` |
| 鲸鱼放大好几倍 | 局部 260 m → 世界 **780 m 长 / ~150 m 高**，腹部约 300 m 离地；巡游半径 340、高度 420，相机上限抬到 y≤1150，巡游样条能飞到鲸背高度 | `whale.js` `S=3.0`；`layout.js` `L.whale`；`camera.js` clamp + `TOUR` |
| 背上应该是另一个城市 | 新建 `src/whale-city.js`：**哥特双塔大教堂**（73 m、玫瑰窗、飞扶壁、金十字）+ 25 栋街区 + 城墙/城门/塔楼 + 喷泉广场 + 花园树木，约 **3.9 万三角形**；正面 +Z 朝鲸头 | `whale-city.js` `buildBackCity(b, rng, opts)` |
| 众多鲸鱼城市 | 远空加 **4 头鲸背城市**（低模剪影 + 尖塔群，各约 3 千面，不同轨道/高度/大小） | `whale.js` `POD` / `buildPodWhale()` |
| 鲸鱼要更像、更精细 | 重写躯体：钝头大嘴、宽阔背台、18 道**真实喉褶几何**、双喷气孔、眼睛、藤壶/旧疤；长胸鳍（bezier 弯叶）、**带缺口的宽尾鳍**（下垂）、后置钩状背鳍；深靛蓝背→钴蓝→水线青→近白腹的分色 + 纵向肌理；**专用着色器** wrap 主光 + 云层反弹光（俯视时腹部不塌成剪影） | `whale.js` `KEYS/surf/bodyColor/buildBody/buildFins/buildFlukes`；`src/glsl/whale.fs.glsl`；`main.js` 的 `whale` program |

## 目录（详表见 03-notes/cielo-production.md）

~~~text
01-source/cielo/src/
  main.js        渲染主循环（阴影→天空→静态 mesh→actor→billboard→加法→bloom→FXAA/调色）
  world.js       世界组装（每模块 try/catch，坏了只 warn 不黑屏）
  layout.js      唯一锚点表（露台/大道/广场/教堂/玻璃宫/摩天轮/车站/高架环线/鲸鱼巡游/观景点）
  palette.js     日系动画日间调色板 + LOOK（光照/雾/曝光/调色/辉光）
  geo.js lib3d.js actor.js fx.js audio.js camera.js shaders.js glsl/
  arch.js city.js         Beaux-Arts 建筑生成器 + 城市街区
  landmark.js             哥特钟楼 / 玻璃宫 / 摩天轮 / 车站
  whale.js                780 m 巨鲸（躯体/鳍/尾/鲸背岩台/远空鲸群）+ 鲸背城市装配
  whale-city.js           鲸背上的城市（大教堂/街区/城墙/广场/花园；真实米制、y=0 平地）
  rail.js                 高架 + 蒸汽机车
  terrace.js hero.js      露台雕花栏杆 / 少女 + 黑猫
  life.js                 锦鲤/白鸽/长颈鹿/气球/彩纸/飞艇/藤蔓
  glsl/whale.fs.glsl      巨鲸专用片元着色器（wrap light + 云层反弹 + 取消自阴影）
~~~

## 硬约束 / 坑（改之前必读）

1. **b.push() 必须 16 个 float**（末位 1），否则变换栈 NaN、之后所有几何消失（geo.js 会 warn 并修）。
2. **每个 push 必须配对 pop**（鲸背城市 2322/2322 已对齐；`whale-check.mjs` 会断言 stackDepth=1）。
3. **billboard pass 必须传 uProj/uView**（曾经漏过，导致所有云/气球/蒸汽不可见）。
4. **主光 sunDir.z 必须为正**（来自主视角背后）：城市立面朝 +Z，反了整城变蓝灰阴面。
5. 反照率保持 0.45–0.85（线性），纯白会过曝；阴影面用蓝紫（uShadowTint），不要压黑。
6. 顶点/索引必须来自同一个 B；instanced actor 的 capacity ≥ fill 返回数。
7. shot.mjs 不要放进管道（| tail / | head 会静默不截图）；用 --gpu=default。
8. 所有随机走传入的 rng（mulberry32），禁止 Math.random。
9. 三角面上限 2.2M（当前静态世界 ~92 万 + 动态鲸 ~7 万）。
10. **颜色参数不能传材质数组**：`b.quad(...)` 写成三角形却留 4 个点会把 `MT.stone`（[0,0.1]）当颜色，
    片元会变成荧光带。`geo.js` 现在会兜底成灰色并打印调用栈 —— 见到 `[geo] bad colour` 就按栈去修。
11. **鲸背城市的米制**：城市按真实米制（|x|≤63、z∈[-120,120]、y≤74）建在 y=0 平地，
    由 `whale.js` 用 `scale(CITY_CS/S)` 缩进鲸鱼局部空间；`CITY_CS=1.12`。改城市尺寸要同步
    改 `CITY_HX/CITY_HZ`（岩台轮廓）与 `whale-check` 期望值。
12. **巨鲸不能采样阴影图**：780 m 的躯体在 2048² shadow 覆盖外会自遮蔽出一道硬边横贯腹部，
    `whale.fs.glsl` 里已直接 `return 1.0`（形体靠 wrap light）。

## 已知遗留

- 鲸鱼在近距离仍是**风格化塑形**：喉褶在 100 m 内能看出是几何脊，再近会露出低模棱线；
  胸鳍从正下方看会变成细长条（鳍面近似竖直），这是当前朝向的取舍。
- 鲸背台地与城市底座之间仍有约 1 m 的缝（岩台/藤蔓遮住大半）；城市外轮廓是八边形倒角，
  岩台是圆弧超椭圆，四个斜角偶尔能看到直线边。
- 鲸背城市从正上方看**屋顶偏暗**（板岩顶背光），若想更像参考图（夜景暖灯）需要单独一套夜光。
- 远处 4 头鲸主要靠剪影，雾里偏淡；想更显眼要再抬高度/加轮廓光。
- 城中城的 `city.js` 里 `buildBlocks` 仍有一条 `mansard()` 山花的历史 bug 已修（`arch.js:316` quad→tri），
  但其他模块没逐行审过颜色参数。
- 少女 4.5k tris 略超预算；正面脸可读性有限。

---
---

# 交接 · 天空之城「鱼灯」

> **最后更新：2026-11-20 23:55（第二轮「建筑精细化 + 环街夜市」收尾后）**
> 新会话先读这一页。项目结构、命令、红线、坑、下一步都在这里，**不要重头摸**。

---

## 0. 五分钟上手（开工检查单）

```powershell
cd F:\AI\dsh\code-animation\01-source\skycity
node build.mjs                          # → 04-output/CELESTIA.html（现 145.0 KB）
node tools/buildings-check.mjs          # 建筑三档 LOD —— 必须 PASS
node tools/stack-check.mjs              # 变换栈泄漏 —— 必须 PASS
node tools/street-check.mjs             # 街市预算/占道 —— 必须 PASS
node tools/serve.mjs                    # http://127.0.0.1:8099 （可能已在跑，直接复用）
```

看画面最快的三种方式：
1. **街景**：`http://127.0.0.1:8099/CELESTIA.html?view=1&noui=1`（键盘 2 也是它）
2. **单栋建筑**：`?lab=1&angle=38&dist=15&eye=3.2&floors=2&detail=2`（`?lab=1` 是这一轮加的实验室）
3. **成品图**：`node tools/final-stills.mjs` + `python tools/sheet.py`（约 3 分钟）

**动手前先读**（按顺序）：
1. 本页 §5 的硬约束（尤其 transform stack / 核心体内缩 / 零法线 / 确定性随机）
2. `03-notes/building-spec.md` §9「实施对照」——规格里哪些做了、哪些故意没做
3. `03-notes/skycity-production.md` §3.7「建筑精细化与街市」——这一轮的实现内幕

---

## 1. 一句话现状

`04-output/CELESTIA.html`（单文件 WebGL2 场景，**145.0 KB / 148,432 字节**，双击离线可用）
是一座可自由飞行的云海灯祭小镇。**第二轮（2026-11-20 晚）完成**：

1. **建筑精细化（用户明确要求）**：24 栋盒子町屋 → **71 栋程序化仿古木构**：半木构核心体、
   深檐 + 椽头阵列、二层挑台 + 朱漆栏杆、格子窗 / 虫笼窗（暖纸自发光）、腰檐、暖帘、
   横竖招牌、幡旗、山墙博风板 + 悬鱼、曲面瓦顶 + 瓦垄 + 鬼瓦；三档建模 LOD（hero 3.7k / mid 1.26k / far 184 面）。
2. **环街夜市**：`town.js` 把 71 栋按「内排朝外 + 外排朝内」排成 5 m 宽的环街，主景弧高模、
   背排补天际线、环外稀疏远景排补整圈；石板街面贴合岛面。`street.js` 铺 12 屋台 / 9 道跨街灯串 /
   7 幡 / 4 竖招牌 / 5 布雨棚 / 21 件零碎。
3. **修掉三个真 bug**（详见 §9 与生产笔记 §3.7）：
   - `torii()` 变换栈泄漏 → 鸟居之后**所有几何**被叠加变换带走，整座小镇被移走
     （这是「街景相机里看不到房子」的根因）；
   - 挑台层的 2F 窗纸藏进核心体里 → 核心体内缩改为 `d-1.0`；
   - 退化三角形零法线 → 光照 NaN → 屏幕纯黑大方块。
4. 附带：建筑/灯柱/幡改为**贴合岛面高度**（新 `terrain.js`）；view 1 机位移进环街；
   新增 `?lab=1` 建筑实验室与三个常态化体检工具。

**下一件大事见 §10 第 1 条。**

---

## 2. 交付物在哪

| 文件 | 说明 |
|---|---|
| `04-output/CELESTIA.html` | **主交付**：单文件场景，**145.0 KB**，双击打开、离线可用（file:// 已实测） |
| `04-output/CELESTIA.dev.html` | 未压缩调试版（**232 KB**，232 KB 是未压缩 JS 的体积，正常） |
| `04-output/skycity/01…08.png` | 8 个观景点 1600×900 静帧（2026-11-20 22:47 由最终构建重拍） |
| `04-output/skycity/09-fish-hero.png` / `10-fish-detail.png` | 鱼灯近景 / 纸面特写 |
| `04-output/skycity/00-contact-sheet.png` | 8 图拼贴（1970×570） |
| `04-output/skycity/_look/` | 本轮 look-dev 过程图 72 张（**不是成品**，可随时整目录删） |

---

## 3. 参考与文档地图

| 文件 | 什么时候读 |
|---|---|
| `03-notes/building-spec.md` | **改建筑先读**。1 间 = 2.0 m 模数、构件尺寸表、色板 Y 值、三档面数预算、10 条静帧验收判据、§9 实施对照 |
| `03-notes/skycity-production.md` | 场景总制作笔记。§3.3 鱼灯、§3.6 性能诊断、**§3.7 建筑精细化与街市** |
| `03-notes/perf-skycity-2026-11-20.md` | 主循环性能报告 + 第二轮复测附录 |
| `05-daily/2026-11-20.md` | 当天两轮工作的流水（第二轮在文末） |
| `03-notes/lumina-skycity-study.md` / `abyssal-garden-study.md` | 更早的空间母题 / 单文件工程范式参考 |
| 参考图 `F:\AI\dsh\素材\图片\38986652_p0.jpg` | 金鱼提灯 + 夜景灯祭木构街（建筑/纸面/鳍的美术来源） |

---

## 4. 代码地图（这一轮新增 / 改动）

```
01-source/skycity/
  src/buildings.js   ★新增 21 KB  buildMachiya(b, ctx, rng, opts)：参数化町屋（1–3 层 / 挑台 / 三档 LOD）
  src/street.js      ★新增 31 KB  buildStreetFestival(b, ctx, rng, o)：屋台/灯串/幡/竖招牌/雨棚/零碎
                            （子代理写；顶部有 K 别名层：新色名优先、旧色名/rgb() 兜底，可留可清）
  src/town.js        ★新增 6.5 KB buildTown(b, ctx, rng)：环街布局（内排/外排/back row/稀疏远景排/
                            转角楼/石板街），并 try/catch 包住 street 模块——street 抛错只 warn，不会黑屏
  src/terrain.js     ★新增 0.9 KB islandY() / mainIslandY()：岛面高度函数（world.js 与 town.js 共用）
  src/geo.js         ★改    + bar3 / fretGrid / railing / dougong / eaveRoof / roofGable 六个建筑原语；
                             roofGable 支持 gableCol/bargeCol/ornamentCol；tri() 零长法线回落 [0,1,0]
  src/world.js       ★改    buildTown 接入（旧 house()/stall() 已删）；岛面高度改用 terrain.js；
                             rim 灯柱/幡落地；岛心环法线显式朝上；**torii() 补第 3 个 pop**
  src/main.js        ★改    ?lab=1 建筑实验室；?no=static|world|fall|bb|cloud|puff|halo|bloom 调试开关；
                             bloom 阈值 0.88→1.02
  src/shaders.js     ★改    LIT_FS 零法线安全阀（黑方块修复）
  src/palette.js     ★改    + 14 个 machiya 色（timberDark/tileSlate/paperWindow/goldLeaf/vermilion…）
  src/camera.js      ★改    view 1「灯市」机位 = (33,4.0,32) look (7,6.5,44) fov 62（原来的 r≈52 在建筑体内）
  tools/buildings-check.mjs ★新增 三档 LOD 面数 / 包围盒 / 非有限 / 零法线 / 预算
  tools/stack-check.mjs     ★新增 变换栈泄漏（构建后打印仍挂着的 push 调用栈）
  tools/street-check.mjs    ★新增 街市预算 / 占道 / 确定性（子代理）
```

数据流一句话：`buildWorld(gl)`（world.js）里按序拼 island → 台地 → 塔/钟楼/鸟居 → **buildTown()（建筑 + 街市 + 石板街）**
→ 桥/灯串/瀑布/云团，全部累进同一个 `B` builder，最后 `b.build()` 上传成**一张静态 mesh**（单 draw call）。
街市里的灯笼/点光在建筑内部用 `b.tp()` 转成世界坐标后写进 `ctx.lanterns / ctx.points`。

---

## 5. 硬约束（改任何几何前必须知道）

1. 鱼灯 body / fin 两遍着色器**各画各的索引缓冲**。
2. 鳍用**预乘 alpha** `blendFunc(ONE, ONE_MINUS_SRC_ALPHA)`（改回纯加性会洗成灰白）。
3. `sheet()` 法线定向必须用**逐顶点** `refFn(u,v)`（常量会让鱼腹半边翻面）。
4. **每一个 `b.push()` 必须配对 `b.pop()`**：世界是一张合并 mesh，未配对的 push 会静默地把之后
   所有几何乘上那个变换（本轮的整镇位移事故）。改完 world/town/street/buildings 跑 `node tools/stack-check.mjs`。
5. **有挑台的楼层，核心体要内缩**：2F 立面为挑台内退 0.34 m，核心体外皮必须退到它后面（`coreD = d - 1.0`），
   否则窗纸被核心体盖住，远看是一面暗墙。
6. **不要给退化三角形留零法线**：`tri()` 已回落 [0,1,0]；新原语若自己传法线必须非零。
7. 建筑 / 街市所有随机走传入的 `rng`（mulberry32），**不要用 Math.random**，否则静帧不可复现。
8. `ctx.lanterns / ctx.points` 的坐标是**世界坐标**：建筑内部先用 `b.tp([x,y,z])` 转换。
9. **色板键名是跨模块契约**：`palette.js` 的 machiya 14 键被 buildings/street 共用，
   改名会同时波及两个模块（street.js 有兜底、buildings.js 没有）。要改就一次改全。

---

## 6. 命令（都在 `01-source/skycity` 下跑）

```powershell
node build.mjs                 # → 04-output/CELESTIA.html（压缩；会打印 KB）
node build.mjs --dev           # → 04-output/CELESTIA.dev.html（真实行号）
node tools/serve.mjs           # http://127.0.0.1:8099   ← 截图前必须先起（现在可能已在跑）
node tools/final-stills.mjs    # 重拍 10 张成品图（每张换端口，约 3 分钟）+ 之后 python tools/sheet.py
node tools/buildings-check.mjs # 建筑三档 LOD / 包围盒 / 预算
node tools/stack-check.mjs     # 变换栈泄漏（也会打印 world tris / lanterns / points）
node tools/street-check.mjs    # 街市预算 / 占道 / 确定性
node tools/bench.mjs 'http://127.0.0.1:8099/CELESTIA.html?noui=1&freeze=6' 0,1,4,7 1280 720 2500  # 帧时间
node tools/probe.mjs 'http://127.0.0.1:8099/CELESTIA.html?view=4' 'JSON.stringify(__sky.perf.snapshot)' 6000
```

**建筑 look-dev**（调建筑主要靠它）
```
?lab=1                                    一栋町屋、暗场、相机自动绕行
&angle=38&dist=15&eye=3.2&fov=46          固定机位（角度/距离/相机高/视角）
&floors=1..3 &detail=0..2 &w= &d= &seed=  换尺寸/层数/细节档/随机种子
```

**场景定机位 / 调试**
```
?freeze=6&cam=112,32,43&look=76.5,27,29.5&fov=45   任意确定性机位（截图主用）
?view=0..7&noui=1                                  预设观景点（1 = 灯市街景）
?perf=1                                            性能诊断覆盖层
?no=static|world|fall|bb|cloud|puff|halo|bloom     临时关某个 pass（排查渲染问题用）
?tune=uRim:0.2,uKeyInt:1.2                         临时改 shader uniform
```

> 截图是 headless Chrome + CDP（`tools/shot.mjs`）。**并行/连续拍多张时每张给不同 `--port`**，
> 否则会撞端口失败（final-stills / views 已自动递增）。`--gpu=default` 走真显卡。

---

## 7. 性能与预算（GTX 1070 Ti / 1280×720 / headless 每帧 `gl.finish`）

| 视图 | 整帧 ms / GPU ms | 绘制三角形 | calls |
|---|---|---|---|
| view 0（云上之城） | 0.64 / 0.54 | 386k | 74 |
| view 1（灯市 · 街） | 0.66 / 0.58 | 297k | 44 |
| view 4（鲤群） | 0.69 / 0.59 | 308k | 44 |
| view 7（高塔） | 0.81 / 0.69 | 390k | 74 |

- 世界静态 mesh：**176,692 三角形 / 517,668 顶点**（上一版 49k / 147k）。
- 建筑：71 栋，115,768 三角形；街市 58 件，15,840 三角形。
- 灯笼 billboard 625 个、点光候选 126 个（每帧只取最近 3 盏城市点光）。
- **单文件 145.0 KB，红线 150 KB —— 只剩 3.4% 余量**：
  几何是在运行时生成的，加建筑**几乎不涨文件体积**（只涨代码），**涨字节的是新代码/新参数**。
  每次 `node build.mjs` 都看一眼 KB。
- 上一轮结论不变：headed 浏览器 56 fps 是 60Hz 垂直同步封顶；「演示只有 30 帧」先看 `?perf=1` 判定行，
  别为不存在的瓶颈降画质。

---

## 8. 调参入口

| 想改什么 | 位置 |
|---|---|
| 建筑比例 / 层数分布 / 面宽 | `buildings.js` 顶部 dims 与 `bayW`；`town.js` `packRow` 的 `wMin/wMax/floors` |
| 建筑细节档（hero 弧范围） | `town.js` `detailFn: (a) => a > 0.42 && a < 2.08 ? 2 : 1` |
| 街宽 / 环街半径 / 覆盖弧 | `town.js` `TOWN`（roadR/faceIn/faceOut/a0/a1）——**改完必跑 street-check 占道项** |
| 屋檐出挑 / 坡度 / 翘角 | `buildings.js` `roofOver`、`roofH`、`roofGable({over, curve, lift})` |
| 窗纸亮度 / 暖帘色 / 招牌 | `buildings.js` `M.paper/paperHot`、`norenCol`；色板 `palette.js` |
| 摊位密度 / 灯串高度 / 数量 | `street.js` 顶部常量与 `buildStreetFestival` 的计数 |
| 岛面高度 | `terrain.js`（world.js 的 islandTop 与 town.js 必须共用同一函数，别各写一份） |
| 鱼灯（体型/鳍/纸面/灯心） | `fish.js` PROFILE 与各鳍函数、`shaders.js` FISH_FS/FISH_FIN_FS、`main.js` FISH_* 常量 |
| 鱼灯数量 / 天灯 / bloom 阈值 | `main.js` 顶部常量（SMALL_FISH_COUNT / SKY_LANTERN_COUNT / BRIGHT_THRESHOLD） |

---

## 9. 已知问题 / 别当成 bug

- **小镇主景弧只覆盖 a∈[0.12, 2.78]**（约 150°），其余是一圈**稀疏远景排**（detail 0：只有两面发光窗带 +
  平面屋顶，近看就是「平板房」）。01/02/03/04/08 五个机位看不出；自由飞行绕到背面（a≈3.5–6）会明显看到
  一排平房与石板路。**这是 §10 第 1 条要补的**（把平房换成 mid 档）。
- **中层 / 上层台地基本是空的**（只有塔 / 钟楼 / 树 / 石灯笼 / 鸟居）。01、03 机位显得「镇子贴着台地边一圈」。
- **建筑近景（<2 m）能看到取舍**：屋檐下是单层薄面、瓦垄是色带 + 亮条而不是真瓦、栏杆是方棂。
  面数预算（hero ~3.7k/栋）下的有意选择，见 building-spec §9。
- **灯笼 billboard 近看是纸片**，密集处会糊成光团（bloom 阈值已抬到 1.02）。
- **06 岛底机位很暗是正常的**（背光 + 云海）。
- **view 7 高塔的预设角度仍有幡旗黑块**：final-stills 已改用自定义机位（152,84,-126）绕开；
  根治需给 `world.js banner()` 加自发光 / 双面光。
- **`?lab=1` 仍会构建整个世界**（~0.6 s）再只画一栋楼——它是取景模式，不是省资源模式。
- **`?no=...` 是调试开关**，不影响默认行为，可长期保留；不需要就当不存在。
- `04-output/skycity/_look/` 是过程图（72 张），交付前可整目录删；
  `tools/jobs-*.json` 是更早几轮截图任务留下的清单，也可以删。

---

## 10. 下一步建议（按优先级，带落点与验收）

### 1) 把环街补成完整一圈 ← **最便宜的画面提升**
现状只铺了 150° 主景弧。做法：`town.js` `buildTown()` 里，给 `packRow` 再加一段
`a0: TOWN.a1 + 0.2, a1: TOWN.a0 + Math.PI*2 - 0.2`、`rf: TOWN.faceIn/faceOut`、`detail: 1`、gap 1.5–2.5。
- 成本：约 +12–16 栋 mid 档 ≈ +15–20k 三角形；**文件体积不涨**；GPU +0.03 ms 量级。
- 注意：`street.js` 的摊位/灯串是按 `o.a0/a1` 自动铺的，弧变长后密度会变稀 —— 要么同时调大计数，要么只在背面补建筑不补街市。
- 验收：`node build.mjs`（<150 KB）→ 三个体检全绿 → 拍**背面三段机位**：
  1. `?cam=-38.6,3.2,-24&look=-25.4,4.2,-45.2&fov=62`（背面街心沿切线，现在是一排**detail 0 平板房**）
  2. `?cam=-38.6,3.2,-24&look=-41.9,4.5,10.3&fov=62`（同一位置望向主景弧，能同时看到平房 → 高模的过渡）
  3. `?view=0` / `?view=2` 复查整体轮廓
  对比底片：`04-output/skycity/_look/back1.png`、`back2.png`（背面现状；删 `_look/` 前先看一眼）。

### 2) 台地加戏
中层（r≈30，y≈9.6）/ 上层（r≈16，y≈19.6）台地加 6–8 个屋台 + 若干幡 + 灯串（复用 `street.js` 的构件函数，
或把 street 里的小件拆成可复用模块）。验收：`01-hero` / `03-overlook` 里台地不再空。

### 3) 屋顶 / 近景再进一步（若还想更像参考图）
真瓦垄（每 0.3 m 一条凸瓦 + 瓦当）、2F 挑台下吊灯笼、格子窗横棂细分。注意 hero 面数预算 5.2k/栋。

### 4) 其它（便宜、可穿插）
- 鱼灯片元按 LOD 传 `uLod` 跳过高频噪声层（软渲染机器用）；
- 视频化：`shot.mjs --do=eval:...` 按帧推进 `__sky` 时间逐帧截图 → ffmpeg，做一段鱼灯穿街；
- 根治 view 7 幡旗黑块（`banner()` 自发光/双面光）；
- 清 `street.js` 的 `K` 别名层（并行开发遗留，功能无碍）。

---

## 11. 并行子代理经验（如果下次还用 Agent Teams）

这一轮用了两个子代理（spec 写规格、street 写街市），效果不错，经验：

1. **规格先行**：spec 代理先产出 `building-spec.md`，主代理据此实现，减少来回。
2. **文件范围写死**：每个子代理只允许动自己文件（`street.js` + `street-check.mjs`），
   主代理动 buildings/town/world；共享的只有 `palette.js` 的键名——**并行前冻结键名**，
   否则像这一轮中途改名，street 只能靠别名层兜。
3. **给子代理可自测的硬契约**：street 代理自己写了 `tools/street-check.mjs`（面数/占道/确定性），
   主代理只做集成，合并成本很低。
4. **主代理不要和子代理同时 build 同一产物**：`04-output/CELESTIA.html` 只由主代理构建，
   子代理用 node 端几何体检（不依赖 GL/服务器）。

---

## 12. 本轮收尾审计（留给下一次确认）

- [x] `node build.mjs` → CELESTIA.html **145.0 KB**（<150）
- [x] `tools/buildings-check.mjs` → PASS（hero 2.5–4.7k / mid 1.26k / far 184）
- [x] `tools/stack-check.mjs` → PASS（world tris 176,692，lanterns 625，points 126，0 泄漏）
- [x] `tools/street-check.mjs` → PASS（58 件 / 16,208 tris / 82 灯笼 / 3 点光 / 0 占道）
- [x] `[world]` 日志：verts 517,668，**zeroNormals 0**，nonFinite 0
- [x] file:// 离线实开：正常构建、无外部请求
- [x] 10 张静帧 + 拼贴重拍（22:47–22:49，基于最终构建）
- [x] 文档同步：HANDOFF / README / 生产笔记 §3.7 / building-spec §9 / perf 附录 / 当日日志 + 索引
- [ ] 唯一没做：**环街背面弧段**（§10 第 1 条）—— 现状底片 `_look/back1.png`、`_look/back2.png`

---

## 13. 收尾时记得写当天日志

每天的工作记录在 `05-daily/YYYY-MM-DD.md`（模板 `_template.md`，索引在 `05-daily/README.md`）。
一轮工作结束、或者要收手之前，**先把当天条目补上**：目标 / 做了什么 / 动了哪些文件 / 产物 / 坑与发现 / 下次接着做。
交接文档（本页）只写「当前状态 + 怎么继续」。

---

## 14. 给新会话的第一句话

复制这句就行：

> 读 `F:\AI\dsh\code-animation\HANDOFF.md`（先跑一遍 §0 的开工检查单），
> 然后做 §10 第 1 条：把环街补成完整一圈（`town.js` 的 `packRow` 加背面弧段，detail 1，+12–16 栋），
> 验收用背面机位 + `?view=0/2`，别超 150 KB。