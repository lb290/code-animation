# 代码生成动画：可迁移技术笔记

> 素材来自 6 个已克隆仓库（见 `repos.md`）。本文只写"能落到 numpy + Pillow + ffmpeg 纯 CPU 管线"的东西，参数尽量原样抄。

## 1. 编排方法论

### 1.1 shots as data —— 一个时间轴文件统治全片
[vargHQ/skills](https://github.com/varghq/skills) `code-path-traced-film/scripts/smallest-star/timeline.json` 是范本：`fps/bpm/meter/bar_seconds` 打头，`shots[]` 每项 `{id,start,dur,mood,action,caption}`，再加 `events[]`（`{t,type,until,every,note}`）与 `narration.lines[]`（`{t,file,text}`）。画面、配乐、字幕、混音四个程序都读它，改时间不会各改各的。关键约定：**每镜头起点落在小节线上**（72 bpm / 3/4 → 小节 2.5 s = 24 fps 下 60 帧）。
[remotion-dev/template-helloworld](https://github.com/remotion-dev/template-helloworld) 把同一思想压成元数据：`<Composition durationInFrames fps width height defaultProps/>`。Python 等价物：`{"id","dur","fps","W","H","props"}`。

### 1.2 stills-first：三级便宜审查
`blender-code-film/SKILL.md` 的顺序值得照抄：① `--stills --draft` 每镜头一张 1/4 尺寸（<1 s）→ ② 新 subagent critic → ③ 全尺寸静帧等用户点头 → ④ `--draft` 每帧 1/4 尺寸 + 每 12 帧拼 contact sheet，查穿模/闪烁/曝光断层/空镜 → ⑤ 才最终渲染。CPU 管线里"每帧 1/4"意味着 480×270 渲染，成本约 1/16，这一步永远值得。

### 1.3 critic loop：写的人不自评
`code-3d-explainer/references/critic-prompt.md` 给了可直接用的格式：全新 subagent、只给 factsheet 与图、输出 `VERDICT: PASS | PASS WITH FIXES | FAIL` + 表格（`ID | 判定 | 问题 | 替换文案 | 核对的来源`），修完再开**新的** critic。它记录的真实战果：一条爆款 3D 科普片画面精美但机制错（"手指不接触是因为芝诺悖论"，实为电子云斥力+泡利不相容），评论区当场拆穿——所以机制/单位/量级必须在静帧阶段就被审。

### 1.4 节奏、转场与错峰（可直接抄的数字）
`transition-craft/SKILL.md` 十条通则，CPU 版最相关的：
- 硬切藏在"覆盖最大"处（最大模糊/满屏/半翻/速度峰值），别在可读帧上切。
- 峰值压强拍或提前 1 帧；晚 6–12 帧显松。核心段短：冲击 0.10–0.25 s，甩/推 0.15–0.30 s，快速模糊 0.20–0.40 s，长度由"落定"承担。
- zoom/dolly 走 log 空间：`scale = k**e`，对 e 做缓动。
- 抖动：`A*sin(2*pi*f*t)/exp(decay*t)`，冲击 8–14 Hz、decay 4–8，手持 1–3 Hz。
- 运动模糊 180° 快门、5–10 samples；重击切可加 2 帧色差（看着像滤镜就全部减半）。
[3b1b/manim](https://github.com/3b1b/manim) 补上两个数学件：`smooth(t)=t^3*(10s^2+5st+t^2)`（首末一二阶导为 0，比 smoothstep 更"软"）；错峰公式 `full=(n-1)*lag+1; a_i=rate_func(clip(alpha*full-i*lag,0,1))`，一行实现逐个入场。

## 2. 画面质感（带数值）

| 项 | 做法与参数 | 出处 |
|---|---|---|
| Bloom | `bloom=GaussianBlur(clip(img-0.95,0,None), sigma=14)`，`out=img+0.8*bloom`；或"阈值 0.9 以上取 0.22 权重" | fable-vfx `ocean.py`；path film `look.md` |
| 色彩分级 | 写 33³ `.cube`：色相距离加权去饱和 `w=1-smooth(dist,13°,27°)`（皮肤离黄 ~30° 不被碰）、`mid_lift*4*x*(1-x)*(0.55+0.45*(1-x))`、`0.90*x+0.10*smoothstep(x)`、整体饱和 ×0.97 | `fable-vfx/vfx/grade.py` |
| 胶片颗粒 | 放在**时域滤波之后**：`atadenoise=...,unsharp=5:5:0.35,noise=c0s=4:c0f=t+u`（8 bit 暗场渐变必不可少） | `post/compose.py` |
| 光晕/光尘 | 屏幕叠加 `1-(1-roi)*(1-g*col)`，`g=exp(-d²/2σ²)*amt` | `sprites.py: blob()` |
| 立体贴纸 | 距离变换当高度场 → Sobel 求法线 → 漫反射+高光+顶光边缘光；侧面按对角偏移盖 16 次做挤出 | `sprites.py: puffy()` |
| 景深/散景 | 按深度图插值模糊半径（bokeh 用圆盘核）；远景星点抖动用更强的时域滤波，别全局加 | `look.md` traps |
| 片头标题 | 标题先渲成遮罩，逐帧用 `(1-matte)` 画，人挡在前面；再造软阴影分离 | `docs/how-it-works.md` §7 |
| 空气感 | 雾密度 0.007/单位、雾色增益 0.10；"可见天空"与"照明天空"必须是两个增益（0.16 / 0.46） | `look.md` |

## 3. 声音设计

- **配乐/音效也是数据**：`video-sound/references/cue-sheet.md` 的 `cues.json`：`duration/fps/platform/target{ lufs, true_peak }/duck{depth_db,ramp}/beats/cut_on/cuts[]/silences[]/tracks[]`。每条 track 有 `role(voice|music|sfx|ambience)/start/at/moment/gain_db/fade/loop/trim_lead`。
- **对齐规则**：瞬态类（impact/click/pop）对齐**起点**；whoosh/riser 对齐**峰值**，即 `start = event - time_of_peak_in_file` 并关掉 `trim_lead`。判"准时"标准 = 误差 ≤1 帧。
- **总线**：人声出现时音乐 duck 8–10 dB、ramp 0.25 s；人声与音乐至少差 10 dB；交付 `-14 LUFS`（YouTube/X）或 `-16`（web/播客），真峰 ≤ `-1 dBTP`。
- **程序化音效**（`fable-vfx/vfx/sfx.py`，纯 numpy）：whoosh = 带通白噪 × `sin²` 包络（`{400..2600}`×0.10 + `{1500..7000}`×0.05）；海 = 低通 900 Hz 噪声 × 慢速 `(0.55+0.45sin²)` 调制；chime = 正弦串 C7–E8 加 0.35 的 `2.01f` 二分量、指数衰减、4 ms 起音；pop = `f=520*exp(-14t)+180` 的扫频正弦 × `exp(-32t)`。
- **混响**用合成 IR：分倍频程衰减的噪声（RT60 2.7 s@125Hz → 0.45 s@16k），加 7 个早期反射与 24 ms 预延时，再 FFT 卷积；**低频给干声**（IR 高通 140 Hz）。
- **播完自检**：BS.1770 K 加权（`k_weight` 的 h1/h2 系数可直接抄）、400 ms/100 ms 双门限积分；软限幅 = 滑窗最小值包络 `limiter_gain`；TPDF dither `(rng()-rng())*(x!=0)` 后再量化到 int16。

## 4. 落到纯 CPU 管线

1. **帧循环 = PIL → 原始帧管 → ffmpeg**（`post/compose.py` 原样可用）：
```python
cmd = ['ffmpeg','-y','-f','rawvideo','-pix_fmt','rgb24','-s','1920x1080','-r','24','-i','-',
       '-i','score.wav','-vf',VF,'-c:v','libx264','-preset','slow','-crf','17',
       '-pix_fmt','yuv420p','-c:a','aac','-b:a','256k','-movflags','+faststart','-shortest','out.mp4']
p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
for i in range(total): p.stdin.write(frame(i).tobytes())
```
写完 `stdin` 再 `wait()`，比先存 PNG 再编码省一半 IO。
2. **确定性**：`frame(i)` 只依赖 `t=(i+0.5)/fps` 与固定 seed；禁止上一帧状态。XiaoyeCodes 的验收方法很实用——**同一个 t 渲两次，逐像素相同**；不同 t 必须真的有运动。
3. **数组精度**：float32 下 1920×1080×3 ≈ 25 MB/帧，中间量多用单通道再广播；PIL 存取走 uint8，只在着色/泛光段升 float32，最后 `clip(0,1)*255`。
4. **云/噪声**：多八度随机场放大 = `for (o,a) in [(6,1),(12,.5),(24,.25),(48,.12),(96,.06)]: n += a*resize(rng.random((o,o*6)), (4096,1024), CUBIC)`，再归一化；`cv2.resize` 可用 `PIL.Image.resize(BICUBIC)` 替换。
5. **距离场/法线**：`distanceTransform` 在纯 Pillow 里可用"多尺度腐蚀近似"；Sobel 用 `np.gradient` 或 3×3 卷积即可（`puffy()` 里只做灰度梯度）。
6. **雾/天空/水面**：`z = h*f/dy` 建立屏幕行↔距离映射（f 焦距像素、h 机高），是纯 numpy 一次算完、全片复用的查找表。
7. **交付**：`-crf 15~18`、`-preset slow`、`yuv420p`、`+faststart`、bt709 标记；先把片头 2 s 渲出来看，再整片后台跑（`render.ts` 的"跳过已存在帧"就是断点续渲）。

## 5. XiaoyeCodes/code-animation-prompts：提示词骨架

它的价值在**把"风格"编译成规格**（`skills/.../SKILL.md`、`references/rendering.md`、`assets/library/.../B3_粒子聚形.md`）。可照抄的 5 条：

1. **接口骨架**：「画面是时间 t 的纯函数 `draw(t)`；禁止 `Math.random`（统一 `mulberry32(seed)`，启动时生成一次）；禁止在 draw 里保存上一帧状态；同一 t 渲两次必须一致。」
2. **常量骨架**：「N=__ 个元素；周期 PER=__ s；缩放 SC=__；中心 (__,__)；总循环 = PER × 段数。」
3. **运动骨架**：「进度 `e=smoothstep(t0,t1,q)`；位置用二次贝塞尔 `P=(1-e)²A+2(1-e)eC+e²B`，`C=(A+B)/2+(cosθ,sinθ)*(0.35+0.9m)`；微动 `±0.012×(1-sin(πe))`；整体 zoom `1+0.015*sin(0.33t)`。」
4. **质感骨架**：「拖尾不存历史，用 `t, t-0.045, t-0.09` 重算三次，透明度 ×1/×0.5/×0.25；发光用加色混合；20% 元素额外画 3 倍半径、0.05 透明的光晕。」
5. **交付骨架**：「时长/分辨率/fps/是否循环/是否带声音；字幕出现窗口 `q∈[0.3,1.0]` 淡入、`[2.1,2.5]` 淡出；不要清单（不要爆炸闪光、不要彩虹、不要第二种背景）；写完自检：同 t 是否一致、关键时刻画面是否对、单帧是否卡。」
再加一条工作流：**索引先行**——只用 `catalog.json` 的编号/标签/路径先筛 2–3 条，再读被选中那条的 md 与静帧，绝不一次加载 341 条；没有静帧的 145 条要说明"文字参考"，不许编造截图。

## 6. 移植顺序建议

`timeline.json`（shots+events+narration）→ `render(t)` 单帧纯函数 → 480×270 contact sheet 自查 → critic subagent → `cues.json` 生成配乐与音效（numpy 合成，公式见 §3）→ rawvideo 管道出片（`noise` 颗粒最后加）→ `ffprobe` 验时长/帧率/响度。
