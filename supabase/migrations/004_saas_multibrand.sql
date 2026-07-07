-- SaaS multi-tenant: brand ownership, per-brand automation and IG onboarding.
alter table brands add column if not exists owner_id uuid;
alter table brands add column if not exists owner_email text;
alter table brands add column if not exists automation_enabled boolean not null default true;
alter table brands add column if not exists instagram_handle text;
alter table brands add column if not exists onboarding_status text not null default 'ready';
alter table brands add column if not exists onboarding_error text;
alter table brands add column if not exists analysis jsonb not null default '{}'::jsonb;

create index if not exists brands_owner_id_idx on brands (owner_id);
create index if not exists brands_owner_email_idx on brands (owner_email);

-- Existing Capta brand stays owned by the original operator: it gets claimed
-- automatically the first time this email registers/logs in.
update brands set owner_email = 'matiirodriguez2346@gmail.com' where slug = 'capta' and owner_email is null;
