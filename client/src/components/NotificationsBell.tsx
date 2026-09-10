import * as Popover from '@radix-ui/react-popover';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { EmptyState } from './EmptyState';
import { BellIcon } from './icons';

/**
 * Sino de notificações.
 *
 * O botão existia no cabeçalho sem `onClick` — afordância falsa, igual à lupa.
 * O servidor já guardava o que tinha sido enviado (NotificationLog, criado
 * para o bot do Telegram não repetir mensagem no mesmo dia); passou a guardar
 * também o TEXTO, e é isso que aparece aqui.
 *
 * O ponto: quem não usa o Telegram nunca via essas mensagens, e quem usa
 * perdia a do dia se não olhasse o celular na hora.
 */
export function NotificationsBell() {
  const qc = useQueryClient();

  const notificacoes = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.listNotifications(),
    // O contador é o valor do sino: chega coisa por fora do app (o notificador
    // roda no servidor), então volta a buscar ao focar a aba.
    staleTime: 30 * 1000,
  });

  const marcarTodas = useMutation({
    mutationFn: () => api.markAllNotificationsRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const marcarUma = useMutation({
    mutationFn: (id: string) => api.markNotificationRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const naoLidas = notificacoes.data?.unread ?? 0;
  const itens = notificacoes.data?.notifications ?? [];

  return (
    <Popover.Root>
      <Popover.Trigger
        className="ms-icon-btn ms-bell"
        aria-label={naoLidas > 0 ? `Notificações (${naoLidas} não lidas)` : 'Notificações'}
      >
        <BellIcon />
        {naoLidas > 0 && <span className="ms-bell-badge">{naoLidas > 9 ? '9+' : naoLidas}</span>}
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content className="dropdown-menu dropdown-menu-portal ms-notif-panel" align="end" sideOffset={8}>
          <div className="ms-notif-head">
            <strong>Notificações</strong>
            {naoLidas > 0 && (
              <button
                type="button"
                className="ms-btn ms-btn-ghost"
                onClick={() => marcarTodas.mutate()}
                disabled={marcarTodas.isPending}
              >
                Marcar todas como lidas
              </button>
            )}
          </div>

          {notificacoes.isError ? (
            <div className="alert alert-error">Não foi possível carregar.</div>
          ) : itens.length === 0 ? (
            <EmptyState
              compact
              icon={<BellIcon />}
              title="Nada por aqui"
              description="Resumo do dia, lembrete de água e fechamento do mês aparecem aqui quando forem enviados."
            />
          ) : (
            <ul className="ms-notif-list">
              {itens.map((n) => (
                <li key={n.id} className={`ms-notif-item${n.read ? '' : ' ms-notif-unread'}`}>
                  <button
                    type="button"
                    className="ms-notif-button"
                    onClick={() => !n.read && marcarUma.mutate(n.id)}
                    // Já lida não é botão de nada: não finge que ainda dá para agir.
                    disabled={n.read}
                  >
                    <span className="ms-notif-title">{n.title}</span>
                    <span className="ms-notif-date">{n.date.split('-').reverse().slice(0, 2).join('/')}</span>
                    {n.body && <span className="ms-notif-body">{n.body}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
