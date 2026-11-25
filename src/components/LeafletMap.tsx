import L from 'leaflet';
import {useEffect, useRef} from 'react';
import type {CompanyLocation, Coordinates, RouteStop} from '../types.ts';

export interface AppMapProps {
  mode: 'route' | 'pick';
  stops?: RouteStop[];
  company?: CompanyLocation | null;
  currentDestinationStopId?: string | null;
  userPosition?: Coordinates | null;
  pickedPosition?: Coordinates | null;
  onPickCoordinates?: (coords: Coordinates) => void;
  onSelectStop?: (stopId: string) => void;
  manualOrderIds?: string[];
  manualOrderingActive?: boolean;
  className?: string;
}

// Default center: Northern Santa Catarina (Joinville / Jaraguá do Sul / Blumenau / São Bento do Sul)
const DEFAULT_CENTER: [number, number] = [-26.48, -49.02];
const DEFAULT_ZOOM = 10;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function LeafletMap({
  mode,
  stops = [],
  company = null,
  currentDestinationStopId = null,
  userPosition = null,
  pickedPosition = null,
  onPickCoordinates,
  onSelectStop,
  manualOrderIds = [],
  manualOrderingActive = false,
  className = 'h-64 w-full',
}: AppMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const hasFittedRef = useRef<string>('');
  const onPickRef = useRef(onPickCoordinates);
  const onSelectStopRef = useRef(onSelectStop);

  onPickRef.current = onPickCoordinates;
  onSelectStopRef.current = onSelectStop;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const map = L.map(el, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = group;

    const handleClick = (e: L.LeafletMouseEvent) => {
      if (mode === 'pick' && onPickRef.current) {
        onPickRef.current({
          lat: Number(e.latlng.lat.toFixed(6)),
          lng: Number(e.latlng.lng.toFixed(6)),
        });
      }
    };

    map.on('click', handleClick);

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(el);

    setTimeout(() => map.invalidateSize(), 120);

    return () => {
      resizeObserver.disconnect();
      map.off('click', handleClick);
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
      hasFittedRef.current = '';
    };
  }, [mode]);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();
    const boundsPoints: [number, number][] = [];

    if (mode === 'route') {
      let pendingIdx = 0;
      stops.forEach((stop) => {
        const isPending = stop.status === 'pendente';
        const isActive = stop.stopId === currentDestinationStopId && isPending;
        if (isPending) pendingIdx += 1;
        const manualIndex = manualOrderIds.indexOf(stop.stopId);
        const labelNum = isPending
          ? manualOrderingActive
            ? manualIndex >= 0 ? String(manualIndex + 1) : '•'
            : String(pendingIdx)
          : stop.status === 'concluida' ? '✓' : '✕';
        const isManuallySelected = manualOrderingActive && manualIndex >= 0;

        boundsPoints.push([stop.lat, stop.lng]);

        const labelCls = isManuallySelected
          ? 'rota-stop-label rota-stop-label--manual'
          : isActive
          ? 'rota-stop-label rota-stop-label--active'
          : isPending
          ? 'rota-stop-label'
          : 'rota-stop-label rota-stop-label--done';

        const dotCls = isManuallySelected
          ? 'rota-stop-dot rota-stop-dot--manual'
          : isActive
          ? 'rota-stop-dot rota-stop-dot--active'
          : isPending
          ? 'rota-stop-dot'
          : 'rota-stop-dot rota-stop-dot--done';

        const markerIcon = L.divIcon({
          className: 'rota-stop-pin-wrapper',
          iconSize: [0, 0],
          iconAnchor: [0, 0],
          html: `
            <div class="rota-stop-pin">
              <div class="${labelCls}">${escapeHtml(labelNum)} · ${escapeHtml(stop.nome)}</div>
              <div class="${dotCls}">${escapeHtml(labelNum)}</div>
            </div>
          `,
        });

        const marker = L.marker([stop.lat, stop.lng], {
          icon: markerIcon,
          zIndexOffset: isActive ? 450 : isPending ? 300 : 100,
        }).addTo(group);

        marker.on('click', () => {
          if (onSelectStopRef.current && isPending) {
            onSelectStopRef.current(stop.stopId);
          }
        });
      });

      const fitKey = `route:${stops.map((s) => `${s.stopId}:${s.lat}:${s.lng}`).join(',')}`;
      if (boundsPoints.length > 0 && hasFittedRef.current !== fitKey) {
        hasFittedRef.current = fitKey;
        if (boundsPoints.length === 1) {
          map.setView(boundsPoints[0], 14, {animate: false});
        } else {
          map.fitBounds(L.latLngBounds(boundsPoints), {padding: [42, 42], maxZoom: 15, animate: false});
        }
      }
    } else if (mode === 'pick') {
      if (pickedPosition) {
        const pinIcon = L.divIcon({
          className: 'rota-stop-pin-wrapper',
          iconSize: [0, 0],
          iconAnchor: [0, 0],
          html: `
            <div class="rota-stop-pin">
              <div class="rota-stop-label rota-stop-label--active">Ponto marcado</div>
              <div class="rota-stop-dot" style="background:#baff27; color:#0d100e;">●</div>
            </div>
          `,
        });
        L.marker([pickedPosition.lat, pickedPosition.lng], {icon: pinIcon}).addTo(group);
        const fitKey = `pick:${pickedPosition.lat.toFixed(4)},${pickedPosition.lng.toFixed(4)}`;
        if (hasFittedRef.current !== fitKey) {
          hasFittedRef.current = fitKey;
            map.setView([pickedPosition.lat, pickedPosition.lng], 15, {animate: false});
        }
      } else if (userPosition && hasFittedRef.current === '') {
        hasFittedRef.current = 'pick:user';
        map.setView([userPosition.lat, userPosition.lng], 13, {animate: false});
      }

    }
  }, [
    mode,
    stops,
    company,
    currentDestinationStopId,
    userPosition,
    pickedPosition,
    manualOrderIds,
    manualOrderingActive,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let secondFrame = 0;
    const fitRouteInCurrentSize = () => {
      if (mode !== 'route') return;
      const points = stops.map((stop): [number, number] => [stop.lat, stop.lng]);
      if (points.length === 1) {
        map.setView(points[0], 14, {animate: false});
      } else if (points.length > 1) {
        map.fitBounds(L.latLngBounds(points), {
          paddingTopLeft: [64, 72],
          paddingBottomRight: [64, 72],
          maxZoom: 15,
          animate: false,
        });
      }
    };
    const refreshSizeAndTiles = () => {
      map.invalidateSize({animate: false, pan: false});
      map.eachLayer((layer) => {
        if (layer instanceof L.TileLayer) layer.redraw();
      });
    };

    const firstFrame = requestAnimationFrame(() => {
      refreshSizeAndTiles();
      fitRouteInCurrentSize();
      secondFrame = requestAnimationFrame(() => {
        refreshSizeAndTiles();
        fitRouteInCurrentSize();
      });
    });
    const delayedRefresh = window.setTimeout(() => {
      refreshSizeAndTiles();
      fitRouteInCurrentSize();
    }, 250);

    window.addEventListener('resize', refreshSizeAndTiles);
    window.addEventListener('orientationchange', refreshSizeAndTiles);

    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      window.clearTimeout(delayedRefresh);
      window.removeEventListener('resize', refreshSizeAndTiles);
      window.removeEventListener('orientationchange', refreshSizeAndTiles);
    };
  }, [className, mode, stops]);

  return (
    <div
      ref={containerRef}
      className={`rota-leaflet-container relative z-0 overflow-hidden rounded-2xl border border-[#242c25] bg-[#141915] ${className}`}
    />
  );
}
