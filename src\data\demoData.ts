import type {Marmoraria, RoutePlan, WhatsAppTemplate} from '../types.ts';

const NOW = new Date().toISOString();

export const DEMO_MARMORARIAS: Marmoraria[] = [
  {
    id: 'demo-marm-1',
    nome: 'Marmoraria Pedra Forte',
    cidade: 'Joinville',
    telefone: '(47) 99123-4501',
    lat: -26.28914,
    lng: -48.85122,
    isDemo: true,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'demo-marm-2',
    nome: 'Marmoraria Norte Sul',
    cidade: 'Joinville',
    telefone: '(47) 99244-8810',
    lat: -26.31852,
    lng: -48.83941,
    isDemo: true,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'demo-marm-3',
    nome: 'Marmoraria Itapocu',
    cidade: 'Jaraguá do Sul',
    telefone: '(47) 99612-3304',
    lat: -26.48241,
    lng: -49.06884,
    isDemo: true,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'demo-marm-4',
    nome: 'Marmoraria Serra Azul',
    cidade: 'Jaraguá do Sul',
    telefone: '(47) 99805-7721',
    lat: -26.49125,
    lng: -49.10542,
    isDemo: true,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'demo-marm-5',
    nome: 'Marmoraria Planalto',
    cidade: 'São Bento do Sul',
    telefone: '(47) 99931-1940',
    lat: -26.24891,
    lng: -49.38123,
    isDemo: true,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'demo-marm-6',
    nome: 'Marmoraria Vale Europeu',
    cidade: 'Blumenau',
    telefone: '(47) 99740-6052',
    lat: -26.91563,
    lng: -49.06941,
    isDemo: true,
    createdAt: NOW,
    updatedAt: NOW,
  },
];

export const DEFAULT_WHATSAPP_TEMPLATES: WhatsAppTemplate[] = [
  {
    id: 'tpl-1',
    titulo: 'A caminho da entrega',
    mensagem:
      'Olá! Aqui é da equipe de entregas. Estamos a caminho da sua marmoraria e chegaremos em breve.',
  },
  {
    id: 'tpl-2',
    titulo: 'Confirmação de recebimento',
    mensagem:
      'Olá! Tudo bem? Gostaria de confirmar se há alguém no local para receber o pedido hoje.',
  },
  {
    id: 'tpl-3',
    titulo: 'Visita comercial',
    mensagem:
      'Olá! Estamos passando pela região hoje e gostaríamos de fazer uma visita rápida para mostrar novidades e amostras.',
  },
];

export const DEMO_ROUTES: RoutePlan[] = [
  {
    id: 'demo-route-1',
    nome: 'Rota Norte — Joinville e Jaraguá',
    status: 'planejada',
    currentDestinationStopId: null,
    activeDriverName: null,
    createdByUserId: 'local-user',
    createdByName: 'Modo Individual',
    createdAt: NOW,
    updatedAt: NOW,
    stops: [
      {
        stopId: 'demo-stop-1',
        marmorariaId: 'demo-marm-1',
        nome: 'Marmoraria Pedra Forte',
        cidade: 'Joinville',
        telefone: '(47) 99123-4501',
        lat: -26.28914,
        lng: -48.85122,
        status: 'pendente',
      },
      {
        stopId: 'demo-stop-2',
        marmorariaId: 'demo-marm-2',
        nome: 'Marmoraria Norte Sul',
        cidade: 'Joinville',
        telefone: '(47) 99244-8810',
        lat: -26.31852,
        lng: -48.83941,
        status: 'pendente',
      },
      {
        stopId: 'demo-stop-3',
        marmorariaId: 'demo-marm-3',
        nome: 'Marmoraria Itapocu',
        cidade: 'Jaraguá do Sul',
        telefone: '(47) 99612-3304',
        lat: -26.48241,
        lng: -49.06884,
        status: 'pendente',
      },
    ],
  },
];
