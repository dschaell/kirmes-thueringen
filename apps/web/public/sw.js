/* global self, clients, URL */
// Service Worker (Issue #348): zeigt Push-Benachrichtigungen und öffnet beim Antippen die Seite.
// Er speichert nichts zwischen – die Website bleibt immer aktuell.
self.addEventListener('push', (event) => {
  let n = { titel: 'Kirmeskalender Thüringen', text: '', url: '/', tag: undefined };
  try {
    n = { ...n, ...event.data.json() };
  } catch {
    /* leere oder fremde Nachricht – Standardtext */
  }
  event.waitUntil(
    self.registration.showNotification(n.titel, {
      body: n.text,
      tag: n.tag,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      lang: 'de',
      data: { url: n.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const pfad = event.notification.data?.url;
  // nur Pfade der eigenen Seite öffnen
  const url = new URL(
    typeof pfad === 'string' && pfad.startsWith('/') ? pfad : '/',
    self.location.origin,
  );
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((fenster) => {
      for (const f of fenster) {
        if (new URL(f.url).origin === url.origin && 'focus' in f) {
          f.navigate(url.href);
          return f.focus();
        }
      }
      return clients.openWindow(url.href);
    }),
  );
});
