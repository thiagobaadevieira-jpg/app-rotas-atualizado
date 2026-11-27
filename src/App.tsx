import {AlertCircle, BarChart3, Check, CheckCircle2, Loader2, LogOut, MapPin, Route as RouteIcon, Send, Settings, WifiOff, X} from 'lucide-react';
import {lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {AddressesView} from './components/AddressesView.tsx';
import {LoginScreen} from './components/LoginScreen.tsx';
import {PhoneModal} from './components/PhoneModal.tsx';
import {RoutesListView} from './components/RoutesListView.tsx';
import {DEFAULT_WHATSAPP_TEMPLATES} from './data/demoData.ts';
import {useOnlineStatus} from './hooks/useOnlineStatus.ts';
import {useRouteDistances} from './hooks/useRouteDistances.ts';
import {loadAppBootstrap, supabase} from './lib/supabase.ts';
import type {AppData, Profile} from './lib/supabase.ts';
import {buildCancellationNotice, buildStopCancellationNotice} from './lib/cancellationNotice.ts';
import type {CancellationNotice} from './lib/cancellationNotice.ts';
import {cacheData, clearLastOfflineUser, flushChanges, lastOfflineUser, newChangeId, queueChange, readOffline, readWebhookStatus} from './lib/offlineStore.ts';
import type {PendingChange, WebhookDispatchStatus, WebhookHistoryItem} from './lib/offlineStore.ts';
import {arrivedDestinationId, COMPANY_DESTINATION_ID, getArrivedStopId, HOME_DESTINATION_ID} from './types.ts';
import type {
  Coordinates,
  CompanyLocation,
  FinalDestinationType,
  Marmoraria,
  RoutePlan,
  RouteStop,
  TabId,
  WhatsAppTemplate,
} from './types.ts';
import {extractFirstUrl, haversineMeters, isGoogleMapsUrl, parseCoordinatesInput} from './utils/geo.ts';
import {collectionsFromRoutes} from './utils/collections.ts';

const THIAGO_USER_ID = '1e5dc7d4-d1a1-47c4-b06b-21b2021b77ec';
const GEO_POSITION_CACHE_KEY = 'rota-italik:last-position:v1';
const GEO_POSITION_CACHE_MAX_AGE = 30 * 60 * 1000;

const RouteDetailView = lazy(() => import('./components/RouteDetailView.tsx')
  .then((module) => ({default: module.RouteDetailView})));
const ReportsView = lazy(() => import('./components/ReportsView.tsx')
  .then((module) => ({default: module.ReportsView})));
const SettingsModal = lazy(() => import('./components/SettingsModal.tsx')
  .then((module) => ({default: module.SettingsModal})));
const MarmorariaModal = lazy(() => import('./components/MarmorariaModal.tsx')
  .then((module) => ({default: module.MarmorariaModal})));
const WhatsAppModal = lazy(() => import('./components/WhatsAppModal.tsx')
  .then((module) => ({default: module.WhatsAppModal})));
const CreateRouteModal = lazy(() => import('./components/CreateRouteModal.tsx')
  .then((module) => ({default: module.CreateRouteModal})));
const AddStopsModal = lazy(() => import('./components/AddStopsModal.tsx')
  .then((module) => ({default: module.AddStopsModal})));

const ViewLoading = () => (
  <div role="status" className="flex min-h-48 items-center justify-center text-sm text-[#9aa59c]">
    <Loader2 className="mr-2 h-4 w-4 animate-spin text-[#baff27]" />Carregando...
  </div>
);

const readCachedPosition = (): Coordinates | null => {
  try {
    const raw = localStorage.getItem(GEO_POSITION_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as Coordinates & {savedAt?: number};
    if (!Number.isFinite(cached.lat) || !Number.isFinite(cached.lng) ||
        !cached.savedAt || Date.now() - cached.savedAt > GEO_POSITION_CACHE_MAX_AGE) {
      localStorage.removeItem(GEO_POSITION_CACHE_KEY);
      return null;
    }
    return {lat: cached.lat, lng: cached.lng};
  } catch {
    return null;
  }
};

const cachePosition = (position: Coordinates) => {
  try {
    localStorage.setItem(GEO_POSITION_CACHE_KEY, JSON.stringify({...position, savedAt: Date.now()}));
  } catch {
    // Some private browsing modes block storage; the in-memory position still works.
  }
};

const webhookTime = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});
};

const webhookDateTime = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
};

const webhookStateLabel: Record<WebhookHistoryItem['state'], string> = {
  pending: 'Pendente',
  sent: 'Enviado',
  failed: 'Falhou',
};

export default function App() {
  const isOnline = useOnlineStatus();
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [remote, setRemote] = useState<AppData | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [webhookStatus, setWebhookStatus] = useState<WebhookDispatchStatus | null>(null);
  const [webhookPanelOpen, setWebhookPanelOpen] = useState(false);
  const [completionToConfirm, setCompletionToConfirm] = useState<{routeId: string; stopId: string; name: string; returnDurationSec?: number; step: 'notice' | 'destination'} | null>(null);
  const syncingRef = useRef(false);
  const syncAgainRef = useRef(false);

  const syncOfflineData = useCallback(async (id: string) => {
    if (!navigator.onLine || syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      await flushChanges(id, setPendingCount);
      setWebhookStatus(readWebhookStatus(id));
      const {profile: nextProfile, data: nextData} = await loadAppBootstrap(id);
      if ((readOffline(id)?.pending || []).every((change) => change.kind === 'notifyDelivery' || change.kind === 'notifyReturn' || change.kind === 'notifyCancellation')) {
        cacheData(id, nextProfile, nextData);
        setProfile(nextProfile);
        setRemote(nextData);
        setPendingCount(readOffline(id)?.pending.length || 0);
      }
      setDataError(null);
    } catch (error) {
      setWebhookStatus(readWebhookStatus(id));
      setPendingCount(readOffline(id)?.pending.length || 0);
      if (navigator.onLine) {
        setDataError(error instanceof Error ? `Sincronização pendente: ${error.message}` : 'Sincronização pendente.');
      }
    } finally {
      syncingRef.current = false;
      setSyncing(false);
      if (syncAgainRef.current && navigator.onLine) {
        syncAgainRef.current = false;
        setTimeout(() => void syncOfflineData(id), 0);
      }
    }
  }, []);

  useEffect(() => {
    if (!supabase) {setAuthReady(true); return;}
    let mounted = true;
    const cachedId = lastOfflineUser();
    const cachedSnapshot = cachedId ? readOffline(cachedId) : null;
    let authTimeout: number | null = null;

    // Open the last valid local snapshot immediately. iOS can report
    // navigator.onLine=true even when the network is not actually reachable.
    if (cachedId && cachedSnapshot?.profile.active) {
      setUserId(cachedId);
      setAuthReady(true);
    }

    if (!navigator.onLine) {
      if (!cachedSnapshot) setAuthReady(true);
    } else {
      authTimeout = window.setTimeout(() => {
        if (!mounted) return;
        setUserId((current) => current || (cachedSnapshot ? cachedId : null));
        setAuthReady(true);
      }, 6000);
      void supabase.auth.getUser().then(({data, error}) => {
        if (!mounted) return;
        if (authTimeout !== null) window.clearTimeout(authTimeout);
        const fallback = error && cachedSnapshot ? cachedId : null;
        setUserId(data.user?.id || fallback);
        setAuthReady(true);
      }).catch(() => {
        if (authTimeout !== null) window.clearTimeout(authTimeout);
        if (mounted) {setUserId(cachedSnapshot ? cachedId : null); setAuthReady(true);}
      });
    }
    const {data: listener} = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'SIGNED_OUT' && !navigator.onLine && lastOfflineUser()) return;
      if (session?.user.id) setUserId(session.user.id);
      else if (event === 'SIGNED_OUT') setUserId(null);
    });
    return () => {
      mounted = false;
      if (authTimeout !== null) window.clearTimeout(authTimeout);
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!userId) {setProfile(null); setRemote(null); setPendingCount(0); setWebhookStatus(null); return;}
    const snapshot = readOffline(userId);
    setWebhookStatus(readWebhookStatus(userId));
    if (snapshot?.profile.active) {
      setProfile(snapshot.profile);
      setRemote(snapshot.data);
      setPendingCount(snapshot.pending.length);
    }
    if (navigator.onLine) {
      void syncOfflineData(userId);
    } else if (!snapshot) {
      setDataError('Conecte-se à internet uma vez para carregar suas rotas neste aparelho.');
    }
  }, [userId, syncOfflineData]);

  useEffect(() => {
    if (isOnline && userId && authReady) void syncOfflineData(userId);
  }, [isOnline, userId, authReady, syncOfflineData]);

  useEffect(() => {
    if (!supabase || !userId) return;
    let refreshTimer: number | null = null;

    const requestRefresh = () => {
      if (!navigator.onLine) return;
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        if (syncingRef.current) syncAgainRef.current = true;
        else void syncOfflineData(userId);
      }, 700);
    };

    const channel = supabase
      .channel(`app-data-${userId}`)
      .on('postgres_changes', {event: '*', schema: 'public', table: 'marmorarias'}, requestRefresh)
      .on('postgres_changes', {event: '*', schema: 'public', table: 'routes'}, requestRefresh)
      .on('postgres_changes', {event: '*', schema: 'public', table: 'route_stops'}, requestRefresh)
      .on('postgres_changes', {event: '*', schema: 'public', table: 'whatsapp_templates'}, requestRefresh)
      .on('postgres_changes', {event: '*', schema: 'public', table: 'app_settings'}, requestRefresh)
      .subscribe();

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') requestRefresh();
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      void supabase.removeChannel(channel);
    };
  }, [userId, syncOfflineData]);

  const commitChange = useCallback(async (nextData: AppData, change: PendingChange) => {
    if (!userId || !profile) throw new Error('Entre novamente para salvar alterações.');
    const count = queueChange(userId, profile, nextData, change);
    setWebhookStatus(readWebhookStatus(userId));
    setRemote(nextData);
    setPendingCount(count);
    setDataError(null);
    if (navigator.onLine) {
      if (syncingRef.current) syncAgainRef.current = true;
      else void syncOfflineData(userId);
    }
  }, [userId, profile, syncOfflineData]);

  const reportError = (error: unknown) => {
    setDataError(error instanceof Error ? error.message : 'Não foi possível salvar. Tente novamente.');
  };

  const marmorarias = remote?.marmorarias || [];
  const routes = remote?.routes || [];
  const templates = remote?.templates || DEFAULT_WHATSAPP_TEMPLATES;
  const currentUserName = profile?.display_name || 'Você';
  const collections = useMemo(() => collectionsFromRoutes(routes, marmorarias), [routes, marmorarias]);

  const collectionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    collections.forEach((record) => {counts[record.marmorariaId] = (counts[record.marmorariaId] || 0) + 1;});
    return counts;
  }, [collections]);

  // Navigation & UI state
  const [activeTab, setActiveTab] = useState<TabId>('rotas');
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [createRouteOpen, setCreateRouteOpen] = useState(false);
  const [addStopsOpen, setAddStopsOpen] = useState(false);

  // Marmoraria Modal state
  const [marmModalOpen, setMarmModalOpen] = useState(false);
  const [editingMarm, setEditingMarm] = useState<Marmoraria | null>(null);
  const [marmModalCoords, setMarmModalCoords] = useState<Coordinates | null>(null);
  const [marmModalName, setMarmModalName] = useState<string>('');
  const [marmModalMapOpen, setMarmModalMapOpen] = useState(false);
  const [shareNotice, setShareNotice] = useState<string | null>(null);
  const [directTravel, setDirectTravel] = useState<{
    driverName: string;
    destinationName: string;
    marmorariaId: string | null;
    routeId: string | null;
    updatedAt: string;
  } | null>(null);

  useEffect(() => {
    if (!userId) setDirectTravel(null);
  }, [userId]);

  // WhatsApp Modal state
  const [whatsAppTarget, setWhatsAppTarget] = useState<{
    name: string;
    phone: string;
  } | null>(null);
  const [phoneTarget, setPhoneTarget] = useState<Marmoraria | null>(null);

  const openWhatsAppFor = (target: Marmoraria | RouteStop) => {
    const saved = marmorarias.find((m) => m.id === ('marmorariaId' in target ? target.marmorariaId : target.id))
      || marmorarias.find((m) => m.lat === target.lat && m.lng === target.lng);
    const phone = saved?.telefone ?? target.telefone;
    if (!phone.trim() && saved) {
      setPhoneTarget(saved);
    } else {
      setWhatsAppTarget({name: target.nome, phone});
    }
  };

  const saveCustomerPhone = async (marmoraria: Marmoraria, phone: string) => {
    if (!remote) throw new Error('Dados indisponíveis.');
    const updated = {...marmoraria, telefone: phone, updatedAt: new Date().toISOString()};
    await commitChange({
      ...remote,
      marmorarias: remote.marmorarias.map((m) => m.id === updated.id ? updated : m),
    }, {id: newChangeId(), kind: 'saveMarmoraria', value: updated});
    setPhoneTarget(null);
    setWhatsAppTarget({name: updated.nome, phone});
  };

  // Browser Geolocation state
  const [userPosition, setUserPosition] = useState<Coordinates | null>(() => readCachedPosition());
  const [geoError, setGeoError] = useState<string | null>(null);
  const [geoPermissionGranted, setGeoPermissionGranted] = useState(false);
  const geoRequestInFlightRef = useRef(false);
  const lastGeoCommitRef = useRef<{position: Coordinates; at: number} | null>(
    userPosition ? {position: userPosition, at: Date.now()} : null
  );
  const commitGeoPosition = useCallback((position: Coordinates, force = false) => {
    const now = Date.now();
    const last = lastGeoCommitRef.current;
    if (!force && last && now - last.at < 15000 && haversineMeters(last.position, position) < 12) return;
    lastGeoCommitRef.current = {position, at: now};
    setUserPosition(position);
    cachePosition(position);
  }, []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const company = remote?.company || null;
  const home = remote?.home || null;
  const routeDistancesEnabled = activeTab === 'relatorios' || (activeTab === 'rotas' && !selectedRouteId);
  const {distances: routeDistances, loading: distancesLoading} = useRouteDistances(
    routes, company, routeDistancesEnabled, userPosition
  );
  const offlinePendingChanges = useMemo(
    () => userId ? readOffline(userId)?.pending || [] : [],
    [userId, pendingCount, webhookStatus]
  );

  // Handle PWA Web Share Target incoming URL parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedTitle = params.get('title') || '';
    const sharedText = params.get('text') || '';
    const sharedUrl = params.get('url') || '';
    const isShareRoute = window.location.pathname === '/share-target';

    if (!isShareRoute && !sharedUrl && !sharedText && !sharedTitle) {
      return;
    }

    const combined = `${sharedUrl} ${sharedText}`.trim();
    window.history.replaceState({}, '', '/');

    const handleShare = async () => {
      setActiveTab('enderecos');
      setSelectedRouteId(null);
      setEditingMarm(null);
      setMarmModalMapOpen(false);

      // Clean name hint from title
      const cleanName = sharedTitle
        .replace(/-\s*Google Maps$/i, '')
        .replace(/Google Maps/i, '')
        .trim();
      setMarmModalName(cleanName);

      const directCoords = parseCoordinatesInput(combined);
      if (directCoords) {
        setMarmModalCoords(directCoords);
        setShareNotice('Local recebido do Google Maps com coordenadas preenchidas.');
        setMarmModalOpen(true);
        return;
      }

      const candidateUrl = extractFirstUrl(combined);
      if (candidateUrl && isGoogleMapsUrl(candidateUrl)) {
        try {
          const res = await fetch('/api/maps/resolve-link', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({url: candidateUrl}),
          });
          const data = (await res.json()) as {coordinates?: Coordinates | null};
          if (data.coordinates) {
            setMarmModalCoords(data.coordinates);
            setShareNotice('Link do Google Maps lido e coordenadas preenchidas.');
            setMarmModalOpen(true);
            return;
          }
        } catch {
          // Fall through to manual coordinate instruction
        }
      }

      setMarmModalCoords(null);
      setShareNotice(
        'Não foi possível extrair as coordenadas automaticamente deste compartilhamento. Cole as coordenadas manualmente abaixo ou marque o ponto no mapa.'
      );
      setMarmModalOpen(true);
    };

    void handleShare();
  }, []);

  const activeRoute = useMemo(
    () => routes.find((r) => r.id === selectedRouteId) || null,
    [routes, selectedRouteId]
  );

  // Current position is only used on the open route for navigation and estimates.
  const shouldWatchGeo = Boolean(selectedRouteId);

  const requestGeolocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setGeoError('Seu navegador não suporta geolocalização.');
      return;
    }
    if (geoRequestInFlightRef.current) return;
    geoRequestInFlightRef.current = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        geoRequestInFlightRef.current = false;
        const coords = {lat: pos.coords.latitude, lng: pos.coords.longitude};
        commitGeoPosition(coords, true);
        setGeoPermissionGranted(true);
        setGeoError(null);
      },
      () => {
        geoRequestInFlightRef.current = false;
        setGeoPermissionGranted(false);
        setGeoError('Permissão de localização recusada ou indisponível.');
      },
      {enableHighAccuracy: true, maximumAge: 60000, timeout: 10000}
    );
  }, [commitGeoPosition]);

  useEffect(() => {
    if (!shouldWatchGeo || !('permissions' in navigator)) return;
    let disposed = false;
    let permissionStatus: PermissionStatus | null = null;

    void navigator.permissions.query({name: 'geolocation'}).then((status) => {
      if (disposed) return;
      permissionStatus = status;
      const syncPermission = () => {
        if (disposed) return;
        setGeoPermissionGranted(status.state === 'granted');
        if (status.state === 'denied') {
          setGeoError('Permissão de localização bloqueada no navegador.');
        }
      };
      syncPermission();
      status.onchange = syncPermission;
    }).catch(() => {
      // Safari without Permissions API support waits for the explicit GPS button.
    });

    return () => {
      disposed = true;
      if (permissionStatus) permissionStatus.onchange = null;
    };
  }, [shouldWatchGeo]);

  useEffect(() => {
    if (!shouldWatchGeo || !geoPermissionGranted || !('geolocation' in navigator)) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const coords = {lat: pos.coords.latitude, lng: pos.coords.longitude};
        commitGeoPosition(coords);
        setGeoError(null);
      },
      () => {
        setGeoError('Localização indisponível. Verifique a permissão do navegador.');
      },
      {enableHighAccuracy: true, maximumAge: 10000, timeout: 15000}
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [shouldWatchGeo, geoPermissionGranted, commitGeoPosition]);

  const persistRouteUpdate = useCallback((updatedRoute: RoutePlan, completedStopId?: string, sendReturnNotice = false, returnDurationSec?: number, sendCancellationNotice = false, cancellationNotice?: CancellationNotice, deliveryReturnDurationSec?: number, deliveryFinalDestinationType?: FinalDestinationType) => {
    const previous = remote?.routes.find((r) => r.id === updatedRoute.id);
    if (!remote) return;
    const nextData = {...remote, routes: remote.routes.map((r) => r.id === updatedRoute.id ? updatedRoute : r)};
    void commitChange(nextData, {id: newChangeId(), kind: 'saveRoute', value: updatedRoute,
      previousStopIds: previous?.stops.map((s) => s.stopId) || [],
      notifyStopId: completedStopId,
      notifyAt: completedStopId ? updatedRoute.stops.find((s) => s.stopId === completedStopId)?.updatedAt : undefined,
      deliveryReturnDurationSec: completedStopId ? deliveryReturnDurationSec : undefined,
      deliveryFinalDestinationType: completedStopId ? deliveryFinalDestinationType : undefined,
      notifyReturnAt: sendReturnNotice ? updatedRoute.updatedAt : undefined,
      returnDurationSec: sendReturnNotice ? returnDurationSec : undefined,
      notifyCancellationAt: sendCancellationNotice ? updatedRoute.updatedAt : undefined,
      cancellationNotice: sendCancellationNotice ? cancellationNotice : undefined,
    }).catch(reportError);
  }, [remote, commitChange]);

  const handleOpenRoute = useCallback(
    (routeId: string) => {
      setActiveTab('rotas');
      setSelectedRouteId(routeId);
    },
    []
  );

  const handleCreateRoute = async (nome: string, selectedMarmIds: string[]) => {
    const now = new Date().toISOString();
    const stops: RouteStop[] = selectedMarmIds
      .map((mId, index): RouteStop | null => {
        const m = marmorarias.find((item) => item.id === mId);
        if (!m) return null;
        return {
          stopId: `stop-${Date.now()}-${index}`,
          marmorariaId: m.id,
          nome: m.nome,
          cidade: m.cidade,
          telefone: m.telefone,
          lat: m.lat,
          lng: m.lng,
          status: 'pendente',
        };
      })
      .filter((s): s is RouteStop => s !== null);

    const newRoute: RoutePlan = {
      id: `route-${Date.now()}`,
      nome,
      stops,
      status: stops.length > 0 ? 'em_andamento' : 'planejada',
      currentDestinationStopId: null,
      activeDriverName: stops.length > 0 ? currentUserName : null,
      createdByUserId: profile?.id || '',
      createdByName: currentUserName,
      createdAt: now,
      updatedAt: now,
    };

    try {
      if (!remote) throw new Error('Dados indisponíveis.');
      await commitChange({...remote, routes: [newRoute, ...remote.routes]},
        {id: newChangeId(), kind: 'saveRoute', value: newRoute, previousStopIds: []});
    } catch (error) {reportError(error); return;}
    setActiveTab('rotas');
    setSelectedRouteId(newRoute.id);
  };

  const handleRenameRoute = (routeId: string, newName: string) => {
    const target = routes.find((r) => r.id === routeId);
    if (!target) return;
    void persistRouteUpdate({...target, nome: newName, updatedAt: new Date().toISOString()});
  };

  const handleDeleteRoute = async (routeId: string) => {
    if (profile?.role !== 'admin') return;
    try {
      if (!remote) throw new Error('Dados indisponíveis.');
      await commitChange({...remote, routes: remote.routes.filter((r) => r.id !== routeId)},
        {id: newChangeId(), kind: 'deleteRoute', value: routeId});
    } catch (error) {reportError(error); return;}
    setSelectedRouteId(null);
  };

  const handleCancelRoute = (routeId: string, sendNotice: boolean) => {
    const target = routes.find((route) => route.id === routeId);
    if (!target) return;
    const updatedAt = new Date().toISOString();
    const allowNotice = sendNotice && profile?.id === THIAGO_USER_ID && profile.role === 'admin';
    setDirectTravel((previous) => previous?.routeId === routeId ? null : previous);
    persistRouteUpdate({
      ...target,
      status: 'finalizada',
      currentDestinationStopId: null,
      activeDriverName: null,
      updatedAt,
    }, undefined, false, undefined, allowNotice, allowNotice ? buildCancellationNotice(target, routes) : undefined);
  };

  const handleRemoveStop = async (routeId: string, stopId: string) => {
    if (profile?.role !== 'admin') throw new Error('Somente um administrador pode excluir paradas.');
    const target = routes.find((route) => route.id === routeId);
    if (!target?.stops.some((stop) => stop.stopId === stopId)) {
      throw new Error('Parada não encontrada. Abra a rota novamente.');
    }
    const stops = target.stops.filter((stop) => stop.stopId !== stopId);
    const nextRoute: RoutePlan = {
      ...target,
      stops,
      status: target.status === 'finalizada' ? 'finalizada' : stops.length > 0 ? 'em_andamento' : 'planejada',
      currentDestinationStopId: target.currentDestinationStopId === stopId || getArrivedStopId(target.currentDestinationStopId) === stopId
        ? null : target.currentDestinationStopId,
      updatedAt: new Date().toISOString(),
    };
    try {
      if (!remote) throw new Error('Dados indisponíveis.');
      await commitChange({...remote, routes: remote.routes.map((route) => route.id === routeId ? nextRoute : route)},
        {id: newChangeId(), kind: 'saveRoute', value: nextRoute, previousStopIds: target.stops.map((stop) => stop.stopId)});
      if (target.currentDestinationStopId === stopId) {
        setDirectTravel((prev) => prev?.routeId === routeId ? null : prev);
      }
      setDataError(null);
    } catch (error) {
      reportError(error);
      throw error;
    }
  };

  const handleApplyRouteStops = async (selectedMarmIds: string[]) => {
    if (!activeRoute) throw new Error('Rota não encontrada. Abra a rota novamente.');

    const existingByMarmId = new Map<string, RouteStop>();
    activeRoute.stops.forEach((s) => existingByMarmId.set(s.marmorariaId, s));

    const nextPending: RouteStop[] = [];
    const nextFinished: RouteStop[] = [];

    selectedMarmIds.forEach((mId, idx) => {
      const existing = existingByMarmId.get(mId);
      if (existing) {
        if (existing.status === 'pendente') nextPending.push(existing);
        else nextFinished.push(existing);
      } else {
        const m = marmorarias.find((item) => item.id === mId);
        if (m) {
          nextPending.push({
            stopId: `stop-${Date.now()}-${idx}`,
            marmorariaId: m.id,
            nome: m.nome,
            cidade: m.cidade,
            telefone: m.telefone,
            lat: m.lat,
            lng: m.lng,
            status: 'pendente',
          });
        }
      }
    });

    const combined = [...nextPending, ...nextFinished];
    const nextRoute: RoutePlan = {
      ...activeRoute,
      stops: combined,
      currentDestinationStopId: combined.some((stop) => stop.stopId === activeRoute.currentDestinationStopId || stop.stopId === getArrivedStopId(activeRoute.currentDestinationStopId))
        ? activeRoute.currentDestinationStopId : null,
      status: nextPending.length > 0 ? 'em_andamento' : combined.length > 0 ? 'finalizada' : 'planejada',
      activeDriverName: activeRoute.activeDriverName || currentUserName,
      updatedAt: new Date().toISOString(),
    };
    const previousStopIds = activeRoute.stops.map((stop) => stop.stopId);
    try {
      if (!remote) throw new Error('Dados indisponíveis.');
      await commitChange({...remote, routes: remote.routes.map((route) => route.id === nextRoute.id ? nextRoute : route)},
        {id: newChangeId(), kind: 'saveRoute', value: nextRoute, previousStopIds});
      if (!nextRoute.currentDestinationStopId) {
        setDirectTravel((prev) => prev?.routeId === nextRoute.id ? null : prev);
      }
      setDataError(null);
    } catch (error) {
      reportError(error);
      throw error;
    }
  };

  const handleSelectDestination = (routeId: string, stopId: string, forceSelect = false) => {
    const target = routes.find((r) => r.id === routeId);
    if (!target) return;
    const isAlready = target.currentDestinationStopId === stopId;
    const nextDestId = forceSelect ? stopId : isAlready ? null : stopId;
    const destStop = nextDestId ? target.stops.find((s) => s.stopId === nextDestId) : null;
    const now = new Date().toISOString();

    if (destStop) {
      setDirectTravel({
        driverName: currentUserName,
        destinationName: destStop.nome,
        marmorariaId: destStop.marmorariaId,
        routeId: target.id,
        updatedAt: now,
      });
    } else if (directTravel?.routeId === target.id) {
      setDirectTravel(null);
    }

    void persistRouteUpdate({
      ...target,
      status: 'em_andamento',
      currentDestinationStopId: nextDestId,
      activeDriverName: currentUserName,
      updatedAt: now,
    });
  };

  const handleSelectFinalDestination = (routeId: string, type: FinalDestinationType, sendNotice = false, remainingDurationSec?: number) => {
    const target = routes.find((r) => r.id === routeId);
    const destination = type === 'home' ? home : company;
    if (!target || !destination) return;
    setDirectTravel(null);
    const updated = {...target, status: 'em_andamento' as const,
      currentDestinationStopId: type === 'home' ? HOME_DESTINATION_ID : COMPANY_DESTINATION_ID,
      activeDriverName: currentUserName, updatedAt: new Date().toISOString()};
    persistRouteUpdate(updated, undefined, sendNotice && profile?.id === THIAGO_USER_ID && profile.role === 'admin', remainingDurationSec);
  };

  const handleArriveAtStop = (routeId: string, stopId: string) => {
    const target = routes.find((route) => route.id === routeId);
    if (!target || target.currentDestinationStopId !== stopId) return;
    setDirectTravel((previous) => previous?.routeId === routeId ? null : previous);
    void persistRouteUpdate({...target, currentDestinationStopId: arrivedDestinationId(stopId),
      updatedAt: new Date().toISOString()});
  };

  const handleStopTravel = (routeId: string) => {
    const target = routes.find((route) => route.id === routeId);
    if (!target) return;
    setDirectTravel((previous) => previous?.routeId === routeId ? null : previous);
    void persistRouteUpdate({...target, currentDestinationStopId: null,
      activeDriverName: null, updatedAt: new Date().toISOString()});
  };

  const handleNavigateMapsFromAddress = (m: Marmoraria) => {
    const now = new Date().toISOString();
    // If this marmoraria belongs to an in-progress (or planned) route's pending stops, mark it as current destination
    const candidateRoute =
      routes.find(
        (r) =>
          r.status === 'em_andamento' &&
          r.stops.some((s) => s.marmorariaId === m.id && s.status === 'pendente')
      ) ||
      routes.find((r) => r.status !== 'finalizada' && r.stops.some((s) => s.marmorariaId === m.id && s.status === 'pendente')) ||
      null;

    if (candidateRoute) {
      const matchingStop = candidateRoute.stops.find(
        (s) => s.marmorariaId === m.id && s.status === 'pendente'
      );
      if (matchingStop) {
        void persistRouteUpdate({
          ...candidateRoute,
          status: 'em_andamento',
          currentDestinationStopId: matchingStop.stopId,
          activeDriverName: currentUserName,
          updatedAt: now,
        });
      }
    }

    setDirectTravel({
      driverName: currentUserName,
      destinationName: m.nome,
      marmorariaId: m.id,
      routeId: candidateRoute?.id || null,
      updatedAt: now,
    });
  };

  const handleReorderPendingStops = (routeId: string, orderedStopIds: string[]) => {
    const target = routes.find((r) => r.id === routeId);
    if (!target) return;

    const pending = target.stops.filter((s) => s.status === 'pendente');
    const finished = target.stops.filter((s) => s.status !== 'pendente');
    const byId = new Map(pending.map((s) => [s.stopId, s]));
    const reordered = orderedStopIds
      .map((id) => byId.get(id))
      .filter((s): s is RouteStop => Boolean(s));
    pending.forEach((s) => {
      if (!orderedStopIds.includes(s.stopId)) reordered.push(s);
    });

    void persistRouteUpdate({
      ...target,
      stops: [...reordered, ...finished],
      updatedAt: new Date().toISOString(),
    });
  };

  const handleCancelStop = (routeId: string, stopId: string, sendNotice: boolean) => {
    const target = routes.find((route) => route.id === routeId);
    const stop = target?.stops.find((item) => item.stopId === stopId);
    if (!target || !stop || stop.status !== 'pendente') return;
    const allowNotice = sendNotice && profile?.id === THIAGO_USER_ID && profile.role === 'admin';
    handleUpdateStopStatus(routeId, stopId, 'nao_entregue', false,
      allowNotice ? buildStopCancellationNotice(target, stopId) ?? undefined : undefined);
  };

  const handleUpdateStopStatus = (
    routeId: string,
    stopId: string,
    status: 'pendente' | 'concluida' | 'nao_entregue',
    sendNotice = false,
    cancellationNotice?: CancellationNotice,
    deliveryReturnDurationSec?: number,
    finalDestinationType?: FinalDestinationType
  ) => {
    const target = routes.find((r) => r.id === routeId);
    if (!target) return;

    const now = new Date().toISOString();
    const updatedStops = target.stops.map((s) =>
      s.stopId === stopId ? {...s, status, updatedAt: now} : s
    );

    // Move concluída / não entregue to the end of the list; keep pending at top
    const pending = updatedStops.filter((s) => s.status === 'pendente');
    const finished = updatedStops.filter((s) => s.status !== 'pendente');

    const baseNextDest =
      (target.currentDestinationStopId === stopId || getArrivedStopId(target.currentDestinationStopId) === stopId) && status !== 'pendente'
        ? null
        : target.currentDestinationStopId;
    const nextDest = pending.length === 0 && status === 'concluida' && finalDestinationType
      ? finalDestinationType === 'home' ? HOME_DESTINATION_ID : COMPANY_DESTINATION_ID
      : baseNextDest;

    const nextStatus = target.status === 'finalizada' && status !== 'pendente'
      ? 'finalizada' : updatedStops.length > 0 ? 'em_andamento' : 'planejada';

    if ((target.currentDestinationStopId === stopId || getArrivedStopId(target.currentDestinationStopId) === stopId) && status !== 'pendente') {
      setDirectTravel((prev) => (prev?.routeId === routeId ? null : prev));
    }

    const sendCancellation = Boolean(cancellationNotice)
      && status === 'nao_entregue'
      && target.stops.find((s) => s.stopId === stopId)?.status !== 'nao_entregue'
      && profile?.id === THIAGO_USER_ID
      && profile.role === 'admin';
    void persistRouteUpdate({
      ...target,
      stops: [...pending, ...finished],
      currentDestinationStopId: nextDest,
      status: nextStatus,
      updatedAt: now,
    }, sendNotice && profile?.id === THIAGO_USER_ID && profile.role === 'admin' && status === 'concluida' &&
      target.stops.find((s) => s.stopId === stopId)?.status !== 'concluida' ? stopId : undefined,
      false, undefined, sendCancellation, sendCancellation ? cancellationNotice : undefined,
      pending.length === 0 ? deliveryReturnDurationSec : undefined,
      pending.length === 0 ? finalDestinationType : undefined);
  };

  const requestStopStatusUpdate = (routeId: string, stopId: string,
    status: 'pendente' | 'concluida' | 'nao_entregue', returnDurationSec?: number) => {
    if (status === 'nao_entregue') return;
    const stop = routes.find((route) => route.id === routeId)?.stops.find((item) => item.stopId === stopId);
    if (status === 'concluida' && stop?.status !== 'concluida' && profile?.id === THIAGO_USER_ID && profile.role === 'admin') {
      setCompletionToConfirm({routeId, stopId, name: stop?.nome || 'esta entrega', returnDurationSec, step: 'notice'});
      return;
    }
    handleUpdateStopStatus(routeId, stopId, status, false, undefined, returnDurationSec);
  };

  const confirmCompletion = (sendNotice: boolean) => {
    if (!completionToConfirm) return;
    const target = routes.find((route) => route.id === completionToConfirm.routeId);
    const isLastPending = target?.stops.filter((stop) => stop.status === 'pendente').length === 1;
    if (sendNotice && isLastPending && (company || home)) {
      setCompletionToConfirm({...completionToConfirm, step: 'destination'});
      return;
    }
    handleUpdateStopStatus(completionToConfirm.routeId, completionToConfirm.stopId, 'concluida', sendNotice,
      undefined, completionToConfirm.returnDurationSec);
    setCompletionToConfirm(null);
  };

  const confirmFinalDestination = (type: FinalDestinationType) => {
    if (!completionToConfirm) return;
    handleUpdateStopStatus(completionToConfirm.routeId, completionToConfirm.stopId, 'concluida', true,
      undefined, type === 'factory' ? completionToConfirm.returnDurationSec : undefined, type);
    setCompletionToConfirm(null);
  };

  const handleSaveMarmoraria = async (data: {
    id?: string;
    nome: string;
    cidade: string;
    telefone: string;
    lat: number;
    lng: number;
  }) => {
    const now = new Date().toISOString();
    const record: Marmoraria = {
      id: data.id || `marm-${Date.now()}`,
      nome: data.nome,
      cidade: data.cidade,
      telefone: data.telefone,
      lat: data.lat,
      lng: data.lng,
      isDemo: false,
      createdAt: editingMarm?.createdAt || now,
      updatedAt: now,
    };

    try {
      if (!remote) throw new Error('Dados indisponíveis.');
      const next = remote.marmorarias.some((m) => m.id === record.id)
        ? remote.marmorarias.map((m) => m.id === record.id ? record : m) : [record, ...remote.marmorarias];
      await commitChange({...remote, marmorarias: next}, {id: newChangeId(), kind: 'saveMarmoraria', value: record});
    } catch (error) {reportError(error); return;}
    setShareNotice(null);
  };

  const handleDeleteMarmoraria = async (id: string) => {
    if (profile?.role !== 'admin') return;
    try {
      if (!remote) throw new Error('Dados indisponíveis.');
      await commitChange({...remote, marmorarias: remote.marmorarias.filter((m) => m.id !== id)},
        {id: newChangeId(), kind: 'deleteMarmoraria', value: id});
    } catch (error) {reportError(error);}
  };

  const handleSaveTemplates = async (nextTemplates: WhatsAppTemplate[]) => {
    try {
      if (!remote) throw new Error('Dados indisponíveis.');
      await commitChange({...remote, templates: nextTemplates},
        {id: newChangeId(), kind: 'saveTemplates', value: nextTemplates});
    } catch (error) {reportError(error);}
  };

  const openNewMarmoraria = (openInMap = false) => {
    setEditingMarm(null);
    setMarmModalCoords(null);
    setMarmModalName('');
    setShareNotice(null);
    setMarmModalMapOpen(openInMap);
    setMarmModalOpen(true);
  };

  const handleSaveCompany = async (nextCompany: CompanyLocation | null) => {
    if (profile?.role !== 'admin') return;
    try {
      if (!remote) throw new Error('Dados indisponíveis.');
      await commitChange({...remote, company: nextCompany},
        {id: newChangeId(), kind: 'saveCompany', value: nextCompany});
    } catch (error) {reportError(error);}
  };

  const handleSaveHome = async (nextHome: CompanyLocation | null) => {
    if (profile?.role !== 'admin') return;
    try {
      if (!remote) throw new Error('Dados indispon�veis.');
      await commitChange({...remote, home: nextHome},
        {id: newChangeId(), kind: 'saveHome', value: nextHome});
    } catch (error) {reportError(error);}
  };

  if (!authReady) return <div className="flex min-h-screen items-center justify-center bg-[#0d100e] text-[#baff27]">Carregando...</div>;
  if (!userId) return <LoginScreen onLogin={() => setDataError(null)} />;
  if (!remote || !profile) return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0d100e] px-4 text-center text-[#f3f5f2]">
      <p>{dataError || 'Carregando seus dados...'}</p>
      {dataError && <button type="button" onClick={() => {clearLastOfflineUser(); void supabase?.auth.signOut({scope: 'local'}); setUserId(null);}} className="min-h-[44px] rounded-xl border border-[#394539] px-4">Voltar ao login</button>}
    </div>
  );

  const webhookPendingCount = offlinePendingChanges
    .filter((change) => change.kind === 'notifyDelivery' || change.kind === 'notifyReturn' || change.kind === 'notifyCancellation').length;
  const webhookBaseDisplay = syncing && webhookPendingCount > 0
    ? {label: 'Enviando', title: 'Webhook sendo encaminhado', color: 'text-[#baff27]', icon: Loader2}
    : webhookStatus?.state === 'failed'
      ? {label: 'Falhou', title: 'Falha ao encaminhar o último webhook', color: 'text-red-400', icon: AlertCircle}
      : webhookPendingCount > 0 || webhookStatus?.state === 'pending'
        ? {label: 'Pendente', title: `${webhookPendingCount || webhookStatus?.pending || 1} webhook(s) aguardando envio`, color: 'text-[#ff873f]', icon: Send}
        : webhookStatus?.state === 'sent'
          ? {label: 'Enviado', title: 'Último webhook encaminhado', color: 'text-[#baff27]', icon: CheckCircle2}
          : {label: 'Webhook', title: 'Nenhum webhook pendente', color: 'text-[#6f7a71]', icon: Send};
  const webhookHistory = webhookStatus?.history || [];
  const webhookCurrentItem = webhookHistory.find((item) => item.state === webhookStatus?.state)
    || webhookHistory[0]
    || null;
  const webhookTarget = webhookCurrentItem
    ? webhookCurrentItem.kind === 'return' ? 'Retorno' : webhookCurrentItem.kind === 'cancellation' ? 'Cancelamento' : webhookCurrentItem.targetName
    : '';
  const webhookDisplay = webhookCurrentItem
    ? syncing && webhookPendingCount > 0
      ? {...webhookBaseDisplay, label: `Enviando ${webhookTarget}`, title: `Enviando ${webhookCurrentItem.targetName}`}
      : webhookStatus?.state === 'failed'
        ? {...webhookBaseDisplay, label: `Falha: ${webhookTarget}`, title: `Falha ao encaminhar ${webhookCurrentItem.targetName}`}
        : webhookPendingCount > 0 || webhookStatus?.state === 'pending'
          ? {...webhookBaseDisplay, label: `${webhookTarget} pendente`, title: `${webhookCurrentItem.targetName} aguardando envio`}
          : webhookStatus?.state === 'sent'
            ? {...webhookBaseDisplay, label: `${webhookTarget} · ${webhookTime(webhookCurrentItem.updatedAt)}`, title: `${webhookCurrentItem.targetName} encaminhado`}
            : webhookBaseDisplay
    : webhookBaseDisplay;
  const WebhookIcon = webhookDisplay.icon;
  const dataPendingCount = Math.max(0, pendingCount - webhookPendingCount);
  const showCompactSync = syncing || dataPendingCount > 0;

  return (
    <div className="app-shell min-h-screen bg-[#0d100e] text-[#f3f5f2]">
      {/* Compact Sticky Top Bar */}
      <header className="app-header sticky top-0 z-30 border-b border-[#1f2620] bg-[#0d100e]/90 backdrop-blur-md">
        <div className="app-header-row relative mx-auto flex max-w-6xl items-center justify-center px-4 sm:px-6">
          <div className="absolute left-4 flex max-w-[120px] items-center gap-1.5 sm:left-6 sm:max-w-[260px]">
            <button
              type="button"
              onClick={() => setWebhookPanelOpen(true)}
              aria-label="Ver detalhes dos webhooks"
              title={webhookDisplay.title}
              className={`inline-flex min-w-0 items-center gap-1 text-[9px] font-semibold sm:text-[10px] ${webhookDisplay.color}`}
            >
              <WebhookIcon className={`h-3.5 w-3.5 shrink-0 ${syncing && webhookPendingCount > 0 ? 'animate-spin' : ''}`} />
              <span className="truncate">{webhookDisplay.label}</span>
              {webhookPendingCount > 0 && <span className="tabular-nums">({webhookPendingCount})</span>}
            </button>
            {showCompactSync && (
              <button
                type="button"
                onClick={() => {if (isOnline && !syncing) void syncOfflineData(userId);}}
                disabled={!isOnline || syncing}
                aria-label={syncing ? 'Sincronizando alterações' : `${dataPendingCount} alteração(ões) pendentes`}
                title={syncing ? 'Sincronizando alterações' : `${dataPendingCount} alteração(ões) pendentes. Toque para tentar novamente.`}
                className="inline-flex shrink-0 items-center gap-1 border-l border-[#394539] pl-1.5 text-[9px] font-semibold text-[#8f9a91] disabled:opacity-80 sm:text-[10px]"
              >
                <Loader2 className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{syncing ? 'Sincronizando' : `${dataPendingCount} pendente${dataPendingCount === 1 ? '' : 's'}`}</span>
              </button>
            )}
          </div>

          <div className="inline-flex items-center gap-2">
            <span className="text-base font-extrabold tracking-tight text-[#f3f5f2] whitespace-nowrap">
              Rota <span className="text-[#baff27]">Italik</span>
            </span>
            {!isOnline && (
              <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-[#ff873f]" title="Sem conexão">
                <WifiOff className="h-3 w-3" />Offline
              </span>
            )}
          </div>

          <div className="absolute right-4 flex items-center gap-3 sm:right-6">
            <button type="button" onClick={() => {clearLastOfflineUser(); setUserId(null); void supabase?.auth.signOut({scope: 'local'});}} aria-label="Sair da conta" title={`Sair (${profile.display_name})`} className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-[#9aa59c] hover:text-[#ff873f]"><LogOut className="h-4 w-4" /></button>
            {profile.role === 'admin' && <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="Configurações"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-[#baff27] hover:bg-[#baff27]/10"
            >
              <Settings className="h-5 w-5" />
            </button>}
          </div>
        </div>
      </header>

      {webhookPanelOpen && (
        <div
          className="app-modal-backdrop app-modal-centered fixed inset-0 z-[1000] flex items-center justify-center bg-black/75 px-4"
          role="presentation"
          onMouseDown={(event) => {if (event.target === event.currentTarget) setWebhookPanelOpen(false);}}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="webhook-history-title" className="w-full max-w-md rounded-2xl border border-[#394539] bg-[#151a16] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="webhook-history-title" className="text-lg font-bold text-[#f3f5f2]">Envios do webhook</h2>
                <p className="mt-1 text-xs text-[#9aa59c]">Últimos cinco avisos gerados pelo aplicativo.</p>
              </div>
              <button type="button" onClick={() => setWebhookPanelOpen(false)} aria-label="Fechar histórico do webhook" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[#9aa59c] hover:bg-[#202721] hover:text-[#f3f5f2]"><X className="h-4 w-4" /></button>
            </div>

            {webhookHistory.length === 0 ? (
              <div className="mt-4 rounded-xl border border-[#283129] bg-[#101411] p-4 text-sm text-[#bdc7bd]">
                O próximo envio mostrará aqui a marmoraria, a rota, o horário e o resultado.
              </div>
            ) : (
              <ul className="mt-4 max-h-[60vh] space-y-2 overflow-y-auto pr-1">
                {webhookHistory.map((item) => {
                  const ItemIcon = item.state === 'sent' ? CheckCircle2 : item.state === 'failed' ? AlertCircle : Send;
                  const stateColor = item.state === 'sent' ? 'text-[#baff27]' : item.state === 'failed' ? 'text-red-400' : 'text-[#ff873f]';
                  return (
                    <li key={item.eventId} className="rounded-xl border border-[#283129] bg-[#101411] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-[#f3f5f2]">{item.targetName}</p>
                          <p className="mt-0.5 truncate text-xs text-[#9aa59c]">{item.routeName}</p>
                        </div>
                        <span className={`inline-flex shrink-0 items-center gap-1 text-[11px] font-bold ${stateColor}`}>
                          <ItemIcon className="h-3.5 w-3.5" />{webhookStateLabel[item.state]}
                        </span>
                      </div>
                      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[11px]">
                        <dt className="text-[#6f7a71]">Evento</dt>
                        <dd className="text-[#bdc7bd]">{item.kind === 'delivery' ? 'Parada concluída' : item.kind === 'return' ? 'Retorno à empresa' : (item.eventLabel || 'Rota cancelada')}</dd>
                        <dt className="text-[#6f7a71]">Aconteceu</dt>
                        <dd className="text-[#bdc7bd] tabular-nums">{webhookDateTime(item.occurredAt)}</dd>
                        <dt className="text-[#6f7a71]">{item.state === 'sent' ? 'Enviado' : 'Atualizado'}</dt>
                        <dd className="text-[#bdc7bd] tabular-nums">{webhookDateTime(item.updatedAt)}</dd>
                      </dl>
                    </li>
                  );
                })}
              </ul>
            )}

            {webhookPendingCount > 0 && (
              <p className="mt-3 text-xs font-semibold text-[#ff873f] tabular-nums">
                {webhookPendingCount} {webhookPendingCount === 1 ? 'aviso aguardando envio' : 'avisos aguardando envio'}.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="mx-auto max-w-6xl px-4 pt-5 sm:px-6">
        {dataError && <div role="alert" className="mb-4 rounded-xl border border-[#ff873f] bg-[#ff873f]/10 p-3 text-sm text-[#ffad73]">{dataError}<button type="button" onClick={() => setDataError(null)} className="ml-3 underline">Fechar</button></div>}
        {(() => {
          const activeRouteWithDest =
            routes.find((r) => {
              if (!r.currentDestinationStopId) return false;
              return r.stops.some(
                (s) => s.stopId === r.currentDestinationStopId && s.status === 'pendente'
              );
            }) || null;
          const activeStopFromRoute = activeRouteWithDest
            ? activeRouteWithDest.stops.find(
                (s) => s.stopId === activeRouteWithDest.currentDestinationStopId
              ) || null
            : null;

          const activeDestinationMarmId =
            activeStopFromRoute?.marmorariaId || directTravel?.marmorariaId || null;

          return (
            <>
              {activeTab === 'rotas' && !activeRoute && (
                <RoutesListView
                  routes={routes}
                  company={company}
                  home={home}
                  distances={routeDistances}
                  onOpenRoute={handleOpenRoute}
                  onCreateRoute={() => setCreateRouteOpen(true)}
                />
              )}

              {activeTab === 'rotas' && activeRoute && (
                <Suspense fallback={<ViewLoading />}>
                  <RouteDetailView
                    route={activeRoute}
                    marmorarias={marmorarias}
                    company={company}
                    home={home}
                    userPosition={userPosition}
                    geoError={geoError}
                    onRequestGeo={requestGeolocation}
                    onRenameRoute={handleRenameRoute}
                    onDeleteRoute={(id) => void handleDeleteRoute(id)}
                    onCancelRoute={handleCancelRoute}
                    onCancelStop={handleCancelStop}
                    onRemoveStop={handleRemoveStop}
                    canDelete={profile.role === 'admin'}
                    onOpenAddStops={() => setAddStopsOpen(true)}
                    onSelectDestination={handleSelectDestination}
                    onSelectFinalDestination={handleSelectFinalDestination}
                    onStopTravel={handleStopTravel}
                    canSendReturnNotice={profile.id === THIAGO_USER_ID && profile.role === 'admin'}
                    canSendCancellationNotice={profile.id === THIAGO_USER_ID && profile.role === 'admin'}
                    onReorderPendingStops={handleReorderPendingStops}
                    onUpdateStopStatus={requestStopStatusUpdate}
                    onOpenWhatsApp={openWhatsAppFor}
                  />
                </Suspense>
              )}

              {activeTab === 'enderecos' && (
                <AddressesView
                  marmorarias={marmorarias}
                  activeDestinationMarmId={activeDestinationMarmId}
                  onCreateNew={(openInMap) => openNewMarmoraria(Boolean(openInMap))}
                  onEdit={(m) => {
                    setEditingMarm(m);
                    setMarmModalCoords({lat: m.lat, lng: m.lng});
                    setMarmModalName('');
                    setShareNotice(null);
                    setMarmModalMapOpen(false);
                    setMarmModalOpen(true);
                  }}
                  onDelete={(id) => void handleDeleteMarmoraria(id)}
                  canDelete={profile.role === 'admin'}
                  onOpenWhatsApp={openWhatsAppFor}
                  onNavigateMaps={handleNavigateMapsFromAddress}
                  collectionCounts={collectionCounts}
                />
              )}

              {activeTab === 'relatorios' && (
                <Suspense fallback={<ViewLoading />}>
                  <ReportsView collections={collections} marmorarias={marmorarias} routes={routes}
                    distances={routeDistances} distancesLoading={distancesLoading} />
                </Suspense>
              )}

            </>
          );
        })()}
      </main>

      {/* Fixed Bottom Navigation Bar */}
      <nav
        aria-label="Navegação principal"
        className="app-bottom-nav fixed right-0 bottom-0 left-0 z-40 border-t border-[#1f2620] bg-[#0d100e]"
      >
        <div className="app-bottom-nav-row mx-auto grid max-w-6xl grid-cols-3 items-center">
          {(
            [
              {id: 'rotas', label: 'Rotas', Icon: RouteIcon},
              {id: 'enderecos', label: 'Endereços', Icon: MapPin},
              {id: 'relatorios', label: 'Relatórios', Icon: BarChart3},
            ] as const
          ).map(({id, label, Icon}) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  if (id === 'rotas' && activeTab === 'rotas') {
                    setSelectedRouteId(null);
                  } else if (id !== 'rotas') {
                    setSelectedRouteId(null);
                  }
                  setActiveTab(id);
                }}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-1 transition-colors ${
                  isActive ? 'text-[#baff27]' : 'text-[#879389] hover:text-[#d5dcd4]'
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={isActive ? 2.4 : 1.9} />
                <span className="text-[11px] font-semibold tracking-tight">{label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Modals */}
      {completionToConfirm && (
        <div className="app-modal-backdrop app-modal-centered fixed inset-0 z-[1000] flex items-center justify-center bg-black/75 px-4">
          <div role="dialog" aria-modal="true" aria-labelledby="completion-notice-title"
            className="w-full max-w-sm rounded-2xl border border-[#394539] bg-[#151a16] p-5 shadow-2xl">
            {completionToConfirm.step === 'notice' ? <>
            <h2 id="completion-notice-title" className="text-base font-bold text-[#f3f5f2]">Concluir {completionToConfirm.name}?</h2>
            <p className="mt-2 text-sm text-[#b7c1b8]">Deseja enviar o aviso pelo WhatsApp? O envio será solicitado à automação configurada.</p>
            <div className="mt-5 flex flex-col gap-2">
              <button type="button" onClick={() => confirmCompletion(true)}
                className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-[#baff27] px-4 text-sm font-bold text-[#0d100e]">
                <Check className="h-4 w-4" />Concluir e enviar aviso
              </button>
              <button type="button" onClick={() => confirmCompletion(false)}
                className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl border border-[#394539] px-4 text-sm font-semibold text-[#f3f5f2]">
                Concluir sem enviar
              </button>
              <button type="button" onClick={() => setCompletionToConfirm(null)}
                className="inline-flex min-h-[42px] w-full items-center justify-center gap-2 text-sm text-[#9aa59c]">
                <X className="h-4 w-4" />Cancelar
              </button>
            </div>
            </> : <>
              <h2 id="completion-notice-title" className="text-base font-bold text-[#f3f5f2]">Qual ser&aacute; o pr&oacute;ximo destino?</h2>
              <p className="mt-2 text-sm text-[#b7c1b8]">Essa localiza&ccedil;&atilde;o e o tempo restante ser&atilde;o enviados no aviso da &uacute;ltima entrega.</p>
              <div className="mt-5 flex flex-col gap-2">
                {company && <button type="button" onClick={() => confirmFinalDestination('factory')}
                  className="inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl bg-[#baff27] px-4 text-sm font-bold text-[#0d100e]"><MapPin className="h-4 w-4" />F&aacute;brica</button>}
                {home && <button type="button" onClick={() => confirmFinalDestination('home')}
                  className="inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl border border-[#ff873f] px-4 text-sm font-bold text-[#ff873f]"><MapPin className="h-4 w-4" />Casa</button>}
                <button type="button" onClick={() => setCompletionToConfirm({...completionToConfirm, step: 'notice'})}
                  className="inline-flex min-h-[42px] w-full items-center justify-center text-sm text-[#9aa59c]">Voltar</button>
              </div>
            </>}
          </div>
        </div>
      )}
      {settingsOpen && <Suspense fallback={null}><SettingsModal
        isOpen
        company={company}
        home={home}
        canManageWebhook={profile.id === THIAGO_USER_ID && profile.role === 'admin'}
        onClose={() => setSettingsOpen(false)}
        onSaveCompany={(next) => void handleSaveCompany(next)}
        onSaveHome={(next) => void handleSaveHome(next)}
      /></Suspense>}
      {marmModalOpen && <Suspense fallback={null}><MarmorariaModal
        isOpen
        initialData={editingMarm}
        initialCoords={marmModalCoords}
        initialName={marmModalName}
        initialMapPickerOpen={marmModalMapOpen}
        shareNotice={shareNotice}
        userPosition={userPosition}
        onClose={() => {
          setMarmModalOpen(false);
          setShareNotice(null);
        }}
        onSave={(data) => void handleSaveMarmoraria(data)}
      /></Suspense>}

      {whatsAppTarget && <Suspense fallback={null}><WhatsAppModal
        isOpen
        targetName={whatsAppTarget.name}
        targetPhone={whatsAppTarget.phone}
        templates={templates}
        onClose={() => setWhatsAppTarget(null)}
        onSaveTemplates={(next) => void handleSaveTemplates(next)}
      /></Suspense>}
      {phoneTarget && <PhoneModal key={phoneTarget.id} marmoraria={phoneTarget}
        onClose={() => setPhoneTarget(null)} onSave={saveCustomerPhone} />}

      {createRouteOpen && <Suspense fallback={null}><CreateRouteModal
        isOpen
        marmorarias={marmorarias}
        routes={routes}
        onClose={() => setCreateRouteOpen(false)}
        onCreate={(nome, ids) => void handleCreateRoute(nome, ids)}
      /></Suspense>}

      {addStopsOpen && <Suspense fallback={null}><AddStopsModal
        isOpen
        marmorarias={marmorarias}
        currentStops={activeRoute?.stops || []}
        routeId={activeRoute?.id || null}
        onClose={() => setAddStopsOpen(false)}
        onApply={handleApplyRouteStops}
      /></Suspense>}

    </div>
  );
}

