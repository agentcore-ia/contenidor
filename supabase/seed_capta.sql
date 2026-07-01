insert into brands (slug, name, description, default_template_id, brand_manual)
values (
  'capta',
  'Capta',
  'Sistema para convertir conversaciones, pedidos y senales operativas en oportunidades comerciales para negocios gastronomicos.',
  'pain_point_01',
  '{
    "voice": "Directo, claro, premium y cercano. Espanol rioplatense neutro, sin exageraciones. Estrategico, practico, sin humo.",
    "audience": "Duenos y equipos de restaurantes, cafeterias, heladerias y marcas gastronomicas que gestionan pedidos, menus y clientes.",
    "visual_style": "Tecnologia premium aplicada a problemas cotidianos del negocio. Oscuro, sobrio, alto contraste. Una idea por slide, sin saturar.",
    "colors": {
      "background": "#080808",
      "surface": "#131313",
      "accent": "#ff6a1a",
      "text": "#fff8ef",
      "muted": "#8b8378"
    },
    "typography": {
      "primary": "Inter",
      "weights": [800, 850, 900]
    },
    "avoid_phrases": [
      "emojis",
      "promesas milagrosas",
      "exageraciones",
      "tecnico-jerga innecesaria",
      "vos podes lograrlo"
    ],
    "content_rules": [
      "hablarle al dueno del negocio",
      "evitar promesas milagrosas",
      "mostrar dolor operativo real",
      "cerrar con una accion clara",
      "mantener frases cortas y escaneables",
      "no inventar features tecnicas especificas fuera del contexto"
    ],
    "design_rules": [
      "fondo oscuro con acento naranja",
      "1 elemento visual dominante por slide",
      "jerarquia: hook grande + body + CTA pill",
      "sin emojis, sin iconografia gratuita",
      "siempre incluir marca 'capta' arriba"
    ]
  }'::jsonb
)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  default_template_id = excluded.default_template_id,
  brand_manual = excluded.brand_manual;

with capta as (
  select id from brands where slug = 'capta'
)
insert into content_categories (
  brand_id,
  slug,
  name,
  description,
  default_template_id,
  prompt_guidance,
  objective,
  hook_examples,
  avoid_rules,
  sort_order
)
select
  capta.id,
  category.slug,
  category.name,
  category.description,
  category.default_template_id,
  category.prompt_guidance,
  category.objective,
  category.hook_examples::jsonb,
  category.avoid_rules::jsonb,
  category.sort_order
from capta
cross join (
  values
    (
      'dolor-dueno',
      'Dolor del dueno',
      'Problemas concretos que vive quien maneja un negocio gastronomico.',
      'pain_point_01',
      'Abrir con una tension diaria del dueno y mostrar que Capta ordena esa situacion.',
      'Que el dueno sienta que alguien entiende su operacion y su chaos cotidiano.',
      '["El pedido llega y nadie sabe si ya te lo pidieron antes","Tenes muchas herramientas pero no una operacion","El cliente pregunto, se fue, y nadie lo volvio a contactar"]'::text,
      '["promesas de solucion magica","hablar de tecnologia primero","ejemplos de empresas gigantes"]'::text,
      1
    ),
    (
      'antes-despues',
      'Antes vs Despues',
      'Comparaciones simples entre operar sin sistema y operar con Capta.',
      'before_after_01',
      'Contrastar caos manual contra claridad operativa sin sonar grandilocuente.',
      'Mostrar el salto entre el caos operativo y una gestion con contexto, sin prometer magia.',
      '["Antes: chats sueltos. Despues: pedidos, clientes y datos conectados","Antes: promociones a ciegas. Despues: acciones segun comportamiento","Antes: revisar todo a mano. Despues: ver lo importante primero"]'::text,
      '["sonar como caso de exito ajeno","usar cifras absolutas no relativizadas","prometer resultados especificos"]'::text,
      2
    ),
    (
      'caso-cotidiano',
      'Caso cotidiano',
      'Escenas reales de mostrador, WhatsApp, mesas, delivery o clientes.',
      'daily_situation_01',
      'Narrar una situacion reconocible y aterrizar el beneficio en una accion concreta.',
      'Que el dueno se vea reflejado en una escena real y entienda como Capta la simplifica.',
      '["Viernes a la noche: el local explota y WhatsApp no perdona","Un cliente pide lo mismo cada semana y tu sistema no lo recuerda","El delivery se demora y el cliente escribe por tercera vez"]'::text,
      '["escenas caricaturizadas","jerga tecnica","clientes que suenen a casos de estudio"]'::text,
      3
    ),
    (
      'producto',
      'Producto',
      'Features y capacidades de Capta traducidas a valor.',
      'product_feature_01',
      'Explicar una funcion desde el problema que resuelve, no desde la tecnologia.',
      'Mostrar una capacidad concreta de Capta aterrizada al beneficio operativo que trae.',
      '["Menus digitales que tambien entienden pedidos, mesas y clientes","Capta convierte pedidos en historial util para vender mejor","Un menu que no solo muestra productos: ayuda a decidir y pedir"]'::text,
      '["lista de features sin contexto","jerga de producto","screenshots de UI complejos"]'::text,
      4
    ),
    (
      'insight',
      'Insight',
      'Ideas estrategicas breves sobre venta, datos, clientes y operacion.',
      'insight_01',
      'Plantear una idea memorable que cambie como el dueno mira su negocio.',
      'Dejar una idea corta y potente que quede dando vueltas en la cabeza del dueno.',
      '["El problema no es vender poco: es no saber donde se pierde la venta","Cada pedido trae informacion. La mayoria de los locales la deja ir","Lo que no se mide no se mejora, pero tampoco se vende"]'::text,
      '["frases motivacionales vacias","cifras sin contexto","refranero generico"]'::text,
      5
    )
) as category(slug, name, description, default_template_id, prompt_guidance, objective, hook_examples, avoid_rules, sort_order)
on conflict (brand_id, slug) do update set
  name = excluded.name,
  description = excluded.description,
  default_template_id = excluded.default_template_id,
  prompt_guidance = excluded.prompt_guidance,
  objective = excluded.objective,
  hook_examples = excluded.hook_examples,
  avoid_rules = excluded.avoid_rules,
  sort_order = excluded.sort_order;

with capta as (
  select id from brands where slug = 'capta'
)
delete from content_calendar
where brand_id = (select id from capta)
  and generated_post_id is null;

with capta as (
  select id from brands where slug = 'capta'
),
categories as (
  select slug, id from content_categories where brand_id = (select id from capta)
),
items as (
  select *
  from (
    values
      (0, 'dolor-dueno', 'Cuando el pedido llega, pero nadie sabe si ese cliente ya compro antes', 'Dolor por operar sin memoria comercial.'),
      (1, 'antes-despues', 'Antes: chats sueltos. Despues: pedidos, clientes y datos conectados', 'Mostrar el salto de improvisar a operar con contexto.'),
      (2, 'caso-cotidiano', 'Viernes a la noche: el local explota y WhatsApp no perdona', 'Escena de alta demanda donde ordenar conversaciones importa.'),
      (3, 'producto', 'Menus digitales que tambien entienden pedidos, mesas y clientes', 'Presentar Capta como sistema operativo liviano para gastronomia.'),
      (4, 'insight', 'El problema no es vender poco: es no saber donde se pierde la venta', 'Insight sobre trazabilidad del embudo gastronomico.'),
      (5, 'dolor-dueno', 'El cliente pregunto, se fue y nadie lo volvio a contactar', 'Dolor por oportunidades que se evaporan en conversaciones.'),
      (6, 'antes-despues', 'Antes: promociones a ciegas. Despues: acciones segun comportamiento', 'Contraste entre intuicion y datos accionables.'),
      (7, 'caso-cotidiano', 'Un cliente pide lo mismo cada semana y tu sistema no lo recuerda', 'Escena cotidiana para hablar de recurrencia y personalizacion.'),
      (8, 'producto', 'Capta convierte pedidos en historial util para vender mejor', 'Feature de datos de cliente explicado como ventaja comercial.'),
      (9, 'insight', 'Cada pedido trae informacion. La mayoria de los locales la deja ir', 'Idea sobre capturar informacion operativa.'),
      (10, 'dolor-dueno', 'Tener muchas herramientas no significa tener una operacion ordenada', 'Dolor por fragmentacion de herramientas.'),
      (11, 'antes-despues', 'Antes: revisar todo a mano. Despues: ver lo importante primero', 'Contraste de tiempo operativo y foco.'),
      (12, 'caso-cotidiano', 'El delivery se demora y el cliente escribe por tercera vez', 'Escena para hablar de visibilidad y respuestas claras.'),
      (13, 'producto', 'Un menu que no solo muestra productos: ayuda a decidir y pedir', 'Feature de experiencia de menu orientada a conversion.')
  ) as item(day_offset, category_slug, topic, angle)
)
insert into content_calendar (brand_id, category_id, publish_date, topic, angle, status)
select
  capta.id,
  categories.id,
  ((now() at time zone 'America/Argentina/Buenos_Aires')::date + items.day_offset),
  items.topic,
  items.angle,
  'pending'
from items
cross join capta
join categories on categories.slug = items.category_slug
on conflict (brand_id, publish_date) do update set
  category_id = excluded.category_id,
  topic = excluded.topic,
  angle = excluded.angle,
  status = 'pending',
  generated_post_id = null;
