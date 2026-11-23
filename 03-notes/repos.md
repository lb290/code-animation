# 参考仓库清单

抓取时间 2026-11-18，全部 `git clone --depth 1 --single-branch`，落在 `F:\AI\dsh\research\refs\`。

| 本地目录 | 仓库 | 体积 | HEAD | 定位 |
|---|---|---|---|---|
| `varghq-skills` | [vargHQ/skills](https://github.com/varghq/skills) | 11.6 MB | 55ac28d | 83 个 agent skill，代码动画/视频的"工程说明书" |
| `fable52-prompts` | [tong0619453646-dev/awesome-claude-fable-5.2-video-prompts](https://github.com/tong0619453646-dev/awesome-claude-fable-5.2-video-prompts) | 0.6 MB | 52e176e | 33 个 Fable 5.2 案例的原始提示词 + 成片 |
| `fable-vfx` | [bhavya-gx/fable-vfx](https://github.com/bhavya-gx/fable-vfx) | 0.3 MB | d89e97e | 纯 Python(numpy/PIL) 的成片级 VFX 管线 |
| `code-animation-prompts` | [XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts) | 112 MB | 2e6396a | 341 种代码动画风格提示词 + 196 张参考静帧 + 离线挑选器 |
| `remotion-template` | [remotion-dev/template-helloworld](https://github.com/remotion-dev/template-helloworld) | <0.1 MB | 01cb8eb | Remotion 官方最小模板：帧驱动/合成元数据 |
| `manim` | [3b1b/manim](https://github.com/3b1b/manim) | 2.0 MB | fafa083 | ManimGL：缓动函数与错峰动画的数学源头 |

放弃：`remotion-dev/remotion`（4.4 GB）、`processing/p5.js`（180 MB）超限，改用其模板/子集。

---

## 1. vargHQ/skills

83 个 skill，每个 `<skill>/SKILL.md` + `references/` + `scripts/`。与"代码生成动画"直接相关的是 `blender-code-film`、`code-3d-explainer`、`code-game-trailer`、`code-path-traced-film`、`code-to-video-previz`、`video-sound`、`transition-craft`、`paper-shaders`、`kinetic-type-art`、`threejs-animatic`、`short-form-ffmpeg-cookbook`。

值得学的 3 点：

1. **片子必须是数据，不是一串 if**。`code-path-traced-film/scripts/smallest-star/timeline.json` 一个文件同时被画面（`src/shots.js`）、配乐（`audio/score.py`）、组装（`post/compose.py`）读取：`shots[]` 有 `id/start/dur/mood/action/caption`，`events[]` 有 `t/type/until/every`，`narration.lines[]` 有 `t/file/text`。改一处时间，画面、音乐、字幕、混音全部跟着走。
2. **stills-first +  kontakt 表 + 独立 critic**。`blender-code-film/SKILL.md` 规定：`--stills --draft` 每镜头一张四分之一尺寸静帧（<1 s/张）→ 交给**全新 subagent** 打分 → 全尺寸静帧给用户点头 → `--draft` 每帧四分之一 + 每 12 帧拼 contact sheet 查穿模/闪烁/曝光 → 才最终渲染。`code-3d-explainer/references/critic-prompt.md` 更极端：critic 只读 factsheet 与图，输出 `VERDICT: PASS | PASS WITH FIXES | FAIL` + 表格，且"写的人不许给自己打分"。
3. **时间轴与节拍是硬约束**。`references/look.md` 把"夜戏"拆成可抄的数字：月亮辐照度 `0.42×(0.44,0.62,1.0)`、`sky=0.46` 而 `skyVis=0.16`（可见天空必须比照明天空暗）、雾 `0.007/单位`、火虫光 `0.3/3.6/7.5`、bloom `0.22 above 0.9`、vignette/saturation/contrast `0.42/1.10/0.25`、每像素 20 samples。`transition-craft/SKILL.md` 的 10 条通则（峰值压在强拍、核心只有 0.10–0.40 s、zoom 走 log 空间、`A·sin(2πft)/e^(decay·t)` 抖动、180° 快门 5–10 samples、Murch 51/23/10/7/5/4）。

## 2. tong0619453646-dev/awesome-claude-fable-5.2-video-prompts

33 个真实案例（WebGL / Three.js / Remotion / Blender / 游戏 / LilyPond 音乐），每条给"原始提示词 + 成片 + 作者"。

值得学的 3 点：

1. **先选路线再写提示词**。README 明确五种路线：单文件 HTML+Canvas/WebGL；Three.js + `window.renderAt(t)` 帧时钟；Remotion/HyperFrames 工程；Blender/LilyPond 本地工具；以及"每次都要写死"的四件事——**时长 + 分辨率 + fps + 你提供的素材**。
2. **可截帧接口是分水岭**。voxel Paris 那条：`"…14-second animation (1280x720, 30fps, deterministic: expose window.renderAt(t) so every frame can be captured)"` —— 与 XiaoyeCodes 的 `renderAt` 约定完全一致，说明这已是社区共识。对纯 CPU 管线，等价物是 `def render(t) -> PIL.Image`。
3. **一句话也能出片，但要付出算力**：作者们自报成本 $7.48 / $8.43 / ~$21，60 s 片用 subagent 跑 57 分钟；说明"长片 = agent loop + 可断点续渲"，不是单次调用。

## 3. bhavya-gx/fable-vfx

一个 30 s 成片的全部代码，MIT，可直接读。目录就是一条管线：`render.py`（prep/matte/plate/stills/render/sfx/mux/sheet）+`vfx/{grade,media,ocean,scene,sfx,sprites}.py`+`configs/fable-5-2.json`。

值得学的 3 点：

1. **配置文件是唯一的"魔法数字仓库"**。`docs/how-it-works.md` 结尾一句是全部经验的浓缩："第一版把这些数字当常量写在一个文件顶部；把它们搬出去，就是'我做了一个视频'和'我做了一个别人能用的工具'的全部区别。"
2. **numpy 版的海洋**（`vfx/ocean.py`）：13 个正弦分量，波长 `0.7·1.42^i`，深水色散 `w=sqrt(g·k)`，振幅按"一个波长覆盖几个像素"衰减防走样；Fresnel `0.03+0.97(1-n·v)^5`；太阳镜面 `rs**380*7 + rs**28*0.30`；最后 `GaussianBlur(1.6)` + `bloom=blur(clip(img-0.95))×0.8`。整段没有 GPU。
3. **调色写成 3D LUT**（`vfx/grade.py`）：先算色相距离 `w=1-smooth(dist,13°,27°)`（皮肤离黄色 ~30°，所以不动皮肤），只在该带内去饱和，再 `mid_lift*4*x*(1-x)*(0.55+0.45*(1-x))` 提中间调，`0.90*x+0.10*smoothstep(x)` 轻微加对比，整体饱和度 ×0.97；`write_cube()` 输出 33³ 的 `.cube`，**ffmpeg lut3d 与 numpy 得到同一结果**。

## 4. XiaoyeCodes/code-animation-prompts（要求单列）

341 条风格提示词（A–G 带参考代码样片 / M 叙事动态 / K 卡通 / Z 中国风 / H 版式 / L,V,X 第三方 / O 电影参考）、196 张静帧、`skills/code-animation-prompts/scripts/styles.py` 检索、`scripts/render_video.py` 用 Playwright 逐帧截图 + ffmpeg 编码。

值得学的 3 点：

1. **把"风格"编译成可执行规格**。最好的样例 `assets/library/风格提示词/A-G_代码样片/B3_粒子聚形.md` 不是散文，而是：固定 `N=5000`、`PER=4.8 s`、`SC=1080×0.36`、中心 `(960,520)`；给出形状的隐函数 `(x²+y²-1)³-x²y³≤0`；给出二次贝塞尔位置公式 `P=(1-e)²A+2(1-e)eC+e²B`；给出拖尾做法（**不存历史帧，而是用 t、t−0.045、t−0.09 重算三次**）；给出字幕淡入淡出窗口（`q∈[0.3,1.0]` 淡入、`[2.1,2.5]` 淡出）；最后是"不要"清单（不要爆炸闪光/不要彩虹/不要在 draw 里存状态）和自检三问。
2. **画面 = 时间的纯函数 + 固定种子**。`references/rendering.md` 定死接口 `window.renderAt = async function(t)`；页面带 `?export=1` 时停掉 rAF 与 CSS 自播放动画，只由 `renderAt(t)` 推进；随机统一 `mulberry32(2026)`，启动时生成一次，`draw` 内禁止累积状态、禁止 `Math.random`。这正是"同一 t 渲两次必须逐像素相同"的验收标准。
3. **索引先行，别一次加载 341 条**。`references/catalog.json` 只有编号/名称/标签/路径；`styles.py search|show|list` 先筛再读；并明确"A–G 有代码、M 是运动/叙事、K/Z/R 是画风、H 是版式"，**不要机械叠加多个风格的全部约束**，而应让"主画风 / 运动方式 / 版式"各司其职。145 条没有静帧的要明说"文字参考"，不许编造截图。

## 5. remotion-dev/template-helloworld

值得学的 3 点：

1. **合成元数据前置**：`<Composition id durationInFrames fps width height defaultProps/>`，`src/Root.tsx` 就是"片单"。对应到 Python 就是 `{"id","duration","fps","W","H","props"}`。
2. **动画只写关键帧+缓动**：`interpolate(frame, [i*5, i*5+fps], [0,1], {easing: Easing.spring({damping:200}), extrapolateLeft:"clamp", extrapolateRight:"clamp"})` —— 帧号是唯一输入，没有增量状态。
3. **逐词错峰**：`titleText.split(" ").map((word,index)=>…)`，每词延迟 `index*5` 帧，是"文字动效"最省代码的做法。

## 6. 3b1b/manim

值得学的 3 点：

1. **缓动函数库**（`manimlib/utils/rate_functions.py`）：`smooth(t)=t³(10s²+5st+t²)`（首末一二阶导为 0）、`rush_into=2*smooth(t/2)`、`rush_from`、`slow_into=sqrt(1-(1-t)²)`、`there_and_back`、`overshoot`（贝塞尔 `[0,0,1.5,1.5,1,1]`）、`wiggle`、`squish_rate_func(f,a,b)`（把任意缓动压进时间窗 [a,b]）。这套函数比 CSS 的 cubic-bezier 更好移植到 numpy。
2. **lag_ratio 错峰公式**（`manimlib/animation/animation.py`）：`full=(n-1)*lag+1; a_i=rate_func(clip(alpha*full - i*lag, 0, 1))` —— 一行实现"逐个入场"，numpy 里 `np.clip` 即可。
3. **动画即"两端状态 + 内插"**：`begin()` 里 `starting_mobject = create_starting_mobject()`，之后只做 `interpolate(alpha)`；这提示我们每帧渲染应能由 `(state_from, state_to, alpha)` 重建，而不是靠上一帧累积。

## 反例/坑（来自各仓库的 traps 章节）

- 8 bit 渐变在暗场必须加颗粒，且**颗粒要加在时域滤波之后**（path-traced-film 的 encode 链）。
- 慢动作只让 `dt` 变小是安全的，快进会撞上引擎的 `dt` clamp（`code-game-trailer/references/virtual-clock.md`）。
- `pow(x,2.0)` 在负底数上出 NaN（Metal）；CPU 里等价问题是 `np.power(-x, 0.5)`。
- 光在发光体内会被自身遮挡（Blender `visible_shadow=False`；路径追踪里"自己的阴影射线要跳过自己"）。

## 7. stubborn-hug/lumina（Luminati + 云上之城 Aurelis）

three.js r186 的 2.5D 像素风引擎，全部素材运行时程序化生成；内含 128×128「云上之城」关卡。
网页：https://lumina-static-584822.gitlab.io/game.html?level=aurelis

值得学的 3 点：
1. **反弹主导的日照**：天光压暗、地面反弹提亮，白大理石的暗面是发光的淡紫玫瑰而不是蓝灰；地平线压成窄带（穹顶指数 0.28），10° 以上就是深天青，白尖塔因此立得住。
2. **云海是真几何**：900×900 跟随平面 + relief-march 8 单位厚云层 + 6 阶抖动量化，受光顶亮度压在 bloom 阈值之下，所以云不蒙纱。
3. **vista 构图规则**：lift ≈ 0.3×dist、	an(pitch)/tan(fov/2) ≈ 0.25–0.3、地平线钉在画面 36%，一整套可复用的机位公式。

细化见 lumina-skycity-study.md。

## 8. Noniv/abyssal-garden（单文件 WebGPU 水下场景）

96 KB 单文件、零依赖、零素材的可游览水下世界（海带森林、沉船、鲸尾、神光、程序化音景）。
网页：https://noniv.github.io/abyssal-garden/

值得学的 3 点：
1. **加载期一次性烘焙 + 逐帧极简**：SDF 密度场在 GPU 上算、surface nets 在 CPU 上提取、光照预烘进 3D 纹理；运行时一轮几何 + 半分辨率体积光 + bloom。
2. **半分辨率体积光 + 深度感知上采样**：34 步 raymarch + IGN 抖动，3×3 权重 1/(0.03+|Δz|/z)，合成时 4 抽样双线性，光柱无方块边、无漏光。
3. **叶片 = 顶点着色器里的解析曲面**：等曲率圆弧 + 扭转 + 宽度包络，零 alpha、零排序、零 overdraw——搬去画幡旗/麦浪/瀑布水帘几乎只改参数。

细化见 abyssal-garden-study.md。
