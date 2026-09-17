self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

const BADGE_CACHE = "plant-journal-badge-v1";
const BADGE_KEY = "/__plant_journal_badge_count__";

async function readBadgeCount() {
  const cache = await caches.open(BADGE_CACHE);
  const stored = await cache.match(BADGE_KEY);
  const count = stored ? Number(await stored.text()) : 0;
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

async function setBadgeCount(count) {
  const cache = await caches.open(BADGE_CACHE);
  if (count > 0) {
    await cache.put(BADGE_KEY, new Response(String(count)));
    if (typeof self.navigator.setAppBadge === "function") await self.navigator.setAppBadge(count);
    return;
  }
  await cache.delete(BADGE_KEY);
  if (typeof self.navigator.clearAppBadge === "function") await self.navigator.clearAppBadge();
}

self.addEventListener("push", (event) => {
  if (!event.data) return;
  const payload = event.data.json();
  const notification = payload.notification || payload;
  const presentation = payload.service_worker_presentation;
  const title = presentation && typeof presentation.title === "string"
    ? presentation.title
    : notification.title || payload.title || "Reminder";
  const body = presentation && typeof presentation.body === "string"
    ? presentation.body
    : notification.body ?? payload.body;
  const badgeIncrement = Math.max(1, Number(notification.app_badge || payload.badgeCount || 1));
  const tasks = [self.registration.showNotification(title, {
    ...(body ? { body } : {}),
    tag: notification.tag || payload.tag,
    data: { url: notification.navigate || payload.url || "/" },
  })];
  tasks.push(readBadgeCount().then((current) => setBadgeCount(current + badgeIncrement)).catch(() => undefined));
  event.waitUntil(Promise.all(tasks));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/", self.location.origin).href;
  const clearBadge = setBadgeCount(0).catch(() => undefined);
  const openTarget = self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.navigate(targetUrl);
      return existing.focus();
    }
    return self.clients.openWindow(targetUrl);
  });
  event.waitUntil(Promise.all([clearBadge, openTarget]));
});
