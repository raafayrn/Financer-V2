import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api/client';
import type { ChatIncomePreview, ChatPreview } from '../api/types';
import { formatCurrency } from '../utils/format';
import { springBouncy, springSheet, springTap } from '../lib/motion';

interface Props {
  onSaved: () => void;
  onPreviews: (previews: ChatPreview[]) => void;
}

type MessageRole = 'user' | 'assistant';

interface TextMessage {
  kind: 'text';
  role: MessageRole;
  text: string;
}

interface ExpenseCard {
  kind: 'expense-card';
  role: 'assistant';
  preview: ChatPreview;
  saved?: boolean;
}

interface IncomeCard {
  kind: 'income-card';
  role: 'assistant';
  preview: ChatIncomePreview;
  saved?: boolean;
}

type ChatMessage = TextMessage | ExpenseCard | IncomeCard;

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4H6.5A2.5 2.5 0 0 1 4 13.5v-8Z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function PaperclipIcon() {
  return (
    <svg viewBox="0 0 24 24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 12.5V7a4 4 0 1 1 8 0v9a2.5 2.5 0 0 1-5 0V8.5" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12 20 4l-6.5 16-2.5-7L4 12Z" />
    </svg>
  );
}

export function ChatBox({ onSaved, onPreviews }: Props) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.chatStatus()
      .then((s) => setEnabled(s.enabled))
      .catch(() => setEnabled(false));
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      inputRef.current?.focus();
    }
  }, [open, messages]);

  if (enabled === false) return null;

  function addMessage(msg: ChatMessage) {
    setMessages((prev) => [...prev, msg]);
  }

  function markSaved(index: number) {
    setMessages((prev) =>
      prev.map((m, i) =>
        i === index && (m.kind === 'expense-card' || m.kind === 'income-card')
          ? { ...m, saved: true }
          : m,
      ),
    );
  }

  async function handleConfirmExpense(preview: ChatPreview, index: number) {
    try {
      await api.createExpense({
        description: preview.description,
        amount: preview.amount,
        date: preview.date,
        categoryId: preview.categoryId ?? null,
        accountId: null,
        recurring: preview.recurring,
      });
      markSaved(index);
      addMessage({ kind: 'text', role: 'assistant', text: '✅ Despesa lançada com sucesso!' });
      onSaved();
    } catch (err) {
      addMessage({
        kind: 'text',
        role: 'assistant',
        text: err instanceof ApiError ? err.message : 'Erro ao salvar a despesa.',
      });
    }
  }

  async function handleConfirmIncome(preview: ChatIncomePreview, index: number) {
    try {
      await api.createIncome({
        description: preview.description,
        amount: preview.amount,
        date: preview.date,
        accountId: null,
      });
      markSaved(index);
      addMessage({ kind: 'text', role: 'assistant', text: '✅ Receita lançada com sucesso!' });
      onSaved();
    } catch (err) {
      addMessage({
        kind: 'text',
        role: 'assistant',
        text: err instanceof ApiError ? err.message : 'Erro ao salvar a receita.',
      });
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setText('');
    addMessage({ kind: 'text', role: 'user', text: trimmed });
    setLoading(true);

    try {
      const result = await api.chatMessage(trimmed);

      if (!result.ok) {
        addMessage({ kind: 'text', role: 'assistant', text: result.message });
        return;
      }

      if (result.intent === 'pergunta') {
        addMessage({ kind: 'text', role: 'assistant', text: result.answer });
        return;
      }

      if (result.intent === 'despesa') {
        addMessage({ kind: 'expense-card', role: 'assistant', preview: result.preview });
        return;
      }

      if (result.intent === 'receita') {
        addMessage({ kind: 'income-card', role: 'assistant', preview: result.incomePreview });
        return;
      }
    } catch (err) {
      addMessage({
        kind: 'text',
        role: 'assistant',
        text: err instanceof ApiError ? err.message : 'Erro ao processar.',
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const icon = file.type.startsWith('image/') ? '📷' : '📎';
    addMessage({ kind: 'text', role: 'user', text: `${icon} ${file.name}` });
    setLoading(true);

    try {
      const { base64 } = await fileToBase64(file);
      const result = await api.chatParseFile(base64, file.type, file.name);
      if (result.ok) {
        addMessage({
          kind: 'text',
          role: 'assistant',
          text: `Encontrei ${result.previews.length} lançamento(s) no arquivo. Abrindo para confirmação...`,
        });
        onPreviews(result.previews);
        setOpen(false);
      } else {
        addMessage({ kind: 'text', role: 'assistant', text: result.message });
      }
    } catch (err) {
      addMessage({
        kind: 'text',
        role: 'assistant',
        text: err instanceof ApiError ? err.message : 'Erro ao processar o arquivo.',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <motion.button
        className="chat-fab"
        onClick={() => setOpen((o) => !o)}
        title="Assistente financeiro"
        aria-label="Abrir assistente"
        whileTap={{ scale: 0.9 }}
        transition={springTap}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={open ? 'close' : 'chat'}
            initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            exit={{ rotate: 90, opacity: 0, scale: 0.6 }}
            transition={springTap}
            style={{ display: 'flex' }}
          >
            {open ? <CloseIcon /> : <ChatIcon />}
          </motion.span>
        </AnimatePresence>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="chat-panel"
            style={{ transformOrigin: 'bottom right' }}
            initial={{ opacity: 0, scale: 0.4, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.4, y: 30 }}
            transition={springSheet}
          >
          <div className="chat-panel-header">
            <span className="chat-panel-title">Assistente</span>
            <span className="chat-panel-hint">Gasto, receita ou pergunta</span>
          </div>

          <div className="chat-messages">
            {messages.length === 0 && (
              <div className="chat-empty">
                Exemplos:<br />
                <em>"gastei 50 no mercado"</em><br />
                <em>"vendi 3 monsters a 11 reais"</em><br />
                <em>"quanto gastei esse mês?"</em>
              </div>
            )}
            <AnimatePresence initial={false}>
            {messages.map((msg, i) => (
              <motion.div
                key={i}
                className={`chat-bubble-wrap ${msg.role}`}
                layout
                initial={{ opacity: 0, y: 14, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={springBouncy}
              >
                {msg.kind === 'text' && (
                  <div className={`chat-bubble ${msg.role}`}>{msg.text}</div>
                )}
                {msg.kind === 'expense-card' && (
                  <div className="chat-card">
                    <div className="chat-card-label">Despesa detectada</div>
                    <div className="chat-card-desc">{msg.preview.description}</div>
                    <div className="chat-card-amount">{formatCurrency(msg.preview.amount)}</div>
                    <div className="chat-card-meta">{msg.preview.date}</div>
                    {msg.preview.suggestedCategoryName && (
                      <div className="chat-card-cat">Categoria: {msg.preview.suggestedCategoryName}</div>
                    )}
                    {msg.saved ? (
                      <div className="chat-card-saved">Lançado ✓</div>
                    ) : (
                      <button
                        className="btn-primary btn-sm chat-card-btn"
                        onClick={() => handleConfirmExpense(msg.preview, i)}
                      >
                        Confirmar e lançar
                      </button>
                    )}
                  </div>
                )}
                {msg.kind === 'income-card' && (
                  <div className="chat-card chat-card-income">
                    <div className="chat-card-label">Receita detectada</div>
                    <div className="chat-card-desc">{msg.preview.description}</div>
                    <div className="chat-card-amount">{formatCurrency(msg.preview.amount)}</div>
                    <div className="chat-card-meta">{msg.preview.date}</div>
                    {msg.saved ? (
                      <div className="chat-card-saved">Lançado ✓</div>
                    ) : (
                      <button
                        className="btn-primary btn-sm chat-card-btn"
                        onClick={() => handleConfirmIncome(msg.preview, i)}
                      >
                        Confirmar e lançar
                      </button>
                    )}
                  </div>
                )}
              </motion.div>
            ))}
            {loading && (
              <motion.div
                className="chat-bubble-wrap assistant"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={springTap}
              >
                <div className="chat-bubble assistant chat-typing">
                  <span /><span /><span />
                </div>
              </motion.div>
            )}
            </AnimatePresence>
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSubmit} className="chat-input-row">
            <input
              ref={inputRef}
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Digite aqui..."
              disabled={loading || enabled === null}
              maxLength={1000}
              className="chat-input"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf,.pdf,.csv,text/csv,.ofx,application/x-ofx"
              onChange={handleFileSelected}
              hidden
            />
            <button
              type="button"
              className="icon-btn-outline"
              title="Anexar foto, PDF, CSV ou OFX"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading || enabled === null}
            >
              <PaperclipIcon />
            </button>
            <button type="submit" className="btn-primary btn-sm" disabled={loading || !text.trim()}>
              <SendIcon />
            </button>
          </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

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
