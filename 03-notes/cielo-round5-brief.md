# CIELO 第五轮施工合同（2026-11-22 傍晚）

用户要求（原文）：
1.「继续改进天空鲸城。把宫殿的1层做豪华，可以进入游览。」
2.「把图二的建筑做豪华，可以进入游览。图二建筑参考这个图片的内饰效果做」

用户提供 3 张图（只读副本，可直接 read_image）：
- 图1（宫殿现状，下方一大片空白基座墙）：C:\Users\Administrator\.dsh\attachments\v1\objects\05\0589bbf3e500e907df5ea6fb27f08abb539932ce99d770896a1c3140aef09cad
- 图2（玻璃宫现状）：C:\Users\Administrator\.dsh\attachments\v1\objects\50\50c6faa5c61cdaf1a446a3c999b5b3f3edfc4ce48b52256a270db9c4f9d62fd2
- 图3（玻璃宫内装风格参考）：C:\Users\Administrator\.dsh\attachments\v1\objects\e9\e9ee0a4e690a904e8886410acda1cd1c8d9ec2699f96600b4ecab8774f23cf69
  参考风格：深蓝+金、星空/星云彩绘拱顶、黑白棋盘大理石地面、镀金拱廊与巨柱、墙上金框怪奇画
  （兔子等）、拱门外是明亮的绿色温室/废墟花园、漂浮扑克牌与茶杯、烛台吊灯、奇幻少女漫画式的豪华。

## 总原则（三位施工员都必须遵守）

- 工程：自研 WebGL2 单文件场景。几何全部用 src/geo.js 的 B 构建器 + src/lib3d.js 图元；
  顶点格式 pos(3) normal(3) color(3) mat(2)。材质 mat = [emissive, gloss]（见 src/glsl/lit.fs.glsl）：
  发光 emissive 0..1，gloss 0..1。反照率保持 0.45..0.85 线性 rgb，纯白必过曝；不要在颜色槽传材质数组。
- 所有随机数必须来自本地 rng：const R = mulberry32(固定seed)（import 自 './math.js'），
  绝对不要使用 world.js 传进来的共享 rng，否则会平移后面所有模块的随机序列（历史大坑）。
- b.push() 必须 16 float；push/pop 必须配对；模块用 try/catch 包住（参考 palace.js 的 buildPalace）。
- 三角形预算：全局上限 2.2M（当前静态世界 1,076,855）。每个模块自带预算（见下）。
- 观感：这是日系动画白昼场景，但室内没有直射阳光：室内石/金/木必须带 emissive lift
  （0.10..0.22 左右），并配 ctx.points 暖色点光（每间屋 <=10 个，range 20..50，int 0.35..1.0）
  和 ctx.lanterns 烛光光晕（shape:1, size 0.6..2.4, alpha 0.3..0.8, col 暖金）。
- 相机是自由飞行（WASD/鼠标/QE），y 下限 2.2。所谓「可以进入游览」= 入口是真空洞、能飞进去，
  室内中轴/门口净空可通过，且有新观景点。不要做实体碰撞。
- 不要修改：world.js / layout.js / main.js / palette.js / geo.js / lib3d.js / math.js /
  terrace.js / palace-plan.js / 其他 agent 的文件。不要运行不带 --as 的 build.mjs（不要覆盖 CIELO.html）。

## 验证方法

服务器已在 http://127.0.0.1:8099 跑着（静态目录 04-output）。构建你自己的版本：

    cd F:/AI/dsh/code-animation/01-source/cielo
    node build.mjs --as=base        # -> 04-output/CIELO.base.html

截图（PowerShell，注意环境变量）：

    $env:CIELO_FILE='CIELO.base.html'
    node tools/look.mjs 'F:/AI/dsh/code-animation/04-output/_look_base' 'front=0,8,55|0,13,95|62' 'inside=0,6,101|0,10,118|74'

- look.mjs 的参数是 name=camX,camY,camZ|lookX,lookY,lookZ|fov，输出目录必须给绝对路径。
- 默认 freeze=3、1600x900；如需别的冻结时间设 $env:LOOK_Q='freeze=9'。
- 几何自检：可写 tools/<你的名字>-check.mjs（只 import 你的模块 + B，不依赖 GL），断言
  三角数/包围盒/NaN/stack/净空射线（照抄 tools/palace-check.mjs 的 stats/segHits 即可）。
- 改过 palace.js / landmark.js 的人，额外跑 node tools/palace-check.mjs、
  node tools/palace-hall-check.mjs、node tools/terrace-set-check.mjs 保证没回归。

## A. 宫殿 1 层（城市标高）— 文件 src/palace-base.js，owner「base」

lead 已改造 palace.js 的 buildPodium：实心台基被掏空成入口大厅内腔。
内腔（绝对世界坐标）：
- 空腔：x -40..40，y 0..23.6，z 96.4..122.4（front wall 96..96.4，开口 x ±12.4 / y 0..17.0）
- 入口：terrace.js 的 carriage arch 穿过 z 92.6..95.6 的挡土墙：x ±12.2、起拱 4.6、拱顶 16.8。
- 上方的露台板 y=30 / 宫殿本体从 z=124 起，都不要碰。
- 台基外立面：z=92.6 的挡土墙（terrace.js buildSupport，y 0..26.6，x ±47，墙前已有浅壁柱到 z≈92.28）。
  你的城市立面必须全部建在 z <= 92.2 的一侧（前面），与既有墙留 0.25 m 以上间隙或包住但不闪面。

要做的事：
1) 城市面（用户图1里那片空白大墙）：做成豪华宫殿基座立面——
   - 3 开间（也可 5 开间）巨型壁柱/倚柱 + 拱廊；中央大拱门与 carriage arch 同轴，
     做厚拱券、拱心石、拱肩浮雕、线脚；两侧壁龛放雕像/战利品浮雕/盾徽；
   - 粗糙石基座 + 通长檐口 + 顶部栏杆与露台衔接（26.6..30 只做浅浮雕/栏杆，不挡露台）；
   - 金色饰带、壁灯（ctx.points+lanterns）、旗帜/帷幔、花箱、盆栽、瓮、狮子；
   - 大台阶从 y=0 广场上到拱门门槛（约 y=0.6..1.2），两侧设栏板/狮像/灯柱；
   - 立面前景别和 z=78.6 的下层露台碗（terrace.js buildLowerTerrace）打架：台阶不要越过 z≈84。
2) 入口隧道（z 92.6..96.4）：拱顶/门套/敞开的镀金大门两扇、红毯、壁灯、门卫雕像、门楣金饰。
3) 内厅（奢华入口大厅，约 78 m 宽 × 24 m 深 × 23 m 高，是全场最大室内）：
   - 地面：大理石拼花 + 中央圆毯/星徽 + 红毯中轴，踢脚/束腰线；
   - 两排（或四排）金饰巨柱撑起拱顶/藻井天花；中央发光天窗（假天光，不要求真透光）；
   - 侧墙：拱形壁龛+雕像、金框画（可画抽象风景/肖像色块）、镜面、帷幔、壁灯；
   - 夹层回廊 mezzY≈11.6：沿侧墙+后墙的镀金栏杆回廊，两侧各一部大楼梯上去（楼梯沿侧墙 x≈±35，
     从 z≈100 升到 z≈118），后墙回廊上再放雕像/花瓶；
   - 中央喷泉（圆形低池 r≈4.5，池高 <=1.4，金边、水盘、雕像/花）——放 z≈107；
   - 家具：长椅、金框桌、花瓮、橙树/棕榈盆栽、烛台、3~5 盏吊灯；
   - 灯光：暖色点光按区域布置（入口 2、厅中 4、楼梯 2），烛光 billboard。
4) 通过性（check 工具断言）：中轴 (0,2,60)->(0,3,96)->(0,4,101) 无遮挡；
   入口 x±10.5 / y 1..15 禁区无顶点（门洞净空）；内厅可飞（不要整面墙挡视线）。
5) 预算：40k..160k 三角；确定性（同 seed 两次顶点 hash 一致）。

给 lead 的报告里请给出：module 三角数、bbox、建议的 3 个观景点（世界坐标 pos/look/fov）、
截图路径、已知风险。

## B. 宫殿内厅（露台层圆厅 1F）豪华化 — 文件 src/palace-salon.js，owner「salon」

现有圆厅（palace-hall.js，35k tri）：r=15 墙、12 根柱（r=12.6）、地面 y=30、檐口 49、
鼓座高窗到 62、藻井穹顶到 76（顶部开天窗）、后龛在 z=159（后墙上 tall 彩色窗）、
前门在 -Z 方向（portal 洞在 z≈129，拱 43.5..48.1，即地面以上 13.5 m，飞进来到 y≈32 即厅内）。
参考合同 src/palace-plan.js 的 PAL.hall / PC / PM。

要做的事（只做加法，不重建壳）：
1) 王座：后龛（z≈150..159）做 3 级大理石台基 + 金王座（高背、扶手、坐垫）+ 红金华盖
   （baldachin：四柱/流苏/顶冠）+ 两侧烛台；从门口到王座的红金地毯。
2) 中轴中心放低矮大理石花泉/花瓮（高 <=1.6），保留地面拼花可见；地毯环带；
3) 家具：6~8 组天鹅绒（深蓝/酒红）金框沙发/扶手椅/贵妃榻（靠墙、柱间、半径 r 9..12 区域），
   4~6 张金框圆几/边桌（花瓶、书、烛台、茶具），8 个金瓮插花，6 盆橙树/棕榈；
4) 墙面/柱间：蓝色织锦帷幔（金流苏、盾徽）、金框油画/镜面、金色壁灯（lanterns 光晕）、
   柱头/檐口金色构件点缀；
5) 吊灯：保留中央大吊灯，加 6 盏次级吊灯（r≈8 环上）+ 8 组壁烛台；
6) 入口：筒拱隧道内两扇敞开镀金门（左右各一扇转开）、红毯、门侧 2 尊侍卫雕像（简化人形+戟）、
   门楣金盾徽；
7) 预算：50k..130k 三角；不要侵入圆厅中心 r<3.5 且在 y>32..46 的空间（观景点 16 的构图）；
   不要遮挡后龛彩窗与鼓座高窗；确定性；本地 rng。
8) 灯光：<=10 个点光（暖金）+ 烛光 billboard，避免全屋过曝（室内已有 10 盏，注意别堆在相机附近）。

报告：三角数、bbox、建议 2~3 个新观景点（世界坐标）、截图、风险。

## C. 玻璃宫（图2）内装 — 文件 src/glass-hall.js + landmark.js 的 buildGlassPalace 局部改造，owner「glass」

玻璃宫锚点：L.glassPalace = { x:104, z:44, rot:-0.22 }，本地坐标 +Z 朝前（门廊/城市方向），
世界变换：world = A + localX*(cos,0,sin) + localZ*(-sin,0,cos)，A=(104,0,44)、rot=-0.22。
现有外观（landmark.js buildGlassPalace）：
- 台基：put(b,0,10,-25, box(78,20,50))，即 local x±39、y 0..20、z -50..0；
- 门廊 6 柱在 z≈2.6，前平台 y≈2.0，门洞（暗玻璃门+拱环 ringZ @ y14.6 r5.4，中间 3 根金竖梃）；
- 鼓座/穹顶在 y 22.6..107，玻璃鼓 r26.6 中心 local (0,0)，穹顶玻璃 r30/47；
- 侧翼 barrel vault（x ±50，z -43..-5）、屋顶花园（z 1.6/-51.6 边、x ±38.6 边）。
要求：外观轮廓/鼓座/穹顶/侧翼/屋顶花园/螺旋梯 全部保持原样，只允许：
  a) 把台基改造成壳（保留外表面位置）并在正门处开真门洞；
  b) 台基顶面中央加一条玻璃天窗脊（沿 local z -12..-44，x ±9，y 18.4->22.6，钢肋+玻璃），
     不能与屋顶花园/盆景打架；
  c) 新增内装（新文件 src/glass-hall.js）。

内装（local 坐标，地面 y=2.6，天花 18.4；x ±35，z -48..-2）：
- 风格完全按图3：深蓝+金、星空/星云彩绘拱顶、黑白棋盘大理石地面 + 金边、
  镀金拱廊（两排柱/连拱，nave 中殿 + 侧廊）、墙面金框怪奇画（兔子剪影、风景）、
  拱门/拱窗外是明亮绿色温室花园（emissive 绿白面 + 植物）、漂浮扑克牌/茶杯（静态或 billboard 都行）、
  镀金烛台/枝形吊灯（点光+光晕）、棕榈/花/藤、中央浅水镜池/喷泉。
- 入口：门洞下 2~3 级台阶（前平台 y≈2.0 -> 厅内 2.6），敞开金门、红/蓝地毯、门厅；
- 天窗脊要能看见：中轴抬头能看到玻璃拱顶与钢肋；
- 保持外立面可读：从外面看、从鼓座看、从空中看玻璃宫 = 与原版一致 + 一条玻璃脊；
- 预算：80k..260k 三角；确定性；本地 rng；不得使用共享 rng（landmark 在 world 装配序列中间，
  改 rng 调用次数会平移后面的 railway/terrace/hero/whale/life）。
- 灯光：<=10 个点光（暖金+少量冷蓝），billboard 烛光/星点；室内靠 emissive 提亮。

报告：三角数（外观改前/改后）、bbox、内装 bbox、建议 3~4 个新观景点（世界坐标 pos/look/fov）、
截图（外观/门廊/内厅/抬头天窗）、风险。

## 交付与边界

- 只写你名下的文件（外加：C 可改 landmark.js 的 buildGlassPalace 段）。
- 完成后在你的 final answer 里贴：改了哪些文件、三角数、截图文件绝对路径、建议观景点、风险。
- 不要写 HANDOFF/README/notes，lead 统一写。
