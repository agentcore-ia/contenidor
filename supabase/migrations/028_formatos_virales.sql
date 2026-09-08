-- Formatos virales: la biblioteca de "asi se hace un post que funciona".
--
-- El catalogo en si vive en codigo (src/viralFormats.js) porque es contenido
-- editorial nuestro, igual que los prompts: se versiona con el deploy y no
-- necesita ABM. Lo unico que la base tiene que guardar es lo que el codigo no
-- puede tener adentro:
--
--   1. viral_format_samples: la imagen de muestra de cada formato. Se genera
--      UNA vez y la comparten todas las marcas (por eso no lleva brand_id):
--      es la vidriera del catalogo, no una pieza de nadie.
--   2. content_calendar.viral_format: de que formato salio cada idea, para que
--      la generacion aplique la receta y para poder medir despues que formatos
--      rinden mejor.
--
-- Cuando el catalogo necesite ABM, la tabla de formatos entra al lado de esta
-- y src/viralFormats.js pasa a leerla: las rutas y la UI no cambian.

create table if not exists viral_format_samples (
  format_id text primary key,
  image_url text not null,
  model text,
  prompt text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table content_calendar add column if not exists viral_format text;

-- Para el ranking "que formato rinde mejor" sobre las ideas ya usadas.
create index if not exists content_calendar_viral_format_idx
  on content_calendar (brand_id, viral_format)
  where viral_format is not null;
