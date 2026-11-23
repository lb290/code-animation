# Aurelis（天空之城）视觉配方逆向笔记 — 来自 Luminati

**一句话结论**：好看不是因为模型细，而是「高空薄气 + 反弹主导的日照 + 6 级色阶的云海」被同一套光照参数贯穿——白大理石的暗面仍是粉紫而非蓝灰，云海把每帧下半部填成一块会呼吸的白。

**最关键的 5 条**
1. **反弹主导的光**：白太阳 3.6；天光 `hemiSky #aca0b2`（淡紫、压得很暗），地面反弹 `hemiGround #d9c9e7`（玫瑰淡紫、更亮）→ 白建筑暗面是「发光的淡紫玫瑰」（`SkyLook.js:SKY_KEYFRAMES` morning 行，注释明说 `hemiGround over hemiSky`）。
2. **地平线压成窄带**：穹顶渐变指数 `horizonExponent 0.28`（默认 0.5），10° 以上即深天青，白尖塔才立在深蓝上（`SkyLook.js:SKY_DOME`）。
3. **雾极薄且上色**：日间 `fog 0.0032` × `environment.fogScale 0.45` ≈ 0.0014，再用 `#e2d5de` 以 `mix 0.45 / lift 0.06` 染成淡紫（`SKY_LIGHT`；`make-aurelis.mjs:environment`）。
4. **云海是真几何**：跟随相机的 900×900 平面 + relief-marching（≤20 步）穿透 8 u 厚云层，只输出 **6 阶 + Bayer 抖动**（`CloudSea.js:SEA_FRAG`）。
5. **Vista 是构图机器**：`lift ≈ 0.3×distance`、`tan(pitch)/tan(fov/2) ≈ 0.25–0.3` 把地平线钉在画面 36% 处（`make-aurelis.mjs:VISTAS`）。

**我准备照抄的 3 个数值**：①`sunI 3.6 / hemiSky #aca0b2 / hemiGround #d9c9e7 / hemiI 1.5`；②`horizon #a6b6c7 / fog 0.0032×0.45 / haze #e2d5de @0.45`；③Grand Viaduct 机位 `pitch 8°, dist 40, lift 15, fov 58, dof 0.1`。

> 约定：`文件:函数/常量` 即出处；数值全部取自源码或 `docs/contracts/SKY_CITY.md` 实测表，未核到的写 **未找到**。

---

## 1. 色彩与光照

### 1.1 三张表决定整个场景（`src/game/sky/SkyLook.js`）

只有 `environment.sky` 存在时，`Climate.js:showSkyLight / showSkyGrade / showSkyDome` 才写入这三张表；离开天空关原样还原。

```js
// SKY_LIGHT —— 关键帧之外的补充
{ shadowRadius: 4,                                   // 阳光阴影滤波半径 texels（默认 2.5）→ ≈0.1u 半影
  haze: { tint: '#e2d5de', mix: 0.45, lift: 0.06, sun: [18, 40] } }

// SKY_POST —— 后处理与色调曲线
{ toneMapping: 7,                                    // three NeutralToneMapping
  grade: { exposure: 1.0, vignette: 0.1, grain: 0, chromaticAberration: 0,
           highlightsTint: [0.0234, 0.0312, 0.0429],
           shadowsTint:    [0.022, 0.015, 0.026], highlightsWarm: 1 },
  gradeTemperature: 0, gradeSaturation: 1.28,
  viewExposure: { plain: 0.81, open: 0.965 },
  viewFill:     { plain: 1.12, open: 0.9 },
  viewLift:     { plain: 0.8,  open: 1 },
  plainSun: [27, 46] }

// SKY_DOME
{ horizonExponent: 0.28, cloudBand: 0.7 }
```

### 1.2 关键色表（sRGB，`SkyLook.js:SKY_KEYFRAMES`）

Aurelis 固定 10:00 → 取 8.0 `morning` 与 12.2 `noon` 之间插值（t≈0.476）；另给两个极端时段。

| 字段 | morning (8.0) | noon (12.2) | golden hour (17.2) | night (0.0) |
| --- | --- | --- | --- | --- |
| `top` 天顶 | `#246eb2` | `#226ab0` | `#3456a8` | `#040a26` |
| `horizon` 地平线=雾色 | `#a6b6c7` | `#a5b6c6` | `#ffc888` | `#21366c` |
| `bottom` 穹顶下半 | `#8aa6c6` | `#86a4c4` | `#c4a0a8` | `#0c1742` |
| `sun` / `sunI` | `#ffffff` / 3.6 | `#ffffff` / 3.6 | `#ffd48a` / 4.6 | `#82a0ff` / 1.05 |
| `hemiSky` / `hemiGround` | `#aca0b2` / `#d9c9e7` | `#aca0b2` / `#d9c9e7` | `#9a8cb8` / `#e2d2c0` | `#3c5ac4` / `#2e3a74` |
| `hemiI` | 1.5 | 1.5 | 1.5 | 1.7 |
| `fog` / `exp` | 0.0032 / 1.435 | 0.0030 / 1.421 | 0.0029 / 1.58 | 0.0085 / 2.0 |
| `shadow` / `glow` / `clouds` | 0.9 / 0.85 / 0.40 | 0.9 / 0.75 / 0.38 | 0.9 / 1.0 / 0.40 | 0.6 / 0.4 / 0.28 |

**10:00 实跑插值**：`fog ≈0.0031`、`exp ≈1.428`、`sunI 3.6`、`hemiI 1.5`、`clouds ≈0.39`；再乘 `fogScale 0.45` 得**有效雾密度 ≈0.0014**（`Weather.js`：`L.fogMul = T.fogMul * w.fog * this.zoomFog * this.levelFog`）。

**太阳方向**：`config.js:SUN_PATH = { noon: 12.6, lat: 32, dec: 14, refTime: 17.2, refAzimuth: -112 }`；10:00 **仰角 50°、位于前右方**（`SkyLook.js` 头注释 "the 10 h sun 50° up, front-right"）。精确方位角数值**未找到**。两条否决记录很值钱：更低更正面的太阳（40°/34°）把墙照得太白、把大理石的色阶带推离原画；golden hour 用 4.6 而非引擎 6.0，因为 6.0 让大理石顶部到 ≈1.5 线性、三分之一进 bloom。

### 1.3 色调曲线：Neutral（不是 ACES）

`SKY_POST.toneMapping = 7` = three 的 `NeutralToneMapping`（Khronos PBR Neutral）。`SkyLook.js` 注释记录的实测行为：**≈0.76 前近似线性**，之后软肩到纯白；曝光比 ACES 方案高 **≈1.4×**（日）、**≈1.45×**（夜），日出/日落/黄昏只 1.2–1.3×（保色）；**bloom 在曝光前的线性色上取阈值 1.05**，于是「画面的白」来自曲线+曝光而非更亮的线性色。

> three r186 的 Neutral 常量（压缩起点 0.8−0.04=0.76、去饱和 0.15）本仓库无 `node_modules` 可核对；0.76 与注释一致，去饱和系数未验证。

普通 diorama 页（`Game.js:_tunePost`）是 `bloom {0.5, 0.58, 1.05}`、`grade {exposure 1.03, contrast 1.04, saturation 1.3, temperature 0.04, vignette 0.55, grain 0.03, shadowsTint [-0.04,0.05,0.15]}`；天空关用 `SKY_POST` 覆盖成「高调、干净、几乎无暗角」。逐条都有实测理由：`vignette 0.1`（原画 edge-to-edge，暗角毁白云）、`grain 0`/`CA 0`（白尖塔与瀑布细线会出彩边）、`highlightsTint +0.023/+0.031/+0.043`（补绿蓝，把曲线给的白 (252,243,231) 拉回原画的 (253,249,242)）、`highlightsWarm 1`（暖色不吃 lift，否则金条发灰）、`shadowsTint [0.022,0.015,0.026]`（中性偏玫瑰紫；更紫的 `[0.03,0,0.07]` 会把柏树与金子的暗部变紫，金 hue 34–36° vs 原画 35°）。

### 1.4 天空穹顶（`src/engine/lighting/Sky.js`）

BackSide 球 **r=180**、48×24 段、跟随相机平移；`earlyZ` 下 renderOrder=1e6、深度写关，让 GPU 跳过被几何遮挡的天空像素（1600×900 从 0.6 ms → 0.01 ms）。

```glsl
float t = smoothstep(0.0, 1.0, pow(clamp(y,0.,1.), uHorizonExp));  // 默认 0.5，天空关 0.28
col = mix(uHorizon, uTop, t);
float t2 = clamp(-y / 0.9, 0.0, 1.0);                              // 0.9 = 地平线以下的厚霾带深度
col = mix(uHorizon, uBottom, smoothstep(0.0, 1.0, pow(t2, 0.8)));
```

光晕 `halo = pow(cs,8)*0.1 + pow(cs,42)*0.28 + pow(cs,600)*1.1`，低日角水平带 `band = exp(-|y|*8)*pow(az,3)*lowSun`，合计 `×uSunColor*uGlow`，`band` 权重 0.32。日盘**像素化**：`floor(discCoord*6.0)`。云的穹顶层（天空关 `cloudBand 0.7`）：`cp = qd.xz/(max(qd.y,0)+0.15)*2.4 + wind*time`，fbm4，`c = smoothstep(1-cov-0.08, 1-cov+0.2, n)`，`lit = clamp(0.55+(n-n2)*5)`，两通道都 `floor(x*3+0.5)/3` 量化成 3 阶；云格 `uCloudPixel 380` cells/rad ≈ 屏幕 5 px（方向空间量化 → 屏幕尺寸恒定）。

其余默认（`Sky.js` constructor）：`cloudCover 0.45`、`lowerClouds 0.5`、`starDensity 1100`、`sunSize 0.032 rad`、`moonSize 0.026 rad`、`sunIntensity 9`、`wind [0.012,0.004]`。

### 1.5 高海拔大气感（lavender haze）怎么来的

不是「加一层紫雾」，而是**把雾色转向淡紫、但保持它原有的亮度**（`LightingSystem.js:setHaze` ← `Climate.js:showSkyLight`）：

```js
{ tint: '#e2d5de', mix: 0.45, lift: 0.06, sun: [18, 40] }
// 雾色=地平线色，转向 tint 的色相，亮度取地平线自身亮度×(1+lift)，按 mix 混合；
// 且只在太阳仰角 18°–40° 内淡入（日出/黄金时刻/夜保留自己的距离）
```

实测（`SkyLook.js` 注释，Grand Viaduct 处）：远岛 `(189,191,202)`（偏蓝）→ **`(197,190,199)`**，原画 `(195,190,193)`；更强的 tint 会把远岛与云塔洗白，所以 0.45 是上限。雾本身：天空关日间约为本体的 1/3，再用 `environment.sky.haze 0.6` 让云海/远景只吃一部分（`CloudSea.js:skHaze` 内 `fogDensity*uHaze*k*d`，`1-exp(-r*r)`）。远处收口：云海从 `viewZ 300→390` 并入雾色（far=400）。

云海里的空气感（`CloudSea.js:DISTANT_FRAG`，可原样搬到任何远山）：`col = mix(col, air, 0.06 + 0.4*smoothstep(120,340,viewZ))`，`air` 日间 = `mix(luma(A), A, 0.35) * vec3(1.07,1.03,1.04)` —— 「淡紫白，带一点玫瑰与紫，绝不是天空的蓝」。

---

## 2. 云海（`src/engine/world/sky/CloudSea.js`）

**云是几何+着色器穿插，不是贴图。** 三层：云海主平面（900×900 相机跟随、`uSeaY=-26`、ray-march 8 u 厚云层，1 dc）、积云岸（噪声位移 puffs 合并 1 mesh，1 dc）、薄纱（InstancedBufferGeometry 广告牌，1 dc）；加远景岛/峰共 **4 draw call / 4 program / 0 灯 0 阴影**（`SkyScenery.js` 头）。

### 2.1 云噪声（`CloudSea.js:cloudNoiseSteps`）

256² RGBA **half-float**：**R/B** 两个不同 cell 尺寸的 cumulus 高度场（`domes()` = 抖动网格圆顶并集取 max，`q=1-d²/r²` 再 `pow(q,1.4)` —— 圆顶平滑、缝隙陡）；**G** fbm4（`period 4`）低频云量；**A** fbm3（`period 8`）细纹。R 用 `cells [6,13,29,58]`（seed 101），B 用 `[5,11,24,51]`（seed 211）；半径 `0.58+0.4*hash` cells，圆心落在 cell 内 0.15–0.85；`cumulus() = max(big, mid*0.8) + (0.26*small + 0.07*tiny)*(0.3+0.7*head)`（菜花状凸起只长在头部）。

**关键一步 `equalize()`**：把 R/B 高度场**一半程度排序均化**（`0.5*rank/(n-1) + 0.5*v/max`）→ `cover 0.6` 真的对应「60% 海面被云头盖住」，同时圆顶轮廓不被完全均化成锥形。采样周期 `PERIOD_A 128 / PERIOD_B 96 / PERIOD_G 768`，漂移在公倍数 `DRIFT_WRAP 1536` 回绕（不回跳）。

### 2.2 云海主着色器（`CloudSea.js:SEA_FRAG`）—— 可直接抄的参数表

| 项 | 做法 |
| --- | --- |
| 高度场 | `seaField(p) = tex(R,(p+driftA)/128)*0.8 + tex(B,(p+driftB)/96+(0.31,0.67))*0.2` |
| 表面 | `seaY - thick + thick*(0.16*h + 0.84*pow(s,0.8))`，`s=clamp((h-lo)/(1-lo))`，`lo=1-cover` |
| 云量 | `cov = clamp(uCover + (g-0.5)*0.6, 0.04, 0.98)`（g 是 768 u 周期的 G 通道） |
| March | 步数 `n = clamp(ceil(tMax/(1.3+viewZ*0.006)), 5, 20)`，弦截法细化落点 |
| 法线 | 中心差分 `e=0.5`：`normalize(vec3(h0-hx, e, h0-hz))` |
| 自阴影 | 朝光两次采样：`q1=sp+L*1.8`（厚 1.1）、`q2=sp+L*6.5`（厚 2.1），取 max |
| 光照 | `dirL=clamp((dot(n,L)+0.12)/1.12)`；`skCloudLight = (0.32+0.72*dirL*vis)*mix(0.42,1.0,pow(ao,0.8))` |
| 色阶 | `band = skBand(l*4.6, bayer4(floor(sp.xz*4.0)))` → 6 阶（深谷/暗影/影/半光/受光/迎光沿） |
| 抖动 | 4×4 Bayer，仅在色阶边界 ±0.16 内 |
| 岛影 | land mask 沿光投影到 `uMaskY` 采样，`uMaskK 0.4`，夜里 ×0.6 |
| 收口 | `viewZ>392` 直接输出雾色；`skHaze` 在 300–390 并入雾色 |

**6 阶调色函数（`skCloudBand`，全场景最值得抄的一段）**：
```glsl
sh  = uCloudShade * vec3(1.06,1.0,0.92) * mix(vec3(luma(A)), A, 0.2);  // 日间影色加暖，天光只占 20%
sh  = mix(vec3(luma(sh)), sh, mix(0.84,1.0,uNight));                    // 影几乎去饱和
c2  = sh * 1.37;                                                       // 半光：影→玫瑰
lit = uCloudColor*vec3(1.3,1.28,1.22)*(A*0.38+S*0.6)*vec3(1.0,0.968,0.898);
lit *= min(1.0, 0.9/max(luma(lit),1e-4));                              // ★ 受光顶压到亮度 0.9
rim  = uCloudColor*(A*0.3+S*0.74)*... * min(1.06, 1.03/luma(rim));     // 沿 1.03
k<0.5→sh*0.68 | k<1.5→sh*0.92 | k<2.5→c2 | k<3.5→mix(c2, lit*1.04/0.96/0.94, 0.6) | k<4.5→lit | else→rim
```
两个像素风要点：①`lit` 亮度硬压 **≤1.0、rim ≤1.03**，刚好在 bloom 阈值 1.05 之下 → 云的「白」来自曲线+曝光，云不会给整帧蒙纱；②受光面偏暖 `(1.0,0.968,0.898)`，因为 `SKY_POST` 的冷高光 lift 会把它拉回（注释：warmer in linear light than it shows）。

Aurelis 云参数（`make-aurelis.mjs:environment`）：`clouds { y: -26, cover: 0.6, speed: 1, shade: '#e8dde6' }`、`haze 0.6`、`lowerClouds 0.85`、`edgeAO 0.62`。

### 2.3 积云堆叠（`SkyScenery.js`）

- **云塔**：`MAX_TOWERS 17`，顶在 `baseY+10…40`，距地图边 40–210 u，越远越大 —— 天际线上一排白堆。
- **大积云堆**：`MAX_HEAPS 6`，顶在 `baseY+60…120`，只出现在「从地图南缘向北看」的视野两侧：`HEAP_SLOTS = [-32,24,-19,13,-46,36]`（度；东侧槽位更靠北，因为晨光在东南，太靠东的堆会露出阴影面变成一堵淡紫墙），按 `HEAP_STEPS [0,14,28,42,56]` u 外推、`HEAP_TURNS [0,4,-4,8,-8,12]°` 转到不挡主体。
- 堆形由 `heapEnv(t)=sqrt(max(0,1-t^2.4))` 控轮廓，所有 puff 法线向轮廓内倾（light tuck）、阴影面提亮成淡紫白；puff 是低模 icosphere，被完全包住的直接丢三角形。
- **岛脚云领**：每座岛岩石锥穿出云海处生成一圈 collar，专门遮「岩石插进平面」的接缝 —— 极便宜的遮丑技巧。

---

## 3. 浮空岛（`Islands.js` / `FloatingIsles.js`）

### 3.1 岛底：分面高度场 + 倒锥（`Islands.js:islandUndersideSteps` / `IslandSpec`）

整个 128×128 主地图的岛底只有 **3 个 draw call**（rock/moss/crystal 各一 mesh）。做法：把 land mask 当高度场向内逐格下沉，输出**平面分片 shards** 而非平滑锥。

| 参数（`IslandSpec` 默认） | 值 | 含义 |
| --- | --- | --- |
| `cell` / `scale` / `max` | 1 / **1.4** / **40** | 格宽；每向内 1 单位的下沉；低于 `baseY` 的软 cap |
| `rimDrop` / `tip` | 0.5 / **0.5** | 垂直岩壁落差；底部中心额外下沉（占内切圆半径比）→ 越中心越尖 |
| `lobes` / `fins` / `finWidth` | 0.3 / 0.24 / 3.4 cell | 低频深度调制；径向岩鳍深度差与宽度 |
| `facets` / `facetTilt` | **7 cell / 1** | 平面分片间距；每片相对锥面的倾斜与下沉（×cell）—— 岩石感的真正来源 |
| `bend` / `lift` | **0.8** / 0.3 | 着色法线向「水平面上 14°」弯；往下 26 u 逐渐提亮（云底反弹） |
| `pendants` / `spikes` | 1 / 1 | 深悬垂 / 长尖刺（钟乳石）倍数 |
| `moss` / `mossDepth` / `mossCards` | true / **1.9** / true | 草坪下苔藓带深度；垂挂卡片（Alpha 卡） |
| `crystals` / `crystalDensity` | true / 1 | 岩缝水晶簇 |
| `rockUnits` / `topUnits` / `mossUnits` | [2,4] / [4,4] / 1 | 世界 UV（`sky_rock` 32×64、`sky_meadow` 64×64、`sky_moss` 16×16） |
| `ROW` / `SEAM_SUB` | 0.5 / 4 | 侧壁 0.5 u 行；与 TileMap 接缝对齐每单位 4 子列 |

**颜色分层（可抄）**：四朝向固定顶点色乘数，让「朝光暖、背光冷」在任何时段成立：
```js
const WARM = [[0.93,0.96,1.05],  // N 冷
              [1.05,1.00,0.93],  // E 暖
              [1.04,1.00,0.94],  // S 暖
              [0.94,0.97,1.05]]; // W 冷
```
岩石带（`SKY_CITY.md` §2 实测）：受光 `#dbd2d1 #c5b9b9 #ada1a2`，暗部橄榄黑 `#4d493e #38352b #26241b`；苔藓 `#1a1906 … #cbbb66`。暗部是**橄榄/棕黑而非蓝黑**：注释记录暖暗部 `#504640 #3a322c #28221c` 在反弹光下发品红，故改橄榄。

垂向关系（Aurelis 实测）：可行走顶 y=5–10、`baseY 3.5`、主岛底 **≈−36**、云海 `y=−26` —— **岛底穿进云海约 10 u**，看到的是「岩石插进云里」而非悬空；小岛底 −12…−24。

### 3.2 浮空小岛（`FloatingIsles.js:buildFloatingIsle`）

| 项 | 值 |
| --- | --- |
| `kind` | `grass / garden / shrine / ruin / crystal`（决定点缀） |
| `radius` / `depth` / `lift` / `bob` | 4（1–24）/ 7（1–40）/ −6（−60…60）/ 0.3（0–2 u 上下浮） |
| 轮廓 | 4 谐波叠加 `R*(1 + a0 sin2a + a1 sin3a + a2 sin5a + a3 sin9a)`，a=0.06–0.13/0.04–0.09/0.02–0.06/0.015–0.035，长宽比 0.78–1 |
| 网格 | `cell = R≤2.5 ? 0.25 : R≤9 ? 0.5 : 1` |
| 材质 | **3 个**（rock / `sky_meadow` / 一个点缀）→ 3 dc；`bob=0` 时全静态合并 |

Aurelis 18 个：**12 个在城下**（顶 −19…+6）、**6 个抬到城上**（顶 30–43，略高于 vista 相机 y≈22–29）→ vista 看到的是岩石侧面 + 岛上的神殿穹顶/水晶/遗迹柱，不是草坪。这是极重要的构图决策：抬高的岛只展示最好看的那一面。

---

## 4. 建筑（Cathedral / Spires / Civic / Decor / Magic）

### 4.1 大教堂比例（`Cathedral.js:cathedralPlan`）

Aurelis：`width 22, depth 18, height 56, spires 32, roof 'marble'`（`make-aurelis.mjs:SANCTUM.cathedral`）。

| 派生量 | 公式 | 值 |
| --- | --- | --- |
| 檐口高 `He` | `min(H*0.36, clamp(H*0.22, 9, 16))` | **12.32**（=0.22H） |
| 侧廊檐口 `Ha` | `min(clamp(He*0.58,2.8,9.3), He-1.3)` | 7.15 |
| 中殿 / 侧廊 / 耳堂宽 `Wn/Wa/Wt` | `clamp(D*0.31,4.2,9)` / `clamp(D*0.165,1.6,4.4)` / `clamp(min(Wn,W*0.29),4.2,9.5)` | 5.58 / 2.97 / 5.58 |
| 塔宽 `Tw` | `clamp(min(Wa+0.5,(hwE-Wt/2)*0.44),2.2,4.4)` | 3.47 |
| 屋顶坡度 | 中殿 `min(58°, atan((H-2.2-He)/(Wn/2)))`，侧廊 27° | 58° / 27° |
| 灯笼塔顶 `Hl` | `min(H-max(3,0.27H), max(0.5H, ridge+1.8, He+4.6))` | ≈28 |
| 双塔尖 `apexT` | `min(0.79H, H-2.4)` | **44.24** |
| 副尖塔顶 | `tipLo=min(H-2,max(0.45H,ridge+2.5))` → `tipHi=max(tipLo,0.92H)` | ≈25 → 51.5 |
| 针塔细长比 | 半径 `clamp((top-yT)*0.026+0.1, 0.34, 1.0)` | **15–25 : 1**（塔与中尖塔 ≈7:1 更细） |
| 台基 `P` | 0.45 | 教堂地坪相对地面 |

「为什么好看」的实质是**质量分配**：注释写得直白 —— "a forest of needles over a low body, not a block with a crown"。墙身保持人身尺度（0.22H），余下高度全给尖塔；副尖塔顶从 0.45H 分布到 0.92H（永远高于屋脊），**短的一对在前、高的一对在后** → 从前方看是层层叠叠的针林而非等高柱。中尖塔顶点**精确等于 H**（关卡把光柱/光环挂在那点），其余一切在其下。金线：lancet 外描 `GOLD_EDGE.outline 0.2`、灯笼塔/鼓座 `min 0.09`、檐口 0.12、针塔环带 ×1.5、尖端镀金 ×1.8。

### 4.2 白大理石与金：材质参数（`Sheen.js` / `materials.js`）

天空城材质**不是 PBR**，而是 `MeshLambertMaterial` + 一个 `onBeforeCompile` 补丁（`Sheen.js:addSheen`）自己实现程序化环境 —— 所以能零贴图跑。**反照率上限**：大理石 ≤ `#eeeae2`，最亮地板 texel `#eee9de`、墙 `#ebeae0`（`SKY_CITY.md` §2）——因为 bloom 阈值 1.05，白大理石必须「刚好在膝盖下」。

**金属金（`Sheen.js:METAL` + `SHEEN_KINDS.gold`）—— 双 GGX 瓣**：

| 参数 | 值 | 说明 |
| --- | --- | --- |
| `lobes` | `[0.08, 0.3, 0.15, 2.2]` | coat α=0.08；body α=0.3 只占太阳高光 15%；边缘 glint 上限 2.2（线性亮度，可过 bloom） |
| `f0` / `own` / `amber` | `[1.0,0.85,0.64]` / 0.3 / 0.5 | 30% 自身 F0 + 70% 贴图 albedo，albedo 的 F0 往琥珀推 |
| `rim` | 0.4 | Schlick 掠射向白只留 40%（远处金穹顶边缘仍是金） |
| `studio` / `tint` | `[0.23,0.36,0.30,0.81]` / `[1.0,0.9025,1.032]` | 四段「摄影棚」亮度（上/地平线亮带/暗带/下）×城市白；色偏多蓝少绿 → 金落 hue≈32°, sat≈0.62 |
| `zenith` / `sunSide` | 1.25 / 0.8 | 朝上面更亮；朝太阳侧对比更强 |
| `polish` | `[0.35,0.75]` | 只有贴图「亮行」吃 key light，平面屋顶不会整片变白 |
| `shoulder` | `[0.55,0.78]` | 金在高光处按亮度 0.55→0.78 压 → 受光金仍 <L≈230，"stays gold, not white" |
| `glintT` / `rimK` | 0.5 / `[2.5,5.0]` | 只有曲率 2.5–5 rad/unit 的圆边才出 glint（平面分片不算） |
| `sub` | `[1.0,1.4,0.45,0.32]` | **亚像素回退**：1 texel < 1 pixel 时压平 normal map 细节、保留 45% 画好的金 → 细金线运动时不闪 |
| `keep` / `shade` | 0.2 / 0.3 | 保留 20% 画好的金 diffuse；阴影里拿走 30% 环境 |

**大理石 / 磨光石 / 地板（`SHEEN_KINDS`）**：

| kind | `f0` | `gloss` | `spec` | `env` | `rough` | `wrap` | `skyShare` | `shade` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `marble`（墙） | 0.04 | 10 | 0.7 | 0.35 | 0.8 | 0.08 | 0.2 | 0.5 |
| `polished`（柱/线脚/雕像） | 0.04 | 16 | 0.9 | 0.4 | 0.7 | 0.1 | 0.2 | 0.5 |
| `floor`（地板，写反射 mask） | **0.15** | 60 | 0.35 | 1.0 | 0.3 | 0 | 0.3 | 0.6 |

大理石受光光泽 `MARBLE_LIT = [0.35, 0.3, 0.9]`：从 `N·L 0.3` 起、0.9 全开，只加在受光面、夜里不加 → 原画受光大理石 L≥240 占 26%，实测做到 ~30%。

**发光等级（`materials.js:SKY_GLOW`，`{day,night}` = `emissiveIntensity`）**：

| kind | day | night | 用途 / 发光色 |
| --- | --- | --- | --- |
| `glass` | 1.0 | 1.35 | 彩窗（纹理自带色） |
| `window` | 0.5 | 1.3 | 民居暖窗 `#ffc070` |
| `gold` | **0.7** | 1.45 | 建筑金饰，白天在 bloom 膝下 `#ffad4b` |
| `crystal` | 1.4 | 1.25 | 水晶 `#95deff` |
| `rune` | **1.6** | 1.45 | 魔法阵 `#ffcc55` |
| `orb` | 0.9 | 1.45 | 雕像宝珠 `#ffedc2` |
| `magic` | 1.2 | 1.45 | 魔法自己的金（更黄，G/R 0.6 vs 金 0.42）`#ffcc55` |

规则：金要「过 ACES 仍是金」→ **G ≤0.45R、B ≤0.1R**；魔法白天就是光，核心可过阈值烧白而 bloom 保住外围色相。

**金色饰条（`GoldTrim.js`）**：`GOLD_EDGE = { outline: 0.2, line: 0.13, min: 0.09, round: 40 }` —— `outline` 窗/拱/山墙描边（≥3 px）、`line` 檐口/女儿墙/腰线、`min` vista 可见建筑的最细金边。`round: 40°` 是**边缘法线倾斜**：一条平金条上下两条长边法线各向内倾 40°，不改顶点，平条在 sheen 下读作半圆线脚（一条高光线 + 一条琥珀转折面）。所有金条只读纹理**同一行**：`GOLD_MID_V 0.65625`（`#d6a244`）、`GOLD_PALE_V 0.90625`（`#f5ce78`）、`GOLD_GLOW_V 0.84375`；`RIM_ASPECT 2` = 长边 ≥2× 短边的盒面才当边条。Aurelis 镀金量：正面 5.35→**12.16%**、中庭 4.30→9.90%、Grand Viaduct 7.88→**14.01%**。

**共用顶点色乘数**（`Gothic.js:TINT` / `Civic.js`，线性）：
```js
lit:[1.03,1.02,1.0]  reveal:[0.8,0.82,0.9]  soffit:[0.68,0.7,0.8]
deep:[0.56,0.58,0.7] dark:[0.34,0.35,0.46]  goldDeep:[0.8,0.74,0.66]
// Civic: WHITE[1,1,1] SHADE[0.8,0.8,0.86] DEEP[0.56,0.56,0.66] SOFFIT[0.74,0.74,0.82] DOOR[0.8,0.7,0.56]
```
`skyAO(k=0.64, h=1.7)`：地面遮挡 0.64（脚）→1.0（1.7 u），`FOOT_CUTS [0.35,0.8,1.4,2.2]` 让高面在脚部加切分贴地。**所有遮挡都是烘焙顶点色，没有 SSAO。**

### 4.3 窗 / 彩窗 / 玫瑰窗（`Gothic.js`）

`lancet(b,M,o)` 尖券窗、玻璃材质 fit UV（`sky_glass` 16×32 px）、`lancetGlass` 单独画玻璃；`roseWindow(b,M,o)` 玫瑰窗（**具体半径/瓣数参数本次未展开 — 未找到数值表**）。发光 mask：玻璃的 emissive mask 是**彩色**的（窗格自己的淡蓝），其余材质的 mask 是灰的、由材质 emissive 给色相。开口定义在 `pixel/textures/sky.js:PANE_OPENINGS`：`sky_window: { cx: 8, a: 6, ys: 9, yb: 28, R: 0 }`（16×32 画布，半宽 6、起拱 y 9、底 28）。玻璃 5 级色带（实做后）：`#a0bed2 #9ab8ce … #769dbe #567fb1`（蓝被压住，窗格不被裁切）。

### 4.4 光环与光柱（`Magic.js`）

**光柱 `buildLightBeam`**（Lumen：`radius 2, height 96`，从教堂顶点 y=64 起）：
```js
const BEAM_TONES = { gold:  { core:[1.5,1.14,0.62], outer:[0.58,0.31,0.07] },
                     white: { core:[2.2,2.3,2.6],   outer:[0.30,0.52,1.15] },   // ← Lumen
                     blue:  { core:[0.86,1.18,1.52],outer:[0.10,0.27,0.68] } };
const below = r*1.2, coreW = Math.max(0.09, r*0.15);
core quad half = coreW*1.7 + 0.07;   // 外沿 1 texel rim 用 outer 色，核心不与天空糊在一起
glow quad half = r*2.1;
```
片元全部在 16 texel/unit 世界像素网格量化（`xq=(floor(xw*16)+0.5)/16`）。core：`w = coreW*(1-smoothstep(0.3,0.88,rise))*(1+0.6*exp(-h²/r²))`（底部鼓、88% 高收尖），1 texel rim ×`outer*1.7`。glow：`outer*exp(-x²*2.4) + core*exp(-x²*10)*0.16`，`top=(1-smoothstep(0.03,1,rise))²`，底 flare `exp(-fr²*3.2)`，夜里 ×1.35，近处淡入 `smoothstep(r*0.5, r*2.5, 相机距)`。

**光环 `buildHalo`**（11 个；Dawn Halo：`r 15, tilt 12°, spin 0.07 rad/s`，挂在 `terrace + 0.41H` = y=31）：
```js
HALO_GLOW = { day: 2.2, night: 1.4 };   HALO_EMISSIVE = [1.0,0.86,0.58];   HALO_AURA = [1.0,0.62,0.24];
bandWidth(r) = clamp(0.06 + 0.012*r, 0.075, 0.34);        // 环带宽度
ringGap(r,bw) = max(bw*3, 0.22 + 0.02*r);                 // 主带与内细线的缝（刻度转动处）
```
结构 = 环带 + 内细线（大环再加第三外细线）+ 缝里一圈刻度（每 4 个一个小菱形）+ 4 颗宝石 + 大环 8 颗钻石，外套一层 `aura`（`intensity 0.42`，shape `[0,0.5,0,3]`）。**核心远超 bloom 阈值** → 中心烧白、外围留金，就是画里光环的观感。

---

## 5. 高架桥 / 栏杆 / 瀑布

### 5.1 多拱高架（`Viaduct.js:buildViaduct`）

Aurelis 9 座，全部**平桥面 y=6、`arch 0`、轴对齐**；Grand `width 4, piers 16`，其余 `width 3, piers 9–10`（`make-aurelis.mjs:VIADUCTS`）。26 单位跨度被 16 根悬垂桥墩填满 —— 注释称 "the painting's pendants over the void"。

| 构造层（deck 线为 0） | 尺寸 |
| --- | --- |
| 桥面板下缘 `SLAB_BOT` / 檐口 `CORNICE_BOT` / 齿饰 `DENTIL_BOT` | −0.37 / −0.55 / −0.68（`piers<0.7` 不画齿饰） |
| 拱冠离檐口 `CROWN_GAP` | 0.5（给拱缘线与齿饰留空间） |
| 拱缘带 `BAND` / 外凸 `PROUD` / 拱背金线 `EXTRADOS` | 0.28 / 0.04 / 0.1 |
| 桥面抬起 `LIFT` | 0.01（防与岸顶 z-fight） |

**桥墩悬空端饰**（「天空之城」味道的关键）：柱头顶盘 → 金圆线 → 带**发光蓝 lancet** 的方石柱身 → 金环 → 收成方形的漏斗 → 金箍 → **八角倒置尖塔 + 发光金环 + 金尖**。浅桥（`piers<2.5`）只剩板+梁+短金尖坠；`piers<1.5` 的步行桥只留板。拱：`archCurve()` 中 `rise ≥ 半跨` 画正半圆，否则弓形弧 `R=(half²+rise²)/(2·rise)`；拱用射线切割填进矩形桥身（`rayRect`/`rayArch`），拱肩自动裁剪。

### 5.2 栏杆（`Decor.js:balustradeGeom` / `terraceRail`）

「画里的栏杆」= 白瓶柱 + 白金扶手 + 底座，比例随 `h` 缩放（Aurelis 多用 `h=1`「半个村民高」）：
```js
const BALUSTER = [[0,0.74],[0.14,0.44],[0.42,1],[0.72,0.42],[1,0.74]];  // [高度比, 半径比] 花瓶剖面
// 竖向分配（全部 ×h）：底座 0.15 | 扶手 0.10 | 扶手金线脚 0.032
// 底座进深 0.28 | 扶手进深 0.22 | 柱墩宽 0.33 | 柱墩高 h+0.07
// 柱距 panel 2.4 | 瓶柱间距 0.27 | 瓶柱半径 0.075 | 每根 32 三角形（4 段 lathe）
```
`terraceRail`（露台四周）默认 `h 0.8, inset 0.2`、四角大柱墩 + 金 finial。**每根瓶柱 4 段 lathe = 32 三角形**：Aurelis 有 149 段 fence，靠这个数字撑住。

### 5.3 瀑布「白幕直落 + 末段化雾」（`SkyFall.js`）

Aurelis **18 条**，`drop` 固定 **31**（水面到云海上 1 u）、`splash:false`、`width 3–4`、各 1 个迷雾 emitter（`make-aurelis.mjs:FALL_DROP`）。几何是一条 curtain（1 dc）：`lip 0.3`（向水面回卷 0.3）→ 过唇口 → 行参数 `d = D*(k/N)^1.6`（**唇口密、直落段疏**），列数 `cols=max(4,ceil(W*4))`。

剖面函数（直接抄）：
```js
outAt(d)   = 0.04 + 0.3*Math.sqrt(d) + 0.04*(d/D);            // 外偏移：√ 起初快，之后线性
bulgeAt(d) = 0.1*smoothstep(0,1.5,d) + 0.016*d;               // 中段鼓起（侧看也有体）
flare      = 1.25*Math.min(1, Math.sqrt(2/W)*0.9 + 0.1);      // 窄瀑张开成纱，宽瀑保持幕
halfAt(d)  = (W/2)*(1 + flare*smoothstep(0.05,1,d/D)) + 0.03*d;// 2 u 窄瀑 ≈2.25×，6 u 宽瀑 ≈1.5×
```
片元要点：**16 px/unit 世界网格**（`floor(vFall.y*16)` / `floor(vUv.y*16)`，条纹与抖动永不游动）；**水的时间飞行** `tau=(sqrt(V0²+2Gd)-V0)/G`（`V0 1.5, G 2.2`），条纹沿 `tq=tau-t` 取常数 → **越落越快、越拉越长、永不剪切**；配色（sRGB→线性）`body #f6f1ec`、`deep #d0d8ee`、`dark #98a8d4`、`light #fffaf6`、`foam #ffffff`、`mist #f6f4f4`，`BRIGHT 0.9`（白水散射，压在 bloom 膝下）。**末段化雾**：`DISSOLVE_AT 0.7` 后 `dens=clamp((1-dis)*1.45 - dis*(1-clump)*1.05)`，4×4 Bayer `discard` 打孔 + `albedo→mist`（`smoothstep(0.05,0.75,dis)*0.85`）→ 底部完全消失，**无硬边、无水面、无溅射**。边缘 `edgePx=(hw-|lat|)*16`，`fray=(1+7*frac+10*dis)*noise` 随下落越来越碎（两级附加 discard）。受光法线向上偏 `+vec3(0,1.1,0)`（落水散射天光），白天主要取亮度（`lmNeutral(irr,0.7)`，否则 mauve 把白水染粉）；随机水滴 `step(0.988,…)` × `sunColor*2.0` 进 HDR 闪。迷雾：0.76D→0.92–0.96D，`count=24+7W`（短瀑 `10+3.5W`），`life [2.8,4.8]`、`size [1.05,1.85]→3.8`、`alpha 0.2`、`#faf7f6→#ebe8f0`。

---

## 6. 相机与构图

### 6.1 基础相机（`make-aurelis.mjs:environment` + `SKY_CITY.md` §3）

| 项 | 值 |
| --- | --- |
| 关卡默认 | `camera { distance: 32, pitch: 32 }`，fov **28°**，zoom 18–42，yaw ±60° |
| 高台 | `highGround { minY: 7.6, pitch: 36 }` |
| pitch 32° 的含义 | 画面上边缘朝下 18° → **正常游玩永远看不到地平线与穹顶**（HD-2D 立身之本） |
| 岛面视野 | 玩家南 ≈9 u 到北 ≈27 u；玩家处竖线切在 ≈7.6 u |
| 雾起点 | `setFogStart(dist − 7)`（`Game` / `CameraVistas.apply`） |

### 6.2 Vista 数据（`make-aurelis.mjs:VISTAS`，共 18 个）

| vista | 矩形 (minX,maxX,minZ,maxZ) | pitch | dist | lift | fov | yaw | blend | dof |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Grand Viaduct | 59,69, 66.5,92 | **8** | **40** | **15** | **58** | 0 | 6 | **0.1** |
| 教堂正面 | 50,78, 30.5,41.5 | 8 | 44 | 14 | 52 | 0 | 4 | 0.15 |
| 光庭 Court | 54,74, 41.5,60.5 | 10 | 40 | 14 | 54 | 0 | 6 | 0.25 |
| Arrival Terrace | 60,68, 97,113 | 8 | 44 | 13 | 52 | 0 | 8 | 0.15 |
| South Lookout（俯冲） | 59,69, 115,119 | **58** | 40 | 0 | **30** | 0 | 3 | **0.6** |
| Morning Lookout | 81,91, 59,67 | 58 | 40 | 0 | 30 | −12 | 3 | 0.6 |
| Cloister Lookout | 37,47, 59,67 | 9 | 42 | 14 | 56 | **−26** | 3 | 0.2 |
| Pendant / Ewan Lookout | — | 9 | 42 | 12 | 54 | +29 / −30 | 3 | 0.2 |
| Observatory | 111,122, 37.5,47 | 9 | 38 | 9 | 50 | 0 | 4 | 0.25 |
| 水晶小岛 ×2 | 14,27, 11.5,21 / 100,111, 11.5,18 | 9 | 36 | 9 | 50 | 0 | 4 | 0.25 |
| Aster / Athenaeum 桥 | — | 10 | 36 | 9 | 52 | ∓6 | 4 | 0.15 |
| Dawn / Lantern 登陆 | — | 9 | 38 | 10 | 52 | ∓6 | 4 | 0.15 |
| Morning / Quay Span | 36,52 / 76,92, 95,101 | 8 | 44 | 13 | 52 | 0 | 8 | 0.15 |

合法范围（`CameraVistas.js:readVista`）：`pitch 8–80°`、`distance 8–90`、`lift −5…30`、`fov 16–70°`、`yaw ±60°`、`dof 0–1.5`、`blend 0–30`（默认 4）、`MAX_VISTAS 128`。权重 = 矩形内 1，外按到矩形距离 smoothstep 衰减 `blend` u；总和 >1 归一化；**两个 vista 边缘相距 b、各自 blend=b 时权重互补为 1**（smoothstep(t)+smoothstep(1−t)=1）→ 走路时相机直接滑进下一个取景、永不「回落默认」。权重走两级一阶低通，`EASE = 0.55 s`（≈1.2 s 到 63%）。

### 6.3 标题全景机位（`environment.titleCamera`）

```js
titleCamera: { x: 64, z: 96, y: 6, driftX: 6, driftZ: 3,
               distance: 58, pitch: 8, fov: 52, lift: 14, yaw: -10, dof: 0.15 }
```
站在 Arrival Terrace 上空、**58 u 距离 + 8° 俯角 + 52° 广角**，把 Grand Viaduct→教堂、Dawn Halo 环、Lumen 一次收进首帧；`driftX/driftZ` 给一点漂移，`yaw −10` 让轴线略斜切（避免完全对称的死板）；之后 glide 到 spawn 默认机位（`CameraVistas.snap()` 让权重瞬移但保留 pitch 缓动）。

### 6.4 为什么这些机位好看（可量化）

1. **地平线 36% 法则**：`lift ≈0.3×distance`、`tan(pitch)/tan(fov/2) ≈0.25–0.3` → 地平线在画面高度 ≈36%（`aurelis.md` §Camera vistas 明文经验式）。地平线低于 50% = 天空主导 = 仰望感。
2. **角色占比**：这些 vista 下玩家高 **36–49 px** —— 建筑群是主角，人是尺度参照。
3. **过桥不转向**：矩形/blend 带含桥或桥口时 yaw ≤6°。原因很实在：yaw 会一起转走路基向量，3–4 u 宽桥面上会撞栏杆（注释记录 −14…−40° 时「5–7 s 只走 5–6 u」）。**转向的非对称机位只留给 lookouts**（没有桥口）。
4. **俯冲 vs 回望**：两个 `pitch 58 / fov 30` 俯视（长焦压缩看深渊）＋ 三个 `pitch 9 / yaw ±26–30°` 回望城市 —— 同一关卡给两种完全不同的镜头语言。
5. **抬高岛只露好面**：抬到 y 30–43 的 6 个浮空岛刚好比 vista 相机（y 22–29）高一点，于是看到岩石侧面 + 神殿穹顶 + 遗迹柱，而非草坪。

---

## 7. 后处理（`SKY_POST` / `PostFX.js` / `FloorReflections.js` / `GodRays.js`）

### 7.1 天空关的 PostFX 链与数值

链：`MSAA HDR scene target → [floor reflections stage] → DOF(tilt-shift) → bloom(UnrealBloom 变体) → OutputPass(Neutral) → grade`。

| 阶段 | 天空关 | 普通 diorama（`Game.js:_tunePost`） |
| --- | --- | --- |
| bloom 阈 / 强度 / 半径 / knee | **1.05 / 0.5 / 0.58 / 0.35** | 同（knee 在 `BloomShaders.js:smoothWidth`） |
| DOF `maxBlur` | **13**（vista 再 ×`dof 0.1–0.6`） | 13 |
| DOF `tiltShift / tiltWidth / tiltCenter` | **0.42 / 0.3 / 0.5** | 同（cinematic 0.5 / 0.26） |
| DOF `focusRange/nearScale/farScale/bokehBoost` | 6 / 1.5 / 1.15 / 1.6 | 同 |
| grade exposure / vignette | **1.0 / 0.1** | 1.03 / 0.55 |
| grade grain / CA / saturation | **0 / 0 / 1.28** | 0.03 / 0.0015 / 1.3 |
| grade highlightsTint / shadowsTint | `[0.0234,0.0312,0.0429]` / `[0.022,0.015,0.026]` | `[0.06,0.03,-0.02]` / `[-0.04,0.05,0.15]` |

bright pass 用**带二次软膝**的变体（`shaders/BloomShaders.js`），理由是朴素 hard threshold 会让每块受光面都 bloom 把画面洗白：
```glsl
float knee = max(smoothWidth, 1e-4);                     // 0.35
float soft = clamp(br - luminosityThreshold + knee, 0.0, 2.0*knee);
soft = soft*soft/(4.0*knee);
float contrib = max(soft, br - luminosityThreshold) / max(br, 1e-4);
```
`viewExposure / viewFill / viewLift` 是「按相机开放程度微调」的三组乘数：普通俯视 ×0.81 曝光（只看受光白地板会过曝）、vista 全开 ×0.965；`viewFill` 反过来（普通 1.12 让阴影更亮）；`plainSun [27,46]` 表示这些只在太阳仰角 27–46° 生效（黄金时刻与黎明保留 keyframe 自己的灯）。

### 7.2 地板镜面反射（`FloorReflections.js`）—— 屏幕空间，但只对平面地板

sheen 写场景时把 `1 − reflectivity` 写进 HDR target 的 **alpha**（只在 `SHEEN_MASK` 打开时、只对法线朝上 y≥0.92 的地板 texel）；金写 `GOLD_MARK 5`；水池 alpha `1+32`。再由 `PostFX.setSceneStage` 跑两遍全屏：
1. **march（½ 分辨率）**：地板点 → 关于世界上方向镜面反射视线 → 沿射线在 resolved depth 上步进（≤**48 步**，命中 `thickness 0.45` u 内算，二分 5 次）；
2. **composite（全分辨率）**：`colour + k·w·strength·(hit − env(R))`，`k = 1−alpha` —— 所以**「没命中」与「没反射」长得一样**，这是它与程序化环境无缝共存的关键。

`REFLECT_DEFAULTS`：`steps 48`、`farStep 16`（½-res px）、`maxDistance 72`、`thickness 0.45`、`strength 2`、`steep 2.5`（俯角 `steepFrom 14°`→`steepTo 26°` 淡入，给深色反射加权）、`darken 0.4`、`footprint 1`、`soft 0.12/softMax 2.5`、`along/across 0.5`、`farTexel 3`、`crease {strength 0.2, r 2, to 1.5, jump 0.4, far [0.05,0.1], coherence 0.5}`、`bounce {strength 0.9, tint [1.0,0.78,0.68], gain 5, sigma 0.75, sun [0.35,0.75], white [0.55,0.85]}`。存储：½-res RGBA16F + 全分辨率 RGBA16F（1600×900 ≈14 MB）+ 两个 ½-res R8（≈0.7 MB），**5 个 program**；实测 0.32–0.65 ms（GTX 1060 / 1600×900）。

**更便宜的替代（我的用法）**：地板是水平面 + 相机固定俯角 → 用**一次镜像渲染到低分辨率 RT（平面反射）+ 法线扰动**，或更省：把城市镜像烘进一张 256² 环境贴图，地板只做 Fresnel 混合。这个场景 99% 的反射是「地板上的竖直高光条」与「金色暖反弹」，平面反射 + Fresnel 就能拿到八成观感。

### 7.3 神光（`GodRays.js`）—— Aurelis 里**没有用**

`environment.godRays: false`（`aurelis.md` §Environment：「the Lumen replaces them」）。若要用，默认：`steepness 0.45`（0=真太阳角，1=垂直）、`color #fff1d8`、`nightStrength 0`、`nearFade [5,13]`、`fadeHeight 2.2`、`gain 0.28`、`horizonFade [0.19,0.27]`；横向 `exp(-x²*3.2)`，两个 vnoise 沿轴条纹，`breathe = 0.82+0.18sin(t*0.35)`，光色 `mix(luma(sunColor), sunColor, 0.72)`（"beams read as pale warm light, not orange paint"）。每根是绕自身轴 billboard 的 quad，散布参数 `length 11–17 / width 1.4–3.4 / intensity 0.55–1.0 / topWidth 0.55–0.85`。

---

## 8. 性能预算（`SKY_CITY.md` §7/§12.5/§13.5/§14.5 实测）

| 项 | 数值 |
| --- | --- |
| Draw call（含 shadow pass） | **≤300 / 视图**；实测最高：西南建立视角 297、标题 296、Arrival 292、Pendant Lookout 288、Grand Viaduct 278/266、光庭 207、教堂前 174、Observatory 134、水晶小岛 81/85、普通 spot 106–125 |
| 三角形 | **0.8–1.56 M** |
| 点光源 | **16** = 12（18 灯柱 + 教堂 2 + 3 长桥灯，池化共用）+ 4 盏 parked VFX 灯；"never add a light, never toggle visible" |
| 阴影图 | **1 张 2048²**（vista 不改太阳视锥，实测无差别） |
| Program | 加载 **68 = 68**（跑完 22 vista + 多时段）；`?look=cinematic` 72 = 72。逐轮 59→66→68 |
| 动态 mesh | **≤40**（Aurelis 实际 16 个动画道具） |
| 纹理 | **26 张**全程序化，16 px/世界单位（`PPU`）；最大 256²（`sky_paving`），多数 16²–64² |
| 加载 | 5.18–5.67 s（dev server），世界构建 2.16 s |
| 云海/远景 | **4** dc / 4 program / 0 灯（云海+岸+薄纱+远景各 1） |
| 岛底 / 浮空岛 | 主地图 **3** dc（rock/moss/crystal）；每座浮空岛 **3** dc |
| Sky dome | 1 dc，`earlyZ` 让被遮挡像素 0 成本（0.6 ms → 0.01 ms） |

省的做法：①**一个材质一个 batch**（`skyMaterials` 每个名字只允许一个固定 `extra`，整城被 `mergeStatic` 折成少数批）；②惰性 kit chunk（不用天空 kit 的关卡一字节不下载）；③`spin:0` 的静态道具合进批次，只有转动的 1–3 个 mesh 单独存在；④亚像素回退（`sub`）+ 顶点烘 AO，避免远处高光闪烁；⑤岛/云 puff 被包住的丢三角形。**复杂度几乎全在片元**（云海 march、sheen、水），几何极省（低模、平面分片、4–8 段 lathe、billboard 卡片）→ 瓶颈是分辨率而非多边形，这也是它能靠 `ResolutionGovernor` 降分辨率的原因。

---

## 9. 纯 WebGL2 复刻清单（零素材、单文件）

**天空**
- BackSide 球（r=180, 48×24），顶点 `gl_Position.z = w*0.99999` 钉远平面，深度测开/写关/renderOrder 最大 → 被挡住的像素免费。
- 渐变 `smoothstep(0,1,pow(y,0.28))` 混 horizon→top；`y<0` 用 `mix(horizon,bottom,smoothstep(0,1,pow(-y/0.9,0.8)))`；三色取 keyframe 表。
- 太阳 `pow(dot,8)*0.1 + pow(dot,42)*0.28 + pow(dot,600)*1.1` + `exp(-|y|*8)*pow(az,3)*lowSun*0.32`；日盘在方向空间量化（半径 0.032）—— 别画抗锯齿圆，像素盘才是这套画风。
- 云：fbm4 + `smoothstep` 覆盖 + **3 阶量化**，云格方向空间量化（380 cells/rad ≈5 px）。

**云海**
- 900×900 跟随相机平面 y=−26；`tMax=thick/-rd.y`，步数 `clamp(ceil(tMax/(1.3+viewZ*0.006)),5,20)`，弦截法求首个 `y<surface` 点。
- 高度场用 **256² R8**（canvas 一次性烘 `domes()` 并集）或两次 4-octave Value noise 近似；核心公式 `surface = seaY - thick + thick*(0.16h+0.84*pow(s,0.8))`、`s=clamp((h-lo)/(1-lo))`。
- 光照只要两项：朝光 2 次自阴影 + `(0.32+0.72*dirL*vis)`，`ao` 用高度。
- **6 阶 + 4×4 Bayer**：`band=floor(l*4.6+(bayer4-0.5)*0.32+0.5)`，6 条色（`sh*0.68 / sh*0.92 / sh*1.37 / mix(sh*1.37,lit,0.6) / lit / rim`），`lit` 亮度硬压 ≤1.0、rim ≤1.03；`viewZ>300` 起并入雾色。
- 云塔**不做几何**：在天空 shader 地平线以上加一层 fbm 云 + 天际线一条高对比云带，单文件性价比最高。

**浮空岛**
- land mask（fbm/SDF 生成 2D 岛形）当 heightmap：顶 y=0，向内每 tile 沉 1.4，`depth=min(40, 1.4*distToEdge + 0.5*inradius)`，叠加 `lobes` 低频 + `fins` 径向差 + **`floor(p/7)` 每格随机下沉与倾斜**（这就是岩石感来源，比平滑噪声像岩石）。
- 高度场缝三角网（每 tile 2 三角，128² 也就 32k 面）；法线 `n=normalize(mix(faceN, normalize(vec3(fx,0.25,fz)), 0.8))`。
- 顶点色：4 朝向固定乘数 `N[0.93,0.96,1.05] / E[1.05,1,0.93] / S[1.04,1,0.94] / W[0.94,0.97,1.05]` + 高度提亮（往下 26 u）。
- 苔藓/根用 2 张程序化抖动淘汰卡片（`discard`，v=1 在顶），沿轮廓外缘撒；水晶 3–4 个刻面棱锥 + emissive。**务必让云海平面穿过岛底约 10 u**，这是悬浮感的全部来源。

**城市（白+金）**
- **一个 Lambert-ish shader + 程序化纹理**：大理石 64² ashlar（4×4 u 重复、2 u 一层、浅缝）、金 16²、岩石 32×64 竖层理；也可退回「顶点色 + 程序化噪声」远看几乎一样。
- 反照率上限 `#eeeae2`（否则 bloom 洗白）。
- sheen 最小实现：`F0=0.04` + 太阳 lobe（`pow(max(dot(R,L),0),gloss/4)*(gloss+8)/8π*NdotL*spec`）+ Fresnel 环境；金用双 GGX（α 0.08/0.3，body 权重 0.15）+ 四段 studio `[0.23,0.36,0.30,0.81]×cityWhite` + shoulder 0.55→0.78。
- 金线**别做几何**：直接在 UV 空间 `fract` 描 0.2 u 宽的亮线；观感的 70% 来自「细而亮」，实在要 rim 法线再做。

**教堂**
- 按 `cathedralPlan` 比例生成：`W22 D18 H56`、檐口 `0.22H`、`58°/27°` 屋顶、`32` 尖塔（tip 0.45–0.92H，细长比 1/15–1/25）、双塔 `0.79H`、中尖塔顶点**精确 = H**。
- 尖塔 = 8 边 lathe（4–8 段足够），每根 3 金环（0.35/0.6/0.85 处）+ 镀金尖端 12–13%。
- 玫瑰窗 = 圆盘 + `fract(atan2)` 扇区 + 同心环，fragment 里画即可，不用几何。
- 光环 `r 15, tilt 12°`、带宽 `clamp(0.06+0.012r,0.075,0.34)`、emissive `[1.0,0.86,0.58]×2.2`（远超阈值 → 核心烧白）；Lumen 光柱 = 竖向 billboard quad，核心 `(2.2,2.3,2.6)`、外辉 `(0.3,0.52,1.15)`，16 px/unit 量化。

**光效总则**
- 一切「光」= **emissive + 阈值**，不是后处理叠片；金的发光守住 `G≤0.45R, B≤0.1R`，魔法可过热。
- bloom 阈值 1.05 / 强度 0.5 / 半径 0.58 / 软膝 0.35；bright pass 用二次软膝，别用 hard cutoff。
- 光柱/光环核心**必须不透明且写深度**，否则 DOF 会糊掉它。

**瀑布**
- 一条 ribbon：`lip 0.3` 回卷 → `d=D*(k/N)^1.6` 取行 → `outAt/bulgeAt/halfAt` 三条剖面函数直接抄。
- fragment：16 px/unit 网格 + `tau=(sqrt(V0²+2Gd)-V0)/G`（`V0 1.5, G 2.2`）+ 白/淡蓝条纹 + `frac>0.7` 后 Bayer discard 化雾 + `albedo→mist`。
- 不做水面、不做溅射 —— 底部「消失在空中」就是原设计的全部意图。

**后处理**
- **Neutral 色调曲线**（≈0.76 起压、软肩到白）+ **曝光 ≈1.43**（10h）。
- tilt-shift DOF：屏幕纵坐标做清晰带（`center 0.5, width 0.3, maxBlur 13`），2 次可分离模糊 + CoC 权重；**比真 DOF 便宜一个数量级，2.5D 俯视下观感几乎一样**。
- **SSR 用平面反射代替**（水平地板 + 固定俯角）：镜像渲染到 ¼ 分辨率 RT + 水平模糊 + Fresnel/alpha 混合；单文件里更省的是「程序化镜像渐变 + 金色暖反弹贴图」。
- 暗角 **0.1**（不是 0.55）、颗粒 **0**、色差 **0** —— 天空关要干净；可选 `highlightsTint [0.023,0.031,0.043]` 补冷、`shadowsTint [0.022,0.015,0.026]` 给暗部一点玫瑰紫。

**相机**
- 默认 `pitch 32° / fov 28° / distance 32`（永远看不到地平线），高台 `pitch 36°`。
- 若干 **vista 矩形**：内部插值到 `pitch 8 / dist 40–44 / lift 13–15 / fov 52–58 / dof 0.1–0.25`，外部 smoothstep 衰减 `blend 4–8`；权重一级低通 0.55 s。
- 构图公式 `lift≈0.3×distance`、`tan(pitch)/tan(fov/2)≈0.25–0.3`；俯深渊 `pitch 58/fov 30/dof 0.6`，回望城市 `pitch 9/yaw ±26–30/dof 0.2`。
- 标题 `dist 58 / pitch 8 / fov 52 / lift 14 / yaw −10`，配 ±6/±3 漂移。

---

**精读覆盖**：`src/game/{sky/SkyLook, CameraVistas, CinematicLook, AtmosphereFog, Climate}.js`、`src/engine/{lighting/Sky, render/PostFX, render/shaders/BloomShaders, fx/GodRays, world/SkyKit, world/SkyKitParts}.js`、`world/sky/{CloudSea, Islands, FloatingIsles, Cathedral, Gothic, Spires*, Civic*, Decor, Magic, GoldTrim, Sheen, FloorReflections, materials, Plants*, SkyFall, Viaduct, Street*, SkyScenery}.js`（* 仅索引/常量）、`pixel/textures/sky.js`、`tools/make-aurelis.mjs`、`docs/contracts/SKY_CITY.md`（§2/§3/§7/§12.5/§13.5/§14.5）、`docs/design/levels/aurelis.md`。
