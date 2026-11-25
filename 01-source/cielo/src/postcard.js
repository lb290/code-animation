// postcard.js — 第十一轮产品改进 A「明信片工坊」。
//
// 在任何机位按 C（触屏：底部「明信片」按钮），把当前画面做成一张明信片：
// 纸边 + 地名（离你最近的观景点）+ 昼夜 + 日期 + 编号，可保存为 PNG 或调用系统分享。
//
// 实现要点：
//   · 只读 WebGL 默认帧缓冲（gl.readPixels），所以画面里不会混进 HUD / 抄本 UI；
//   · 触屏低画质档下画面只有 0.4 倍分辨率，出片前临时把渲染倍率抬到 1.0 渲染一帧再截，
//     截完立刻恢复（只多花一帧，不改变用户看到的画质设置）；
//   · 不引入任何依赖、不联网；分享走 Web Share API level 2（安卓 Chrome 支持文件分享）。
// 明信片上的地名不用"最近的观景点"（站偏一点就会张冠李戴），
// 而是按城区锚点判断"你现在在哪一片"，阈值之外就叫「云端漫游」。
const PLACES = [
  { name: '露台', at: [0, 32, 90], r: 70 },
  { name: '大道长街', at: [0, 6, 40], r: 130 },
  { name: '中央广场', at: [0, 6, -46], r: 70 },
  { name: '王宫', at: [0, 34, 140], r: 80 },
  { name: '玻璃宫', at: [104, 40, 44], r: 90 },
  { name: '大教堂', at: [-96, 28, -24], r: 90 },
  { name: '高架车站', at: [58, 28, -146], r: 90 },
  { name: '歌剧院', at: [104, 16, -58], r: 70 },
  { name: '巨鲸与鲸背城', at: [10, 420, -110], r: 300 },
  { name: '云上茶席', at: [-240, 128, -268], r: 100 },
  { name: '云海', at: [0, 34, 300], r: 180 },
];

const CARD_W = 1440, CARD_H = 960, PAD = 44;
const IMG_RECT = { x: PAD, y: PAD, w: CARD_W - PAD * 2, h: 700 };
const FONT_SERIF = '"Songti SC","Noto Serif SC","Source Han Serif SC",Georgia,serif';
const FONT_SANS = '"Helvetica Neue",Arial,"Noto Sans SC",sans-serif';

const pad2 = (n) => String(n).padStart(2, '0');

function placeOf(pos) {
  let best = '云端漫游', score = 1.6;
  for (const p of PLACES) {
    const d = Math.hypot(p.at[0] - pos[0], p.at[1] - pos[1], p.at[2] - pos[2]) / p.r;
    if (d < score) { score = d; best = p.name; }
  }
  return best;
}

export function createPostcard({ gl, W, cam, toast, todLabel, getPx, setPx, lock }) {
  const overlay = document.getElementById('postcard');
  const imgEl = document.getElementById('pc-img');
  const saveBtn = document.getElementById('pc-save');
  const shareBtn = document.getElementById('pc-share');
  const closeBtn = document.getElementById('pc-close');
  let state = null;          // { phase:'boost'|'capture', prevPx }
  let lastDataUrl = '';
  let lastBlob = null;

  const ensure2d = (w, h) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c.getContext('2d');
  };

  function compose(frame) {
    // frame: { w, h, rgba } —— readPixels 是自下而上的
    const tmp = ensure2d(frame.w, frame.h);
    const img = tmp.createImageData(frame.w, frame.h);
    const src = new Uint8Array(frame.rgba);
    const row = frame.w * 4;
    for (let y = 0; y < frame.h; y++) {
      img.data.set(src.subarray((frame.h - 1 - y) * row, (frame.h - y) * row), y * row);
    }
    tmp.putImageData(img, 0, 0);

    const ctx = ensure2d(CARD_W, CARD_H);
    // ---- 纸面
    const paper = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
    paper.addColorStop(0, '#fdf8ec');
    paper.addColorStop(0.55, '#f6eeda');
    paper.addColorStop(1, '#efe2c6');
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, CARD_W, CARD_H);
    ctx.strokeStyle = 'rgba(180,131,47,.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(PAD - 14.5, PAD - 14.5, CARD_W - (PAD - 14.5) * 2, CARD_H - (PAD - 14.5) * 2);

    // ---- 画面（cover 裁切）
    const r = IMG_RECT;
    const k = Math.max(r.w / frame.w, r.h / frame.h);
    const sw = r.w / k, sh = r.h / k;
    const sx = (frame.w - sw) / 2, sy = (frame.h - sh) / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    ctx.drawImage(tmp.canvas, sx, sy, sw, sh, r.x, r.y, r.w, r.h);
    // 画面内侧压一圈暗边，纸感更稳
    const vig = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
    vig.addColorStop(0, 'rgba(20,40,80,.10)');
    vig.addColorStop(0.25, 'rgba(20,40,80,0)');
    vig.addColorStop(0.75, 'rgba(20,40,80,0)');
    vig.addColorStop(1, 'rgba(20,40,80,.16)');
    ctx.fillStyle = vig;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = 'rgba(255,255,255,.75)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(r.x + 7.5, r.y + 7.5, r.w - 15, r.h - 15);
    ctx.restore();

    // ---- 落款
    const place = placeOf(cam.pos);
    const now = new Date();
    const date = now.getFullYear() + '.' + pad2(now.getMonth() + 1) + '.' + pad2(now.getDate());
    let y = r.y + r.h + 74;
    const left = r.x + 6;
    ctx.fillStyle = '#8a6a2c';
    ctx.font = '400 20px ' + FONT_SANS;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '6px';
    ctx.fillText('CIELO · 天空鲸城', left, y - 40);
    ctx.textAlign = 'right';
    ctx.fillText(date, r.x + r.w - 6, y - 40);
    ctx.textAlign = 'left';

    ctx.fillStyle = '#13224a';
    ctx.font = '400 52px ' + FONT_SERIF;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '4px';
    ctx.fillText(place, left, y + 12);
    ctx.fillStyle = '#93a3c0';
    ctx.font = '400 17px ' + FONT_SANS;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '7px';
    ctx.fillText('POSTCARD FROM CIELO · ' + (todLabel ? todLabel() : ''), left, y + 44);

    // 右侧：菱形院徽 + 编号
    const cx = r.x + r.w - 46, cy = y + 22;
    ctx.strokeStyle = 'rgba(180,131,47,.85)';
    ctx.lineWidth = 1.6;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4);
    ctx.strokeRect(-13, -13, 26, 26);
    ctx.strokeRect(-7, -7, 14, 14);
    ctx.restore();
    ctx.fillStyle = '#b4832f';
    ctx.font = '400 12px ' + FONT_SANS;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '3px';
    ctx.textAlign = 'right';
    const serial = (now.getMonth() + 1) * 100 + now.getDate();
    ctx.fillText('POSTCARD No.' + serial, cx - 34, cy + 4);
    ctx.textAlign = 'left';

    // 底部细线 + 一行小字
    ctx.strokeStyle = 'rgba(28,49,96,.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, CARD_H - 62);
    ctx.lineTo(r.x + r.w - 6, CARD_H - 62);
    ctx.stroke();
    ctx.fillStyle = '#a08a63';
    ctx.font = '400 14px ' + FONT_SANS;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '5px';
    ctx.fillText('THE BELVEDERE ABOVE THE CLOUD SEA — 云端档案', left, CARD_H - 34);

    return ctx.canvas.toDataURL('image/png');
  }

  function show(dataUrl) {
    lastDataUrl = dataUrl;
    if (imgEl) imgEl.src = dataUrl;
    overlay?.classList.add('show');
    // 由 dataURL 得到 Blob，供「保存 / 分享」使用
    try {
      const b64 = dataUrl.split(',')[1];
      const bin = atob(b64);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      lastBlob = new Blob([u8], { type: 'image/png' });
    } catch { lastBlob = null; }
  }

  function open() {
    if (!overlay) return;
    if (state) return;
    state = { phase: 'boost', prevPx: getPx ? getPx() : 0 };
    toast?.('正在冲洗这张明信片…', 1600);
    overlay.classList.remove('show');
    // 第十三轮：出片要清晰 —— 场景内部像素预算临时抬到不低于输出画布（只多渲染一帧）。
    // 同时锁住自适应调节器，避免这一帧被"性能优先"降回去。
    lock?.(true);
    const outPx = (W.outW || 0) * (W.outH || 0);
    if (setPx && outPx > 0) setPx(Math.max(outPx, getPx ? getPx() : 0));
  }

  // main.js 每帧合成之后调用；两帧完成一次出片：第一帧抬倍率，第二帧截图
  function onFrame(/* frameW, frameH */) {
    if (!state) return false;
    if (state.phase === 'boost') { state.phase = 'capture'; return false; }
    const w = W.outW, h = W.outH;
    const buf = new Uint8Array(w * h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let url = '';
    try { url = compose({ w, h, rgba: buf }); } catch (e) { console.warn('[postcard] compose failed', e); }
    const prev = state.prevPx;
    state = null;
    if (setPx && prev > 0) setPx(prev);
    lock?.(false);
    if (url) show(url);
    else toast?.('明信片生成失败，请再试一次', 2200);
    return true;
  }

  function close() { overlay?.classList.remove('show'); }

  function fileName() {
    const d = new Date();
    return 'CIELO-postcard-' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '-' + pad2(d.getHours()) + pad2(d.getMinutes()) + '.png';
  }

  function save() {
    if (!lastBlob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(lastBlob);
    a.download = fileName();
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    toast?.('已保存到下载目录', 2200);
  }

  async function share() {
    if (!lastBlob) return;
    try {
      const file = new File([lastBlob], fileName(), { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: '天空鲸城 · CIELO', text: '来自天空鲸城的一张明信片' });
        return;
      }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    toast?.('当前浏览器不支持文件分享，请用「保存图片」', 2600);
  }

  saveBtn?.addEventListener('click', save);
  shareBtn?.addEventListener('click', share);
  closeBtn?.addEventListener('click', close);
  overlay?.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  return {
    open, onFrame, close, save, share,
    isOpen: () => !!overlay?.classList.contains('show'),
    lastDataUrl: () => lastDataUrl,
  };
}
