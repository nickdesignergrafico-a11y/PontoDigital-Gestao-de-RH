import { collection, addDoc, serverTimestamp, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { getToken } from 'firebase/messaging';
import { db, getFirebaseMessaging } from './firebase';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export const createNotification = async (
  userId: string,
  title: string,
  message: string,
  type: NotificationType = 'info',
  link?: string
) => {
  try {
    await addDoc(collection(db, 'notifications'), {
      userId,
      title,
      message,
      type,
      read: false,
      link: link || '',
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error creating notification:', error);
  }
};

// Obtém o token do Firebase Cloud Messaging (FCM) e salva no perfil do usuário no Firestore
export const requestAndSaveFCMToken = async (userId: string, vapidKey?: string): Promise<string | null> => {
  try {
    const messaging = await getFirebaseMessaging();
    if (!messaging) return null;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('Permissão para notificações não foi concedida pelo usuário.');
      return null;
    }

    // Registra Service Worker se necessário
    let swRegistration;
    if ('serviceWorker' in navigator) {
      swRegistration = await navigator.serviceWorker.ready.catch(() => undefined);
    }

    const token = await getToken(messaging, {
      serviceWorkerRegistration: swRegistration,
      vapidKey: vapidKey || undefined
    });

    if (token && userId) {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        fcmToken: token,
        fcmTokens: arrayUnion(token),
        lastFCMTokenUpdate: new Date().toISOString()
      }).catch(err => {
        console.warn('Erro ao atualizar fcmToken no Firestore:', err);
      });
      console.log('✅ FCM Token registrado com sucesso para o usuário:', userId);
      return token;
    }
  } catch (err) {
    console.error('Erro ao obter token FCM:', err);
  }
  return null;
};

// Solicita permissão para notificações do navegador (Push local)
export const requestNotificationPermission = async (): Promise<NotificationPermission> => {
  if (typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'default') {
      try {
        const permission = await Notification.requestPermission();
        return permission;
      } catch (err) {
        console.error('Erro ao pedir permissão para notificações:', err);
        return 'default';
      }
    }
    return Notification.permission;
  }
  return 'denied';
};

// Dispara uma notificação nativa do sistema/navegador (Push)
export const sendBrowserNotification = (title: string, body: string, link?: string) => {
  // Ponte Kodular/AppInventor WebViewString para disparar o Notifier nativo no APK
  if (typeof window !== 'undefined' && (window as any).AppInventor) {
    try {
      const payload = {
        action: 'notification',
        title,
        message: body,
        link: link || ''
      };
      (window as any).AppInventor.setWebViewString(JSON.stringify(payload));
    } catch (err) {
      console.error('Erro ao enviar sinal para o Kodular/AppInventor:', err);
    }
  }

  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      const options: any = {
        body,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: 'ponto-digital-alert',
        renotify: true,
      };
      
      const notification = new Notification(title, options);
      
      notification.onclick = () => {
        window.focus();
        if (link) {
          // Se houver links profundos ou rotas redireciona
          window.location.hash = link;
        }
      };
    } catch (err) {
      console.error('Erro ao disparar notificação do navegador:', err);
    }
  }
};


