# CIELO 制作规格 · 天空鲸城

> 目标：把参考图 F:/AI/dsh/素材/图片/幻想城市/整体原图.png 里的**白金石造欧陆幻想都市**做成一个可在网页里自由游览的 WebGL2 场景。
> 三组子图：建筑/（Beaux-Arts 大穹顶宫殿）、空中巨大鲸鱼/（巨鲸背城堡）、高架铁轨火车/（钢桁架高架 + 蒸汽机车）。

---

## 0. 现在能跑什么

~~~powershell
cd F:/AI/dsh/code-animation/01-source/cielo
node build.mjs                 # → 04-output/CIELO.html
node build.mjs --dev           # → 04-output/CIELO.dev.html（真实行号）
~~~

静态服务已经在跑： http://127.0.0.1:8111/CIELO.html （根目录 04-output，不要重启、不要换端口）

截图（headless Chrome + CDP，自己挑一个没被占的端口 95xx）：

~~~powershell
cd F:/AI/dsh/code-animation
node 01-source/cielo/tools/shot.mjs --gpu=default --url="http://127.0.0.1:8111/CIELO.html?noui=1&freeze=8&view=0" --w=1400 --h=800 --port=9531 --out=04-output/cielo-look/agent-x-01.png --do=wait:6000 --do=shot:04-output/cielo-look/agent-x-01.png
~~~

⚠️ **不要把 shot.mjs 放进管道**（「| tail」/「| head」会让它静默不截图）。直接跑，从 stdout 里拿图片路径。
⚠️ 「--gpu=default」走真显卡，快；失败再去掉它退回 swiftshader（慢）。

有用 URL 参数（main.js 已实现）：

| 参数 | 作用 |
|---|---|
| 「?noui=1」 | 隐藏标题/加载层/HUD（截图必带） |
| 「&freeze=8」 | 冻结到 t=8s（确定性截图） |
| 「&view=0..7」 | 预设观景点 |
| 「&cam=x,y,z&look=x,y,z&fov=55」 | 任意机位 |
| 「&no=sky,world,bill,add,bloom」 | 关掉某个 pass（排查用） |
| 「&t=12」 | 起始时间（配合 freeze 看动画某一刻） |

---

## 1. 视觉基准（美术方向）

参考图画风是**高饱和日系动画厚涂**：深钴蓝天 → 青绿 → 米白地平雾；建筑是米黄石灰岩 + 蓝灰板岩屋顶 + 金色描边；巨鲸深蓝紫、腹部近白；大面积白色高光 + 蓝紫阴影。

### 1.1 调色板（src/palette.js 已定义，**优先用它，不要自己硬编码颜色**）

- **C.stone / stoneWarm / stonePale** 米黄石灰岩（主色）#ddd2b8 / #d6c8aa / #e8dec8
- **C.stoneCool / stoneDark** 冷调石 / 阴暗面 #cfd4dd / #b6ab96
- **C.marble / marbleShade** 大理石 #efe8d8 / #d8d1c0
- **C.slate / slateDark / slateLight** 蓝灰板岩屋顶 #4c63a6 / #3a4c85 / #6b84c4
- **C.gold / goldBright / brass** 金饰钟面栏杆 #e8b45f / #ffdca0 / #c9a24a
- **C.copper** 铜绿屋顶 #79a897
- **C.iron / ironLight** 铸铁高架/灯柱 #2b3345 / #4a5568
- **C.glass / glassDeep / glassFrame** 玻璃宫 #bfe2f4 / #7fb6de / #f4f7fa
- **C.leaf / leafLight / leafDark / vine** 植物 #4f9a4e / #7cc463 / #2f6b40 / #3f8a4a
- **C.bloomPink / bloomRed / bloomYellow / bloomBlue** 花 #f2718e / #e04a5c / #f7c948 / #6f8ff0
- **C.ballPink / ballCream / ballSky / ballLilac / ballMint** 气球
- **C.whaleBody / whaleBodyLit / whaleBelly / whaleFin** 鲸 #2b52a8 / #4a7ad4 / #c3dcf0 / #3f68bd
- **C.koiRed / koiGold / koiWhite / koiBlue** 锦鲤
- **C.giraffe / giraffeSpot / giraffeCream** 长颈鹿
- **C.trainNavy / trainBlack / trainRed** 蒸汽机车
- **C.skin / hairBlonde / dressWhite / dressPink / ribbonBlue / eyeBlue** 少女

需要新颜色：在**自己的模块里** 用 rgb('#xxxxxx') 定义局部常量，不要动 palette.js。

### 1.2 光照与材质（src/glsl/lit.fs.glsl）

- 主光 = 左上偏后的暖白太阳，**2–3 段硬卡通明暗交界**，不是柔和 PBR 渐变。
- 环境光 = 上方冷蓝 + 下方暖石反弹（uSkyColor / uGroundColor）。
- 阴影面保持**蓝紫色**（uShadowTint），不要压成黑。
- 边缘光 rim 把轮廓从天空里分出来 —— 参考图的关键。
- 空气透视：距离雾走向 #cde6f6，远处建筑褪成浅青 —— 纵深感的来源，别怕远景发白。
- 材质第二位 mat[1]=gloss：0 哑光石 / 0.2 大理石 / 0.5 玻璃 / 0.8 金；mat[0]=emissive 取 0.4–1.0 才会发亮。
- **反照率保持 0.45–0.85（线性）**，不要纯白 —— 会过曝成一片白。

### 1.3 造型法则

1. **轮廓优先**：先保证远处/逆光的剪影（尖塔、穹顶、檐口线、桁架斜杆），再加细节。
2. **重复模数**：柱距 4.2 m、层高 8.5 m、窗 2.4×4.8 m、扶壁 6 m —— 循环生成一列列，比单件精雕更像建筑。
3. **檐口要挑出来**：外挑 0.4–1.2 m 的薄板在日照下形成亮线，是 Beaux-Arts 的灵魂。
4. **不要贴图**：全顶点色，细节靠几何 + 明暗分档。
5. **不要黑**：最暗的面也要有环境光。

---

## 2. 引擎事实（改代码前必读）

- **顶点格式** pos(3) normal(3) color(3) mat(2)，共 11 float。所有静态几何进同一个 B builder。
- **坐标**：右手系，+Y 上，地面 y=0，单位米；摄像机默认朝 -Z 看城市。
- **变换栈**：b.push(M16) / b.pop()，**必须 16 个 float 的列主序矩阵** [1,0,0,0, 0,1,0,0, 0,0,1,0, tx,ty,tz, 1]。漏掉最后一个 1 会让之后所有几何变 NaN。**每个 push 必须配对 pop**。
- **局部坐标**：局部 +Z = 立面朝向、+X = 右、+Y = 上。
- **静态 = 合并 mesh**（一次 draw call）；**动态 = ctx.dyn**：

~~~js
ctx.dyn.push({ name:'x', kind:'model', mesh, model:(t, dt) => trs(pos, yaw, scale), prog:'lit' });
ctx.dyn.push({ name:'y', kind:'inst', mesh, capacity:64,
               fill:(t, act, dt) => { act.set(0, mat4, 0, 0, 1); return 1; } });
~~~

详见 src/actor.js（InstActor / trs()）。

- **灯光** ctx.points.push({p:[x,y,z], col:[r,g,b], range:40, int:1})（每帧取最近 8 个）。
- **静态 billboard** ctx.lanterns.push({p, size, rot, alpha, shape, col})；
  shape: 0 光点 / 1 光晕 / 2 云团 / 3 花瓣 / 4 气球 / 5 叶丛 / 6 烟。
- **动态 billboard** ctx.bbDyn.push({ fill:(t, bb, dt)=>{ bb.add(x,y,z,size,rot,alpha,shape,col); }, up:false })。
- **确定性**：随机一律用传入 rng（mulberry32），**禁止 Math.random**。
- **三角形预算**：全场景 ≤ 2.2M；单栋 hero 建筑 ≤ 4200 / mid ≤ 1400 / far ≤ 260；鲸 ≤ 6000；少女 ≤ 3500。

---

## 3. 模块契约（谁写哪个文件）

签名统一 export function buildX(b, ctx, rng)，由 src/world.js 调用（b = 合并 builder，ctx 见 §2）。

| 文件 | 负责人 | 内容 |
|---|---|---|
| arch.js city.js | **architect** | Beaux-Arts 生成器 + 街区/大道/广场/喷泉/运河/远景天际线 |
| landmark.js | **landmark** | 哥特钟楼大教堂（金钟面）+ 玻璃穹顶宫殿 + 摩天轮 + 车站雨棚 |
| whale.js rail.js | **whale** | 巨鲸 + 背上城堡；钢桁架高架 + 蒸汽机车 + 蒸汽 |
| terrace.js hero.js | **stage** | 大理石露台/雕花栏杆/花园；少女 + 黑猫 |
| life.js | **life** | 锦鲤群、白鸽群、长颈鹿、气球、花瓣、飞艇、藤蔓 |

**不要改**：main.js world.js geo.js gl.js math.js shaders.js glsl/* palette.js lib3d.js layout.js camera.js actor.js template.html。
（lib3d.js 提供 MT 材质预设与 extrudeXY/extrudeXZ/tubePath/ellipsoid/disc/boxAt/star/inFrame/scatter 等通用件，只读引用。）

---

## 4. 布局锚点（src/layout.js）

~~~js
terrace      { x:0,  y:30, z:112, w:96, d:34 }   // 主角露台（开局机位在这里）
boulevard    { x:0,  z0:96, z1:-210, w:26 }      // 中央大道，沿 -Z
plaza        { x:0,  z:-46,  r:44 }              // 中央广场 + 喷泉
cathedral    { x:-96, z:-24 }                    // 哥特教堂（双尖塔 ~118 m）
glassPalace  { x:104, z:44 }                     // 玻璃宫（穹顶 ~130 m）
ferris       { x:-196, z:-132, y:26, r:40 }
station      { x:40, z:-150 }
railY        27.5                                 // 高架桥面高度
railLoop     [...]                                // 火车环线 8 个控制点
whale        { cx:10, cy:158, cz:-110, radius:240, speed:0.0125 }
~~~

**城市不要侵占**：露台区（|x|<62 且 88<z<150）、教堂半径 60、玻璃宫半径 70、摩天轮半径 55、车站半径 45、大道走廊（|x|<20）、广场圆 46、高架沿线走廊 12 m。

---

## 5. 自测 / 交付

1. node build.mjs 必须成功；控制台不能有 [geo] non-finite / [world] module ... failed。
2. 至少 2 张截图（命名 04-output/cielo-look/agent-<你>-NN.png）：一张内容主视角（&cam=..&look=..&fov=.. 精确构图），一张远景看尺度。
3. 用 read_image 亲眼看截图，不合格就改，直到满意。
4. 汇报：文件路径、三角形数、截图路径、已知问题。**不要写文档，不要改别的文件。**
