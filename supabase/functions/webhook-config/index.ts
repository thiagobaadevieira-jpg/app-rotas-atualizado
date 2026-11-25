import {createClient} from 'npm:@supabase/supabase-js@2.105.4';

const THIAGO_USER_ID = '1e5dc7d4-d1a1-47c4-b06b-21b2021b77ec';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

function reply(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {status, headers: cors});
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors});
  if (request.method !== 'POST') return reply({error: 'M�todo inv�lido.'}, 405);
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return reply({error: 'Entre novamente para continuar.'}, 401);

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const publishable = Deno.env.get('SUPABASE_ANON_KEY')!;
    const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const userClient = createClient(url, publishable, {
      auth: {persistSession: false}, global: {headers: {Authorization: `Bearer ${token}`}},
    });
    const {data: {user}, error: authError} = await userClient.auth.getUser(token);
    if (authError || !user) return reply({error: 'Sess�o inv�lida.'}, 401);

    const {data: profile, error: profileError} = await userClient.from('profiles')
      .select('role,active,display_name').eq('id', user.id).single();
    if (profileError || !profile?.active) return reply({error: 'Acesso n�o autorizado.'}, 403);
    const admin = createClient(url, secret, {auth: {persistSession: false}});

    const input = await request.json();
    if (user.id !== THIAGO_USER_ID || profile.role !== 'admin') {
      if (input?.action === 'notify') return reply({skipped: true, reason: 'Aviso restrito ao Thiago.'});
      return reply({error: 'Acesso restrito ao Thiago.'}, 403);
    }
    if (input?.action === 'notify') {
      const cancellationEvent = input?.evento === 'parada_cancelada' || input?.evento === 'rota_cancelada';
      if (cancellationEvent) {
        const eventId = typeof input.event_id === 'string' ? input.event_id : input.eventId;
        const occurredAt = typeof input.ocorrido_em === 'string' ? input.ocorrido_em : input.completedAt;
        const routeInfo = input.rota;
        const validEventId = typeof eventId === 'string'
          && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId);
        const validOccurredAt = typeof occurredAt === 'string' && Number.isFinite(Date.parse(occurredAt));
        const validRoute = routeInfo && typeof routeInfo.id === 'string' && typeof routeInfo.nome === 'string';
        const validDelivery = (value: unknown) => value == null || (
          typeof value === 'object'
          && typeof (value as Record<string, unknown>).id === 'string'
          && typeof (value as Record<string, unknown>).nome === 'string'
          && typeof (value as Record<string, unknown>).cidade === 'string'
          && typeof (value as Record<string, unknown>).telefone === 'string'
        );
        const validNextRoute = input.proxima_rota == null || (
          typeof input.proxima_rota === 'object'
          && typeof input.proxima_rota.id === 'string'
          && typeof input.proxima_rota.nome === 'string'
        );
        if (!validEventId || !validOccurredAt || !validRoute
            || !validDelivery(input.parada_cancelada) || !validDelivery(input.proxima_entrega)
            || (input.evento === 'rota_cancelada' && !validNextRoute)) {
          return reply({error: 'Dados do cancelamento inválidos.'}, 400);
        }

        const {data: secrets, error: secretError} = await admin.rpc('webhook_delivery_secret');
        if (secretError) throw secretError;
        const config = secrets?.[0];
        if (!config?.webhook_url || !config?.webhook_key) {
          return reply({skipped: true, reason: 'Webhook não configurado.'});
        }

        const claimStopId = input.parada_cancelada?.id
          ? `cancel:${input.parada_cancelada.id}`
          : `cancel:${routeInfo.id}`;
        const {data: claim, error: claimError} = await admin.rpc('webhook_delivery_claim', {
          p_event_id: eventId, p_stop_id: claimStopId, p_completed_at: occurredAt,
        });
        if (claimError) throw claimError;
        if (claim === 'sent') return reply({sent: true, repeated: true});
        if (claim === 'sending') return reply({error: 'Aviso em processamento. Tente novamente.'}, 503);
        if (claim !== 'send') return reply({error: 'Aviso inválido.'}, 409);

        const cancellationPayload = {
          evento: input.evento,
          event_id: eventId,
          ocorrido_em: occurredAt,
          rota: routeInfo,
          parada_cancelada: input.parada_cancelada ?? null,
          proxima_entrega: input.proxima_entrega ?? null,
          ...(input.evento === 'rota_cancelada'
            ? {proxima_rota: input.proxima_rota ?? null}
            : {}),
        };
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);
          let response: Response;
          try {
            response = await fetch(config.webhook_url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config.webhook_key}`,
              },
              body: JSON.stringify(cancellationPayload),
              signal: controller.signal,
            });
          } finally {
            clearTimeout(timeout);
          }
          if (!response.ok) throw new Error(`Webhook respondeu ${response.status}`);
          const {error: finishError} = await admin.rpc('webhook_delivery_finish', {
            p_event_id: eventId, p_status: 'sent',
          });
          if (finishError) throw finishError;
          return reply({sent: true});
        } catch (sendError) {
          await admin.rpc('webhook_delivery_finish', {p_event_id: eventId, p_status: 'failed'});
          throw sendError;
        }
      }

      if (typeof input.routeId !== 'string' || typeof input.stopId !== 'string' ||
        typeof input.eventId !== 'string' || typeof input.completedAt !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.eventId) ||
        !Number.isFinite(Date.parse(input.completedAt))) {
        return reply({error: 'Dados da entrega inv�lidos.'}, 400);
      }

      // Always read the completed stop and the next stop from the database.
      // The browser supplies only IDs and a completion timestamp.
      const {data: stops, error: stopsError} = await userClient.from('route_stops')
        .select('stop_id,nome,cidade,telefone,lat,lng,status,updated_at,sort_order')
        .eq('route_id', input.routeId).order('sort_order');
      if (stopsError) throw stopsError;
      const completed = stops?.find((stop) => stop.stop_id === input.stopId);
      if (!completed || completed.status !== 'concluida' ||
        new Date(completed.updated_at).getTime() !== new Date(input.completedAt).getTime()) {
        return reply({skipped: true, reason: 'Entrega n�o est� mais conclu�da.'});
      }
      const {data: secrets, error: secretError} = await admin.rpc('webhook_delivery_secret');
      if (secretError) throw secretError;
      const config = secrets?.[0];
      if (!config?.webhook_url || !config?.webhook_key) return reply({skipped: true, reason: 'Webhook n�o configurado.'});

      const {data: claim, error: claimError} = await admin.rpc('webhook_delivery_claim', {
        p_event_id: input.eventId, p_stop_id: input.stopId, p_completed_at: input.completedAt,
      });
      if (claimError) throw claimError;
      if (claim === 'sent') return reply({sent: true, repeated: true});
      if (claim === 'sending') return reply({error: 'Aviso em processamento. Tente novamente.'}, 503);
      if (claim !== 'send') return reply({error: 'Aviso inv�lido.'}, 409);

      const next = stops?.find((stop) => stop.status === 'pendente');
      let finalDestination: {name: string; lat: number; lng: number; type: 'fabrica' | 'casa'} | null = null;
      if (!next) {
        const {data: settings, error: settingsError} = await userClient.from('app_settings')
          .select('company_name,company_lat,company_lng,home_name,home_lat,home_lng')
          .eq('id', true).maybeSingle();
        if (settingsError) throw settingsError;
        const wantsHome = input.finalDestinationType === 'home';
        if (wantsHome && settings?.home_lat != null && settings?.home_lng != null) {
          finalDestination = {name: settings.home_name || 'Casa', lat: Number(settings.home_lat),
            lng: Number(settings.home_lng), type: 'casa'};
        } else if (settings?.company_lat != null && settings?.company_lng != null) {
          finalDestination = {name: settings.company_name || 'Fabrica', lat: Number(settings.company_lat),
            lng: Number(settings.company_lng), type: 'fabrica'};
        }
      }

      let returnDuration = input.remainingDurationSec == null ? null : Number(input.remainingDurationSec);
      if (!next && finalDestination && (!Number.isFinite(returnDuration) || returnDuration == null || returnDuration <= 0)) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
          const coordinates = `${completed.lng},${completed.lat};${finalDestination.lng},${finalDestination.lat}`;
          const routeResponse = await fetch(
            `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=false`,
            {signal: controller.signal},
          );
          if (routeResponse.ok) {
            const routeData = await routeResponse.json() as {routes?: Array<{duration?: number}>};
            const routedDuration = routeData.routes?.[0]?.duration;
            if (Number.isFinite(routedDuration) && routedDuration! > 0) returnDuration = routedDuration!;
          }
        } catch {
          // A estimativa por distância abaixo mantém o aviso útil se o roteador estiver indisponível.
        } finally {clearTimeout(timeout);}

        if (!Number.isFinite(returnDuration) || returnDuration == null || returnDuration <= 0) {
          const toRad = (value: number) => value * Math.PI / 180;
          const dLat = toRad(finalDestination.lat - completed.lat);
          const dLng = toRad(finalDestination.lng - completed.lng);
          const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(completed.lat)) *
            Math.cos(toRad(finalDestination.lat)) * Math.sin(dLng / 2) ** 2;
          const straightMeters = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          returnDuration = (straightMeters * 1.28 / 38000) * 3600;
        }
      }
      const remainingMinutes = !next && returnDuration != null && Number.isFinite(returnDuration) &&
        returnDuration >= 0 && returnDuration <= 172800
        ? Math.max(1, Math.round(returnDuration / 60)) : null;
      const durationText = remainingMinutes == null ? null
        : remainingMinutes >= 60
          ? `${Math.floor(remainingMinutes / 60)}h${remainingMinutes % 60 ? ` ${remainingMinutes % 60}min` : ''}`
          : `${remainingMinutes} min`;
      const time = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit',
      }).format(new Date(input.completedAt));
      const notice = `Entrega conclu�da: ${completed.nome}, ${completed.cidade}, �s ${time}.` +
        (next ? ` A caminho da pr�xima entrega: ${next.nome}, ${next.cidade}.` : '');
      const returnNotice = !next && finalDestination
        ? notice + ` Pr\u00f3xima parada: ${finalDestination.name}.` +
          (durationText ? ` Tempo restante estimado para retorno: ~${durationText}.` : '')
        : notice;
      const payload = {
        evento: 'entrega_concluida', id: input.eventId, rota_id: input.routeId,
        cliente: completed.nome, cidade: completed.cidade,
        endereco: `https://www.google.com/maps?q=${completed.lat},${completed.lng}`,
        latitude: Number(completed.lat), longitude: Number(completed.lng),
        localizacao: {latitude: Number(completed.lat), longitude: Number(completed.lng),
          maps_url: `https://www.google.com/maps?q=${completed.lat},${completed.lng}`},
        telefone: completed.telefone || '', status: 'concluida', horario: input.completedAt,
        entregador: profile.display_name, aviso: returnNotice,
        proxima_entrega: next ? {tipo: 'cliente', cliente: next.nome, cidade: next.cidade,
          latitude: Number(next.lat), longitude: Number(next.lng),
          endereco: `https://www.google.com/maps?q=${next.lat},${next.lng}`} :
          finalDestination ? {tipo: finalDestination.type, cliente: finalDestination.name, cidade: '',
            latitude: finalDestination.lat, longitude: finalDestination.lng,
            endereco: `https://www.google.com/maps?q=${finalDestination.lat},${finalDestination.lng}`} : null,
        tempo_restante: durationText ? `~${durationText}` : null,
        tempo_restante_minutos: remainingMinutes,
        destino_final_tipo: !next ? finalDestination?.type ?? null : null,
        retornando_empresa: !next && finalDestination?.type === 'fabrica',
        indo_para_casa: !next && finalDestination?.type === 'casa',
      };
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        let response: Response;
        try {
          response = await fetch(config.webhook_url, {
            method: 'POST', headers: {'Content-Type': 'application/json',
              Authorization: `Bearer ${config.webhook_key}`},
            body: JSON.stringify(payload), signal: controller.signal,
          });
        } finally {clearTimeout(timeout);}
        if (!response.ok) throw new Error(`Webhook respondeu ${response.status}`);
        const {error: finishError} = await admin.rpc('webhook_delivery_finish', {
          p_event_id: input.eventId, p_status: 'sent',
        });
        if (finishError) throw finishError;
        return reply({sent: true});
      } catch (sendError) {
        await admin.rpc('webhook_delivery_finish', {p_event_id: input.eventId, p_status: 'failed'});
        throw sendError;
      }
    }
    if (input?.action === 'notify_return') {
      if (typeof input.routeId !== 'string' || typeof input.eventId !== 'string' ||
        typeof input.startedAt !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.eventId) ||
        !Number.isFinite(Date.parse(input.startedAt))) {
        return reply({error: 'Dados do retorno inv�lidos.'}, 400);
      }
      const {data: route, error: routeError} = await userClient.from('routes')
        .select('id,status,current_destination_stop_id,updated_at,active_driver_name')
        .eq('id', input.routeId).single();
      if (routeError) throw routeError;
      if (route.status !== 'em_andamento' || route.current_destination_stop_id !== '__company__' ||
        new Date(route.updated_at).getTime() !== new Date(input.startedAt).getTime()) {
        return reply({skipped: true, reason: 'Retorno � empresa n�o est� mais ativo.'});
      }
      const {data: company, error: companyError} = await userClient.from('app_settings')
        .select('company_name,company_lat,company_lng').eq('id', true).maybeSingle();
      if (companyError) throw companyError;
      if (!company || company.company_lat == null || company.company_lng == null) {
        return reply({skipped: true, reason: 'Empresa sem coordenadas.'});
      }
      const {data: secrets, error: secretError} = await admin.rpc('webhook_delivery_secret');
      if (secretError) throw secretError;
      const config = secrets?.[0];
      if (!config?.webhook_url || !config?.webhook_key) return reply({skipped: true, reason: 'Webhook n�o configurado.'});
      const {data: claim, error: claimError} = await admin.rpc('webhook_delivery_claim', {
        p_event_id: input.eventId, p_stop_id: `return:${route.id}`, p_completed_at: input.startedAt,
      });
      if (claimError) throw claimError;
      if (claim === 'sent') return reply({sent: true, repeated: true});
      if (claim === 'sending') return reply({error: 'Aviso em processamento. Tente novamente.'}, 503);
      if (claim !== 'send') return reply({error: 'Aviso inv�lido.'}, 409);
      const driver = route.active_driver_name || profile.display_name;
      const time = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit',
      }).format(new Date(input.startedAt));
      const duration = input.remainingDurationSec == null ? null : Number(input.remainingDurationSec);
      const remainingMinutes = duration != null && Number.isFinite(duration) && duration >= 0 && duration <= 172800
        ? Math.max(1, Math.round(duration / 60)) : null;
      const durationText = remainingMinutes == null ? null
        : remainingMinutes >= 60
          ? `${Math.floor(remainingMinutes / 60)}h${remainingMinutes % 60 ? ` ${remainingMinutes % 60}min` : ''}`
          : `${remainingMinutes} min`;
      const notice = `${driver} est� retornando � empresa ${company.company_name} �s ${time}.` +
        (durationText ? ` Tempo restante estimado: ~${durationText}.` : '');
      const payload = {
        evento: 'retorno_empresa', id: input.eventId, rota_id: route.id,
        cliente: company.company_name, cidade: '',
        endereco: `https://www.google.com/maps?q=${company.company_lat},${company.company_lng}`,
        telefone: '', status: 'retornando_empresa', horario: input.startedAt,
        entregador: driver, aviso: notice, tempo_restante: durationText ? `~${durationText}` : null,
        tempo_restante_minutos: remainingMinutes,
        proxima_entrega: null, retornando_empresa: true,
      };
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        let response: Response;
        try {
          response = await fetch(config.webhook_url, {
            method: 'POST', headers: {'Content-Type': 'application/json',
              Authorization: `Bearer ${config.webhook_key}`},
            body: JSON.stringify(payload), signal: controller.signal,
          });
        } finally {clearTimeout(timeout);}
        if (!response.ok) throw new Error(`Webhook respondeu ${response.status}`);
        const {error: finishError} = await admin.rpc('webhook_delivery_finish', {
          p_event_id: input.eventId, p_status: 'sent',
        });
        if (finishError) throw finishError;
        return reply({sent: true});
      } catch (sendError) {
        await admin.rpc('webhook_delivery_finish', {p_event_id: input.eventId, p_status: 'failed'});
        throw sendError;
      }
    }
    if (profile.role !== 'admin') return reply({error: 'Acesso restrito ao administrador.'}, 403);
    if (input?.action === 'get') {
      const {data, error} = await admin.rpc('webhook_config_status');
      if (error) throw error;
      const current = data?.[0];
      return reply({url: current?.webhook_url || '', hasKey: Boolean(current?.has_key)});
    }
    if (input?.action === 'save') {
      if (typeof input.url !== 'string' || typeof input.key !== 'string') {
        return reply({error: 'Informe a URL e a chave.'}, 400);
      }
      let target: URL;
      try {target = new URL(input.url.trim());} catch {return reply({error: 'URL inv�lida.'}, 400);}
      if (target.protocol !== 'https:' || target.hostname !== 'api2.cursor.sh' || target.username || target.password ||
        !target.pathname.startsWith('/automations/webhook/')) {
        return reply({error: 'Use a URL HTTPS do webhook do Cursor.'}, 400);
      }
      if (input.key && !/^crsr_[A-Za-z0-9_-]{20,}$/.test(input.key.trim())) {
        return reply({error: 'A chave deve come�ar com crsr_.'}, 400);
      }
      const {error} = await admin.rpc('webhook_config_save', {
        p_url: target.toString(), p_key: input.key.trim(),
      });
      if (error) throw error;
      return reply({saved: true});
    }
    return reply({error: 'A��o inv�lida.'}, 400);
  } catch (error) {
    console.error('Erro ao configurar o webhook:', error instanceof Error ? error.message : 'desconhecido');
    return reply({error: 'N�o foi poss�vel salvar a configura��o. Tente novamente.'}, 500);
  }
});


