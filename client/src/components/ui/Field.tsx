import type { ReactNode } from 'react';

interface Props {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}

/**
 * Envelope de campo de formulário. Os estilos de input estavam espalhados em
 * quatro blocos do CSS, com rótulos ora acima ora ao lado e sem lugar
 * previsível para a mensagem de erro.
 */
export function Field({ label, htmlFor, hint, error, children }: Props) {
  return (
    <div className={`field${error ? ' field--error' : ''}`}>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <span className="field-error" role="alert">
          {error}
        </span>
      ) : (
        hint && <span className="field-hint">{hint}</span>
      )}
    </div>
  );
}
