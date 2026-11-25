import {
  Check,
  Clock,
  Edit3,
  ExternalLink,
  GripVertical,
  Info,
  LocateFixed,
  MapPin,
  Maximize2,
  Minimize2,
  MoreVertical,
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
import type {FormEvent} from 'react';
import {createPortal} from 'react-dom';
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
  onRequestGeo: () => void;
  onRenameRoute: (routeId: string, newName: string) => void;
  onDeleteRoute: (routeId: string) => void;
  onCancelRoute: (routeId: string, sendNotice: boolean) => void;
  onCancelStop: (routeId: string, stopId: string, sendNotice: boolean) => void;
  onRemoveStop: (routeId: string, stopId: string) => Promise<void>;
  canDelete?: boolean;
  onOpenAddStops: () => void;
  onSelectDestination: (routeId: string, stopId: string, forceSelect?: boolean) => void;
  onSelectCompanyDestination: (routeId: string, sendNotice?: boolean, remainingDurationSec?: number) => void;
  onStopTravel: (routeId: string) => void;
  canSendReturnNotice: boolean;
  canSendCancellationNotice: boolean;
  onReorderPendingStops: (routeId: string, orderedStopIds: string[]) => void;
  onUpdateStopStatus: (
    routeId: string,
    stopId: string,
    status: 'pendente' | 'concluida' | 'nao_entregue',
    returnDurationSec?: number
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
  returnDurationSec?: number;
  routeId: string;
  canDelete: boolean;
  onRequestMaps: (stop: RouteStop) => void;
  onRequestRemove: (stop: RouteStop) => void;
  onRequestCancelStop: (stop: RouteStop) => void;
  onUpdateStopStatus: (
    routeId: string,
    stopId: string,
    status: 'pendente' | 'concluida' | 'nao_entregue',
    returnDurationSec?: number
  ) => void;
  onOpenWhatsApp: (stop: RouteStop) => void;
  onDragStart: (stopId: string) => void;
  onDragEnd: () => void;
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
  returnDurationSec,
  routeId,
  canDelete,
  onRequestMaps,
  onRequestRemove,
  onRequestCancelStop,
  onUpdateStopStatus,
  onOpenWhatsApp,
  onDragStart,
  onDragEnd,
}: DraggableStopItemProps) {
  const dragControls = useDragControls();

  return (
    <Reorder.Item
      value={stop}
      dragListener={false}
      dragControls={dragControls}
      dragElastic={0}
      dragMomentum={false}
      onDragStart={() => onDragStart(stop.stopId)}
      onDragEnd={onDragEnd}
      className={`relative rounded-2xl border p-2 transition-colors ${
        isDragging
          ? 'z-20 border-[#baff27] bg-[#1c261d] shadow-2xl shadow-black/70'
          : isCurrent || isArrived
          ? 'border-[#baff27]/60 bg-[#182118]'
          : 'border-[#242c25] bg-[#151a16]'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div
          className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-extrabold tabular-nums ${
              isCurrent || isArrived ? 'bg-[#baff27] text-[#0d100e]' : 'bg-[#ff873f] text-[#0d100e]'
            }`}
          >
            {idx + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p
              className={`inline text-xs font-bold leading-tight ${
                isCurrent || isArrived ? 'text-[#baff27]' : 'text-[#f3f5f2]'
              }`}
            >
              {stop.nome}
            </p>
            <p className="ml-1 inline text-[11px] text-[#9aa59c]">
              <span className="mr-1 text-[#5f6b61]">·</span>
              {stop.cidade}
              {isCurrent && (
                <span className="font-semibold text-[#baff27]"> - Destino atual</span>
              )}
              {isArrived && <span className="font-semibold text-[#baff27]"> - Você chegou</span>}
            </p>
            <p className="mt-1 flex items-center gap-1 text-[10px] leading-none text-[#8c9a8e] tabular-nums">
              <Clock className="h-3 w-3 shrink-0" />
              {incomingLeg
                ? <>Tempo restante: ~{formatDurationPt(incomingLeg.remainingDurationSec)}</>
                : <>Tempo restante: aguardando GPS</>}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
        {canDelete && <button type="button" onClick={() => onRequestRemove(stop)}
          aria-label={`Excluir ${stop.nome} desta rota`} title="Excluir parada da rota"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#b85d1e]/70 bg-[#101411] text-[#ff873f] hover:bg-[#ff873f]/15">
          <Trash2 className="h-4 w-4" />
        </button>}
        {/* Press-and-hold drag handle */}
        {pendingCount > 1 && (
          <button
            type="button"
            onPointerDown={(e) => {
              dragControls.start(e);
            }}
            aria-label={`Segurar e arrastar ${stop.nome} para reordenar`}
            title="Segurar e arrastar para reordenar"
            className={`inline-flex h-10 w-10 shrink-0 cursor-grab touch-none select-none items-center justify-center rounded-lg border transition-colors active:cursor-grabbing ${
              isDragging
                ? 'border-[#baff27] bg-[#baff27] text-[#0d100e]'
                : 'border-[#262f27] bg-[#101411] text-[#9aa59c] hover:border-[#3c4b3d] hover:text-[#f3f5f2]'
            }`}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        </div>
      </div>

      {/* Action buttons: Maps arrow, WhatsApp phone, Concluída (✓), Não entregue (X) */}
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-1.5 border-t border-[#2a322b] pt-2">
        <div className="grid min-w-0 grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => onRequestMaps(stop)}
            aria-label={`Abrir ${stop.nome} no Google Maps`}
            className="inline-flex min-h-[40px] min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-[#344038] bg-[#101411] px-1 text-[10px] font-medium text-[#e3e8e2] hover:border-[#ff873f]/50 hover:text-[#ff873f] sm:text-xs"
          >
            <Navigation className="h-3.5 w-3.5 shrink-0 text-[#ff873f]" />
            <span>Maps</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenWhatsApp(stop)}
            aria-label={`WhatsApp para ${stop.nome}`}
            className={`inline-flex min-h-[40px] min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-[#344038] bg-[#101411] px-1 text-[10px] font-medium text-[#e3e8e2] sm:text-xs ${hasPhone ? 'hover:border-[#baff27]/50 hover:text-[#baff27]' : 'hover:border-[#d5dcd4]/50'}`}
          >
            <Phone className={`h-3.5 w-3.5 shrink-0 ${hasPhone ? 'text-[#baff27]' : 'text-[#f3f5f2]'}`} />
            <span>WhatsApp</span>
          </button>
        </div>

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_40px] gap-1.5">
          <button
            type="button"
            onClick={() => onUpdateStopStatus(routeId, stop.stopId, 'concluida',
              pendingCount === 1 ? returnDurationSec : undefined)}
            aria-label={`Marcar ${stop.nome} como concluída`}
            title="Concluída"
            className="inline-flex min-h-[40px] min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg bg-[#334b20] px-1 text-[10px] font-medium text-[#baff27] hover:bg-[#baff27] hover:text-[#0d100e] sm:text-xs"
          >
            <Check className="h-3.5 w-3.5 shrink-0" />
            <span>Concluída</span>
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onRequestCancelStop(stop);
            }}
            aria-label={`Cancelar parada ${stop.nome}`}
            title="Não entregue"
            className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg bg-[#4a2d1c] text-[#ff873f] hover:bg-[#ff873f] hover:text-[#0d100e]"
          >
            <X className="h-4 w-4 shrink-0" />
            <span className="hidden">Não entregue</span>
          </button>
        </div>
      </div>
    </Reorder.Item>
  );
}

export function RouteDetailView({
  route,
  marmorarias,
  company,
  userPosition,
  geoError,
  onRequestGeo,
  onRenameRoute,
  onDeleteRoute,
  onCancelRoute,
  onCancelStop,
  onRemoveStop,
  canDelete = true,
  onOpenAddStops,
  onSelectDestination,
  onSelectCompanyDestination,
  onStopTravel,
  canSendReturnNotice,
  canSendCancellationNotice,
  onReorderPendingStops,
  onUpdateStopStatus,
  onOpenWhatsApp,
}: RouteDetailViewProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [draftName, setDraftName] = useState(route.nome);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [cancelPrompt, setCancelPrompt] = useState<null | 'route' | 'webhook'>(null);
  const cancelChoiceLock = useRef(false);
  const [stopToCancel, setStopToCancel] = useState<RouteStop | null>(null);
  const [stopCancelStep, setStopCancelStep] = useState<'confirm' | 'webhook'>('confirm');
  const stopCancelLock = useRef(false);
  const [routeMenuOpen, setRouteMenuOpen] = useState(false);
  const [stopToRemove, setStopToRemove] = useState<RouteStop | null>(null);
  const [removingStop, setRemovingStop] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [draggingStopId, setDraggingStopId] = useState<string | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizationNotice, setOptimizationNotice] = useState<string | null>(null);
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [manualOrdering, setManualOrdering] = useState(false);
  const [manualOrderIds, setManualOrderIds] = useState<string[]>([]);
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
    if (!isMapExpanded) return;
    lockPageScroll();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMapExpanded(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      unlockPageScroll();
    };
  }, [isMapExpanded]);

  useEffect(() => {
    if (!isMapExpanded) {
      setManualOrdering(false);
      setManualOrderIds([]);
    }
  }, [isMapExpanded]);

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

  const openStopMaps = (stop: RouteStop) => {
    onSelectDestination(route.id, stop.stopId, true);
    const webUrl = buildSingleStopGoogleMapsUrl(stop, userPosition);
    window.location.assign(webUrl);
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
      // GPS updates frequently. Rounding to roughly 100 m keeps the estimate useful
      // without continuously restarting the request and flashing the total.
      pts.push(`${userPosition.lat.toFixed(3)},${userPosition.lng.toFixed(3)}`);
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
  }, [pointsKey]);

  const selectStopForManualOrder = (stopId: string) => {
    if (!manualOrdering || manualOrderIds.includes(stopId)) return;
    if (!pendingStops.some((stop) => stop.stopId === stopId)) return;
    setManualOrderIds((current) => [...current, stopId]);
  };

  const saveManualOrder = () => {
    const remainingIds = orderedPending
      .map((stop) => stop.stopId)
      .filter((stopId) => !manualOrderIds.includes(stopId));
    const nextIds = [...manualOrderIds, ...remainingIds];
    const byId = new Map(orderedPending.map((stop) => [stop.stopId, stop]));
    const nextStops = nextIds.map((stopId) => byId.get(stopId)).filter((stop): stop is RouteStop => Boolean(stop));
    latestOrderRef.current = nextStops;
    setOrderedPending(nextStops);
    onReorderPendingStops(route.id, nextIds);
    setManualOrdering(false);
    setManualOrderIds([]);
    setOptimizationNotice('Nova ordem salva. Tempo e distância serão recalculados.');
  };

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

  const companyMapsUrl = company ? buildSingleStopGoogleMapsUrl(company, userPosition) : '';
  const returnDurationSec = orderedPending.length === 0 && userPosition && estimates
    ? Math.round(estimates.totalDurationSec)
    : undefined;
  const finalStopReturnDurationSec = company && orderedPending.length === 1 && estimates
    ? Math.round(estimates.legs[estimates.legs.length - 1]?.durationSec ?? 0) || undefined
    : undefined;
  const startCompanyReturn = () => {
    onSelectCompanyDestination(
      route.id,
      Boolean(canSendReturnNotice && orderedPending.length === 0 && !companyIsCurrent),
      returnDurationSec,
    );
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="relative flex flex-col gap-2 rounded-xl border border-[#242c25] bg-[#151a16] px-3 py-2.5">
        {isRenaming ? (
          <form onSubmit={handleSaveName} className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              className="min-h-[40px] flex-1 rounded-lg border border-[#323d33] bg-[#0d100e] px-3 text-sm text-[#f3f5f2] focus:border-[#baff27] focus:outline-none"
              placeholder="Nome da rota"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className="min-h-[40px] rounded-lg bg-[#baff27] px-4 text-xs font-bold text-[#0d100e]"
              >
                Salvar
              </button>
              <button
                type="button"
                onClick={() => setIsRenaming(false)}
                className="min-h-[40px] rounded-lg border border-[#283129] px-4 text-xs text-[#9aa59c]"
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-sm font-medium leading-tight text-[#f3f5f2] sm:text-base">{route.nome}</h1>
                {route.status === 'finalizada' && (
                  <p className="mt-0.5 text-[11px] font-semibold text-[#baff27]">
                    {route.stops.length > 0 && route.stops.every((stop) => stop.status === 'concluida')
                      ? 'Rota concluída' : 'Rota encerrada'}
                  </p>
                )}
                <p className="mt-1 flex items-center gap-1 text-[11px] leading-none text-[#8c978e] tabular-nums">
                  <span className="font-semibold text-[#baff27]">
                    {pendingStops.length} {pendingStops.length === 1 ? 'pendente' : 'pendentes'}
                  </span>
                  {finishedStops.length > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{finishedStops.length} {finishedStops.length === 1 ? 'finalizada' : 'finalizadas'}</span>
                    </>
                  )}
                </p>
              </div>

              <div className="relative flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setDraftName(route.nome);
                    setIsRenaming(true);
                  }}
                  aria-label="Renomear rota"
                  title="Renomear rota"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#89958b] hover:bg-[#202721] hover:text-[#d5dcd4]"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                </button>
                {canDelete && (
                  <>
                    <button
                      type="button"
                      onClick={() => setRouteMenuOpen((open) => !open)}
                      aria-label="Mais opções da rota"
                      aria-expanded={routeMenuOpen}
                      title="Mais opções"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#89958b] hover:bg-[#202721] hover:text-[#d5dcd4]"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                    {routeMenuOpen && (
                      <div className="absolute right-0 top-9 z-[650] w-44 rounded-xl border border-[#323d33] bg-[#101411] p-1.5 shadow-2xl">
                        <button
                          type="button"
                          onClick={() => {
                            setRouteMenuOpen(false);
                            setConfirmDelete(true);
                          }}
                          className="flex min-h-[40px] w-full items-center gap-2 rounded-lg px-3 text-left text-xs font-semibold text-red-400 hover:bg-red-500/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Excluir rota
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {confirmDelete && (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-2">
                <span className="text-[11px] text-red-300">Excluir esta rota?</span>
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => setConfirmDelete(false)} className="min-h-[36px] rounded-lg px-3 text-[11px] text-[#b7c0b8]">Cancelar</button>
                  <button type="button" onClick={() => onDeleteRoute(route.id)} className="min-h-[36px] rounded-lg bg-red-600 px-3 text-[11px] font-bold text-white">Excluir</button>
                </div>
              </div>
            )}
          </>
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

      {/* Mapa principal */}
      <div className={isMapExpanded ? 'route-map-fullscreen' : 'relative overflow-hidden rounded-xl border border-[#344438] bg-[#1b2a24]'}>
        <AppMap
          mode="route"
          stops={route.stops}
          company={company}
          currentDestinationStopId={route.currentDestinationStopId}
          userPosition={userPosition}
          onSelectStop={manualOrdering ? selectStopForManualOrder : undefined}
          manualOrderIds={manualOrderIds}
          manualOrderingActive={manualOrdering}
          className={isMapExpanded ? 'h-full w-full' : 'h-52 w-full sm:h-64'}
        />
        <button
          type="button"
          onClick={() => setIsMapExpanded((expanded) => !expanded)}
          aria-label={isMapExpanded ? 'Fechar mapa em tela cheia' : 'Ampliar mapa para tela cheia'}
          title={isMapExpanded ? 'Voltar ao tamanho normal' : 'Ampliar mapa'}
          className={isMapExpanded
            ? 'route-map-collapse absolute right-3 z-[500] inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#394539] bg-[#0d100e]/95 text-[#f3f5f2] shadow-lg'
            : 'absolute bottom-3 right-3 z-20 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#394539] bg-[#0d100e]/95 text-[#f3f5f2] shadow-lg hover:border-[#baff27]/60 hover:text-[#baff27]'}
        >
          {isMapExpanded ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-4 w-4" />}
        </button>
        {isMapExpanded && pendingStops.length > 1 && !manualOrdering && (
          <button type="button" onClick={() => {setManualOrdering(true); setManualOrderIds([]);}}
            className="route-map-recalculate absolute left-3 z-[500] inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#ff873f] bg-[#0d100e]/95 px-4 text-xs font-bold text-[#ff873f] shadow-lg">
            <RotateCcw className="h-4 w-4" />Recalcular rota
          </button>
        )}
        {isMapExpanded && manualOrdering && (
          <div className="route-map-order-panel absolute right-3 left-3 z-[500] rounded-2xl border border-[#baff27]/60 bg-[#0d100e]/95 p-3 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-[#f3f5f2]">Toque nas marmorarias na ordem desejada</p>
                <p className="mt-0.5 text-[11px] text-[#baff27] tabular-nums">{manualOrderIds.length} de {pendingStops.length} selecionadas</p>
              </div>
              <button type="button" disabled={manualOrderIds.length === 0}
                onClick={() => setManualOrderIds((current) => current.slice(0, -1))}
                className="min-h-[40px] rounded-lg border border-[#394539] px-3 text-[11px] font-semibold text-[#d5dcd4] disabled:opacity-40">
                Desfazer último
              </button>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <button type="button" onClick={() => setManualOrderIds([])} className="min-h-[42px] rounded-lg border border-[#394539] text-xs text-[#d5dcd4]">Limpar</button>
              <button type="button" onClick={() => {setManualOrdering(false); setManualOrderIds([]);}} className="min-h-[42px] rounded-lg border border-[#394539] text-xs text-[#d5dcd4]">Cancelar</button>
              <button type="button" disabled={manualOrderIds.length === 0} onClick={saveManualOrder}
                className="min-h-[42px] rounded-lg bg-[#baff27] px-2 text-xs font-bold text-[#0d100e] disabled:opacity-40">Salvar ordem</button>
            </div>
          </div>
        )}
      </div>

      <p className="flex items-center gap-1.5 px-0.5 text-[10px] leading-relaxed text-[#9aa59c]">
        <Info className="h-3 w-3 shrink-0 text-[#ff873f]" />
        <span>O Google Maps atualiza o tempo ao abrir a rota.</span>
      </p>

      {/* GPS, tempo, distância e abertura no Maps */}
      <div className="space-y-3 rounded-xl border border-[#344438] bg-[#151a16] p-3">
        <div className="flex items-center justify-between gap-2 border-b border-[#2b352d] pb-3 text-[11px]">
          <span className="flex min-w-0 items-center gap-1.5 text-[#c7d0c8]">
            <Navigation className="h-3 w-3 shrink-0 text-[#baff27]" />
            <span className="truncate">
              {userPosition ? 'Partida: GPS ativo' : geoError || 'Partida: aguardando GPS'}
            </span>
          </span>
          {!userPosition && (
            <button
              type="button"
              onClick={onRequestGeo}
              className="inline-flex min-h-[34px] shrink-0 items-center gap-1.5 rounded-lg border border-[#baff27]/40 px-2.5 font-semibold text-[#baff27]"
            >
              <LocateFixed className="h-3.5 w-3.5" />
              <span>Usar meu GPS</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 text-[10px] uppercase tracking-wide text-[#89958b] tabular-nums">
          <div>
            <p>Tempo total</p>
            <p className="mt-1 text-xs font-semibold normal-case tracking-normal text-[#baff27]">
              {estimates ? `~${formatDurationPt(estimates.totalDurationSec)}` : estimatesLoading ? 'Calculando...' : 'Aguardando GPS'}
            </p>
          </div>
          <div>
            <div>
              <p>Distância</p>
              <p className="mt-1 text-xs font-medium normal-case tracking-normal text-[#f3f5f2]">
                {estimates ? formatDistancePt(estimates.totalDistanceMeters) : '—'}
              </p>
            </div>
          </div>
        </div>

        {!userPosition && orderedPending.length === 1 && (
          <p className="text-[11px] text-[#7b877e]">Use seu GPS para estimar o tempo até a parada.</p>
        )}

        {mapsSegments.length === 0 ? (
          <p className="text-xs text-[#7b877e]">Adicione paradas pendentes para abrir a navegação no Google Maps.</p>
        ) : mapsSegments.length === 1 ? (
          <button
            type="button"
            onClick={() => {
              const firstStop = activeDest || orderedPending[0];
              if (firstStop) requestMaps(firstStop, mapsSegments[0].url);
            }}
            className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-lg bg-[#baff27] px-4 py-2.5 text-xs font-bold text-[#0d100e] transition-transform active:scale-[0.98]"
          >
            <Navigation className="h-3.5 w-3.5" />
            <span>Abrir rota no Google Maps</span>
            <ExternalLink className="h-3 w-3" />
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-[11px] font-medium text-[#ff873f]">Rota dividida em partes por causa do limite do Google Maps:</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {mapsSegments.map((seg) => (
                <button
                  key={seg.partIndex}
                  onClick={() => {
                    const targetStop = orderedPending[seg.startStopNumber - 1] || orderedPending[0];
                    if (targetStop) requestMaps(targetStop, seg.url);
                  }}
                  type="button"
                  className="flex min-h-[44px] items-center justify-between rounded-lg bg-[#baff27] px-4 py-2 text-xs font-bold text-[#0d100e] transition-transform active:scale-[0.98]"
                >
                  <span>{seg.label}</span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* Controles e lista de paradas */}
      <div className="space-y-2 pt-0.5">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-medium text-[#f3f5f2]">Paradas da rota</h2>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void handleOptimizeRoute()}
            disabled={optimizing || pendingStops.length < 2}
            className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg border border-[#ff873f] px-3 py-2 text-xs font-semibold text-[#ff873f] hover:bg-[#ff873f]/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Zap className="h-3.5 w-3.5" />
            <span className="whitespace-nowrap">{optimizing ? 'Otimizando...' : 'Otimizar'}</span>
          </button>
          <button
            type="button"
            onClick={onOpenAddStops}
            className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg border border-[#baff27]/70 px-3 py-2 text-xs font-semibold text-[#baff27] hover:bg-[#baff27]/10"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="whitespace-nowrap">Adicionar paradas</span>
          </button>
        </div>
      </div>

      <div className="space-y-4">
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
                          returnDurationSec={finalStopReturnDurationSec}
                          routeId={route.id}
                          canDelete={canDelete}
                          onRequestMaps={openStopMaps}
                          onRequestRemove={(item) => {setRemoveError(null); setStopToRemove(item);}}
                          onRequestCancelStop={(stop) => {
                            if (stop.status !== 'pendente') return;
                            stopCancelLock.current = false;
                            setStopToCancel(stop);
                            setStopCancelStep('confirm');
                          }}
                          onUpdateStopStatus={onUpdateStopStatus}
                          onOpenWhatsApp={onOpenWhatsApp}
                          onDragStart={(id) => {
                            isDraggingRef.current = true;
                            setDraggingStopId(id);
                          }}
                          onDragEnd={() => {
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
                    <a href={companyMapsUrl} target="_blank" rel="noopener noreferrer" onClick={startCompanyReturn} aria-label="Abrir empresa no Google Maps" className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[#baff27]/40 px-3 text-xs font-bold text-[#baff27]"><Navigation className="h-4 w-4" /> Maps</a>
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
      {cancelPrompt === 'route' && (
        <div className="app-modal-backdrop app-modal-centered fixed inset-0 z-[1000] flex items-center justify-center bg-black/75 px-4" role="presentation" onMouseDown={(event) => {if (event.target === event.currentTarget) setCancelPrompt(null);}}>
          <div role="dialog" aria-modal="true" aria-labelledby="confirm-cancel-route-title" className="w-full max-w-sm rounded-2xl border border-[#394539] bg-[#151a16] p-5 shadow-2xl">
            <h2 id="confirm-cancel-route-title" className="text-lg font-bold text-[#f3f5f2]">Cancelar {route.nome}?</h2>
            <p className="mt-2 text-sm text-[#bdc7bd]">A rota será encerrada e as paradas não concluídas continuarão registradas no histórico.</p>
            <div className="mt-5 flex flex-col gap-2">
              <button type="button" onClick={() => {
                if (canSendCancellationNotice) {setCancelPrompt('webhook'); return;}
                if (cancelChoiceLock.current) return;
                cancelChoiceLock.current = true;
                onCancelRoute(route.id, false);
                setCancelPrompt(null);
              }} className="min-h-[46px] rounded-xl bg-[#ff873f] px-4 text-sm font-bold text-[#0d100e]">Confirmar cancelamento</button>
              <button type="button" onClick={() => setCancelPrompt(null)} className="min-h-[46px] rounded-xl border border-[#394539] px-4 text-sm font-semibold text-[#f3f5f2]">Não cancelar</button>
            </div>
          </div>
        </div>
      )}
      {cancelPrompt === 'webhook' && (
        <div className="app-modal-backdrop app-modal-centered fixed inset-0 z-[1000] flex items-center justify-center bg-black/75 px-4" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="confirm-cancel-webhook-title" className="w-full max-w-sm rounded-2xl border border-[#394539] bg-[#151a16] p-5 shadow-2xl">
            <h2 id="confirm-cancel-webhook-title" className="text-lg font-bold text-[#f3f5f2]">Enviar aviso de cancelamento?</h2>
            <p className="mt-2 text-sm text-[#bdc7bd]">A rota {route.nome} será cancelada de qualquer forma. Deseja enviar o aviso pelo WhatsApp?</p>
            <div className="mt-5 flex flex-col gap-2">
              <button type="button" onClick={() => {
                if (cancelChoiceLock.current) return;
                cancelChoiceLock.current = true;
                onCancelRoute(route.id, true);
                setCancelPrompt(null);
              }} className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-[#baff27] px-4 text-sm font-bold text-[#0d100e]">
                <Check className="h-4 w-4" />Enviar aviso
              </button>
              <button type="button" onClick={() => {
                if (cancelChoiceLock.current) return;
                cancelChoiceLock.current = true;
                onCancelRoute(route.id, false);
                setCancelPrompt(null);
              }} className="min-h-[46px] rounded-xl border border-[#394539] px-4 text-sm font-semibold text-[#f3f5f2]">Não enviar</button>
            </div>
          </div>
        </div>
      )}
      {stopToCancel && createPortal(
        stopCancelStep === 'confirm' ? (
          <div className="app-modal-backdrop app-modal-centered fixed inset-0 z-[2000] flex items-center justify-center bg-black/75 px-4" role="presentation" onMouseDown={(event) => {if (event.target === event.currentTarget) setStopToCancel(null);}}>
            <div role="dialog" aria-modal="true" aria-labelledby="confirm-cancel-stop-title" className="w-full max-w-sm rounded-2xl border border-[#394539] bg-[#151a16] p-5 shadow-2xl">
              <h2 id="confirm-cancel-stop-title" className="text-lg font-bold text-[#f3f5f2]">Cancelar parada {stopToCancel.nome}?</h2>
              <p className="mt-2 text-sm text-[#bdc7bd]">A parada sai da lista de pendentes e fica registrada como não entregue.</p>
              <div className="mt-5 flex flex-col gap-2">
                <button type="button" onClick={() => {
                  if (canSendCancellationNotice) {setStopCancelStep('webhook'); return;}
                  if (stopCancelLock.current) return;
                  stopCancelLock.current = true;
                  onCancelStop(route.id, stopToCancel.stopId, false);
                  setStopToCancel(null);
                }} className="min-h-[46px] rounded-xl bg-[#ff873f] px-4 text-sm font-bold text-[#0d100e]">Confirmar cancelamento</button>
                <button type="button" onClick={() => setStopToCancel(null)} className="min-h-[46px] rounded-xl border border-[#394539] px-4 text-sm font-semibold text-[#f3f5f2]">Não cancelar</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="app-modal-backdrop app-modal-centered fixed inset-0 z-[2000] flex items-center justify-center bg-black/75 px-4" role="presentation">
            <div role="dialog" aria-modal="true" aria-labelledby="confirm-cancel-stop-webhook-title" className="w-full max-w-sm rounded-2xl border border-[#394539] bg-[#151a16] p-5 shadow-2xl">
              <h2 id="confirm-cancel-stop-webhook-title" className="text-lg font-bold text-[#f3f5f2]">Enviar aviso de cancelamento?</h2>
              <p className="mt-2 text-sm text-[#bdc7bd]">A parada {stopToCancel.nome} será cancelada de qualquer forma. Deseja enviar o aviso pelo WhatsApp?</p>
              <div className="mt-5 flex flex-col gap-2">
                <button type="button" onClick={() => {
                  if (stopCancelLock.current) return;
                  stopCancelLock.current = true;
                  onCancelStop(route.id, stopToCancel.stopId, true);
                  setStopToCancel(null);
                }} className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-[#baff27] px-4 text-sm font-bold text-[#0d100e]">
                  <Check className="h-4 w-4" />Enviar aviso
                </button>
                <button type="button" onClick={() => {
                  if (stopCancelLock.current) return;
                  stopCancelLock.current = true;
                  onCancelStop(route.id, stopToCancel.stopId, false);
                  setStopToCancel(null);
                }} className="min-h-[46px] rounded-xl border border-[#394539] px-4 text-sm font-semibold text-[#f3f5f2]">Não enviar</button>
              </div>
            </div>
          </div>
        ),
        document.body,
      )}
      {stopToRemove && (
        <div className="app-modal-backdrop app-modal-centered fixed inset-0 z-[1000] flex items-center justify-center bg-black/75 px-4" role="presentation" onMouseDown={(event) => {if (!removingStop && event.target === event.currentTarget) setStopToRemove(null);}}>
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
        <div className="app-modal-backdrop fixed inset-0 z-[1000] flex items-center justify-center bg-black/75 px-4" role="presentation" onMouseDown={(event) => {if (event.target === event.currentTarget) setMapsConfirmation(null);}}>
          <div role="dialog" aria-modal="true" aria-labelledby="confirm-maps-title" className="w-full max-w-sm rounded-2xl border border-[#394539] bg-[#151a16] p-5 shadow-2xl">
            <h2 id="confirm-maps-title" className="text-lg font-bold text-[#f3f5f2]">Ir para este destino?</h2>
            <p className="mt-2 text-sm text-[#bdc7bd]">Ao confirmar, <strong className="text-[#baff27]">{mapsConfirmation.name}</strong> aparecerá na rota como seu destino atual e o Google Maps será aberto.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setMapsConfirmation(null)} className="min-h-[44px] rounded-xl border border-[#394539] px-4 text-sm text-[#e3e8e2]">Cancelar</button>
              <a href={mapsConfirmation.url} target="_blank" rel="noopener noreferrer" onClick={() => {onSelectDestination(route.id, mapsConfirmation.stopId, true); setMapsConfirmation(null);}} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#ff873f] px-4 text-sm font-bold text-[#0d100e]"><Navigation className="h-4 w-4" />Confirmar e abrir Maps</a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

