interface Props {
  points: number[];
  /** Altura em px do desenho; a largura acompanha o contêiner. */
  height?: number;
}

/**
 * Minigráfico de área com o ponto final destacado. Recebe o mesmo tratamento
 * dos outros gráficos do app: área preenchida e fim da série enfatizado, em
 * vez de uma linha solta que não diz onde a leitura mais recente está.
 */
export function Sparkline({ points, height = 48 }: Props) {
  if (points.length < 2) return null;

  const w = 200;
  const pad = 4;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const stepX = (w - pad * 2) / (points.length - 1);

  const coords = points.map((p, i) => {
    const x = pad + i * stepX;
    const y = height - pad - ((p - min) / range) * (height - pad * 2);
    return [x, y] as const;
  });

  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${coords[coords.length - 1][0].toFixed(1)},${height} L${coords[0][0].toFixed(1)},${height} Z`;
  const [lastX, lastY] = coords[coords.length - 1];

  return (
    <svg className="sparkline" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={area} className="sparkline-area" />
      <path d={line} className="sparkline-line" />
      <circle cx={lastX} cy={lastY} r={3} className="sparkline-last" />
    </svg>
  );
}
