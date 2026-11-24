import type {AppData, Profile} from './supabase.ts';
import {deleteMarmoraria, deleteRoute, saveCompany, saveMarmoraria, saveRoute, saveTemplates} from './supabase.ts';
import type {CompanyLocation, Marmoraria, RoutePlan, WhatsAppTemplate} from '../types.ts';
import type {CancellationNotice} from './cancellationNotice.ts';
import {notifyCancellation, notifyDelivery, notifyReturn} from './webhookConfig.ts';

export type PendingChange =
  | {id: string; kind: 'saveMarmoraria'; value: Marmoraria}
  | {id: string; kind: 'deleteMarmoraria'; value: string}
  | {id: string; kind: 'saveRoute'; value: RoutePlan; previousStopIds: string[]; notifyStopId?: string; notifyAt?: string; notifyReturnAt?: string; returnDurationSec?: number; notifyCancellationAt?: string; cancellationNotice?: CancellationNotice}
  | {id: string; kind: 'notifyDelivery'; routeId: string; stopId: string; completedAt: string}
  | {id: string; kind: 'notifyReturn'; routeId: string; startedAt: string; remainingDurationSec?: number}
  | {id: string; kind: 'notifyCancellation'; routeId: string; cancelledAt: string; notice?: CancellationNotice}
  | {id: string; kind: 'deleteRoute'; value: string}
  | {id: string; kind: 'saveTemplates'; value: WhatsAppTemplate[]}
  | {id: string; kind: 'saveCompany'; value: CompanyLocation | null};

export type WebhookDispatchStatus = {
  state: 'pending' | 'sent' | 'failed';
  updatedAt: string;
  pending: number;
  history: WebhookHistoryItem[];
};

export type WebhookHistoryItem = {
  eventId: string;
  kind: 'delivery' | 'return' | 'cancellation';
  routeId: string;
  routeName: string;
  targetName: string;
  eventLabel?: string;
  occurredAt: string;
  state: 'pending' | 'sent' | 'failed';
  updatedAt: string;
};

type WebhookDispatchResult = {sent?: boolean; skipped?: boolean};

interface OfflineSnapshot {
  version: 1;
  profile: Profile;
  data: AppData;
  pending: PendingChange[];
}

const lastUserKey = 'ri_last_authenticated_user_v1';
const keyFor = (userId: string) => `ri_offline_v1:${userId}`;
const webhookKeyFor = (userId: string) => `ri_webhook_status_v1:${userId}`;

export function readWebhookStatus(userId: string): WebhookDispatchStatus | null {
  try {
    const raw = localStorage.getItem(webhookKeyFor(userId));
    if (!raw) return null;
    const status = JSON.parse(raw) as WebhookDispatchStatus;
    if (!['pending', 'sent', 'failed'].includes(status.state)) return null;
    return {...status, history: Array.isArray(status.history) ? status.history.slice(0, 5) : []};
  } catch {return null;}
}

function writeWebhookStatus(userId: string, status: WebhookDispatchStatus): void {
  try {
    localStorage.setItem(webhookKeyFor(userId), JSON.stringify({...status, history: status.history.slice(0, 5)}));
  } catch { /* storage unavailable */ }
}

function updateWebhookEventState(
  userId: string,
  eventId: string,
  eventState: WebhookHistoryItem['state'],
  overallState: WebhookDispatchStatus['state'],
  pending: number,
): void {
  const current = readWebhookStatus(userId);
  const updatedAt = new Date().toISOString();
  writeWebhookStatus(userId, {
    state: overallState,
    updatedAt,
    pending,
    history: (current?.history || []).map((item) =>
      item.eventId === eventId ? {...item, state: eventState, updatedAt} : item
    ),
  });
}

export function lastOfflineUser(): string | null {
  try {return localStorage.getItem(lastUserKey);} catch {return null;}
}

export function clearLastOfflineUser(): void {
  try {localStorage.removeItem(lastUserKey);} catch { /* storage unavailable */ }
}

export function readOffline(userId: string): OfflineSnapshot | null {
  try {
    const raw = localStorage.getItem(keyFor(userId));
    if (!raw) return null;
    const snapshot = JSON.parse(raw) as OfflineSnapshot;
    if (snapshot.version !== 1 || snapshot.profile.id !== userId || !Array.isArray(snapshot.pending)) return null;
    return snapshot;
  } catch {return null;}
}

function writeOffline(userId: string, snapshot: OfflineSnapshot): void {
  // Saving data and the pending operation together prevents an offline edit from being lost on reload.
  localStorage.setItem(keyFor(userId), JSON.stringify(snapshot));
  localStorage.setItem(lastUserKey, userId);
}

export function cacheData(userId: string, profile: Profile, data: AppData): number {
  const pending = readOffline(userId)?.pending || [];
  writeOffline(userId, {version: 1, profile, data, pending});
  return pending.length;
}

export function queueChange(userId: string, profile: Profile, data: AppData,
  change: PendingChange): number {
  const pending = [...(readOffline(userId)?.pending || []), change];
  const queuedEvents: WebhookHistoryItem[] = [];
  if (change.kind === 'saveRoute' && change.notifyStopId && change.notifyAt) {
    const eventId = newChangeId();
    pending.push({id: eventId, kind: 'notifyDelivery', routeId: change.value.id,
      stopId: change.notifyStopId, completedAt: change.notifyAt});
    const stop = change.value.stops.find((item) => item.stopId === change.notifyStopId);
    queuedEvents.push({
      eventId,
      kind: 'delivery',
      routeId: change.value.id,
      routeName: change.value.nome,
      targetName: stop?.nome || 'Parada concluída',
      occurredAt: change.notifyAt,
      state: 'pending',
      updatedAt: new Date().toISOString(),
    });
  }
  if (change.kind === 'saveRoute' && change.notifyReturnAt) {
    const eventId = newChangeId();
    pending.push({id: eventId, kind: 'notifyReturn', routeId: change.value.id,
      startedAt: change.notifyReturnAt, remainingDurationSec: change.returnDurationSec});
    queuedEvents.push({
      eventId,
      kind: 'return',
      routeId: change.value.id,
      routeName: change.value.nome,
      targetName: data.company?.name ? `Retorno à ${data.company.name}` : 'Retorno à empresa',
      occurredAt: change.notifyReturnAt,
      state: 'pending',
      updatedAt: new Date().toISOString(),
    });
  }
  if (change.kind === 'saveRoute' && change.notifyCancellationAt) {
    const eventId = newChangeId();
    pending.push({id: eventId, kind: 'notifyCancellation', routeId: change.value.id,
      cancelledAt: change.notifyCancellationAt, notice: change.cancellationNotice});
    const stopNotice = change.cancellationNotice?.evento === 'parada_cancelada'
      ? change.cancellationNotice.parada_cancelada : null;
    queuedEvents.push({
      eventId,
      kind: 'cancellation',
      routeId: change.value.id,
      routeName: change.value.nome,
      targetName: stopNotice ? `Cancelamento de ${stopNotice.nome}` : `Cancelamento de ${change.value.nome}`,
      eventLabel: stopNotice ? 'Parada cancelada' : undefined,
      occurredAt: change.notifyCancellationAt,
      state: 'pending',
      updatedAt: new Date().toISOString(),
    });
  }
  writeOffline(userId, {version: 1, profile, data, pending});
  if (queuedEvents.length > 0) {
    const previous = readWebhookStatus(userId);
    writeWebhookStatus(userId, {
      state: 'pending',
      updatedAt: new Date().toISOString(),
      pending: pending.filter((item) => item.kind === 'notifyDelivery' || item.kind === 'notifyReturn' || item.kind === 'notifyCancellation').length,
      history: [...queuedEvents].reverse().concat(previous?.history || []).slice(0, 5),
    });
  }
  return pending.length;
}

async function applyChange(change: PendingChange): Promise<void | WebhookDispatchResult> {
  switch (change.kind) {
    case 'saveMarmoraria': return saveMarmoraria(change.value);
    case 'deleteMarmoraria': return deleteMarmoraria(change.value);
    case 'saveRoute': return saveRoute(change.value, change.previousStopIds);
    case 'notifyDelivery': return notifyDelivery(change.routeId, change.stopId, change.completedAt, change.id);
    case 'notifyReturn': return notifyReturn(change.routeId, change.startedAt, change.id, change.remainingDurationSec);
    case 'notifyCancellation': return notifyCancellation(change.routeId, change.cancelledAt, change.id, change.notice);
    case 'deleteRoute': return deleteRoute(change.value);
    case 'saveTemplates': return saveTemplates(change.value);
    case 'saveCompany': return saveCompany(change.value);
  }
}

export async function flushChanges(userId: string, onProgress?: (remaining: number) => void): Promise<void> {
  const deferredNotices: PendingChange[] = [];
  while (true) {
    const snapshot = readOffline(userId);
    const first = snapshot?.pending[0];
    if (!first) break;
    const isWebhook = first.kind === 'notifyDelivery' || first.kind === 'notifyReturn' || first.kind === 'notifyCancellation';
    let webhookResult: WebhookDispatchResult | null = null;
    try {
      const result = await applyChange(first);
      if (isWebhook) webhookResult = result || {};
    } catch (error) {
      if (!isWebhook) throw error;
      deferredNotices.push(first);
    }
    const latest = readOffline(userId);
    if (!latest) throw new Error('A cópia local dos dados foi removida durante a sincronização.');
    latest.pending = latest.pending.filter((item) => item.id !== first.id);
    writeOffline(userId, latest);
    if (isWebhook && webhookResult) {
      const remainingWebhooks = latest.pending.filter((item) => item.kind === 'notifyDelivery' || item.kind === 'notifyReturn' || item.kind === 'notifyCancellation').length;
      const sent = webhookResult.sent === true && webhookResult.skipped !== true;
      writeWebhookStatus(userId, {
        state: sent && remainingWebhooks === 0 ? 'sent' : sent ? 'pending' : 'failed',
        updatedAt: new Date().toISOString(),
        pending: remainingWebhooks,
        history: readWebhookStatus(userId)?.history || [],
      });
      updateWebhookEventState(
        userId,
        first.id,
        sent ? 'sent' : 'failed',
        sent && remainingWebhooks === 0 ? 'sent' : sent ? 'pending' : 'failed',
        remainingWebhooks,
      );
    }
    onProgress?.(latest.pending.length);
  }
  if (deferredNotices.length) {
    const snapshot = readOffline(userId);
    if (!snapshot) throw new Error('A cópia local foi removida durante a sincronização.');
    snapshot.pending.push(...deferredNotices);
    writeOffline(userId, snapshot);
    writeWebhookStatus(userId, {
      state: 'failed',
      updatedAt: new Date().toISOString(),
      pending: snapshot.pending.filter((item) => item.kind === 'notifyDelivery' || item.kind === 'notifyReturn' || item.kind === 'notifyCancellation').length,
      history: readWebhookStatus(userId)?.history || [],
    });
    const pendingWebhooks = snapshot.pending.filter((item) => item.kind === 'notifyDelivery' || item.kind === 'notifyReturn' || item.kind === 'notifyCancellation').length;
    deferredNotices.forEach((notice) => {
      updateWebhookEventState(userId, notice.id, 'failed', 'failed', pendingWebhooks);
    });
    onProgress?.(snapshot.pending.length);
  }
}

export function newChangeId(): string {
  return crypto.randomUUID();
}

