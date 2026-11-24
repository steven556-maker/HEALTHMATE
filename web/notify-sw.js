// يتحمّل داخل الـ service worker اللي بيولّده vite-plugin-pwa (workbox.importScripts).
// 1) نقر الإشعار: يفتح التطبيق على تبويب الأدوية. 2) push: جاهز لاستقبال Web Push من سيرفر (VAPID) لو اتضاف مستقبلًا.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const tab = (event.notification.data && event.notification.data.tab) || "medications";
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) {
      if ("focus" in client) {
        await client.focus();
        client.postMessage({ type: "navigate", tab });
        return;
      }
    }
    await self.clients.openWindow(`./?tab=${encodeURIComponent(tab)}`);
  })());
});

// نبضة Web Push فاضية من السيرفر وقت موعد الدواء: نبني النص من بيانات محفوظة على الجهاز (أسماء الأدوية مبتروحش السيرفر).
async function dosePulse() {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  // التطبيق مفتوح وظاهر: التذكير المحلي بيعمل الشغل، ومتصفحات كروم بتتسامح مع push صامت في الحالة دي
  if (clients.some((client) => client.visibilityState === "visible")) return;
  let meta = null;
  try {
    const cache = await caches.open("hm-push-meta");
    const hit = await cache.match("push-meta.json");
    meta = hit ? await hit.json() : null;
  } catch { meta = null; }
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  const names = [];
  const due = [];
  for (const [slot, list] of Object.entries((meta && meta.slots) || {})) {
    const minutes = Number(slot.slice(0, 2)) * 60 + Number(slot.slice(3));
    const diff = current - minutes;
    if (diff >= 0 && diff < 10) { due.push(slot); for (const name of list) if (!names.includes(name)) names.push(name); }
  }
  const title = (meta && meta.title) || "HEALTHMATE";
  const body = names.length ? `${names.join("، ")} · ${(meta && meta.suffix) || ""}`.replace(/ · $/, "") : ((meta && meta.fallback) || "It's time for your medication");
  await self.registration.showNotification(title, {
    body,
    tag: `dose-push-${due.sort().at(-1) || "now"}`,
    icon: "icon.svg",
    lang: (meta && meta.lang) || undefined,
    dir: (meta && meta.dir) || undefined,
    data: { tab: "medications" },
  });
}

self.addEventListener("push", (event) => {
  if (!event.data) { event.waitUntil(dosePulse()); return; }
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { title: "HEALTHMATE", body: event.data ? event.data.text() : "" }; }
  const title = typeof payload.title === "string" && payload.title ? payload.title : "HEALTHMATE";
  event.waitUntil(self.registration.showNotification(title, {
    body: typeof payload.body === "string" ? payload.body : "",
    tag: typeof payload.tag === "string" ? payload.tag : undefined,
    icon: "icon.svg",
    data: { tab: typeof payload.tab === "string" ? payload.tab : "medications" },
  }));
});
