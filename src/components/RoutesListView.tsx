import {Navigation, Plus, Route as RouteIcon} from 'lucide-react';
import {COMPANY_DESTINATION_ID, getArrivedStopId, HOME_DESTINATION_ID} from '../types.ts';
import type {CompanyLocation, RoutePlan} from '../types.ts';
import type {RouteDistance} from '../hooks/useRouteDistances.ts';
import {formatDistancePt, formatDurationPt} from '../utils/geo.ts';

interface RoutesListViewProps {
  routes: RoutePlan[];
  company: CompanyLocation | null;
  home: CompanyLocation | null;
  distances: Record<string, RouteDistance>;
  onOpenRoute: (routeId: string) => void;
  onCreateRoute: () => void;
}

export function RoutesListView({
  routes,
  company,
  home,
  distances,
  onOpenRoute,
  onCreateRoute,
}: RoutesListViewProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#f3f5f2] sm:text-2xl">Rotas</h1>
          <p className="mt-0.5 text-xs text-[#9aa59c]">
            Toque em uma rota para ver o mapa, ordenar paradas e iniciar a navegação.
          </p>
        </div>

        <button
          type="button"
          onClick={onCreateRoute}
          className="inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl bg-[#baff27] px-4 py-2 text-sm font-bold text-[#0d100e] transition-transform active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          <span className="whitespace-nowrap">Nova rota</span>
        </button>
      </div>

      {routes.length === 0 ? (
        <div className="rounded-2xl border border-[#242c25] bg-[#151a16] p-8 text-center">
          <RouteIcon className="mx-auto h-8 w-8 text-[#5d6b5f]" />
          <h2 className="mt-3 text-base font-semibold text-[#f3f5f2]">Nenhuma rota cadastrada</h2>
          <p className="mt-1 text-sm text-[#9aa59c]">
            Toque em Nova rota para começar.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {routes.map((route) => {
            const totalStops = route.stops.length;
            const metrics = distances[route.id];
            const currentDest = route.stops.find(
              (s) => s.stopId === route.currentDestinationStopId && s.status === 'pendente'
            );
            const arrivedStop = route.stops.find(
              (s) => s.stopId === getArrivedStopId(route.currentDestinationStopId) && s.status === 'pendente'
            );
            const completed = route.stops.length > 0 && route.stops.every((s) => s.status === 'concluida');

            return (
              <li key={route.id} style={{contentVisibility: 'auto', containIntrinsicSize: '76px'}} className="overflow-hidden rounded-2xl border border-[#242c25] bg-[#151a16]">
                <button
                  type="button"
                  onClick={() => onOpenRoute(route.id)}
                  className="flex min-h-[76px] w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[#1b221c] active:bg-[#202821]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#f3f5f2] sm:text-base">
                      {route.nome} -{' '}
                      <span className="tabular-nums text-[#baff27]">
                        {totalStops} {totalStops === 1 ? 'parada' : 'paradas'}
                      </span>
                    </p>
                    <p className="mt-1 text-[11px] text-[#9aa59c] tabular-nums">
                      {!company ? 'Cadastre a empresa para calcular os km' : metrics ? `${formatDistancePt(metrics.meters)} no percurso completo` : 'Calculando km...'}
                    </p>
                    {route.status === 'finalizada' ? (
                      <p className="mt-1.5 text-xs font-semibold text-[#baff27]">
                        {completed ? 'Rota concluída' : 'Rota encerrada'}
                      </p>
                    ) : arrivedStop && route.activeDriverName ? (
                      <p className="mt-1.5 text-xs font-semibold text-[#baff27]">
                        {route.activeDriverName} chegou em {arrivedStop.nome}
                      </p>
                    ) : (currentDest || (company && route.currentDestinationStopId === COMPANY_DESTINATION_ID) || (home && route.currentDestinationStopId === HOME_DESTINATION_ID)) && route.activeDriverName && (
                      <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-[#ff873f]">
                        <Navigation className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          {route.activeDriverName}{currentDest ? '' : ' -'} em rota para {currentDest?.nome || (route.currentDestinationStopId === HOME_DESTINATION_ID ? home?.name : company?.name)}
                        </span>
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 border-l border-[#2b352d] pl-3 text-right">
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-[#7f8b81]">Tempo total</p>
                    <p className="mt-1 whitespace-nowrap text-lg font-extrabold leading-none text-[#baff27] tabular-nums">
                      {metrics?.durationSec ? `~${formatDurationPt(metrics.durationSec)}` : '...'}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
