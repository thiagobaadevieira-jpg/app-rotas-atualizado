import {cancellationEventPayload} from './cancellationNotice.ts';
import type {CancellationNotice} from './cancellationNotice.ts';
import {supabase} from './supabase.ts';

export interface WebhookConfigStatus {
  url: string;
  hasKey: boolean;
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Supabase não configurado.');
  const {data, error} = await supabase.functions.invoke('webhook-config', {body});
  if (error) {
    const response = error.context as Response | undefined;
    const detail = response && typeof response.json === 'function'
      ? await response.json().catch(() => null) as {error?: string} | null : null;
    throw new Error(detail?.error || 'Não foi possível acessar a configuração.');
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export function loadWebhookConfig() {
  return call<WebhookConfigStatus>({action: 'get'});
}

export function saveWebhookConfig(url: string, key: string) {
  return call<{saved: boolean}>({action: 'save', url, key});
}

export function notifyDelivery(routeId: string, stopId: string, completedAt: string, eventId: string) {
  return call<{sent?: boolean; skipped?: boolean}>({
    action: 'notify', routeId, stopId, completedAt, eventId,
  });
}

/**
 * Cancellations use the same `notify` request the edge function already forwards
 * for a delivery. `stopId` is the cancelled stop and `completedAt` is the
 * timestamp. The cancel event fields ride on that same body so a forward keeps
 * them. `notify_cancel` is not a supported action.
 */
function notifyCancellationRequest(
  routeId: string,
  cancelledAt: string,
  eventId: string,
  event: {
    evento: 'parada_cancelada' | 'rota_cancelada';
    event_id: string;
    ocorrido_em: string;
    rota: {id: string; nome: string};
    parada_cancelada: CancellationNotice['parada_cancelada'];
    proxima_entrega: CancellationNotice['proxima_entrega'];
    proxima_rota?: CancellationNotice['proxima_rota'];
  },
) {
  return {
    action: 'notify' as const,
    routeId,
    stopId: event.parada_cancelada?.id ?? '',
    completedAt: cancelledAt,
    eventId,
    evento: event.evento,
    event_id: event.event_id,
    ocorrido_em: event.ocorrido_em,
    rota: event.rota,
    parada_cancelada: event.parada_cancelada,
    proxima_entrega: event.proxima_entrega,
    ...(event.evento === 'rota_cancelada' ? {proxima_rota: event.proxima_rota ?? null} : {}),
  };
}

export function notifyReturn(routeId: string, startedAt: string, eventId: string, remainingDurationSec?: number) {
  return call<{sent?: boolean; skipped?: boolean}>({
    action: 'notify_return', routeId, startedAt, eventId,
    ...(remainingDurationSec == null ? {} : {remainingDurationSec: String(remainingDurationSec)}),
  });
}

export function notifyCancellation(
  routeId: string,
  cancelledAt: string,
  eventId: string,
  notice?: CancellationNotice,
) {
  if (notice?.evento === 'parada_cancelada') {
    return call<{sent?: boolean; skipped?: boolean}>(notifyCancellationRequest(routeId, cancelledAt, eventId, {
      evento: 'parada_cancelada',
      event_id: eventId,
      ocorrido_em: cancelledAt,
      rota: notice.rota?.id ? notice.rota : {id: routeId, nome: notice.rota?.nome ?? ''},
      parada_cancelada: notice.parada_cancelada,
      proxima_entrega: notice.proxima_entrega,
    }));
  }
  const event = cancellationEventPayload(notice ?? {
    rota: {id: routeId, nome: ''},
    parada_cancelada: null,
    proxima_entrega: null,
    proxima_rota: null,
  }, eventId, cancelledAt);
  return call<{sent?: boolean; skipped?: boolean}>(notifyCancellationRequest(routeId, cancelledAt, eventId, event));
}

