/* AquaGwada — Service Worker (push notifications + minimal offline shell) */
const CACHE = "aquagwada-v1";
const SHELL = ["/", "/icon-192.png", "/icon-512.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/** Network-first ; fallback cache pour navigations en cas de coupure. */
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("/").then((r) => r ?? new Response("Hors ligne", { status: 503 })))
    );
  }
});

/** Réception d'une notif push (envoyée par notre serveur via VAPID). */
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "AquaGwada", body: event.data ? event.data.text() : "" }; }
  const title = data.title || "AquaGwada";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || "aquagwada",
    renotify: true,
    data: { url: data.url || "/" },
    requireInteraction: !!data.requireInteraction,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

/** Au clic, focus l'app si déjà ouverte sinon l'ouvre. */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) { client.navigate(url); return client.focus(); }
      }
      return self.clients.openWindow(url);
    })
  );
});