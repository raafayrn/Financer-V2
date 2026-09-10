/**
 * ============================================================
 * PADRÃO DE SKELETON
 * ============================================================
 *
 * Enquanto carregava, o app inteiro sumia atrás de um spinner centralizado:
 * a tela piscava do vazio para o conteúdo e nada indicava o que estava por
 * vir. Skeleton é o contrário disso — o desenho do conteúdo aparece antes do
 * conteúdo, no lugar exato onde ele vai nascer.
 *
 * Regras deste padrão (seguir ao aplicar em telas novas):
 *
 *   1. GEOMETRIA IGUAL À REAL. A linha do skeleton tem a altura do texto que
 *      vai substituí-la, e o bloco tem a altura do card. Se a geometria não
 *      bate, o conteúdo "pula" ao chegar — que é o defeito que o skeleton
 *      existe para evitar.
 *   2. UM SKELETON POR CARD, não um por tela. Cada card tem sua própria query
 *      (ver api/queries.ts): o que já chegou é desenhado, o que falta mostra
 *      skeleton. Nenhum card espera o vizinho.
 *   3. NÃO SUBSTITUIR A MOLDURA. Título do card, botões e bordas continuam
 *      renderizados normalmente — só o miolo variável vira skeleton. A tela
 *      mantém a forma e o usuário já pode clicar no que não depende de dados.
 *   4. QUANTIDADE PLAUSÍVEL. Numa lista, mostre o número de linhas que a lista
 *      costuma ter (3 no dashboard), não uma nem vinte.
 *
 * O brilho respeita `prefers-reduced-motion`: quem pediu menos movimento no
 * sistema vê um bloco parado, com a mesma cor.
 */

interface LineProps {
  /** Largura em CSS (ex.: '60%', '120px'). Padrão: 100%. */
  width?: string;
  /** Altura em CSS. Padrão: altura de uma linha de texto normal. */
  height?: string;
  className?: string;
}

/** Linha de texto. A largura variável é o que dá aparência de frase. */
export function SkeletonLine({ width = '100%', height = '0.9rem', className }: LineProps) {
  return (
    <span
      className={`skeleton skeleton-line${className ? ` ${className}` : ''}`}
      style={{ width, height }}
    />
  );
}

/** Bloco: gráfico, barra, área de conteúdo. */
export function SkeletonBlock({ width = '100%', height = '48px', className }: LineProps) {
  return (
    <span
      className={`skeleton skeleton-block${className ? ` ${className}` : ''}`}
      style={{ width, height }}
    />
  );
}

/** Círculo: avatar, ícone de marca, anel de progresso. */
export function SkeletonCircle({ size = 26 }: { size?: number }) {
  return <span className="skeleton skeleton-circle" style={{ width: size, height: size }} />;
}

/**
 * Linha de lista no formato do app: ícone redondo à esquerda, duas linhas de
 * texto no meio, valor à direita. Cobre a maioria das listas (lançamentos,
 * eventos, provas, tarefas).
 */
export function SkeletonRow({ circle = true }: { circle?: boolean }) {
  return (
    <div className="skeleton-row">
      {circle && <SkeletonCircle />}
      <span className="skeleton-row-text">
        <SkeletonLine width="62%" />
        <SkeletonLine width="34%" height="0.72rem" />
      </span>
      <SkeletonLine width="64px" />
    </div>
  );
}

/** `count` linhas de lista. Use o tamanho típico da lista, não um chute. */
export function SkeletonRows({ count = 3, circle = true }: { count?: number; circle?: boolean }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonRow key={i} circle={circle} />
      ))}
    </>
  );
}

/**
 * Card inteiro em skeleton: cabeçalho (título + ação) e um miolo de linhas.
 * É o bloco usado nas telas que carregam a página toda de uma vez, no lugar do
 * antigo spinner centralizado.
 */
export function SkeletonCard({
  rows = 3,
  circle = true,
  head = true,
}: {
  rows?: number;
  circle?: boolean;
  head?: boolean;
}) {
  return (
    <section className="ms-card">
      {head && (
        <div className="ms-card-head">
          <SkeletonLine width="42%" height="15px" />
          <div className="ms-card-actions">
            <SkeletonLine width="72px" height="15px" />
          </div>
        </div>
      )}
      <SkeletonRows count={rows} circle={circle} />
    </section>
  );
}

/** Faixa de cartões-resumo (as "fontes" do dashboard, os totais do ano). */
export function SkeletonTiles({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={className ?? 'ms-sources'}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="ms-card ms-source">
          <SkeletonLine width="52%" height="11px" />
          <SkeletonLine width="80%" height="20px" />
          <SkeletonLine width="40%" height="11px" />
        </div>
      ))}
    </div>
  );
}
