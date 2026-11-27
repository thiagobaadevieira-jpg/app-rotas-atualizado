-- Entrada da rota do dia. Não cria colunas de horário/tipo e não cria trigger:
-- o aviso de saída continua só quando o app chama a função webhook-config.

create schema if not exists app_private;

create or replace function app_private.normalize_nome(p_nome text)
returns text
language sql
immutable
strict
set search_path = ''
as $fn$
  select pg_catalog.regexp_replace(
    pg_catalog.translate(
      p_nome,
      'áàâãäåéèêëíìîïóòôõöúùûüçñýÿÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝŸABCDEFGHIJKLMNOPQRSTUVWXYZ',
      'aaaaaaeeeeiiiiooooouuuucnyyaaaaaaeeeeiiiiooooouuuucnyaabcdefghijklmnopqrstuvwxyz'
    ),
    '[^a-z0-9]',
    '',
    'g'
  );
$fn$;

create or replace function app_private.osa_distance(p_a text, p_b text)
returns integer
language plpgsql
immutable
strict
set search_path = ''
as $fn$
declare
  a_len integer := pg_catalog.char_length(p_a);
  b_len integer := pg_catalog.char_length(p_b);
  prev integer[];
  curr integer[];
  prevprev integer[];
  i integer;
  j integer;
  cost integer;
  value integer;
begin
  if p_a = p_b then return 0; end if;
  if a_len = 0 then return b_len; end if;
  if b_len = 0 then return a_len; end if;
  if a_len > 200 or b_len > 200 then return 999; end if;
  prev := pg_catalog.array_fill(0, array[b_len + 1]);
  for j in 0..b_len loop
    prev[j + 1] := j;
  end loop;
  prevprev := prev;
  for i in 1..a_len loop
    curr := pg_catalog.array_fill(0, array[b_len + 1]);
    curr[1] := i;
    for j in 1..b_len loop
      cost := case when pg_catalog.substr(p_a, i, 1) = pg_catalog.substr(p_b, j, 1) then 0 else 1 end;
      value := least(least(prev[j + 1] + 1, curr[j] + 1), prev[j] + cost);
      if i > 1 and j > 1
         and pg_catalog.substr(p_a, i, 1) = pg_catalog.substr(p_b, j - 1, 1)
         and pg_catalog.substr(p_a, i - 1, 1) = pg_catalog.substr(p_b, j, 1) then
        value := least(value, prevprev[j - 1] + 1);
      end if;
      curr[j + 1] := value;
    end loop;
    prevprev := prev;
    prev := curr;
  end loop;
  return prev[b_len + 1];
end;
$fn$;

-- null = não sugerir. Igualdade exata não é sugestão. Menor pontuação é mais parecida.
create or replace function app_private.suggestion_score(p_needle text, p_candidate text)
returns integer
language plpgsql
immutable
set search_path = ''
as $fn$
declare
  dist integer;
  longest integer;
  shortest integer;
begin
  if p_needle is null or p_candidate is null or p_needle = '' or p_candidate = '' or p_needle = p_candidate then
    return null;
  end if;
  dist := app_private.osa_distance(p_needle, p_candidate);
  longest := greatest(pg_catalog.char_length(p_needle), pg_catalog.char_length(p_candidate));
  if dist = 1 and longest >= 3 then return dist; end if;
  if dist = 2 and longest >= 6 then return dist; end if;
  shortest := least(pg_catalog.char_length(p_needle), pg_catalog.char_length(p_candidate));
  if shortest >= 4 and (
    pg_catalog.strpos(p_candidate, p_needle) > 0 or pg_catalog.strpos(p_needle, p_candidate) > 0
  ) then
    return 100 + pg_catalog.abs(pg_catalog.char_length(p_needle) - pg_catalog.char_length(p_candidate));
  end if;
  return null;
end;
$fn$;

create table if not exists app_private.montar_rota_requests (
  request_id text primary key,
  payload_hash text not null,
  response jsonb not null,
  route_date date not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint montar_rota_requests_id_check check (
    pg_catalog.char_length(request_id) between 1 and 200
    and request_id !~ '[[:space:]]'
  ),
  constraint montar_rota_requests_hash_check check (pg_catalog.char_length(payload_hash) = 32)
);

alter table app_private.montar_rota_requests enable row level security;
alter table app_private.montar_rota_requests force row level security;
revoke all on table app_private.montar_rota_requests from public;

comment on table app_private.montar_rota_requests is
  'Resposta gravada por request_id para a entrada de rotas. Repetir o mesmo pedido devolve esta resposta.';

create or replace function app_private.montar_rota(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_request_id text;
  v_data date;
  v_hash text;
  v_saved jsonb;
  v_saved_hash text;
  v_item record;
  v_cliente text;
  v_marm_id text;
  v_tipo text;
  v_horario text;
  v_campos jsonb := '[]'::jsonb;
  v_dup text;
  v_chave text;
  v_count integer;
  v_sugs jsonb;
  v_resolved text;
  v_nome_cad text;
  v_antes text;
  v_thiago_id text := '1e5dc7d4-d1a1-47c4-b06b-21b2021b77ec';
  v_thiago_name text;
  v_nome text;
  v_start timestamptz;
  v_end timestamptz;
  v_route_id text;
  v_status text;
  v_criada boolean := false;
  v_now timestamptz;
  v_ms bigint;
  v_created timestamptz;
  v_base integer;
  v_n integer := 0;
  v_row record;
  v_stop_id text;
  v_idx integer := 0;
  v_marm record;
  v_response jsonb;
begin
  if coalesce(auth.role(), ''::text) is distinct from 'service_role' then
    return pg_catalog.jsonb_build_object('ok', false, 'http_status', 401, 'error', 'Não autorizado.');
  end if;
  if pg_catalog.jsonb_typeof(p_payload) is distinct from 'object' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'http_status', 400,
      'error', 'Envie um JSON com request_id e paradas.',
      'campos', pg_catalog.jsonb_build_array('request_id', 'paradas')
    );
  end if;

  if pg_catalog.jsonb_typeof(p_payload->'request_id') is distinct from 'string'
     or pg_catalog.btrim(p_payload->>'request_id') = '' then
    v_campos := v_campos || '["request_id"]'::jsonb;
  end if;
  if pg_catalog.jsonb_typeof(p_payload->'paradas') is distinct from 'array' then
    v_campos := v_campos || '["paradas"]'::jsonb;
  end if;
  if pg_catalog.jsonb_array_length(v_campos) > 0 then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'http_status', 400,
      'error', 'Faltam campos: ' || (
        select pg_catalog.string_agg(value, ', ') from pg_catalog.jsonb_array_elements_text(v_campos)
      ) || '.',
      'campos', v_campos
    );
  end if;

  v_request_id := pg_catalog.btrim(p_payload->>'request_id');
  if pg_catalog.char_length(v_request_id) > 200 or v_request_id ~ '[[:space:]]' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'http_status', 400,
      'error', 'request_id deve ser um texto sem espaços, de até 200 caracteres.'
    );
  end if;

  if p_payload ? 'data' and pg_catalog.jsonb_typeof(p_payload->'data') is distinct from 'null' then
    if pg_catalog.jsonb_typeof(p_payload->'data') is distinct from 'string'
       or (p_payload->>'data') !~ '^\d{4}-\d{2}-\d{2}$' then
      return pg_catalog.jsonb_build_object('ok', false, 'http_status', 400, 'error', 'data deve ser YYYY-MM-DD.');
    end if;
    begin
      v_data := (p_payload->>'data')::date;
    exception when others then
      return pg_catalog.jsonb_build_object('ok', false, 'http_status', 400, 'error', 'data deve ser YYYY-MM-DD.');
    end;
    if pg_catalog.to_char(v_data, 'YYYY-MM-DD') is distinct from p_payload->>'data' then
      return pg_catalog.jsonb_build_object('ok', false, 'http_status', 400, 'error', 'data deve ser YYYY-MM-DD.');
    end if;
  else
    v_data := (pg_catalog.clock_timestamp() at time zone 'America/Sao_Paulo')::date;
  end if;

  if pg_catalog.jsonb_array_length(p_payload->'paradas') > 300 then
    return pg_catalog.jsonb_build_object('ok', false, 'http_status', 400, 'error', 'Máximo de 300 paradas por pedido.');
  end if;

  if pg_catalog.to_regclass('pg_temp.intake_parada') is not null then
    drop table pg_temp.intake_parada;
  end if;
  create temp table intake_parada (
    ord integer primary key,
    cliente text,
    marmoraria_id text,
    tipo text,
    horario text,
    chave text,
    resolved_id text,
    nome_final text,
    outcome text,
    stop_id text,
    antes text,
    sugestoes jsonb,
    cadastros jsonb,
    place integer
  ) on commit drop;

  for v_item in
    select elem.value as value, (elem.ordinality - 1)::integer as ord
    from pg_catalog.jsonb_array_elements(p_payload->'paradas') with ordinality as elem(value, ordinality)
  loop
    if pg_catalog.jsonb_typeof(v_item.value) is distinct from 'object' then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'http_status', 400,
        'error', pg_catalog.format('Parada %s: objeto inválido.', v_item.ord + 1),
        'parada', v_item.ord + 1
      );
    end if;

    if v_item.value ? 'cliente' and pg_catalog.jsonb_typeof(v_item.value->'cliente') is distinct from 'null'
       and pg_catalog.jsonb_typeof(v_item.value->'cliente') is distinct from 'string' then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'http_status', 400,
        'error', pg_catalog.format('Parada %s: cliente deve ser texto.', v_item.ord + 1),
        'parada', v_item.ord + 1
      );
    end if;
    if v_item.value ? 'marmoraria_id' and pg_catalog.jsonb_typeof(v_item.value->'marmoraria_id') is distinct from 'null'
       and pg_catalog.jsonb_typeof(v_item.value->'marmoraria_id') is distinct from 'string' then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'http_status', 400,
        'error', pg_catalog.format('Parada %s: marmoraria_id deve ser texto.', v_item.ord + 1),
        'parada', v_item.ord + 1
      );
    end if;

    v_cliente := nullif(pg_catalog.btrim(v_item.value->>'cliente'), ''::text);
    v_marm_id := nullif(pg_catalog.btrim(v_item.value->>'marmoraria_id'), ''::text);
    if v_cliente is null and v_marm_id is null then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'http_status', 400,
        'error', pg_catalog.format('Parada %s: informe cliente ou marmoraria_id.', v_item.ord + 1),
        'parada', v_item.ord + 1
      );
    end if;
    if pg_catalog.char_length(coalesce(v_cliente, '')) > 200
       or pg_catalog.char_length(coalesce(v_marm_id, '')) > 200 then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'http_status', 400,
        'error', pg_catalog.format('Parada %s: cliente ou marmoraria_id longo demais.', v_item.ord + 1),
        'parada', v_item.ord + 1
      );
    end if;

    v_tipo := null;
    if v_item.value ? 'tipo' and pg_catalog.jsonb_typeof(v_item.value->'tipo') is distinct from 'null' then
      if pg_catalog.jsonb_typeof(v_item.value->'tipo') is distinct from 'string'
         or (v_item.value->>'tipo') not in ('entrega', 'coleta') then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'http_status', 400,
          'error', pg_catalog.format('Parada %s: tipo deve ser "entrega" ou "coleta".', v_item.ord + 1),
          'parada', v_item.ord + 1
        );
      end if;
      v_tipo := v_item.value->>'tipo';
    end if;

    v_horario := null;
    if v_item.value ? 'horario' and pg_catalog.jsonb_typeof(v_item.value->'horario') is distinct from 'null' then
      if pg_catalog.jsonb_typeof(v_item.value->'horario') is distinct from 'string'
         or (v_item.value->>'horario') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'http_status', 400,
          'error', pg_catalog.format('Parada %s: horario deve ser HH:MM.', v_item.ord + 1),
          'parada', v_item.ord + 1
        );
      end if;
      v_horario := v_item.value->>'horario';
    end if;

    v_chave := case when v_cliente is null then null else app_private.normalize_nome(v_cliente) end;
    if v_marm_id is null and (v_chave is null or v_chave = '') then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'http_status', 400,
        'error', pg_catalog.format('Parada %s: informe o nome do cliente.', v_item.ord + 1),
        'parada', v_item.ord + 1
      );
    end if;

    insert into pg_temp.intake_parada (ord, cliente, marmoraria_id, tipo, horario, chave)
    values (v_item.ord, v_cliente, v_marm_id, v_tipo, v_horario, v_chave);
  end loop;

  select marmoraria_id into v_dup
  from pg_temp.intake_parada
  where marmoraria_id is not null
  group by marmoraria_id
  having pg_catalog.count(*) > 1
  limit 1;
  if found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'http_status', 400,
      'error', pg_catalog.format('Parada repetida para o mesmo marmoraria_id (%s).', v_dup)
    );
  end if;

  select pg_catalog.min(cliente) into v_dup
  from pg_temp.intake_parada
  where marmoraria_id is null
  group by chave
  having pg_catalog.count(*) > 1
  limit 1;
  if found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'http_status', 400,
      'error', pg_catalog.format('Parada repetida para o cliente %s.', v_dup)
    );
  end if;

  select pg_catalog.md5(pg_catalog.jsonb_build_object(
    'data', pg_catalog.to_char(v_data, 'YYYY-MM-DD'),
    'paradas', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'cliente', cliente,
        'horario', horario,
        'marmoraria_id', marmoraria_id,
        'ord', ord,
        'tipo', tipo
      ) order by ord)
      from pg_temp.intake_parada
    ), '[]'::jsonb),
    'request_id', v_request_id
  )::text) into v_hash;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('montar-rota:' || v_request_id, 0));
  select response, payload_hash into v_saved, v_saved_hash
  from app_private.montar_rota_requests
  where request_id = v_request_id;
  if found then
    if v_saved_hash = v_hash then return v_saved; end if;
    return pg_catalog.jsonb_build_object(
      'ok', false, 'http_status', 409,
      'error', 'request_id já foi usado com outro payload.'
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('montar-rota-dia:' || v_data::text, 0));

  select p.display_name into v_thiago_name
  from public.profiles p
  where p.id = v_thiago_id::uuid
    and p.active
    and p.role = 'admin';
  if v_thiago_name is null then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'http_status', 500,
      'error', 'Perfil do responsável pela rota não está ativo.'
    );
  end if;

  for v_row in select * from pg_temp.intake_parada order by ord loop
    if v_row.marmoraria_id is not null then
      select m.id, m.nome into v_resolved, v_nome_cad
      from public.marmorarias m
      where m.id = v_row.marmoraria_id
      for share;
      if not found then
        update pg_temp.intake_parada
        set outcome = 'faltando', sugestoes = '[]'::jsonb
        where ord = v_row.ord;
      else
        update pg_temp.intake_parada
        set outcome = 'matched', resolved_id = v_resolved, nome_final = v_nome_cad
        where ord = v_row.ord;
      end if;
    else
      select pg_catalog.count(*) into v_count
      from public.marmorarias m
      where app_private.normalize_nome(m.nome) = v_row.chave;
      if v_count = 1 then
        select m.id, m.nome into v_resolved, v_nome_cad
        from public.marmorarias m
        where app_private.normalize_nome(m.nome) = v_row.chave
        for share;
        update pg_temp.intake_parada
        set outcome = 'matched', resolved_id = v_resolved, nome_final = v_nome_cad
        where ord = v_row.ord;
      elsif v_count > 1 then
        select coalesce(pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object('id', q.id, 'nome', q.nome, 'cidade', q.cidade)
          order by q.nome, q.id
        ), '[]'::jsonb) into v_sugs
        from (
          select m.id, m.nome, m.cidade
          from public.marmorarias m
          where app_private.normalize_nome(m.nome) = v_row.chave
          order by m.nome, m.id
        ) q;
        update pg_temp.intake_parada
        set outcome = 'ambiguos', cadastros = v_sugs
        where ord = v_row.ord;
      else
        with scored as (
          select m.id, m.nome, m.cidade,
                 app_private.suggestion_score(v_row.chave, app_private.normalize_nome(m.nome)) as score
          from public.marmorarias m
        )
        select coalesce(pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object('id', q.id, 'nome', q.nome, 'cidade', q.cidade)
          order by q.score, q.nome
        ), '[]'::jsonb) into v_sugs
        from (
          select id, nome, cidade, score from scored where score is not null order by score, nome limit 3
        ) q;
        update pg_temp.intake_parada
        set outcome = 'faltando', sugestoes = v_sugs
        where ord = v_row.ord;
      end if;
    end if;
  end loop;

  select pg_catalog.min(nome_final) into v_dup
  from pg_temp.intake_parada
  where resolved_id is not null
  group by resolved_id
  having pg_catalog.count(*) > 1
  limit 1;
  if found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'http_status', 400,
      'error', pg_catalog.format('Parada repetida para o cliente %s.', v_dup)
    );
  end if;

  v_nome := 'Rota: ' || pg_catalog.to_char(v_data, 'DD/MM');
  v_start := v_data::timestamp at time zone 'America/Sao_Paulo';
  v_end := (v_data + 1)::timestamp at time zone 'America/Sao_Paulo';

  select r.id, r.status into v_route_id, v_status
  from public.routes r
  where r.nome = v_nome
    and r.nome !~* 'parte'
    and r.created_at >= v_start
    and r.created_at < v_end
  order by r.created_at, r.id
  limit 1
  for update;

  for v_row in
    select * from pg_temp.intake_parada where outcome = 'matched' order by ord
  loop
    v_stop_id := null;
    if v_route_id is not null then
      select s.stop_id, s.nome into v_stop_id, v_nome_cad
      from public.route_stops s
      where s.route_id = v_route_id
        and s.marmoraria_id = v_row.resolved_id
        and s.status = 'pendente'
      order by s.sort_order, s.stop_id
      limit 1;
      if found then
        update pg_temp.intake_parada
        set outcome = 'ja_na_rota', stop_id = v_stop_id, nome_final = v_nome_cad
        where ord = v_row.ord;
        continue;
      end if;
      select s.stop_id, s.nome, s.status into v_stop_id, v_nome_cad, v_antes
      from public.route_stops s
      where s.route_id = v_route_id
        and s.marmoraria_id = v_row.resolved_id
      order by s.sort_order desc, s.stop_id desc
      limit 1;
      if found then
        update pg_temp.intake_parada
        set outcome = 'reativada', stop_id = v_stop_id, nome_final = v_nome_cad, antes = v_antes
        where ord = v_row.ord;
        continue;
      end if;
    end if;
    update pg_temp.intake_parada set outcome = 'nova' where ord = v_row.ord;
  end loop;

  if exists (
    select 1 from pg_temp.intake_parada
    where resolved_id is not null
      and outcome not in ('nova', 'ja_na_rota', 'reativada')
  ) then
    raise exception 'parada resolvida sem destino';
  end if;

  update pg_temp.intake_parada p
  set place = ranked.place
  from (
    select ord, (pg_catalog.row_number() over (order by (horario is null), horario, ord) - 1)::integer as place
    from pg_temp.intake_parada
    where outcome in ('nova', 'reativada')
  ) ranked
  where p.ord = ranked.ord;

  select pg_catalog.count(*) into v_n
  from pg_temp.intake_parada
  where outcome in ('nova', 'reativada');

  v_ms := (extract(epoch from pg_catalog.clock_timestamp()) * 1000)::bigint;
  v_now := 'epoch'::timestamptz + v_ms * interval '1 millisecond';

  if v_route_id is null and v_n > 0 then
    while exists (select 1 from public.routes where id = 'route-' || v_ms::text) loop
      v_ms := v_ms + 1;
    end loop;
    v_route_id := 'route-' || v_ms::text;
    v_now := 'epoch'::timestamptz + v_ms * interval '1 millisecond';
    if v_data = (v_now at time zone 'America/Sao_Paulo')::date then
      v_created := v_now;
    else
      v_created := (v_data::timestamp + time '12:00') at time zone 'America/Sao_Paulo';
    end if;
    insert into public.routes (
      id, nome, status, current_destination_stop_id, active_driver_name,
      created_by_user_id, created_by_name, created_at, updated_at
    ) values (
      v_route_id, v_nome, 'em_andamento', null, v_thiago_name,
      v_thiago_id, v_thiago_name, v_created, v_now
    );
    v_status := 'em_andamento';
    v_criada := true;
  end if;

  if v_route_id is not null and v_n > 0 then
    select coalesce(pg_catalog.max(s.sort_order), -1) into v_base
    from public.route_stops s
    where s.route_id = v_route_id
      and s.status = 'pendente';

    update public.route_stops s
    set sort_order = v_base + v_n + ranked.rn
    from (
      select stop_id, pg_catalog.row_number() over (order by sort_order, stop_id)::integer as rn
      from public.route_stops
      where route_id = v_route_id
        and status <> 'pendente'
        and stop_id not in (
          select stop_id from pg_temp.intake_parada
          where outcome = 'reativada' and stop_id is not null
        )
        and sort_order >= v_base + 1
    ) ranked
    where s.stop_id = ranked.stop_id;

    update public.route_stops s
    set status = 'pendente',
        updated_at = v_now,
        sort_order = v_base + 1 + p.place
    from pg_temp.intake_parada p
    where p.outcome = 'reativada'
      and s.stop_id = p.stop_id
      and s.route_id = v_route_id;

    for v_row in
      select * from pg_temp.intake_parada where outcome = 'nova' order by place
    loop
      select m.id, m.nome, m.cidade, m.telefone, m.lat, m.lng
      into v_marm
      from public.marmorarias m
      where m.id = v_row.resolved_id
      for share;
      if not found then
        raise exception 'marmoraria % sumiu durante a montagem', v_row.resolved_id;
      end if;
      v_stop_id := 'stop-' || v_ms::text || '-' || v_idx::text;
      while exists (select 1 from public.route_stops where stop_id = v_stop_id) loop
        v_stop_id := v_stop_id || 'x';
      end loop;
      insert into public.route_stops (
        stop_id, route_id, marmoraria_id, sort_order, nome, cidade, telefone, lat, lng, status, updated_at
      ) values (
        v_stop_id, v_route_id, v_marm.id, v_base + 1 + v_row.place,
        v_marm.nome, v_marm.cidade, coalesce(v_marm.telefone, ''),
        v_marm.lat, v_marm.lng, 'pendente', null
      );
      update pg_temp.intake_parada
      set stop_id = v_stop_id, nome_final = v_marm.nome
      where ord = v_row.ord;
      v_idx := v_idx + 1;
    end loop;
  end if;

  if v_route_id is not null and not v_criada then
    update public.routes r
    set status = case
          when r.status = 'finalizada' then 'em_andamento'
          when r.status = 'planejada' and v_n > 0 then 'em_andamento'
          else r.status
        end,
        current_destination_stop_id = case
          when r.status = 'finalizada' then null
          else r.current_destination_stop_id
        end,
        updated_at = v_now
    where r.id = v_route_id
      and r.nome = v_nome
      and r.nome !~* 'parte'
      and (
        v_n > 0
        or (r.status = 'finalizada' and exists (
          select 1 from pg_temp.intake_parada p where p.outcome = 'ja_na_rota'
        ))
      );
    select r.status into v_status from public.routes r where r.id = v_route_id;
  end if;

  v_response := pg_catalog.jsonb_build_object(
    'ok', true,
    'rota', case when v_route_id is null then null else pg_catalog.jsonb_build_object(
      'id', v_route_id,
      'nome', v_nome,
      'criada', v_criada,
      'status', v_status
    ) end,
    'adicionadas', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'cliente', nome_final, 'stop_id', stop_id, 'marmoraria_id', resolved_id,
        'tipo', tipo, 'horario', horario
      ) order by ord)
      from pg_temp.intake_parada where outcome = 'nova'
    ), '[]'::jsonb),
    'reativadas', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'cliente', nome_final, 'stop_id', stop_id, 'antes', antes,
        'marmoraria_id', resolved_id, 'tipo', tipo, 'horario', horario
      ) order by ord)
      from pg_temp.intake_parada where outcome = 'reativada'
    ), '[]'::jsonb),
    'ja_na_rota', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'cliente', nome_final, 'stop_id', stop_id, 'marmoraria_id', resolved_id,
        'tipo', tipo, 'horario', horario
      ) order by ord)
      from pg_temp.intake_parada where outcome = 'ja_na_rota'
    ), '[]'::jsonb),
    'faltando', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'cliente', coalesce(cliente, marmoraria_id),
        'marmoraria_id', marmoraria_id,
        'sugestoes', coalesce(sugestoes, '[]'::jsonb),
        'tipo', tipo, 'horario', horario
      ) order by ord)
      from pg_temp.intake_parada where outcome = 'faltando'
    ), '[]'::jsonb),
    'ambiguos', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'cliente', coalesce(cliente, marmoraria_id),
        'cadastros', coalesce(cadastros, '[]'::jsonb),
        'tipo', tipo, 'horario', horario
      ) order by ord)
      from pg_temp.intake_parada where outcome = 'ambiguos'
    ), '[]'::jsonb)
  );

  insert into app_private.montar_rota_requests (request_id, payload_hash, response, route_date)
  values (v_request_id, v_hash, v_response, v_data);

  return v_response;
end;
$fn$;

create or replace function public.montar_rota(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if coalesce(auth.role(), ''::text) is distinct from 'service_role' then
    return pg_catalog.jsonb_build_object('ok', false, 'http_status', 401, 'error', 'Não autorizado.');
  end if;
  return app_private.montar_rota(p_payload);
end;
$fn$;

comment on function public.montar_rota(jsonb) is
  'Monta a rota do dia a partir de uma lista de paradas. Executável só pela service role; a Edge Function montar-rota confere o segredo antes de chamar.';

revoke all on function app_private.normalize_nome(text) from public;
revoke all on function app_private.osa_distance(text, text) from public;
revoke all on function app_private.suggestion_score(text, text) from public;
revoke all on function app_private.montar_rota(jsonb) from public;
revoke all on function public.montar_rota(jsonb) from public;

do $grant$
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
    execute 'revoke all on table app_private.montar_rota_requests from anon';
    execute 'revoke all on function app_private.normalize_nome(text) from anon';
    execute 'revoke all on function app_private.osa_distance(text, text) from anon';
    execute 'revoke all on function app_private.suggestion_score(text, text) from anon';
    execute 'revoke all on function app_private.montar_rota(jsonb) from anon';
    execute 'revoke all on function public.montar_rota(jsonb) from anon';
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    execute 'revoke all on table app_private.montar_rota_requests from authenticated';
    execute 'revoke all on function app_private.normalize_nome(text) from authenticated';
    execute 'revoke all on function app_private.osa_distance(text, text) from authenticated';
    execute 'revoke all on function app_private.suggestion_score(text, text) from authenticated';
    execute 'revoke all on function app_private.montar_rota(jsonb) from authenticated';
    execute 'revoke all on function public.montar_rota(jsonb) from authenticated';
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    execute 'revoke all on table app_private.montar_rota_requests from service_role';
    execute 'revoke all on function app_private.normalize_nome(text) from service_role';
    execute 'revoke all on function app_private.osa_distance(text, text) from service_role';
    execute 'revoke all on function app_private.suggestion_score(text, text) from service_role';
    execute 'revoke all on function app_private.montar_rota(jsonb) from service_role';
    execute 'grant execute on function public.montar_rota(jsonb) to service_role';
  end if;
end
$grant$;

do $check$
begin
  if pg_catalog.char_length('áàâãäåéèêëíìîïóòôõöúùûüçñýÿÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝŸABCDEFGHIJKLMNOPQRSTUVWXYZ')
     is distinct from pg_catalog.char_length('aaaaaaeeeeiiiiooooouuuucnyyaaaaaaeeeeiiiiooooouuuucnyaabcdefghijklmnopqrstuvwxyz') then
    raise exception 'mapa de acentos com tamanho errado';
  end if;
  if app_private.normalize_nome('Síloe') is distinct from 'siloe'
     or app_private.normalize_nome('  D''Água Ltda. ') is distinct from 'dagualtda'
     or app_private.normalize_nome('São João') is distinct from 'saojoao' then
    raise exception 'normalize_nome falhou';
  end if;
  if app_private.osa_distance('sileo', 'siloe') is distinct from 1
     or app_private.osa_distance('siloe', 'siloe') is distinct from 0
     or app_private.osa_distance('siloe', 'siloa') is distinct from 1 then
    raise exception 'osa_distance falhou: sileo/siloe=%', app_private.osa_distance('sileo', 'siloe');
  end if;
  if app_private.suggestion_score('sileo', 'siloe') is distinct from 1
     or app_private.suggestion_score('siloe', 'siloe') is not null then
    raise exception 'suggestion_score falhou';
  end if;
end
$check$;

notify pgrst, 'reload schema';
