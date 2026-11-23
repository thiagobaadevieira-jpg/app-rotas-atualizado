import type {AppData, Profile} from './supabase.ts';
import {deleteMarmoraria, deleteRoute, saveCompany, saveMarmoraria, saveRoute, saveTemplates} from './supabase.ts';
import type {CompanyLocation, Marmoraria, RoutePlan, WhatsAppTemplate} from '../types.ts';
import {notifyDelivery, notifyReturn} from './webhookConfig.ts';

export type PendingChange =
  | {id: string; kind: 'saveMarmoraria'; value: Marmoraria}
  | {id: string; kind: 'deleteMarmoraria'; value: string}
  | {id: string; kind: 'saveRoute'; value: RoutePlan; previousStopIds: string[]; notifyStopId?: string; notifyAt?: string; notifyReturnAt?: string; returnDurationSec?: number}
  | {id: string; kind: 'notifyDelivery'; routeId: string; stopId: string; completedAt: string}
  | {id: string; kind: 'notifyReturn'; routeId: string; startedAt: string; remainingDurationSec?: number}
  | {id: string; kind: 'deleteRoute'; value: string}
  | {id: string; kind: 'saveTemplates'; value: WhatsAppTemplate[]}
  | {id: string; kind: 'saveCompany'; value: CompanyLocation | null};

export type WebhookDispatchStatus = {
  state: 'pending' | 'sent' | 'failed';
  updatedAt: string;
  pending: number;
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
    return status;
  } catch {return null;}
}

function writeWebhookStatus(userId: string, status: WebhookDispatchStatus): void {
  try {localStorage.setItem(webhookKeyFor(userId), JSON.stringify(status));} catch { /* storage unavailable */ }
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
  let queuedWebhook = false;
  if (change.kind === 'saveRoute' && change.notifyStopId && change.notifyAt) {
    pending.push({id: newChangeId(), kind: 'notifyDelivery', routeId: change.value.id,
      stopId: change.notifyStopId, completedAt: change.notifyAt});
    queuedWebhook = true;
  }
  if (change.kind === 'saveRoute' && change.notifyReturnAt) {
    pending.push({id: newChangeId(), kind: 'notifyReturn', routeId: change.value.id,
      startedAt: change.notifyReturnAt, remainingDurationSec: change.returnDurationSec});
    queuedWebhook = true;
  }
  writeOffline(userId, {version: 1, profile, data, pending});
  if (queuedWebhook) {
    writeWebhookStatus(userId, {
      state: 'pending',
      updatedAt: new Date().toISOString(),
      pending: pending.filter((item) => item.kind === 'notifyDelivery' || item.kind === 'notifyReturn').length,
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
    const isWebhook = first.kind === 'notifyDelivery' || first.kind === 'notifyReturn';
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
      const remainingWebhooks = latest.pending.filter((item) => item.kind === 'notifyDelivery' || item.kind === 'notifyReturn').length;
      const sent = webhookResult.sent === true && webhookResult.skipped !== true;
      writeWebhookStatus(userId, {
        state: sent && remainingWebhooks === 0 ? 'sent' : sent ? 'pending' : 'failed',
        updatedAt: new Date().toISOString(),
        pending: remainingWebhooks,
      });
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
      pending: snapshot.pending.filter((item) => item.kind === 'notifyDelivery' || item.kind === 'notifyReturn').length,
    });
    onProgress?.(snapshot.pending.length);
  }
}

export function newChangeId(): string {
  return crypto.randomUUID();
}

