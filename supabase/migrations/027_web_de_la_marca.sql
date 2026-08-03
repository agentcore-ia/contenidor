-- La web de la marca, para que el motor tenga contexto real del negocio.
--
-- Solo se guarda la URL. El analisis destilado (que vende, diferenciales,
-- datos utiles, temas sugeridos) va en brands.analysis->'website', junto al
-- analisis de Instagram que ya vivia ahi: es el mismo tipo de dato y asi los
-- prompts leen todo el contexto de un solo lugar.
alter table brands add column if not exists website_url text;
