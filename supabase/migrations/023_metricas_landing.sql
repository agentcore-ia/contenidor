-- Visitas de la landing y eventos del embudo publico.
--
-- Privacidad: NO se guarda la IP ni el user agent. `visitor_hash` es un
-- sha256 de (ip + user agent + una sal del servidor + la fecha), asi que sirve
-- para contar visitantes unicos de un dia y deja de servir al dia siguiente:
-- no se puede seguir a nadie entre dias ni volver atras hasta la IP.
create table if not exists landing_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'view' check (kind in ('view', 'demo', 'signup_click')),
  path text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  country text,
  visitor_hash text,
  created_at timestamptz not null default now()
);

create index if not exists landing_events_created_idx on landing_events (created_at desc);
create index if not exists landing_events_kind_idx on landing_events (kind, created_at desc);
create index if not exists landing_events_visitor_idx on landing_events (visitor_hash, created_at desc);
