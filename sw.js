// ============================================================
// SW.JS — Service Worker | AGUIAS DE CRISTO Pizza Camp v2
// ============================================================
const CACHE = 'pizzacamp-v2';
const STATIC = [
    './',
    './index.html',
    './admin.html',
    './client.js',
    './admin.js',
    './styles.css',
    './manifest.json',
    './logo.png',
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE).then(c => Promise.allSettled(STATIC.map(u => c.add(u))))
              .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
              .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
              .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', e => {
    const url = new URL(e.request.url);
    // Supabase: sempre rede
    if (url.hostname.includes('supabase.co')) {
        e.respondWith(fetch(e.request).catch(() => new Response('{}', { headers: { 'Content-Type': 'application/json' } })));
        return;
    }
    // Demais: cache-first
    e.respondWith(
        caches.match(e.request).then(cached => {
            if (cached) return cached;
            return fetch(e.request).then(res => {
                if (res && res.status === 200) {
                    caches.open(CACHE).then(c => c.put(e.request, res.clone()));
                }
                return res;
            }).catch(() => caches.match('./index.html'));
        })
    );
});
