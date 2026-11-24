# CIELO 第十一轮施工合同 —— 安卓（Android）平台访问

> 用户目标（2026-11-24 晚）：「我要开新会话继续做，支持安卓平台访问天空鲸城。」
> 本文是下一轮的唯一开工依据。读完本文 + HANDOFF 第十轮现状即可动手。

## 一、现状体检（都是代码里的事实，不是猜测）

| 项 | 现状 | 对安卓的影响 |
|---|---|---|
| 产物 | `04-output/CIELO.html`，单文件 871.5 KB，WebGL2 手写引擎 | 体积没问题；WebGL2 在安卓 Chrome / 115 上普遍支持 |
| 场景规模 | 静态 **2,044,187 tri / 60 draw calls**、2048 阴影图、bright+blur 泛光链 | 中端手机大概率 10–25 fps，**必须先做质量档** |
| 输入 | 只有 `pointer lock + mousemove + WASD/QE/Shift` 键盘；**全项目 0 个 touch 事件** | 手机上完全不能玩（不能飞、不能转视角） |
| UI 快捷键 | `G` 抄本、`N` 昼夜、`F` 烟花、`P` 摄影、`H` 帮助、`1-9/0` 观景、`Z X` 切换、`空格` 巡游、`R` 回露台 | 手机没有键盘 → **所有功能都进不去**，包括新的导览抄本 |
| 渲染分辨率 | `W.scale` 自适应 0.55–1.0，但按 CSS 像素开画布 | 手机 DPR 2–3，画面会被放大（略糊但省性能）；需要 DPR 上限 + 更低的 min |
| 竖屏 | 没有处理；HUD/卡片按横屏排版 | 竖屏会挤，需要横屏提示或重排 |
| 音频 | `Ambience.start()` 在「进入城市」按钮里启动 | 符合移动端手势要求，不用改 |
| 本机联调 | `tools/serve.mjs` 默认只监听 127.0.0.1 | 手机连不上；**本轮已加 `--host=0.0.0.0`**（会打印局域网地址） |

## 二、验收标准（做完按这个自查）

1. **安卓 Chrome / 115 手机版**打开 `https://lb290.github.io/code-animation/04-output/CIELO.html`：
   - 3 秒内出现标题页；点「进入城市」后能玩；
   - **能飞**（虚拟摇杆）、**能转视角**（右侧拖动）、**能升降**；
   - 中端机（骁龙 7 系 / 天玑 8000 级）**平均 ≥ 24 fps**，不烫手不闪退；
   - 能开 **导览抄本**（有屏幕按钮）、能翻页、能关闭、能读正文；
   - 能切 **观景点 / 昼夜 / 烟花 / 摄影 / 帮助**（都有屏幕按钮）。
2. **竖屏不崩**：给出「请横屏」提示，或竖屏下 HUD 重排可读；横屏为推荐形态。
3. **桌面端零回归**：`node tools/checkall.mjs` 28/28 PASS；桌面截图与第十轮对比无变化（触摸层只在触屏设备启用）。
4. **触摸不误触**：拖动转视角不会触发按钮；单指操作不互相抢事件。

## 三、建议实现顺序（4 步，每步可独立验收）

### 第 1 步：触摸输入层（新模块 `src/touch.js`）
- 只在 `matchMedia("(pointer: coarse)").matches` 或 `navigator.maxTouchPoints > 0` 时启用；桌面完全不走这条路径。
- 左半屏**虚拟摇杆**：按下点为中心，拖动量 → 前后/左右速度（写进 `cam.keys` 等价的向量，或直接给 Camera 一个 `touchMove` 接口）。
- 右半屏**拖动转视角**：`yaw -= dx * k`、`pitch -= dy * k`（复用 `cam.onMouse`）。
- **双指上下滑 / 两个按钮**：上升 / 下降（替代 Q/E）。
- 屏幕按钮条（右下或底部）：`巡游` `观景◀▶` `昼夜` `烟花` `导览` `帮助` `摄影` `回露台`。按钮 = 调用现有的 `__cielo` 同款函数（`cam.startTour()`、`cam.setView(i)`、`dn.cycle()`、`fireworks.volley()`、`guide.toggle()`…），不要另写一套逻辑。
- **不要**在触屏上调 `requestPointerLock`（安卓上会失败/恶心）。
- 全屏按钮：`canvas.requestFullscreen()`（必须在用户手势里调用）+ `screen.orientation.lock("landscape")` 失败就忽略。

### 第 2 步：移动质量档（`main.js` 里集中一处）
- `const MOBILE = touch ? 1 : 0`，以及 URL 参数 `?q=low|mid|high` 覆盖（默认按设备自动选）。
- `low`：`SHADOW.on = false`、泛光关或半分辨率、`W.scale` 上限 0.7 / 下限 0.4、`ADAPT` 目标从 27 ms 放宽到 33 ms、`fogMax` 缩短、`uFxaa=0`。
- 保留 `?nomod=` 作为最后手段（可关掉 `city/opera/glassHall…` 等模块做档位），但**不要**默认关内容。
- 首帧计时（`buildMs` + 前 60 帧）自动降档：> 40 ms 直接落 `low`。

### 第 3 步：竖屏 / 安全区
- `template.html`：`viewport-fit=cover` + `env(safe-area-inset-*)`；竖屏（`orientation: portrait` 且宽 < 700）显示「请横屏体验」的轻提示（可点掉，不阻塞）。
- HUD 底栏在窄屏换行；抄本在手机上已经是单栏（`@media (max-width:820px)` 已隐藏左栏，保留 ✕ 关闭）。

### 第 4 步：抄本与卡片的触摸化
- 抄本右上角加 **✕** 关闭按钮（手机没有 Esc/G）；正文可惯性滑动（已有 `overflow:auto`）；字号在窄屏加大到 15.5–16 px。
- 底部快捷键提示在触屏设备换成「左右滑动翻页」或直接隐藏。
- 抵达卡片：触屏上点卡片 = 打开抄本对应页；卡片自动收起时间从 9 s 放宽到 12 s。

## 四、测试方法

1. **桌面模拟**（最快）：Chrome DevTools → 设备工具栏 → 选 Android 机型 → 触摸模拟；确认摇杆/拖动/按钮都在，且桌面（非触摸）回归正常。
2. **真机局域网**：
   ````powershell
   cd 01-source/cielo
   node build.mjs
   node tools/serve.mjs --host=0.0.0.0      # 会打印 http://192.168.x.x:8099/
   ````
   手机与电脑同一 WiFi，浏览器打开打印出来的地址 + `/CIELO.html`。
3. **线上验证**：推送到 GitHub 后等 Pages 重建（约 1 分钟），手机打开 Pages 地址；必要时带 `?q=low` 对比。
4. **性能**：`node tools/bench.mjs` 在桌面跑；手机上用页面内的 FPS 角标（`?perf=1` 可看 GPU/ms）记录三档观景点数值。

## 五、风险与注意

- **三角数 2.04M** 是最大风险。优先靠「关阴影 + 降分辨率 + 关泛光」拿帧率，**不要**为了手机删内容；实在不行再加 `nomod` 档位。
- **iOS Safari 不在本轮范围**（用户只提安卓），但别写出只能在安卓跑的代码：用标准的 Touch/Pointer Events。
- **触控与现有键盘逻辑冲突**：`main.js` 的 keydown 里 `guide.isOpen()` 会吞键，触摸层要复用同样的开合状态，别绕过去。
- **桌面零回归**是硬要求：所有移动逻辑必须在 `MOBILE` 为真时才生效；桌面截图 + 28 项体检都要过。
- 相关文件：`src/main.js`（输入/渲染档位）、`template.html`（HUD/卡片/抄本 CSS）、`src/guide.js`（抄本开合）、`src/camera.js`（视角接口）、`tools/serve.mjs`（已支持 `--host`）。

## 六、开工 30 秒

````powershell
cd F:/AI/dsh/code-animation/01-source/cielo
node build.mjs                 # → 04-output/CIELO.html
node tools/serve.mjs --host=0.0.0.0
node tools/checkall.mjs        # 28/28 必须 PASS
````

浏览器快捷键（桌面不变）：`G` 导览、`N` 昼夜、`F` 烟花、`P` 摄影、`H` 帮助、`1-9/0` 观景点、`Z X` 切换、`空格` 巡游、`R` 回露台。
