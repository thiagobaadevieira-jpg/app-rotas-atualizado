import {Check, Search, X} from 'lucide-react';
import {useEffect, useRef, useState} from 'react';
import type {FormEvent} from 'react';
import type {Marmoraria, RoutePlan} from '../types.ts';

interface CreateRouteModalProps {
  isOpen: boolean;
  marmorarias: Marmoraria[];
  routes: RoutePlan[];
  onClose: () => void;
  onCreate: (nome: string, selectedMarmorariaIds: string[]) => void;
}

export function CreateRouteModal({
  isOpen,
  marmorarias,
  routes,
  onClose,
  onCreate,
}: CreateRouteModalProps) {
  const [nome, setNome] = useState('');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [visualViewportHeight, setVisualViewportHeight] = useState<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const today = new Date();
    const dateLabel = new Intl.DateTimeFormat('pt-BR', {day: '2-digit', month: '2-digit'}).format(today);
    const firstName = `Rota: ${dateLabel}`;
    const laterName = `Rota ${dateLabel} - Parte `;
    const parts = routes.filter((route) => {
      const created = new Date(route.createdAt);
      return !Number.isNaN(created.getTime()) && created.toDateString() === today.toDateString();
    }).map((route) => route.nome === firstName ? 1 :
      route.nome.startsWith(laterName) ? Number(route.nome.slice(laterName.length)) : 0)
      .filter((part) => Number.isInteger(part) && part > 0);
    const nextPart = Math.max(0, ...parts) + 1;
    setNome(nextPart === 1 ? firstName : `${laterName}${nextPart}`);
    setSearch('');
    setSelectedIds([]);
    setError(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const viewport = window.visualViewport;
    const updateHeight = () => setVisualViewportHeight(viewport?.height ?? window.innerHeight);
    updateHeight();
    viewport?.addEventListener('resize', updateHeight);
    viewport?.addEventListener('scroll', updateHeight);
    const focusFrame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus({preventScroll: true});
    });
    return () => {
      window.cancelAnimationFrame(focusFrame);
      viewport?.removeEventListener('resize', updateHeight);
      viewport?.removeEventListener('scroll', updateHeight);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const query = search.trim().toLocaleLowerCase('pt-BR');
  const filteredMarmorarias = marmorarias.filter((m) =>
    `${m.nome} ${m.cidade}`.toLocaleLowerCase('pt-BR').includes(query)
  );

  const toggleId = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
    searchInputRef.current?.focus({preventScroll: true});
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = nome.trim();
    if (trimmed.length < 2) {
      setError('Informe um nome para a rota.');
      return;
    }
    onCreate(trimmed, selectedIds);
    onClose();
  };

  return (
    <div className="app-modal-backdrop create-route-backdrop fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        className="create-route-dialog flex w-full max-w-lg flex-col rounded-t-3xl border border-[#283129] bg-[#141915] p-5 shadow-2xl sm:rounded-3xl"
        style={visualViewportHeight ? {height: `${Math.min(700, Math.max(320, visualViewportHeight - 8))}px`} : undefined}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-[#f3f5f2]">Criar nova rota</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-[#ff873f] hover:bg-[#ff873f]/15"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 flex min-h-0 flex-1 flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[#d5dcd4]">
              Nome da rota
            </label>
            <input
              type="text"
              value={nome}
              onChange={(e) => {
                setNome(e.target.value);
                setError(null);
              }}
              placeholder="Ex.: Entregas de terça — Vale do Itajaí"
              className="min-h-[46px] w-full rounded-xl border border-[#29332a] bg-[#0d100e] px-3.5 text-sm text-[#f3f5f2] placeholder-[#5d6b5f] focus:border-[#baff27] focus:outline-none"
            />
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <p className="mb-2 text-xs font-semibold text-[#d5dcd4]">
              Selecionar paradas iniciais <span className="font-normal text-[#7b877e]">(opcional)</span>

            </p>
            <div className="relative mb-4">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9aa59c]" />
              <input
                ref={searchInputRef}
                type="text"
                aria-label="Pesquisar marmorarias"
                placeholder="Pesquisar por nome ou cidade"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-[#29332a] bg-[#0d100e] pl-10 pr-12 text-sm text-[#f3f5f2] placeholder-[#5d6b5f] focus:border-[#baff27] focus:outline-none"
                autoFocus
              />
              {search && (
                <button
                  type="button"
                  aria-label="Limpar pesquisa"
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setSearch('');
                    searchInputRef.current?.focus({preventScroll: true});
                  }}
                  className="absolute -right-1 -top-1 z-10 flex h-[calc(100%+8px)] w-12 items-center justify-center rounded-xl border border-[#ff873f] bg-[#211a15] text-[#ff873f] hover:bg-[#302118] hover:text-[#ffad73]"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
            <ul className="flex-1 space-y-2 overflow-y-auto pr-1">
              {filteredMarmorarias.length === 0 && (
                <li className="py-5 text-center text-sm text-[#9aa59c]">Nenhuma marmoraria encontrada.</li>
              )}
              {filteredMarmorarias.map((m) => {
                const checked = selectedIds.includes(m.id);
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onPointerDown={(event) => event.preventDefault()}
                      onClick={() => toggleId(m.id)}
                      className={`flex min-h-[52px] w-full items-center justify-between gap-3 rounded-2xl border px-3.5 py-2 text-left ${
                        checked
                          ? 'border-[#baff27]/60 bg-[#182118]'
                          : 'border-[#242c25] bg-[#0d100e]'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#f3f5f2]">{m.nome}</p>
                        <p className="text-xs text-[#9aa59c]">{m.cidade}</p>
                      </div>
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border ${
                          checked
                            ? 'border-[#baff27] bg-[#baff27] text-[#0d100e]'
                            : 'border-[#3a453b]'
                        }`}
                      >
                        {checked && <Check className="h-4 w-4" />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex items-center justify-between gap-3 border-t border-[#222a23] pt-3">
            <div>
              <span className="text-xs text-[#9aa59c] tabular-nums">
                {selectedIds.length} {selectedIds.length === 1 ? 'selecionada' : 'selecionadas'}
              </span>
              {selectedIds.length > 0 && (
                <button
                  type="button"
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setSelectedIds([]);
                    searchInputRef.current?.focus({preventScroll: true});
                  }}
                  className="ml-2 min-h-[36px] text-xs font-semibold text-[#ff873f] underline"
                >
                  Desmarcar todas
                </button>
              )}
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
                type="submit"
                className="min-h-[44px] rounded-xl bg-[#baff27] px-5 text-xs font-bold text-[#0d100e]"
              >
                Criar rota
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

