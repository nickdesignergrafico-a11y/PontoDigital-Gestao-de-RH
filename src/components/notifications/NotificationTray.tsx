import { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  updateDoc, 
  deleteDoc, 
  writeBatch 
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../hooks/useAuth';
import { Notification as DbNotification } from '../../types';
import { 
  Bell, 
  BellOff, 
  CheckCircle2, 
  Info, 
  AlertTriangle, 
  AlertCircle, 
  Trash2, 
  Check, 
  X,
  ExternalLink,
  Smartphone
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn, parseFirestoreTimestamp } from '../../lib/utils';
import { 
  sendBrowserNotification, 
  requestAndSaveFCMToken, 
  deleteReadNotifications 
} from '../../lib/notifications';
import { useAppBadge } from '../../hooks/useAppBadge';

export default function NotificationTray({ onNavigate }: { onNavigate?: (view: any) => void }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<DbNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'denied'
  );
  const unreadCount = notifications.filter(n => !n.read).length;

  // Sincroniza o contador do ícone do aplicativo (PWA + Favicon + Título)
  useAppBadge(unreadCount);

  useEffect(() => {
    if (!user?.uid) return;

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid)
    );

    let isFirstLoad = true;

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DbNotification));
      fetched.sort((a, b) => {
        const timeA = a.createdAt ? parseFirestoreTimestamp(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? parseFirestoreTimestamp(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });
      setNotifications(fetched);

      if (!isFirstLoad) {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const data = change.doc.data() as DbNotification;
            if (!data.read) {
              sendBrowserNotification(data.title, data.message, data.link);
            }
          }
        });
      }
      isFirstLoad = false;
    });

    return () => unsubscribe();
  }, [user?.uid]);

  // Solicitar permissão e salvar token FCM no Firebase
  const handleRequestPermission = async () => {
    if (!user?.uid) return;
    try {
      await requestAndSaveFCMToken(user.uid);
      if (typeof window !== 'undefined' && 'Notification' in window) {
        setPermissionStatus(Notification.permission);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const markAsRead = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
    } catch (err) {
      console.error(err);
    }
  };

  const markAllAsRead = async () => {
    const unread = notifications.filter(n => !n.read);
    if (!unread.length) return;
    const batch = writeBatch(db);
    unread.forEach(n => {
      batch.update(doc(db, 'notifications', n.id), { read: true });
    });
    await batch.commit();
  };

  const deleteNotification = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await deleteDoc(doc(db, 'notifications', id));
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteRead = async () => {
    if (!user?.uid) return;
    try {
      await deleteReadNotifications(user.uid);
    } catch (err) {
      console.error(err);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'success': return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />;
      case 'warning': return <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />;
      case 'error': return <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />;
      default: return <Info className="w-4 h-4 text-blue-500 shrink-0" />;
    }
  };

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-2xl transition-all cursor-pointer"
        title="Ver notificações"
      >
        <Bell className="w-5 h-5 md:w-6 md:h-6" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 bg-rose-500 text-white text-[10px] font-black flex items-center justify-center rounded-full border-2 border-white shadow-sm shadow-rose-500/40 animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => setIsOpen(false)} 
            />
            <motion.div 
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute right-0 mt-2 w-84 sm:w-96 bg-white rounded-3xl shadow-2xl border border-slate-200/80 z-50 overflow-hidden flex flex-col max-h-[85vh]"
            >
              {/* Header do Tray */}
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 shrink-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-900 text-sm">Notificações</h3>
                  {unreadCount > 0 && (
                    <span className="text-[11px] font-black bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                      {unreadCount} nova{unreadCount > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {unreadCount > 0 && (
                    <button 
                      onClick={markAllAsRead}
                      className="text-[11px] font-bold text-blue-600 hover:text-blue-800 px-2 py-1 rounded-lg hover:bg-blue-50 cursor-pointer"
                    >
                      Ler todas
                    </button>
                  )}
                  {notifications.some(n => n.read) && (
                    <button 
                      onClick={handleDeleteRead}
                      className="text-[11px] font-bold text-slate-500 hover:text-rose-600 px-2 py-1 rounded-lg hover:bg-rose-50 cursor-pointer"
                      title="Excluir notificações lidas"
                    >
                      Limpar lidas
                    </button>
                  )}
                  <button 
                    onClick={() => setIsOpen(false)} 
                    className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Banner de ativação de Push do Firebase se permissão não foi concedida */}
              {permissionStatus === 'default' && (
                <div className="bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 border-b border-blue-100 p-3.5 shrink-0">
                  <div className="flex gap-3 items-center">
                    <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white shrink-0 shadow-md shadow-blue-500/20">
                      <Smartphone className="w-4 h-4 animate-pulse" />
                    </div>
                    <div className="text-left flex-1">
                      <h4 className="text-xs font-bold text-slate-900">Ativar Push no Aparelho</h4>
                      <p className="text-[10px] text-slate-500 font-medium">
                        Receba alertas de holerites e espelho de ponto em tempo real.
                      </p>
                    </div>
                    <button 
                      onClick={handleRequestPermission}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-2.5 py-1.5 rounded-xl text-[10px] transition-all shadow-sm active:scale-95 cursor-pointer whitespace-nowrap"
                    >
                      Ativar
                    </button>
                  </div>
                </div>
              )}

              {/* Lista de Notificações */}
              <div className="overflow-y-auto divide-y divide-slate-100 flex-1">
                {notifications.length > 0 ? (
                  notifications.map((n) => (
                    <div 
                      key={n.id} 
                      className={cn(
                        "p-4 flex gap-3 transition-colors cursor-pointer",
                        !n.read ? "bg-blue-50/40 hover:bg-blue-50/60" : "hover:bg-slate-50/80"
                      )}
                      onClick={async () => {
                        if (!n.read) {
                          await markAsRead(n.id);
                        }
                        if (onNavigate && n.link) {
                          const sanitizedLink = n.link.startsWith('#') ? n.link.substring(1) : n.link;
                          onNavigate(sanitizedLink);
                          setIsOpen(false);
                        }
                      }}
                    >
                      <div className="mt-1 shrink-0">{getIcon(n.type)}</div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className={cn("text-xs font-bold truncate", !n.read ? "text-slate-900" : "text-slate-600")}>
                            {n.title}
                          </p>
                          <span className="text-[10px] text-slate-400 font-semibold whitespace-nowrap">
                            {n.createdAt ? format(parseFirestoreTimestamp(n.createdAt), 'HH:mm', { locale: ptBR }) : ''}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{n.message}</p>
                        
                        {/* Ações da Mensagem: Marcar como Lida e Excluir sempre visíveis */}
                        <div className="flex items-center justify-between pt-1.5 gap-2">
                          {!n.read ? (
                            <button 
                              onClick={(e) => markAsRead(n.id, e)}
                              className="text-[10px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
                            >
                              <Check className="w-3 h-3" /> Marcar lida
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-400">Lida</span>
                          )}

                          {/* Botão de Excluir - Totalmente visível no celular e desktop */}
                          <button 
                            onClick={(e) => deleteNotification(n.id, e)}
                            className="text-[10px] font-bold text-slate-400 hover:text-rose-600 flex items-center gap-1 p-1 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Excluir notificação"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Excluir</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-10 text-center">
                    <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-3 text-slate-300">
                      <BellOff className="w-6 h-6" />
                    </div>
                    <p className="text-slate-500 text-xs font-semibold">Nenhuma mensagem no momento.</p>
                  </div>
                )}
              </div>

              {/* Rodapé com link para visualização completa de mensagens */}
              {onNavigate && (
                <div className="p-3 border-t border-slate-100 bg-slate-50/50 text-center shrink-0">
                  <button
                    onClick={() => {
                      onNavigate('notifications');
                      setIsOpen(false);
                    }}
                    className="w-full py-2 px-3 text-xs font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50/60 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>Abrir Central de Mensagens Completa</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
