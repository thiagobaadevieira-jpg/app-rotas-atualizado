import {createClient} from '@supabase/supabase-js';
import type {CompanyLocation, Marmoraria, RoutePlan, RouteStop, WhatsAppTemplate} from '../types.ts';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
export const supabase = url && key ? createClient(url, key) : null;

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  role: 'admin' | 'motorista';
  active: boolean;
}

export interface AppData {
  marmorarias: Marmoraria[];
  routes: RoutePlan[];
  templates: WhatsAppTemplate[];
  company: CompanyLocation | null;
  home: CompanyLocation | null;
}

function client() {
  if (!supabase) throw new Error('Configure as vari�veis do Supabase para entrar.');
  return supabase;
}

function checked<T>(result: {data: T; error: {message: string} | null}): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

export async function loadProfile(userId: string): Promise<Profile> {
  const data = checked(await client().from('profiles').select('id,username,display_name,role,active').eq('id', userId).single());
  if (!data || !data.active) throw new Error('Usu�rio sem acesso ativo ao aplicativo.');
  return data as Profile;
}

export async function loadAppData(): Promise<AppData> {
  const db = client();
  const [marm, routes, stops, templates, settings] = await Promise.all([
    db.from('marmorarias').select('*').order('nome'),
    db.from('routes').select('*').order('created_at', {ascending: false}),
    db.from('route_stops').select('*').order('sort_order'),
    db.from('whatsapp_templates').select('*').order('sort_order'),
    db.from('app_settings').select('*').eq('id', true).maybeSingle(),
  ]);
  const stopRows = checked(stops) as Record<string, any>[];
  const stopsByRoute = new Map<string, RouteStop[]>();
  for (const s of stopRows) {
    const list = stopsByRoute.get(s.route_id) || [];
    list.push({stopId: s.stop_id, marmorariaId: s.marmoraria_id || '', nome: s.nome,
      cidade: s.cidade, telefone: s.telefone, lat: s.lat, lng: s.lng,
      status: s.status, updatedAt: s.updated_at || undefined});
    stopsByRoute.set(s.route_id, list);
  }
  const setting = checked(settings) as Record<string, any> | null;
  return {
    marmorarias: (checked(marm) as Record<string, any>[]).map((m) => ({id: m.id, nome: m.nome,
      cidade: m.cidade, telefone: m.telefone, lat: m.lat, lng: m.lng,
      createdAt: m.created_at, updatedAt: m.updated_at})),
    routes: (checked(routes) as Record<string, any>[]).map((r) => ({id: r.id, nome: r.nome,
      status: r.status, stops: stopsByRoute.get(r.id) || [],
      currentDestinationStopId: r.current_destination_stop_id,
      activeDriverName: r.active_driver_name, createdByUserId: r.created_by_user_id || '',
      createdByName: r.created_by_name || '', createdAt: r.created_at, updatedAt: r.updated_at})),
    templates: (checked(templates) as Record<string, any>[]).map((t) => ({id: t.id, titulo: t.titulo, mensagem: t.mensagem})),
    company: setting?.company_name && Number.isFinite(setting.company_lat) && Number.isFinite(setting.company_lng)
      ? {name: setting.company_name, address: setting.company_address || '',
        lat: setting.company_lat, lng: setting.company_lng} : null,
    home: setting?.home_name && Number.isFinite(setting.home_lat) && Number.isFinite(setting.home_lng)
      ? {name: setting.home_name, address: '', lat: setting.home_lat, lng: setting.home_lng} : null,
  };
}

export async function saveMarmoraria(m: Marmoraria) {
  checked(await client().from('marmorarias').upsert({id: m.id, nome: m.nome, cidade: m.cidade,
    telefone: m.telefone, lat: m.lat, lng: m.lng, created_at: m.createdAt, updated_at: m.updatedAt}));
}

export async function deleteMarmoraria(id: string) {
  checked(await client().from('marmorarias').delete().eq('id', id));
}

export async function saveRoute(route: RoutePlan, previousStopIds: string[] = []) {
  const db = client();
  checked(await db.from('routes').upsert({id: route.id, nome: route.nome, status: route.status,
    current_destination_stop_id: route.currentDestinationStopId, active_driver_name: route.activeDriverName,
    created_by_user_id: route.createdByUserId || null, created_by_name: route.createdByName || null,
    created_at: route.createdAt, updated_at: route.updatedAt}));
  if (route.stops.length) {
    checked(await db.from('route_stops').upsert(route.stops.map((s, sort_order) => ({
      stop_id: s.stopId, route_id: route.id, marmoraria_id: s.marmorariaId || null,
      sort_order, nome: s.nome, cidade: s.cidade, telefone: s.telefone,
      lat: s.lat, lng: s.lng, status: s.status, updated_at: s.updatedAt || null,
    }))));
  }
  const removed = previousStopIds.filter((id) => !route.stops.some((s) => s.stopId === id));
  if (removed.length) {
    const deleted = checked(await db.from('route_stops').delete().eq('route_id', route.id)
      .in('stop_id', removed).select('stop_id')) as {stop_id: string}[];
    if (deleted.length !== removed.length) {
      const remaining = checked(await db.from('route_stops').select('stop_id')
        .eq('route_id', route.id).in('stop_id', removed)) as {stop_id: string}[];
      if (remaining.length > 0) {
        throw new Error('Algumas paradas n�o foram removidas. Verifique se sua conta tem permiss�o e tente novamente.');
      }
    }
  }
}

export async function deleteRoute(id: string) {
  checked(await client().from('routes').delete().eq('id', id));
}

export async function saveTemplates(templates: WhatsAppTemplate[]) {
  const db = client();
  if (templates.length) checked(await db.from('whatsapp_templates').upsert(templates.map((t, sort_order) => ({
    id: t.id, titulo: t.titulo, mensagem: t.mensagem, sort_order,
  }))));
  const existing = checked(await db.from('whatsapp_templates').select('id')) as {id: string}[];
  const removed = existing.filter((t) => !templates.some((next) => next.id === t.id)).map((t) => t.id);
  if (removed.length) checked(await db.from('whatsapp_templates').delete().in('id', removed));
}

export async function saveCompany(company: CompanyLocation | null) {
  const db = client();
  if (company) checked(await db.from('app_settings').upsert({id: true, company_name: company.name,
    company_address: company.address, company_lat: company.lat, company_lng: company.lng,
    updated_at: new Date().toISOString()}));
  else checked(await db.from('app_settings').update({company_name: null, company_address: null,
    company_lat: null, company_lng: null, updated_at: new Date().toISOString()}).eq('id', true));
}

export async function saveHome(home: CompanyLocation | null) {
  const db = client();
  if (home) checked(await db.from('app_settings').upsert({id: true, home_name: home.name,
    home_lat: home.lat, home_lng: home.lng, updated_at: new Date().toISOString()}));
  else checked(await db.from('app_settings').update({home_name: null, home_lat: null,
    home_lng: null, updated_at: new Date().toISOString()}).eq('id', true));
}

