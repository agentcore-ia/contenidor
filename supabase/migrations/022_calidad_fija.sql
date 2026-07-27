-- La calidad de imagen deja de ser una perilla por marca: todas las piezas se
-- generan en media (ver IMAGE_QUALITY en src/openai.js). Alta cuesta casi el
-- triple sin diferencia visible en un feed, y baja se ve barata.
--
-- La columna NO se borra: queda como registro de con que se genero lo viejo.
-- El codigo ya no la lee.
alter table brands alter column image_quality set default 'medium';
update brands set image_quality = 'medium' where image_quality <> 'medium';

comment on column brands.image_quality is
  'Legacy: ya no se lee. La calidad es fija (media) en src/openai.js.';
