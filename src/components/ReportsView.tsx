import {BarChart3, MapPinned, PackageCheck} from 'lucide-react';
import {useMemo, useState} from 'react';
import type {RouteCollection} from '../utils/collections.ts';
import type {RouteDistance} from '../hooks/useRouteDistances.ts';
import type {Marmoraria, RoutePlan} from '../types.ts';
import {formatDistancePt} from '../utils/geo.ts';

type Period = 'today' | 'week' | 'month' | 'all';

const periods: Array<{id: Period; label: string}> = [
  {id: 'today', label: 'Hoje'},
  {id: 'week', label: '7 dias'},
  {id: 'month', label: '30 dias'},
  {id: 'all', label: 'Todo período'},
];

export function ReportsView({collections, marmorarias, routes, distances, distancesLoading}: {
  collections: RouteCollection[];
  marmorarias: Marmoraria[];
  routes: RoutePlan[];
  distances: Record<string, RouteDistance>;
  distancesLoading: boolean;
}) {
  const [period, setPeriod] = useState<Period>('month');
  const {total, ranking} = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    if (period === 'today') start.setHours(0, 0, 0, 0);
    if (period === 'week') start.setDate(start.getDate() - 7);
    if (period === 'month') start.setDate(start.getDate() - 30);
    const filtered = collections.filter((record) =>
      period === 'all' || new Date(record.routeCreatedAt) >= start
    );
    const counts = new Map<string, number>();
    filtered.forEach((record) => counts.set(record.marmorariaId, (counts.get(record.marmorariaId) || 0) + 1));
    return {
      total: filtered.length,
      ranking: marmorarias.map((m) => ({m, count: counts.get(m.id) || 0}))
        .filter((item) => item.count > 0)
        .sort((a, b) => b.count - a.count || a.m.nome.localeCompare(b.m.nome, 'pt-BR'))
        .slice(0, 10),
    };
  }, [collections, marmorarias, period]);
  const totalMeters = routes.reduce((sum, route) => sum + (distances[route.id]?.meters || 0), 0);
  const hasEstimate = routes.some((route) => distances[route.id]?.estimated);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-[#f3f5f2] sm:text-2xl">Relatórios</h1>
        <p className="mt-1 text-xs text-[#9aa59c]">Acompanhe coletas e distâncias das rotas cadastradas.</p>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Período das coletas">
        {periods.map((option) => (
          <button key={option.id} type="button" onClick={() => setPeriod(option.id)}
            aria-pressed={period === option.id}
            className={`min-h-[40px] rounded-xl border px-3 text-xs font-semibold ${period === option.id ? 'border-[#baff27] bg-[#baff27]/15 text-[#baff27]' : 'border-[#29332a] bg-[#151a16] text-[#a4aea5]'}`}>
            {option.label}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-[#29332a] bg-[#151a16] p-4">
          <PackageCheck className="h-5 w-5 text-[#baff27]" />
          <p className="mt-3 text-xs text-[#9aa59c]">Coletas no período</p>
          <p className="text-2xl font-bold tabular-nums">{total}</p>
        </div>
        <div className="rounded-2xl border border-[#29332a] bg-[#151a16] p-4">
          <MapPinned className="h-5 w-5 text-[#ff873f]" />
          <p className="mt-3 text-xs text-[#9aa59c]">Km planejados nas rotas</p>
          <p className="text-2xl font-bold tabular-nums">{distancesLoading ? 'Calculando...' : formatDistancePt(totalMeters)}</p>
        </div>
      </div>
      <p className="text-[11px] leading-relaxed text-[#849186]">
        Km das rotas cadastradas: da empresa até as paradas e de volta à empresa.
        {hasEstimate && ' Alguns trechos usam distância estimada quando o serviço de rotas está indisponível.'}
      </p>
      <section className="rounded-2xl border border-[#29332a] bg-[#151a16] p-4">
        <h2 className="flex items-center gap-2 text-sm font-bold"><BarChart3 className="h-4 w-4 text-[#baff27]" />Top 10 marmorarias com mais coletas</h2>
        {ranking.length === 0 ? (
          <p className="mt-4 text-sm text-[#9aa59c]">Nenhuma coleta registrada neste período.</p>
        ) : (
          <ol className="mt-3 space-y-2">
            {ranking.map(({m, count}, index) => (
              <li key={m.id} className="flex items-center gap-3 rounded-xl border border-[#29332a] bg-[#101411] px-3 py-2.5">
                <span className="w-6 shrink-0 text-sm font-bold text-[#ff873f]">{index + 1}</span>
                <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{m.nome}</strong><small className="text-[#9aa59c]">{m.cidade}</small></span>
                <span className="shrink-0 text-xs font-semibold tabular-nums text-[#baff27]">{count} {count === 1 ? 'coleta' : 'coletas'}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
      <p className="text-[11px] text-[#849186]">Cada parada cadastrada em uma rota conta como uma coleta. O período usa a data em que a rota foi criada; remover uma parada ou rota atualiza os totais.</p>
    </div>
  );
}
