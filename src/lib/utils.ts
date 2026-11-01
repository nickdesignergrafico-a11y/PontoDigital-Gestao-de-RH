import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCPF(cpf: string) {
  const clean = cpf.replace(/\D/g, '');
  return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function parseFirestoreTimestamp(timestamp: any, fallbackDate?: Date): Date {
  if (!timestamp) return fallbackDate || new Date();
  
  // If it's already a JS Date
  if (timestamp instanceof Date) {
    return isNaN(timestamp.getTime()) ? (fallbackDate || new Date()) : timestamp;
  }
  
  // If it has a toDate method (as a Firestore Timestamp instance)
  if (typeof timestamp.toDate === 'function') {
    try {
      const d = timestamp.toDate();
      return isNaN(d.getTime()) ? (fallbackDate || new Date()) : d;
    } catch (e) {
      return fallbackDate || new Date();
    }
  }
  
  // If it's a serialized Firestore timestamp structure { seconds, nanoseconds } or { _seconds, _nanoseconds }
  const secs = timestamp.seconds !== undefined ? timestamp.seconds : timestamp._seconds;
  if (secs !== undefined) {
    const s = Number(secs);
    const nanos = Number(timestamp.nanoseconds || timestamp._nanoseconds || 0);
    const d = new Date(s * 1000 + Math.floor(nanos / 1000000));
    return isNaN(d.getTime()) ? (fallbackDate || new Date()) : d;
  }
  
  // If it's a string
  if (typeof timestamp === 'string') {
    const cleanStr = timestamp.trim();
    if (!cleanStr) return fallbackDate || new Date();

    // Match YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleanStr)) {
      const [y, m, d] = cleanStr.split('-').map(Number);
      return new Date(y, m - 1, d, 12, 0, 0);
    }
    // Match DD/MM/YYYY
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(cleanStr)) {
      const [d, m, y] = cleanStr.split('/').map(Number);
      return new Date(y, m - 1, d, 12, 0, 0);
    }

    const parsed = new Date(cleanStr);
    return isNaN(parsed.getTime()) ? (fallbackDate || new Date()) : parsed;
  }
  
  // If it's a number (timestamp epoch milliseconds or seconds)
  if (typeof timestamp === 'number') {
    if (timestamp < 10000000000) {
      const d = new Date(timestamp * 1000);
      return isNaN(d.getTime()) ? (fallbackDate || new Date()) : d;
    }
    const d = new Date(timestamp);
    return isNaN(d.getTime()) ? (fallbackDate || new Date()) : d;
  }
  
  return fallbackDate || new Date();
}

// Configurações de cálculo automático do Vale Refeição por plantão trabalhado
export const VALOR_VALE_POR_DIA = 26.40; // R$ 26,40 fixo por plantão
export const PORCENTAGEM_DESCONTO_VALE = 0.01; // 1% de coparticipação no holerite

export interface CalculoValeAutomaticoResult {
  plantoesNoMes: number;
  valorPorDia: number;
  porcentagemDesconto: number;
  valorTotalVale: number;
  descontoHolerite: number;
  totalCreditoCartao: string; // Ex: "396.00" (15 plantões) ou "422.40" (16 plantões)
  descontoNoSueldo: string;   // Ex: "3.96" (15 plantões) ou "4.22" (16 plantões)
}

export function calcularPontoEValeAutomatico(
  totalPlantoesTrabalhados: number,
  valorValePorDia: number = VALOR_VALE_POR_DIA,
  porcentagemDesconto: number = PORCENTAGEM_DESCONTO_VALE
): CalculoValeAutomaticoResult {
  const plantoes = Math.max(0, Number(totalPlantoesTrabalhados) || 0);
  // 1. Calcula o valor total que vai entrar no cartão de benefício
  const valorTotalVale = plantoes * valorValePorDia;

  // 2. Calcula o desconto do holerite baseado em 1% do que foi recebido
  const descontoHolerite = valorTotalVale * porcentagemDesconto;

  return {
    plantoesNoMes: plantoes,
    valorPorDia: valorValePorDia,
    porcentagemDesconto,
    valorTotalVale: Number(valorTotalVale.toFixed(2)),
    descontoHolerite: Number(descontoHolerite.toFixed(2)),
    totalCreditoCartao: valorTotalVale.toFixed(2),
    descontoNoSueldo: descontoHolerite.toFixed(2),
  };
}

export function contarPlantoesTrabalhadosNoMes(
  attendanceList: any[],
  userId: string,
  month: number, // 1-12
  year: number
): number {
  if (!attendanceList || !userId) return 0;
  const uniqueDays = new Set<string>();

  for (const record of attendanceList) {
    if (record.userId !== userId || !record.timestamp) continue;
    const d = parseFirestoreTimestamp(record.timestamp);
    if (isNaN(d.getTime())) continue;
    if (d.getMonth() + 1 === Number(month) && d.getFullYear() === Number(year)) {
      const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      uniqueDays.add(dayKey);
    }
  }

  return uniqueDays.size;
}

