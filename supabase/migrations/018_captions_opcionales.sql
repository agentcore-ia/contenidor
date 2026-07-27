-- Postia publica en Instagram: los copys de X y LinkedIn dejaron de generarse
-- (commit 746adb8), pero las columnas seguian siendo NOT NULL y cada insert
-- fallaba con "null value in column caption_x violates not-null constraint".
-- Se vuelven opcionales en vez de borrarlas, para conservar lo ya generado.
alter table generated_posts alter column caption_x drop not null;
alter table generated_posts alter column caption_linkedin drop not null;
