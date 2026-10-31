// 電波がないときも画面だけは開けるようにする（記録の読み書きは Supabase に直接。ここでは預からない）
// 自分のサイトのファイルは「まずネット、だめなら前に保存した分」。古い画面が残り続けないようにするため。
// 版番号つきの外部ファイル（supabase-js）は「保存した分を先に」。
const CACHE = 'weight-pace-v3';   // style.css の ?v= を変えたら SHELL も同じに直し、ここの番号も上げる
const SHELL = ['./', './index.html', './admin.html', './shared.js', './style.css?v=20261031c', './config.js',
  './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png'];
const CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.href.startsWith(CDN)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res;
    })));
    return;
  }
  if (url.origin !== location.origin) return;   // Supabase など外へのやりとりには触らない
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: req.mode === 'navigate' })
    .then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});
