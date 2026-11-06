const CACHE_NAME = 'pontodigital-cache-v3';
const urlsToCache = [
  '/',
  '/index.html',
  '/pwa-icon.png',
  '/pwa-icon-512.png',
  '/manifest.json'
];

// Install a service worker and precache core shell
self.addEventListener('install', event => {
  self.skipWaiting(); // Force active status immediately on update
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Precaching app shell...');
        return cache.addAll(urlsToCache);
      }).catch(err => {
        console.warn('[Service Worker] Precaching warning (expected in development):', err);
      })
  );
});

// Activate the service worker and remove outdated caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[Service Worker] Claiming clients...');
      return self.clients.claim();
    })
  );
});

// Fetch handler - Network-First with Cache Fallback
self.addEventListener('fetch', event => {
  // Only handle GET requests and local scope origin requests
  if (event.request.method !== 'GET') return;
  
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Let authentication, Firestore operations, and API endpoints run normally through the network
  if (url.pathname.startsWith('/api') || url.pathname.includes('firestore') || url.pathname.includes('__')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // If the request succeeds, clone the response and cache it
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // If the network request fails, look in the cache
        return caches.match(event.request).then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // If a page navigation fails (offline), fall back to the root shell index.html
          if (event.request.mode === 'navigate') {
            return caches.match('/');
          }
        });
      })
  );
});

// Suporte a Push Notifications via Web Push / Service Worker
self.addEventListener('push', event => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { title: 'Ponto Digital', message: event.data.text() };
    }
  }

  const title = data.notification?.title || data.title || '📌 Ponto Digital';
  const body = data.notification?.body || data.message || data.body || 'Você possui uma nova notificação.';
  const link = data.data?.link || data.link || '/#notifications';

  const options = {
    body,
    icon: '/pwa-icon.png',
    badge: '/pwa-icon.png',
    vibrate: [150, 80, 150],
    data: { link },
    tag: 'ponto-digital-push',
    renotify: true
  };

  // Atualiza contador no ícone do aplicativo
  if (self.navigator && 'setAppBadge' in self.navigator) {
    const unread = parseInt(data.data?.unreadCount || data.unreadCount || '1', 10);
    if (!isNaN(unread) && unread > 0) {
      self.navigator.setAppBadge(unread).catch(() => {});
    } else {
      self.navigator.setAppBadge().catch(() => {});
    }
  }

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (self.navigator && 'clearAppBadge' in self.navigator) {
    self.navigator.clearAppBadge().catch(() => {});
  }

  const targetLink = event.notification.data?.link || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (const client of windowClients) {
        if ('focus' in client) {
          if (client.url && client.url.includes(self.location.origin)) {
            client.navigate(targetLink);
            return client.focus();
          }
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetLink);
      }
    })
  );
});

