// GCS service worker: works offline, but always tries the network first for the app page so a new upload
// to GitHub Pages shows on the next load (no stale copies). Also receives .gcs / .pcw files shared to the app.
const CACHE = 'gcs-cache-v1';
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('gcs-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  // Share target: a file shared to the installed app arrives as a POST; hand it to the page
  if (req.method === 'POST' && url.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      const form = await req.formData();
      const file = form.get('file');
      const target = new URL('./', self.registration.scope).href;
      setTimeout(async () => {
        const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        all.forEach(c => c.postMessage({ type: 'SHARE_TARGET', file }));
      }, 1500);
      return Response.redirect(target, 303);
    })());
    return;
  }
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;   // CDN libraries: browser cache
  // App files: network first, cache as fallback (offline)
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then(r => r || caches.match('./index.html'))));
});
