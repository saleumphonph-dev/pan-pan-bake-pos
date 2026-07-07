// Push-only service worker for Pan Pan Bake POS.
// Handles Web Push notifications + click-to-focus. It has NO fetch/cache handler,
// so it never serves stale content (the app has no offline caching by design).

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data.json(); } catch (e) {}
  const title = data.title || "🔔 New sale";
  const options = {
    body: data.body || "",
    icon: "icon-192.png",
    badge: "icon-192.png",
    tag: data.tag || "sale",
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) { if ("focus" in c) { try { return c.focus(); } catch (e) {} } }
    if (self.clients.openWindow) return self.clients.openWindow("./");
  })());
});

// Activate immediately on install/update.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
