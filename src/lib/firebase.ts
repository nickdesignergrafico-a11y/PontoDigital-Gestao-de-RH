import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getMessaging, isSupported } from 'firebase/messaging';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

const databaseId = 'pontodigital';

let firestoreDb;
try {
  firestoreDb = initializeFirestore(app, {
    experimentalForceLongPolling: true,
  }, databaseId);
} catch (e) {
  firestoreDb = getFirestore(app, databaseId);
}

export const db = firestoreDb;
export const storage = getStorage(app);

// Exporta inicializador de FCM Messaging no navegador
export const getFirebaseMessaging = async () => {
  try {
    const supported = await isSupported();
    if (supported) {
      return getMessaging(app);
    }
  } catch (err) {
    console.warn("FCM Messaging não é suportado neste navegador/ambiente:", err);
  }
  return null;
};


