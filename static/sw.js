// Super Agent Party Service Worker
// Cache policy used with static resource versions injected by server.py:
//   - Main HTML: network-first with Cache-Control: no-cache
//   - Versioned resources: cache-first because an unchanged content hash identifies unchanged content
//   - Unversioned lazy-loaded libraries: stale-while-revalidate
// Increment CACHE_NAME when changing cache policy or structure so obsolete caches are removed.
const CACHE_NAME = 'sap-cache-v2';

// Static resources with a content version (?v=)
const VERSIONED_ASSET_RE = /\.(?:css|js|png|jpe?g|svg|gif|webp|ico|woff2?|ttf|eot|mp4|webm)\?v=/;

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Remove older cached versions of resources referenced by the latest HTML
function pruneStaleVersionedAssets(htmlText) {
  const current = new Set();
  const re = /(?:src|href)="([^"]+\?v=[a-f0-9]+)"/g;
  let m;
  while ((m = re.exec(htmlText))) {
    const url = m[1];
    if (!url || url.startsWith('http') || url.startsWith('//') || url.startsWith('data:')) continue;
    current.add(new URL(url, self.location.origin).href);
  }
  return caches.open(CACHE_NAME).then(cache => cache.keys()).then(keys =>
    Promise.all(
      keys
        .filter(req => {
          const u = new URL(req.url);
          if (!VERSIONED_ASSET_RE.test(u.pathname + u.search)) return false;
          // Remove the outdated cached version of a resource referenced by the current page
          const isReferenced = [...current].some(c => new URL(c).pathname === u.pathname);
          return isReferenced && !current.has(req.url);
        })
        .map(req => cache.delete(req))
    )
  );
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Apply service worker caching only to same-origin requests
  if (url.origin !== self.location.origin) return;

  const isHTML = (req.destination === 'document') || url.pathname.endsWith('.html') || url.pathname === '/';
  const isStaticAsset = /\.(?:css|js|png|jpg|jpeg|svg|gif|webp|woff2?|ttf|eot)$/.test(url.pathname);

  if (isHTML) {
    // Network-first: keep the main document current and remove obsolete resources
    event.respondWith(
      fetch(req).then(res => {
        if (res && res.status === 200) {
          const cacheCopy = res.clone();
          const textCopy = res.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(req, cacheCopy).catch(() => {});
            return textCopy.text().then(pruneStaleVersionedAssets).catch(() => {});
          }).catch(() => {});
        }
        return res;
      }).catch(() => caches.match(req).then(r => r || Response.error()))
    );
    return;
  }

  if (isStaticAsset) {
    const versioned = url.searchParams.has('v');
    if (versioned) {
      // Content-addressed resources: cache-first without revalidation
      event.respondWith(
        caches.match(req).then(cached => {
          if (cached) return cached;
          return fetch(req).then(res => {
            if (res && res.status === 200) {
              const copy = res.clone();
              caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
            }
            return res;
          }).catch(() => Response.error());
        })
      );
    } else {
      // Unversioned lazy-loaded libraries: stale-while-revalidate
      event.respondWith(
        caches.match(req).then(cached => {
          const network = fetch(req).then(res => {
            if (res && res.status === 200) {
              const copy = res.clone();
              caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
            }
            return res;
          }).catch(() => cached);
          return cached || network;
        })
      );
    }
    return;
  }
});
