// ================================================================
// SW.JS — Service Worker | Pizza Camp · Aguias de Cristo · v5
// ================================================================
// Estratégias por tipo de recurso:
//
//   NETWORK-FIRST  → HTML, JS, CSS, manifest
//                    Tenta rede; cache só como fallback offline.
//                    Garante que qualquer deploy chegue aos usuários.
//
//   CACHE-FIRST    → CDNs externos (fontes, ícones, Tailwind)
//                    Imutáveis — baixa uma vez, serve do cache.
//
//   CACHE-FIRST    → Supabase Storage /pizzas/ (imagens das pizzas)
//                    Raramente mudam; economiza dados da comunidade.
//
//   SEM CACHE      → Supabase API (dados, pedidos, estoque)
//                    Realtime — nunca interceptar.
// ================================================================

const CACHE_NAME = 'pizzacamp-v7';

// Arquivos locais que usam Network-First
const NETWORK_FIRST_PATHS = [
    'index.html',
    'admin.html',
    'client.js',
    'admin.js',
    'styles.css',
    'admin.css',
    'client.css',
    'manifest.json',
    'pwa-update.js',
];

// Domínios externos imutáveis → Cache-First
const CACHE_FIRST_HOSTS = [
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'cdnjs.cloudflare.com',
    'cdn.jsdelivr.net',
    'cdn.tailwindcss.com',
];

// ── INSTALL ──────────────────────────────────────────────────────
// Não faz pré-cache no install. O cache será populado sob demanda
// (lazy caching) no primeiro fetch de cada arquivo.
// skipWaiting() aqui garante que um novo SW instalado assuma
// o controle IMEDIATAMENTE, sem esperar o usuário fechar abas.
self.addEventListener('install', () => {
    self.skipWaiting();
});

// ── ACTIVATE ─────────────────────────────────────────────────────
// Remove todos os caches de versões anteriores.
// clients.claim() faz o novo SW controlar abas já abertas,
// sem precisar de reload manual.
self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys
                    .filter(k => k !== CACHE_NAME)
                    .map(k => {
                        console.log('[SW] Removendo cache antigo:', k);
                        return caches.delete(k);
                    })
            ))
            .then(() => {
                console.log('[SW] v5 ativo — controlando todas as abas');
                return self.clients.claim();
            })
    );
});

// ── FETCH ─────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
    // Ignora métodos não-GET (POST do Supabase, etc.)
    if (e.request.method !== 'GET') return;

    const url = new URL(e.request.url);

    // ── 0. Arquivo pwa-update.js — agora é inline, ignora requisição ──
    if (url.pathname.endsWith('pwa-update.js')) {
        e.respondWith(new Response('/* inline */', {
            headers: { 'Content-Type': 'application/javascript' }
        }));
        return;
    }

    // ── 1. Supabase REST API → SEM CACHE (dados em tempo real) ──
    // Exceção: /storage/ é tratado no bloco 4.
    if (
        url.hostname.includes('supabase.co') &&
        !url.pathname.includes('/storage/v1/object/public/pizzas/')
    ) {
        e.respondWith(
            fetch(e.request).catch(() =>
                new Response(
                    JSON.stringify({ error: 'offline' }),
                    { status: 503, headers: { 'Content-Type': 'application/json' } }
                )
            )
        );
        return;
    }

    // ── 2. Arquivos locais do app → NETWORK-FIRST ──────────────
    const isLocalHost = url.hostname === location.hostname || url.protocol === 'file:';
    const isNetworkFirst = isLocalHost && (
        NETWORK_FIRST_PATHS.some(p => url.pathname.endsWith(p)) ||
        url.pathname === '/' ||
        url.pathname.endsWith('/')
    );

    if (isNetworkFirst) {
        e.respondWith(networkFirst(e.request));
        return;
    }

    // ── 3. CDNs externos → CACHE-FIRST ──────────────────────────
    if (CACHE_FIRST_HOSTS.some(h => url.hostname.includes(h))) {
        e.respondWith(cacheFirst(e.request));
        return;
    }

    // ── 4. Imagens de pizzas (Supabase Storage) → CACHE-FIRST ───
    if (
        url.hostname.includes('supabase.co') &&
        url.pathname.includes('/storage/v1/object/public/pizzas/')
    ) {
        e.respondWith(cacheFirst(e.request));
        return;
    }

    // ── 5. Imagens externas (unsplash etc) → só rede, sem cache ──
    // Não tenta cachear — evita erros "Failed to convert to Response"
    if (
        url.hostname.includes('unsplash.com') ||
        url.hostname.includes('images.unsplash.com') ||
        url.hostname.includes('placehold.co') ||
        url.hostname.includes('ogastronomo.com') ||
        url.hostname.includes('fornettostore.com')
    ) {
        e.respondWith(fetch(e.request).catch(() =>
            new Response('', { status: 408, statusText: 'Offline' })
        ));
        return;
    }

    // ── 6. Demais recursos → rede com fallback para cache ────────
    e.respondWith(
        fetch(e.request).catch(async () => {
            const cached = await caches.match(e.request);
            // Se não há cache, retorna 408 válido em vez de undefined
            return cached || new Response('', { status: 408, statusText: 'Offline' });
        })
    );
});

// ── HELPERS ──────────────────────────────────────────────────────

/**
 * Network-First: busca na rede e atualiza o cache.
 * Se offline, serve do cache. Se nem isso, serve index.html.
 */
async function networkFirst(request) {
    try {
        const response = await fetch(request);
        if (response && response.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone()); // clone antes de consumir
        }
        return response;
    } catch {
        // Offline — tenta cache
        const cached = await caches.match(request);
        return cached || caches.match('./index.html');
    }
}

/**
 * Cache-First: serve do cache se disponível.
 * Se não, busca na rede e armazena para as próximas vezes.
 */
async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) return cached;

    try {
        const response = await fetch(request);
        if (response && response.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        // cached pode ser undefined se nunca foi cacheado — retorna Response vazio válido
        return cached || new Response('', { status: 408, statusText: 'Offline' });
    }
}

// ── MENSAGEM DO CLIENTE ───────────────────────────────────────────
// O toast envia 'SKIP_WAITING' para forçar a troca de versão.
// (Redundante com o skipWaiting() no install, mas mantido
//  para compatibilidade com browsers mais antigos.)
self.addEventListener('message', e => {
    if (e.data?.type === 'SKIP_WAITING' || e.data === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
