import type { Transition } from 'framer-motion';

/**
 * Presets de spring física (massa/rigidez/amortecimento) inspirados no HIG da
 * Apple — nada de easing linear/ease-in-out. Cada preset é reutilizado nos
 * mesmos contextos em todo o app para manter a "personalidade" do movimento
 * consistente (o mesmo componente sempre se move do mesmo jeito).
 */

/** Toques em botões, chips, ícones — resposta imediata e curta. */
export const springTap: Transition = { type: 'spring', mass: 0.4, stiffness: 500, damping: 30 };

/** Abrir/fechar modais, painéis, dropdowns — chega rápido, sem overshoot. */
export const springSheet: Transition = { type: 'spring', mass: 0.6, stiffness: 380, damping: 34 };

/** Elementos com um leve "bounce" de destaque (cards, badges, confirmações). */
export const springBouncy: Transition = { type: 'spring', mass: 0.7, stiffness: 340, damping: 18 };

/** Transições de página, listas, valores numéricos — suave e contínua. */
export const springSmooth: Transition = { type: 'spring', mass: 0.8, stiffness: 260, damping: 30 };

/** Barras de progresso e preenchimentos — mais lenta, sem oscilar. */
export const springFill: Transition = { type: 'spring', mass: 1, stiffness: 120, damping: 22 };

/** Escala usada no `whileTap` de elementos pressionáveis. */
export const tapScale = { scale: 0.97 };
export const tapScaleSmall = { scale: 0.94 };
