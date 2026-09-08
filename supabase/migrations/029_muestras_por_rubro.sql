-- La muestra de un formato depende del RUBRO, no solo del formato.
--
-- La primera version guardaba una sola muestra por formato, compartida por
-- todas las marcas. En la practica eso le mostraba un primer plano de chocolate
-- a una peluqueria: el formato es agnostico de rubro, pero la FOTO nunca puede
-- serlo — siempre muestra algo.
--
-- Ahora la clave es (format_id, rubro), donde rubro es una familia de
-- src/viralFormats.js (gastronomia, belleza, fitness, salud, retail, servicios,
-- inmobiliaria) mas 'generico', que es el fallback que se sirve mientras una
-- familia todavia no tiene sus muestras generadas.
--
-- Las 19 filas que ya existian quedan como 'generico' via el default, que es
-- exactamente lo que son: muestras sin rubro definido.

alter table viral_format_samples add column if not exists rubro text not null default 'generico';

alter table viral_format_samples drop constraint if exists viral_format_samples_pkey;
alter table viral_format_samples add primary key (format_id, rubro);

-- Para "traeme todas las muestras de este rubro", que es la consulta que hace
-- el panel cada vez que un cliente abre la galeria.
create index if not exists viral_format_samples_rubro_idx on viral_format_samples (rubro);
