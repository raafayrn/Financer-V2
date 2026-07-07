import type { InvestmentType } from '../api/types';

export const INVESTMENT_TYPE_LABEL: Record<InvestmentType, string> = {
  RENDA_FIXA: 'Renda fixa',
  TESOURO_DIRETO: 'Tesouro Direto',
  ACOES: 'Ações',
  FUNDOS: 'Fundos',
  CRIPTO: 'Cripto',
  POUPANCA: 'Poupança',
  OUTRO: 'Outro',
};

export const INVESTMENT_TYPE_COLOR: Record<InvestmentType, string> = {
  RENDA_FIXA: '#3b82f6',
  TESOURO_DIRETO: '#22c55e',
  ACOES: '#ef4444',
  FUNDOS: '#a855f7',
  CRIPTO: '#f59e0b',
  POUPANCA: '#14b8a6',
  OUTRO: '#94a3b8',
};
