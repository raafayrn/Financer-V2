import * as Dialog from '@radix-ui/react-dialog';
import { motion } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { springSheet } from '../lib/motion';

interface Props {
  onCancel: () => void;
  children: (close: () => void) => ReactNode;
}

const cardHidden = { opacity: 0, y: 48, scale: 0.93, filter: 'blur(4px)' };
const cardShown = { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' };
const cardLeaving = { opacity: 0, y: 24, scale: 0.97, filter: 'blur(3px)' };

/** Duração da saída, casada com o assentamento do springSheet. */
const EXIT_MS = 260;

/**
 * Wrapper de modal compartilhado, sobre @radix-ui/react-dialog.
 *
 * O visual é o mesmo de antes — mesmas classes `.modal-backdrop` e `.modal`,
 * mesma animação (bottom-sheet no mobile, morph central no desktop) com o
 * preset springSheet. O que mudou é o que faltava por baixo:
 *
 *   - `role="dialog"` com o título visível servindo de nome acessível (ver
 *     ModalTitle abaixo), e o resto da página marcado `aria-hidden` enquanto
 *     o modal está aberto;
 *   - foco preso dentro do modal, e devolvido ao elemento que o abriu;
 *   - Escape fecha, como qualquer diálogo do sistema;
 *   - clique fora fecha (antes era um onClick no backdrop com stopPropagation
 *     no conteúdo — mesmo efeito, agora sem depender de propagação);
 *   - a trava de rolagem do fundo é do Radix, que também compensa a largura da
 *     barra de rolagem. O `useEffect` que mexia em `document.body.style` saiu.
 *
 * A estrutura do DOM é a de antes de propósito: o `.modal` continua DENTRO do
 * `.modal-backdrop`, que é quem centraliza por flexbox. Fossem irmãos (o
 * arranjo mais comum com Radix), o `.modal` precisaria de posicionamento
 * próprio e o transform de centralização brigaria com o `y`/`scale` da
 * animação.
 *
 * ------------------------------------------------------------------
 * Como a saída é coordenada (e por que o timer continua aqui)
 * ------------------------------------------------------------------
 * Quem desmonta o modal é o componente pai, então ele precisa ser avisado
 * quando a animação de saída acaba. Três formas de detectar esse fim foram
 * testadas neste arquivo, e as três falharam de verdade, não em teoria:
 *
 *   1. `AnimatePresence` + `onExitComplete`: a animação de saída rodava, o
 *      callback nunca vinha;
 *   2. `onAnimationComplete` no próprio elemento: idem;
 *   3. `controls.start()` / `animate()` imperativos, esperando a promessa:
 *      as promessas ficam pendentes para sempre. Instrumentado: o log de
 *      "chamei start" saía, o de resolvido e o de rejeitado, nunca.
 *
 * O ponto em comum é o `asChild` do Radix: os elementos animados são clonados
 * pelo Slot, e o framer-motion não fecha o ciclo de vida da animação neles.
 * O que continua funcionando é o `animate` DECLARATIVO — a animação roda e é
 * visível; só não há aviso confiável de término.
 *
 * Por isso o `setTimeout` ficou. Ele mudou de papel: antes tapava um buraco
 * (quando o callback falhava, sobrava um backdrop invisível engolindo cliques
 * e a tela morria); agora ele é o próprio mecanismo, um prazo casado com a
 * duração do spring. E o pior caso ficou barato: se o prazo não batesse
 * exatamente, o efeito seria um quadro a mais ou a menos de animação, não uma
 * página travada — porque durante a saída o backdrop já não recebe clique.
 */
export function Modal({ onCancel, children }: Props) {
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  // Ref, não o estado: Escape e clique fora podem chegar no mesmo tique, e aí
  // os dois ainda leriam `leaving` como false.
  const closing = useRef(false);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Escape, clique fora e o botão de cancelar do formulário chegam todos aqui.
  function close() {
    if (closing.current) return;
    closing.current = true;
    setLeaving(true);
    timer.current = window.setTimeout(onCancel, EXIT_MS);
  }

  return (
    // `open` é fixo: o Radix só avisa a INTENÇÃO de fechar (Escape, clique
    // fora) pelo onOpenChange, e quem decide a hora de sair de cena é o
    // close(). O desmonte pelo pai é o que devolve o foco e destrava a rolagem.
    <Dialog.Root open onOpenChange={(next) => !next && void close()}>
      <Dialog.Portal>
        <Dialog.Overlay asChild>
          <motion.div
            className="modal-backdrop"
            // Saindo, o backdrop para de receber clique: nada de clicar num
            // botão que já está indo embora, nem de fechar duas vezes.
            style={{ pointerEvents: leaving ? 'none' : 'auto' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: leaving ? 0 : 1 }}
            transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
          >
            {/* aria-describedby={undefined}: estes modais são formulários, não
                têm texto descritivo — sem isso o Radix avisa no console
                procurando um <Dialog.Description>. */}
            <Dialog.Content asChild aria-describedby={undefined}>
              <motion.div
                className="modal"
                initial={cardHidden}
                animate={leaving ? cardLeaving : cardShown}
                transition={springSheet}
              >
                {children(close)}
              </motion.div>
            </Dialog.Content>
          </motion.div>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Título do modal. É o mesmo `h2.modal-title` de antes, agora também
 * registrado no Radix como o nome acessível do diálogo — o leitor de tela
 * anuncia "Novo gasto", em vez de só "diálogo".
 *
 * Um `h2` solto não serve: o Radix precisa saber qual elemento é o título para
 * apontar o `aria-labelledby` do diálogo para ele.
 */
export function ModalTitle({ children }: { children: ReactNode }) {
  return <Dialog.Title className="modal-title">{children}</Dialog.Title>;
}
