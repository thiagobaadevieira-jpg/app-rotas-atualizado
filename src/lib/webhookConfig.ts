import {supabase} from './supabase.ts';

export interface WebhookConfigStatus {
  url: string;
  hasKey: boolean;
}

async function call<T>(body: Record<string, string>): Promise<T> {
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

export function notifyReturn(routeId: string, startedAt: string, eventId: string, remainingDurationSec?: number) {
  return call<{sent?: boolean; skipped?: boolean}>({
    action: 'notify_return', routeId, startedAt, eventId,
    ...(remainingDurationSec == null ? {} : {remainingDurationSec: String(remainingDurationSec)}),
  });
}

