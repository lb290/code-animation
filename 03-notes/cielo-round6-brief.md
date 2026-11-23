# CIELO 第六轮施工合同（2026-11-22 夜）

> 用户要求（原文）：
> 1.「玻璃宫殿的圆顶有一部分伸出来悬空了，你把它移动到建筑的中心，把玻璃宫殿圆顶做精细豪华，做成植物园热带温室的效果。」
> 2.「王宫的宫殿还有一些房间空着，你把那些房间都制作精美可以进入游览。」
> 3.「增加白天黑夜的切换，夜晚灯光效果，可以控制放烟花，鲸鱼城市也加上夜晚灯光效果。」
>
> 用户截图（玻璃宫悬挑现场）：`C:\Users\Administrator\.dsh\attachments\v1\objects\4b\4bf874b083a8ae5374f40eebaa3d563474a0667a15021e3b140ef41fea30927f`
> 开工先读 `HANDOFF.md` 顶部「第五轮现状」+ `03-notes/cielo-round5-brief.md`（项目约定）。

## 0. 总原则（三位施工员都必须遵守）

- 工程：自研 WebGL2 单文件场景（无 three.js）。几何全部用 `src/geo.js` 的 `B` + `src/lib3d.js` 图元。
  顶点格式 pos(3) normal(3) color(3) mat(2)=11 floats；材质 `mat=[emissive, gloss]`（见 `src/glsl/lit.fs.glsl`）。
  反照率保持 0.45..0.85 线性 rgb；不要把材质数组塞进颜色槽（geo.js 会 warn bad colour）。
- **随机数**：只允许模块内部 `const R = mulberry32(固定seed)`（`import { mulberry32 } from './math.js'`），
  **绝不能调用 world.js 传进来的共享 rng**——world.js 按固定顺序装配，rng 调用次数一变，后面所有模块都位移。
  特别注意：改 landmark.js / palace.js 既有代码时，不得增加/删除/重排其中任何 `rng()` 调用（palace.js 现为 0 次，landmark 3 次）。
- `b.push()` 必须 16 float；push/pop 必须配对；你的新模块要能被 world.js 的 try/catch 单独兜住（抛错只 warn 不黑屏）。
- 三角预算：全局上限 2.2M（第五轮静态 1,298,865）。新几何按各任务预算控制在 +120k ~ +260k。
- 室内没有真实光照通道：室内石/金/叶要带 emissive lift（0.10..0.26）+ `ctx.points` 暖色点光（每间 <=8 个，
  range 18..46，int 0.35..1.0）+ `ctx.lanterns` 暖光 billboard（shape:1，size 0.6..3，alpha 0.3..0.8）。
  点光全局只有最近 12 个名额，别把灯堆在相机附近。
- 观感基线：日系动画白昼 + 宝石蓝玻璃 + 金色描边；夜间由 C 任务负责，A/B 只要把 `ctx.points / ctx.lanterns`
  灯位放对，夜间会自动受益（C 会给 emissive 做夜间增益）。
- **并行协作**：三个施工员在同一份源码树上同时改不同文件。**只写自己名下的文件**；
  不要修改别人的文件、world.js、layout.js、HANDOFF/README/notes。若 `node build.mjs --as=xxx` 因别人文件暂时语法错误失败，
  等 20~40 秒重试，**绝不要去"修"别人的文件**。你自己的文件也请保持随时可编译（大改请一次性写完，不要留半截语法）。
- **不要运行 `node build.mjs`（不带 --as）**：会覆盖 `04-output/CIELO.html`。统一用
  `node build.mjs --as=<你的名字>` → `04-output/CIELO.<名字>.html`。lead 最后统一构建正式版。

## 1. 验证方法

服务器已在 http://127.0.0.1:8099 跑着（静态目录 `04-output`；没在跑就 `node tools/serve.mjs`）。

~~~powershell
cd F:/AI/dsh/code-animation/01-source/cielo
node build.mjs --as=glass        # -> 04-output/CIELO.glass.html
$env:CIELO_FILE='CIELO.glass.html'; $env:SHOT_PORT='9760'
node tools/look.mjs 'F:/AI/dsh/code-animation/04-output/_look_r6_glass' 'name=camX,camY,camZ|lookX,lookY,lookZ|fov' ...
~~~

- `look.mjs` 参数 name=camX,camY,camZ|lookX,lookY,lookZ|fov，输出目录必须给绝对路径；默认 freeze=3 / 1600x900。
  可用 `$env:LOOK_Q='freeze=9&tod=night'` 改 query（C 任务会加 `tod` 参数）。
- 每个 agent 用不同 `SHOT_PORT` 基址：glass 9760 / palace 9780 / night 9800（look.mjs 会 +i 递增，别和别人撞）。
- 几何自检：写 `tools/<你的名字>-check.mjs`，只 import 你的模块 + `B`，不依赖 GL（照抄 `tools/glass-hall-check.mjs` 的
  stats/segHits）。断言：三角数、包围盒、NaN/stack/badColor、门洞/室内中轴净空射线、确定性（两次 hash 一致）。
- 改过 landmark.js / palace.js 的人必须额外跑既有体检并保持通过：
  `node tools/glass-hall-check.mjs`（glass）、`node tools/palace-check.mjs`、`node tools/palace-hall-check.mjs`、
  `node tools/palace-salon-check.mjs`（palace）。
- 用 `read_image` 看自己的截图（必须亲眼确认，不要只看 PASS）。

## 2. A 任务 · 玻璃宫（owner：glass）

### 现状（`src/landmark.js` buildGlassPalace，行号约 518..695）
- 锚点 `L.glassPalace = { x:104, z:44, rot:-0.22 }`；局部坐标：`inFrame`，local +Z = 临街正面，
  世界变换 world = A + localX*(cos,0,sin) + localZ*(-sin,0,cos)。出入图纸见 `03-notes/cielo-round5-brief.md` C 段。
- 台基：local x ±39、y 0..20、z -50..0；门廊 6 柱在 z≈2.6；正门拱洞在 z=0 墙、x ±5；台基内是 `glass-hall.js` 的蓝色大厅（地面 2.6、天花 18.4）。
- **鼓座**：玻璃圆柱 r=26.6、y 23..58，24 根钢竖梃 + 16 樘蓝玻璃圆窗；**穹顶**：椭球 r30/h47、基座 y60、顶点 y107；
  天窗灯塔 y106..111、尖顶到 y125.2。**这些全部以 local (0,0) 为中心——而台基中心是 local z=-25，
  所以整个鼓座+穹顶向街面探出 25 m，前缘悬空 30 m（用户截图那处）。**
- 其它：台基顶玻璃天窗脊（landmark skylightRidge：local x±9 / z -12..-44 / 18.4..22.6）、屋顶花园花箱
  （z=1.6 与 z=-51.6 两排、x=±38.6 两列）、外围螺旋梯（绕 (0,0) r≈29，y 21.9..59）。

### 要做的事
1) **归中**：把鼓座、穹顶、天窗灯塔、尖顶、螺旋梯、鼓座外所有装饰的局部中心从 (0,0) 改到 (0,-25)（=台基中心）。
   可以给这一段套一个 `b.push(m4.translate([0,0,-25]))` 或改所有相关坐标；注意 `bands/cylinders/ellipsoid` 的局部中心都要一致。
   同时修掉因归中产生的穿插：台基顶檐口环/栏杆环（y 20.4..21.15 的 balustrade）、屋顶花园花箱（z=1.6 一排会被鼓座压到）、
   天窗脊端头、外梯落脚。**穹顶/尖顶总高保持 y≈125.2（glass-hall-check 断言 landmark 包围盒 ymax 124..129）。**
   归中后从正立面看：穹顶应落在台基正中，前缘不再悬空；侧翼 barrel vault 与门廊轮廓不要被破坏。
2) **豪华穹顶**：把玻璃穹顶做成"水晶棕榈屋"（Victorian palm house）级别：
   - 更多金肋/环带（径向 32 根、纬向 5~6 道）、金色扇形花饰、穹顶与鼓座交接的镀金冠带；
   - 鼓座外：加金饰柱头/壁柱、16 樘圆窗做金框 + 部分改通透拱窗，鼓座基座加一圈雕像/瓮/灯；
   - 天窗灯塔与尖顶做精细：金环、玻璃灯室、星形顶饰、内部吊灯（`ctx.lanterns` 金色光晕）；
   - 玻璃穹顶局部开"百叶/拱窗"（下缘一圈），让内部植物轮廓透出来（见下）。
3) **热带温室（重点）**：鼓座内部 = 可进入的热带植物温室（新文件 `src/glass-greenhouse.js`，由 buildGlassPalace 调用）：
   - 温室地面 y≈21.2，环形/带状铺地（浅色石材+碎石+青苔），围绕天窗脊留矩形洞口（x±10.2 / z -10.8..-45.2），
     洞口做镀金矮栏杆；天窗脊本身成为温室中央的"玻璃泉脊"（保留采光，不要封死）。
   - 种植：8~14 棵高棕榈（5..15 m，有的顶到穹顶内）、树蕨/芭蕉/龟背竹/巨型蕨、花丛、藤蔓从穹顶金肋垂下、
     兰花吊篮（铁艺吊环 y 30/38/46）、中央浅水池（r 4..6）带睡莲/荷叶/小喷泉；石径、铁艺长椅、玻璃暖房的灯柱。
   - 结构：室内细长镀金铸铁柱（16 根，落地到 y≈36 的环梁）、穹顶内侧金肋/环、雾气和蝴蝶/鸟（billboard，shape 0/1/5）。
   - 入口：鼓座正面（local +Z 一侧）开一个 6~8 m 宽、8~10 m 高的敞开的镀金玻璃门/落地拱（y 21.2..31），
     外部螺旋梯重新接到这个门口的平台；门口 2 个石雕花盆/侍卫。
   - 夜间效果：室内放 6~8 个暖色 `ctx.points`（棕榈树间/水池/门口）和一串暖光 `ctx.lanterns`（烛光/纸灯），
     让夜晚从外面能看到"玻璃灯笼里的热带花园"。
4) **屋顶花园**：把台基顶现有花箱重排到鼓座外围（避免穿插），并加热带植物（棕榈/香蕉/花）让正立面就"绿起来"。
5) 三角预算：新增 100k..200k（旧 landmark 约 33k）。确定性；不要用共享 rng。
6) 观景点：给 lead 报 3~4 个建议机位（世界坐标 pos/look/fov）：正面全景（看归中）、温室内部（抬头看穹顶）、
   鼓座门口、屋顶花园。lead 加进 layout.js + final-stills。

### 验收（工具断言 + 看图）
- `node tools/glass-hall-check.mjs` PASS（尤其：鼓座/穹顶归中后仍不挡大厅天窗视线、正门飞入射线、外部包围盒、确定性）。
- `tools/glass-dome-check.mjs`：新写，断言：鼓座中心 = 台基中心（local z=-25）、悬挑为 0（鼓座外缘不超出台基外缘
  超过 2.5 m 檐口）、温室内中轴/门口净空射线、三角数、确定性、无 NaN。
- 截图必须包含：正面低机位看穹顶居中的全景、温室内部一张、温室门口一张、夜间（如果 C 已合入）一张。

## 3. B 任务 · 王宫"空房间"（owner：palace）

### 现状与"空房间"指什么
- 王宫在露台层 y=30、frontZ=124；中部圆厅 r=15、中心 (0,144)（四/五轮已豪华陈设，不要动）。
- **两翼**：local x 20..52（镜像）、z 124..158、y 30..46（檐口 46/阁楼 48/曼萨德 52.5）——目前是一整块实心体量，
  外墙有 4 樘拱窗/层；玩家看到的是"有窗有房间却进不去、里面是空的"。这就是用户说的空房间。
- 端亭（pavilion）：x 39..53、z 121.5..147，实心，压在翼的前外侧；本轮先不碰（避免和两翼打架）。
- 圆厅墙：`palace.js buildInterior` 用圆柱网格 r=15 生成；核心墙 `buildCore` 在 x=±19（2 m 厚，z 127..176）。
- 两翼内部可用空间：x 21..51、z 125..157、地面 y=30、净高可做到 y=44（上部留结构）。

### 要做的事
1) **掏空两翼**：把 `buildWing` 的实心 `pBox` 改成"外壳"（保留外立面位置/窗洞轮廓/檐口/曼萨德/屋顶，
   内部 x 21..51 / z 125..157 / y 30..44 挖空），或者保留现有外表皮、在内部新增房间墙/地/顶（更稳）。
   内表面由你的新模块做豪华装修；外立面/屋顶/烟囱/老虎窗的现有构件不要删。
2) **开门**：东西各一条可飞入的通道：圆厅墙 (r=15) 在 a=0/π 处开 4~5 m 宽、8~9 m 高拱门（y 30..39）；
   核心墙 x=±19 对应 z≈144 处开洞；翼内侧墙 x=±20 对应开洞。三段要同轴、可直飞。
   门套做镀金拱券/门楣/门扇（敞开）。`buildInterior` 的圆柱网格在开口角度范围跳过相应行（参考 portal/apse 的 skip 逻辑）。
3) **两间主题厅（新文件 `src/palace-rooms.js`，由 palace.js 调用）**：
   - **东翼 · 皇家图书馆**（x>0）：四面金框书墙（到 y≈40），中二层环形书廊（y≈36，带金色栏杆和滚动梯），
     2~3 张阅读长桌 + 绿罩台灯 + 椅子，地球仪/天球仪，壁炉 + 镜面 + 壁炉钟，地毯，4~6 盏金色吊灯/壁灯，
     竖琴/画架/大型油画，几盆棕榈。
   - **西翼 · 大宴会厅**（x<0）：一张 16~20 m 长桌（20~24 把高背椅）、银器/烛台/果盘/花艺、吊灯 4~6 盏、
     挂毯/镜面/镀金墙板、边柜与酒具、壁炉、室内乐角落（钢琴/谱架/竖琴）、红金地毯。
   - 两个厅都要有"能看出去"的窗户：外墙现有拱窗位置做内层窗框/彩窗/纱帘，室内能看到外面天空（重要）。
   - 灯光：每厅 <=8 个点光（暖金；夜宴厅可少量酒红）+ 烛光 billboard；室内 emissive lift 0.10..0.22。
4) **预算/确定性**：palace.js（含开洞/改壳）保持 60k..130k tri（现 81.5k，palace-check 断言）；
   `palace-rooms.js` 100k..220k tri；palace.js 内不得新增 `rng()` 调用（现为 0）；新模块用本地 rng。
5) **观景点**：给 lead 报 3~4 个建议机位：东翼图书馆内部、西翼宴会厅内部、门厅看两侧门、两翼全景。

### 验收
- `node tools/palace-check.mjs`、`palace-hall-check.mjs`、`palace-salon-check.mjs` 全部 PASS（允许你按新结构合理更新 palace-check 中
  受影响的旧断言，但不要放宽到失去意义；报告里说明改了哪条断言）。
- 新 `tools/palace-rooms-check.mjs`：断言两翼空腔无残留顶点、门洞三段同轴净空射线 0 命中（圆厅中心→东厅中心、→西厅中心）、
  房间 bbox 不越界（x≤53 / y≤46 / z 124..158 外部轮廓不变）、三角数、确定性。
- 截图：两间厅内部各 1~2 张、从圆厅看门洞 1 张。

## 4. C 任务 · 昼夜 + 夜灯 + 烟花 + 鲸背城夜灯（owner：night）

### 现状
- `src/palette.js` 只有一个白昼 LOOK；`main.js` 每帧从 LOOK 取光照/天空/雾/调色；天空 `glsl/sky.fs.glsl` 有太阳/月亮但月亮很淡；
- `main.js` 的 `ctx.lanterns`（静态 billboard）与 `ctx.bbDyn`（动态 billboard 系统）已有；`glsl/add.*` 现成但**没有 actor 使用**；
- 城市窗户在 `arch.js` facade 的 glassRect/glassArch（`ctx` 在 buildBuilding 里可达）；鲸背城窗户在 `whale-city.js`（warmWindow 等）；
- 鲸背城已有 22 颗 `whale-city-lights` 动态 billboard（whale.js），alpha 固定 0.30。

### 要做的事
1) `src/daynight.js`：三档调色（白天/黄昏/夜晚）+ 平滑过渡（约 2.5~4 s）。
   - 导出一个 `DayNight` 实例/对象：`state()`（返回当前合成后的 LOOK 字段：keyDir/keyColor/keyInt/skyColor/groundColor/
     ambMul/rimColor/rimInt/fogColor/fogDensity/fogMax/skyZenith/skyMid/skyHorizon/haze/sunColor/cloudLit/cloudShade/cloudDeep/
     exposure/bloomThreshold/bloomInt/saturation/contrast + night 0..1 + sun/moon dir + sunInt/moonInt）。
   - 键 `N` 循环 白天→黄昏→夜晚→白天；`?tod=day|dusk|night` 直接定档（截图/静帧用）；HUD toast 提示。
   - 夜晚：深蓝星空、大月亮、云变冷变暗、雾变深蓝、曝光/调色偏冷、key light 换成月光（冷蓝、弱）、
     `uShadowOn` 白天才开（夜里关阴影或弱化）。
2) `glsl/sky.fs.glsl`：加 `uNight`/`uStarInt`/`uMoonInt`/`uMoonSize`：夜晚星点（hash/噪声稳定不闪）、月亮变大变亮有光晕，
   太阳落山变暗；云层颜色随 night 变暗蓝（由 JS 传色即可）；不要破坏白天画面。
3) `glsl/lit.fs.glsl` + `whale.fs.glsl`：加 `uniform float uNight` 与夜晚自发光增益 `lit += albedo*emissive*(3.0 + uNight*K)`
   （K 3~5），让窗户/灯/室内/鲸背城暖窗夜里更亮；白天 uNight=0 时**逐像素不变**。
4) **城市夜窗**（`src/night-lights.js`）：`arch.js` 的 glassRect/glassArch 里把窗中心/法线/尺寸收进 `ctx.nightWin`（世界坐标，
   用 `b.tp()`；带上建筑局部外法线），world 装配后生成一张静态 quad 网格（朝外、略大 1.05 倍、暖色 `[1.0,0.72,0.42]` 抖动、
   少量冷白），用现成的 `P.add` additive pass 画，uniform `uNightGlow`；白天 0（不可见）、夜晚 0.5..1.2。
   - 数量控制：窗口总量上限 ~12000，均匀抽样；same seed 确定性。
   - 另可加少量街灯/窗台灯 billboard 提升"万家灯火"层次。
   - 所有收集与绘制都不能改变白天像素（uNightGlow=0 时 alpha=0）。
5) **烟花**（`src/fireworks.js`）：`F` 键放一发（再按再放）；夜晚自动每 8~14 s 一发（可 `?fw=0` 关）；`?fw=N` 预置 N 发。
   - 解析式粒子（不要增量积分）：每发有固定发射时间/发射点/爆炸高度/颜色/种子，位置 = f(t - t0)，这样 `freeze` 静帧可复现。
   - 视觉：上升尾迹（小火星串）+ 爆开（60~120 颗，球形/环形/柳枝），颜色金/粉/青/红/白；加 1~2 次"内爆二次炸开"更好；
     additive billboard（shape 0/1），使用 `ctx.bbDyn` 或新增`ctx.bbAdd` 系统（main.js 里用 SRC_ALPHA,ONE 画）。
   - 发射点：广场/大道/露台上空（世界坐标），高度 60..140；不要穿进宫殿/玻璃宫。
6) **鲸背城夜灯**：增强 whale.js 的 `whale-city-lights`：灯数 22 → 80~120，按城市街道/建筑高度分布（可在 whale-city.js
   收集窗户/灯位到 `opts.lights`），alpha 白天 0.15~0.3、夜晚 0.8~1.0；再加 6~10 个"城门口/大教堂"大光点。
   鲸鱼本体可加极淡的夜间边缘光/发光斑点（可选，别过度）。
7) `template.html` HUD/帮助/加载页：加 `N 昼夜`、`F 烟花` 说明；HUD 显示当前时刻（白天/黄昏/夜晚）小字提示。
8) 预算：城市夜窗 quad ~24k tri（静态，+1 draw call）；烟花粒子 800~1500；其余 billboard 不涨 tri。
9) **兼容**：默认白天必须与现状一致；`freeze` 下烟花/夜窗可复现；不能修改 A/B 的文件
   （landmark.js / glass-hall.js / palace*.js 都不许动）。

### 验收
- `tools/night-check.mjs`（node 端）：昼夜调色表字段完整/有限/范围合理、过渡插值端点正确、烟花解析式在固定 t 下位置确定、
  夜窗采样上限与确定性；至少覆盖 day→night→day 状态机。
- 截图（自己 build --as=night）：`?tod=day` view 0 / view 3 与现状一致；`?tod=dusk`、`?tod=night` 各 2~3 张
  （露台俯瞰全城、玻璃宫/王宫夜景、鲸背城仰视、烟花绽放瞬间 freeze）。
- 注意：A/B 的玻璃宫/王宫可能还在改，夜景截图里它们可能暂时没有新内容，以整体氛围为准，最终图由 lead 重拍。

## 5. 给 lead 的报告格式（final answer 里附）

- 改了/新增哪些文件（绝对路径或仓库相对路径）
- 三角数（改前/改后）、包围盒、确定性 hash、体检工具运行结果（PASS/FAIL 摘要）
- 建议观景点（pos / look / fov，世界坐标）3~4 个
- 截图绝对路径
- 已知风险 / 留给 lead 的集成事项（例如 world.js/layout.js 需要加什么、C 的 uNight 接口名）

## 6. lead 负责（不要抢）

- `src/world.js`（如需接线）、`src/layout.js`（新观景点）、`tools/final-stills.mjs`、HANDOFF/README/03-notes/05-daily、
  正式 `04-output/CIELO.html` 构建、30+ 张成品静帧与拼贴、夜间展示图。
- 三位施工员的文件互不重叠；C 的 main.js/palette.js/glsl 改完后 lead 不再让别人动。

—— 开工。有阻塞或需要 lead 决策，直接 `send_message` 给 lead；完成时把 team task 标 complete 并把上面报告贴回。