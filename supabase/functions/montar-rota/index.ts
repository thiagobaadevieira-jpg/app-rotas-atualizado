import {createClient} from 'npm:@supabase/supabase-js@2.105.4';
import {parseIntake} from './payload.ts';
import {bearerToken, secretsMatch} from './secret.ts';

const headers = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

function reply(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {status, headers});
}

function serviceRoleKey(): string | null {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  if (legacy) return legacy;
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed.default || parsed.service_role || null;
  } catch {
    return null;
  }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return reply({ok: false, error: 'Método inválido. Use POST.'}, 405);

  const secret = Deno.env.get('ROUTE_INTAKE_SECRET')?.trim() ?? '';
  if (!secret) return reply({ok: false, error: 'Entrada de rotas não configurada.'}, 500);
  const provided = bearerToken(request.headers.get('Authorization'));
  if (!await secretsMatch(provided, secret)) return reply({ok: false, error: 'Não autorizado.'}, 401);

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > 200_000) return reply({ok: false, error: 'Pedido grande demais.'}, 400);
    body = JSON.parse(text);
  } catch {
    return reply({ok: false, error: 'JSON inválido.'}, 400);
  }

  const parsed = parseIntake(body);
  if (!parsed.ok) return reply(parsed.body, parsed.status);

  const url = Deno.env.get('SUPABASE_URL')?.trim();
  const key = serviceRoleKey();
  if (!url || !key) return reply({ok: false, error: 'Entrada de rotas não configurada.'}, 500);

  try {
    const admin = createClient(url, key, {
      auth: {persistSession: false, autoRefreshToken: false},
    });
    const {data, error} = await admin.rpc('montar_rota', {p_payload: parsed.payload});
    if (error) {
      console.error('montar-rota', parsed.payload.request_id, error.message);
      if (error.message.includes('Could not find the function') || error.message.includes('PGRST202')) {
        return reply({ok: false, error: 'A função de montar rota ainda não está no banco.'}, 500);
      }
      if (error.code === '42501' || /permission denied|Não autorizado/i.test(error.message)) {
        return reply({ok: false, error: 'Não autorizado.'}, 401);
      }
      return reply({ok: false, error: 'Não foi possível montar a rota.'}, 500);
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return reply({ok: false, error: 'Não foi possível montar a rota.'}, 500);
    }
    const result = {...data} as Record<string, unknown>;
    const status = typeof result.http_status === 'number' ? result.http_status : 200;
    delete result.http_status;
    return reply(result, status);
  } catch (error) {
    console.error('montar-rota', parsed.payload.request_id, error instanceof Error ? error.message : 'desconhecido');
    return reply({ok: false, error: 'Não foi possível montar a rota.'}, 500);
  }
});
