-- Suscripciones de Mercado Pago.
--
-- El plan de una marca (brands.plan) sigue siendo la fuente de verdad para los
-- topes; esta tabla guarda POR QUE una marca esta en ese plan y permite
-- reconciliar contra Mercado Pago sin adivinar.
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  owner_id uuid,
  plan text not null,
  status text not null default 'pending'
    check (status in ('pending', 'authorized', 'paused', 'cancelled', 'rejected')),
  provider text not null default 'mercadopago',
  preapproval_id text,
  payer_email text,
  amount_ars numeric,
  currency text not null default 'ARS',
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Una marca tiene una sola suscripcion viva. El indice parcial deja convivir
-- historicos cancelados con la activa.
create unique index if not exists subscriptions_brand_activa_idx
  on subscriptions (brand_id)
  where status in ('pending', 'authorized');

create unique index if not exists subscriptions_preapproval_idx
  on subscriptions (preapproval_id)
  where preapproval_id is not null;

create index if not exists subscriptions_status_idx on subscriptions (status, updated_at desc);

drop trigger if exists subscriptions_set_updated_at on subscriptions;
create trigger subscriptions_set_updated_at
before update on subscriptions
for each row execute function set_updated_at();
