import {getArrivedStopId} from '../types.ts';
import type {RoutePlan, RouteStop} from '../types.ts';

/** Stop summary sent as `parada_cancelada` and `proxima_entrega`. */
export interface WebhookEntrega {
  id: string;
  nome: string;
  cidade: string;
  telefone: string;
}

export interface CancellationNotice {
  rota: {id: string; nome: string};
  parada_cancelada: WebhookEntrega | null;
  proxima_entrega: WebhookEntrega | null;
  proxima_rota: {id: string; nome: string} | null;
}

export interface CancellationEventPayload extends CancellationNotice {
  evento: 'rota_cancelada';
  event_id: string;
  ocorrido_em: string;
}

function entrega(stop: RouteStop | null | undefined): WebhookEntrega | null {
  if (!stop) return null;
  return {id: stop.stopId, nome: stop.nome, cidade: stop.cidade, telefone: stop.telefone};
}

function firstPending(route: RoutePlan): RouteStop | null {
  return route.stops.find((stop) => stop.status === 'pendente') || null;
}

/**
 * The cancelled client is the stop in progress, or the first pending stop.
 * The next destination is the first pending stop of another open route.
 * Stops left on the cancelled route are not the next destination.
 */
export function buildCancellationNotice(route: RoutePlan, routes: RoutePlan[]): CancellationNotice {
  const pending = route.stops.filter((stop) => stop.status === 'pendente');
  const arrivedId = getArrivedStopId(route.currentDestinationStopId);
  const current = route.stops.find((stop) =>
    stop.status === 'pendente'
    && (stop.stopId === route.currentDestinationStopId || stop.stopId === arrivedId)
  ) || pending[0] || null;

  const nextRoute = routes
    .filter((item) => item.id !== route.id && item.status !== 'finalizada' && firstPending(item))
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))[0] || null;

  return {
    rota: {id: route.id, nome: route.nome},
    parada_cancelada: entrega(current),
    proxima_entrega: entrega(nextRoute ? firstPending(nextRoute) : null),
    proxima_rota: nextRoute ? {id: nextRoute.id, nome: nextRoute.nome} : null,
  };
}

export function cancellationEventPayload(
  notice: CancellationNotice,
  eventId: string,
  occurredAt: string,
): CancellationEventPayload {
  return {
    evento: 'rota_cancelada',
    event_id: eventId,
    ocorrido_em: occurredAt,
    rota: notice.rota,
    parada_cancelada: notice.parada_cancelada,
    proxima_entrega: notice.proxima_entrega,
    proxima_rota: notice.proxima_rota,
  };
}
