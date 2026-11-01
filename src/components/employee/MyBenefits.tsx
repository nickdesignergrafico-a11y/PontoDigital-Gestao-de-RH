import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { db } from '../../lib/firebase';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { Utensils, Heart, Car, Star, Info, ChevronRight, Check, Calculator } from 'lucide-react';
import { CompanyConfig } from '../../types';
import {
  cn,
  VALOR_VALE_POR_DIA,
  calcularPontoEValeAutomatico,
  contarPlantoesTrabalhadosNoMes
} from '../../lib/utils';

export default function MyBenefits() {
  const { user } = useAuth();
  const [companyConfig, setCompanyConfig] = useState<CompanyConfig | null>(null);
  const [attendanceList, setAttendanceList] = useState<any[]>([]);
  const [selectedShifts, setSelectedShifts] = useState<number>(15);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'config', 'company'), (docSnap) => {
      if (docSnap.exists()) {
        setCompanyConfig(docSnap.data() as CompanyConfig);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    const qAtt = query(collection(db, 'attendance'), where('userId', '==', user.uid));
    const unsubAtt = onSnapshot(qAtt, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAttendanceList(list);
      const now = new Date();
      const detected = contarPlantoesTrabalhadosNoMes(list, user.uid, now.getMonth() + 1, now.getFullYear());
      if (detected > 0) {
        setSelectedShifts(detected);
      }
    });
    return () => unsubAtt();
  }, [user?.uid]);

  const now = new Date();
  const plantoesNoMesAtual = contarPlantoesTrabalhadosNoMes(
    attendanceList,
    user?.uid || '',
    now.getMonth() + 1,
    now.getFullYear()
  );

  const calculoVale = calcularPontoEValeAutomatico(selectedShifts);
  const calc15 = calcularPontoEValeAutomatico(15);
  const calc16 = calcularPontoEValeAutomatico(16);

  const benefits = [
    {
      id: 'meal-ticket',
      name: 'Vale Refeição (R$ 26,40 / Plantão)',
      description: `Cálculo automático por plantão trabalhado (R$ ${VALOR_VALE_POR_DIA.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/dia) com 1% de coparticipação no holerite (Ex: 15 plantões = R$ ${calc15.totalCreditoCartao.replace('.', ',')} | Desc. R$ ${calc15.descontoNoSueldo.replace('.', ',')}; 16 plantões = R$ ${calc16.totalCreditoCartao.replace('.', ',')} | Desc. R$ ${calc16.descontoNoSueldo.replace('.', ',')}).`,
      value: Number(calculoVale.totalCreditoCartao),
      subtitle: `${calculoVale.plantoesNoMes} plantões • Desc. 1%: R$ ${calculoVale.descontoNoSueldo.replace('.', ',')}`,
      icon: Utensils,
      color: 'bg-emerald-500',
      active: true,
    },
    {
      id: 'health-plan',
      name: 'Plano de Saúde',
      description: 'Cobertura médica Nacional para você e seus dependentes.',
      value: 'Plano Ouro Plus',
      subtitle: companyConfig?.name || 'Benefício Corporativo',
      icon: Heart,
      color: 'bg-red-500',
      active: user?.benefits?.includes('health_plan') || true,
    },
    {
      id: 'transport',
      name: 'Vale Transporte',
      description: 'Auxílio mensal para deslocamento residência-trabalho.',
      value: 'Recarga Mensal',
      subtitle: 'Conforme escala de plantão',
      icon: Car,
      color: 'bg-blue-500',
      active: true,
    },
    {
      id: 'gympass',
      name: 'Auxílio Academia',
      description: 'Acesso a diversas academias e estúdios de atividade física.',
      value: 'Plano Basic',
      subtitle: 'Adesão opcional',
      icon: Star,
      color: 'bg-purple-500',
      active: false,
    }
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header>
        <h1 className="text-3xl font-bold text-slate-900 leading-tight">Meus Benefícios</h1>
        <p className="text-slate-500 font-medium">Confira as vantagens, cálculo automático do Vale Refeição e auxílios oferecidos pela empresa.</p>
      </header>

      {/* Painel de Cálculo Automático de Ponto & Vale Refeição */}
      <div className="bg-slate-900 text-white rounded-[2.5rem] p-6 md:p-8 border border-slate-800 shadow-xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 text-emerald-400 flex items-center justify-center shrink-0">
              <Calculator className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 block">
                Regra Oficial de Alimentação • Escala de Plantão
              </span>
              <h2 className="text-xl font-black text-white">
                Cálculo Automático do Vale Refeição (R$ 26,40 por Plantão)
              </h2>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedShifts(15)}
              className={cn(
                "px-3.5 py-2 rounded-xl text-xs font-black border transition-all cursor-pointer",
                selectedShifts === 15
                  ? "bg-emerald-500 text-slate-950 border-emerald-400"
                  : "bg-white/5 hover:bg-white/10 text-slate-300 border-white/10"
              )}
            >
              15 Plantões (R$ 396,00)
            </button>
            <button
              type="button"
              onClick={() => setSelectedShifts(16)}
              className={cn(
                "px-3.5 py-2 rounded-xl text-xs font-black border transition-all cursor-pointer",
                selectedShifts === 16
                  ? "bg-emerald-500 text-slate-950 border-emerald-400"
                  : "bg-white/5 hover:bg-white/10 text-slate-300 border-white/10"
              )}
            >
              16 Plantões (R$ 422,40)
            </button>
            {plantoesNoMesAtual > 0 && (
              <button
                type="button"
                onClick={() => setSelectedShifts(plantoesNoMesAtual)}
                className={cn(
                  "px-3.5 py-2 rounded-xl text-xs font-black border transition-all cursor-pointer",
                  selectedShifts === plantoesNoMesAtual && selectedShifts !== 15 && selectedShifts !== 16
                    ? "bg-blue-500 text-white border-blue-400"
                    : "bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 border-blue-400/30"
                )}
              >
                Meu Ponto Atual ({plantoesNoMesAtual} plantões)
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
              Plantões Trabalhados no Mês
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <input
                type="number"
                min={0}
                max={31}
                value={selectedShifts}
                onChange={(e) => setSelectedShifts(Math.max(0, Number(e.target.value) || 0))}
                className="w-20 px-3 py-1.5 bg-white/10 border border-white/15 rounded-xl text-white font-black text-xl text-center focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
              <span className="text-xs text-slate-400 font-semibold">× R$ 26,40 fixo/dia</span>
            </div>
          </div>

          <div className="bg-emerald-500/15 border border-emerald-400/30 rounded-2xl p-4">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-300 block">
              Total Crédito no Cartão Benefício
            </span>
            <p className="text-2xl font-black text-emerald-400 mt-1 font-mono">
              R$ {calculoVale.totalCreditoCartao.replace('.', ',')}
            </p>
            <span className="text-[11px] text-emerald-200/80 font-medium">
              Valor integral depositado no cartão
            </span>
          </div>

          <div className="bg-amber-500/15 border border-amber-400/30 rounded-2xl p-4">
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-300 block">
              Desconto no Holerite (1%)
            </span>
            <p className="text-2xl font-black text-amber-400 mt-1 font-mono">
              R$ {calculoVale.descontoNoSueldo.replace('.', ',')}
            </p>
            <span className="text-[11px] text-amber-200/80 font-medium">
              1% de coparticipação sobre o recebido
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {benefits.map((benefit) => (
          <div 
            key={benefit.id}
            className={cn(
              "bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50 flex flex-col h-full transition-all hover:scale-[1.02]",
              !benefit.active && "opacity-60 grayscale-[0.5]"
            )}
          >
            <div className="flex items-start justify-between mb-4">
              <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-lg", benefit.color)}>
                <benefit.icon className="w-8 h-8" />
              </div>
              {benefit.active ? (
                <div className="px-3 py-1 bg-emerald-100 text-emerald-600 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                  <Check className="w-3 h-3" /> ATIVO
                </div>
              ) : (
                <div className="px-3 py-1 bg-slate-100 text-slate-400 rounded-lg text-[10px] font-black uppercase tracking-wider">
                  NÃO ADERIDO
                </div>
              )}
            </div>

            <h3 className="text-xl font-bold text-slate-900 mb-2">{benefit.name}</h3>
            <p className="text-slate-500 text-sm font-medium leading-relaxed mb-6 flex-1">
              {benefit.description}
            </p>

            <div className="pt-6 border-t border-slate-50 flex items-center justify-between mt-auto">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Valor / Simulação</p>
                <p className="text-lg font-black text-slate-900">
                  {typeof benefit.value === 'number' 
                    ? `R$ ${benefit.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                    : benefit.value
                  }
                </p>
                {benefit.subtitle && (
                  <p className="text-xs font-bold text-emerald-600 mt-0.5">{benefit.subtitle}</p>
                )}
              </div>
              <button 
                className={cn(
                  "p-3 rounded-xl transition-all",
                  benefit.active ? "bg-slate-50 text-slate-400 hover:text-blue-600 hover:bg-blue-50" : "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                )}
              >
                {benefit.active ? <Info className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-blue-600 rounded-[2.5rem] p-8 text-white relative overflow-hidden shadow-2xl shadow-blue-600/30">
        <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
          <div className="w-20 h-20 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/20">
            <Star className="w-10 h-10 text-white" />
          </div>
          <div className="text-center md:text-left flex-1">
            <h3 className="text-2xl font-bold mb-2">Novos Benefícios em Breve</h3>
            <p className="text-blue-100 font-medium">Estamos trabalhando para trazer ainda mais vantagens para você e sua família.</p>
          </div>
          <button className="px-8 py-4 bg-white text-blue-600 font-bold rounded-2xl shadow-lg hover:scale-105 transition-all">
            Sugerir Benefício
          </button>
        </div>
        <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-white/5 rounded-full blur-3xl" />
      </div>
    </div>
  );
}
