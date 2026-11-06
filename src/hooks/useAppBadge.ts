import { useEffect } from 'react';
import { updateAllAppBadges } from '../lib/badgeManager';

/**
 * Hook para manter o contador de mensagens no ícone do aplicativo (PWA + Favicon + Título)
 * sempre sincronizado com o total de notificações não lidas.
 */
export function useAppBadge(unreadCount: number) {
  useEffect(() => {
    updateAllAppBadges(unreadCount);
  }, [unreadCount]);
}
