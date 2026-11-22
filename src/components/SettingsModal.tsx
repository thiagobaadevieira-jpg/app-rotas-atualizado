import {Check, MapPin, X} from 'lucide-react';
import {useEffect, useState} from 'react';
import type {FormEvent} from 'react';
import type {CompanyLocation, Coordinates} from '../types.ts';
import {loadWebhookConfig, saveWebhookConfig} from '../lib/webhookConfig.ts';
import {formatCoordinates, isGoogleMapsUrl, parseCoordinatesInput} from '../utils/geo.ts';
import {AppMap} from './AppMap.tsx';

interface SettingsModalProps {
  isOpen: boolean;
  company: CompanyLocation | null;
  canManageWebhook: boolean;
  onClose: () => void;
  onSave: (company: CompanyLocation | null) => void;
}

export function SettingsModal({isOpen, company, canManageWebhook, onClose, onSave}: SettingsModalProps) {
  const [name, setName] = useState('Empresa');
  const [coordinates, setCoordinates] = useState('');
  const [showMap, setShowMap] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookKey, setWebhookKey] = useState('');
  const [hasWebhookKey, setHasWebhookKey] = useState(false);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [webhookSaving, setWebhookSaving] = useState(false);
  const [webhookError, setWebhookError] = useState<string | null>(null);
  const [webhookSaved, setWebhookSaved] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName(company?.name || 'Empresa');
    setCoordinates(company ? formatCoordinates(company.lat, company.lng) : '');
    setShowMap(false);
    setResolving(false);
    setError(null);
    setWebhookUrl('');
    setWebhookKey('');
    setHasWebhookKey(false);
    setWebhookError(null);
    setWebhookSaved(false);
    if (!canManageWebhook) return;
    setWebhookLoading(true);
    let active = true;
    void loadWebhookConfig().then((status) => {
      if (!active) return;
      setWebhookUrl(status.url);
      setHasWebhookKey(status.hasKey);
    }).catch((cause) => {
      if (active) setWebhookError(cause instanceof Error ? cause.message : 'Não foi possível carregar o webhook.');
    }).finally(() => {if (active) setWebhookLoading(false);});
    return () => {active = false;};
  }, [isOpen, company, canManageWebhook]);

  if (!isOpen) return null;

  const handleCoordinates = async (value: string) => {
    setCoordinates(value);
    setError(null);
    if (!isGoogleMapsUrl(value) || parseCoordinatesInput(value)) return;
    setResolving(true);
    try {
      const res = await fetch('/api/maps/resolve-link', {
        method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({url: value.trim()}),
      });
      const data = await res.json() as {coordinates?: Coordinates | null};
      if (data.coordinates) setCoordinates(formatCoordinates(data.coordinates.lat, data.coordinates.lng));
      else setError('Não foi possível ler esse link. Cole as coordenadas ou marque no mapa.');
    } catch {
      setError('Não foi possível ler o link do Google Maps.');
    } finally {
      setResolving(false);
    }
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    const point = parseCoordinatesInput(coordinates);
    if (!point) {
      setError('Informe coordenadas válidas para calcular a volta à empresa.');
      return;
    }
    onSave({name: name.trim() || 'Empresa', address: company?.address || '', ...point});
    onClose();
  };

  const saveWebhook = async (event: FormEvent) => {
    event.preventDefault();
    setWebhookError(null);
    setWebhookSaved(false);
    if (!navigator.onLine) {setWebhookError('Conecte-se à internet para salvar o webhook.'); return;}
    if (!webhookUrl.trim() || (!webhookKey.trim() && !hasWebhookKey)) {
      setWebhookError('Informe a URL e a chave do webhook.');
      return;
    }
    setWebhookSaving(true);
    try {
      await saveWebhookConfig(webhookUrl.trim(), webhookKey.trim());
      setHasWebhookKey(true);
      setWebhookKey('');
      setWebhookSaved(true);
    } catch (cause) {
      setWebhookError(cause instanceof Error ? cause.message : 'Não foi possível salvar.');
    } finally {
      setWebhookSaving(false);
    }
  };

  return (
    <div className="app-modal-backdrop fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-[#283129] bg-[#141915] p-5 shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Configurações</h2>
          <button type="button" onClick={onClose} aria-label="Fechar configurações" className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-[#ff873f]"><X className="h-5 w-5" /></button>
        </div>
        <p className="mt-1 text-xs text-[#9aa59c]">O ponto da empresa será o destino final de todas as rotas.</p>
        <form onSubmit={save} className="mt-5 space-y-4">
          <div>
            <label htmlFor="company-name" className="mb-1.5 block text-xs font-semibold">Nome da empresa</label>
            <input id="company-name" value={name} onChange={(e) => setName(e.target.value)} className="min-h-[46px] w-full rounded-xl border border-[#29332a] bg-[#0d100e] px-3.5 text-sm focus:border-[#baff27] focus:outline-none" />
          </div>
          <div>
            <label htmlFor="company-coordinates" className="mb-1.5 block text-xs font-semibold">Coordenadas ou link do Google Maps</label>
            <input id="company-coordinates" value={coordinates} onChange={(e) => void handleCoordinates(e.target.value)} placeholder="-26.460149, -48.906940" className="min-h-[46px] w-full rounded-xl border border-[#29332a] bg-[#0d100e] px-3.5 font-mono text-xs focus:border-[#baff27] focus:outline-none" />
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => setShowMap((value) => !value)} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[#ff873f]/50 px-3 text-xs font-semibold text-[#ff873f]"><MapPin className="h-4 w-4" />{showMap ? 'Ocultar mapa' : 'Marcar no mapa'}</button>
            </div>
          </div>
          {showMap && <AppMap mode="pick" pickedPosition={parseCoordinatesInput(coordinates)} onPickCoordinates={(point) => setCoordinates(formatCoordinates(point.lat, point.lng))} className="h-56 w-full" />}
          {error && <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2 border-t border-[#283129] pt-4">
            {company && <button type="button" onClick={() => {onSave(null); onClose();}} className="min-h-[44px] rounded-xl px-3 text-xs text-[#ff873f]">Remover ponto</button>}
            <button type="button" onClick={onClose} className="min-h-[44px] rounded-xl border border-[#283129] px-4 text-xs">Cancelar</button>
            <button type="submit" disabled={resolving} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-[#baff27] px-4 text-xs font-bold text-[#0d100e] disabled:opacity-50"><Check className="h-4 w-4" />Salvar empresa</button>
          </div>
        </form>
        {canManageWebhook && <form onSubmit={(event) => void saveWebhook(event)} className="mt-6 space-y-4 border-t border-[#283129] pt-5">
          <div>
            <h3 className="text-sm font-bold">Avisos de entrega</h3>
            <p className="mt-1 text-xs text-[#9aa59c]">Cadastre o webhook do Cursor. A chave fica protegida no Supabase Vault.</p>
            <p className="mt-1 text-xs text-[#baff27]">Ao concluir, escolha se envia o aviso da entrega. O aviso de retorno é escolhido ao abrir o Maps da empresa.</p>
          </div>
          <div>
            <label htmlFor="delivery-webhook-url" className="mb-1.5 block text-xs font-semibold">URL do webhook</label>
            <input id="delivery-webhook-url" type="url" inputMode="url" autoComplete="off" spellCheck={false}
              value={webhookUrl} onChange={(e) => {setWebhookUrl(e.target.value); setWebhookSaved(false);}}
              placeholder="https://api2.cursor.sh/automations/webhook/..."
              disabled={webhookLoading || webhookSaving}
              className="min-h-[46px] w-full rounded-xl border border-[#29332a] bg-[#0d100e] px-3.5 text-sm focus:border-[#baff27] focus:outline-none disabled:opacity-50" />
          </div>
          <div>
            <label htmlFor="delivery-webhook-key" className="mb-1.5 block text-xs font-semibold">Chave</label>
            <input id="delivery-webhook-key" type="password" autoComplete="new-password" spellCheck={false}
              value={webhookKey} onChange={(e) => {setWebhookKey(e.target.value); setWebhookSaved(false);}}
              placeholder={hasWebhookKey ? 'Chave salva — deixe vazio para manter' : 'crsr_...'}
              disabled={webhookLoading || webhookSaving}
              className="min-h-[46px] w-full rounded-xl border border-[#29332a] bg-[#0d100e] px-3.5 text-sm focus:border-[#baff27] focus:outline-none disabled:opacity-50" />
            {hasWebhookKey && <p className="mt-1.5 text-xs text-[#9aa59c]">Chave cadastrada. Digite outra apenas para substituir.</p>}
          </div>
          <p className="text-xs text-[#9aa59c]">O servidor monta automaticamente o cabeçalho Authorization: Bearer.</p>
          {webhookError && <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">{webhookError}</p>}
          {webhookSaved && <p role="status" className="text-xs font-semibold text-[#baff27]">Webhook salvo com segurança.</p>}
          <div className="flex justify-end">
            <button type="submit" disabled={webhookLoading || webhookSaving} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[#baff27]/50 px-4 text-xs font-bold text-[#baff27] disabled:opacity-50">
              <Check className="h-4 w-4" />{webhookSaving ? 'Salvando...' : 'Salvar webhook'}
            </button>
          </div>
        </form>}
      </div>
    </div>
  );
}
