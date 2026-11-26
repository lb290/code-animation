# STATUS · 天空鲸城（CIELO）/ code-animation

> **新会话从这里开始**：90 秒读完这一页，再按「6 · 文档地图」去读本轮合同与交接历史。
> 本页只写**现在**；每轮的历史在 [HANDOFF.md](HANDOFF.md)，每天的过程在 [05-daily/](05-daily/)。

<!-- AUTO:START -->
> 自动生成 · 2026-11-26 20:05 · 运行 `node tools/status.mjs --write` 刷新。下面每一行都是从仓库里读出来的，不靠人记。

| 项 | 值 |
|---|---|
| 分支 / HEAD（生成时） | `main` @ `99f2cad` · fix(cielo): 观景点 83「塔顶观云」机位改到塔冠内部（塔冠檐口不再挡住画面） |
| 工作树 | 6 个改动（4-output/CIELO.html、04-output/cielo-sw.js、HANDOFF.md、README.md、STATUS.md、05-daily/2026-11-26.md） |
| 成品 · 天空鲸城 | `04-output/CIELO.html` · 1049.7 KB |
| 成品 · 天空之城 · 灯祭 | `04-output/CELESTIA.html` · 145.0 KB |
| 几何体检 | 31 项（`node tools/checkall.mjs`） |
| 内容规模 | 观景点 84 · 抄本 32 页 |
| 最近日记 | `05-daily/2026-11-26.md` |
<!-- AUTO:END -->

## 0. 一句话

手写 WebGL2、零依赖的**可游览幻想都市**：云上的白城，巨鲸驮着一座城堡从塔尖游过；城市里已有七处可飞入的建筑
（宫殿、玻璃宫、大教堂、高架车站、歌剧院、云上茶席，以及第十四轮新落成的**运河上的水门塔「云井塔」**），
32 处地标各有一页「建筑介绍 + 故事」的导览抄本。成品是**单个 HTML 文件**（约 1.05 MB，内联全部 JS 与着色器），
桌面与安卓平板/手机都能玩。第十二轮修掉手机端崩溃（构建期 JS 堆 1.2 GB → 29 MB）并加三条主题航线；
第十三轮重做**画质系统**（设备像素级输出 + 自适应分辨率 + 输出分辨率锐化），手机端从「0.27 MP 放大 3.3 倍」
变成「1.4× 上采样 + 锐化，精细档可 1:1」，像素化指标 −70%；第十四轮新建**云井塔**（11 层环形回廊围着云井中庭，
运河从塔基两道拱下穿过）。

## 1. 线上入口（可直接点开）

| 入口 | 地址 | 说明 |
|---|---|---|
| 天空鲸城 CIELO | <https://lb290.github.io/code-animation/04-output/CIELO.html> | 主成品；平板可「添加到主屏幕」离线玩 |
| 天空之城 · 灯祭 CELESTIA | <https://lb290.github.io/code-animation/04-output/CELESTIA.html> | 夜景浮岛灯市 |
| 首页（全部入口） | <https://lb290.github.io/code-animation/> | 三件作品索引 |
| 成片与图集 | <https://github.com/lb290/code-animation/releases> | 《天空巡礼》、AETHER 1080p |

## 2. 本轮（Round 14 · 2026-11-25 深夜）：云井塔（新可飞入地标 · 内容轮）

**用户委托**：「精细制作一座新的可飞入幻想建筑（高塔型建筑，内部参考 素材/图片/幻想城市/室内/74981085_p0.jpg）」。
要求：不重复既有 6 类；写锚点 + 保留矩形（铁路 ≥12 m / 不压街区 / 不挡露台视野带）；新模块 + 末尾 tag + 自有种子；
三角 8–14 万；真门洞 + ≥40 件陈设 + 室内基线；+3–4 观景点；+1 页抄本并生成；新体检并注册；不回归第十三轮画质。

**施工合同**：[03-notes/cielo-round14-cloudwell-brief.md](03-notes/cielo-round14-cloudwell-brief.md)

| # | 项目 | 状态 |
|---|---|---|
| 1 | 选址：城南大运河上（`L.cloudwell = {0,-232}`）、大道正南对景，平台吞掉旧 x=0 桥，落在运河保留区内 → **城市三角零变化** | ✅ |
| 2 | 契约 `src/cloudwell-plan.js`（尺寸/色板/材质/8 条飞入射线/5 个空腔/8 盏点光/楼梯塔豁免） | ✅ |
| 3 | 外壳 `src/cloudwell.js` 65,330 tri（水门基座 + 双运河拱 + 大台阶 + 36 m 玻璃幕墙 + 真门洞 + 11 层回廊 + 云井亭 + 楼梯塔外壳 + 塔冠采光洞） | ✅ |
| 4 | 内装 `src/cloudwell-hall.js` 49,077 tri：门厅 9 组 + 11 层回廊每层 4–5 件 + 6 组吊灯 + 8 面绸幡 = **126 组陈设**；反照率中位 0.477 / emissive ≤0.140 / 点光 8 盏 | ✅ |
| 5 | 观景点 80–83（只追加末尾）：云井塔 / 水门大厅 / 云井回廊 / 塔顶观云 | ✅ |
| 6 | 抄本 31 → **32 页** + 新区域「云井塔」（文案源 `group-d.json`，生成物由脚本重建）+ 建筑朝圣航线第 8 站 | ✅ |
| 7 | 新体检 `tools/cloudwell-check.mjs`（三角/包围盒/8 射线/5 空腔/真门洞/云井通透/8 点光/确定性），注册后 **31 项全 PASS** | ✅ |
| 8 | 验收：checkall 31/31、mobile-check 全 PASS、mem-check 15 PASS/0 FAIL、旧机位像素回归（v74 逐像素相同；v0/v2/v41 差异只在新增塔） | ✅ |
| 9 | 文档同步（合同 / HANDOFF / 日记 / STATUS / 产品方案 / 制作笔记） | ✅ |
| 10 | **发布到 GitHub Pages + 手机验证**（2026-11-26）：`6caf700` 的 Pages 构建报 `errored`、`99f2cad` 的构建卡在 building 20 小时 → 手动 POST 重建成功；线上文件已核对 = 1,074,887 B / 构建戳 `99f2cad`。顺手把 PWA 缓存版本升到 v14（新塔进离线包） | ✅ |

> **线上**：静态 **2,163,136 tri**（+114,407）/ 7 批上传；观景点 **84**、抄本 **32 页**；
> `04-output/CIELO.html` **1,049.7 KB**；构建戳可在标题页与 `?diag` 核对。
> `src/main.js`（画质系统）**本轮零改动**。
>
> **手机上访问（2026-11-26 晚已验证线上）**：直接开 <https://lb290.github.io/code-animation/04-output/CIELO.html>，
> 触屏默认「精细」；想看新塔就在地址后加 `?view=82`（回廊仰望）或 `?view=80`（运河岸看全塔），
> 也可从露台沿大道向南飞、正对塔门飞进中庭。曾「添加到主屏幕」的：下拉刷新一次即可（SW 导航网络优先，
> 缓存版本已升到 v14）。**Pages 事故与修复见 §2 表格下方**。

## 3. 下一步（≤5 条，按优先级）

1. **补云井塔 P1**（`src/cloudwell.js buildTurret()`）：楼梯塔 12 开间拱窗 + 内部螺旋踏步/中柱；回廊第 0/1/5 层
   180° 咬口加门套收边。改完跑 `node tools/cloudwell-check.mjs` + `checkall`。
2. **真机看一次新塔**：塔内 `?view=82`（11 圈回廊仰望）、塔冠 `?view=83`，记录 HUD 的 gpu ms / sceneEff；
   若新塔在手机上明显掉帧，先按机型调 `TIERS.gpuMs/px0`（不要改三档结构）。
3. **画质/性能**：等新塔真机数据出来后再决定是否做「移动端几何降级」（第十二轮遗留：从 city 776k tri 起减细分，
   不删内容）；显存仍约 285 MB（2.16M tri × 44 B），若真机报 context lost 就启动它。
4. **产品改进 C「游客护照」**（下一轮候选，见 [03-notes/cielo-product-ideas.md](03-notes/cielo-product-ideas.md)）：
   抵达一处盖一个章，集齐 32 页出「通关证书」，复用明信片出片管线；备选「语音导览」。
5. **主题航线真机反馈**：三条航线 20 站（新增云井塔第 8 站），收 1–2 条手机手感反馈再调。

## 4. 硬约束（违反会返工）

- **桌面零回归**：所有触屏逻辑必须在 `html.touch` / `TOUCH` 为真时生效；`checkall` + `mobile-check` 全 PASS 才算完成。
- **零依赖**：CIELO 源码不引第三方运行时库；成品是**单个 HTML**，构建后不请求任何外部资源。
- **内容是数据**：建筑介绍在 `03-notes/lore-scene/group-*.json`（单一事实源），用 `node tools/build-lore-scene.mjs`
  生成 `src/lore-scene.js`；**不要手改生成物**。
- **数字要有出处**：文案里的尺寸/数量必须能在源码常量或 HANDOFF 里核对。
- **不要为了手机删内容**：性能靠关阴影、降渲染倍率、减点光；`?q=low|mid|high` 与自动降档是唯一手段。
- **内存预算**：世界几何必须走 `B({chunked:true})` + `world.meshes` 分批流式上传；动 `geo.js/gl.js` 必须跑
  `node tools/geo-acc-check.mjs`。
- **验收四件套**：`checkall`(31/31) + `mobile-check` + `mem-check` + 旧/新截图零回归，缺一不算完成。
  **验收脚本必须串行跑**（并行抢 CDP 端口会出假失败/假读数，第十四轮踩过）。
- **画质零回归（第十三轮新增）**：动 `src/main.js` 的分辨率模型 / 后处理 / 三档之前，先 `node tools/quality-check.mjs --tag=before`
  留一份手机指标；改完再 `--tag=after` 对比。手机端「2×2 同色块 ≤4%、LapVar ≥200」是第十三轮真机验收过的基线。
- **新模块只能追加**：`world.js` 的 `tag()` 加在**末尾**、`layout.js` 的 `views` 只追加末尾（索引被固定机位/航线/抄本引用），
  新模块用自己的 `mulberry32` 种子（否则平移既有模块的共享随机序列）。
- **工作记录**：按 [03-notes/worklog-format.md](03-notes/worklog-format.md) 写；每轮结束必须更新本页 + HANDOFF + 日记 + 提交推送。

## 5. 新会话 3 分钟上手

```powershell
# 1. 读现状（本页）与最近一轮合同
cat STATUS.md; ls 03-notes/*round*.md
# 2. 看仓库真实状态
git status --short; git log --oneline -5
# 3. 刷新自动事实块，与文档对照
node tools/status.mjs
# 4. 基线可跑（构建 + 31 项体检）
cd 01-source/cielo; node build.mjs; node tools/checkall.mjs
# 5. 平板/触屏 + 主题航线验收（需要 Chrome，约 4 分钟；不要与 mem-check 并行）
node tools/mobile-check.mjs
# 6. 内存/完整性验收（受限堆模拟安卓手机 + 桌面）
node tools/mem-check.mjs
# 7. 浏览器里看（桌面 8099；平板联调加 --host=0.0.0.0）
node tools/serve.mjs --host=0.0.0.0
```

桌面快捷键：`空格` 巡游 · `1–9/0` 观景 · `Z/X` 切换 · `G` 抄本 · `N` 昼夜 · `F` 烟花 · `P` 摄影 · `C` 明信片 · `H` 帮助 · `R` 回露台。
触屏：左半屏摇杆 · 右半屏环视 · 右侧升降 · 底部动作条。
URL 参数：`?view=` `?cam=` `?tod=day|dusk|night` `?freeze=` `?noui` `?q=low|mid|high` `?touch=0|1` `?perf`
`?nomod=` `?diag` `?route=architecture|wonder|secret` `?batch=`（分批上传预算）。

## 6. 文档地图

| 文件 | 管什么 |
|---|---|
| **STATUS.md**（本页） | 现在：入口、本轮、下一步、硬约束 |
| [HANDOFF.md](HANDOFF.md) | 每轮历史：现状 / 30 秒上手 / 已知遗留（只追加） |
| [03-notes/worklog-format.md](03-notes/worklog-format.md) | **工作记录规范**（四层记录、模板、检查单、提交规范） |
| [05-daily/](05-daily/) | 每日/每会话日记（六段，坑必写） |
| [03-notes/cielo-production.md](03-notes/cielo-production.md) | CIELO 制作笔记（管线、几何、着色器、参数、每轮技术结论） |
| [03-notes/cielo-spec.md](03-notes/cielo-spec.md) | CIELO 设计规格 |
| [03-notes/lore-scene/](03-notes/lore-scene/) | 抄本「景」文案源文件（JSON，按区域分组） |
| [01-source/cielo/src/lore.js](01-source/cielo/src/lore.js) | 抄本「故事」与抵达区域数据 |
| [README.md](README.md) | 仓库总览（含平板用法） |
