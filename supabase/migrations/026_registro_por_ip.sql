-- Registro de altas por IP, para frenar la creacion masiva de cuentas.
--
-- El limite en memoria (3/hora) se reinicia con cada deploy y no ve mas alla
-- de una hora: alguien paciente podia crear cuentas gratis para siempre. Esta
-- tabla persiste. Privacidad: NO se guarda la IP, solo un sha256 con sal — la
-- misma politica que landing_events, pero sin la fecha en el hash porque aca
-- la gracia es poder mirar una ventana de 30 dias.
create table if not exists signup_events (
  id uuid primary key default gen_random_uuid(),
  ip_hash text not null,
  email text,
  created_at timestamptz not null default now()
);

create index if not exists signup_events_ip_idx on signup_events (ip_hash, created_at desc);
