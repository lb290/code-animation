你是「天空鲸城 CIELO」的项目负责人兼技术美术（新会话接手）。

先按顺序读这几份，不要跳过：
1. `STATUS.md`（现状 / 硬约束 / 文档地图）
2. `HANDOFF.md` **开头的第十三轮**（最新一轮：画质系统 v2 的模型、参数与已知遗留）
3. `03-notes/worklog-format.md`（工作记录规范：四层记录 + 提交规范）
4. `03-notes/cielo-production.md`（管线与画风基线）与 `01-source/cielo/src/world.js`（模块怎么挂载）

本轮任务（Round 14 · 内容轮）：**自己选题，精细制作一座新的可飞入幻想建筑**。

选题要求
- 先看 `F:\AI\dsh\素材\图片\幻想城市\`（建筑与室内参考图）挑一个**城里还没有**的类型；
  现有可进入建筑：宫殿（台基门厅/圆厅/后翼五套间）、玻璃宫（蓝色大厅/温室/星象台）、大教堂、高架车站、
  歌剧院、云上茶席 —— 不要重复这些类型，也不要做成"又一座大教堂/歌剧院"。
- 选址要合理：写进 `src/layout.js` 锚点 + `src/city.js` 的保留矩形（参考 opera 的 `[99,-58,72,82,4]`），
  确保铁路环线 ≥12 m、不压街区、不挡露台视野带。

制作要求（质量按项目既有"精细"标准，不是占位）
- 新模块 `src/<name>.js`，导出 `build<Name>(b, ctx, rng)`；只在 `world.js` **末尾**加一个 `tag('<name>', ...)`
  （不要插在中间，会平移既有模块共享 rng 的随机序列）；用自己的本地 `mulberry32` 种子。
- 三角预算 **8–14 万**（当前静态 2,048,729，项目软上限约 220 万；还要给手机留余量）。
- **必须真的能飞进去**：真门洞（飞入射线 0 命中）、内部可读陈设 ≥40 件（吊灯/家具/壁画/织物/植物/烛台/
  收藏品…），有明暗层次；室内基线：albedo 0.42–0.53、emissive ≤0.145（别到 0.2+）、点光 ≤8 盏
  （全局取最近 12 盏，别和既有模块抢）。
- 新增 **3–4 个观景点**：追加在 `layout.js` 的 `views` **末尾**（不要插中间，索引会被固定机位引用）；
- 新增 **1 页抄本**：文案源写进 `03-notes/lore-scene/group-*.json`，再跑 `node tools/build-lore-scene.mjs`
  生成 `src/lore-scene.js`（**不要手改生成物**）；`src/lore.js` 加 1 条到达 zone。
- 新增体检 `tools/<name>-check.mjs`（面数上限 / 包围盒 / 门洞飞入射线 0 命中 / 内部空腔顶点 0 /
  确定性），并注册进 `tools/checkall.mjs`。

不许回归第十三轮画质系统（这是刚验收的成果）
- 输出画布按设备像素、场景像素预算、输出分辨率放大锐化、天空后置、三档（流畅/均衡/精细）都不要动；
  确实必须改 `src/main.js` 时，保持三档与 `?q=`/`?px=`/`?gputarget=` 行为不变，并在 HANDOFF 里写清楚。
- 新几何会增加移动端顶点成本：做手机视口（`--mobile --touch --dpr=2 --w=1280 --h=582`）截图确认
  新建筑清晰不糊、`?diag` 里 `sceneEff` 与 FPS 没有明显恶化。

验收（缺一不算完成）
```powershell
cd F:/AI/dsh/code-animation/01-source/cielo
node build.mjs && node tools/checkall.mjs          # 30 项 + 新 1 项全 PASS
node tools/mobile-check.mjs                        # 触屏/画质/航线/明信片 + 桌面零回归
node tools/mem-check.mjs                           # 受限堆手机模拟（几何必须走 B({chunked:true}) 分批上传）
```
外加：新旧同机位截图（桌面 1280×720 抽 4 个机位）确认**没有改动别处**；手机截图 2 张留存。

收尾（按项目规范）
- 更新 `STATUS.md`（跑 `node tools/status.mjs --write` 刷事实块）、`HANDOFF.md` **顶部追加** Round 14、
  `05-daily/当日.md`（六段，坑必写）、`03-notes/cielo-product-ideas.md`（下一轮仍是方案 C「游客护照」优先）；
- `git add -A && git commit && git push origin main`（走 SSH）；
- 最后用中文汇报：新建筑是什么/在哪个位置、三角数与体检结果、手机截图、单文件大小与提交号、遗留风险。

硬约束：零第三方运行时依赖 · 单个 HTML 成品 · 几何必须分块累积 + 分批上传（第十二轮手机 OOM 的教训）·
不改 `src/lore-scene.js` 生成物 · 不为了手机删内容 · 桌面零回归。
