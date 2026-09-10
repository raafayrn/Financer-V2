import { useEffect, useState, type ReactNode } from 'react';
import { ApiError } from '../api/client';

/**
 * ============================================================
 * ERROS VISÍVEIS — a parte de mutação
 * ============================================================
 *
 * Leitura que falha aparece no próprio card (cada tela desenha o seu erro, com
 * "tentar de novo"). MUTAÇÃO que falha não tem onde aparecer: o modal já
 * fechou, a lista já voltou ao normal, e o gasto simplesmente não existe. Era
 * o pior tipo de erro do app — silencioso e com prejuízo real.
 *
 * O toast é a resposta: some sozinho quando é só informação, e fica com um
 * botão de repetir quando dá para repetir.
 *
 * O disparo NÃO passa por contexto do React. O QueryClient é criado fora da
 * árvore (main.tsx) e é ele quem intercepta todo erro de mutação num lugar só
 * — daí este barramento de módulo. Trocar por contexto obrigaria cada tela a
 * tratar erro de novo, que é exatamente o que se quer evitar.
 */

export interface Toast {
  id: number;
  message: string;
  kind: 'error' | 'info';
  /** Quando existe, o toast espera: some só depois que o usuário decidir. */
  retry?: () => void;
}

type Assinante = (t: Toast) => void;

const assinantes = new Set<Assinante>();
let proximoId = 1;

export function showToast(message: string, options: { kind?: Toast['kind']; retry?: () => void } = {}) {
  const toast: Toast = {
    id: proximoId++,
    message,
    kind: options.kind ?? 'error',
    retry: options.retry,
  };
  assinantes.forEach((fn) => fn(toast));
}

/**
 * Uma falha, três causas, três conversas diferentes. Tratar as três como
 * "erro ao salvar" faz o usuário tentar de novo quando não adianta, e desistir
 * quando bastava repetir.
 */
export function mensagemDeErro(error: unknown): string {
  if (error instanceof ApiError) {
    // status 0 = o fetch nem saiu: rede, servidor fora do ar, Wi-Fi caindo.
    if (error.status === 0) return 'Sem conexão com o servidor. Nada foi salvo.';
    if (error.status === 401 || error.status === 403) {
      return 'Sua sessão expirou. Recarregue a página.';
    }
    // 4xx é erro do pedido: a mensagem do servidor é específica e útil
    // ("Valor deve ser maior que zero"), então ela vai inteira.
    if (error.status >= 400 && error.status < 500) return error.message;
    if (error.status >= 500) return 'O servidor falhou ao processar. Pode tentar de novo.';
  }
  return 'Algo deu errado.';
}

/** Erro que não melhora repetindo não ganha botão de repetir. */
export function podeRepetir(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  return error.status === 0 || error.status >= 500;
}

const DURACAO_MS = 6000;

export function ToastHost({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const assinante: Assinante = (t) => setToasts((prev) => [...prev, t]);
    assinantes.add(assinante);
    return () => {
      assinantes.delete(assinante);
    };
  }, []);

  function dispensar(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <>
      {children}
      <div className="toast-host" role="status" aria-live="polite">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dispensar(t.id)} />
        ))}
      </div>
    </>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    // Toast com ação não some sozinho: sumir levaria embora a única chance de
    // repetir o que falhou.
    if (toast.retry) return;
    const timer = window.setTimeout(onDismiss, DURACAO_MS);
    return () => window.clearTimeout(timer);
  }, [toast.retry, onDismiss]);

  return (
    <div className={`toast toast-${toast.kind}`}>
      <span className="toast-message">{toast.message}</span>
      {toast.retry && (
        <button
          type="button"
          className="ms-btn ms-btn-ghost toast-action"
          onClick={() => {
            toast.retry?.();
            onDismiss();
          }}
        >
          Tentar de novo
        </button>
      )}
      <button type="button" className="toast-close" aria-label="Fechar aviso" onClick={onDismiss}>
        ×
      </button>
    </div>
  );
}
