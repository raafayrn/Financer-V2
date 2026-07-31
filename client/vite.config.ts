import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Em desenvolvimento, encaminha /api para o backend em localhost:4000.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Um Service Worker novo assume assim que fica pronto, sem esperar a aba
      // ser fechada — app pessoal, não tem por que segurar versão antiga.
      registerType: 'autoUpdate',
      // O manifesto passa a ser gerado aqui (o antigo em public/ foi removido
      // para não existirem dois arquivos disputando o mesmo nome).
      manifest: {
        name: 'Orbit',
        short_name: 'Orbit',
        description: 'Planner de vida pessoal: finanças, saúde e estudos.',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0f172a',
        theme_color: '#0f172a',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Só o shell do app entra no cache: HTML, JS, CSS e ícones.
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // IMPORTANTE: /api NUNCA é cacheado. Num app de dinheiro, mostrar um
        // saldo velho como se fosse o atual é pior do que mostrar a tela de
        // "sem conexão" — que o AuthContext já trata.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
          },
        ],
      },
      // Sem isso o SW não roda em `npm run dev` e só dava para testar buildando.
      devOptions: { enabled: true, type: 'module' },
    }),
  ],
  server: {
    port: Number(process.env.PORT) || 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
