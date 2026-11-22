import type {Marmoraria, RoutePlan} from '../types.ts';

export interface RouteCollection {
  marmorariaId: string;
  routeCreatedAt: string;
}

// Each stop in a saved route represents one planned collection.
export function collectionsFromRoutes(routes: RoutePlan[], marmorarias: Marmoraria[]): RouteCollection[] {
  const knownIds = new Set(marmorarias.map((m) => m.id));
  const byCoordinates = new Map(marmorarias.map((m) => [`${m.lat},${m.lng}`, m.id]));
  return routes.flatMap((route) => route.stops.flatMap((stop) => {
    const id = knownIds.has(stop.marmorariaId)
      ? stop.marmorariaId
      : byCoordinates.get(`${stop.lat},${stop.lng}`);
    return id ? [{marmorariaId: id, routeCreatedAt: route.createdAt}] : [];
  }));
}
