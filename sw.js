self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => self.clients.claim());
self.addEventListener('push', e => { const d = e.data ? e.data.json() : {}; e.waitUntil(self.registration.showNotification(d.title || 'Grok Bot', {body: d.body || '', data: {url: d.url}})); });
self.addEventListener('notificationclick', e => { e.notification.close(); if (e.notification.data && e.notification.data.url) e.waitUntil(clients.openWindow(e.notification.data.url)); });
