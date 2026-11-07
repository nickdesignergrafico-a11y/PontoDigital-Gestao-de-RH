import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, doc, setDoc, onSnapshot } from 'firebase/firestore';
import { User } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { createNotification } from '../../lib/notifications';
import { 
  Search, 
  Check, 
  X, 
  ChevronLeft, 
  ChevronRight, 
  PenTool, 
  FileSpreadsheet, 
  AlertCircle, 
  Clock, 
  FileCheck,
  RotateCcw,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface TimecardReceiptsProps {
  onViewTimecard: (user: User, monthDate: Date) => void;
}

export default function TimecardReceipts({ onViewTimecard }: TimecardReceiptsProps) {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [signatures, setSignatures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending_employee' | 'pending_admin' | 'returned' | 'signed'>('all');

  // Return modal state directly inside TimecardReceipts
  const [returnTargetUser, setReturnTargetUser] = useState<User | null>(null);
  const [returnReason, setReturnReason] = useState('');
  const [returningState, setReturningState] = useState(false);

  const quickReturnReasons = [
    'Folha assinada no início do mês antes de ser preenchida totalmente. Preencha todos os dias trabalhados antes de assinar e enviar.',
    'Existem dias em aberto sem marcação de entrada ou saída. Complete os horários corretamente e assine novamente.',
    'Horários incompletos ou divergentes da escala. Por favor, revise e preencha a folha completa.'
  ];

  useEffect(() => {
    setLoading(true);

    // 1. Fetch all employees in real time
    const usersQuery = query(collection(db, 'users'), where('role', '==', 'employee'));
    const unsubUsers = onSnapshot(usersQuery, (snapshot) => {
      const employees = snapshot.docs
        .map(d => ({ uid: d.id, ...d.data() } as User))
        .filter(u => u.active !== false);
      setUsers(employees);
    }, (error) => {
      console.error('Error fetching users in real-time:', error);
    });

    // 2. Fetch all signatures for this specific month / year in real time
    const m = currentMonth.getMonth() + 1;
    const y = currentMonth.getFullYear();
    
    const sigQuery = query(
      collection(db, 'timecardSignatures'),
      where('month', '==', m),
      where('year', '==', y)
    );

    const unsubSigs = onSnapshot(sigQuery, (sigSnapshot) => {
      const sigList = sigSnapshot.docs.map(d => ({ docId: d.id, ...d.data() }));
      setSignatures(sigList);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching timecardSignatures in real-time:', error);
      setLoading(false);
    });

    return () => {
      unsubUsers();
      unsubSigs();
    };
  }, [currentMonth]);

  const isEarlyMonthSubmission = (sig: any) => {
    if (!sig || !sig.signedAt) return false;
    try {
      const signedDate = new Date(sig.signedAt);
      const m = currentMonth.getMonth();
      const y = currentMonth.getFullYear();
      // If signed during the same month before day 25, flag as early submission
      if (signedDate.getFullYear() === y && signedDate.getMonth() === m && signedDate.getDate() < 25) {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const getEmployeeStatus = (uid: string) => {
    const user = users.find(u => u.uid === uid);
    const userSigs = signatures.filter(s => s.userId === uid);
    
    const signedUserSigs = userSigs.filter(s => s.signedAt && s.status !== 'returned');
    const returnedUserSigs = userSigs.filter(s => s.status === 'returned' && !s.signedAt);

    // Latest returned signature timestamp
    const latestReturned = returnedUserSigs.sort((a, b) => {
      const tA = a.returnedAt ? new Date(a.returnedAt).getTime() : 0;
      const tB = b.returnedAt ? new Date(b.returnedAt).getTime() : 0;
      return tB - tA;
    })[0];

    // Latest signed signature timestamp
    const latestSigned = signedUserSigs.sort((a, b) => {
      const tA = a.signedAt ? new Date(a.signedAt).getTime() : 0;
      const tB = b.signedAt ? new Date(b.signedAt).getTime() : 0;
      return tB - tA;
    })[0];

    // Only consider 'returned' if there is an active return AND the employee hasn't re-signed since the return
    const isCurrentlyReturned = Boolean(
      latestReturned && (
        !latestSigned || 
        (latestReturned.returnedAt && new Date(latestSigned.signedAt).getTime() < new Date(latestReturned.returnedAt).getTime())
      )
    );

    if (isCurrentlyReturned && latestReturned) {
      return {
        code: 'returned' as const,
        label: 'Devolvida p/ Correção',
        badgeClass: 'bg-rose-50 text-rose-700 border border-rose-200',
        icon: RotateCcw,
        signature: latestReturned,
        postsCount: 1,
        signedCount: 0,
        isEarly: false
      };
    }

    // Determine all posts this employee is associated with this month
    const userPostsSet = new Set<string>();
    if (user) {
      userPostsSet.add(user.postoName || 'Portaria Principal');
    } else {
      userPostsSet.add('Portaria Principal');
    }
    signedUserSigs.forEach(s => {
      userPostsSet.add(s.postoName || 'Portaria Principal');
    });
    
    const allUserPosts = Array.from(userPostsSet);
    
    // Check if there are any unsigned posts by the employee
    const unsignedPosts = allUserPosts.filter(post => {
      return !signedUserSigs.some(s => {
        const sName = s.postoName || 'Portaria Principal';
        return sName.toLowerCase().trim() === post.toLowerCase().trim();
      });
    });
    
    if (unsignedPosts.length > 0 && signedUserSigs.length === 0) {
      return {
        code: 'pending_employee' as const,
        label: 'Aguardando Funcionário',
        badgeClass: 'bg-amber-50 text-amber-600 border border-amber-200/60',
        icon: Clock,
        signature: null,
        postsCount: allUserPosts.length,
        signedCount: allUserPosts.length - unsignedPosts.length,
        isEarly: false
      };
    }
    
    // Signed by the employee. Check admin signatures (homologation)
    const unhomologatedSigs = signedUserSigs.filter(s => !s.adminSigned);
    const primarySig = signedUserSigs[0];
    const earlyFlag = isEarlyMonthSubmission(primarySig);

    if (unhomologatedSigs.length > 0) {
      return {
        code: 'pending_admin' as const,
        label: 'Novo Recebimento (RH Pendente)',
        badgeClass: 'bg-blue-50 text-blue-600 border border-blue-200/60 animate-pulse',
        icon: PenTool,
        signature: primarySig,
        postsCount: allUserPosts.length,
        signedCount: signedUserSigs.length,
        isEarly: earlyFlag
      };
    }
    
    // Both employee and admin have signed everything
    return {
      code: 'signed' as const,
      label: 'Folha Homologada',
      badgeClass: 'bg-emerald-50 text-emerald-600 border border-emerald-200/60',
      icon: FileCheck,
      signature: primarySig,
      postsCount: allUserPosts.length,
      signedCount: signedUserSigs.length,
      isEarly: earlyFlag
    };
  };

  const handleOpenReturnModal = (user: User) => {
    setReturnTargetUser(user);
    setReturnReason(quickReturnReasons[0]);
  };

  const handleConfirmReturn = async () => {
    if (!returnTargetUser) return;
    const cleanReason = returnReason.trim() || 'Folha devolvida pela Administração para preenchimento completo e correção dos horários.';
    setReturningState(true);

    try {
      const m = currentMonth.getMonth() + 1;
      const y = currentMonth.getFullYear();
      const userSigs = signatures.filter(s => s.userId === returnTargetUser.uid);

      const nowIso = new Date().toISOString();
      const adminName = currentUser?.name || 'Administrador';

      if (userSigs.length > 0) {
        for (const sig of userSigs) {
          const docId = sig.docId || sig.id;
          if (!docId) continue;
          await setDoc(doc(db, 'timecardSignatures', docId), {
            ...sig,
            status: 'returned',
            signedAt: null,
            signatureDataUrl: null,
            signatureText: null,
            adminSigned: false,
            adminSignedAt: null,
            adminSignatureDataUrl: null,
            adminSignatureText: null,
            returnedAt: nowIso,
            returnedBy: adminName,
            returnedByUid: currentUser?.uid || 'admin',
            returnReason: cleanReason
          }, { merge: true });
        }
      } else {
        const cleanPosto = (returnTargetUser.postoName || 'Maestro Frotas').trim();
        const cleanPostoKey = cleanPosto.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const sigId = `${returnTargetUser.uid}_${y}_${m}_${cleanPostoKey}`;
        await setDoc(doc(db, 'timecardSignatures', sigId), {
          id: sigId,
          userId: returnTargetUser.uid,
          userName: returnTargetUser.name || 'Colaborador',
          month: m,
          year: y,
          postoName: cleanPosto,
          status: 'returned',
          signedAt: null,
          adminSigned: false,
          returnedAt: nowIso,
          returnedBy: adminName,
          returnedByUid: currentUser?.uid || 'admin',
          returnReason: cleanReason
        }, { merge: true });
      }

      await createNotification(
        returnTargetUser.uid,
        'Folha de Ponto Devolvida para Preenchimento',
        `Sua folha de ${format(currentMonth, 'MMMM/yyyy', { locale: ptBR })} foi devolvida pela Administração para preenchimento/correção. Motivo: "${cleanReason}"`,
        'warning',
        'timecard'
      );

      setReturnTargetUser(null);
      setReturnReason('');
    } catch (err) {
      console.error('Erro ao devolver folha:', err);
    } finally {
      setReturningState(false);
    }
  };

  // Metrics
  const totalEmployees = users.length;
  const signedByEmployee = users.filter(u => {
    const status = getEmployeeStatus(u.uid);
    return status.code === 'pending_admin' || status.code === 'signed';
  }).length;
  const homologatedByRH = users.filter(u => getEmployeeStatus(u.uid).code === 'signed').length;
  const returnedCount = users.filter(u => getEmployeeStatus(u.uid).code === 'returned').length;
  const pendingEmployeeCount = totalEmployees - signedByEmployee;

  // Filter & Search
  const filteredUsers = users.filter(user => {
    const status = getEmployeeStatus(user.uid);
    const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (user.department || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    if (statusFilter === 'all') return matchesSearch;
    return matchesSearch && status.code === statusFilter;
  });

  return (
    <div className="space-y-6">
      {/* Header Container */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Recebimento de Folhas</h1>
          <p className="text-slate-500 font-medium">Controle mensal, devolução para preenchimento e homologação das folhas de ponto digitais.</p>
        </div>

        {/* Month Selector */}
        <div className="flex items-center bg-white border border-slate-200 rounded-2xl p-1 shadow-sm shrink-0">
          <button 
            type="button"
            onClick={() => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1))}
            className="p-2.5 hover:bg-slate-50 rounded-xl text-slate-400 transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-4 font-bold text-slate-700 min-w-[140px] text-center capitalize text-sm">
            {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
          </span>
          <button 
            type="button"
            onClick={() => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1))}
            className="p-2.5 hover:bg-slate-50 rounded-xl text-slate-400 transition-colors cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200/60 shadow-sm flex flex-col justify-between">
          <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Total de Colaboradores</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black text-slate-900">{totalEmployees}</span>
            <span className="text-xs font-semibold text-slate-400">vigias ativos</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/60 shadow-sm flex flex-col justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-amber-600">Pendente Funcionário</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black text-amber-600">{pendingEmployeeCount}</span>
            <span className="text-xs font-semibold text-slate-400">restantes</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-rose-200/60 shadow-sm flex flex-col justify-between bg-rose-50/20">
          <span className="text-xs text-rose-600 font-bold uppercase tracking-wider">Devolvidas p/ Correção</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black text-rose-600">{returnedCount}</span>
            <span className="text-xs font-semibold text-rose-400">em preenchimento</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/60 shadow-sm flex flex-col justify-between bg-gradient-to-tr from-blue-50/20 to-indigo-50/20">
          <span className="text-xs text-indigo-600 font-bold uppercase tracking-wider">Aguardando Visto RH</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black text-indigo-600">{signedByEmployee - homologatedByRH}</span>
            <span className="text-xs font-semibold text-indigo-400 font-bold">novas folhas</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/60 shadow-sm flex flex-col justify-between">
          <span className="text-xs text-emerald-600 font-bold uppercase tracking-wider">Homologadas pelo RH</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black text-emerald-600">{homologatedByRH}</span>
            <span className="text-xs font-semibold text-slate-400">concluídas</span>
          </div>
        </div>
      </div>

      {/* Search and Filter Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-3xl border border-slate-200/60 shadow-sm">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <input 
            type="text" 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar colaborador ou setor..."
            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 hover:border-slate-200 focus:border-blue-500 rounded-2xl font-semibold outline-none text-sm transition-all shadow-inner"
          />
        </div>

        {/* Filter Badges */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setStatusFilter('all')}
            className={cn(
              "px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer",
              statusFilter === 'all' 
                ? "bg-slate-900 text-white shadow-lg shadow-slate-900/10" 
                : "bg-slate-50 text-slate-500 hover:text-slate-800"
            )}
          >
            Todos ({totalEmployees})
          </button>
          
          <button
            onClick={() => setStatusFilter('pending_employee')}
            className={cn(
              "px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer",
              statusFilter === 'pending_employee' 
                ? "bg-amber-600 text-white shadow-lg shadow-amber-600/10" 
                : "bg-slate-50 text-slate-500 hover:text-slate-800"
            )}
          >
            Pendente Funcionário ({pendingEmployeeCount})
          </button>

          <button
            onClick={() => setStatusFilter('returned')}
            className={cn(
              "px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer",
              statusFilter === 'returned' 
                ? "bg-rose-600 text-white shadow-lg shadow-rose-600/10" 
                : "bg-rose-50 text-rose-600 hover:bg-rose-100"
            )}
          >
            Devolvidas ({returnedCount})
          </button>

          <button
            onClick={() => setStatusFilter('pending_admin')}
            className={cn(
              "px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer",
              statusFilter === 'pending_admin' 
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/10" 
                : "bg-slate-50 text-slate-500 hover:text-slate-800"
            )}
          >
            Pendente Visto RH ({signedByEmployee - homologatedByRH})
          </button>

          <button
            onClick={() => setStatusFilter('signed')}
            className={cn(
              "px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer",
              statusFilter === 'signed' 
                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/10" 
                : "bg-slate-50 text-slate-500 hover:text-slate-800"
            )}
          >
            Homologados ({homologatedByRH})
          </button>
        </div>
      </div>

      {/* Main List Table Container */}
      <div className="bg-white border border-slate-200/60 rounded-[2.5rem] shadow-sm overflow-hidden p-2">
        {loading ? (
          <div className="p-12 text-center text-slate-400 font-medium space-y-3">
            <div className="w-8 h-8 rounded-full border-4 border-slate-200 border-t-slate-800 animate-spin mx-auto" />
            <p className="text-xs uppercase tracking-widest font-bold">Buscando folhas de ponto...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-16 text-center text-slate-400 space-y-2">
            <FileSpreadsheet className="w-12 h-12 text-slate-200 mx-auto" />
            <p className="text-sm font-bold">Nenhum colaborador encontrado com os filtros informados.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase text-[10px] tracking-wider">
                  <th className="px-6 py-4">Colaborador</th>
                  <th className="px-6 py-4">Setor / Posto</th>
                  <th className="px-6 py-4">Status da Assinatura</th>
                  <th className="px-6 py-4">Assinatura Func.</th>
                  <th className="px-6 py-4">Visto RH</th>
                  <th className="px-6 py-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredUsers.map((user) => {
                  const status = getEmployeeStatus(user.uid);
                  const Icon = status.icon;

                  return (
                    <tr key={user.uid} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center font-bold text-slate-700 overflow-hidden border border-slate-200/40">
                            {user.photoURL ? (
                              <img src={user.photoURL} alt={user.name} className="w-full h-full object-cover" />
                            ) : (
                              user.name.charAt(0)
                            )}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 text-sm">{user.name}</p>
                            <p className="text-[10px] text-slate-400 font-mono">ID: {user.employeeId || '---'}</p>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-5">
                        <p className="text-sm font-semibold text-slate-700">{user.postoName || user.department?.toUpperCase() || 'VIGIA'}</p>
                        <p className="text-xs text-slate-400 font-medium">
                          {user.role === 'admin' ? 'RH/ADMINISTRADOR' : 'VIGIA'}
                        </p>
                      </td>

                      <td className="px-6 py-5">
                        <div className="flex flex-col items-start gap-1.5">
                          <span className={cn(
                            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-wide",
                            status.badgeClass
                          )}>
                            <Icon className="w-3.5 h-3.5" />
                            {status.label}
                          </span>
                          {status.isEarly && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-200">
                              <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                              Enviada no início/meio do mês — conferir preenchimento
                            </span>
                          )}
                          {status.code === 'returned' && status.signature?.returnReason && (
                            <p className="text-[11px] text-rose-600 font-semibold max-w-xs line-clamp-2" title={status.signature.returnReason}>
                              Motivo: "{status.signature.returnReason}"
                            </p>
                          )}
                          {status.postsCount > 1 && (
                            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                              ( {status.signedCount} de {status.postsCount} postos assinados )
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-5">
                        {status.code === 'returned' ? (
                          <div className="space-y-0.5">
                            <p className="text-xs font-bold text-rose-600">Devolvida ao Func.</p>
                            {status.signature?.returnedAt && (
                              <p className="text-[10px] text-slate-400 font-mono font-bold">
                                {format(new Date(status.signature.returnedAt), "dd/MM/yy 'às' HH:mm")}
                              </p>
                            )}
                          </div>
                        ) : status.signature && status.signature.signedAt ? (
                          <div className="space-y-0.5">
                            <p className="text-xs font-bold text-slate-800">Assinado</p>
                            <p className="text-[10px] text-slate-400 font-mono font-bold">
                              {format(new Date(status.signature.signedAt), "dd/MM/yy 'às' HH:mm")}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 font-medium italic">Pendente</span>
                        )}
                      </td>

                      <td className="px-6 py-5">
                        {status.signature && status.signature.adminSigned ? (
                          <div className="space-y-0.5 text-emerald-600">
                            <p className="text-xs font-black uppercase flex items-center gap-1">
                              <Check className="w-3 h-3 text-emerald-500" />
                              Homologado
                            </p>
                            <p className="text-[10px] text-slate-400 font-mono font-bold">
                              {format(new Date(status.signature.adminSignedAt), "dd/MM/yy 'às' HH:mm")}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 font-medium italic">Pendente visto</span>
                        )}
                      </td>

                      <td className="px-6 py-5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {(status.code === 'pending_admin' || status.code === 'signed') && (
                            <button
                              type="button"
                              onClick={() => handleOpenReturnModal(user)}
                              title="Devolver folha para o funcionário preencher corretamente"
                              className="px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer inline-flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 shadow-sm active:scale-95"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              Devolver Folha
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => onViewTimecard(user, currentMonth)}
                            className={cn(
                              "px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer inline-flex items-center gap-1.5",
                              status.code === 'pending_admin'
                                ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-600/15"
                                : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                            )}
                          >
                            {status.code === 'pending_admin' ? (
                              <>
                                <PenTool className="w-3.5 h-3.5" />
                                Verificar & Vistar
                              </>
                            ) : (
                              <>
                                <FileSpreadsheet className="w-3.5 h-3.5" />
                                Revisar Folha
                              </>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal para Devolver Folha ao Funcionário */}
      <AnimatePresence>
        {returnTargetUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !returningState && setReturnTargetUser(null)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[2.5rem] p-6 shadow-2xl border border-slate-100 overflow-hidden"
            >
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                    <RotateCcw className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900">Devolver Folha para Correção</h3>
                    <p className="text-xs text-slate-500 font-medium">
                      Colaborador: <strong className="text-slate-800">{returnTargetUser.name}</strong> • {format(currentMonth, 'MMMM/yyyy', { locale: ptBR })}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => !returningState && setReturnTargetUser(null)}
                  className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                  disabled={returningState}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl mb-4 text-xs text-amber-900 space-y-1">
                <p className="font-black flex items-center gap-1.5 text-amber-950">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  O que acontece ao devolver a folha?
                </p>
                <p className="font-medium leading-relaxed">
                  A assinatura precoce/incompleta será removida, a folha ficará aberta com permissão de preenchimento liberada para <strong>{returnTargetUser.name}</strong> corrigir todos os dias do mês e assinar novamente quando estiver completa.
                </p>
              </div>

              <div className="space-y-3 mb-6">
                <label className="block text-xs font-black uppercase tracking-wider text-slate-600">
                  Motivo da Devolução / Instrução para o Funcionário
                </label>

                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Sugestões rápidas (clique para usar):
                  </span>
                  {quickReturnReasons.map((reason, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setReturnReason(reason)}
                      className={cn(
                        "w-full text-left p-2.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer",
                        returnReason === reason
                          ? "bg-rose-50 border-rose-300 text-rose-900"
                          : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600"
                      )}
                    >
                      {reason}
                    </button>
                  ))}
                </div>

                <textarea
                  rows={3}
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  placeholder="Descreva o motivo da devolução para orientar o funcionário..."
                  className="w-full p-3.5 bg-slate-50 border border-slate-200 focus:border-rose-500 rounded-2xl text-sm font-medium text-slate-800 outline-none resize-none"
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => !returningState && setReturnTargetUser(null)}
                  disabled={returningState}
                  className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl text-xs transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReturn}
                  disabled={returningState || !returnReason.trim()}
                  className="flex-1 py-3.5 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-black rounded-2xl text-xs uppercase tracking-wider shadow-lg shadow-rose-600/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  {returningState ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Devolvendo Folha...
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-4 h-4" />
                      Confirmar Devolução ao Funcionário
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
