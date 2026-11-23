// guide.js — 《天空鲸城导览抄本》: arrival detection, progress and the reading UI.
//
// Product rules:
//   · 每处地标有一个"抵达区域"。第一次飞进去时，右下角滑出一张抵达卡片（标题 + 一句引言 +
//    "G 阅读记载"），并把这条记载"显影"进抄本。
//   · 按 G 打开抄本：左栏目录（按区域分组，显示 已抵达 / 未抵达），右栏正文。
//   · 抵达过的记载才可读；未抵达的一律显示"尚未抵达此地的记载"，但会给一句"怎么去"。
//   · 按 U 可以打开"预读"（显示全部正文，持久化），给不想慢慢逛的人用。
//   · 进度（已抵达 N / 总 M）与预读开关存在 localStorage。
import { AREAS, LORE } from './lore.js';
import { L } from './layout.js';

const KEY = 'cielo.almanac.v1';
const pad = (n) => String(n).padStart(2, '0');

function zoneCentre(entry) {
  const z = entry.zone;
  if (!z) return null;
  if (z.at) return z.at;
  if (typeof z.view === 'number') {
    const v = L.views[z.view];
    return v ? v.pos : null;
  }
  return null;
}

export function createGuide({ cam, toast }) {
  const found = new Set();   // 已抵达
  const fresh = new Set();   // 已抵达但还没在抄本里翻开
  let spoiler = false;
  let sel = 0;
  let open = false;
  let tick = 0;
  let cardTimer = 0;
  let lastCardAt = 0;      // 两张卡片之间至少隔一会儿：露台一带的记载挨得很近，
                           // 否则一落地就会连弹三张，把"抵达感"稀释掉
  const CARD_GAP = 6500;

  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (Array.isArray(s.found)) s.found.forEach((id) => found.add(id));
      spoiler = !!s.spoiler;
    }
  } catch (e) { /* private mode / disabled storage: the almanac still works, progress just resets */ }
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify({ found: [...found], spoiler })); } catch (e) { /* ignore */ }
  };

  const items = LORE.map((entry, i) => ({
    entry, i,
    area: AREAS.find((a) => a.id === entry.area) || AREAS[0],
    centre: zoneCentre(entry),
  }));
  const groups = AREAS
    .map((a) => ({ area: a, list: items.filter((x) => x.entry.area === a.id) }))
    .filter((g) => g.list.length > 0);
  const total = items.length;
  const foundCount = () => items.filter((x) => found.has(x.entry.id)).length;

  const $ = (id) => document.getElementById(id);
  const cardEl = $('placecard');
  const cardArea = $('pc-area'), cardIdx = $('pc-idx'), cardTitle = $('pc-title'), cardEn = $('pc-en'), cardQuote = $('pc-quote');
  const guideEl = $('guide'), listEl = $('gb-list'), artEl = $('gb-article'), countEl = $('gb-count');

  // ------------------------------------------------------------ 抵达卡片
  function hideCard() {
    clearTimeout(cardTimer);
    cardEl?.classList.remove('show');
  }

  const pending = [];      // 卡片排期：连着解锁的几页，等上一张收起来再逐张弹

  function showCard(x) {
    if (!cardEl) return;
    lastCardAt = Date.now();
    cardArea.textContent = x.area.cn + ' · ' + (x.entry.tag || '记载');
    cardIdx.textContent = 'LORE ' + pad(x.i + 1) + ' / ' + pad(total);
    cardTitle.textContent = x.entry.title;
    cardEn.textContent = x.entry.en;
    cardQuote.textContent = x.entry.quote;
    cardEl.classList.add('show');
    clearTimeout(cardTimer);
    cardTimer = setTimeout(() => {
      cardEl.classList.remove('show');
      const next = pending.shift();
      if (next) setTimeout(() => showCard(next), 750);
    }, 9000);
  }

  // ------------------------------------------------------------ 抄本渲染
  function renderList() {
    if (!listEl) return;
    const out = [];
    for (const g of groups) {
      out.push('<div class="gb-area">' + g.area.cn + '<span>' + g.area.en + '</span></div>');
      for (const x of g.list) {
        const has = found.has(x.entry.id);
        const st = has ? (fresh.has(x.entry.id) ? '新' : '已抵达') : '未抵达';
        out.push('<div class="gb-item' + (x.i === sel ? ' sel' : '') + (has ? '' : ' locked') + '" data-i="' + x.i + '">' +
          '<span class="idx">' + pad(x.i + 1) + '</span>' +
          '<span class="nm">' + x.entry.title + '</span>' +
          '<span class="st">' + st + '</span></div>');
      }
    }
    listEl.innerHTML = out.join('');
    for (const el of listEl.querySelectorAll('.gb-item')) {
      el.addEventListener('click', () => select(Number(el.dataset.i)));
    }
    const cur = listEl.querySelector('.gb-item.sel');
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
  }

  function renderArticle() {
    if (!artEl) return;
    const x = items[sel];
    if (!x) { artEl.innerHTML = ''; return; }
    const e = x.entry;
    const has = found.has(e.id) || spoiler;
    const wasFresh = fresh.delete(e.id);
    const head =
      '<div class="a-tag">' + (has ? 'LORE ' + pad(x.i + 1) + ' / ' + pad(total) + ' · ' : '') + x.area.cn + ' · ' + (e.tag || '记载') + '</div>' +
      '<h2>' + e.title + '</h2>' +
      '<div class="a-en">' + e.en + '</div>' +
      '<blockquote class="a-quote">' + e.quote + '</blockquote>';
    const body = has
      ? e.body.map((p) => '<p>' + p + '</p>').join('')
      : '<p class="a-locked">这一页还没有显影。<br>抵达' + e.title + '之后，抄本会自己把字写上去。（也可以按 U 预读全部记载。）</p>';
    const foot = '<div class="a-go"><b>去这里</b>　' + (e.go || '') + '</div>' +
      (has && !found.has(e.id) ? '<div class="a-go">预读 · 你还没有真正抵达过这里</div>' : '');
    artEl.innerHTML = head + body + foot;
    artEl.scrollTop = 0;
    if (wasFresh) renderList();   // 刚翻开的一页把列表里的"新"立刻去掉
    if (countEl) countEl.textContent = foundCount() + ' / ' + total;
  }

  function select(i) {
    sel = ((i % total) + total) % total;
    renderList();
    renderArticle();
  }

  function refresh() {
    renderList();
    renderArticle();
  }

  // ------------------------------------------------------------ 开合
  function setOpen(v) {
    open = v;
    if (!guideEl) return;
    guideEl.classList.toggle('open', v);
    document.getElementById('hud')?.classList.toggle('reading', v);
    if (v) {
      hideCard();
      pending.length = 0;
      try { document.exitPointerLock?.(); } catch (e) { /* ignore */ }
      refresh();
    }
  }

  function toggle() {
    if (!open) {
      // 打开时默认落在最新显影的那一页
      const lastFound = items.slice().reverse().find((x) => found.has(x.entry.id) && fresh.has(x.entry.id)) ||
        items.slice().reverse().find((x) => found.has(x.entry.id));
      if (lastFound) sel = lastFound.i;
    }
    setOpen(!open);
  }

  function close() { if (open) setOpen(false); }
  function nav(d) { if (open) select(sel + d); }
  function toggleSpoiler() {
    spoiler = !spoiler;
    save();
    refresh();
    toast?.(spoiler ? '预读已打开 · 全部记载可见' : '预读已关闭 · 只显示抵达过的记载', 2200);
  }

  // ------------------------------------------------------------ 抵达检测
  function unlock(x) {
    if (found.has(x.entry.id)) return false;
    found.add(x.entry.id);
    fresh.add(x.entry.id);
    save();
    // 卡片节流：刚弹过一张就排队，等它收起来再逐张补上；抄本里也标"新"
    if (Date.now() - lastCardAt > CARD_GAP && !cardEl?.classList.contains('show')) showCard(x);
    else { pending.push(x); if (pending.length > 6) pending.shift(); }
    if (open) refresh();
    return true;
  }

  function unlockSpecial(key) {
    const x = items.find((it) => it.entry.unlock === key);
    if (x && unlock(x)) return true;
    return false;
  }

  function unlockAll() {
    for (const x of items) { found.add(x.entry.id); }
    save();
    if (open) refresh();
  }

  function update(pos, dt) {
    tick += dt;
    if (tick < 0.22) return;
    tick = 0;
    if (open) return;
    let best = null, bestD = Infinity;
    for (const x of items) {
      if (!x.centre || found.has(x.entry.id)) continue;
      const r = x.entry.zone.r || 20;
      const dx = pos[0] - x.centre[0], dy = pos[1] - x.centre[1], dz = pos[2] - x.centre[2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 <= r * r && d2 < bestD) { bestD = d2; best = x; }
    }
    if (best) unlock(best);
  }

  // 点空背景 / 点关闭按钮
  guideEl?.addEventListener('click', (e) => {
    if (e.target === guideEl) close();
  });

  return {
    update, toggle, close, nav, toggleSpoiler, unlockSpecial, unlockAll, hideCard,
    isOpen: () => open,
    count: () => foundCount(),
    total,
    has: (id) => found.has(id),
  };
}
