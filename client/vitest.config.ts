import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Config separada do vite.config.ts de propósito: aquele carrega o plugin de
 * PWA, que tenta gerar service worker e não tem nada a ver com teste.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
