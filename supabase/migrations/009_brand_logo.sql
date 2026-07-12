-- Logo oficial de la marca: se pasa como referencia al modelo de imagen para
-- integrarlo fisicamente en la escena (packaging, vasos, vestimenta, carteles).
alter table brands add column if not exists logo_url text;
