import {Edit3, MapPin, MessageCircle, Plus, Search, Share2, Trash2} from 'lucide-react';
import {useMemo, useState} from 'react';
import type {Marmoraria} from '../types.ts';
import {buildSingleStopGoogleMapsUrl} from '../utils/geo.ts';

interface AddressesViewProps {
  marmorarias: Marmoraria[];
  activeDestinationMarmId?: string | null;
  onCreateNew: (openInMapMode?: boolean) => void;
  onEdit: (marmoraria: Marmoraria) => void;
  onDelete: (id: string) => void;
  canDelete?: boolean;
  onOpenWhatsApp: (marmoraria: Marmoraria) => void;
  onNavigateMaps: (marmoraria: Marmoraria) => void;
  collectionCounts: Record<string, number>;
}

export function AddressesView({
  marmorarias,
  activeDestinationMarmId = null,
  onCreateNew,
  onEdit,
  onDelete,
  canDelete = true,
  onOpenWhatsApp,
  onNavigateMaps,
  collectionCounts,
}: AddressesViewProps) {
  const [query, setQuery] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Marmoraria | null>(null);
  const [mapsTarget, setMapsTarget] = useState<Marmoraria | null>(null);
  const [shareNotice, setShareNotice] = useState<string | null>(null);

  const shareAddress = async (m: Marmoraria) => {
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${m.lat},${m.lng}`)}`;
    const message = [m.nome, m.cidade, m.telefone ? `Telefone: ${m.telefone}` : null, mapsUrl]
      .filter(Boolean).join('\n');
    setShareNotice(null);
    try {
      if (navigator.share) {
        await navigator.share({title: m.nome, text: message});
        return;
      }
      await navigator.clipboard.writeText(message);
      setShareNotice(`Endereço de ${m.nome} copiado para compartilhar.`);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      try {
        await navigator.clipboard.writeText(message);
        setShareNotice(`Endereço de ${m.nome} copiado para compartilhar.`);
      } catch {
        setShareNotice('Não foi possível compartilhar. Tente novamente.');
      }
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digitsQ = q.replace(/\D/g, '');
    if (!q) return marmorarias;
    return marmorarias.filter((m) => {
      const nameMatch = m.nome.toLowerCase().includes(q);
      const cityMatch = m.cidade.toLowerCase().includes(q);
      const phoneMatch =
        m.telefone.toLowerCase().includes(q) ||
        (digitsQ.length > 0 && m.telefone.replace(/\D/g, '').includes(digitsQ));
      return nameMatch || cityMatch || phoneMatch;
    });
  }, [marmorarias, query]);

  return (
    <div className="space-y-3 pb-20">
      <div className="address-header-sticky -mx-4 bg-[#0d100e] px-4 pt-2 pb-3 sm:-mx-6 sm:px-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#f3f5f2] sm:text-2xl">Endereços</h1>
          <p className="mt-0.5 text-xs text-[#9aa59c] tabular-nums">
            {marmorarias.length}{' '}
            {marmorarias.length === 1 ? 'marmoraria cadastrada' : 'marmorarias cadastradas'}
          </p>
        </div>

        <div className="relative mt-3">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[#7b877e]" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nome, cidade ou telefone..."
            className="min-h-[46px] w-full rounded-xl border border-[#262f27] bg-[#151a16] pr-4 pl-10 text-sm text-[#f3f5f2] placeholder-[#6c786e] focus:border-[#baff27] focus:outline-none"
          />
        </div>
      </div>

      {shareNotice && (
        <p role="status" className="rounded-xl border border-[#baff27]/40 bg-[#baff27]/10 px-3 py-2 text-xs text-[#baff27]">
          {shareNotice}
        </p>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-[#242c25] bg-[#151a16] p-8 text-center">
          <p className="text-sm font-medium text-[#f3f5f2]">Nenhuma marmoraria encontrada</p>
          <p className="mt-1 text-xs text-[#9aa59c]">Ajuste o filtro de busca ou cadastre uma nova marmoraria.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {filtered.map((m) => {
            const isActiveDest = activeDestinationMarmId === m.id;
            return (
              <article
                key={m.id}
                style={{contentVisibility: 'auto', containIntrinsicSize: '72px'}}
                className={`flex min-h-[60px] items-center gap-2 rounded-xl border px-2.5 py-1.5 ${
                  isActiveDest ? 'border-[#ff873f]/60 bg-[#1b1815]' : 'border-[#242c25] bg-[#151a16]'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <h2 className="truncate text-sm font-bold leading-tight text-[#f3f5f2]">{m.nome}</h2>
                    {isActiveDest ? (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-[#ff873f]" title="Destino atual" />
                    ) : m.isDemo ? (
                      <span className="shrink-0 text-[9px] font-semibold text-[#ff873f]">Teste</span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-[11px] leading-tight text-[#9aa59c]">{m.cidade}</p>
                  <p className="mt-1 text-[11px] font-semibold leading-tight text-[#baff27] tabular-nums">
                    Coletas: {collectionCounts[m.id] || 0}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-0.5">
                  <button type="button" onClick={() => setMapsTarget(m)} aria-label={`Abrir ${m.nome} no Maps`} title="Maps" className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[#ff873f] hover:bg-[#ff873f]/10">
                    <MapPin className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => onOpenWhatsApp(m)} aria-label={`Abrir WhatsApp de ${m.nome}`} title="WhatsApp" className={`inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-[#baff27]/10 ${m.telefone.trim() ? 'text-[#f3f5f2]' : 'text-[#7b877e]'}`}>
                    <MessageCircle className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => void shareAddress(m)} aria-label={`Compartilhar ${m.nome}`} title="Compartilhar" className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[#d5dcd4] hover:bg-[#baff27]/10 hover:text-[#baff27]">
                    <Share2 className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => onEdit(m)} aria-label={`Editar ${m.nome}`} title="Editar" className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[#d5dcd4] hover:bg-[#baff27]/10 hover:text-[#baff27]">
                    <Edit3 className="h-4 w-4" />
                  </button>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(m)}
                      aria-label={`Excluir ${m.nome}`}
                      title="Excluir"
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={() => onCreateNew(false)}
        aria-label="Cadastrar marmoraria"
        title="Cadastrar marmoraria"
        className="address-fab fixed right-4 z-30 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#baff27] text-[#0d100e] shadow-[0_10px_30px_rgba(0,0,0,0.45)] transition-transform active:scale-95"
      >
        <Plus className="h-6 w-6" />
      </button>

      {mapsTarget && (
        <div className="app-modal-backdrop fixed inset-0 z-[1000] flex items-center justify-center bg-black/75 px-4" role="presentation" onMouseDown={(event) => {if (event.target === event.currentTarget) setMapsTarget(null);}}>
          <div role="dialog" aria-modal="true" aria-labelledby="address-maps-title" className="w-full max-w-sm rounded-2xl border border-[#394539] bg-[#151a16] p-5 shadow-2xl">
            <h2 id="address-maps-title" className="text-lg font-bold text-[#f3f5f2]">Ir para este destino?</h2>
            <p className="mt-2 text-sm text-[#bdc7bd]">Ao confirmar, <strong className="text-[#baff27]">{mapsTarget.nome}</strong> será marcado como destino atual e o Google Maps será aberto.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setMapsTarget(null)} className="min-h-[44px] rounded-xl border border-[#394539] px-4 text-sm text-[#e3e8e2]">Cancelar</button>
              <a href={buildSingleStopGoogleMapsUrl(mapsTarget)} target="_blank" rel="noopener noreferrer" onClick={() => {onNavigateMaps(mapsTarget); setMapsTarget(null);}} className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#ff873f] px-4 text-sm font-bold text-[#0d100e]">Confirmar e abrir Maps</a>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div
          className="app-modal-backdrop app-modal-centered fixed inset-0 z-[1000] flex items-center justify-center bg-black/75 px-4"
          role="presentation"
          onMouseDown={(event) => {if (event.target === event.currentTarget) setDeleteTarget(null);}}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="delete-address-title" className="w-full max-w-sm rounded-2xl border border-[#394539] bg-[#151a16] p-5 shadow-2xl">
            <h2 id="delete-address-title" className="text-lg font-bold text-[#f3f5f2]">Excluir endereço?</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#bdc7bd]">
              A marmoraria <strong className="text-[#f3f5f2]">{deleteTarget.nome}</strong> será excluída permanentemente.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteTarget(null)} className="min-h-[44px] rounded-xl border border-[#394539] px-4 text-sm text-[#e3e8e2]">Cancelar</button>
              <button
                type="button"
                onClick={() => {
                  onDelete(deleteTarget.id);
                  setDeleteTarget(null);
                }}
                className="min-h-[44px] rounded-xl bg-red-600 px-4 text-sm font-bold text-white hover:bg-red-500"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
