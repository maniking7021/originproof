// OriginProof service worker (v0.3) — installable PWA, offline hashing.
// Caches the app's own files so the hashing / fingerprinting / verification
// UI works offline. The ethers CDN script and the ME Network RPC are NOT
// cached: on-chain reads and writes still need network, and the UI says so.
// Version the cache name on every release.
"use strict";

const CACHE_NAME = "originproof-v0.3.1";
const CORE_FILES = [
  "./",
  "index.html",
  "app.js",
  "lib.js",
  "i18n.js",
  "api.js",
  "config.js",
  "manifest.json",
  "icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Only handle same-origin GETs; let RPC / CDN / explorer requests pass through.
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return res;
      });
    }).catch(() => caches.match("index.html"))
  );
});
