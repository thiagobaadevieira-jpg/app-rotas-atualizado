import {useEffect, useMemo, useState} from 'react';
import type {CompanyLocation, RoutePlan} from '../types.ts';
import {fetchRouteLegEstimates} from '../utils/geo.ts';

export interface RouteDistance {
  meters: number;
  durationSec: number;
  estimated: boolean;
}

const routeDistanceCache = new Map<string, RouteDistance>();

export function useRouteDistances(
  routes: RoutePlan[],
  company: CompanyLocation | null,
  enabled = true,
) {
  const key = useMemo(() => JSON.stringify({
    routes: routes.map((route) => ({
      id: route.id,
      stops: route.stops.map((stop) => [stop.stopId, stop.lat, stop.lng]),
    })),
    company: company ? [company.lat, company.lng] : null,
  }), [routes, company]);
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
        const cacheKey = JSON.stringify([
          company.lat,
          company.lng,
          route.stops.map((stop) => [stop.lat, stop.lng]),
        ]);
        const cached = routeDistanceCache.get(cacheKey);
        if (cached) return [route.id, cached];
        const points = company && route.stops.length > 0
          ? [
            {lat: company.lat, lng: company.lng},
            ...route.stops.map((stop) => ({lat: stop.lat, lng: stop.lng})),
            {lat: company.lat, lng: company.lng},
          ]
          : [];
        const estimate = await fetchRouteLegEstimates(points);
        const result = {
          meters: estimate?.totalDistanceMeters || 0,
          durationSec: estimate?.totalDurationSec || 0,
          estimated: estimate?.source !== 'osrm',
        };
        if (routeDistanceCache.size > 200) routeDistanceCache.clear();
        routeDistanceCache.set(cacheKey, result);
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
