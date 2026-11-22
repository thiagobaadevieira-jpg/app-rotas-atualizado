import {Edit3, ExternalLink, MapPin, Phone, Plus, Search, Share2, Trash2} from 'lucide-react';
import {useMemo, useState} from 'react';
import type {Marmoraria} from '../types.ts';
import {formatCoordinates} from '../utils/geo.ts';

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
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
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
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#f3f5f2] sm:text-2xl">
            Endereços
          </h1>
          <p className="mt-0.5 text-xs text-[#9aa59c] tabular-nums">
            {marmorarias.length}{' '}
            {marmorarias.length === 1 ? 'marmoraria cadastrada' : 'marmorarias cadastradas'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onCreateNew(true)}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#2b352c] bg-[#151a16] px-3.5 py-2 text-xs font-semibold text-[#e3e8e2] hover:border-[#ff873f]/50 hover:text-[#ff873f]"
          >
            <MapPin className="h-4 w-4 text-[#ff873f]" />
            <span className="whitespace-nowrap">Marcar no mapa</span>
          </button>

          <button
            type="button"
            onClick={() => onCreateNew(false)}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#baff27] px-4 py-2 text-xs font-bold text-[#0d100e] transition-transform active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            <span className="whitespace-nowrap">Cadastrar</span>
          </button>
        </div>
      </div>

      {shareNotice && <p role="status" className="rounded-xl border border-[#baff27]/40 bg-[#baff27]/10 px-3 py-2 text-xs text-[#baff27]">{shareNotice}</p>}

      {/* Search bar */}
      <div className="address-search-sticky -mx-4 bg-[#0d100e] px-4 py-2 sm:-mx-6 sm:px-6">
        <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[#7b877e]" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nome, cidade ou telefone..."
          className="min-h-[46px] w-full rounded-xl border border-[#262f27] bg-[#151a16] pr-4 pl-10 text-sm text-[#f3f5f2] placeholder-[#6c786e] focus:border-[#baff27] focus:outline-none"
        />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-[#242c25] bg-[#151a16] p-8 text-center">
          <p className="text-sm font-medium text-[#f3f5f2]">Nenhuma marmoraria encontrada</p>
          <p className="mt-1 text-xs text-[#9aa59c]">
            Ajuste o filtro de busca ou cadastre uma nova marmoraria.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filtered.map((m) => {
            const isActiveDest = activeDestinationMarmId === m.id;
            return (
              <article
                key={m.id}
                className={`flex flex-col justify-between rounded-2xl border p-4 ${
                  isActiveDest
                    ? 'border-[#ff873f]/60 bg-[#1b1815]'
                    : 'border-[#242c25] bg-[#151a16]'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-base font-bold text-[#f3f5f2]">{m.nome}</h2>
                    {isActiveDest ? (
                      <span className="shrink-0 text-[11px] font-bold text-[#ff873f]">
                        Destino atual
                      </span>
                    ) : (
                      m.isDemo && (
                        <span className="shrink-0 text-[11px] font-semibold text-[#ff873f]">
                          Dados de teste
                        </span>
                      )
                    )}
                  </div>
                  <p className="mt-1 text-xs text-[#9aa59c]">
                    <span>{m.cidade}</span>
                    {m.telefone && (
                      <>
                        <span aria-hidden="true"> · </span>
                        <span className="tabular-nums text-[#d5dcd4]">{m.telefone}</span>
                      </>
                    )}
                  </p>
                  <p className="mt-1.5 font-mono text-[11px] text-[#6e7b70] tabular-nums">
                    {formatCoordinates(m.lat, m.lng)}
                  </p>
                  <p className="mt-2 text-xs font-semibold text-[#baff27] tabular-nums">Coletas: {collectionCounts[m.id] || 0}</p>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-1.5 border-t border-[#222a23] pt-3 sm:gap-2">
                  <div className="flex flex-nowrap items-center gap-1.5 sm:gap-2">
                    <button
                      type="button"
                      onClick={() => setMapsTarget(m)}
                      className="inline-flex min-h-[44px] shrink-0 items-center gap-1 whitespace-nowrap rounded-xl border border-[#283129] bg-[#101411] px-2.5 text-[11px] font-semibold text-[#e3e8e2] hover:border-[#ff873f]/50 hover:text-[#ff873f] sm:gap-1.5 sm:px-3 sm:text-xs"
                    >
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-[#ff873f]" />
                      <span>Maps</span>
                      <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenWhatsApp(m)}
                      className={`inline-flex min-h-[44px] shrink-0 items-center gap-1 whitespace-nowrap rounded-xl border border-[#283129] bg-[#101411] px-2.5 text-[11px] font-semibold text-[#e3e8e2] sm:gap-1.5 sm:px-3 sm:text-xs ${m.telefone.trim() ? 'hover:border-[#baff27]/50 hover:text-[#baff27]' : 'hover:border-[#d5dcd4]/50'}`}
                    >
                      <Phone className={`h-3.5 w-3.5 shrink-0 ${m.telefone.trim() ? 'text-[#baff27]' : 'text-[#f3f5f2]'}`} />
                      <span>WhatsApp</span>
                    </button>
                  </div>

                  <div className="flex flex-nowrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void shareAddress(m)}
                      aria-label={`Compartilhar ${m.nome}`}
                      title="Compartilhar endereço"
                      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[#283129] bg-[#101411] text-[#d5dcd4] hover:border-[#baff27]/40 hover:text-[#baff27]"
                    >
                      <Share2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onEdit(m)}
                      aria-label={`Editar ${m.nome}`}
                      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[#283129] bg-[#101411] text-[#d5dcd4] hover:border-[#baff27]/40 hover:text-[#baff27]"
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>

                    {!canDelete ? null : confirmDeleteId === m.id ? (
                      <button
                        type="button"
                        onClick={() => {
                          onDelete(m.id);
                          setConfirmDeleteId(null);
                        }}
                        className="min-h-[44px] rounded-xl bg-red-600 px-3 text-xs font-bold text-white"
                      >
                        Confirmar
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(m.id)}
                        aria-label={`Excluir ${m.nome}`}
                        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[#283129] bg-[#101411] text-[#9aa59c] hover:border-red-500/40 hover:text-red-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {mapsTarget && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/75 px-4" role="presentation" onMouseDown={(event) => {if (event.target === event.currentTarget) setMapsTarget(null);}}>
          <div role="dialog" aria-modal="true" aria-labelledby="address-maps-title" className="w-full max-w-sm rounded-2xl border border-[#394539] bg-[#151a16] p-5 shadow-2xl">
            <h2 id="address-maps-title" className="text-lg font-bold text-[#f3f5f2]">Ir para este destino?</h2>
            <p className="mt-2 text-sm text-[#bdc7bd]">Ao confirmar, <strong className="text-[#baff27]">{mapsTarget.nome}</strong> será marcado como destino atual e o Google Maps será aberto.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setMapsTarget(null)} className="min-h-[44px] rounded-xl border border-[#394539] px-4 text-sm text-[#e3e8e2]">Cancelar</button>
              <a href={`https://www.google.com/maps/search/?api=1&query=${mapsTarget.lat},${mapsTarget.lng}`} target="_blank" rel="noopener noreferrer" onClick={() => {onNavigateMaps(mapsTarget); setMapsTarget(null);}} className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#ff873f] px-4 text-sm font-bold text-[#0d100e]">Confirmar e abrir Maps</a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
