// Helper for OneSignal Web Push Integration

declare global {
  interface Window {
    OneSignalDeferred?: any[];
    OneSignal?: any;
  }
}

export function identifyOneSignalUser(user: {
  uid: string;
  name?: string;
  role?: string;
  postoName?: string;
  department?: string;
}) {
  if (typeof window === 'undefined') return;

  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async function (OneSignal: any) {
    try {
      if (OneSignal?.login) {
        await OneSignal.login(user.uid);
      }

      if (OneSignal?.User?.addTags) {
        await OneSignal.User.addTags({
          user_id: user.uid,
          name: user.name || '',
          role: user.role || 'employee',
          posto: user.postoName || '',
          department: user.department || '',
        });
      }
    } catch (err) {
      console.warn('OneSignal identify error:', err);
    }
  });
}

export function logoutOneSignalUser() {
  if (typeof window === 'undefined') return;

  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async function (OneSignal: any) {
    try {
      if (OneSignal?.logout) {
        await OneSignal.logout();
      }
    } catch (err) {
      console.warn('OneSignal logout error:', err);
    }
  });
}

export function promptOneSignalPush() {
  if (typeof window === 'undefined') return;

  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async function (OneSignal: any) {
    try {
      if (OneSignal?.Notifications?.requestPermission) {
        await OneSignal.Notifications.requestPermission();
      } else if (OneSignal?.Slidedown?.promptPush) {
        await OneSignal.Slidedown.promptPush();
      }
    } catch (err) {
      console.warn('OneSignal promptPush error:', err);
    }
  });
}

export async function sendPushNotification({
  targetUserIds,
  segment,
  title,
  message,
  url,
}: {
  targetUserIds?: string[];
  segment?: string;
  title: string;
  message: string;
  url?: string;
}) {
  try {
    const res = await fetch('/.netlify/functions/send-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUserIds,
        segment,
        title,
        message,
        url,
      }),
    });
    return await res.json();
  } catch (err) {
    console.warn('Error calling send-push function:', err);
    return null;
  }
}

