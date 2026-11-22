export type TabId = 'rotas' | 'enderecos' | 'relatorios';

export type StopStatus = 'pendente' | 'concluida' | 'nao_entregue';

export type RouteStatus = 'planejada' | 'em_andamento' | 'finalizada';

export interface Marmoraria {
  id: string;
  nome: string;
  cidade: string;
  telefone: string;
  lat: number;
  lng: number;
  isDemo?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RouteStop {
  stopId: string;
  marmorariaId: string;
  nome: string;
  cidade: string;
  telefone: string;
  lat: number;
  lng: number;
  status: StopStatus;
  updatedAt?: string;
}

export interface RoutePlan {
  id: string;
  nome: string;
  stops: RouteStop[];
  status: RouteStatus;
  currentDestinationStopId: string | null;
  activeDriverName: string | null;
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export const COMPANY_DESTINATION_ID = '__company__';
export const ARRIVED_DESTINATION_PREFIX = '__arrived__:';

export function arrivedDestinationId(stopId: string) {
  return `${ARRIVED_DESTINATION_PREFIX}${stopId}`;
}

export function getArrivedStopId(destinationId: string | null) {
  return destinationId?.startsWith(ARRIVED_DESTINATION_PREFIX)
    ? destinationId.slice(ARRIVED_DESTINATION_PREFIX.length) : null;
}

export interface WhatsAppTemplate {
  id: string;
  titulo: string;
  mensagem: string;
}

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface CompanyLocation extends Coordinates {
  name: string;
  address: string;
}
