importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// Configuração oficial do Firebase para o Service Worker do FCM
firebase.initializeApp({
  projectId: "ponto-digital-1b9c2",
  appId: "1:214648846167:web:fee694e6a41fa82898b012",
  apiKey: "AIzaSyA9rZGkNSJ6gUzM1AYIuwSOEDA72V9Qo40",
  authDomain: "ponto-digital-1b9c2.firebaseapp.com",
  firestoreDatabaseId: "pontodigital",
  storageBucket: "ponto-digital-1b9c2.firebasestorage.app",
  messagingSenderId: "214648846167"
});

const messaging = firebase.messaging();

// Handler de mensagens FCM em segundo plano (com o app fechado ou minimizado)
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Notificação recebida em segundo plano: ', payload);

  const notificationTitle = payload.notification?.title || payload.data?.title || '📌 Ponto Digital';
  const notificationBody = payload.notification?.body || payload.data?.message || payload.data?.body || 'Você possui uma nova mensagem no sistema.';
  
  const notificationOptions = {
    body: notificationBody,
    icon: '/pwa-icon.png',
    badge: '/pwa-icon.png',
    vibrate: [150, 80, 150],
    data: {
      ...payload.data,
      url: payload.data?.link || payload.data?.url || '/#notifications',
      receivedAt: Date.now()
    },
    tag: 'ponto-digital-msg',
    renotify: true,
  };

  // Atualiza o contador de mensagens no ícone do aplicativo (Badging API) se suportado
  if (self.navigator && 'setAppBadge' in self.navigator) {
    const rawBadge = payload.data?.unreadCount || payload.notification?.badge;
    const badgeNum = rawBadge ? parseInt(rawBadge, 10) : 1;
    if (!isNaN(badgeNum) && badgeNum > 0) {
      self.navigator.setAppBadge(badgeNum).catch(() => {});
    } else {
      self.navigator.setAppBadge().catch(() => {});
    }
  }

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Ao clicar na notificação push do sistema operacional
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Limpa o badge do ícone ou decrementa
  if (self.navigator && 'clearAppBadge' in self.navigator) {
    self.navigator.clearAppBadge().catch(() => {});
  }

  const targetUrl = event.notification.data?.url || '/#notifications';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          if (client.url && client.url.includes(self.location.origin)) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
