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

// As cores vêm da paleta categórica única do app (ver utils/palette.ts).
export { INVESTMENT_TYPE_COLOR } from './palette';
