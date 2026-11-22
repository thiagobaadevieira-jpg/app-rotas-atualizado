import {Check, Search, X} from 'lucide-react';
import {useEffect, useMemo, useState} from 'react';
import type {Marmoraria, RouteStop} from '../types.ts';

interface AddStopsModalProps {
  isOpen: boolean;
  marmorarias: Marmoraria[];
  currentStops: RouteStop[];
  routeId: string | null;
  onClose: () => void;
  onApply: (selectedMarmorariaIds: string[]) => Promise<void>;
}

export function AddStopsModal({
  isOpen,
  marmorarias,
  currentStops,
  routeId,
  onClose,
  onApply,
}: AddStopsModalProps) {
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setError(null);
    setSelectedIds(currentStops.map((s) => s.marmorariaId).filter(Boolean));
    // A seleção inicial só é lida ao abrir a janela ou trocar de rota.
    // Atualizações da rota enquanto a janela está aberta não podem desfazer escolhas.
  }, [isOpen, routeId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return marmorarias;
    return marmorarias.filter(
      (m) => m.nome.toLowerCase().includes(q) || m.cidade.toLowerCase().includes(q)
    );
  }, [marmorarias, query]);

  if (!isOpen) return null;

  const toggleId = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const applySelection = async () => {
    setSaving(true);
    setError(null);
    try {
      await onApply(selectedIds);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar as paradas.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="app-modal-backdrop fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex h-[82dvh] max-h-[88dvh] w-full max-w-lg flex-col rounded-t-3xl border border-[#283129] bg-[#141915] p-5 shadow-2xl sm:h-[620px] sm:rounded-3xl">
        <div className="flex shrink-0 items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[#f3f5f2]">Adicionar paradas</h2>
            <p className="mt-0.5 text-xs text-[#9aa59c]">
              Escolha as marmorarias cadastradas que entram nesta rota.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-[#ff873f] hover:bg-[#ff873f]/15"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative mt-4 shrink-0">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[#7b877e]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrar por nome ou cidade..."
            className="min-h-[44px] w-full rounded-xl border border-[#29332a] bg-[#0d100e] pr-4 pl-10 text-sm text-[#f3f5f2] placeholder-[#5d6b5f] focus:border-[#baff27] focus:outline-none"
          />
        </div>

        <div className="mt-3 flex-1 overflow-y-auto pr-1">
          {filtered.length === 0 ? (
            <div className="flex h-full min-h-[120px] items-center justify-center rounded-2xl border border-dashed border-[#242c25] p-6 text-center text-xs text-[#879389]">
              Nenhuma marmoraria encontrada para &ldquo;{query.trim()}&rdquo;.
            </div>
          ) : (
            <ul className="space-y-2">
              {filtered.map((m) => {
                const checked = selectedIds.includes(m.id);
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => toggleId(m.id)}
                      className={`flex min-h-[56px] w-full items-center justify-between gap-3 rounded-2xl border px-3.5 py-2.5 text-left transition-colors ${
                        checked
                          ? 'border-[#baff27]/60 bg-[#182118]'
                          : 'border-[#242c25] bg-[#0d100e] hover:border-[#344035]'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#f3f5f2]">{m.nome}</p>
                        <p className="mt-0.5 text-xs text-[#9aa59c]">
                          {m.cidade}
                          {m.isDemo && <span className="text-[#ff873f]"> · Dados de teste</span>}
                        </p>
                      </div>

                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border ${
                          checked
                            ? 'border-[#baff27] bg-[#baff27] text-[#0d100e]'
                            : 'border-[#3a453b] bg-transparent text-transparent'
                        }`}
                      >
                        <Check className="h-4 w-4" />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#222a23] pt-3">
          <div>
            <span className="text-xs text-[#9aa59c] tabular-nums">{selectedIds.length} selecionadas</span>
            {selectedIds.length > 0 && (
              <button type="button" onClick={() => setSelectedIds([])} className="ml-2 min-h-[36px] text-xs font-semibold text-[#ff873f] underline">
                Desmarcar todas
              </button>
            )}
            {error && <p role="alert" className="mt-1 max-w-[240px] text-xs text-[#ff873f]">{error}</p>}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] rounded-xl border border-[#283129] px-4 text-xs font-semibold text-[#d5dcd4]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void applySelection()}
              disabled={saving}
              className="min-h-[44px] rounded-xl bg-[#baff27] px-5 text-xs font-bold text-[#0d100e] disabled:opacity-60"
            >
              {saving ? 'Salvando...' : 'Confirmar paradas'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
