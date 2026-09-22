/* Axiom Flow service worker.
   Only page navigations are handled: they always go to the network (so a
   deploy is live immediately) and fall back to offline.html when there is no
   connection. Supabase, fonts and every other request pass straight through. */
var CACHE = "axiom-shell-v1";
var SHELL = ["/offline.html", "/icons/icon-192.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }));
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  if (e.request.mode !== "navigate") return;
  e.respondWith(fetch(e.request).catch(function () { return caches.match("/offline.html"); }));
});
