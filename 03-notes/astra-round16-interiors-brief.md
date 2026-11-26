# Round 16 · ASTRA「悬灯画廊」四间室内的施工合同（每人一间）

> 你是本轮的一名施工员（4 人并行，每人负责**一间**房）。读完这份合同再动手。
> 本轮总任务：环站 ASTRA（`01-source/astra/`，单文件 WebGL2 世界）在环带下沿挂出一条
> **悬灯画廊**：一条廊桥 + 四间可飞入的室内（`src/room-gallery.js` 是我的壳，四间房的内景
> 由你们分别做）。每间房都有一扇 13 m 拱门通向廊桥、一扇 30 m 拱窗正对巨行星。

## 0. 一句话

在你的文件里，用引擎的几何/材质函数，把**参考图**那间房做成一个 40×26×18 m、
可飞进去自由游览、有 50+ 件可读陈设、灯光氛围到位的**精美室内**。

## 1. 你只能改这两个文件（别人的一律别碰）

| 文件 | 说明 |
| --- | --- |
| `01-source/astra/src/room-<key>.js` | **只改这个**（已存在 stub，把占位内容换成真正的室内） |
| `01-source/astra/tools/room-<key>-check.mjs` | 新写：纯 node 体检（见 §7） |

> **禁止修改**：`interiors-plan.js`、`room-shell.js`、`room-gallery.js`、`world.js`、`main.js`、
> `layout.js`、`palette.js`、`station-ring.js`、`station-core.js`、`space-props.js`、
> `checkall.mjs`、`astra-check.mjs`、`build.mjs`、`template.html`、`HANDOFF.md`、以及别人的 room-*.js。
> 截图只写到 `04-output/_r16/<key>/`。

四间房与 key：painter 彩窗画室 / tearoom 丝绒茶厅 / atelier 玻璃工坊 / study 青花书房。

## 2. 坐标系（最重要）

你的模块在**房间局部坐标系**里建模，`world.js` 用 `roomFrame(cx)` 统一摆到环带下面：

- `x ∈ [-20, +20]`（W=40），`y ∈ [0, 18]`（H=18，地板 y=0），`z ∈ [0, 26]`（D=26）。
- `z = 0` 是**房门墙**（13 m 拱门，门洞 x ∈ [-6.5, 6.5]，拱顶 y=15）；门外 z<0 是廊桥。
- `z = D = 26` 是**大窗墙**（30 m 拱窗，洞 x ∈ [-15, 15]，y ∈ [1.5, 16]）；窗外是太空/巨行星。
- 两侧墙在 x = ±20（内表面 x = ±19.1，墙厚 0.9）。地板/顶板由 shell 给。
- 门内要让出一条**进门通道**：x ∈ [-6.5, 6.5]、z ∈ [0, 8]、y ∈ [0.2, 12] 不要摆东西。

**灯光 / 光斑必须换成世界坐标**（引擎里点光与 billboard 都是世界坐标）：

~~~js
import { roomEntry, roomFrame, roomToWorld } from './interiors-plan.js';
const R = roomEntry('<key>');
const P = (x, y, z) => roomToWorld(R.cx, [x, y, z]);   // 局部 → 世界，ctx.points/ctx.lanterns 一定要用
ctx.points.push({ p: P(0, 11, 9), col: mulc(C.warmGlow, 1.1), range: 30, int: 3.0 });
ctx.lanterns.push({ p: P(0, 14, 12), size: 2.4, rot: 0, alpha: 0.55, shape: 1, col: mulc(C.warmGlow, 1.1) });
~~~

## 3. 已经给你的壳（不要重写）

`src/room-shell.js` 的 `buildRoomShell(b, ctx, R, S)` 会建：地台、顶板、两侧厚墙、
带真门洞的门墙 + 门套 + 门槛、带拱窗洞的窗墙 + 窗棂/横梃/窗台 + 窗套、踢脚、檐口、
4×2 壁柱、3 根顶梁、室外勒脚/檐口/角柱。**它已经保证门洞/窗洞是真的开口**。

你的房间文件里要这样做：

~~~js
import { box, cylinder, lathe, sphere, bar3, torus, disc, ellipsoid, tubePath,
         mulc, mixc, rgb, m4, TAU, mulberry32 } from './engine.js';
import { C } from './palette.js';
import { roomEntry, roomFrame, roomToWorld } from './interiors-plan.js';
import { buildRoomShell } from './room-shell.js';

const R = roomEntry('<key>');
const W = R.W, D = R.D, H = R.H;
const rnd = mulberry32(R.seed);          // 确定性随机：不要 Math.random / Date

export function build<Key>Assets(b, ctx) {
  const S = { wallIn: rgb('#……'), floor: rgb('#……'), ceil: rgb('#……'), trim: rgb('#……'),
              mullions: 4, transomY: 9.2 /* …见 room-shell.js 顶部注释 */ };
  buildRoomShell(b, ctx, R, S);
  // …你的陈设：局部坐标，at()/push-pop 自己配对…
  ctx.props.room<Key> = { items: 0, tris: 0 };   // items = 可读陈设组数，体检会读
}

export function build<Key>Room(b, ctx) {
  b.push(roomFrame(R.cx));     // 世界摆放（不要自己算世界变换）
  build<Key>Assets(b, ctx);
  b.pop();
}
~~~

`buildRoomShell` 的 S 支持（都有默认值，可只覆盖想改的）：
`wallIn, wallOut, wallInMat, floor, floorTop, floorMat, ceil, ceilMat, trim, trimMat,
skirting, skirtingMat, revCol, revMat, mullions, transomY, sillCol, sillMat,
pilasterZ, pilasterCol, pilasterMat, beams(布尔), beamCol, plinthCol, pierCol, corniceCol,
doorW/doorSpring/doorRise, winW/winY0/winSpring/winRise, wallT`。

## 4. 美术与技术家规（ASTRA / CIELO 同一套）

- 颜色用 `rgb('#rrggbb')`；材质是 `[emissive, gloss]` 两个数：
  - 结构/家具：emissive 0.02–0.15、gloss 0.1–0.8；
  - 灯罩、窗格光、霓虹、瓷器的釉光：emissive 0.4–0.95、gloss 0.2–0.95；
  - **单顶点 emissive 不要超过 0.95、gloss 不超过 1.0**（体检会卡）。
- 光：**点光 ≤6 盏**，`{p: 世界坐标, col, range ≤ 60, int ≤ 6}`。房间很大（40×26×18），
  建议 4–6 盏分层：主灯（暖金，range 34–44，int 3–4.5，挂在顶梁下 y≈13）、
  窗侧补光（冷一点）、桌面工作灯（小 range 12–20，int 2–3）、门口迎宾灯。
  点光按"离相机最近 12 盏"生效，房间内只会有你这间的灯，放心用。
- 静态光斑 `ctx.lanterns` ≤24 个：`{p: 世界坐标, size(1–12), rot, alpha(0.2–0.95), shape: 0|1, col}`
  （0 = 柔光点，1 = 光晕）。吊灯罩外再叠 1–2 个光斑，画面立刻"亮起来"。
- 三角预算：**14,000–42,000**（shell 约 1,300，其余全是你）。世界总预算是 90 万，现在还很空。
- 所有几何必须有限、在 ±4000 m 内、材质合法；**不要出现 NaN**。
- 引擎不开背面剔除：面片两面都画，但光照用法线，写反了会一面黑 —— 用 `box/cylinder/lathe/...` 
  这些 helper 就不用管法线；自己 `b.quad` 时给显式法线。
- 不要写动态动画（房间是静态几何）；需要"飘浮"（书、茶杯）就把它们静态摆在半空，做成魔法感。
- 陈设要"可读"：每组家具/摆件成组摆放，近看有细节（抽屉、书脊、盘沿、灯罩、花枝、猫）。
- 房间是给 1600×900 的相机看的：主构图面向大窗，第二机位回望门口。

## 5. 四间房的美术方向（参考图在 `素材/图片/幻想城市/室内/`，先用 read_image 看）

### painter · 彩窗画室 THE PAINTER'S LOFT
参考 `111530188_p0.jpg`（少女的阁楼画室）。
青绿木作 + 珊瑚粉墙 + 奶白；彩绘玻璃（鱼形纹样）；红罩吊灯；吊篮绿植 3–4；鱼缸与鱼；
字母书架（A、B…）+ 地球仪；画架 + 未完成的画；桌面（铅笔、剪刀、糖罐、玩具相机）；
带一堆抱枕的床/沙发角 + 黑猫；鱼形抱枕；拖鞋；门墙上的星星贴纸；彩色马赛克地面；
纸灯笼。**签名件**：一整面"彩绘玻璃灯箱"或彩色玻璃鱼吊饰，以及画架上的鲸鱼画（呼应 ASTRA）。

### tearoom · 丝绒茶厅 THE VELVET TEAROOM
参考 `68499618_p0.jpg`（午后茶会）。
猩红地毯 + 金线墙板 + 绿丝绒沙发（金边、抱枕）；白桌布茶桌 + 三层点心架（蛋糕/司康/马卡龙）；
青花茶具 + 银器；书堆与卷轴；盆栽棕榈；鎏金边柜（汤盅、烛台）；红丝绒窗帘（挂在窗两侧）；
金框肖像画 2–3；黄铜吊灯（蜡烛造型）。**签名件**：三层点心架 + 绿丝绒沙发角。

### atelier · 玻璃工坊 THE GLASS ATELIER
参考 `68390607_p0.jpg`（玻璃观景工坊）。
蓝白冷调 + 原木暖色；草皮地面 + 小花；长工作台（绘图屏/显示器=青蓝自发光、数位板、笔筒、蓝图卷）；
悬挂圆玻璃灯 3–5；高书架（画册）；大盆栽（龟背竹/蕨）；粉白气球 3–4 只漂在顶下；
玻璃展示柜（里面一块蛋糕/甜点）；白色圆形沙发/浴缸形躺椅；耳机；纸箱与胶带。
**签名件**：长工作台 + 悬挂圆灯阵；窗外就是巨行星（利用 30 m 大窗）。
                                                                ← 名字牌不写文字，用黄铜/珐琅几何牌

### study · 青花书房 THE PORCELAIN STUDY
参考 `46454797_p0.jpg`（蓝白瓷书房）。
黑白棋盘大理石地面；青花瓷（大瓶/罐/盘/碗，架子上成组）；室内苹果树（树干+枝+红苹果+粉花，
落在铜盆里）；蝴蝶（挂在墙上/空中）；水晶吊灯；蓝丝绒长椅/贵妃榻；**半空飘浮的书与茶杯**（静态，
做成魔法悬浮，底下加一点点发光）；挂画 3–4；老座钟；蘑菇玻璃箱；梯子。
**签名件**：苹果树 + 飘浮书群。

## 6. 怎么边做边看（重要：必须看真实渲染，不要盲写）

静态服务器已经在 `http://127.0.0.1:8099/` 跑着（仓库根）。构建后直接打开：

```powershell
cd F:/AI/dsh/code-animation/01-source/astra
node build.mjs --dev --as=<key>     # → 04-output/ASTRA.<key>.dev.html（只影响你自己的产物名）
```

四个预设观景点（`?view=`，都已配好）：
| key | 入门机位 | 回望机位 |
| --- | --- | --- |
| painter | **12** | 13 |
| tearoom | **14** | 15 |
| atelier | **16** | 17 |
| study | **18** | 19 |

单房间调试（不建环站，秒开）：`?only=roomPainter`（同理 roomTearoom/roomAtelier/roomStudy）。
要带上画廊外壳看外观：`?only=roomGallery,roomPainter`。

截图（每张约 4 秒；用你自己的 CDP 端口，别和别人抢）：

```powershell
cd F:/AI/dsh/code-animation
node 01-source/cielo/tools/shot.mjs --url='http://127.0.0.1:8099/04-output/ASTRA.<key>.dev.html?noui=1&freeze=2&view=12' --w=1280 --h=720 --gpu=default --port=<95xx> '--do=wait:5000' '--do=shot:04-output/_r16/<key>/in.png'
```

要别的角度：`--do=eval:__astra.setCam(p,l,f)`，p/l 是世界坐标；页面里可以用
`__astra.roomWorld('<key>', [x,y,z])` 把房间局部坐标换成世界坐标（例如
`log:JSON.stringify(__astra.roomWorld('painter',[0,8,20]))`）。

**构图自检清单**（每间至少 3 张：入门、回望、窗边细节）：
1. 从 `view` 看进去，第一眼有没有"主题"？家具是不是贴着墙、有没有浮空/穿模？
2. 大窗看出去是巨行星/星河（不是黑块、不是别的几何穿帮）。
3. 灯是不是真的把房间照亮了？有没有大面积死黑墙？有没有过曝白斑？
4. 门内通道（z 0–8）干净；从廊桥透过 13 m 拱门看进来，里面是"有灯、有陈设"的。
5. 地面/顶板接缝、墙脚、窗台没有漏光/黑缝。

## 7. 体检脚本（必须自己写并跑过）

`tools/room-<key>-check.mjs`（纯 node，`cd 01-source/astra && node tools/room-<key>-check.mjs`）。
红线：**退出码 0 才算过**；输出最后一行写 `xx PASS / 0 FAIL`。至少断言：

1. `build<Key>Assets` 建出 `[14000, 42000]` 三角；
2. 所有顶点有限、都在局部盒 `x∈[-24,24], y∈[-2,20], z∈[-3,30]` 内；
3. 材质合法（每 11 个 float 的第 9/10 位：emissive ∈ [0,0.95]、gloss ∈ [0,1]）；
4. 两次构建逐 float 相同（确定性）；
5. **门洞真开口**：射线 `(0,6.5,-14)→(0,6.5,4)` 命中 0 次；
6. **窗洞真开口**：射线 `(0,8,6)→(0,8,60)` 命中 0 次；
7. **门上方是实墙**：`(0,16.6,-14)→(0,16.6,4)` 必须命中；
8. **门侧是实墙**：`(17,6.5,-14)→(17,6.5,4)` 必须命中；
9. 地板 / 顶板射线必须命中：`(0,8,13)→(0,-4,13)`、`(0,8,13)→(0,30,13)`；
10. 点光 ≤6、参数合理（range ∈ (0,60]、int ∈ (0,6]），且灯位落在房间世界包围盒附近；
11. billboard ≤24、size ∈ (0,12]、alpha ∈ (0.2,0.95]、shape ∈ {0,1}；
12. 可读陈设 ≥50 组（你自己的计数器写进 `ctx.props.room<Key>.items`）。

射线-三角求交直接抄 `tools/station-core-check.mjs` 里的 `rayHit`（或 `space-props-check.mjs` 的写法），
不要新写一套。注意 `build<Key>Assets(b, ctx)` 建的是**局部坐标**，射线也用局部坐标。

## 8. 交付前的最后一步

```powershell
cd F:/AI/dsh/code-animation/01-source/astra
node build.mjs --dev --as=<key>          # 必须成功
node tools/room-<key>-check.mjs          # 必须 0 FAIL
# 三张图：04-output/_r16/<key>/{in,back,detail}.png
```

**注意**：四个人共用同一棵源码树，你的构建可能因为别人正在写别的 room 文件而短暂失败
（esbuild 会把所有 room 打进一个包）。看报错文件名：不是你的文件就等 30–60 秒重试，
**绝不要去修别人的文件**。你的体检脚本只 import 你自己的模块，不受别人影响。

回报（最终答复）给我：三角数、体检 PASS 数、三张截图路径、你做了什么（5 行以内）。
