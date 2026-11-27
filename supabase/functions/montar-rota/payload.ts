import {normalizeNome, todayInSaoPaulo} from './logic.ts';

const HORARIO = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

export interface ParadaPayload {
  ord: number;
  cliente: string | null;
  marmoraria_id: string | null;
  tipo: 'entrega' | 'coleta' | null;
  horario: string | null;
}

export interface IntakePayload {
  request_id: string;
  data: string;
  paradas: ParadaPayload[];
}

export type ParseResult =
  | {ok: true; payload: IntakePayload}
  | {ok: false; status: number; body: Record<string, unknown>};

function fail(status: number, error: string, extra: Record<string, unknown> = {}): ParseResult {
  return {ok: false, status, body: {ok: false, error, ...extra}};
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function realDate(value: string): boolean {
  if (!DATA.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function parseIntake(body: unknown, now = new Date()): ParseResult {
  if (!isObject(body)) return fail(400, 'Envie um JSON com request_id e paradas.', {campos: ['request_id', 'paradas']});

  const campos: string[] = [];
  if (typeof body.request_id !== 'string' || body.request_id.trim() === '') campos.push('request_id');
  if (!Array.isArray(body.paradas)) campos.push('paradas');
  if (campos.length) {
    return fail(400, `Faltam campos: ${campos.join(', ')}.`, {campos});
  }

  const requestId = (body.request_id as string).trim();
  if (requestId.length > 200 || /\s/.test(requestId)) {
    return fail(400, 'request_id deve ser um texto sem espaços, de até 200 caracteres.');
  }

  let data: string;
  if (body.data == null || body.data === '') {
    data = todayInSaoPaulo(now);
  } else if (typeof body.data !== 'string' || !realDate(body.data)) {
    return fail(400, 'data deve ser YYYY-MM-DD.');
  } else {
    data = body.data;
  }

  const paradas = body.paradas as unknown[];
  if (paradas.length > 300) return fail(400, 'Máximo de 300 paradas por pedido.');

  const parsed: ParadaPayload[] = [];
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  for (let index = 0; index < paradas.length; index++) {
    const item = paradas[index];
    const numero = index + 1;
    if (!isObject(item)) return fail(400, `Parada ${numero}: objeto inválido.`, {parada: numero});

    if (item.cliente != null && typeof item.cliente !== 'string') {
      return fail(400, `Parada ${numero}: cliente deve ser texto.`, {parada: numero});
    }
    if (item.marmoraria_id != null && typeof item.marmoraria_id !== 'string') {
      return fail(400, `Parada ${numero}: marmoraria_id deve ser texto.`, {parada: numero});
    }
    const cliente = typeof item.cliente === 'string' ? item.cliente.trim() : '';
    const marmorariaId = typeof item.marmoraria_id === 'string' ? item.marmoraria_id.trim() : '';
    if (!cliente && !marmorariaId) {
      return fail(400, `Parada ${numero}: informe cliente ou marmoraria_id.`, {parada: numero});
    }
    if (cliente.length > 200 || marmorariaId.length > 200) {
      return fail(400, `Parada ${numero}: cliente ou marmoraria_id longo demais.`, {parada: numero});
    }
    if (cliente && !marmorariaId && normalizeNome(cliente) === '') {
      return fail(400, `Parada ${numero}: informe o nome do cliente.`, {parada: numero});
    }

    let tipo: 'entrega' | 'coleta' | null = null;
    if (item.tipo != null) {
      if (item.tipo !== 'entrega' && item.tipo !== 'coleta') {
        return fail(400, `Parada ${numero}: tipo deve ser "entrega" ou "coleta".`, {parada: numero});
      }
      tipo = item.tipo;
    }

    let horario: string | null = null;
    if (item.horario != null) {
      if (typeof item.horario !== 'string' || !HORARIO.test(item.horario)) {
        return fail(400, `Parada ${numero}: horario deve ser HH:MM.`, {parada: numero});
      }
      horario = item.horario;
    }

    if (marmorariaId) {
      if (seenIds.has(marmorariaId)) {
        return fail(400, `Parada repetida para o mesmo marmoraria_id (${marmorariaId}).`, {parada: numero});
      }
      seenIds.add(marmorariaId);
    } else {
      const chave = normalizeNome(cliente);
      if (seenNames.has(chave)) {
        return fail(400, `Parada repetida para o cliente ${cliente}.`, {parada: numero});
      }
      seenNames.add(chave);
    }

    parsed.push({
      ord: index,
      cliente: cliente || null,
      marmoraria_id: marmorariaId || null,
      tipo,
      horario,
    });
  }

  return {ok: true, payload: {request_id: requestId, data, paradas: parsed}};
}
