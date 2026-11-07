import { AuthProvider, useAuth } from './hooks/useAuth';
import LoginPage from './components/auth/Login';
import Dashboard from './components/layout/Dashboard';
import { signOut } from 'firebase/auth';
import { auth } from './lib/firebase';
import { LogOut, ShieldAlert } from 'lucide-react';

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-white p-4">
        <div className="flex flex-col items-center max-w-sm text-center">
          <div className="w-16 h-16 mb-6 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center relative shadow-xl shadow-indigo-500/10">
            <div className="w-10 h-10 border-3 border-indigo-500/30 border-t-indigo-400 rounded-full animate-spin" />
            <span className="absolute text-xl font-black text-indigo-400">📌</span>
          </div>
          <h1 className="text-xl font-extrabold tracking-wider uppercase text-slate-100 mb-1">
            PONTO DIGITAL
          </h1>
          <p className="text-xs text-indigo-300 font-medium mb-4">
            Gestão Operacional de Segurança & Portaria
          </p>
          <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-900/80 px-4 py-2 rounded-full border border-slate-800">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Inicializando conexões de segurança...</span>
          </div>
        </div>
      </div>
    );
  }

  if (user && user.active === false && user.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-900 text-white">
        <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-3xl p-8 text-center shadow-2xl">
          <div className="w-16 h-16 bg-rose-500/10 text-rose-500 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-rose-500/20">
            <ShieldAlert className="w-9 h-9" />
          </div>
          <h2 className="text-2xl font-black text-white mb-2">Acesso Desativado</h2>
          <p className="text-slate-400 text-sm leading-relaxed mb-6">
            O seu cadastro foi desligado dos quadros da empresa. Você não possui mais acesso aos módulos de ponto, holerite, férias ou benefícios.
          </p>
          <div className="bg-slate-900/60 rounded-2xl p-4 border border-slate-700/50 mb-6 text-left">
            <p className="text-xs text-slate-400">Colaborador:</p>
            <p className="text-sm font-bold text-slate-200">{user.name || user.email}</p>
            {user.cpf && <p className="text-xs text-slate-500 font-mono mt-0.5">CPF: {user.cpf}</p>}
          </div>
          <button
            onClick={() => signOut(auth)}
            className="w-full py-3.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-rose-600/20"
          >
            <LogOut className="w-4 h-4" />
            Sair do Aplicativo
          </button>
        </div>
      </div>
    );
  }

  return user ? <Dashboard /> : <LoginPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
