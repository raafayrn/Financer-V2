import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useMonth } from '../context/MonthContext';
import { useTheme } from '../context/ThemeContext';
import { formatCurrency, formatDayMonth } from '../utils/format';
import type { SearchHit, SearchKind } from '../api/types';

/**
 * ============================================================
 * COMMAND PALETTE (Ctrl/Cmd+K)
 * ============================================================
 *
 * Com seis seções e abas dentro delas, chegar a um lugar custava três cliques
 * e saber onde ele mora. E os botões de busca e notificação do cabeçalho eram
 * renderizados sem onClick — afordância falsa, o pior tipo de botão.
 *
 * Duas naturezas de resultado, e a distinção é o que faz a paleta valer:
 *
 *   NAVEGAR — leva a um registro que já existe (um gasto, uma prova). Vem do
 *             servidor, por GET /api/search, com o ranking documentado em
 *             server/src/lib/search.ts.
 *   AGIR    — faz alguma coisa daqui mesmo (lançar gasto, trocar de mês,
 *             alternar tema). É local, não passa por rede, e por isso responde
 *             instantaneamente enquanto a busca ainda está voando.
 *
 * Com a caixa vazia mostra as ações e o que foi usado por último (guardado em
 * localStorage) — porque a coisa mais provável de alguém querer de novo é a
 * que acabou de fazer.
 *
 * Sobre a mesma base Radix do Modal (fase 2): foco preso, Escape, foco de
 * volta ao fechar. A navegação da LISTA é própria — setas movem um índice, não
 * o foco, que fica no campo de texto o tempo todo. É o que permite digitar e
 * escolher sem tirar a mão.
 */

const CHAVE_RECENTES = 'orbit.palette.recentes';
const MAX_RECENTES = 5;
const DEBOUNCE_MS = 180;

interface Acao {
  id: string;
  label: string;
  hint: string;
  run: () => void;
}

const ROTULO_TIPO: Record<SearchKind, string> = {
  expense: 'Gastos',
  income: 'Receitas',
  recurring: 'Fixas',
  investment: 'Investimentos',
  subject: 'Matérias',
  exam: 'Provas',
  task: 'Tarefas',
  event: 'Agenda',
};

/** Ordem dos grupos na lista. Dinheiro primeiro: é o uso diário do app. */
const ORDEM_TIPOS: SearchKind[] = [
  'expense',
  'income',
  'recurring',
  'investment',
  'exam',
  'task',
  'event',
  'subject',
];

function lerRecentes(): string[] {
  try {
    const cru = localStorage.getItem(CHAVE_RECENTES);
    return cru ? (JSON.parse(cru) as string[]) : [];
  } catch {
    return [];
  }
}

function salvarRecente(id: string) {
  try {
    const atuais = lerRecentes().filter((x) => x !== id);
    localStorage.setItem(CHAVE_RECENTES, JSON.stringify([id, ...atuais].slice(0, MAX_RECENTES)));
  } catch {
    // localStorage indisponível (aba anônima, cota): a paleta funciona igual,
    // só não lembra. Não é motivo para quebrar nada.
  }
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const { goPrev, goNext, setYearMonth } = useMonth();
  const { toggleTheme } = useTheme();

  const [texto, setTexto] = useState('');
  const [debounced, setDebounced] = useState('');
  const [indice, setIndice] = useState(0);
  const listaRef = useRef<HTMLDivElement>(null);

  // Debounce: quem digita "netflix" não precisa de 7 requisições.
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(texto.trim()), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [texto]);

  // Ao abrir, começa limpo — a busca anterior não tem por que sobreviver.
  useEffect(() => {
    if (open) {
      setTexto('');
      setDebounced('');
      setIndice(0);
    }
  }, [open]);

  const acoes: Acao[] = useMemo(
    () => [
      {
        id: 'novo-gasto',
        label: 'Novo gasto',
        hint: 'Finanças',
        run: () => navigate('/financas/lancamentos?novo=gasto'),
      },
      {
        id: 'nova-receita',
        label: 'Nova receita',
        hint: 'Finanças',
        run: () => navigate('/financas/lancamentos?novo=receita'),
      },
      { id: 'ir-pendentes', label: 'Ver pendentes', hint: 'Ingestão', run: () => navigate('/financas/pendentes') },
      { id: 'ir-fixas', label: 'Ver despesas fixas', hint: 'Finanças', run: () => navigate('/financas/recorrentes') },
      { id: 'ir-investimentos', label: 'Ver investimentos', hint: 'Finanças', run: () => navigate('/financas/investimentos') },
      { id: 'ir-agenda', label: 'Abrir agenda', hint: 'Agenda', run: () => navigate('/agenda') },
      { id: 'ir-saude', label: 'Abrir saúde', hint: 'Saúde', run: () => navigate('/saude') },
      { id: 'ir-estudos', label: 'Abrir estudos', hint: 'Estudos', run: () => navigate('/estudos') },
      { id: 'mes-anterior', label: 'Mês anterior', hint: 'Navegação', run: goPrev },
      { id: 'mes-proximo', label: 'Próximo mês', hint: 'Navegação', run: goNext },
      { id: 'tema', label: 'Alternar tema', hint: 'Aparência', run: toggleTheme },
    ],
    [navigate, goPrev, goNext, toggleTheme],
  );

  const busca = useQuery({
    queryKey: ['search', debounced],
    queryFn: ({ signal }) => api.search(debounced, signal),
    // Só busca com 2+ letras, o mesmo piso do servidor.
    enabled: open && debounced.length >= 2,
    // A busca envelhece rápido: um gasto lançado agora tem que aparecer.
    staleTime: 10 * 1000,
  });

  const termo = texto.trim().toLowerCase();
  const acoesFiltradas = termo
    ? acoes.filter((a) => a.label.toLowerCase().includes(termo))
    : ordenarPorRecentes(acoes);

  const hits = debounced.length >= 2 ? busca.data?.results ?? [] : [];

  // Uma lista linear é o que as setas percorrem; os grupos são só visuais.
  const linear: ({ tipo: 'acao'; acao: Acao } | { tipo: 'hit'; hit: SearchHit })[] = [
    ...acoesFiltradas.map((acao) => ({ tipo: 'acao' as const, acao })),
    ...hits.map((hit) => ({ tipo: 'hit' as const, hit })),
  ];

  useEffect(() => {
    setIndice(0);
  }, [debounced, termo]);

  // Mantém o item destacado visível ao andar com as setas.
  useEffect(() => {
    const el = listaRef.current?.querySelector<HTMLElement>('[data-ativo="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [indice]);

  function escolher(item: (typeof linear)[number]) {
    if (item.tipo === 'acao') {
      salvarRecente(item.acao.id);
      item.acao.run();
    } else {
      // O destino de um lançamento carrega o mês dele. Sem trocar o mês
      // selecionado, clicar num gasto de agosto abria a lista de setembro e o
      // resultado simplesmente não estava lá.
      const url = new URL(item.hit.href, window.location.origin);
      const ano = Number(url.searchParams.get('year'));
      const mes = Number(url.searchParams.get('month'));
      if (Number.isInteger(ano) && Number.isInteger(mes) && mes >= 1 && mes <= 12) {
        setYearMonth(ano, mes);
      }
      navigate(url.pathname);
    }
    onOpenChange(false);
  }

  function aoDigitar(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndice((i) => Math.min(i + 1, Math.max(linear.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndice((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = linear[indice];
      if (item) escolher(item);
    }
  }

  const porTipo = agruparPorTipo(hits);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="palette-backdrop">
          <Dialog.Content className="palette" aria-describedby={undefined}>
            <Dialog.Title className="sr-only">Buscar e executar ações</Dialog.Title>

            <input
              className="palette-input"
              placeholder="Buscar lançamento, prova, matéria… ou digite uma ação"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={aoDigitar}
              // O foco fica AQUI o tempo todo: as setas movem o destaque, não
              // o foco, para dar para continuar digitando e refinar a busca.
              autoFocus
              aria-label="Buscar"
              aria-controls="palette-lista"
            />

            <div className="palette-list" id="palette-lista" ref={listaRef} role="listbox">
              {acoesFiltradas.length > 0 && (
                <>
                  <p className="palette-group">{termo ? 'Ações' : 'Ações rápidas'}</p>
                  {acoesFiltradas.map((acao) => {
                    const i = linear.findIndex((l) => l.tipo === 'acao' && l.acao.id === acao.id);
                    return (
                      <button
                        key={acao.id}
                        type="button"
                        role="option"
                        aria-selected={i === indice}
                        data-ativo={i === indice}
                        className={`palette-item${i === indice ? ' palette-item-ativo' : ''}`}
                        onMouseEnter={() => setIndice(i)}
                        onClick={() => escolher({ tipo: 'acao', acao })}
                      >
                        <span className="palette-item-label">{acao.label}</span>
                        <span className="palette-item-hint">{acao.hint}</span>
                      </button>
                    );
                  })}
                </>
              )}

              {ORDEM_TIPOS.filter((k) => porTipo.has(k)).map((kind) => (
                <div key={kind}>
                  <p className="palette-group">{ROTULO_TIPO[kind]}</p>
                  {porTipo.get(kind)!.map((hit) => {
                    const i = linear.findIndex((l) => l.tipo === 'hit' && l.hit.id === hit.id);
                    return (
                      <button
                        key={hit.id}
                        type="button"
                        role="option"
                        aria-selected={i === indice}
                        data-ativo={i === indice}
                        className={`palette-item${i === indice ? ' palette-item-ativo' : ''}`}
                        onMouseEnter={() => setIndice(i)}
                        onClick={() => escolher({ tipo: 'hit', hit })}
                      >
                        <span className="palette-item-label">{hit.title}</span>
                        <span className="palette-item-hint">{legenda(hit)}</span>
                      </button>
                    );
                  })}
                </div>
              ))}

              {busca.isError && (
                <p className="palette-vazio">
                  A busca falhou. O resto do app continua funcionando — as ações acima ainda valem.
                </p>
              )}
              {!busca.isError && debounced.length >= 2 && !busca.isPending && linear.length === 0 && (
                <p className="palette-vazio">Nada encontrado para “{debounced}”.</p>
              )}
              {busca.isPending && debounced.length >= 2 && acoesFiltradas.length === 0 && (
                <p className="palette-vazio">Buscando…</p>
              )}
            </div>

            <div className="palette-rodape">
              <span>
                <kbd>↑</kbd>
                <kbd>↓</kbd> navegar
              </span>
              <span>
                <kbd>↵</kbd> abrir
              </span>
              <span>
                <kbd>esc</kbd> fechar
              </span>
            </div>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Com a caixa vazia, o que foi usado por último sobe. */
function ordenarPorRecentes(acoes: Acao[]): Acao[] {
  const recentes = lerRecentes();
  if (recentes.length === 0) return acoes;
  return acoes.slice().sort((a, b) => {
    const ia = recentes.indexOf(a.id);
    const ib = recentes.indexOf(b.id);
    if (ia === -1 && ib === -1) return 0;
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

/**
 * Legenda da linha: categoria, data e valor. A data importa mais do que
 * parece — sem ela, cinco meses da mesma assinatura viram cinco linhas
 * idênticas e não dá para escolher qual abrir.
 */
function legenda(hit: SearchHit): string {
  const partes = [hit.subtitle, hit.date ? formatDayMonth(hit.date) : null];
  if (hit.amount !== undefined) partes.push(formatCurrency(hit.amount));
  return partes.filter(Boolean).join(' · ');
}

function agruparPorTipo(hits: SearchHit[]): Map<SearchKind, SearchHit[]> {
  const mapa = new Map<SearchKind, SearchHit[]>();
  for (const h of hits) {
    const lista = mapa.get(h.kind) ?? [];
    lista.push(h);
    mapa.set(h.kind, lista);
  }
  return mapa;
}

/**
 * Cmd/Ctrl+K de qualquer lugar. Fica fora do componente da paleta para o
 * atalho existir mesmo com ela fechada (montar a paleta só para escutar tecla
 * seria caro e desnecessário).
 */
export function useAtalhoPalette(abrir: () => void) {
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        abrir();
      }
    }
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [abrir]);
}
