import {
  ArrowLeft,
  Check,
  Clock,
  Edit3,
  ExternalLink,
  GripVertical,
  Info,
  LocateFixed,
  MapPin,
  Navigation,
  Phone,
  Plus,
  RotateCcw,
  Zap,
  Trash2,
  X,
} from 'lucide-react';
import {Reorder, useDragControls} from 'motion/react';
import {useEffect, useMemo, useRef, useState} from 'react';
import type {FormEvent, RefObject} from 'react';
import {COMPANY_DESTINATION_ID, getArrivedStopId} from '../types.ts';
import type {CompanyLocation, Coordinates, Marmoraria, RoutePlan, RouteStop} from '../types.ts';
import {
  buildChunkedGoogleMapsRouteLinks,
  buildSingleStopGoogleMapsUrl,
  fetchRouteLegEstimates,
  formatDistancePt,
  formatDurationPt,
  organizeStopsByTravelTime,
} from '../utils/geo.ts';
import type {RouteEstimatesResult} from '../utils/geo.ts';
import {AppMap} from './AppMap.tsx';

interface RouteDetailViewProps {
  route: RoutePlan;
  marmorarias: Marmoraria[];
  company: CompanyLocation | null;
  userPosition: Coordinates | null;
  geoError: string | null;
  onBack: () => void;
  onRequestGeo: () => void;
  onRenameRoute: (routeId: string, newName: string) => void;
  onDeleteRoute: (routeId: string) => void;
  onRemoveStop: (routeId: string, stopId: string) => Promise<void>;
  canDelete?: boolean;
  onOpenAddStops: () => void;
  onSelectDestination: (routeId: string, stopId: string, forceSelect?: boolean) => void;
  onSelectCompanyDestination: (routeId: string, sendNotice?: boolean, remainingDurationSec?: number) => void;
  onArriveAtStop: (routeId: string, stopId: string) => void;
  onStopTravel: (routeId: string) => void;
  canSendReturnNotice: boolean;
  onReorderPendingStops: (routeId: string, orderedStopIds: string[]) => void;
  onUpdateStopStatus: (
    routeId: string,
    stopId: string,
    status: 'pendente' | 'concluida' | 'nao_entregue'
  ) => void;
  onOpenWhatsApp: (stop: RouteStop) => void;
}

interface IncomingLegInfo {
  remainingDurationSec: number;
}

interface DraggableStopItemProps {
  stop: RouteStop;
  idx: number;
  pendingCount: number;
  isCurrent: boolean;
  isArrived: boolean;
  hasPhone: boolean;
  isDragging: boolean;
  incomingLeg: IncomingLegInfo | null;
  routeId: string;
  canDelete: boolean;
  onRequestMaps: (stop: RouteStop) => void;
  onRequestRemove: (stop: RouteStop) => void;
  onUpdateStopStatus: (
    routeId: string,
    stopId: string,
    status: 'pendente' | 'concluida' | 'nao_entregue'
  ) => void;
  onOpenWhatsApp: (stop: RouteStop) => void;
  onDragStart: (stopId: string) => void;
  onDragEnd: () => void;
  onDragHandleDown: () => void;
  onDragHandleUp: () => void;
  dragBounds: RefObject<HTMLUListElement | null>;
  onArriveAtStop: (routeId: string, stopId: string) => void;
}

function DraggableStopItem({
  stop,
  idx,
  pendingCount,
  isCurrent,
  isArrived,
  hasPhone,
  isDragging,
  incomingLeg,
  routeId,
  canDelete,
  onRequestMaps,
  onRequestRemove,
  onUpdateStopStatus,
  onOpenWhatsApp,
  onDragStart,
  onDragEnd,
  onDragHandleDown,
  onDragHandleUp,
  dragBounds,
  onArriveAtStop,
}: DraggableStopItemProps) {
  const dragControls = useDragControls();

  return (
    <Reorder.Item
      value={stop}
      dragListener={false}
      dragControls={dragControls}
      dragConstraints={dragBounds}
      dragElastic={0}
      dragMomentum={false}
      onDragStart={() => onDragStart(stop.stopId)}
      onDragEnd={onDragEnd}
      className={`relative rounded-2xl border p-3.5 transition-colors ${
        isDragging
          ? 'z-20 border-[#baff27] bg-[#1c261d] shadow-2xl shadow-black/70'
          : isCurrent || isArrived
          ? 'border-[#baff27]/60 bg-[#182118]'
          : 'border-[#242c25] bg-[#151a16]'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className="flex min-h-[44px] min-w-0 flex-1 items-start gap-3 text-left"
        >
          <span
            className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold tabular-nums ${
              isCurrent || isArrived ? 'bg-[#baff27] text-[#0d100e]' : 'bg-[#ff873f] text-[#0d100e]'
            }`}
          >
            {idx + 1}
          </span>
          <div className="min-w-0">
            <p
              className={`truncate text-sm font-bold sm:text-base ${
                isCurrent || isArrived ? 'text-[#baff27]' : 'text-[#f3f5f2]'
              }`}
            >
              {stop.nome}
            </p>
            <p className="mt-0.5 text-xs text-[#9aa59c]">
              {stop.cidade}
              {isCurrent && (
                <span className="font-semibold text-[#baff27]"> - Destino atual</span>
              )}
              {isArrived && <span className="font-semibold text-[#baff27]"> - Você chegou</span>}
            </p>
            <p className="mt-1.5 flex items-center gap-1.5 text-[11px] leading-snug text-[#8c9a8e] tabular-nums">
              <Clock className="h-3 w-3 shrink-0" />
              {incomingLeg
                ? <>Tempo restante: ~{formatDurationPt(incomingLeg.remainingDurationSec)}</>
                : <>Tempo restante: aguardando GPS</>}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
        {canDelete && <button type="button" onClick={() => onRequestRemove(stop)}
          aria-label={`Excluir ${stop.nome} desta rota`} title="Excluir parada da rota"
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[#ff873f]/40 bg-[#101411] text-[#ff873f] hover:bg-[#ff873f]/15">
          <Trash2 className="h-4.5 w-4.5" />
        </button>}
        {/* Press-and-hold drag handle */}
        {pendingCount > 1 && (
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              onDragHandleDown();
              dragControls.start(e);
            }}
            onPointerUp={onDragHandleUp}
            onPointerCancel={onDragHandleUp}
            aria-label={`Segurar e arrastar ${stop.nome} para reordenar`}
            title="Segurar e arrastar para reordenar"
            className={`inline-flex min-h-[44px] min-w-[44px] shrink-0 cursor-grab touch-none select-none items-center justify-center rounded-xl border transition-colors active:cursor-grabbing ${
              isDragging
                ? 'border-[#baff27] bg-[#baff27] text-[#0d100e]'
                : 'border-[#262f27] bg-[#101411] text-[#9aa59c] hover:border-[#3c4b3d] hover:text-[#f3f5f2]'
            }`}
          >
            <GripVertical className="h-5 w-5" />
          </button>
        )}
        </div>
      </div>

      {/* Action buttons: Maps arrow, WhatsApp phone, Concluída (✓), Não entregue (X) */}
      <div className="mt-3 flex flex-nowrap items-center justify-between gap-1.5 border-t border-[#222a23] pt-3 sm:gap-2">
        <div className="flex flex-nowrap items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => onRequestMaps(stop)}
            aria-label={`Abrir ${stop.nome} no Google Maps`}
            className="inline-flex min-h-[44px] shrink-0 items-center gap-1 whitespace-nowrap rounded-xl border border-[#283129] bg-[#101411] px-2 text-[11px] font-semibold text-[#e3e8e2] hover:border-[#ff873f]/50 hover:text-[#ff873f] sm:gap-1.5 sm:px-3 sm:text-xs"
          >
            <Navigation className="h-3.5 w-3.5 shrink-0 text-[#ff873f] sm:h-4 sm:w-4" />
            <span>Maps</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenWhatsApp(stop)}
            aria-label={`WhatsApp para ${stop.nome}`}
            className={`inline-flex min-h-[44px] shrink-0 items-center gap-1 whitespace-nowrap rounded-xl border border-[#283129] bg-[#101411] px-2 text-[11px] font-semibold text-[#e3e8e2] sm:gap-1.5 sm:px-3 sm:text-xs ${hasPhone ? 'hover:border-[#baff27]/50 hover:text-[#baff27]' : 'hover:border-[#d5dcd4]/50'}`}
          >
            <Phone className={`h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4 ${hasPhone ? 'text-[#baff27]' : 'text-[#f3f5f2]'}`} />
            <span>WhatsApp</span>
          </button>
        </div>

        <div className="flex flex-nowrap items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => onUpdateStopStatus(routeId, stop.stopId, 'concluida')}
            aria-label={`Marcar ${stop.nome} como concluída`}
            title="Concluída"
            className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-xl bg-[#baff27]/15 px-2 text-[11px] font-bold text-[#baff27] hover:bg-[#baff27] hover:text-[#0d100e] sm:px-3 sm:text-xs"
          >
            <Check className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
            <span>Concluída</span>
          </button>
          <button
            type="button"
            onClick={() => onUpdateStopStatus(routeId, stop.stopId, 'nao_entregue')}
            aria-label={`Marcar ${stop.nome} como não entregue`}
            title="Não entregue"
            className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-xl bg-[#ff873f]/15 px-2 text-[11px] font-bold text-[#ff873f] hover:bg-[#ff873f] hover:text-[#0d100e] sm:px-3 sm:text-xs"
          >
            <X className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Não entregue</span>
          </button>
        </div>
      </div>
      {isCurrent && (
        <button type="button" onClick={() => onArriveAtStop(routeId, stop.stopId)}
          className="mt-3 inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#baff27]/50 bg-[#baff27]/10 px-3 text-xs font-bold text-[#baff27]">
          <MapPin className="h-4 w-4" />Cheguei
        </button>
      )}
    </Reorder.Item>
  );
}

export function RouteDetailView({
  route,
  marmorarias,
  company,
  userPosition,
  geoError,
  onBack,
  onRequestGeo,
  onRenameRoute,
  onDeleteRoute,
  onRemoveStop,
  canDelete = true,
  onOpenAddStops,
  onSelectDestination,
  onSelectCompanyDestination,
  onArriveAtStop,
  onStopTravel,
  canSendReturnNotice,
  onReorderPendingStops,
  onUpdateStopStatus,
  onOpenWhatsApp,
}: RouteDetailViewProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [draftName, setDraftName] = useState(route.nome);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [stopToRemove, setStopToRemove] = useState<RouteStop | null>(null);
  const [removingStop, setRemovingStop] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [draggingStopId, setDraggingStopId] = useState<string | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizationNotice, setOptimizationNotice] = useState<string | null>(null);
  const [mapsConfirmation, setMapsConfirmation] = useState<{
    name: string;
    url: string;
    stopId: string;
  } | null>(null);

  const pendingStops = useMemo(
    () => route.stops.filter((s) => s.status === 'pendente'),
    [route.stops]
  );
  const [orderedPending, setOrderedPending] = useState<RouteStop[]>(pendingStops);
  const latestOrderRef = useRef<RouteStop[]>(pendingStops);
  const dragBounds = useRef<HTMLUListElement>(null);
  const isDraggingRef = useRef(false);
  const pageScrollLock = useRef<{y: number; bodyStyle: string; htmlOverflow: string} | null>(null);

  const lockPageScroll = () => {
    if (pageScrollLock.current) return;
    const y = window.scrollY;
    pageScrollLock.current = {
      y,
      bodyStyle: document.body.getAttribute('style') || '',
      htmlOverflow: document.documentElement.style.overflow,
    };
    document.documentElement.style.overflow = 'hidden';
    Object.assign(document.body.style, {
      position: 'fixed', top: `-${y}px`, left: '0', right: '0', width: '100%',
    });
  };

  const unlockPageScroll = () => {
    const lock = pageScrollLock.current;
    if (!lock) return;
    pageScrollLock.current = null;
    if (lock.bodyStyle) document.body.setAttribute('style', lock.bodyStyle);
    else document.body.removeAttribute('style');
    document.documentElement.style.overflow = lock.htmlOverflow;
    window.scrollTo(0, lock.y);
  };

  useEffect(() => {
    const release = () => unlockPageScroll();
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    return () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      unlockPageScroll();
    };
  }, []);

  useEffect(() => {
    if (!isDraggingRef.current) {
      setOrderedPending(pendingStops);
      latestOrderRef.current = pendingStops;
    }
  }, [pendingStops]);

  const finishedStops = useMemo(
    () => route.stops.filter((s) => s.status !== 'pendente'),
    [route.stops]
  );

  const activeDest = pendingStops.find((s) => s.stopId === route.currentDestinationStopId) || null;
  const hasPhoneFor = (stop: RouteStop) => {
    const customer = marmorarias.find((m) => m.id === stop.marmorariaId) ||
      marmorarias.find((m) => m.lat === stop.lat && m.lng === stop.lng);
    return Boolean((customer?.telefone ?? stop.telefone).trim());
  };
  const arrivedStop = pendingStops.find((s) => s.stopId === getArrivedStopId(route.currentDestinationStopId)) || null;
  const companyIsCurrent = route.currentDestinationStopId === COMPANY_DESTINATION_ID;

  const requestMaps = (stop: RouteStop, url = buildSingleStopGoogleMapsUrl(stop, userPosition)) => {
    setMapsConfirmation({name: stop.nome, url, stopId: stop.stopId});
  };

  const confirmRemoveStop = async () => {
    if (!stopToRemove) return;
    setRemovingStop(true);
    setRemoveError(null);
    try {
      await onRemoveStop(route.id, stopToRemove.stopId);
      setStopToRemove(null);
    } catch (error) {
      setRemoveError(error instanceof Error ? error.message : 'Não foi possível excluir esta parada.');
    } finally {
      setRemovingStop(false);
    }
  };

  const mapsSegments = useMemo(
    () => buildChunkedGoogleMapsRouteLinks(orderedPending, userPosition, company),
    [orderedPending, userPosition, company]
  );

  const [estimates, setEstimates] = useState<RouteEstimatesResult | null>(null);
  const [estimatesLoading, setEstimatesLoading] = useState(false);

  const pointsKey = useMemo(() => {
    const pts: string[] = [];
    if (userPosition) {
      pts.push(`${userPosition.lat.toFixed(4)},${userPosition.lng.toFixed(4)}`);
    }
    orderedPending.forEach((s) => {
      pts.push(`${s.lat.toFixed(5)},${s.lng.toFixed(5)}`);
    });
    if (company) pts.push(`${company.lat.toFixed(5)},${company.lng.toFixed(5)}`);
    return pts.join('|');
  }, [orderedPending, userPosition, company]);

  useEffect(() => {
    const points: Coordinates[] = [];
    if (userPosition) points.push(userPosition);
    orderedPending.forEach((s) => points.push({lat: s.lat, lng: s.lng}));
    if (company && points.length > 0) points.push(company);

    if (points.length < 2) {
      setEstimates(null);
      setEstimatesLoading(false);
      return;
    }

    let cancelled = false;
    setEstimatesLoading(true);
    const timer = setTimeout(() => {
      void fetchRouteLegEstimates(points).then((result) => {
        if (!cancelled) {
          setEstimates(result);
          setEstimatesLoading(false);
        }
      });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pointsKey, orderedPending, userPosition, company]);

  const handleSaveName = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = draftName.trim();
    if (trimmed) {
      onRenameRoute(route.id, trimmed);
    }
    setIsRenaming(false);
  };

  const handleOptimizeRoute = async () => {
    if (orderedPending.length < 2) return;
    setOptimizing(true);
    setOptimizationNotice(null);
    try {
      const [firstStop, ...followingStops] = orderedPending;
      const result = await organizeStopsByTravelTime(
        {lat: firstStop.lat, lng: firstStop.lng},
        followingStops
      );
      const byId = new Map(followingStops.map((stop) => [stop.stopId, stop]));
      const ordered = [firstStop, ...result.stopIds.map((id) => byId.get(id)).filter((s): s is RouteStop => Boolean(s))];
      latestOrderRef.current = ordered;
      setOrderedPending(ordered);
      onReorderPendingStops(route.id, ordered.map((stop) => stop.stopId));
      setOptimizationNotice(result.source === 'osrm'
        ? `Rota calculada a partir da primeira parada (${firstStop.nome}), pelo tempo de deslocamento nas ruas. Você ainda pode arrastar as paradas.`
        : `Rota calculada a partir da primeira parada (${firstStop.nome}), por estimativa de distância. Você ainda pode arrastar as paradas.`);
    } catch (error) {
      setOptimizationNotice(error instanceof Error ? error.message : 'Não foi possível otimizar a rota. Tente novamente.');
    } finally {
      setOptimizing(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 rounded-2xl border border-[#242c25] bg-[#151a16] p-4">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-2.5 text-sm font-medium text-[#d5dcd4] hover:bg-[#1e251f]"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Rotas</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setDraftName(route.nome);
                setIsRenaming((prev) => !prev);
              }}
              aria-label="Renomear rota"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[#283129] bg-[#101411] text-[#d5dcd4] hover:border-[#baff27]/40 hover:text-[#baff27]"
            >
              <Edit3 className="h-4 w-4" />
            </button>

            {!canDelete ? null : confirmDelete ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onDeleteRoute(route.id)}
                  className="min-h-[44px] rounded-xl bg-red-600 px-3 text-xs font-bold text-white hover:bg-red-500"
                >
                  Confirmar exclusão
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="min-h-[44px] rounded-xl border border-[#283129] px-3 text-xs text-[#9aa59c]"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                aria-label="Excluir rota"
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[#283129] bg-[#101411] text-[#9aa59c] hover:border-red-500/40 hover:text-red-400"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {isRenaming ? (
          <form onSubmit={handleSaveName} className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              className="min-h-[44px] flex-1 rounded-xl border border-[#323d33] bg-[#0d100e] px-3.5 text-sm text-[#f3f5f2] focus:border-[#baff27] focus:outline-none"
              placeholder="Nome da rota"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className="min-h-[44px] rounded-xl bg-[#baff27] px-4 text-sm font-bold text-[#0d100e]"
              >
                Salvar
              </button>
              <button
                type="button"
                onClick={() => setIsRenaming(false)}
                className="min-h-[44px] rounded-xl border border-[#283129] px-4 text-sm text-[#9aa59c]"
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <div>
            <h1 className="text-xl font-bold text-[#f3f5f2] sm:text-2xl">{route.nome}</h1>
            {route.status === 'finalizada' && (
              <p className="mt-1 text-xs font-semibold text-[#baff27]">
                {route.stops.length > 0 && route.stops.every((stop) => stop.status === 'concluida')
                  ? 'Rota concluída' : 'Rota encerrada'}
              </p>
            )}
            <p className="mt-1 text-xs text-[#9aa59c] tabular-nums">
              <span>
                {pendingStops.length} {pendingStops.length === 1 ? 'pendente' : 'pendentes'}
              </span>
              {finishedStops.length > 0 && (
                <>
                  <span aria-hidden="true"> · </span>
                  <span>
                    {finishedStops.length}{' '}
                    {finishedStops.length === 1 ? 'finalizada' : 'finalizadas'}
                  </span>
                </>
              )}
            </p>
          </div>
        )}
        {route.status !== 'finalizada' && (
          <div className="flex flex-wrap gap-2">
            {route.currentDestinationStopId && (
              <button type="button" onClick={() => onStopTravel(route.id)}
                className="min-h-[40px] rounded-xl border border-[#394539] px-3 text-xs font-semibold text-[#d5dcd4]">
                {arrivedStop ? 'Sair do local' : 'Encerrar deslocamento'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Desktop 2-column split: Map left, Ordered stops right */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-start">
        <div className="space-y-3 lg:sticky lg:top-16 lg:col-span-5">
          <AppMap
            mode="route"
            stops={route.stops}
            company={company}
            currentDestinationStopId={route.currentDestinationStopId}
            userPosition={userPosition}
            className="h-64 w-full sm:h-72 lg:h-80"
          />

          <p className="flex items-start gap-2 text-xs leading-relaxed text-[#9aa59c]">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#ff873f]" />
            <span>O Google Maps atualiza o tempo ao abrir a rota.</span>
          </p>

          {/* Geolocation, Time Estimate & Google Maps Route Buttons */}
          <div className="space-y-3 rounded-2xl border border-[#242c25] bg-[#151a16] p-4">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-[#9aa59c]">
                {userPosition
                  ? 'Ponto de partida: GPS ativo'
                  : geoError || 'Ponto de partida: aguardando GPS'}
              </span>
              {!userPosition && (
                <button
                  type="button"
                  onClick={onRequestGeo}
                  className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 font-semibold text-[#baff27] hover:underline"
                >
                  <LocateFixed className="h-3.5 w-3.5" />
                  <span>Usar meu GPS</span>
                </button>
              )}
            </div>

            {orderedPending.length > 0 && (estimates || estimatesLoading) && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#252e26] bg-[#101411] px-3 py-2 text-xs tabular-nums">
                <div className="flex items-center gap-1.5 text-[#d5dcd4]">
                  <Clock className="h-3.5 w-3.5 shrink-0 text-[#baff27]" />
                  {estimates ? (
                    <span>
                      Tempo total:{' '}
                      <strong className="text-[#baff27]">
                        ~{formatDurationPt(estimates.totalDurationSec)}
                      </strong>{' '}
                      / {formatDistancePt(estimates.totalDistanceMeters)}
                    </span>
                  ) : (
                    <span className="text-[#9aa59c]">Calculando tempo dos trechos...</span>
                  )}
                </div>
                {estimates && (
                  <span className="text-[10px] font-medium text-[#7b877e]">
                    {estimates.source === 'osrm' ? 'Via OpenStreetMap' : 'Estimativa offline'}
                  </span>
                )}
              </div>
            )}

            {!userPosition && orderedPending.length === 1 && (
              <p className="text-[11px] text-[#7b877e]">
                Toque em Usar minha posição para estimar o tempo até a parada.
              </p>
            )}

            {mapsSegments.length === 0 ? (
              <p className="text-xs text-[#7b877e]">
                Adicione paradas pendentes para abrir a navegação no Google Maps.
              </p>
            ) : mapsSegments.length === 1 ? (
              <button
                type="button"
                onClick={() => {
                  const firstStop = activeDest || orderedPending[0];
                  if (firstStop) requestMaps(firstStop, mapsSegments[0].url);
                }}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#baff27] px-4 py-3 text-sm font-bold text-[#0d100e] transition-transform active:scale-[0.98]"
              >
                <Navigation className="h-4 w-4" />
                <span>Abrir rota no Google Maps</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-medium text-[#ff873f]">
                  Rota dividida em partes para respeitar o limite de paradas do Google Maps no
                  celular:
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {mapsSegments.map((seg) => (
                    <button
                      key={seg.partIndex}
                      onClick={() => {
                        const targetStop = orderedPending[seg.startStopNumber - 1] || orderedPending[0];
                        if (targetStop) requestMaps(targetStop, seg.url);
                      }}
                      type="button"
                      className="flex min-h-[46px] items-center justify-between rounded-xl bg-[#baff27] px-4 py-2.5 text-sm font-bold text-[#0d100e] transition-transform active:scale-[0.98]"
                    >
                      <span>{seg.label}</span>
                      <ExternalLink className="h-4 w-4 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {company && orderedPending.length === 0 && (
              <button type="button" onClick={() => setMapsConfirmation({name: company.name, url: buildSingleStopGoogleMapsUrl(company, userPosition), stopId: COMPANY_DESTINATION_ID})} className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#ff873f] px-3 text-xs font-bold text-[#ff873f]">
                <Navigation className="h-4 w-4" /> Navegar de volta à empresa
              </button>
            )}
          </div>
        </div>

        {/* Ordered Stops List */}
        <div className="space-y-4 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-bold text-[#f3f5f2]">
              Paradas da rota ({pendingStops.length} pendentes)
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleOptimizeRoute()}
                disabled={optimizing || pendingStops.length < 2}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[#ff873f] bg-[#ff873f]/15 px-3.5 py-2 text-xs font-bold text-[#ff873f] hover:bg-[#ff873f]/25 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Zap className="h-4 w-4" />
                <span className="whitespace-nowrap">{optimizing ? 'Otimizando...' : 'Otimizar rota'}</span>
              </button>
              <button
                type="button"
                onClick={onOpenAddStops}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[#baff27]/50 bg-[#baff27]/10 px-3.5 py-2 text-xs font-bold text-[#baff27] hover:bg-[#baff27]/20"
              >
                <Plus className="h-4 w-4" />
                <span className="whitespace-nowrap">Adicionar paradas</span>
              </button>
            </div>
          </div>
          {optimizationNotice && <p role="status" className="text-xs text-[#ffad73]">{optimizationNotice}</p>}

          {route.stops.length === 0 ? (
            <div className="rounded-2xl border border-[#242c25] bg-[#151a16] p-8 text-center">
              <p className="text-sm font-medium text-[#f3f5f2]">
                Esta rota ainda não possui paradas.
              </p>
              <p className="mt-1 text-xs text-[#9aa59c]">
                Toque em Adicionar paradas ou no botão + para selecionar marmorarias.
              </p>
            </div>
          ) : (
            <>
              {/* Pending stops */}
              {orderedPending.length > 0 && (
                <div className="space-y-2.5">
                  <Reorder.Group
                    ref={dragBounds}
                    axis="y"
                    values={orderedPending}
                    onReorder={(nextOrder) => {
                      latestOrderRef.current = nextOrder;
                      setOrderedPending(nextOrder);
                    }}
                    className="space-y-2.5"
                  >
                    {orderedPending.map((stop, idx) => {
                      let incomingLeg: IncomingLegInfo | null = null;
                      if (estimates && userPosition) {
                        const legIndex = idx;
                        const leg = estimates.legs[legIndex];
                        if (leg) {
                          const remainingDurationSec = estimates.legs
                            .slice(0, legIndex + 1)
                            .reduce((sum, item) => sum + item.durationSec, 0);
                          incomingLeg = {remainingDurationSec};
                        }
                      }

                      return (
                        <DraggableStopItem
                          key={stop.stopId}
                          stop={stop}
                          idx={idx}
                          pendingCount={orderedPending.length}
                          isCurrent={stop.stopId === route.currentDestinationStopId}
                          isArrived={stop.stopId === getArrivedStopId(route.currentDestinationStopId)}
                          hasPhone={hasPhoneFor(stop)}
                          isDragging={draggingStopId === stop.stopId}
                          incomingLeg={incomingLeg}
                          routeId={route.id}
                          canDelete={canDelete}
                          onRequestMaps={requestMaps}
                          onRequestRemove={(item) => {setRemoveError(null); setStopToRemove(item);}}
                          onUpdateStopStatus={onUpdateStopStatus}
                          onArriveAtStop={onArriveAtStop}
                          dragBounds={dragBounds}
                          onOpenWhatsApp={onOpenWhatsApp}
                          onDragStart={(id) => {
                            isDraggingRef.current = true;
                            setDraggingStopId(id);
                          }}
                          onDragHandleDown={lockPageScroll}
                          onDragHandleUp={unlockPageScroll}
                          onDragEnd={() => {
                            unlockPageScroll();
                            isDraggingRef.current = false;
                            setDraggingStopId(null);
                            onReorderPendingStops(
                              route.id,
                              latestOrderRef.current.map((s) => s.stopId)
                            );
                          }}
                        />
                      );
                    })}
                  </Reorder.Group>
                </div>
              )}

              {company && (
                <div className="rounded-2xl border border-[#baff27]/45 bg-[#182118] p-3.5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#baff27] text-[#0d100e]"><MapPin className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-[#f3f5f2]">Volta à empresa · {company.name}</p>
                      {company.address && <p className="text-xs text-[#9aa59c]">{company.address}</p>}
                      {companyIsCurrent && <p className="mt-1 text-xs font-semibold text-[#baff27]">Destino atual</p>}
                      <p className="mt-1 text-[11px] text-[#baff27]">
                        {userPosition && estimates
                          ? <>Tempo restante: ~{formatDurationPt(estimates.totalDurationSec)}</>
                          : 'Tempo restante: aguardando GPS'}
                      </p>
                    </div>
                    <button type="button" onClick={() => setMapsConfirmation({name: company.name, url: buildSingleStopGoogleMapsUrl(company), stopId: COMPANY_DESTINATION_ID})} aria-label="Abrir empresa no Google Maps" className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[#baff27]/40 px-3 text-xs font-bold text-[#baff27]"><Navigation className="h-4 w-4" /> Maps</button>
                  </div>
                </div>
              )}

              {/* Finished / History stops moved to bottom and dimmed */}
              {finishedStops.length > 0 && (
                <div className="space-y-2.5 pt-2">
                  <h3 className="text-xs font-semibold tracking-wide text-[#7b877e]">
                    Histórico desta rota ({finishedStops.length})
                  </h3>
                  <ul className="space-y-2">
                    {finishedStops.map((stop) => {
                      const isDone = stop.status === 'concluida';
                      return (
                        <li
                          key={stop.stopId}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-[#202721] bg-[#121613] p-3.5 opacity-60"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-[#d5dcd4] line-through">
                              {stop.nome}
                            </p>
                            <p className="mt-0.5 text-xs text-[#9aa59c]">
                              {stop.cidade}
                              <span aria-hidden="true"> · </span>
                              <span className={isDone ? 'text-[#baff27]' : 'text-[#ff873f]'}>
                                {isDone ? 'Concluída' : 'Não entregue'}
                              </span>
                            </p>
                          </div>

                          <div className="flex shrink-0 items-center gap-1.5">
                            {canDelete && <button type="button"
                              onClick={() => {setRemoveError(null); setStopToRemove(stop);}}
                              aria-label={`Excluir ${stop.nome} desta rota`} title="Excluir parada da rota"
                              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[#ff873f]/40 text-[#ff873f] hover:bg-[#ff873f]/15"><Trash2 className="h-4 w-4" /></button>}
                            <button
                              type="button"
                              onClick={() => onOpenWhatsApp(stop)}
                              aria-label={`WhatsApp para ${stop.nome}`}
                              className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[#262f27] bg-[#0d100e] ${hasPhoneFor(stop) ? 'text-[#baff27]' : 'text-[#f3f5f2]'}`}
                            >
                              <Phone className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onUpdateStopStatus(route.id, stop.stopId, 'pendente')}
                              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[#2e382f] bg-[#181f19] px-3 text-xs font-semibold text-[#e3e8e2] hover:border-[#baff27]/40 hover:text-[#baff27]"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              <span>Desfazer</span>
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {stopToRemove && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/75 px-4" role="presentation" onMouseDown={(event) => {if (!removingStop && event.target === event.currentTarget) setStopToRemove(null);}}>
          <div role="dialog" aria-modal="true" aria-labelledby="confirm-remove-stop-title" className="w-full max-w-sm rounded-2xl border border-[#394539] bg-[#151a16] p-5 shadow-2xl">
            <h2 id="confirm-remove-stop-title" className="text-lg font-bold text-[#f3f5f2]">Excluir parada da rota?</h2>
            <p className="mt-2 text-sm text-[#bdc7bd]">{stopToRemove.nome} será removida desta rota. A marmoraria continuará cadastrada em Endereços.</p>
            {removeError && <p role="alert" className="mt-3 text-sm text-[#ff873f]">{removeError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={removingStop} onClick={() => setStopToRemove(null)} className="min-h-[44px] rounded-xl border border-[#394539] px-4 text-sm text-[#e3e8e2]">Cancelar</button>
              <button type="button" disabled={removingStop} onClick={() => void confirmRemoveStop()} className="min-h-[44px] rounded-xl bg-[#ff873f] px-4 text-sm font-bold text-[#0d100e] disabled:opacity-60">{removingStop ? 'Excluindo...' : 'Excluir da rota'}</button>
            </div>
          </div>
        </div>
      )}
      {mapsConfirmation && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/75 px-4" role="presentation" onMouseDown={(event) => {if (event.target === event.currentTarget) setMapsConfirmation(null);}}>
          <div role="dialog" aria-modal="true" aria-labelledby="confirm-maps-title" className="w-full max-w-sm rounded-2xl border border-[#394539] bg-[#151a16] p-5 shadow-2xl">
            {mapsConfirmation.stopId === COMPANY_DESTINATION_ID && canSendReturnNotice && !companyIsCurrent ? <>
              <h2 id="confirm-maps-title" className="text-lg font-bold text-[#f3f5f2]">Avisar que está voltando à empresa?</h2>
              <p className="mt-2 text-sm text-[#bdc7bd]">Escolha se deseja enviar o aviso pelo WhatsApp antes de abrir a rota no Maps.</p>
              <div className="mt-5 flex flex-col gap-2">
                <a href={mapsConfirmation.url} target="_blank" rel="noopener noreferrer" onClick={() => {onSelectCompanyDestination(route.id, true, orderedPending.length === 0 && userPosition && estimates ? Math.round(estimates.totalDurationSec) : undefined); setMapsConfirmation(null);}} className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-[#baff27] px-4 text-sm font-bold text-[#0d100e]"><Navigation className="h-4 w-4" />Abrir Maps e enviar aviso</a>
                <a href={mapsConfirmation.url} target="_blank" rel="noopener noreferrer" onClick={() => {onSelectCompanyDestination(route.id, false); setMapsConfirmation(null);}} className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-[#394539] px-4 text-sm font-semibold text-[#f3f5f2]">Abrir Maps sem enviar</a>
                <button type="button" onClick={() => setMapsConfirmation(null)} className="min-h-[42px] text-sm text-[#9aa59c]">Cancelar</button>
              </div>
            </> : <>
              <h2 id="confirm-maps-title" className="text-lg font-bold text-[#f3f5f2]">Ir para este destino?</h2>
              <p className="mt-2 text-sm text-[#bdc7bd]">Ao confirmar, <strong className="text-[#baff27]">{mapsConfirmation.name}</strong> aparecerá na rota como seu destino atual e o Google Maps será aberto.</p>
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={() => setMapsConfirmation(null)} className="min-h-[44px] rounded-xl border border-[#394539] px-4 text-sm text-[#e3e8e2]">Cancelar</button>
                <a href={mapsConfirmation.url} target="_blank" rel="noopener noreferrer" onClick={() => {if (mapsConfirmation.stopId === COMPANY_DESTINATION_ID) onSelectCompanyDestination(route.id); else onSelectDestination(route.id, mapsConfirmation.stopId, true); setMapsConfirmation(null);}} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#ff873f] px-4 text-sm font-bold text-[#0d100e]"><Navigation className="h-4 w-4" />Confirmar e abrir Maps</a>
              </div>
            </>}
          </div>
        </div>
      )}
    </div>
  );
}
