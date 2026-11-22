/* Guarda as telas do app no celular para abrir sem sinal. Dados (caixa postal) nunca passam por aqui. */
const CACHE = "campo-v1.2.0";
const ARQUIVOS = ["./", "index.html", "app.css", "app.js", "manifest.webmanifest", "icone-192.png", "icone-512.png", "icone-maskable-512.png", "apple-touch-icon.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(c => {
    const rede = fetch(e.request).then(r => { if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(cc => cc.put(e.request, cp)); } return r; }).catch(() => c);
    return c || rede;
  }));
});
