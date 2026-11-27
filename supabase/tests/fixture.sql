-- Banco local descartável. Não rode no projeto zpvdavopwjlenlvdxumh.
do $guard$
begin
  if current_database() is distinct from 'montar_rota_test' then
    raise exception 'fixture só roda no banco montar_rota_test';
  end if;
end
$guard$;

create schema if not exists auth;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  );
$$;

create table public.profiles (
  id uuid primary key,
  display_name text not null,
  role text not null,
  active boolean not null default true
);

create table public.marmorarias (
  id text primary key,
  nome text not null,
  cidade text not null,
  telefone text not null default '',
  lat double precision not null,
  lng double precision not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marmorarias_lat_check check (lat between -90 and 90),
  constraint marmorarias_lng_check check (lng between -180 and 180)
);

create table public.routes (
  id text primary key,
  nome text not null,
  status text not null default 'planejada',
  current_destination_stop_id text,
  active_driver_name text,
  created_by_user_id text,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint routes_status_check check (status in ('planejada', 'em_andamento', 'finalizada'))
);

create table public.route_stops (
  stop_id text primary key,
  route_id text not null references public.routes (id) on delete cascade,
  marmoraria_id text references public.marmorarias (id) on delete set null,
  sort_order integer not null,
  nome text not null,
  cidade text not null,
  telefone text not null default '',
  lat double precision not null,
  lng double precision not null,
  status text not null default 'pendente',
  updated_at timestamptz,
  constraint route_stops_status_check check (status in ('pendente', 'concluida', 'nao_entregue')),
  constraint route_stops_sort_order_check check (sort_order >= 0),
  constraint route_stops_lat_check check (lat between -90 and 90),
  constraint route_stops_lng_check check (lng between -180 and 180)
);

insert into public.profiles (id, display_name, role, active)
values ('1e5dc7d4-d1a1-47c4-b06b-21b2021b77ec', 'Thiago', 'admin', true);

insert into public.marmorarias (id, nome, cidade, telefone, lat, lng) values
  ('marm-siloe', 'Siloe', 'Blumenau', '47999990000', -26.9, -49.0),
  ('marm-zeta', 'Zeta', 'Gaspar', '47911110000', -26.93, -48.95),
  ('marm-alfa', 'Alfa', 'Brusque', '47922220000', -27.1, -48.92),
  ('marm-beta', 'Beta', 'Itajaí', '47933330000', -26.91, -48.66),
  ('marm-sem', 'Sem Hora', 'Timbó', '47944440000', -26.82, -49.27),
  ('marm-gama', 'Gama', 'Indaial', '47955550000', -26.9, -49.23),
  ('marm-dup-1', 'Pedra Sul', 'Brusque', '', -27.1, -48.91),
  ('marm-dup-2', 'Pedra Sul', 'Gaspar', '', -26.93, -48.96);

insert into public.routes (
  id, nome, status, created_by_user_id, created_by_name, active_driver_name, created_at, updated_at
) values
  ('route-parte', 'Rota 15/12 - Parte 2', 'em_andamento',
   '1e5dc7d4-d1a1-47c4-b06b-21b2021b77ec', 'Thiago', 'Thiago',
   '2026-12-15 15:00:00-03', '2026-12-15 15:00:00-03'),
  ('route-old', 'Rota: 15/12', 'finalizada',
   '1e5dc7d4-d1a1-47c4-b06b-21b2021b77ec', 'Thiago', null,
   '2025-12-15 12:00:00-03', '2025-12-15 12:00:00-03');

insert into public.route_stops (
  stop_id, route_id, marmoraria_id, sort_order, nome, cidade, telefone, lat, lng, status, updated_at
) values
  ('stop-parte-0', 'route-parte', 'marm-alfa', 0, 'Alfa', 'Brusque', '47922220000', -27.1, -48.92, 'pendente', null),
  ('stop-old-0', 'route-old', 'marm-zeta', 0, 'Zeta', 'Gaspar', '47911110000', -26.93, -48.95, 'concluida', '2025-12-15 18:00:00-03');
