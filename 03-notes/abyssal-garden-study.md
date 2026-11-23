# Abyssal Garden 精读笔记 —— 面向「纯 WebGL2 天空之城」的技术迁移清单

> **一句话结论**：这是一个「一次性静态烘焙 + 极简逐帧」的范例：世界在加载期用 GPU 算 SDF、CPU 跑 surface nets、把光照/遮蔽预烘成 3D 纹理，运行时只做一次几何 pass + 半分辨率体积光 + 6 级 bloom + ACES 合成，全部 WebGPU 原生、0 依赖、单文件 97.2 kB（gzip 39.3 kB）。
>
> **最值得偷的 5 个技术**
> 1. **半分辨率体积光 + 深度感知（双边）上采样/模糊**：34 步 raymarch 遮蔽采样 + 3×3 深度加权模糊 + 4 抽样双线性深度加权合成，彻底消除半分辨率光柱的方块边与漏光。
> 2. **三平面细节纹理 + 距离分级的 4 阶几何细节（A/B/C/F = 0.1/0.43/1.9/6.7 倍频）**：一张 1024² 程序化 detail 图就替代全部贴图，远距离自动丢最高频。
> 3. **叶片 = 顶点着色器里的「等曲率圆弧 + 扭转 + 宽度收缩」**：零 alpha、零排序、零 overdraw 的植被方案（`W_LEAF:vs`），比 alpha 卡片快且无软边闪。
> 4. **实例按 16×16 网格（CELLW=24 m）排序 + 连续区间合并 draw + 8 次乘加的锥体裁剪 + 距离分档切 pipeline**：把 2M 个叶片压成每帧几十个 draw call。
> 5. **反向 Z（depth = NEAR/z）+ 无限远平面 + 单一正交阴影图（4096²，PCF 9 抽）+ 指数高度雾解析积分**：无 CSM、无 TAA、无 depth prepass，却全程无 z-fighting / 无远裁剪穿帮。

---

## 0. 项目速览

| 文件 | 行数 | 职责 | 关键导出 |
|---|---|---|---|
| `source/build.mjs` | 35 | 6 个模块字符串拼接 → 包进 async IIFE → esbuild 压缩 → 替换 template 占位符 | `FILES` 顺序、`minWgsl` |
| `source/template.html` | 158 | 页面外壳：加载条、菜单、CSS 状态机（`l/m/g/p/e`）、手机竖屏横转 | `#c #m #b #g #d #i` |
| `source/src/quality.js` | 14 | 设备分级 + localStorage 记忆 + 5 个全局常量 | `LV THIN SHADOW AA WATER RAYN` |
| `source/src/math.js` | 214 | 随机、值噪声/fbm、四元数、`Mesh` 构建器、`surfaceNets`、`icosphere` | `rnd fbm Mesh surfaceNets` |
| `source/src/shaders.js` | 782 | 全部 WGSL（12 个模块） | `W_DENS W_SOLID W_LEAF W_RAYS W_POST …` |
| `source/src/world.js` | 557 | 世界布局、地形网格、实例布置、程序化网格（船/鲸尾/蝠鲼/鱼/珊瑚） | `makeWorld meshShip meshFluke` |
| `source/src/main.js` | 643 | 设备、管线、渲染循环、相机、碰撞、输入、菜单 | `render frame collide resize` |
| `source/src/audio.js` | 71 | WebAudio 程序化环境音 | `mkSound sound mute` |
| 产物 `index.html` | 99 522 B | 全内联单文件（gzip 40 294 B，压缩比 2.47×） | — |

`prompt.txt` 的三条硬约束值得记住：视觉 > 帧稳 > 体积、**零逐帧 JS 分配**（状态全在预分配 `Float64Array(32) F[]` 里）、脚本化 60 s 飞行必须 99p ≤ 16.7 ms。

---

## 1. 架构：单文件构建、启动流水线、帧循环

### 1.1 build.mjs 的内联细节（`source/build.mjs`）

```js
const FILES = ['quality.js','math.js','shaders.js','world.js','main.js','audio.js']; // 顺序即作用域顺序
const wrap = b => `(async()=>{${b}\n})().catch(e=>{…document.body.className='l e';…});`;
html = tpl.replace('/*SCRIPT*/', () => code);   // 用函数形式 replace，避免 $& 转义
```

- **没有 bundler 的模块系统**：6 个文件按依赖顺序拼成一个 `async` 函数体，`const/let` 天然共享作用域（`math.js` 的 `rnd` 被 `world.js` 直接用）；代价是全局命名要手工避撞。
- **WGSL 单独压缩**：`minWgsl` 删 `//` 注释、折叠空白、去掉标点两侧空格，只对 `` /*wgsl*/`...` `` 标记的模板串生效（JS 压缩器不碰字符串内容）。
- `catch` 把 `body.className` 置 `l e` 并写 `#s`；`Error(msg,{cause:1})` 的 `cause` 区分「友好文案」与「意外异常」。

### 1.2 加载流水线（`source/src/main.js:say`）

```js
const say = (m, to, ms) => { $('s').textContent = m;
  const a = $('b').animate({transform:[`scaleX(${loaded})`,`scaleX(${to})`]},
    {duration:ms, fill:'forwards', easing:'cubic-bezier(.3,.5,.5,1)'}); loaded = to;
  return new Promise(r => { a.ready.then(() => setTimeout(r)); setTimeout(r, document.hidden ? 0 : 1e3); }); };
```

进度条用 **WAAPI 在合成器上跑**，主线程被世界生成阻塞时条子仍在动；`a.ready` 确保动画真启动，另有 1 s（隐藏页 0 s）兜底防死锁。六阶段占比：编译着色器 .05 → 雕海床 .25 → 挖峡谷 .32 → 种海带 .73 → 布景 .94 → 放光 1.0。

启动顺序：① 检测 `navigator.gpu` → `requestAdapter({powerPreference:'high-performance'})` → `requestDevice`（`timestamp-query` 可选）；② 建纹理/UBO/管线（GPU 异步编译）；③ **GPU compute 生成 21 M 体素 → `mapAsync` 读回 84 MB**；④ CPU 连通性清理 → surface nets → 碰撞场烘焙 → `makeWorld`（约 200 MB 临时内存，用完置 `null`）；⑤ 上传缓冲 → 一次性烘 detail 纹理 + 阴影图 → 释放约 300 MB；⑥ `render(); await Q.onSubmittedWorkDone();` 画一帧并等 GPU 真跑完（触发管线编译）才揭示菜单 —— 所以动态分辨率调参在玩家「下水」前就完成了；⑦ `setTimeout(keep, 15e3, 'abyssalLoad','')`：活过 15 s 才算这次加载没崩。

### 1.3 渲染循环 / dt / 插值

```js
function frame(now) { requestAnimationFrame(frame);
  const dtr = now - F[LAST]; F[LAST] = now;
  let dt = dtr / 1000; if (dt > 0.1) dt = 0.1;   // 唯一的 dt 保护：clamp 100 ms
  F[TIME] += dt; …输入积分… collide(); render(); }
```

- **无固定步长、无状态插值**：平滑全部用指数阻尼 `k = 1 - exp(-dt*rate)`，天然帧率无关，不需要 accumulator；防穿透靠碰撞子步（≤0.4 m）而非固定时间步。
- 动画唯一时间源是 `F[TIME]`，塞在 UBO 的 `g.cam.w` 里传给所有着色器（**没有单独的 `time` 字段**，省一个标量槽）。
- 每帧只剩一次 `createCommandEncoder()`；`F[]`、`UB[]`、`WT[]`、`passScene`、`bloomPass[]` 全部预分配/在 `resize()` 建好。

### 1.4 devicePixelRatio 与动态分辨率（`main.js:resize` / `frame`）

```js
DW = max(2, round(canvas.clientWidth * devicePixelRatio));      // 只用 DPR 算"想要多少像素"
const s = min(1, sqrt(pix / (DW*DH)));                          // 真正的开关是像素预算 pix
const w = max(2, round(DW*s) & ~1), h = max(2, round(DH*s) & ~1); // 强制偶数（MSAA 要求）
canvas.width = W; canvas.height = H;                             // backing store 变小，CSS 拉伸
```

`pix` 默认：High = `2560*1440 = 3 686 400`，手机 = `1280*720`，Low = `410 000`；`PIXMIN` = 手机 25 万 / 桌面 50 万，`PIXMAX = 3.6864 M`，`DETMIN = 0.4`。有 GPU 时间戳时每秒（菜单期 0.4 s）调一次：`if (g > 13.6 || g < 9.8) k = 11.7/g; k = clamp(k, .5, 1.7)`，**降序：像素→`mid=max(top/2,PIXMIN)` → 绘制距离 1→0.4 → 像素→PIXMIN**，升序原路反向。无时间戳时帧时间兜底：`a > 17.6` 连续两段才动（`k = 15/a`，等待时间 `dynWait` 翻倍至 60 s 上限）、`a < 12.5` 直接 `k = 15/a`、其余每隔 `dynWait` 段试探 `k = 1.17`。收敛值写入 `localStorage.abyssal = "level,pix,det"`（满分辨率不写）。

### 1.5 quality 分级（`source/src/quality.js`）

| 项 | 表达式 | High | Medium | Low |
|---|---|---|---|---|
| `LV` | 设备判定 | 0 | 1 | 2 |
| 植物/闪光/卵石保留 | `THIN = 1 << LV` | 1/1 | 1/2 | 1/4（海带主茎不抽稀） |
| 阴影图 | `SHADOW = LV ? 2048 : 4096` | 4096² | 2048² | 2048² |
| MSAA | `AA = LV > 1 ? 1 : 4` | 4× | 4× | 1× |
| 焦散/水面纹理 | `WATER = LV > 1 ? 256 : 512` | 512² | 512² | 256² |
| 体积光步数 | `RAYN = LV > 1 ? 12 : 34` | 34 | 34 | 12 |
| 各向异性 | `maxAnisotropy: LV > 1 ? 1 : 8` | 8 | 8 | 1 |
| 小石/海绵/珊瑚投影 | `if (!LV)` 才烘 | 有 | 无 | 无 |
| 岩石网格 | `meshChunk` 的 `sub--` | sub3 | sub3 | sub2 |

判定：`mob = matchMedia('(pointer:coarse)')`、`mem = navigator.deviceMemory`；手机 `mem>7 ? 1 : 2`，桌面 `mem<=4 ? 2 : 0`。**崩溃降级**：加载开始写 `localStorage.abyssalLoad=1`，`pagehide` 清空；下次若还在说明上次跑崩了 → `LV++` 重来；`device.lost` 同理（`reason==='destroyed'` 除外）。

---

## 2. 渲染管线

### 2.1 pass 顺序与 render target

全部在**一个** command encoder 里、一次 `Q.submit`（`main.js:render`）：

| # | Pass | 目标 | 格式/尺寸 | 内容 |
|---|---|---|---|---|
| 1 | 水面纹理 | `tWater` mip0 | `rgba16float` 512²(256²) | 5 次迭代 warp 焦散 + 10 个方向波斜率 |
| 2 | mip 1..4 | `tWater` mips | HDR | 每级一次 4 抽样 blit（`fsMip`） |
| 3 | **场景** | `tMS`(MSAA)+`tDp` → resolve `tRes` | `rgba16float` 4× / `depth32float` 4× | 见 2.4 |
| 4 | 体积光 | `tRay` | HDR **W/2 × H/2** | 34 步 raymarch（`W_RAYS:fs`） |
| 5 | 光柱模糊 | `tRay2` | HDR W/2×H/2 | 3×3 深度加权（`W_RBLUR:fs`） |
| 6 | Bloom 下采样 ×6 | `b0..b5` | HDR W/2 … W/64 | `fsDown0`（Karis 平均）+ `fsDown`（4 抽样） |
| 7 | Bloom 上采样 ×5 | `b4..b0` | HDR | `fsUp`（0.75 texel 偏移 4 抽样）+ **加法混合** |
| 8 | 合成 | `getCurrentTexture()` | `getPreferredCanvasFormat()` | `W_POST:fs` |

```js
const HDR = 'rgba16float', DEPTH = 'depth32float';
const tMS = tex(W,H,HDR,{samples:AA}), tDp = tex(W,H,DEPTH,{samples:AA});
const tRes = tex(W,H,HDR), tRay = tex(W/2,H/2,HDR), tRay2 = tex(W/2,H/2,HDR);
for (let i=0;i<6;i++) bl.push(tex(max(1,W>>(i+1)), max(1,H>>(i+1)), HDR));
```

**MSAA**（WebGPU 写法）：pipeline 上 `multisample:{count:AA}`（`main.js:scenePipe`），pass 上 `view=tMS`、`resolveTarget=tRes`、`storeOp:'discard'`（MSAA 缓冲不保留，省带宽），深度附件同样 `samples:AA`；Low 档 `AA=1` 时直接渲进 `tRes`。阴影 pass 与全部后处理都不开 MSAA。

**反向 Z**：`depthCompare:'greater'`、深度清 0、投影 m[10]=0 / m[14]=NEAR=0.1，即 `z_clip = NEAR` → `depth = NEAR/z_linear`，远平面无限；线性深度用 `zl = g.fwd.w / depth` 反算（`W_RAYS:fs` 与 `W_POST:fs` 都这么读深度）。

**未实现**：TAA/时域累积、SSAA、CSM、depth prepass、SSAO、SSR、运动模糊、色差。

### 2.2 Bloom 与色调映射

```wgsl
fn kar(c: vec3f) -> vec4f { let w = 1./(1.+max(c.r,max(c.g,c.b))); return vec4f(c*w,w); }
// fsDown0：4 抽样 → Karis 平均，且 min(color,24) 抗 firefly；fsUp：0.75 texel 偏移帐篷核 + blend{one,one}
```

合成（`W_POST:fs`，HDR 线性域）：

```wgsl
var c = textureLoad(tS,px,0).rgb + acc/ws;        // 场景 + 上采样光柱
let bl = textureSampleLevel(tB,sC,uv,0.).rgb;     // b0（1/2 分辨率）
c = (mix(c, bl, .06) + bl*.03) * g.mis.x;         // 泛光（只当"发光的味道"）+ 曝光
let q = uv-.5; c *= 1. - dot(q,q)*.55;            // 暗角：角落 ×0.725
c = tmap(c);                                      // fn tmap(x){ sat3((x*(2.51x+.03))/(x*(2.43x+.59)+.14)) }
```

之后四步「胶片化」（同一函数内）：① 亮度对比 `l0=dot(c,(.2126,.7152,.0722)); l=mix(l0,l0*l0*(3-2*l0),.55); c*=l/max(l0,1e-4)`；② 高光去饱和 `c=mix(c,vec3(l),ss(.55,1.,l)*.1)`；③ 整体 7% 去饱和 + 暖偏移 `c=mix(vec3(l),c,.93)+vec3(.008,.002,0.)`；④ `pow(1/2.2)` + **三角抖动** `n=ign(p)+ign(p+37.)-1; return c+n/255.`（`ign` = interleaved gradient noise，也用于光柱步进）。`EXPO=0.62`、`RAYS=0.54`，曝光随高度微调 `m[56]=EXPO*(0.6+0.4*clamp((-camY-8)/26,0,1))`。

### 2.3 雾 / 水下散射（解析式，无 raymarch）

```wgsl
const SIG=vec3f(.058,.0235,.0195), KD=vec3f(.056,.0245,.0170), KDF=vec3f(.043,.045,.042);
const WCOL=vec3f(.16,.58,.90), PCOL=vec3f(.58,.66,.98), SUNC=vec3f(1.7,1.6,1.45);
fn sg(z)->vec3f { return mix(SIG, vec3f(.034,.026,.022), z); }     // z = 紫色洞窟权重
fn fogIn(ro,rd,d,z,sun)->vec3f {
  let a = sg(z) - kd(z)*rd.y;                                      // 高度项：向上走越走越淡
  let I = (1.-exp(-a*d))/a;                                        // 沿视线的解析积分
  return mix(WCOL,PCOL,z)*sg(z)*exp(k*ro.y)*I*(1.22 + .3*mu*mu*mu*mu); }
fn fog(c,wp,z) { … return c*exp(-sg(z)*d)*ss(230.,185.,d)
                        + fogIn(…)*(.58+.42*vol(cam+rd*min(d,150.)).g); }
```

三个可偷点：① **反向 smoothstep 做远裁剪**（`ss(230,185,d)` 在 185 m 内=1、230 m 外=0），物体颜色淡出只剩散射光，因此不需要 far plane 也无裁切边；② 散射强度乘**体积纹理的 skylight 通道**（3.4），海带/岩石遮挡直接出现在雾里；③ 相函数只用 `mu⁴`，比 HG 便宜且方向性够。

### 2.4 场景 pass 绘制顺序（`main.js:render`）

```
地形(back cull, 0..240m) → 12 类大件 → 岩块×7(带远 LOD) → 海绵/珊瑚×6(带 LOD) → 蝠鲼 → 鱼群
→ 海带 3 档 → 小植物 → 水面(4 顶点) → 背景水(4 顶点) → 气泡(alpha) → 闪光点 → 漂浮颗粒
```

只有地形 `cullMode:'back'`，其余 `cull:'none'`（双面几何 + VS 里翻法线）；半透明一律 `depthWriteEnabled:false`（`scenePipe` 的 `!o.blend`）。水面与背景各是 **4 顶点全屏三角形带**：顶点直接落在 y=0 平面（±900 m），透视校正插值自然给出精确深度，**无需细分网格** —— 云海平面可直接照搬。

---

## 3. 几何生成

### 3.1 噪声（`source/src/math.js`）

```js
const ihash = (x,y,z) => { let h=(Math.imul(x,374761393)+Math.imul(y,668265263)+Math.imul(z,1274126177))|0;
  h = Math.imul(h ^ (h>>>13), 1274126177); return ((h ^ (h>>>16))>>>0)/4294967296; };
// fbm 4 阶，lacunarity 2.03，每轴不同偏移（打散轴向对齐）
const fbm = (x,y,z,o=4) => { let a=.5,s=0; for(let i=0;i<o;i++){ s+=a*vnoise(x,y,z);
  x=x*2.03+17.1; y=y*2.03+31.7; z=z*2.03+5.3; a*=.5; } return s/(1-2*a); };
```

WGSL 侧同构（`W_NOISE`，`h31` 用 `fract(p*vec3f(.1031,.1030,.0973))` 经典 hash），CPU/GPU 视觉一致 —— 想两端共用同一套纹理时必须这么做。

### 3.2 地形：GPU 算密度场 → CPU 跑 surface nets

`W_DENS` 用 `@workgroup_size(4,4,4)` 一次算 **512×80×512 = 20.97 M** 体素（`VS=0.75 m` → 384×60×384 m），`dispatchWorkgroups(NX/4,NY/4,NZ/4)`。`fn dens` 的分层结构可整体改造成「浮空岛生成器」：

```wgsl
let w = vec3f(fbm(p*.04+11.,3), fbm(p*.04+47.,3), fbm(p*.04+83.,3)) - .5;
let q = p + w*vec3f(15.,6.,15.); let g0 = -45.5 + 7.*(fbm(q.xz*.011)-.5) + 1.6*(fbm(q.xz*.07)-.5); // ①② warp+基底
let e = seg2(q.xz, a.xy, a.zw) - b.x;                          // ③ 线段距离−半径 = 胶囊
e -= b.z*ss(.3,.92,yr) + 3.*(1.-yr)*(1.-yr) - b.w*ss(0.,.5,yr)*(1.-ss(.5,1.,yr)); // 顶部外扩/腰收
dm = smax(dm, smin(-e, b.y + tn - p.y, 3.), 2.5);              // 平滑并/交，k = 2.5~3 m
let plat = max(ss(.5,.565,n)*(1.-clr), ring);                  // ④ 台地 + ring 抬到 60 m（不可见边界）
var d = smax(g0 + 4.5*ss(10.,0.,de) - p.y, dm, 3.);            // de = 到最近岩体距离 → 根部变宽
d += rk*((.5-wor(p*.17+w*2.))*3.4 + (.5-wor(p*.41+7.))*1.3 + (fbm(p*.3,3)-.5)*2.2)
   + rk*2.2*(abs(fract(p.y*.21 + w.y*2.2)-.5)-.25);            // ⑤ 侵蚀 + 层理
d = smin(d, seg3(p+w*2., a.xyz, b.xyz) - a.w, 2.);             // ⑥ 隧道/拱
return min(d, 3. - p.y);                                       // 顶面截平（水面）
```

两个「清理」步骤（`main.js` 世界生成块）：

```js
for (const i of L) if (!R[i]) D[i] = -D[i];   // 只保留与海底连通的部分，悬空噪声块翻成水
// 碰撞距离场：4×4×4 体素一砖，只烘相机可达 ±156 m，值域夹 ±1 m，1/127 定点 → Int8
```

**朴素 surface nets**（`math.js:surfaceNets`）：每体素最多 12 条边，收集所有变号边的线性插值点求平均 → 一个顶点，每条变号边出 2 个三角形（按 `d0>0` 定向），`Uint32Array` 索引 + 长度翻倍扩容。**法线不用三角面累加**，而是对原始密度场做中心差分（±0.8 体素，`buildTerrain`）—— 更平滑、无网格台阶，SDF 转网格的标准做法，务必照抄。

### 3.3 可复用的几何原语（`math.js:Mesh`）

顶点统一 **16 字节**：`float32x3 pos + snorm8x4 (nx,ny,nz,aux)`，法线在 `build()` 里按面积加权累加后量化；实例 48 字节 `float32x4 ×3`（pos+scale / quat / mat,seed,ts,bob）。

| 原语 | 签名 | 用途 | 关键实现 |
|---|---|---|---|
| 方截面扫掠 | `sweep(pts, w, h, upFn, caps)` | 船龙骨/肋骨/舷墙/桅杆、拱、栏杆 | 每环按切线×upFn 求 frame，**每个面单独顶点制造硬边** |
| 圆管 | `tube(pts, rad, sides=6, capEnd, auxFn)` | 珊瑚、海绵管、蝠鲼尾/头鳍 | 初始 up=(0.31,0.9,0.3) 逐环正交化（准平行传输），`rad` 可传函数 |
| 旋转体 | `meshLathe(prof, seg, lump, ribs)` | 3 种海绵（10/9/8 点轮廓） | `rl = r*(1 + lump*(fbm(cos a*1.5+h*2, h*3, sin a*1.5,2)-.5) + .07*cos(ribs*a+h*1.5))` |
| 噪声二十面体 | `meshChunk(sd, sub, det)` | 4 种巨石 + 7 种岩块 | 球面 fbm 径向位移 0.9（+高频 .25），再用 4 个随机平面 `if(d>0) p -= n*d` 削棱 |
| 递归分叉珊瑚 | `meshCoral(fan, lo)` | 2 种珊瑚 + LOD | 每枝 3 段折线 + 随机偏转，递归 3 层、2~3 分叉、半径 ×0.78 |
| SDF→网格 | `surfaceNets` + 胶囊链 | 石鲸尾（`vs=0.09 m`，186×216×76） | 锥形胶囊平滑并集（k=0.45），先 `-sdf` 再 surface nets |
| 参数化曲面 | `meshManta` / `meshShip` / `meshFish` | 蝠鲼 72×22 环、船、鱼 | 船体 `hb(x)=B*sqrt(1-|x/Lh|^p)`、`dp(x)=Dp*(1-0.36|x/Lh|^2.5)`、`sheer(x)`，再 `pt(x,φ)` 求截面 |

船（`world.js:meshShip`，`Lh=17, B=5.6, Dp=7.6`）是「3 个剖面函数 + 扫掠」的教科书案例：龙骨 44 点扫掠、每 0.8 m 一根肋骨、14 条船壳板带（破洞用椭圆遮罩 `holed()`）、艉楼 3 层舷墙、艉板横条、甲板残条、前桅+横桁+断掉的主桅+艏斜桅。

### 3.4 烘焙：detail 纹理、阴影图、体积纹理、地面图

- **detail 纹理** 1024² `rgba8unorm` + 11 级 mip（`W_DETAIL:fs`）：`rg=坡度`、`b=高度`、`a=斑驳`，由 8 阶 tileable fbm + 脊状 `1-|2f-1|` + 细裂纹 + worley 麻点叠加；mip 用 `fsMip` 逐级生成（保 tileable，不用 generateMipmap）。
- **阴影图** 单张 `depth32float` 4096²：`R=225`、深度 `d0=-175, d1=125`、光向 `normalize(0.27,1,-0.24)`；地形 `cullMode:'front'`（防 peter-panning）、其余 back；`depthBias:2, depthBiasSlopeScale:1.5`。
- **体积纹理** 256×40×256 `rg8unorm`：`r=clamp(.5-d/12,0,1)` 开阔度，`g=` 沿 -Y 逐层传播的天光（`Lp/Ln` 双缓冲 + XZ 可分离 `(a+2b+c)*.25` 模糊），传播时乘 `clamp(.5-d/1.5,0,1)` 与 `1-min(kelpAbs,.5)`（海带吸收足迹）。**「没有屏幕空间遮蔽也有体积感」的答案**，2.6 MB 一次烘完。
- **地面图** 512² `rgba8`：r=洋红覆盖、b=紫色区域、a=沙（`world.js:gm`）。

---

## 4. 着色器配方（重点）

### 4.1 体积光：半分辨率 raymarch（`shaders.js:W_RAYS:fs`）

不用屏幕空间径向模糊（会穿墙、无遮挡），而是**在阴影图里做 34 步 raymarch**：

```wgsl
let dp = textureLoad(tDp, vec2i(fc.xy)*2, 0); let zl = g.fwd.w / max(dp, 1e-6);  // 半分辨率深度 → 线性
var tm = min(zl*rl, 120.);                           // 最多 120 m
if (rd.y > 1e-4) { tm = min(tm, -g.cam.y/rd.y); }    // 被水面截断
let dt = tm/34.; let j = ign(fc.xy);                 // IGN 抖动，消步进条纹
for (var n=0; n<34; n++) {
  let p = ro + rd*((f32(n)+j)*dt); let s = g.sm*vec4f(p,1.);
  let vis = textureSampleCompareLevel(tSh,sS, vec2f(s.x*.5+.5,.5-s.y*.5), s.z-.0006);
  let q = p.xz - sx.xz*(p.y/sx.y);                   // 沿太阳方向投影到 y=0 平面
  let pat = ss(.3,.7, T(tW,q/27.,2.5).r) * ss(.15,.6, T(tW,q.yx/11.+.3,2.).r);  // 焦散网格→光柱疏密
  let mist = sat(1. - (vol(p).r-.5)*3.4);            // 开阔度 → 雾浓
  acc += exp(-sgz*t + k*(p.y/sx.y)) * (vis*(.012 + pat*6.) * (1. + 1.2*mist*mist)); }
let ph = mix(.2 + 2.*mu*mu*mu, .8, g.sun.w);         // 近似 HG 相函数
return vec4f(min(acc*dt*sgz*wc*SUNC*ph*g.mis.y*(1.-.55*g.sun.w), vec3f(20.)), zl);
```

常数：`RAYN=34`（Low 12）、最远 120 m、均匀项 `.012` + 图案项 `6.`、雾权重 `1.2*mist²`、总强度 `RAYS=0.54`；输出 alpha 存 `zl` 供下游。

**深度感知上采样**（`W_RBLUR:fs` + `W_POST:fs`），最值得抄的一小段：

```wgsl
let w = 1./(.03 + abs(r.a - c.a)/c.a);              // 光柱 3×3 模糊：深度跳变处降权
let w = (bw + .02)/(.02 + abs(r.a - zf)/zf);        // 合成：半分辨率 4 抽样双线性 × 深度权重
```

### 4.2 Caustics：迭代 warp 焦散 + 沿光投影采样

生成（`W_WATER:caus`，每帧烘 512²）：

```wgsl
for (var n=1; n<=5; n++) { let tt = t*(1. - 3.5/f32(n));        // 5 个不同速度层
  i = p + vec2f(cos(tt-i.x)+sin(tt+i.y), sin(tt-i.y)+cos(tt+i.x));  // 迭代域扭曲=焦散网络
  c += abs(sin(i.x+tt)*cos(i.y+tt))/(1.25*sqrt(s*s+k*k) + 1e-4); }  // 归一化双曲亮线
c = 1.17 - pow(c/5., 1.4); return pow(abs(c), 8.);               // 反转+收窄+8 次幂（只留峰值）
```

使用（`W_SOLID:caus`）：世界空间**沿太阳方向投影**（`cuv(p)=p.xz - sun.xz*(p.y/sun.y)`），三尺度叠加 + RGB 偏移 `o=(.004,.0025)` 做色散：`min(pow(a,2.3)*5.*(.45+b*1.3), 4.)`，35 m 外淡到常量 `.33`；光照里只在面向太阳处生效：`dl = E*ndl*(.10 + mix(.33, ca, ss(.1,.45,dot(n0,L)))*2.5)`。

### 4.3 水面（从下往上看）：Snell 窗 + 全内反射（`W_SURF:fs`）

```wgsl
let s = (T(i.wp.xz/13.).ba + T(i.wp.zx/4.7+.2).ba*.7 + T(i.wp.xz/37.+.6).ba*.8) * ss(260.,60.,d);
let n = normalize(vec3f(-s.x*.8, -1., -s.y*.8));   let ci = sat(dot(V,-n));
let k  = 1. - 1.769*(1. - ci*ci);                  // 全内反射阈值 1.769 ≈ 1/(1-(1/1.333)²)
let win = ss(0., .22, k);  let fr = pow(1. - sqrt(max(k,0.)), 5.);
let sky = (vec3f(.30,.78,1.)*1.3*clamp(1.+3.8*(s.x*.6-s.y*.8),.25,3.)
        + vec3f(1.,.95,.85)*(pow(sd,60.)*1.3 + pow(sd,500.)*12.)) * (1.-fr);  // 双指数太阳闪
let c = mix(fogIn(i.wp, R, 300., z, sun)*1.15, sky, win);
```

「云海」要的就是它的**反向版**：把 `k` 的全内反射换成「云边银边 + 逆光透射」。

### 4.4 植被：叶片是顶点着色器里的解析曲面（`W_LEAF:vs`）★

几何只有一条 `triangle-strip`、`2×ROWS` 个顶点：`u=(vi&1)*2-1` 横向 ±1，`v=sin((vi>>1)/(ROWS-1)*π/2)` 纵向（前密后疏）。

```wgsl
let d = vec3f(st*cy, ct, st*sy), pe = vec3f(ct*cy, -st, ct*sy), sd = vec3f(-sy, 0., cy); // 局部标架
let kq = k*1.7; let ka = select(kq, .06, abs(kq) < .06);        // 等曲率圆弧，|ka|<.06 取极限防除零
let c = i.a.xyz + len*(d*(sin(ka*v)/ka) + pe*((1.-cos(ka*v))/ka + wv*v));
// wv = sin(v*(3.+5.*s2)+s1*30.+t*1.1)*.12*wav                    ③ 行进波
// tw = (s1-.5)*2.4*v + sin(t*.9+s2*20.)*.25*v; S = sd*cos(tw)+N*sin(tw)   ④ 扭转
// shape = pow(max(sin(π*pow(v, shp.x)),0), shp.y)                ⑤ 宽度（per-type，如 (0.5,0.32)）
// nearK = 1-ss(26.,40.,cd)  ⑥ 只有近处才加褶皱；⑦ 远处几何收缩 = (1-ss(far*.8,far,cd))*ss(.6,2.2,d)*ss(len*1.1+.5, len*2.2+1.2, dmid)
```

没有 alpha、没有 alpha-test、没有排序 —— 宽度本身就是形状，**永远不会软边闪烁**；省掉 overdraw、排序、`discard` 打断 early-z，代价是 18 顶点/叶。2 M 叶片 × 16 三角形 ≈ 32 M 三角形是真实成本，靠距离分档（9/5/3 行 + 抽稀 1/2 并加宽 1.5×）摊掉。**最推荐照搬到「旗帜/幡/麦浪/瀑布水帘」。** 起伏 `sway()`：`a = .024*pow(h,1.25)`、`ph = dot(p,(.031,.017))`，两个频率正弦叠加，全在 VS。

### 4.5 伪 SSS / 半透光 / 虹彩

叶片（`W_LEAF:fs`）：

```wgsl
let tr  = (max(-ndl,0.)*.85 + .15) * i.pr.y;                    // 背光透射（pr.y = 半透 0.2~1.0）
let trc = alb * mix(vec3(1.), vec3(1.5,1.4,.75), sat(i.pr.y)*(1.-i.pr.z));  // 透射偏暖
c += E * trc * i.pr.y * pow(sat(dot(-V,L)), 3.) * 1.2;          // 逆光边缘光
let ir = .5 + .5*cos(TAU*(vec3f(0.,.33,.67)+ndv*1.1+i.sd.x*.22+i.uv.y*.5+.55));  // 薄膜干涉
alb = mix(alb, alb*.5 + ir*vec3f(.15,.13,.30), i.pr.z*(1.-ndv)*.8);              // 掠射角最强
```

石块（`W_SOLID:fs`）：`c += alb*flu*dot(dl+am, vec3(.1,.5,.5))` —— 拿「直射+环境」的绿蓝分量当次表面漏光，`flu` 由材质给（珊瑚 .55~.75、岩石 .35）。

### 4.6 闪光 / 粒子（`vsGl` / `fsBub` / `vsSnow`）

- **闪光点**（additive）：屏幕对齐四边形，`sz = min(max(b.z, d*.0026), d*.0045)`（远处用角尺寸兜底，避免亚像素噪点），亮度 `(.12+tw*1.7)*lit*(b.z/sz)²*exp(-SIG.g*d)*ss(.4,1.5,d)*17.`，`tw = pow(.5+.5*sin(t*(.35+.9*hs(b.x))+b.x*100.),4.)` 是慢闪，片元 `exp(-r*7)*(1-ss(.7,1.,r))` 高斯软点。**`(b.z/sz)²` 让远处能量守恒**，不会越远越暗。
- **气泡**：`life = fract(t*b.y/b.z + b.x)`、`h = life*b.z`，横向 `sin(t*1.7+…+h*.6)*wob + sin(h*.13+…)*b.w*2.`（快摆动 + 慢漂移），尺寸 `a.w*(.55+.7*life)*ss(0.,.03,life)*ss(0.,-1.2,p.y)`；片元 `fwidth(r)*1.5` 做 1.5 像素 AA 边，`rim`/`hl` 两高光，再用 `fogIn` 上下两次采样混内外色。
- **漂浮颗粒**：9000 个，`p = cam + (fract((p-cam)/B + .5)-.5)*B`，`B=44` m 立方体环绕相机 —— **无 CPU 更新、无粒子系统、GPU 端无限循环**，漂浮尘埃/光尘最省做法。

### 4.7 阴影：单图 + 3 档 PCF（`S_B:shadow1/4/9`）

```wgsl
fn shUV(p) { let s = g.sm*vec4f(p,1.); return vec3f(s.x*.5+.5, .5-s.y*.5, s.z - .0007); }
fn shadow9(p) { if (LOW) { return shadow1(p); }   // Low 只 1 抽；High/Medium 走 3×3，间隔 2.1/阴影图边长
  let e = 2.1/4096.; var a = 0.;                  // HIGH 时 e=2.1/4096，Medium 时 2.1/2048
  for (x=-1..1) for (y=-1..1) a += textureSampleCompareLevel(tSh,sS, s.xy+vec2(x,y)*e, s.z);
  return a/9.; }
```

无 CSM：一张 450 m 见方正交图覆盖全区，4096² → 0.11 m/texel，配 `-0.0007` 深度偏移（反向 Z 是减法）够用；采样点统一沿法线抬高 0.35 m 避免自阴影。没有阴影处用**体积纹理 AO** 补：`ao = (sat((v1.r-.5)*8.)*.55 + sat((v2.r-.5)*2.7)*.45)*vao*ss(.12,.6,hgt)` —— 两个偏移（1.5 m / 4.5 m）采样同一张 3D 纹理得到双尺度接触阴影。

### 4.8 岩石：三平面 + 4 阶距离 LOD（`W_SOLID:tri` / `fs`）

```wgsl
var w = pow(abs(n), vec3f(4.)); w /= (w.x+w.y+w.z);          // 三平面权重 |n|^4 归一化
let A = tri(op,on,.1*ts), B = tri(op,on,.43*ts), C = tri(op,on,1.9*ts), F = tri(op,on,6.7*ts);
let fk = ss(10., 1.5, dist) * f32(mat <= 1);                 // 10 m 外丢掉 6.7 倍频那层
```

`i.op = i.p * i.a.w + i.c.y*37.` —— 顶点位置乘实例缩放再加随机种子偏移，**让每个实例纹理图案都不同**（一张图复用 2 M 次不重复）。岩石/鲸尾/船木/珊瑚/海绵全靠 `mat` 分支切配色与 `gloss/bump/flu`，只有一条 pipeline。

---

## 5. 相机与交互（`main.js`）

### 5.1 视角：两级级联低通

```js
const kq = 1 - exp(-dt*30);                     // 视角阻尼 30/s
lkx += mdx*0.0022; lky += mdy*0.0022;           // 0.0022 rad/px ≈ 0.126°/px
const ax = lkx*kq, ay = lky*kq; lkx -= ax; lky -= ay; l2x += ax; l2y += ay;
const dyw = l2x*kq, dpt = l2y*kq; l2x -= dyw; l2y -= dpt;  // 两级串联 = 手感"重"但不延迟
const yaw = F[YAW] + dyw; let pitch = clamp(F[PIT] - dpt, -1.55, 1.55);  // ±88.8°
```

鼠标增量只累加（`mdx += e.movementX`）不直接用，所以丢帧不丢输入。

### 5.2 移动

```js
const k = 1 - exp(-dt*4.5);                             // 速度阻尼
const sp = (ks || tN > 1) ? 26 : 7;                     // Shift / 双指 26 m/s，否则 7 m/s
const vx = F[VX] + ((sy*cp*mf + cw*mr)*sp - F[VX])*k;   // 目标速度 → 指数逼近
```

俯仰参与水平方向（真飞行）；边界硬夹紧：`rad=hypot(x,z); if (rad>150) 缩回`、`y ∈ [-52,-1.2]` —— 因为环形山把边界挡住，玩家看不到墙。

### 5.3 碰撞与滑动（`collide` / `sd` / `cv`）

数据结构：加载期烘的 **1/127 m 定点距离场**（Int8，±1 m 夹紧），4×4×4 体素一砖，砖索引 `CI`（Uint16：0=全水、1=全岩、n=brick n-2 在 `CG`），源码注释标称约 2 MB，只覆盖相机可达的 156 m。

```js
const CR = 0.5;                                   // 相机半径
const n = floor(sqrt(mx²+my²+mz²)/0.4) + 1;       // 子步 ≤ 0.4 m，防穿薄壁
for (i<n) { 位置 += 位移/n;
  for (k<2) { sd(0); const s = CS[0] + CR; if (s<=0) break;   // 每子步最多 2 次推出
    for (j=1..6) sd(j);                           // 6 个 ±0.375 m 偏移
    g = normalize(CS[1]-CS[2], CS[3]-CS[4], CS[5]-CS[6]);
    if (|g| < 0.075) break;                       // 梯度太小 = 已在岩石深处
    pos -= g*s; vn = dot(v,g); if (vn>0) v -= g*vn; } }      // 只删朝里的速度 → 自然滑动
```

采样是三线性插值（`cv()` 解 8 个角），梯度连续、滑动手感好。这套「SDF + 梯度推出 + 速度投影」对浮空岛外壳同样适用。

### 5.4 Viewpoint 与镜头路径

- `1`–`6` → `lookAt(...POSES[i])`，**瞬移，无任何缓动/过渡**（`POSES` 是 6 组 `[x,y,z, tx,ty,tz]`）。明确「未实现」，要电影感过场得自己写。
- 另有一条 60 s `FLY` 路径（25 key × 6 分量 = 位置+看向点）：**Catmull-Rom** 插值（`0.5*(2b+(c-a)u+(2a-5b+4c-d)u²+(3b-a-3c+d)u³)`）；**弧长重参数化**（4096 采样求累计长度表 → 重采样成 1024 项 LUT → 匀速）；**时间曲线** `s = s²(3-2s)*.25 + s*.75`（25% smoothstep + 75% 线性）。世界生成会把路径附近的植物/岩石清空（`nearFly()`）。

### 5.5 触摸与移动端

竖屏手机用 CSS `rotate(90deg) translateY(-100%)` 把整页转横（触摸轴也要跟着转：`rot.matches ? f.clientY : f.clientX`）。第一根手指按下记原点 `tx0,ty0`，**滑出原点即虚拟摇杆**（`jx=(tx-tx0)*tr`，`tr=4/min(w,h)`）持续给 `lkx += jx*1.5*dt`；第二根手指 = 加速（`sp=26`）+ 前进（`mf=.7`）。单指第一段直接改视角（`s=1100/min(w,h)`），之后转摇杆。

---

## 6. 程序化音频（`source/src/audio.js`）

**固定图，不重建；10 Hz 定时器驱动（不在帧循环里）**：

```
[brown noise 11s 无缝循环] ──┬→ lowpass 150 Q.7 → gain .34 ─────────────┐
 (playbackRate .63 复用同 buffer) ├→ bandpass 420 Q.5 → gain .25+LFO ───┤→ out → limiter → destination
                             └→ bandpass 300 Q.9 → gain(随速度) ─────────┤  (threshold -6, knee 6, ratio 20)
[drone 73.42/110/164.81/246.94/369.99 Hz，每音两个失谐正弦 ±.03~.11] ───┤
[声部池 bubble×4(send .12)/chime×3(1.2)/whale×2 triang(2)] ─────────────┘
[ConvolverNode: 5 s 合成 IR]      每个声部: Osc → Env → StereoPanner → dry + reverb
```

- **零素材**：11 s 布朗噪声（`b=(b+0.02*rand)/1.02`，末 4096 采样交叉淡化到开头 → 无缝；`3.5` 增益），5 s 卷积 IR `b += (rand*2-1-b)*(0.04+0.5*exp(-t*2)); d[i]=b*(1-exp(-t*30))*exp(-t*1.5)*(1-i/n)`。
- **同 buffer 不同 playbackRate** 制造「永远对不上」的水流层（0.63× 再叠 0.09/0.151 Hz 两个 LFO）。
- `play()` 统一包络：`f.exponentialRampToValueAtTime(f1, t+dur)`（音高滑音）、`g.linearRampToValueAtTime(vol, t+att)` 后 `g.setTargetAtTime(0, t+att, (dur-att)/5)`（打击+指数衰减）。

| 声部 | 触发间隔 | 频率 | 时长 | 音量/attack |
|---|---|---|---|---|
| 气泡 | 1–6 个一串（间隔 .07–.2 s），组后 .5–5 s | 380–1300 Hz，上滑 ×1.4–2.2 | `.05+40/f` | .03–.08 / .006 |
| 钟声 | 2.5–9 s | D 大调五声 `NOTES=[0,2,5,7,9,12,14,17,19]` @A4 → `440*2^(n/12)` | 5 s | .02–.04 / .03 |
| 鲸鸣 | 20–50 s（2–3 滑音） | 170–380 Hz，比例 .6–1.7 | 1.6–3.2 s | .08 / 40% dur |

- **与相机联动**（环境音「活」起来的关键）：10 Hz 回调算速度 `v=位移/dt`（`>60 m/s` 视为传送忽略），`rush.gain=.5*min(v/26,1)^1.2`、`rushF.frequency=220+v*14`；深度 `s=clamp(1+y/30,0,1)` → `wash.gain=.25+.55*s²`。
- 主音量 `VOL=.78`（约 -18.5 LUFS / 峰值 -5.5 dBFS），`setTargetAtTime(VOL, now, 1)` 淡入；`mute()` 用 `setTargetAtTime(0/VOL, t, .08)`；`visibilitychange` 时 `suspend/resume`；图在第一次 click/keydown/touch 才建（`AudioContext({latencyHint:'playback'})`）。

## 7. 性能与工程细节

| 项 | 数值 / 做法 | 出处 |
|---|---|---|
| Draw call | 地形 1 次/连续区段 + 12 大件 + 7 岩块组 + 6 海绵组 + 6 植物档 + 生物 2 + 水面/背景 2 + 粒子 3 + 光柱 1 + 模糊 1 + 水面纹理 5 + bloom 11 + 合成 1 | `main.js:drawCells` |
| 实例布局 | 每类实例按 `CELLS×CELLS=16×16` 网格分桶（`CELLW=24` m），每桶预排好并记 `start[]/lo[]/hi[]`（Y 范围） | `world.js:packC` |
| 视锥裁剪 | 保守锥体测试：`lim = d·f + ex|fx| + ey|fy| + ex|fz|`，再比 `|横向| ≤ lim·tanH`、`|纵向| ≤ lim·tanV`（`TANH=.6`）—— 8 次乘加，无矩阵 | `main.js:drawCells` |
| 排序 | 行序按「距相机所在行距离」升序（`rowOrd`），近处先画帮 early-z | 同上 |
| LOD | 海带 3 档（9 行 ≤24 m / 5 行 24–58 m / 3 行 58–150 m + 抽稀 1/2 加宽 1.5×）；小植物 3 行 ≤70 m；岩块 3 档（≤96 m、40–150 m 远 LOD、≤30 m 卵石）；珊瑚 2 档 | `main.js` 管线表 |
| 阴影 | 单张 4096²（2048² 中低），一次性烘，地形 front-cull、其余 back，bias 2 / slope 1.5 | `main.js` 烘焙块 |
| 粒子预算 | 气泡 ≈ 34 喷口 × 90–160 ≈ 4 000；闪光点数万（抽稀后）；漂浮颗粒固定 9 000；鱼 12 群 ≈ 4 400；蝠鲼 6 | `world.js` |
| 内存 | 密度场读回 84 MB；生成器约 200 MB + 缓冲约 300 MB（上传后显式释放）；碰撞场约 2 MB；体积纹理 2.6 MB | `main.js` 注释 |
| 首屏 | 世界生成 + 阴影烘 ≈ 数秒；第一帧后 `onSubmittedWorkDone` 才揭示菜单 | `main.js` |
| 目标 / 计时 | GPU 9.8–13.6 ms（≈180 fps@1440p，RTX 5070 Ti）；低端机 60 fps 靠「像素→距离→像素」三段式；`timestamp-query` 可选：2 counter + 6 个 16 B 回读缓冲轮转 | `main.js:frame` |
| 降级 | 无 WebGPU → 文案报错；`device.lost` → `LV++` 重载；`localStorage.abyssalLoad` 崩溃标记 | `main.js` / `quality.js` |

---

## 8. 可直接搬到「天空之城」的技术映射

| 原作技术 | 我的用途 | 改写方向 |
|---|---|---|
| `dens()` 的「warp + 手工原语 + smooth-min + 侵蚀」 | **浮空岛群** | 去掉 `-p.y` 截平，改「椭球壳 − 噪声」再与手工岛形 `smax`；底部侵蚀层理保留（悬空岩体要锯齿感）；连通分量分析保留大岛、丢弃小碎块（原作是反过来丢悬空块） |
| `surfaceNets` + 密度场中心差分法线 | 岛的网格 | 每岛独立小网格（如 96³）+ 3 档分辨率；岛底可以不封口（直接看天） |
| `W_SURF`（全内反射 + Snell 窗 + 双指数太阳闪） | **云海** | `k=1-1.769(1-ci²)` 换成「边缘不透明度」，`sky` 改「逆光银边 + 云隙透射」，同样用 3 尺度斜率噪声做云面法线 |
| `fogIn` 指数高度雾解析积分 + 反向 smoothstep 远淡出 | 大气/云中散射 | `rd.y` 项符号反过来（上升气流），`WCOL` 换白金/暖灰，`mu⁴` 换 `mix(.4,1.,forward)` |
| `W_RAYS` 半分辨率 raymarch + 深度感知上采样 | **云隙光 / 教堂光柱** | 遮挡源从阴影图换成「云层密度 3D 纹理或云海高度场求交」，`pat` 项改云边噪声，`RAYN=34` 直接沿用 |
| `caus()` 迭代 warp 焦散 | **彩窗光斑 / 水波反射** | 同一函数就是投在地面的彩色光斑；`cuv()` 沿光向投影 + RGB 偏移做色散 |
| `W_LEAF` 圆弧+扭转+收缩叶片 | **旗帜、幡、麦浪、瀑布水帘、藤蔓** | 只改 `shp`/`wav`/`pr`；瀑布把行波相位沿 v 反向加速，旗帜把曲率 `k` 调小、扭转加大 |
| 三平面 detail + 4 阶距离 LOD | **白金城市石材/金属** | 同一张 detail 图，`mat` 分支改「石/金/瓦/木」，`gloss/bump` 提上去做金属高光 |
| `meshLathe` + `sweep` + 平面削切 | **大教堂（拱肋/扶壁/尖塔/玫瑰窗）** | 尖拱 = 圆弧参数化椭圆化；尖塔 = `meshLathe`；扶壁 = `sweep` 沿抛物线；玫瑰窗 = `meshCoral` 改成正圆对称 |
| `vsSnow` 的 `mod` 环绕粒子 | 浮尘 / 云中光点 / 落花 | `B=44` 改 30–60，再叠第二层不同速度 = 「近景尘 + 远景絮」 |
| 体积纹理（开放度 + 天光传播） | 巷道 AO / 云影 | 512×高×512 `rg8` 一次传播直接查表，比 SSAO 便宜且无噪点 |
| `collide()` SDF 梯度推出 + 速度投影 | 岛上行走/飞行碰撞 | 岛壳即 SDF 可直接复用；`CR=.5`、子步 .4 m、梯度阈值 .075 照抄 |
| 两级低通视角 + 指数阻尼移动 | 飞控手感 | 常数 `30 / 4.5 / .0022 / 7 / 26` 直接可用 |
| `build.mjs` 内联 + 单独压缩着色器 | 单文件交付 | 保留「按序拼接 + 一个 async IIFE + `/*SCRIPT*/` 占位」；把 `/*wgsl*/` 换成 `/*glsl*/` 即可复用同一套正则 |
| 动态分辨率三段式控制器 | 跨设备 | 无 GPU 时间戳时走 `a>17.6` 分支；`PIXMIN` 按目标机型调 |
| `mkSound` 固定图 + 10 Hz 调度 + 声部池 | 程序化环境音 | water rush 换 wind rush（同一 `bandpass 300 Q.9`，`220+v*14` 换 `400+v*20`）；鲸鸣换远处钟声 |

---

## 9. 给我的天空之城场景的落地建议（按优先级）

1. **先搭「半分辨率体积光 + 深度感知上采样」**：画面档次的第一杠杆 —— `RAYN=34`、120 m、`dt=tm/RAYN`、IGN 抖动、3×3 `1/(.03+|Δz|/z)` 模糊 + 4 抽样双边合成，整套约 60 行，与引擎无关。
2. **云海做成「全屏 4 顶点平面 + 3 尺度斜率噪声」**：照 `W_SURF:vs` 的 ±900 m 四边形，顶点落在云层高度，透视插值自动给深度；片元只做法线 + 边缘光 + 逆光透射，比 volumetric cloud 便宜一个数量级。
3. **浮空岛用「密度场 → surface nets」一次烘死**：`VS≈0.75 m` 对付 300–400 m 世界刚好；密度函数保留 warp(15/6/15) + 手工岛形(`seg2` 胶囊) + 侵蚀噪声三层，法线从密度场中心差分（±0.8 体素）。
4. **静态光照全烘进 3D 纹理**：一张 `rg8` 存「开阔度 + 天光」，一次 -Y 传播 + 可分离模糊；AO、云影、体积光浓淡、雾浓度全查表 —— 运行时零成本拿到「有体积的空气」。
5. **白金城市表面用「三平面 detail + 4 阶距离 LOD + mat 分支」**：一张 1024² 程序化 detail 图走天下，`mat` 只是 5 个 if 分支切配色与 gloss，只留一条 pipeline。
6. **大教堂全部用 `sweep` + `meshLathe` 搭**：拱肋、扶壁、尖塔、栏杆、窗框都是这两条曲线的组合；尖拱把 `sin(ka*v)/ka` 改成椭圆弧即可。
7. **植被/旗帜/瀑布统一走「顶点着色器解析曲面」**：`2×ROWS` 顶点 strip，等曲率圆弧 + 扭转 + `pow(sin(πv^a),b)` 宽度，远处整体收缩而非 alpha 淡出。
8. **阴影就一张 4096² 正交图，不要 CSM**：世界只有 400 m 量级，`R=225, d0=-175, d1=125`，PCF 9 抽 + 法线抬高 0.35 m + bias 2/1.5，配反向 Z 与 `-0.0007` 偏移。
9. **相机手感直接抄常数**：两级低通 `1-exp(-dt*30)`、移动阻尼 `1-exp(-dt*4.5)`、灵敏度 .0022 rad/px、速度 7/26 m/s、俯仰 ±1.55；碰撞用「距离场 + 梯度推出 + 删速度法向分量」而非射线。
10. **音频用「固定图 + 声部池 + 10 Hz 调度」把成本压到 0**：两层 LFO 噪声做风，5 音失谐正弦做 drone，`play()` 一个包络服务钟声/鲸鸣/气泡，卷积混响用 5 s 合成 IR，再挂「速度/高度 → 增益与截止」耦合。

## 10. 明确「未实现 / 未涉及」（别照着找）

- **无固定步长、无状态插值**（`dt` 只 clamp 100 ms）；**无 TAA/时域重投影/SSAA**；**无 CSM**；**无 SSAO/SSR/depth prepass**；**无运动模糊、无色差、无景深**（只有暗角 + 1/255 抖动颗粒，且颗粒**静态**、不随时间变化）。
- **无动画系统/骨骼**：蝠鲼与鱼都是顶点着色器里的参数化摆动（`vsManta`/`vsFish`），没有蒙皮；**无 viewpoint 过渡动画**（`1`–`6` 直接赋值瞬移）。
- **无 UI 内嵌 canvas**：菜单是纯 DOM/CSS，画布在下面继续渲（模糊靠 `filter: blur(1vmax)`）。
- **无 WebGL 回退**：`navigator.gpu` 缺失直接抛错（`main.js:19`），没有降级到 WebGL2 的分支 —— 这正是你做 WebGL2 版必须自己补的一整层。
- **无音频素材、无频谱分析**；音频与画面只有「速度/深度」一条耦合，没有事件同步。少量本可更省处：`frame()` 每帧 `createCommandEncoder()`；`resize()` 销毁重建全部 render target（会抖一帧）；`dynWait` 上限 60 s 意味着低端机可能长时间试探。
