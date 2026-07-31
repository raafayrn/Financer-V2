import { describe, expect, it } from 'vitest';
import {
  buildDailyDigest,
  buildMonthClose,
  buildWaterReminder,
  formatBRL,
  isDue,
  parseHourMinute,
  type DigestData,
} from '../src/lib/notifications';

const baseDigest: DigestData = {
  name: 'Rafael Soares',
  todayIso: '2026-07-31',
  weekday: 5,
  finance: null,
  dueSoon: [],
  workout: null,
  exams: [],
  lateTasks: [],
};

describe('formatBRL', () => {
  it('usa o padrão brasileiro', () => {
    expect(formatBRL(1234.5)).toBe('R$ 1.234,50');
    expect(formatBRL(0)).toBe('R$ 0,00');
    expect(formatBRL(1000000)).toBe('R$ 1.000.000,00');
  });
});

describe('buildDailyDigest', () => {
  // Um bot que manda "nada para hoje" todo dia acaba silenciado.
  it('não manda nada quando não há o que dizer', () => {
    expect(buildDailyDigest(baseDigest)).toBeNull();
  });

  it('usa só o primeiro nome na saudação', () => {
    const msg = buildDailyDigest({
      ...baseDigest,
      finance: { remaining: 1000, spent: 500, income: 1500 },
    });
    expect(msg).toContain('Bom dia, Rafael!');
    expect(msg).not.toContain('Soares');
  });

  it('mostra o saldo do mês', () => {
    const msg = buildDailyDigest({
      ...baseDigest,
      finance: { remaining: 3911.7, spent: 3108.3, income: 5722 },
    });
    expect(msg).toContain('Ainda pode gastar: R$ 3.911,70');
    expect(msg).toContain('R$ 3.108,30');
  });

  it('avisa contas vencendo hoje e amanhã com o texto certo', () => {
    const msg = buildDailyDigest({
      ...baseDigest,
      dueSoon: [
        { description: 'Aluguel', amount: 1200, daysUntil: 0 },
        { description: 'Netflix', amount: 55, daysUntil: 1 },
      ],
    });
    expect(msg).toContain('Aluguel vence hoje — R$ 1.200,00');
    expect(msg).toContain('Netflix vence amanhã — R$ 55,00');
  });

  it('diferencia treino pendente de treino já feito', () => {
    const pendente = buildDailyDigest({
      ...baseDigest,
      workout: { name: 'Peito e tríceps', exerciseCount: 5, done: false },
    });
    expect(pendente).toContain('Treino de hoje: Peito e tríceps (5 exercícios)');

    const feito = buildDailyDigest({
      ...baseDigest,
      workout: { name: 'Peito e tríceps', exerciseCount: 5, done: true },
    });
    expect(feito).toContain('já registrado');
  });

  it('destaca prova de hoje e de amanhã', () => {
    const msg = buildDailyDigest({
      ...baseDigest,
      exams: [
        { title: 'Cálculo II', daysUntil: 0 },
        { title: 'Física II', daysUntil: 1 },
        { title: 'Estática', daysUntil: 5 },
      ],
    });
    expect(msg).toContain('Cálculo II é HOJE');
    expect(msg).toContain('Física II é amanhã');
    expect(msg).toContain('Estática em 5 dias');
  });

  it('marca tarefa atrasada com quantos dias', () => {
    const msg = buildDailyDigest({
      ...baseDigest,
      lateTasks: [
        { title: 'Relatório de lab', daysUntil: -3 },
        { title: 'Lista 4', daysUntil: 0 },
      ],
    });
    expect(msg).toContain('Relatório de lab — 3d atrasada');
    expect(msg).toContain('Lista 4 — entrega hoje');
  });
});

describe('buildWaterReminder', () => {
  it('não lembra quando a meta já foi batida', () => {
    expect(buildWaterReminder({ consumedMl: 3000, goalMl: 3000 })).toBeNull();
    expect(buildWaterReminder({ consumedMl: 3500, goalMl: 3000 })).toBeNull();
  });

  it('não lembra quando não há meta', () => {
    expect(buildWaterReminder({ consumedMl: 0, goalMl: 0 })).toBeNull();
  });

  it('avisa quando nada foi registrado', () => {
    const msg = buildWaterReminder({ consumedMl: 0, goalMl: 3000 });
    expect(msg).toContain('ainda não registrou água');
    expect(msg).toContain('3,0 L');
  });

  it('mostra percentual e quanto falta', () => {
    const msg = buildWaterReminder({ consumedMl: 1800, goalMl: 3000 });
    expect(msg).toContain('60%');
    expect(msg).toContain('1,2 L');
  });
});

describe('buildMonthClose', () => {
  it('mostra sobra quando a renda superou o gasto', () => {
    const msg = buildMonthClose({
      year: 2026, month: 7, spent: 3000, income: 5000,
      previousSpent: null, topCategories: [],
    });
    expect(msg).toContain('Fechamento de julho/2026');
    expect(msg).toContain('Sobrou: R$ 2.000,00');
  });

  it('mostra falta quando gastou mais do que ganhou', () => {
    const msg = buildMonthClose({
      year: 2026, month: 7, spent: 6000, income: 5000,
      previousSpent: null, topCategories: [],
    });
    expect(msg).toContain('Faltou: R$ 1.000,00');
  });

  it('compara com o mês anterior nos dois sentidos', () => {
    const subiu = buildMonthClose({
      year: 2026, month: 7, spent: 1200, income: 5000,
      previousSpent: 1000, topCategories: [],
    });
    expect(subiu).toContain('20% a mais');

    const caiu = buildMonthClose({
      year: 2026, month: 7, spent: 800, income: 5000,
      previousSpent: 1000, topCategories: [],
    });
    expect(caiu).toContain('20% a menos');
  });

  it('não divide por zero quando não havia gasto anterior', () => {
    const msg = buildMonthClose({
      year: 2026, month: 7, spent: 500, income: 5000,
      previousSpent: 0, topCategories: [],
    });
    expect(msg).not.toContain('NaN');
    expect(msg).not.toContain('Infinity');
  });

  it('lista as categorias que mais pesaram', () => {
    const msg = buildMonthClose({
      year: 2026, month: 7, spent: 1000, income: 5000, previousSpent: null,
      topCategories: [
        { name: 'Casa', spent: 600 },
        { name: 'Mercado', spent: 300 },
      ],
    });
    expect(msg).toContain('Casa: R$ 600,00');
    expect(msg).toContain('Mercado: R$ 300,00');
  });
});

describe('parseHourMinute', () => {
  it('aceita HH:MM', () => {
    expect(parseHourMinute('08:00')).toBe(480);
    expect(parseHourMinute('8:30')).toBe(510);
    expect(parseHourMinute('23:59')).toBe(1439);
    expect(parseHourMinute('00:00')).toBe(0);
  });

  it('rejeita formato inválido', () => {
    for (const v of ['', 'abc', '25:00', '10:70', '10', '10:5']) {
      expect(parseHourMinute(v), v).toBeNull();
    }
  });
});

describe('isDue', () => {
  // Comparar ">= horário" em vez de "== minuto exato" faz o aviso sair mesmo
  // se o servidor estava desligado no minuto marcado.
  it('dispara a partir do horário, não só no minuto exato', () => {
    expect(isDue(479, 480)).toBe(false);
    expect(isDue(480, 480)).toBe(true);
    expect(isDue(700, 480)).toBe(true);
  });
});
