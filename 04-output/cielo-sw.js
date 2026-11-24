// cielo-sw.js — 第十一轮 PWA 离线壳。
// 只缓存天空鲸城这一页（单文件 HTML + 图标 + manifest），装到主屏幕后断网也能打开。
// 换版本时把 VERSION 加一：activate 会清掉旧缓存。
const VERSION = 'cielo-v11-2026-11-24';
const CORE = [
  './CIELO.html',
  './cielo.webmanifest',
  '../assets/pwa/icon-192.png',
  '../assets/pwa/icon-512.png',
  '../assets/pwa/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(CORE).catch(() => c.add('./CIELO.html')))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('cielo-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // 页面导航：优先缓存（离线可用），后台顺手更新
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.match('./CIELO.html').then((hit) => {
        const net = fetch(req).then((res) => {
          if (res && res.ok) caches.open(VERSION).then((c) => c.put('./CIELO.html', res.clone()));
          return res;
        }).catch(() => hit);
        return hit || net;
      })
    );
    return;
  }

  // 其余同源资源：缓存优先，缺了再取网络并补进缓存
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => hit))
  );
});
