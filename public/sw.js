const CACHE_NAME = "missi-v1772416132031";

// Always install fresh
self.addEventListener("install", () => self.skipWaiting());

// Claim all clients immediately
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first for EVERYTHING
self.addEventListener("fetch", (event) => {
  event.respondWith(
    fetch(event.request).catch(() =>
      event.request.mode === "navigate"
        ? new Response("<h1>Offline</h1>", { headers: { "Content-Type": "text/html" } })
        : new Response("", { status: 503 })
    )
  );
});
