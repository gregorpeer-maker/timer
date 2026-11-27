// Service Worker: App offline verfügbar machen und Mitteilungen anzeigen.
// Seiten: zuerst aus dem Netz (damit Updates sofort ankommen), ohne Netz aus dem Speicher.
const CACHE = 'kfz-arbeitsplatz-v2';
const SHELL = ['./', './index.html', './timer.html', './erinnerung.js', './cloud.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/badge-96.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;   // Cloud, WebUntis, Schriften: nie aus dem Speicher
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html'))));
});

// Klick auf eine Mitteilung: offenes Fenster nach vorne holen, sonst den Arbeitsplatz öffnen
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const ziel = (e.notification.data && e.notification.data.url) || './index.html';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const offen = list.find(c => new URL(c.url).pathname.endsWith(ziel.replace('./', '/')) ) || list[0];
    return offen ? offen.focus() : self.clients.openWindow(ziel);
  }));
});

// Vorbereitet für Erinnerungen aus der Cloud, wenn die App geschlossen ist (Web Push)
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { titel: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.titel || 'KFZ-Arbeitsplatz', {
    body: d.text || '', tag: d.tag || undefined, icon: 'icons/icon-192.png', badge: 'icons/badge-96.png',
    requireInteraction: !!d.wichtig, data: { url: d.url || './index.html' },
  }));
});
