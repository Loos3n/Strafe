// Lets the installed game open with no connection. The page is fetched fresh
// whenever the network answers (so updates land on the next launch) and kept
// for offline; three.js, the fonts and the icons come from the cache first.
// Online calls (/api/, races) always go to the network.
const CACHE = 'strafe-v1';
const THREE = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png', '/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(async (c) => {
    await c.addAll(SHELL);
    await c.add(THREE).catch(() => {}); // cached on first use if this fails
  }).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const keep = (req, res) => {
  if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
  return res;
};

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  const local = url.origin === location.origin;
  if (local && (url.pathname.startsWith('/api/') || url.pathname.startsWith('/race/'))) return;
  if (req.mode === 'navigate') {
    // the page: network first (give up after a few seconds if a cached copy exists)
    e.respondWith((async () => {
      const cached = await caches.match('/');
      const net = fetch(req).then((res) => (res.ok ? keep('/', res) : res));
      if (!cached) return net;
      const slow = new Promise((r) => setTimeout(() => r(cached), 4000));
      return Promise.race([net.catch(() => cached), slow]);
    })());
    return;
  }
  if (local || url.href === THREE || /^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => keep(req, res))));
  }
});
