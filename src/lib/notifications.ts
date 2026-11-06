import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  doc, 
  updateDoc, 
  arrayUnion, 
  deleteDoc, 
  query, 
  where, 
  getDocs, 
  writeBatch 
} from 'firebase/firestore';
import { getToken, onMessage } from 'firebase/messaging';
import { db, getFirebaseMessaging } from './firebase';
import { updateAllAppBadges } from './badgeManager';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

/**
 * Cria uma notificação no Firestore e dispara o envio de Push Notification via Firebase FCM
 */
export const createNotification = async (
  userId: string,
  title: string,
  message: string,
  type: NotificationType = 'info',
  link?: string
) => {
  try {
    // 1. Grava no Firestore para histórico do colaborador
    await addDoc(collection(db, 'notifications'), {
      userId,
      title,
      message,
      type,
      read: false,
      link: link || '',
      createdAt: serverTimestamp(),
    });

    // 2. Dispara Push Notification em background via Firebase FCM através do backend
    fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUserIds: [userId],
        title,
        message,
        type,
        link: link || '/#notifications'
      })
    }).catch(err => {
      console.warn('Disparo de Push FCM em segundo plano:', err);
    });

  } catch (error) {
    console.error('Error creating notification:', error);
  }
};

/**
 * Obtém o token do Firebase Cloud Messaging (FCM) e salva no perfil do usuário no Firestore
 */
export const requestAndSaveFCMToken = async (userId: string, vapidKey?: string): Promise<string | null> => {
  try {
    const messaging = await getFirebaseMessaging();
    if (!messaging) {
      console.warn('Firebase Messaging não suportado neste navegador.');
      return null;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('Permissão para notificações não foi concedida pelo usuário.');
      return null;
    }

    // Registra o Service Worker dedicado para FCM se suportado
    let swRegistration: ServiceWorkerRegistration | undefined;
    if ('serviceWorker' in navigator) {
      try {
        swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
        await navigator.serviceWorker.ready;
      } catch (swErr) {
        console.warn('Aviso no registro do worker FCM, tentando registro padrão:', swErr);
        swRegistration = await navigator.serviceWorker.ready.catch(() => undefined);
      }
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
        pushEnabled: true,
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

/**
 * Ouve mensagens FCM em primeiro plano (quando a tela do app está aberta)
 */
export const listenToForegroundFCM = async (onMessageCallback: (payload: any) => void) => {
  try {
    const messaging = await getFirebaseMessaging();
    if (!messaging) return () => {};

    const unsubscribe = onMessage(messaging, (payload) => {
      console.log('[FCM] Mensagem recebida em primeiro plano:', payload);
      onMessageCallback(payload);
    });

    return unsubscribe;
  } catch (err) {
    console.warn('Erro ao escutar mensagens FCM em primeiro plano:', err);
    return () => {};
  }
};

/**
 * Solicita permissão para notificações do navegador (Push local e Firebase)
 */
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

/**
 * Dispara uma notificação nativa do sistema/navegador (Push local)
 */
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
        icon: '/pwa-icon.png',
        badge: '/pwa-icon.png',
        tag: 'ponto-digital-alert',
        renotify: true,
        vibrate: [150, 80, 150]
      };
      
      const notification = new Notification(title, options);
      
      notification.onclick = () => {
        window.focus();
        if (link) {
          const sanitized = link.startsWith('#') ? link.substring(1) : link;
          window.location.hash = sanitized;
        }
      };
    } catch (err) {
      console.error('Erro ao disparar notificação do navegador:', err);
    }
  }
};

/**
 * Exclui uma notificação específica do Firestore
 */
export const deleteNotification = async (id: string): Promise<boolean> => {
  try {
    await deleteDoc(doc(db, 'notifications', id));
    return true;
  } catch (err) {
    console.error('Erro ao excluir notificação:', err);
    return false;
  }
};

/**
 * Exclui múltiplas notificações por lista de IDs
 */
export const deleteMultipleNotifications = async (ids: string[]): Promise<boolean> => {
  if (!ids.length) return true;
  try {
    const batch = writeBatch(db);
    ids.forEach((id) => {
      batch.delete(doc(db, 'notifications', id));
    });
    await batch.commit();
    return true;
  } catch (err) {
    console.error('Erro ao excluir lista de notificações:', err);
    return false;
  }
};

/**
 * Exclui todas as notificações lidas de um usuário
 */
export const deleteReadNotifications = async (userId: string): Promise<boolean> => {
  try {
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      where('read', '==', true)
    );
    const snap = await getDocs(q);
    if (snap.empty) return true;

    const batch = writeBatch(db);
    snap.docs.forEach((d) => {
      batch.delete(d.ref);
    });
    await batch.commit();
    return true;
  } catch (err) {
    console.error('Erro ao excluir notificações lidas:', err);
    return false;
  }
};

/**
 * Exclui todas as notificações de um usuário
 */
export const deleteAllNotifications = async (userId: string): Promise<boolean> => {
  try {
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId)
    );
    const snap = await getDocs(q);
    if (snap.empty) return true;

    const batch = writeBatch(db);
    snap.docs.forEach((d) => {
      batch.delete(d.ref);
    });
    await batch.commit();
    return true;
  } catch (err) {
    console.error('Erro ao excluir todas as notificações:', err);
    return false;
  }
};

/**
 * Dispara envio de notificação push de teste para o dispositivo
 */
export const sendTestPush = async (uid: string, token?: string): Promise<{ success: boolean; message: string }> => {
  try {
    const res = await fetch('/api/push/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, token })
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, message: err.message || 'Falha na conexão com o servidor' };
  }
};
