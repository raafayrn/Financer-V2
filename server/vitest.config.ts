import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./test/setup.ts'],
    // Testes de integração compartilham um único arquivo SQLite; evita
    // corrida entre arquivos de teste rodando em paralelo.
    fileParallelism: false,
  },
});
