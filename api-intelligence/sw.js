const CACHE_NAME = 'asiri-intelligence-os-v1.1-golden-alert';
const APP_SHELL = [
  './', './index.html',
  './styles.css?v=20260723-5', './market-explorer.css?v=20260723-5',
  './guided-search.css?v=20260723-5', './asiri-os.css?v=20260723-5', './golden-alert.css?v=20260723-5',
  './catalog.js?v=20260723-5', './app.js?v=20260723-5',
  './market-explorer.js?v=20260723-5', './search-router.js?v=20260723-5',
  './asiri-os.js?v=20260723-5', './golden-alert.js?v=20260723-5', './manifest.webmanifest?v=20260723-5',
  './icon.svg', './live-status.json', './market-data.json'
];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))); self.clients.claim(); });
async function networkFirst(request){ const cache=await caches.open(CACHE_NAME); try{ const response=await fetch(request,{cache:'no-store'}); if(response?.ok) await cache.put(request,response.clone()); return response; }catch(_){ return (await cache.match(request))||Response.error(); } }
async function cacheFirst(request){ const cached=await caches.match(request); if(cached) return cached; try{ const response=await fetch(request); if(response?.ok&&response.type!=='opaque'){ const cache=await caches.open(CACHE_NAME); await cache.put(request,response.clone()); } return response; }catch(_){ return (await caches.match('./index.html'))||Response.error(); } }
self.addEventListener('fetch', event => { if(event.request.method!=='GET') return; const url=new URL(event.request.url); if(url.pathname.endsWith('/live-status.json')||url.pathname.endsWith('/market-data.json')){ event.respondWith(networkFirst(event.request)); return; } event.respondWith(cacheFirst(event.request)); });