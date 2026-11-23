# AETHER — 一部只由代码生成的 24 秒短片

零素材、零插件、零 GPU、零 After Effects。画面每一像素来自 numpy 数组运算，
每一帧由 `subprocess` 直接灌进 ffmpeg 的 stdin；配乐由 numpy 加法合成器写成。

## 文件

| 路径 | 作用 |
|---|---|
| `01-source/film.py` | 分镜、相机、四个场景、时间轴、调色预设 |
| `01-source/rlib.py` | HDR 光栅库：粒子泼溅、可分离模糊、文字遮罩、电影级后处理链 |
| `01-source/audio/make_score.py` | 24s 配乐合成（A 小调、卷积混响、限幅） |
| `01-source/audio/score.wav` | 成品音轨，48kHz/24bit 立体声，峰值 -1.0 dBFS |
| `04-output/AETHER_1080p.mp4` | 成片，1920×1080 / 30fps / 24.000s / H.264 + AAC |

## 分镜（时间轴即数据）

| 时间 | 镜头 | 内容 | 画面来源 |
|---|---|---|---|
| 0.0–5.0 | BIRTH | 尘埃球在 Thomas 吸引子里收束成丝带，缓慢环绕 | 13 万粒子 RK4 积分 |
| 5.0 | 硬切 + 2 帧闪光 | 峰值压在配乐 impact 上 | — |
| 5.0–11.0 | FLOW | 解析速度场（10 个正弦波叠加的流函数旋度）里的丝状流，180° 快门 | 3 万粒子 × 6 子帧 |
| 11.0 | 硬切 + 强拍 | 爆散再回聚的环面纽结 | 16.5 万粒子，(2,3) 纽结 + 管状分布 |
| 11.0–17.0 | BLOOM | 纽结自转，末尾塌缩成一颗星 | 透视投影 + 深度衰减 |
| 17.0 | 星点延续 | 纽结塌缩的光点变成标题的星 | 缓存径向场 |
| 17.0–23.0 | TITLE | AETHER 字距收紧 + 扫光、副标题、材质行、中文行 | 文字遮罩 + 高斯辉光 |
| 23.0–24.0 | OUT | 淡黑，颗粒收尾 | — |

## 后处理链（每帧）

1. **泛光**：三个倍频程（1/2、1/4、1/8 分辨率）各做 2 次盒式模糊 ≈ 高斯，加权叠加
2. **变形宽银幕光带**：只从 `HDR-1.10` 以上的高光取横向长模糊（阈值化，避免整片横纹）
3. **软限幅 26.0** 后进 **ACES 拟合曲线**：`(x(2.51x+0.03))/(x(2.43x+0.59)+0.14)`
4. **分级**：暗部偏青 `(0.92,0.98,1.14)`、高光偏暖 `(1.06,1.0,0.93)`、S 曲线对比、饱和度
5. **色差**：R/B 通道以中心为原点缩放 0.22%（PIL AFFINE 重采样）
6. **暗角 + 时域颗粒**（暗部更重，符合胶片特性）+ 0.6% 曝光闪烁
7. 抖动量化到 8bit，raw RGB24 直灌 ffmpeg

## 节奏与声音

- 30 fps，24.000s = 720 帧；两个硬切落在 5.0s / 11.0s 的强拍上，闪光 1–2 帧（研究笔记：冲击核心 0.10–0.25s，峰值压强拍）
- 配乐 5 段能量抬升：RMS -21.4 → -15.7 → -12.0 → -13.8 → -14.9 dB，峰值 -1.0 dBFS，24.000s 处完全静音

## 从开源仓库抄来的东西

| 技术 | 来源 |
|---|---|
| shots-as-data / stills-first / critic loop | [vargHQ/skills](https://github.com/varghq/skills) `blender-code-film` |
| 阈值化 bloom、3D LUT 分级、numpy 版海洋 | [bhavya-gx/fable-vfx](https://github.com/bhavya-gx/fable-vfx) |
| 帧渲染接口 `renderAt(t)`、固定种子、禁止累积状态 | [XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts) |
| `smooth` 缓动、错峰公式 | [3b1b/manim](https://github.com/3b1b/manim) |
| 转场时长、180° 快门、峰值压强拍 | `transition-craft/SKILL.md` |

## 复现

```powershell
cd 01-source
# 只看静帧（快）
python film.py stills ..\04-output\stills 100 250 470 560

# 完整成片
python film.py render ..\04-output\AETHER_1080p.mp4 audio\score.wav
```

确定性：同一帧号渲两次应逐像素一致；粒子初值全部走固定 seed。
