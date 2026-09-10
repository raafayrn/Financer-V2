import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  /** Nome da seção, usado na mensagem: "a Agenda não pôde ser exibida". */
  section: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * ============================================================
 * ERROS VISÍVEIS — a parte de renderização
 * ============================================================
 *
 * O app não tinha ErrorBoundary nenhum: um `undefined.map()` em qualquer card
 * derrubava a árvore inteira e deixava a tela branca, sem nem o menu para sair
 * dali.
 *
 * Este é POR SEÇÃO, de propósito, e não um global. Um erro no card de estudos
 * não tem por que apagar o dinheiro do mês: o que quebra fica contido no seu
 * pedaço, o resto da tela continua de pé e navegável.
 *
 * Erro de renderização é bug, não é falha de rede — daí a mensagem ser
 * diferente do CardError das telas (aquele fala de "não foi possível
 * carregar", que é o caso de requisição). Aqui a saída honesta é remontar a
 * seção e, se voltar a quebrar, o usuário tem o resto do app funcionando.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Sem serviço de telemetria neste app; o console é o registro que existe.
    console.error(`[${this.props.section}] quebrou ao renderizar`, error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="alert alert-error error-boundary">
        <div>
          <strong>{this.props.section} parou de responder.</strong>
          <p className="error-boundary-detail">{this.state.error.message}</p>
        </div>
        <button
          type="button"
          className="ms-btn ms-btn-ghost"
          onClick={() => this.setState({ error: null })}
        >
          Tentar de novo
        </button>
      </div>
    );
  }
}
