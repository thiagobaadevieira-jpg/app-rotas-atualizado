import {useEffect, useMemo, useState} from 'react';
import type {CompanyLocation, RoutePlan} from '../types.ts';
import {fetchRouteLegEstimates} from '../utils/geo.ts';

export interface RouteDistance {
  meters: number;
  estimated: boolean;
}

export function useRouteDistances(routes: RoutePlan[], company: CompanyLocation | null) {
  const key = useMemo(() => JSON.stringify({
    routes: routes.map((route) => ({
      id: route.id,
      stops: route.stops.map((stop) => [stop.stopId, stop.lat, stop.lng, stop.status]),
    })),
    company: company ? [company.lat, company.lng] : null,
  }), [routes, company]);
  const [distances, setDistances] = useState<Record<string, RouteDistance>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const calculate = async () => {
      const pairs = await Promise.all(routes.map(async (route): Promise<[string, RouteDistance]> => {
        const points = company && route.stops.length > 0
          ? [
            {lat: company.lat, lng: company.lng},
            ...route.stops.map((stop) => ({lat: stop.lat, lng: stop.lng})),
            {lat: company.lat, lng: company.lng},
          ]
          : [];
        const estimate = await fetchRouteLegEstimates(points);
        return [route.id, {
          meters: estimate?.totalDistanceMeters || 0,
          estimated: estimate?.source !== 'osrm',
        }];
      }));
      if (!cancelled) {
        setDistances(Object.fromEntries(pairs));
        setLoading(false);
      }
    };
    void calculate();
    return () => {cancelled = true;};
  }, [key]);

  return {distances, loading};
}
