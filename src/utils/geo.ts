import type {CompanyLocation, Coordinates, RouteStop} from '../types.ts';

export function isValidCoordinates(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

/**
 * Accepts pasted coordinates like:
 * -26.46014955195992, -48.90694063491616
 * -26.460149, -48.906940
 * (-26.460149; -48.906940)
 * or Google Maps URLs containing @lat,lng, !3dlat!4dlng, q=lat,lng, ll=lat,lng, query=lat,lng
 */
export function parseCoordinatesInput(rawInput: string): Coordinates | null {
  const input = rawInput.trim();
  if (!input) return null;

  // 1. Check Google Maps !3dLAT!4dLNG pattern (precise pin location)
  const dataPinMatch = input.match(/!3d(-?\d{1,3}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/);
  if (dataPinMatch) {
    const lat = Number(dataPinMatch[1]);
    const lng = Number(dataPinMatch[2]);
    if (isValidCoordinates(lat, lng)) return {lat, lng};
  }

  // 2. Check @LAT,LNG in Google Maps URLs
  const atMatch = input.match(/@(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/);
  if (atMatch) {
    const lat = Number(atMatch[1]);
    const lng = Number(atMatch[2]);
    if (isValidCoordinates(lat, lng)) return {lat, lng};
  }

  // 3. Check query params like q=LAT,LNG, ll=LAT,LNG, query=LAT,LNG, destination=LAT,LNG
  const paramMatch = input.match(
    /(?:q|ll|query|destination|center|sll)=(-?\d{1,3}\.\d+)(?:%2C|,|\+)\s*(-?\d{1,3}\.\d+)/i
  );
  if (paramMatch) {
    const lat = Number(paramMatch[1]);
    const lng = Number(paramMatch[2]);
    if (isValidCoordinates(lat, lng)) return {lat, lng};
  }

  // 4. Direct lat, lng pair (comma, semicolon, or whitespace separated)
  const cleaned = input.replace(/[()[\]]/g, '').trim();
  const pairMatch = cleaned.match(
    /^(-?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/
  );
  if (pairMatch) {
    const lat = Number(pairMatch[1]);
    const lng = Number(pairMatch[2]);
    if (isValidCoordinates(lat, lng)) return {lat, lng};
  }

  return null;
}

export function isGoogleMapsUrl(text: string): boolean {
  const trimmed = text.trim();
  return /https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/maps|(?:www\.|maps\.)?google\.[a-z.]+\/maps)/i.test(
    trimmed
  );
}

export function extractFirstUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s"'<>]+/i);
  return match ? match[0] : null;
}

export function formatCoordinates(lat: number, lng: number): string {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

export function normalizePhoneForWhatsApp(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55') && digits.length >= 12) {
    return digits;
  }
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  return digits;
}

export function buildWhatsAppUrl(phone: string, message: string): string {
  const normalized = normalizePhoneForWhatsApp(phone);
  const encodedMsg = encodeURIComponent(message);
  return `https://wa.me/${normalized}?text=${encodedMsg}`;
}

export function buildSingleStopGoogleMapsUrl(
  stop: {lat: number; lng: number},
  origin?: Coordinates | null
): string {
  const params = new URLSearchParams({
    api: '1',
    destination: `${stop.lat},${stop.lng}`,
    travelmode: 'driving',
    dir_action: 'navigate',
  });
  if (origin && isValidCoordinates(origin.lat, origin.lng)) {
    params.set('origin', `${origin.lat},${origin.lng}`);
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function buildSingleStopGoogleMapsNavigationUrls(
  stop: {lat: number; lng: number},
  origin?: Coordinates | null
): {appUrl: string; webUrl: string} {
  const appParams = new URLSearchParams({
    daddr: `${stop.lat},${stop.lng}`,
    directionsmode: 'driving',
  });

  return {
    appUrl: `comgooglemaps://?${appParams.toString()}`,
    webUrl: buildSingleStopGoogleMapsUrl(stop, origin),
  };
}

export interface GoogleMapsRouteSegment {
  partIndex: number;
  totalParts: number;
  label: string;
  stopsCount: number;
  startStopNumber: number;
  endStopNumber: number;
  url: string;
}

// Mobile Google Maps URLs reliably handle ~9 waypoints + destination (10 stops total).
// Using 9 stops per segment ensures compatibility on Android & iOS Google Maps apps.
const MAX_STOPS_PER_GOOGLE_MAPS_LINK = 9;

export function buildChunkedGoogleMapsRouteLinks(
  pendingStops: RouteStop[],
  origin?: Coordinates | null,
  company?: CompanyLocation | null
): GoogleMapsRouteSegment[] {
  if (pendingStops.length === 0) return [];

  const destinations: Array<{lat: number; lng: number}> = company
    ? [...pendingStops, company]
    : pendingStops;
  const chunks: Array<Array<{lat: number; lng: number}>> = [];
  for (let i = 0; i < destinations.length; i += MAX_STOPS_PER_GOOGLE_MAPS_LINK) {
    chunks.push(destinations.slice(i, i + MAX_STOPS_PER_GOOGLE_MAPS_LINK));
  }

  return chunks.map((chunk, idx) => {
    const startNumber = idx * MAX_STOPS_PER_GOOGLE_MAPS_LINK + 1;
    const endNumber = Math.min(pendingStops.length, startNumber + chunk.length - 1);
    const destination = chunk[chunk.length - 1];
    const waypoints = chunk.slice(0, -1);

    const params = new URLSearchParams({
      api: '1',
      destination: `${destination.lat},${destination.lng}`,
      travelmode: 'driving',
    });

    if (idx === 0) {
      if (origin && isValidCoordinates(origin.lat, origin.lng)) {
        params.set('origin', `${origin.lat},${origin.lng}`);
      }
    } else {
      // Subsequent parts start from the final stop of the previous part
      const prevChunk = chunks[idx - 1];
      const prevEnd = prevChunk[prevChunk.length - 1];
      params.set('origin', `${prevEnd.lat},${prevEnd.lng}`);
    }

    if (waypoints.length > 0) {
      params.set(
        'waypoints',
        waypoints.map((s) => `${s.lat},${s.lng}`).join('|')
      );
    }

    return {
      partIndex: idx + 1,
      totalParts: chunks.length,
      label:
        chunks.length === 1
          ? `Abrir rota no Google Maps (${pendingStops.length} ${pendingStops.length === 1 ? 'parada' : 'paradas'}${company ? ' + empresa' : ''})`
          : `Parte ${idx + 1} de ${chunks.length} (${startNumber <= endNumber ? `paradas ${startNumber} a ${endNumber}${company && idx === chunks.length - 1 ? ' + empresa' : ''}` : 'volta à empresa'})`,
      stopsCount: chunk.length,
      startStopNumber: startNumber,
      endStopNumber: endNumber,
      url: `https://www.google.com/maps/dir/?${params.toString()}`,
    };
  });
}

export function formatRelativeTimePt(isoString: string, nowMs = Date.now()): {
  label: string;
  ageMinutes: number;
  freshness: 'live' | 'stale' | 'unavailable';
} {
  const timeMs = Date.parse(isoString);
  if (!Number.isFinite(timeMs)) {
    return {label: 'Indisponível', ageMinutes: Infinity, freshness: 'unavailable'};
  }
  const diffSec = Math.max(0, Math.floor((nowMs - timeMs) / 1000));
  const ageMinutes = diffSec / 60;

  let label = '';
  if (diffSec < 45) {
    label = 'Agora mesmo';
  } else if (diffSec < 3600) {
    const mins = Math.floor(diffSec / 60);
    label = `Há ${mins} min`;
  } else {
    const hours = Math.floor(diffSec / 3600);
    label = `Há ${hours} h`;
  }

  if (ageMinutes <= 2) {
    return {label, ageMinutes, freshness: 'live'};
  }
  if (ageMinutes <= 15) {
    return {label, ageMinutes, freshness: 'stale'};
  }
  return {label, ageMinutes, freshness: 'unavailable'};
}

export function haversineMeters(a: Coordinates, b: Coordinates): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

export function formatDurationPt(seconds: number): string {
  const totalMins = Math.max(1, Math.round(seconds / 60));
  if (totalMins < 60) {
    return `${totalMins} min`;
  }
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (mins === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${mins}min`;
}

export function formatDistancePt(meters: number): string {
  if (meters < 1000) {
    return `${Math.max(50, Math.round(meters / 10) * 10)} m`;
  }
  const km = meters / 1000;
  return `${km.toFixed(1).replace('.', ',')} km`;
}

export interface RouteLegEstimate {
  durationSec: number;
  distanceMeters: number;
}

export interface RouteEstimatesResult {
  legs: RouteLegEstimate[];
  totalDurationSec: number;
  totalDistanceMeters: number;
  source: 'osrm' | 'estimativa';
}

const routeEstimatesCache = new Map<string, RouteEstimatesResult>();

function computeFallbackLegs(points: Coordinates[]): RouteEstimatesResult {
  const legs: RouteLegEstimate[] = [];
  let totalDurationSec = 0;
  let totalDistanceMeters = 0;

  for (let i = 0; i < points.length - 1; i += 1) {
    const straight = haversineMeters(points[i], points[i + 1]);
    const distanceMeters = Math.round(straight * 1.28);
    // Average regional road speed ~55 km/h
    const durationSec = Math.max(60, Math.round((distanceMeters / 1000 / 55) * 3600));
    legs.push({durationSec, distanceMeters});
    totalDurationSec += durationSec;
    totalDistanceMeters += distanceMeters;
  }

  return {
    legs,
    totalDurationSec,
    totalDistanceMeters,
    source: 'estimativa',
  };
}

export async function fetchRouteLegEstimates(
  points: Coordinates[]
): Promise<RouteEstimatesResult | null> {
  const validPoints = points.filter((p) => isValidCoordinates(p.lat, p.lng));
  if (validPoints.length < 2) return null;

  const cacheKey = validPoints
    .map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`)
    .join(';');

  const cached = routeEstimatesCache.get(cacheKey);
  if (cached) return cached;

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return computeFallbackLegs(validPoints);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const coordsStr = validPoints.map((p) => `${p.lng},${p.lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=false`;
    const res = await fetch(url, {signal: controller.signal});
    if (!res.ok) {
      return computeFallbackLegs(validPoints);
    }

    const data = (await res.json()) as {
      code?: string;
      routes?: Array<{
        duration?: number;
        distance?: number;
        legs?: Array<{duration?: number; distance?: number}>;
      }>;
    };

    const route = data.routes?.[0];
    if (
      data.code !== 'Ok' ||
      !route ||
      !Array.isArray(route.legs) ||
      route.legs.length !== validPoints.length - 1
    ) {
      return computeFallbackLegs(validPoints);
    }

    const legs: RouteLegEstimate[] = route.legs.map((leg) => ({
      durationSec: Math.max(60, Math.round(leg.duration ?? 0)),
      distanceMeters: Math.max(0, Math.round(leg.distance ?? 0)),
    }));
    const totalDurationSec = legs.reduce((sum, l) => sum + l.durationSec, 0);
    const totalDistanceMeters = legs.reduce((sum, l) => sum + l.distanceMeters, 0);

    const result: RouteEstimatesResult = {
      legs,
      totalDurationSec,
      totalDistanceMeters,
      source: 'osrm',
    };
    routeEstimatesCache.set(cacheKey, result);
    return result;
  } catch {
    return computeFallbackLegs(validPoints);
  } finally {
    clearTimeout(timeoutId);
  }
}

// Order pending stops by the fastest road leg from the current position, then from each stop.
export async function organizeStopsByTravelTime(
  origin: Coordinates,
  stops: Array<{stopId: string; lat: number; lng: number}>
): Promise<{stopIds: string[]; source: 'osrm' | 'estimativa'}> {
  const points = [origin, ...stops];
  let durations: Array<Array<number | null>> | null = null;
  if (points.length <= 50 && typeof navigator !== 'undefined' && navigator.onLine !== false) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    try {
      const coords = points.map((p) => `${p.lng},${p.lat}`).join(';');
      const res = await fetch(
        `https://router.project-osrm.org/table/v1/driving/${coords}?annotations=duration`,
        {signal: controller.signal}
      );
      if (res.ok) {
        const data = (await res.json()) as {
          code?: string;
          durations?: Array<Array<number | null>>;
        };
        if (data.code === 'Ok' && data.durations?.length === points.length &&
            data.durations.every((row) => row.length === points.length)) {
          durations = data.durations;
        }
      }
    } catch {
      // Fall back to a geographic estimate when the routing service is unavailable.
    } finally {
      clearTimeout(timeout);
    }
  }

  let usedEstimate = !durations;
  const remaining = new Set(stops.map((_, index) => index + 1));
  const stopIds: string[] = [];
  let from = 0;
  while (remaining.size > 0) {
    let nearest = -1;
    let shortest = Infinity;
    for (const candidate of remaining) {
      const roadTime = durations?.[from]?.[candidate];
      if (roadTime == null || !Number.isFinite(roadTime)) usedEstimate = true;
      const travelTime = roadTime != null && Number.isFinite(roadTime)
        ? roadTime
        : (haversineMeters(points[from], points[candidate]) * 1.28 / 1000 / 55) * 3600;
      if (travelTime < shortest) {
        shortest = travelTime;
        nearest = candidate;
      }
    }
    if (nearest < 0) break;
    stopIds.push(stops[nearest - 1].stopId);
    remaining.delete(nearest);
    from = nearest;
  }
  return {stopIds, source: usedEstimate ? 'estimativa' : 'osrm'};
}

