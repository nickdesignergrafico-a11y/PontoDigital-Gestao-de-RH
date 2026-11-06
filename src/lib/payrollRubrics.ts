// src/lib/payrollRubrics.ts
// Gerenciamento e catálogo oficial de rubricas e cálculos automáticos de folha de pagamento CLT

export interface PayrollRubric {
  id?: string;
  code: string;
  name: string;
  type: 'addition' | 'deduction' | 'info';
  defaultReference?: string;
  isSystem?: boolean;
}

export interface SalarySlipLineItem {
  id?: string;
  code: string;
  description: string;
  reference: string;
  type: 'addition' | 'deduction' | 'info';
  amount: number;
}

export interface PayrollTotals {
  baseSalary: number;
  totalAdditions: number;
  totalDeductions: number;
  netSalary: number;
  salContrInss: number;
  baseFgts: number;
  fgtsMes: number;
  baseIrrf: number;
  faixaIrrf: string;
  irrfValorCalculado: number;
  inssValorCalculado: number;
}

// Catálogo base brasileiro CLT com os códigos e descrições padronizados
export const DEFAULT_PAYROLL_RUBRICS: PayrollRubric[] = [
  { code: '8781', name: 'DIAS NORMAIS (SALÁRIO BASE)', type: 'addition', defaultReference: '31,00', isSystem: true },
  { code: '0150', name: 'HORAS EXTRAS 50%', type: 'addition', defaultReference: '07:30', isSystem: true },
  { code: '0151', name: 'HORAS EXTRAS 100%', type: 'addition', defaultReference: '08:00', isSystem: true },
  { code: '0160', name: 'ADICIONAL NOTURNO 20%', type: 'addition', defaultReference: '20,00%', isSystem: true },
  { code: '0165', name: 'ADICIONAL DE PERICULOSIDADE 30%', type: 'addition', defaultReference: '30,00%', isSystem: true },
  { code: '0166', name: 'ADICIONAL DE INSALUBRIDADE 20%', type: 'addition', defaultReference: '20,00%', isSystem: true },
  { code: '0167', name: 'ADICIONAL DE INSALUBRIDADE 40%', type: 'addition', defaultReference: '40,00%', isSystem: true },
  { code: '8125', name: 'D.S.R. S/ HORAS EXTRAS E ADICIONAIS', type: 'addition', defaultReference: 'Reflexo', isSystem: true },
  { code: '0205', name: 'GRATIFICAÇÃO DE FUNÇÃO', type: 'addition', defaultReference: '100%', isSystem: true },
  { code: '0210', name: 'PRÊMIO / BONIFICAÇÃO', type: 'addition', defaultReference: '-', isSystem: true },
  { code: '0215', name: 'AJUDA DE CUSTO / DIÁRIA', type: 'addition', defaultReference: '-', isSystem: true },
  { code: '0220', name: 'VALOR DAS FÉRIAS (GOZO)', type: 'addition', defaultReference: '30 Dias', isSystem: true },
  { code: '0221', name: 'TERÇO CONSTITUCIONAL DE FÉRIAS (1/3)', type: 'addition', defaultReference: '33,33%', isSystem: true },
  { code: '9382', name: 'VALE ALIMENTAÇÃO', type: 'info', defaultReference: '15,00', isSystem: true },
  { code: '998', name: 'INSS - PREVIDÊNCIA SOCIAL (CLT)', type: 'deduction', defaultReference: '7,90%', isSystem: true },
  { code: '508', name: 'IRRF - IMPOSTO DE RENDA RETIDO NA FONTE', type: 'deduction', defaultReference: '7,50%', isSystem: true },
  { code: '0201', name: 'DESC. VALE REFEIÇÃO / ALIMENTAÇÃO (1%)', type: 'deduction', defaultReference: '1,00%', isSystem: true },
  { code: '0202', name: 'DESC. VALE TRANSPORTE (6%)', type: 'deduction', defaultReference: '6,00%', isSystem: true },
  { code: '0203', name: 'SEGURO DE VIDA EM GRUPO', type: 'deduction', defaultReference: '-', isSystem: true },
  { code: '0620', name: 'ADIANTAMENTO SALARIAL / QUINZENA', type: 'deduction', defaultReference: 'Adiant.', isSystem: true },
  { code: '0625', name: 'FALTAS E DIAS NÃO TRABALHADOS', type: 'deduction', defaultReference: '01 Dia', isSystem: true },
  { code: '0626', name: 'D.S.R. S/ FALTAS', type: 'deduction', defaultReference: '01 Dia', isSystem: true },
  { code: '0700', name: 'CONTRIBUIÇÃO ASSISTENCIAL SINDICAL', type: 'deduction', defaultReference: '-', isSystem: true },
  { code: '0800', name: 'PENSÃO ALIMENTÍCIA JUDICIAL', type: 'deduction', defaultReference: '-', isSystem: true },
  { code: '0999', name: 'OUTROS DESCONTOS DIVERSOS', type: 'deduction', defaultReference: '-', isSystem: true },
];

/**
 * Encontra ou sugere o código e referência padrão para uma rubrica pelo nome
 */
export function matchRubricDetails(name: string, type: 'addition' | 'deduction' | 'info' = 'addition', catalog: PayrollRubric[] = DEFAULT_PAYROLL_RUBRICS) {
  const norm = (name || '').trim().toUpperCase();

  // Busca exata ou por substring no catálogo
  const found = catalog.find(r => {
    const rNorm = r.name.toUpperCase();
    return norm === rNorm || norm.includes(rNorm) || rNorm.includes(norm);
  });

  if (found) {
    return {
      code: found.code,
      description: found.name,
      reference: found.defaultReference || '-',
      type: found.type
    };
  }

  // Regras de fallback inteligentes
  if (norm.includes('BASE') || norm.includes('CONTRATUAL') || norm.includes('DIAS NORMAIS') || norm === 'SALÁRIO BASE') {
    return { code: '8781', description: name, reference: '31,00', type: 'addition' as const };
  }
  if (norm.includes('EXTRA') || norm.includes('HORAS EXTRAS')) {
    return { code: '0150', description: name, reference: '07:30', type: 'addition' as const };
  }
  if (norm.includes('NOTURNO')) {
    return { code: '0160', description: name, reference: '20,00%', type: 'addition' as const };
  }
  if (norm.includes('PERICULOSIDADE')) {
    return { code: '0165', description: name, reference: '30,00%', type: 'addition' as const };
  }
  if (norm.includes('INSALUBRIDADE')) {
    return { code: '0166', description: name, reference: '20,00%', type: 'addition' as const };
  }
  if (norm.includes('DSR') || norm.includes('REFLEXO')) {
    return { code: '8125', description: name, reference: 'Reflexo', type: 'addition' as const };
  }
  if (norm.includes('INSS')) {
    return { code: '998', description: name, reference: '7,90%', type: 'deduction' as const };
  }
  if (norm.includes('IRPF') || norm.includes('IMPOSTO DE RENDA') || norm.includes('IRRF')) {
    return { code: '508', description: name, reference: '7,50%', type: 'deduction' as const };
  }
  if (norm.includes('9382') || norm.includes('9392') || norm.includes('VALE ALIMENTA')) {
    return { code: '9382', description: 'VALE ALIMENTAÇÃO', reference: '15,00', type: 'info' as const };
  }
  if (norm.includes('VALE REFEI') && !norm.includes('DESC')) {
    return { code: '9382', description: 'VALE ALIMENTAÇÃO / REFEIÇÃO', reference: '15,00', type: 'info' as const };
  }
  if (norm.includes('VALE TRANSP')) {
    return { code: '0202', description: name, reference: '6,00%', type: 'deduction' as const };
  }
  if (norm.includes('SEGURO')) {
    return { code: '0203', description: name, reference: '-', type: 'deduction' as const };
  }
  if (norm.includes('FALTA')) {
    return { code: '0625', description: name, reference: '01 Dia', type: 'deduction' as const };
  }

  return {
    code: type === 'addition' ? '0205' : (type === 'info' ? '9382' : '0999'),
    description: name,
    reference: '-',
    type
  };
}

/**
 * Calcula tabela progressiva oficial do INSS CLT (2024/2026)
 */
export function calculateInss(grossSalary: number): { inss: number; effectiveRate: string } {
  const sal = Math.max(0, Number(grossSalary) || 0);
  let inss = 0;
  let effectiveRate = '0,00%';

  if (sal <= 1412.00) {
    inss = sal * 0.075;
    effectiveRate = '7,50%';
  } else if (sal <= 2666.68) {
    inss = (sal * 0.09) - 21.18;
    effectiveRate = `${((inss / sal) * 100).toFixed(2).replace('.', ',')}%`;
  } else if (sal <= 4000.03) {
    inss = (sal * 0.12) - 101.18;
    effectiveRate = `${((inss / sal) * 100).toFixed(2).replace('.', ',')}%`;
  } else if (sal <= 7786.02) {
    inss = (sal * 0.14) - 181.18;
    effectiveRate = `${((inss / sal) * 100).toFixed(2).replace('.', ',')}%`;
  } else {
    inss = 908.86; // Teto
    effectiveRate = 'TETO (14%)';
  }

  return {
    inss: Number(Math.max(0, inss).toFixed(2)),
    effectiveRate
  };
}

/**
 * Calcula tabela progressiva oficial do IRRF CLT (2024/2026)
 */
export function calculateIrrf(baseIrrf: number): { irrf: number; faixa: string } {
  const base = Math.max(0, Number(baseIrrf) || 0);
  let irrf = 0;
  let faixa = 'ISENTO';

  if (base <= 2259.20) {
    irrf = 0;
    faixa = 'ISENTO';
  } else if (base <= 2826.65) {
    irrf = (base * 0.075) - 169.44;
    faixa = '7,50%';
  } else if (base <= 3751.05) {
    irrf = (base * 0.15) - 381.44;
    faixa = '15,00%';
  } else if (base <= 4664.68) {
    irrf = (base * 0.225) - 662.77;
    faixa = '22,50%';
  } else {
    irrf = (base * 0.275) - 896.00;
    faixa = '27,50%';
  }

  return {
    irrf: Number(Math.max(0, irrf).toFixed(2)),
    faixa
  };
}

/**
 * Motor de cálculo automático completo de contracheque
 * Retorna todos os totais e as bases oficiais:
 * - Salário Base
 * - Total de Vencimentos
 * - Sal. Contr. INSS
 * - Base Cálc. FGTS
 * - FGTS do Mês
 * - Base Cálc. IRRF
 * - Faixa IRRF
 * - Total de Descontos
 * - Valor Líquido
 */
export function calculatePayrollTotals(items: SalarySlipLineItem[], fallbackBaseSalary: number = 0): PayrollTotals {
  let totalAdditions = 0;
  let totalDeductions = 0;
  let detectedBaseSalary = 0;
  let explicitInssDeduction = 0;
  let explicitIrrfDeduction = 0;

  for (const item of items) {
    const val = Number(item.amount) || 0;
    const norm = (item.description || '').toUpperCase();
    const code = (item.code || '').trim();

    // Rubricas informativas ou código 9382 ficam apenas em referência, sem afetar vencimentos nem descontos
    if (code === '9382' || code === '9392' || item.type === 'info') {
      continue;
    }

    if (item.type === 'addition') {
      totalAdditions += val;
      // Detecta salário base
      if (code === '8781' || norm.includes('DIAS NORMAIS') || norm.includes('SALÁRIO BASE') || norm === 'BASE') {
        if (!detectedBaseSalary) detectedBaseSalary = val;
      }
    } else {
      totalDeductions += val;
      if (code === '998' || norm.includes('INSS')) {
        explicitInssDeduction += val;
      }
      if (code === '508' || norm.includes('IRRF') || norm.includes('IMPOSTO DE RENDA')) {
        explicitIrrfDeduction += val;
      }
    }
  }

  const baseSalary = detectedBaseSalary > 0 ? detectedBaseSalary : fallbackBaseSalary;
  const netSalary = Math.max(0, totalAdditions - totalDeductions);

  // Bases oficiais
  const salContrInss = Number(totalAdditions.toFixed(2));
  const autoInss = calculateInss(salContrInss);
  const inssToUse = explicitInssDeduction > 0 ? explicitInssDeduction : autoInss.inss;

  const baseFgts = Number(totalAdditions.toFixed(2));
  const fgtsMes = Number((baseFgts * 0.08).toFixed(2));

  const baseIrrf = Number(Math.max(0, totalAdditions - inssToUse).toFixed(2));
  const autoIrrf = calculateIrrf(baseIrrf);

  return {
    baseSalary: Number(baseSalary.toFixed(2)),
    totalAdditions: Number(totalAdditions.toFixed(2)),
    totalDeductions: Number(totalDeductions.toFixed(2)),
    netSalary: Number(netSalary.toFixed(2)),
    salContrInss,
    baseFgts,
    fgtsMes,
    baseIrrf,
    faixaIrrf: autoIrrf.faixa,
    irrfValorCalculado: autoIrrf.irrf,
    inssValorCalculado: autoInss.inss
  };
}
