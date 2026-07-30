-- El indice unico de preapproval_id era PARCIAL (where not null) y Postgres no
-- lo puede usar para ON CONFLICT (preapproval_id): el upsert de la suscripcion
-- fallaba con 42P10 y la fila nunca se guardaba. Un indice unico comun admite
-- multiples NULL, asi que el parcial no hacia falta.
drop index if exists subscriptions_preapproval_idx;
create unique index subscriptions_preapproval_idx
  on subscriptions (preapproval_id);
