import { registerSW } from 'virtual:pwa-register';

/**
 * Liga o Service Worker: o app abre instantâneo, funciona instalado na tela
 * inicial e não depende do Vite/nginx responder para pintar a interface.
 *
 * Os DADOS continuam vindo sempre da rede (ver runtimeCaching em
 * vite.config.ts) — sem servidor, aparece a tela de "sem conexão" em vez de
 * um saldo velho fingindo ser o atual.
 */
export function setupServiceWorker(): void {
  const update = registerSW({
    onNeedRefresh() {
      // Versão nova baixada. Como registerType é 'autoUpdate', ela já assumiu
      // o controle; basta recarregar para a tela passar a usá-la.
      if (confirm('Nova versão do Orbit disponível. Recarregar agora?')) {
        void update(true);
      }
    },
    onOfflineReady() {
      console.info('Orbit pronto para abrir offline (a interface; os dados exigem o servidor).');
    },
  });
}
