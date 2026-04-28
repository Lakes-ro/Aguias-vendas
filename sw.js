// ============================================================
// SW.JS — Service Worker | AGUIAS DE CRISTO Pizza Camp v3
// ============================================================
const CACHE = 'pizzacamp-v3';
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
        caches.open(CACHE)
              .then(c => Promise.allSettled(STATIC.map(u => c.add(u))))
              .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
              .then(keys => Promise.all(
                  keys.filter(k => k !== CACHE).map(k => caches.delete(k))
              ))
              .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', e => {
    // Ignora requisições não-GET (POST, PUT, DELETE...)
    if (e.request.method !== 'GET') return;

    const url = new URL(e.request.url);

    // Supabase: sempre vai para a rede, sem cache
    if (url.hostname.includes('supabase.co')) {
        e.respondWith(
            fetch(e.request).catch(() =>
                new Response('{}', { headers: { 'Content-Type': 'application/json' } })
            )
        );
        return;
    }

    // Demais recursos: tenta cache primeiro, depois rede
    e.respondWith(
        caches.match(e.request).then(cached => {
            if (cached) return cached;

            // Busca na rede e armazena no cache
            return fetch(e.request).then(networkResponse => {
                // Só armazena respostas válidas
                if (
                    networkResponse &&
                    networkResponse.status === 200 &&
                    networkResponse.type !== 'opaque'
                ) {
                    // Clona ANTES de qualquer uso — evita "body already used"
                    const toCache = networkResponse.clone();
                    caches.open(CACHE).then(c => c.put(e.request, toCache));
                }
                return networkResponse;
            }).catch(() => {
                // Offline: tenta servir a página principal
                return caches.match('./index.html');
            });
        })
    );
});
