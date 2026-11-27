-- Teste local da função. Rode só no banco montar_rota_test, depois do fixture e da migração.
\set ON_ERROR_STOP on

do $guard$
begin
  if current_database() is distinct from 'montar_rota_test' then
    raise exception 'teste só roda no banco montar_rota_test';
  end if;
  if exists (select 1 from public.routes where id = 'route-1795766590925') then
    raise exception 'recusa: isto parece o banco de produção';
  end if;
end
$guard$;

begin;

select set_config('request.jwt.claim.role', 'authenticated', true);

do $t$
declare
  v jsonb;
  v_routes integer;
begin
  select public.montar_rota('{"request_id":"nao-autorizado","paradas":[{"cliente":"Zeta"}]}'::jsonb) into v;
  if v->>'http_status' is distinct from '401' or (v->>'ok')::boolean then
    raise exception 'papel authenticated deveria receber 401, veio %', v;
  end if;
  select count(*) into v_routes from public.routes where id like 'route-1%';
  if v_routes <> 0 then
    raise exception '401 não pode gravar rota';
  end if;
end
$t$;

select set_config('request.jwt.claim.role', 'service_role', true);

do $t$
declare
  v jsonb;
  v_ordem text;
  v_replay jsonb;
  v_parte timestamptz;
  v_old timestamptz;
  v_beta_updated timestamptz;
  v_beta_sort integer;
  v_dest text;
  v_count integer;
begin
  select updated_at into v_parte from public.routes where id = 'route-parte';
  select updated_at into v_old from public.routes where id = 'route-old';

  select public.montar_rota(jsonb_build_object(
    'request_id', 'dup-1',
    'data', '2026-12-20',
    'paradas', jsonb_build_array(
      jsonb_build_object('cliente', 'Zeta'),
      jsonb_build_object('cliente', '  zeta ')
    )
  )) into v;
  if v->>'http_status' is distinct from '400' then
    raise exception 'nome repetido deveria ser 400, veio %', v;
  end if;
  if exists (
    select 1 from public.routes
    where nome = 'Rota: 20/12' and created_at >= '2026-12-20 00:00:00-03' and created_at < '2026-12-21 00:00:00-03'
  ) then
    raise exception '400 gravou rota';
  end if;

  select public.montar_rota(jsonb_build_object(
    'request_id', 'cria-1',
    'data', '2026-12-15',
    'paradas', jsonb_build_array(
      jsonb_build_object('cliente', 'Zeta', 'horario', '10:00', 'tipo', 'entrega'),
      jsonb_build_object('cliente', 'Alfa', 'horario', '08:00', 'tipo', 'coleta'),
      jsonb_build_object('cliente', 'Sem Hora')
    )
  )) into v;

  if (v->>'ok')::boolean is not true or (v->'rota'->>'criada')::boolean is not true then
    raise exception 'deveria criar a rota, veio %', v;
  end if;
  if v->'rota'->>'nome' is distinct from 'Rota: 15/12'
     or v->'rota'->>'status' is distinct from 'em_andamento'
     or v->'rota'->>'id' !~ '^route-[0-9]+$' then
    raise exception 'rota fora do formato do app, veio %', v->'rota';
  end if;
  if jsonb_array_length(v->'adicionadas') <> 3
     or jsonb_array_length(v->'faltando') <> 0
     or jsonb_array_length(v->'ambiguos') <> 0 then
    raise exception 'listas inesperadas %', v;
  end if;

  select string_agg(nome || ':' || sort_order::text || ':' || status || ':' || coalesce(telefone, ''), ',' order by sort_order)
  into v_ordem
  from public.route_stops
  where route_id = v->'rota'->>'id';
  if v_ordem is distinct from 'Alfa:0:pendente:47922220000,Zeta:1:pendente:47911110000,Sem Hora:2:pendente:47944440000' then
    raise exception 'ordem/cópia errada: %', v_ordem;
  end if;
  if exists (
    select 1 from public.route_stops
    where route_id = v->'rota'->>'id' and (nome ~ '[0-9]{2}:[0-9]{2}' or nome ~* 'entrega|coleta')
  ) then
    raise exception 'horário ou tipo vazou para o nome';
  end if;
  if exists (
    select 1 from public.route_stops
    where route_id = v->'rota'->>'id' and stop_id !~ '^stop-[0-9]+-[0-9]+$'
  ) then
    raise exception 'stop_id fora do formato do app';
  end if;

  select r.active_driver_name || '|' || r.created_by_name || '|' || r.created_by_user_id || '|' || coalesce(r.current_destination_stop_id, '')
  into v_dest
  from public.routes r
  where r.id = v->'rota'->>'id';
  if v_dest is distinct from 'Thiago|Thiago|1e5dc7d4-d1a1-47c4-b06b-21b2021b77ec|' then
    raise exception 'criador/motorista fora do padrão, veio %', v_dest;
  end if;

  if (
    select created_at from public.routes where id = v->'rota'->>'id'
  ) < '2026-12-15 00:00:00-03'::timestamptz
     or (
    select created_at from public.routes where id = v->'rota'->>'id'
  ) >= '2026-12-16 00:00:00-03'::timestamptz then
    raise exception 'created_at fora do dia em São Paulo';
  end if;

  v_replay := v;
  select public.montar_rota(jsonb_build_object(
    'request_id', 'cria-1',
    'data', '2026-12-15',
    'paradas', jsonb_build_array(
      jsonb_build_object('cliente', 'Zeta', 'horario', '10:00', 'tipo', 'entrega'),
      jsonb_build_object('cliente', 'Alfa', 'horario', '08:00', 'tipo', 'coleta'),
      jsonb_build_object('cliente', 'Sem Hora')
    )
  )) into v;
  if v is distinct from v_replay then
    raise exception 'repetição não devolveu a mesma resposta % vs %', v, v_replay;
  end if;
  select count(*) into v_count from public.route_stops where route_id = v->'rota'->>'id';
  if v_count <> 3 then
    raise exception 'repetição duplicou parada, count=%', v_count;
  end if;

  select public.montar_rota(jsonb_build_object(
    'request_id', 'cria-1',
    'data', '2026-12-15',
    'paradas', jsonb_build_array(jsonb_build_object('cliente', 'Beta'))
  )) into v;
  if v->>'http_status' is distinct from '409' then
    raise exception 'mesmo request_id com outro payload deveria ser 409, veio %', v;
  end if;
  select count(*) into v_count from public.route_stops where route_id = v_replay->'rota'->>'id';
  if v_count <> 3 then
    raise exception '409 alterou a rota';
  end if;

  select public.montar_rota(jsonb_build_object(
    'request_id', 'soma-beta',
    'data', '2026-12-15',
    'paradas', jsonb_build_array(
      jsonb_build_object('cliente', 'zeta', 'horario', '10:00'),
      jsonb_build_object('marmoraria_id', 'marm-beta', 'horario', '09:00', 'tipo', 'entrega')
    )
  )) into v;
  if jsonb_array_length(v->'ja_na_rota') <> 1 or jsonb_array_length(v->'adicionadas') <> 1 then
    raise exception 'segunda lista deveria só acrescentar Beta, veio %', v;
  end if;
  if (v->'rota'->>'criada')::boolean then
    raise exception 'não pode criar segunda rota no mesmo dia';
  end if;
  if v->'adicionadas'->0->>'cliente' is distinct from 'Beta'
     or v->'adicionadas'->0->>'horario' is distinct from '09:00'
     or v->'adicionadas'->0->>'tipo' is distinct from 'entrega' then
    raise exception 'resposta da nova parada incompleta %', v->'adicionadas';
  end if;
  select updated_at, sort_order into v_beta_updated, v_beta_sort
  from public.route_stops
  where route_id = v->'rota'->>'id' and marmoraria_id = 'marm-zeta';
  if v_beta_updated is not null or v_beta_sort is distinct from 1 then
    raise exception 'parada já pendente foi alterada: updated=% sort=%', v_beta_updated, v_beta_sort;
  end if;

  update public.route_stops
  set status = 'concluida', updated_at = '2026-12-15 16:00:00-03'
  where route_id = v->'rota'->>'id' and marmoraria_id = 'marm-alfa';
  update public.route_stops
  set status = 'nao_entregue', updated_at = '2026-12-15 16:10:00-03'
  where route_id = v->'rota'->>'id' and marmoraria_id = 'marm-sem';

  select public.montar_rota(jsonb_build_object(
    'request_id', 'reativa-1',
    'data', '2026-12-15',
    'paradas', jsonb_build_array(
      jsonb_build_object('cliente', 'Sem Hora'),
      jsonb_build_object('cliente', 'Alfa', 'horario', '07:30', 'tipo', 'coleta')
    )
  )) into v;
  if jsonb_array_length(v->'reativadas') <> 2 then
    raise exception 'deveria reativar as duas, veio %', v->'reativadas';
  end if;
  if (
    select antes from jsonb_to_recordset(v->'reativadas') as x(cliente text, antes text)
    where cliente = 'Alfa'
  ) is distinct from 'concluida'
     or (
    select antes from jsonb_to_recordset(v->'reativadas') as x(cliente text, antes text)
    where cliente = 'Sem Hora'
  ) is distinct from 'nao_entregue' then
    raise exception 'antes errado %', v->'reativadas';
  end if;

  select string_agg(nome, ',' order by sort_order)
  into v_ordem
  from public.route_stops
  where route_id = v->'rota'->>'id' and status = 'pendente';
  -- pendentes antigas ficam; reativadas entram depois, Alfa (07:30) antes de Sem Hora (sem horário)
  if v_ordem is distinct from 'Zeta,Beta,Alfa,Sem Hora' then
    raise exception 'reativadas fora da seção pendente: %', v_ordem;
  end if;
  if exists (
    select 1 from public.route_stops
    where route_id = v->'rota'->>'id'
      and marmoraria_id in ('marm-alfa', 'marm-sem')
      and (status <> 'pendente' or updated_at is null)
  ) then
    raise exception 'reativação não atualizou status/updated_at';
  end if;

  update public.routes
  set status = 'finalizada', current_destination_stop_id = 'stop-destino', active_driver_name = null
  where id = v->'rota'->>'id';

  select public.montar_rota(jsonb_build_object(
    'request_id', 'reabre-1',
    'data', '2026-12-15',
    'paradas', jsonb_build_array(jsonb_build_object('cliente', 'Beta'))
  )) into v;
  if v->'rota'->>'status' is distinct from 'em_andamento'
     or jsonb_array_length(v->'ja_na_rota') <> 1
     or jsonb_array_length(v->'adicionadas') <> 0 then
    raise exception 'reabertura inesperada %', v;
  end if;
  select current_destination_stop_id, status into v_dest, v_ordem
  from public.routes where id = v->'rota'->>'id';
  if v_dest is not null or v_ordem is distinct from 'em_andamento' then
    raise exception 'destino de rota finalizada deveria ser limpo, dest=% status=%', v_dest, v_ordem;
  end if;
  select updated_at into v_beta_updated
  from public.route_stops
  where route_id = v->'rota'->>'id' and marmoraria_id = 'marm-beta';
  if v_beta_updated is not null then
    raise exception 'ja_na_rota não pode mexer na parada';
  end if;

  update public.routes
  set status = 'em_andamento', current_destination_stop_id = 'stop-keep', updated_at = '2026-12-15 17:00:00-03'
  where id = v->'rota'->>'id';

  select public.montar_rota(jsonb_build_object(
    'request_id', 'gama-1',
    'data', '2026-12-15',
    'paradas', jsonb_build_array(jsonb_build_object('marmoraria_id', 'marm-gama'))
  )) into v;
  select current_destination_stop_id into v_dest from public.routes where id = v->'rota'->>'id';
  if v_dest is distinct from 'stop-keep' then
    raise exception 'rota em andamento não deve perder o destino, veio %', v_dest;
  end if;
  if jsonb_array_length(v->'adicionadas') <> 1 then
    raise exception 'id explícito deveria entrar, veio %', v;
  end if;

  select count(*) into v_count
  from public.routes
  where nome = 'Rota: 15/12'
    and created_at >= '2026-12-15 00:00:00-03'
    and created_at < '2026-12-16 00:00:00-03';
  if v_count <> 1 then
    raise exception 'deveria existir uma única rota padrão no dia, count=%', v_count;
  end if;
  if (select updated_at from public.routes where id = 'route-parte') is distinct from v_parte
     or (select count(*) from public.route_stops where route_id = 'route-parte') <> 1 then
    raise exception 'rota Parte foi alterada';
  end if;
  if (select updated_at from public.routes where id = 'route-old') is distinct from v_old
     or (select count(*) from public.route_stops where route_id = 'route-old') <> 1 then
    raise exception 'rota de outro ano foi alterada';
  end if;

  select public.montar_rota(jsonb_build_object(
    'request_id', 'falta-1',
    'data', '2026-12-16',
    'paradas', jsonb_build_array(jsonb_build_object('cliente', 'Sileo', 'tipo', 'entrega'))
  )) into v;
  if jsonb_typeof(v->'rota') is distinct from 'null' or jsonb_array_length(v->'adicionadas') <> 0 then
    raise exception 'não pode criar rota nem parada para cliente desconhecido, veio %', v;
  end if;
  if v->'faltando'->0->>'cliente' is distinct from 'Sileo'
     or v->'faltando'->0->'sugestoes'->0->>'nome' is distinct from 'Siloe'
     or v->'faltando'->0->'sugestoes'->0->>'cidade' is distinct from 'Blumenau'
     or v->'faltando'->0->'sugestoes'->0->>'id' is distinct from 'marm-siloe' then
    raise exception 'Sileo deveria sugerir Siloe, veio %', v->'faltando';
  end if;
  if exists (select 1 from public.routes where nome = 'Rota: 16/12' and created_at >= '2026-12-16 00:00:00-03') then
    raise exception 'faltando criou rota';
  end if;

  select public.montar_rota(jsonb_build_object(
    'request_id', 'ambiguo-1',
    'data', '2026-12-17',
    'paradas', jsonb_build_array(jsonb_build_object('cliente', 'Pedra Sul'))
  )) into v;
  if jsonb_array_length(v->'ambiguos'->0->'cadastros') <> 2 or jsonb_typeof(v->'rota') is distinct from 'null' then
    raise exception 'nome duplicado no cadastro deveria ser ambiguo sem gravar, veio %', v;
  end if;

  select public.montar_rota(jsonb_build_object(
    'request_id', 'id-ruim',
    'data', '2026-12-18',
    'paradas', jsonb_build_array(
      jsonb_build_object('marmoraria_id', 'marm-nao-existe'),
      jsonb_build_object('cliente', 'Alfa', 'horario', '11:00')
    )
  )) into v;
  if jsonb_array_length(v->'faltando') <> 1 or jsonb_array_length(v->'adicionadas') <> 1 then
    raise exception 'id desconhecido não deveria impedir o resto, veio %', v;
  end if;
  if jsonb_array_length(v->'faltando'->0->'sugestoes') <> 0 then
    raise exception 'id explícito não usa sugestão de nome, veio %', v->'faltando';
  end if;

  select public.montar_rota(jsonb_build_object(
    'request_id', 'id-e-nome',
    'data', '2026-12-19',
    'paradas', jsonb_build_array(
      jsonb_build_object('marmoraria_id', 'marm-alfa'),
      jsonb_build_object('cliente', 'Alfa')
    )
  )) into v;
  if v->>'http_status' is distinct from '400' then
    raise exception 'id e nome do mesmo cliente deveriam ser 400, veio %', v;
  end if;

  update public.routes
  set status = 'finalizada', current_destination_stop_id = 'stop-x'
  where nome = 'Rota: 18/12' and created_at >= '2026-12-18 00:00:00-03';
  select public.montar_rota(jsonb_build_object(
    'request_id', 'so-falta',
    'data', '2026-12-18',
    'paradas', jsonb_build_array(jsonb_build_object('cliente', 'Ninguem Conhece'))
  )) into v;
  if (
    select status || ':' || coalesce(current_destination_stop_id, '')
    from public.routes
    where nome = 'Rota: 18/12' and created_at >= '2026-12-18 00:00:00-03'
  ) is distinct from 'finalizada:stop-x' then
    raise exception 'lista só com faltando não pode reabrir a rota';
  end if;

  select public.montar_rota(jsonb_build_object(
    'request_id', 'hora-ruim',
    'paradas', jsonb_build_array(jsonb_build_object('cliente', 'Zeta', 'horario', '8:30'))
  )) into v;
  if v->>'http_status' is distinct from '400' then
    raise exception 'horário inválido deveria ser 400, veio %', v;
  end if;

  select public.montar_rota(jsonb_build_object(
    'request_id', 'hoje-1',
    'paradas', jsonb_build_array(jsonb_build_object('cliente', 'Zeta'))
  )) into v;
  if v->'rota'->>'nome' is distinct from
     'Rota: ' || to_char((clock_timestamp() at time zone 'America/Sao_Paulo')::date, 'DD/MM')
     or (v->'rota'->>'criada')::boolean is not true then
    raise exception 'data omitida não usou hoje em São Paulo, veio %', v->'rota';
  end if;
  select public.montar_rota(jsonb_build_object(
    'request_id', 'hoje-2',
    'paradas', jsonb_build_array(jsonb_build_object('cliente', 'Alfa'))
  )) into v;
  if (v->'rota'->>'criada')::boolean or jsonb_array_length(v->'adicionadas') <> 1 then
    raise exception 'o mesmo dia sem data deveria reusar a rota de hoje, veio %', v;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'route_stops' and column_name in ('horario', 'tipo')
  ) then
    raise exception 'não deveria criar coluna horario/tipo';
  end if;
  if exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('routes', 'route_stops')
      and not t.tgisinternal
  ) then
    raise exception 'routes/route_stops ganharam trigger';
  end if;
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'app_private')
      and p.proname = 'montar_rota'
      and position('http_post' in p.prosrc) > 0
  ) then
    raise exception 'montar_rota não pode chamar webhook';
  end if;
  if has_function_privilege('public', 'public.montar_rota(jsonb)', 'execute') then
    raise exception 'PUBLIC não pode executar montar_rota';
  end if;
end
$t$;

rollback;
