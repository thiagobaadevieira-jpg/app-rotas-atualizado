import {useEffect, useMemo, useState} from 'react';
import type {CompanyLocation, Coordinates, RoutePlan} from '../types.ts';
import {fetchRouteLegEstimates} from '../utils/geo.ts';

export interface RouteDistance {
  meters: number;
  durationSec: number;
  remainingDurationSec: number;
  estimated: boolean;
}

type CachedEstimate = Omit<RouteDistance, 'remainingDurationSec'>;

const routeEstimateCache = new Map<string, CachedEstimate>();

async function estimatePoints(points: Coordinates[], cacheKey: string): Promise<CachedEstimate> {
  const cached = routeEstimateCache.get(cacheKey);
  if (cached) return cached;
  const estimate = await fetchRouteLegEstimates(points);
  const result = {
    meters: estimate?.totalDistanceMeters || 0,
    durationSec: estimate?.totalDurationSec || 0,
    estimated: estimate?.source !== 'osrm',
  };
  if (routeEstimateCache.size > 400) routeEstimateCache.clear();
  routeEstimateCache.set(cacheKey, result);
  return result;
}

export function useRouteDistances(
  routes: RoutePlan[],
  company: CompanyLocation | null,
  enabled = true,
  userPosition?: Coordinates | null,
) {
  const key = useMemo(() => JSON.stringify({
    routes: routes.map((route) => ({
      id: route.id,
      status: route.status,
      currentDestinationStopId: route.currentDestinationStopId,
      stops: route.stops.map((stop) => [stop.stopId, stop.lat, stop.lng, stop.status]),
    })),
    company: company ? [company.lat, company.lng] : null,
    position: userPosition
      ? [Number(userPosition.lat.toFixed(3)), Number(userPosition.lng.toFixed(3))]
      : null,
  }), [routes, company, userPosition]);
  const [distances, setDistances] = useState<Record<string, RouteDistance>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    if (routes.length === 0 || !company) {
      setDistances({});
      setLoading(false);
      return;
    }
    setLoading(true);
    const calculate = async () => {
      const pairs = await Promise.all(routes.map(async (route): Promise<[string, RouteDistance]> => {
        const fullCacheKey = JSON.stringify([
          'full',
          company.lat,
          company.lng,
          route.stops.map((stop) => [stop.lat, stop.lng]),
        ]);
        const fullPoints = route.stops.length > 0
          ? [
            {lat: company.lat, lng: company.lng},
            ...route.stops.map((stop) => ({lat: stop.lat, lng: stop.lng})),
            {lat: company.lat, lng: company.lng},
          ]
          : [];
        const fullEstimate = await estimatePoints(fullPoints, fullCacheKey);

        const pendingStops = route.stops.filter((stop) => stop.status === 'pendente');
        let remainingDurationSec = 0;
        if (route.status !== 'finalizada' && pendingStops.length > 0) {
          const origin = route.currentDestinationStopId && userPosition
            ? userPosition
            : company;
          const remainingPoints = [
            {lat: origin.lat, lng: origin.lng},
            ...pendingStops.map((stop) => ({lat: stop.lat, lng: stop.lng})),
            {lat: company.lat, lng: company.lng},
          ];
          const remainingCacheKey = JSON.stringify([
            'remaining',
            Number(origin.lat.toFixed(3)),
            Number(origin.lng.toFixed(3)),
            pendingStops.map((stop) => [stop.lat, stop.lng]),
            company.lat,
            company.lng,
          ]);
          const remainingEstimate = pendingStops.length === route.stops.length && origin === company
            ? fullEstimate
            : await estimatePoints(remainingPoints, remainingCacheKey);
          remainingDurationSec = remainingEstimate.durationSec;
        }

        const result = {
          ...fullEstimate,
          remainingDurationSec,
        };
        return [route.id, result];
      }));
      if (!cancelled) {
        setDistances(Object.fromEntries(pairs));
        setLoading(false);
      }
    };
    void calculate();
    return () => {cancelled = true;};
  }, [key, enabled]);

  return {distances, loading};
}
