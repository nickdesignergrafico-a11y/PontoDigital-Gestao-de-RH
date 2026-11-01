importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// Configuração do Firebase para o Service Worker do FCM
firebase.initializeApp({
  apiKey: "AIzaSyDummyApiKeyPlaceholder",
  authDomain: "ponto-digital-1b9c2.firebaseapp.com",
  projectId: "ponto-digital-1b9c2",
  storageBucket: "ponto-digital-1b9c2.firebasestorage.app",
  messagingSenderId: "217133597791",
  appId: "1:217133597791:web:placeholder"
});

const messaging = firebase.messaging();

// Handler de mensagens recebidas em segundo plano (quando a aba está fechada ou em background)
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Mensagem recebida em segundo plano: ', payload);

  const notificationTitle = payload.notification?.title || '📌 Ponto Digital';
  const notificationOptions = {
    body: payload.notification?.body || 'Nova notificação do sistema.',
    icon: '/pwa-icon.png',
    badge: '/pwa-icon.png',
    data: payload.data || {},
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Ao clicar na notificação, abre ou foca no app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/#/admin/reports';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let client of windowClients) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
