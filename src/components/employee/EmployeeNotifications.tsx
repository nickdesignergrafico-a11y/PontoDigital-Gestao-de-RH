import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { db } from '../../lib/firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  updateDoc, 
  writeBatch 
} from 'firebase/firestore';
import { Notification as DbNotification } from '../../types';
import { 
  Bell, 
  BellRing, 
  CheckCheck, 
  Trash2, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle, 
  Info, 
  ExternalLink, 
  Smartphone, 
  Send, 
  ShieldCheck, 
  X,
  Filter,
  Check,
  RotateCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn, parseFirestoreTimestamp } from '../../lib/utils';
import { 
  deleteNotification, 
  deleteMultipleNotifications, 
  deleteReadNotifications, 
  deleteAllNotifications, 
  requestAndSaveFCMToken, 
  sendTestPush,
  requestNotificationPermission
} from '../../lib/notifications';
import { useAppBadge } from '../../hooks/useAppBadge';

interface EmployeeNotificationsProps {
  onNavigate?: (view: any) => void;
}

export default function EmployeeNotifications({ onNavigate }: EmployeeNotificationsProps) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<DbNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'read'>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [pushStatus, setPushStatus] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'denied'
  );
  const [pushLoading, setPushLoading] = useState(false);
  const [testPushLoading, setTestPushLoading] = useState(false);

  const unreadCount = notifications.filter(n => !n.read).length;

  // Sincroniza o contador do ícone do aplicativo com o número real de mensagens não lidas
  useAppBadge(unreadCount);

  // Escuta notificações em tempo real no Firestore
  useEffect(() => {
    if (!user?.uid) return;
    setLoading(true);

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as DbNotification));
      items.sort((a, b) => {
        const timeA = a.createdAt ? parseFirestoreTimestamp(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? parseFirestoreTimestamp(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });
      setNotifications(items);
      setLoading(false);
    }, (err) => {
      console.error("Erro ao carregar notificações do colaborador:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  const showFeedback = (text: string, type: 'success' | 'error' = 'success') => {
    setActionMessage({ text, type });
    setTimeout(() => setActionMessage(null), 3500);
  };

  // Ativar notificações push no aparelho
  const handleEnablePush = async () => {
    if (!user?.uid) return;
    setPushLoading(true);
    try {
      const token = await requestAndSaveFCMToken(user.uid);
      const perm = typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'denied';
      setPushStatus(perm);

      if (token) {
        showFeedback("Notificações Push ativadas com sucesso neste aparelho!");
      } else if (perm === 'granted') {
        showFeedback("Permissão concedida pelo navegador!");
      } else if (perm === 'denied') {
        showFeedback("As notificações estão bloqueadas nas opções do navegador.", "error");
      }
    } catch (err: any) {
      showFeedback(err?.message || "Erro ao ativar notificações push", "error");
    } finally {
      setPushLoading(false);
    }
  };

  // Testar envio de push direto para o dispositivo
  const handleTestPush = async () => {
    if (!user?.uid) return;
    setTestPushLoading(true);
    try {
      const result = await sendTestPush(user.uid);
      if (result.success) {
        showFeedback(result.message || "Notificação de teste enviada!");
      } else {
        showFeedback(result.message || "Falha ao enviar notificação de teste.", "error");
      }
    } catch (err: any) {
      showFeedback(err.message || "Erro ao enviar teste", "error");
    } finally {
      setTestPushLoading(false);
    }
  };

  // Marcar como lida / não lida
  const handleToggleRead = async (id: string, currentRead: boolean) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: !currentRead });
    } catch (err) {
      console.error(err);
    }
  };

  // Marcar todas como lidas
  const handleMarkAllAsRead = async () => {
    const unread = notifications.filter(n => !n.read);
    if (!unread.length) return;
    try {
      const batch = writeBatch(db);
      unread.forEach(n => {
        batch.update(doc(db, 'notifications', n.id), { read: true });
      });
      await batch.commit();
      showFeedback("Todas as mensagens foram marcadas como lidas.");
    } catch (err) {
      console.error(err);
      showFeedback("Erro ao atualizar mensagens", "error");
    }
  };

  // Excluir uma única mensagem
  const handleDeleteSingle = async (id: string) => {
    try {
      await deleteNotification(id);
      setSelectedIds(prev => prev.filter(item => item !== id));
      showFeedback("Mensagem excluída.");
    } catch (err) {
      showFeedback("Erro ao excluir mensagem.", "error");
    }
  };

  // Excluir selecionadas
  const handleDeleteSelected = async () => {
    if (!selectedIds.length) return;
    if (!confirm(`Deseja realmente excluir as ${selectedIds.length} mensagens selecionadas?`)) return;

    setIsDeleting(true);
    try {
      await deleteMultipleNotifications(selectedIds);
      setSelectedIds([]);
      showFeedback("Mensagens selecionadas foram excluídas com sucesso.");
    } catch (err) {
      showFeedback("Erro ao excluir mensagens selecionadas.", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  // Excluir lidas
  const handleDeleteRead = async () => {
    const readItems = notifications.filter(n => n.read);
    if (!readItems.length) {
      showFeedback("Não há mensagens lidas para excluir.");
      return;
    }
    if (!confirm(`Deseja excluir todas as ${readItems.length} mensagens lidas?`)) return;

    setIsDeleting(true);
    try {
      if (user?.uid) {
        await deleteReadNotifications(user.uid);
        showFeedback("Mensagens lidas foram excluídas com sucesso.");
      }
    } catch (err) {
      showFeedback("Erro ao excluir mensagens lidas.", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  // Excluir todas
  const handleDeleteAll = async () => {
    if (!notifications.length) return;
    if (!confirm(`Tem certeza que deseja apagar TODAS as ${notifications.length} mensagens da sua caixa de entrada? Esta ação não pode ser desfeita.`)) return;

    setIsDeleting(true);
    try {
      if (user?.uid) {
        await deleteAllNotifications(user.uid);
        setSelectedIds([]);
        showFeedback("Todas as mensagens foram excluídas.");
      }
    } catch (err) {
      showFeedback("Erro ao excluir mensagens.", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredNotifications = notifications.filter(n => {
    if (activeTab === 'unread') return !n.read;
    if (activeTab === 'read') return n.read;
    return true;
  });

  const getIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />;
      default:
        return <Info className="w-5 h-5 text-blue-500 shrink-0" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'success': return { label: 'Concluído', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      case 'warning': return { label: 'Aviso RH', color: 'bg-amber-50 text-amber-700 border-amber-200' };
      case 'error': return { label: 'Atenção', color: 'bg-rose-50 text-rose-700 border-rose-200' };
      default: return { label: 'Informativo', color: 'bg-blue-50 text-blue-700 border-blue-200' };
    }
  };

  const handleActionLink = (link?: string) => {
    if (!link) return;
    const sanitized = link.startsWith('#') ? link.substring(1) : link;
    if (onNavigate) {
      onNavigate(sanitized);
    } else {
      window.location.hash = sanitized;
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-16">
      {/* Feedback Toast */}
      <AnimatePresence>
        {actionMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={cn(
              "fixed top-4 right-4 z-50 px-4 py-3 rounded-2xl shadow-xl border text-sm font-semibold flex items-center gap-2",
              actionMessage.type === 'success' 
                ? "bg-emerald-600 text-white border-emerald-500" 
                : "bg-rose-600 text-white border-rose-500"
            )}
          >
            {actionMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span>{actionMessage.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Banner */}
      <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20 shrink-0">
            <BellRing className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Mensagens & Notificações</h1>
              {unreadCount > 0 && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-500 text-white animate-pulse shadow-sm shadow-rose-500/30">
                  {unreadCount} nova{unreadCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <p className="text-slate-500 text-sm mt-1">
              Comunicados da empresa, avisos de holerites, espelho de ponto e atualizações em tempo real.
            </p>
          </div>
        </div>

        {/* Status das Notificações Push do Dispositivo */}
        <div className="w-full md:w-auto bg-slate-50 border border-slate-200/60 rounded-2xl p-4 flex flex-col gap-2 shrink-0">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
              <Smartphone className="w-4 h-4 text-blue-600" /> Push no Aparelho:
            </span>
            <span className={cn(
              "px-2 py-0.5 rounded-md font-black text-[11px]",
              pushStatus === 'granted' 
                ? "bg-emerald-100 text-emerald-800" 
                : pushStatus === 'denied' 
                ? "bg-rose-100 text-rose-800" 
                : "bg-amber-100 text-amber-800"
            )}>
              {pushStatus === 'granted' ? 'ATIVADO' : pushStatus === 'denied' ? 'BLOQUEADO' : 'PENDENTE'}
            </span>
          </div>

          <div className="flex items-center gap-2 pt-1">
            {pushStatus !== 'granted' ? (
              <button
                onClick={handleEnablePush}
                disabled={pushLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold px-3 py-2 rounded-xl transition-all shadow-md shadow-blue-500/20 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Bell className="w-3.5 h-3.5" />
                <span>{pushLoading ? 'Ativando...' : 'Ativar Notificações Push'}</span>
              </button>
            ) : (
              <button
                onClick={handleTestPush}
                disabled={testPushLoading}
                className="w-full bg-slate-200 hover:bg-slate-300 active:scale-95 text-slate-800 text-xs font-bold px-3 py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                title="Dispara um push de teste para confirmar que o seu celular está recebendo"
              >
                <Send className="w-3.5 h-3.5 text-blue-600" />
                <span>{testPushLoading ? 'Enviando...' : 'Testar Notificação'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs & Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-white p-3 md:p-4 rounded-2xl border border-slate-200/80 shadow-sm">
        {/* Navigation Tabs */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('all')}
            className={cn(
              "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
              activeTab === 'all' 
                ? "bg-white text-slate-900 shadow-sm" 
                : "text-slate-500 hover:text-slate-800"
            )}
          >
            Todas ({notifications.length})
          </button>
          <button
            onClick={() => setActiveTab('unread')}
            className={cn(
              "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5",
              activeTab === 'unread' 
                ? "bg-white text-blue-600 shadow-sm" 
                : "text-slate-500 hover:text-slate-800"
            )}
          >
            Não Lidas ({unreadCount})
          </button>
          <button
            onClick={() => setActiveTab('read')}
            className={cn(
              "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
              activeTab === 'read' 
                ? "bg-white text-slate-900 shadow-sm" 
                : "text-slate-500 hover:text-slate-800"
            )}
          >
            Lidas ({notifications.length - unreadCount})
          </button>
        </div>

        {/* Global Actions */}
        <div className="flex items-center flex-wrap gap-2">
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllAsRead}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <CheckCheck className="w-3.5 h-3.5 text-blue-600" />
              <span>Marcar todas lidas</span>
            </button>
          )}

          {selectedIds.length > 0 && (
            <button
              onClick={handleDeleteSelected}
              disabled={isDeleting}
              className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm shadow-rose-600/20"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Excluir Selecionadas ({selectedIds.length})</span>
            </button>
          )}

          {notifications.some(n => n.read) && (
            <button
              onClick={handleDeleteRead}
              disabled={isDeleting}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700 text-slate-600 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-slate-400" />
              <span>Excluir Lidas</span>
            </button>
          )}

          {notifications.length > 0 && (
            <button
              onClick={handleDeleteAll}
              disabled={isDeleting}
              className="px-3 py-1.5 rounded-xl border border-rose-200/80 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
              title="Apagar todas as mensagens da caixa"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Excluir Todas</span>
            </button>
          )}
        </div>
      </div>

      {/* Messages List */}
      {loading ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-slate-200/80">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-500 text-sm font-medium">Carregando suas mensagens...</p>
        </div>
      ) : filteredNotifications.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-slate-200/80">
          <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-300">
            <Bell className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-800">Nenhuma mensagem encontrada</h3>
          <p className="text-slate-400 text-sm max-w-sm mx-auto mt-1">
            {activeTab === 'unread' 
              ? 'Parabéns! Você leu todas as suas mensagens e comunicados.'
              : 'Sua caixa de mensagens está limpa e organizada.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredNotifications.map((n) => {
            const isSelected = selectedIds.includes(n.id);
            const badgeType = getTypeLabel(n.type);

            return (
              <motion.div
                key={n.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={cn(
                  "bg-white rounded-2xl p-4 md:p-5 border transition-all flex flex-col sm:flex-row items-start gap-4 group relative",
                  !n.read 
                    ? "border-blue-200 bg-gradient-to-r from-blue-50/40 via-white to-white shadow-sm ring-1 ring-blue-500/10" 
                    : "border-slate-200/80 hover:border-slate-300 hover:shadow-sm"
                )}
              >
                {/* Checkbox de seleção */}
                <div className="flex items-center gap-3 shrink-0 pt-0.5">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(prev => [...prev, n.id]);
                      } else {
                        setSelectedIds(prev => prev.filter(id => id !== n.id));
                      }
                    }}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                  />
                  <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                    {getIcon(n.type)}
                  </div>
                </div>

                {/* Conteúdo da mensagem */}
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn(
                        "text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border",
                        badgeType.color
                      )}>
                        {badgeType.label}
                      </span>
                      <h4 className={cn(
                        "text-sm font-bold text-slate-900 leading-snug",
                        !n.read && "font-black"
                      )}>
                        {n.title}
                      </h4>
                    </div>

                    <span className="text-[11px] text-slate-400 font-semibold whitespace-nowrap">
                      {n.createdAt ? format(parseFirestoreTimestamp(n.createdAt), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR }) : ''}
                    </span>
                  </div>

                  <p className="text-slate-600 text-xs md:text-sm leading-relaxed whitespace-pre-line">
                    {n.message}
                  </p>

                  {/* Ações inferiores da mensagem */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 mt-2">
                    <div className="flex items-center gap-2">
                      {n.link && (
                        <button
                          onClick={() => handleActionLink(n.link)}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition-all cursor-pointer"
                        >
                          <span>Abrir no Sistema</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        onClick={() => handleToggleRead(n.id, n.read)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl hover:bg-slate-100 text-slate-500 text-xs font-semibold transition-all cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5 text-blue-600" />
                        <span>{n.read ? 'Marcar não lida' : 'Marcar lida'}</span>
                      </button>
                    </div>

                    {/* Botão de Excluir Mensagem - Sempre visível e com toque fácil */}
                    <button
                      onClick={() => handleDeleteSingle(n.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200/60 hover:border-rose-200 text-xs font-bold transition-all cursor-pointer active:scale-95"
                      title="Excluir esta mensagem"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Excluir</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
