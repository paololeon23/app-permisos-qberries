/* Service Worker — Pase de salida Q Berries
 * Offline-safe: siempre responde con un Response válido
 */
const CACHE = 'av-permisos-v62';

const PRECACHE = [
  './',
  './index.html',
  './abrir.html',
  './instalar.html',
  './imprimir-qr.html',
  './manifest.webmanifest',
  './css/app.css',
  './core/api-config.js',
  './core/utils.js',
  './core/network.js',
  './core/offline-queue.js',
  './core/workers-catalog.js',
  './core/api.js',
  './core/qr-scan.js',
  './core/pdf-resguardo.js',
  './core/pwa.js',
  './modules/registro/registro.js',
  './modules/historial/historial.js',
  './modules/app.js',
  './data/workers.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './assets/logo-qberries.png',
  './assets/logo-qberries-white.png',
  './assets/qr-instalar.png',
  './vendor/sweetalert2.all.min.js',
  './vendor/flatpickr.min.js',
  './vendor/flatpickr-es.js',
  './vendor/flatpickr.min.css',
  './vendor/lucide.min.js',
  './vendor/jspdf.umd.min.js',
  './vendor/html5-qrcode.min.js',
];

function offlineJson() {
  return new Response(JSON.stringify({ ok: false, offline: true }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  });
}

function offlineJsonp(url) {
  try {
    var u = new URL(url);
    var cb = u.searchParams.get('callback') || '';
    var body = cb ? cb + '({ok:false,offline:true});' : '/* offline */';
    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'application/javascript' },
    });
  } catch (_) {
    return new Response('/* offline */', {
      status: 200,
      headers: { 'Content-Type': 'application/javascript' },
    });
  }
}

function offlineText(msg) {
  return new Response(msg || 'Offline', {
    status: 503,
    statusText: 'Offline',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch((e) => {
        console.warn('[sw] precache parcial', e);
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isCdn(url) {
  return /cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com/.test(url);
}

function isApi(url) {
  return (
    /script\.google\.com|macros\/s\//.test(url) ||
    /\/api\/(permisos|trabajadores)/.test(url) ||
    /\/\.netlify\/functions\//.test(url)
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = req.url;

  // Apps Script: red; si falla, JSON o JSONP válido (nunca undefined)
  if (isApi(url)) {
    event.respondWith(
      fetch(req)
        .then((res) => res || offlineJson())
        .catch(() => (url.indexOf('callback=') !== -1 ? offlineJsonp(url) : offlineJson()))
    );
    return;
  }

  // Fuentes/CDN: no romper el SW si no hay red
  if (isCdn(url)) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res && res.ok) {
            try {
              cache.put(req, res.clone());
            } catch (_) {}
          }
          return res || offlineText('CDN offline');
        } catch (_) {
          // CSS de Google Fonts vacío → la app usa fallback del sistema
          if (/fonts\.googleapis\.com/.test(url)) {
            return new Response('/* fonts offline */', {
              status: 200,
              headers: { 'Content-Type': 'text/css' },
            });
          }
          return offlineText('CDN offline');
        }
      })
    );
    return;
  }

  // App shell: cache-first; siempre Response
  event.respondWith(
    caches.match(req).then(async (cached) => {
      if (cached) {
        // Actualiza en background si hay red
        fetch(req)
          .then((res) => {
            if (res && res.status === 200 && req.url.startsWith(self.location.origin)) {
              caches.open(CACHE).then((c) => c.put(req, res.clone()));
            }
          })
          .catch(() => {});
        return cached;
      }
      try {
        const res = await fetch(req);
        if (res && res.status === 200 && req.url.startsWith(self.location.origin)) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res || offlineText('Offline');
      } catch (_) {
        // Navegación: servir index cacheado
        if (req.mode === 'navigate') {
          const index = await caches.match('./index.html');
          if (index) return index;
        }
        return offlineText('Offline');
      }
    })
  );
});
