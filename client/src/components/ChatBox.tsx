import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api/client';
import type { ChatPreview } from '../api/types';

interface Props {
  onPreview: (preview: ChatPreview) => void;
  onPreviews: (previews: ChatPreview[]) => void;
}

type Mode = 'launch' | 'ask';

/**
 * Assistente: campo tipo chat com 3 capacidades — lançar por texto, lançar
 * por foto de comprovante/nota (pode extrair vários lançamentos de uma vez),
 * e responder perguntas sobre os dados financeiros reais do usuário. Nada é
 * salvo direto: lançamentos sempre passam por um preview de confirmação.
 */
export function ChatBox({ onPreview, onPreviews }: Props) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [mode, setMode] = useState<Mode>('launch');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .chatStatus()
      .then((s) => setEnabled(s.enabled))
      .catch(() => setEnabled(false));
  }, []);

  if (enabled === false) {
    return null; // recurso indisponível (sem chave da API no servidor)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setLoading(true);
    setMessage(null);
    setAnswer(null);
    try {
      if (mode === 'ask') {
        const result = await api.chatAsk(text.trim());
        setAnswer(result.answer);
      } else {
        const result = await api.chatParse(text.trim());
        if (result.ok) {
          onPreview(result.preview);
          setText('');
        } else {
          setMessage(result.message);
        }
      }
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Erro ao processar.');
    } finally {
      setLoading(false);
    }
  }

  async function handleImageSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite selecionar o mesmo arquivo de novo depois
    if (!file) return;

    setLoading(true);
    setMessage(null);
    setAnswer(null);
    try {
      const { base64, mimeType } = await fileToBase64(file);
      const result = await api.chatParseImage(base64, mimeType);
      if (result.ok) {
        onPreviews(result.previews);
      } else {
        setMessage(result.message);
      }
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Erro ao processar a imagem.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="chat-bar">
      <div className="chat-bar-inner">
        <form onSubmit={handleSubmit} className="chatbox-form">
          <div className="chatbox-modes">
            <button
              type="button"
              className={`chip ${mode === 'launch' ? 'chip-active' : ''}`}
              onClick={() => setMode('launch')}
            >
              Lançar
            </button>
            <button
              type="button"
              className={`chip ${mode === 'ask' ? 'chip-active' : ''}`}
              onClick={() => setMode('ask')}
            >
              Perguntar
            </button>
          </div>

          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={mode === 'ask' ? 'Sua pergunta' : 'Descreva o gasto'}
            disabled={loading || enabled === null}
            maxLength={500}
          />
          {mode === 'launch' && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleImageSelected}
                hidden
              />
              <button
                type="button"
                className="icon-btn-outline"
                title="Anexar foto de comprovante"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading || enabled === null}
              >
                📷
              </button>
            </>
          )}
          <button type="submit" className="btn-primary" disabled={loading || !text.trim()}>
            {loading ? '…' : mode === 'ask' ? 'Perguntar' : 'Interpretar'}
          </button>
        </form>

        {message && <div className="alert alert-warning chatbox-msg">{message}</div>}
        {answer && <div className="alert alert-info chatbox-msg">{answer}</div>}
      </div>
    </div>
  );
}

/** Converte um File para base64 puro (sem o prefixo data:...;base64,). */
function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.slice(result.indexOf(',') + 1);
      resolve({ base64, mimeType: file.type || 'image/jpeg' });
    };
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    reader.readAsDataURL(file);
  });
}
