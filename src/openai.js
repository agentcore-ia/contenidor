import OpenAI, { toFile } from 'openai';
import { AppError, assertRequiredEnv } from './errors.js';

const DEFAULT_MODEL = 'gpt-5.4-mini';
const DEFAULT_IMAGE_MODEL = 'gpt-image-2';
// 1024x1280 = exact 4:5 ratio (matches the 1080x1350 canvas used by the HTML
// templates), and both dimensions are multiples of 16 as gpt-image-2 requires.
const DEFAULT_IMAGE_SIZE = '1024x1280';

const postGenerationSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'hook',
    'body',
    'cta',
    'image_headline',
    'image_subline',
    'caption_instagram',
    'caption_x',
    'caption_linkedin',
    'visual_direction',
    'background_idea'
  ],
  properties: {
    hook: { type: 'string' },
    body: { type: 'string' },
    cta: { type: 'string' },
    image_headline: { type: 'string' },
    image_subline: { type: 'string' },
    caption_instagram: { type: 'string' },
    caption_x: { type: 'string' },
    caption_linkedin: { type: 'string' },
    visual_direction: { type: 'string' },
    background_idea: { type: 'string' }
  }
};

// Fields that may legitimately come back empty from the model.
const OPTIONAL_EMPTY_FIELDS = new Set(['image_subline']);

function createOpenAIClient() {
  assertRequiredEnv('OPENAI_API_KEY');
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function compactJson(value) {
  return JSON.stringify(value ?? {}, null, 2);
}

function parseGenerationOutput(response) {
  const text = response.output_text;

  if (!text) {
    throw new AppError('OpenAI returned an empty response', 502, 'OPENAI_EMPTY_RESPONSE');
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new AppError(`OpenAI returned invalid JSON: ${error.message}`, 502, 'OPENAI_INVALID_JSON');
  }
}

function validateGeneratedPostContent(content) {
  const requiredFields = Object.keys(postGenerationSchema.properties);
  const missing = requiredFields.filter(
    (field) => !OPTIONAL_EMPTY_FIELDS.has(field) && !String(content?.[field] ?? '').trim()
  );

  if (missing.length) {
    throw new AppError(`OpenAI response is missing: ${missing.join(', ')}`, 502, 'OPENAI_INVALID_CONTENT');
  }

  return Object.fromEntries(
    requiredFields.map((field) => [field, String(content[field] ?? '').trim()])
  );
}

// Renders the brand's product/service catalog as a prompt block. Returns ''
// when the brand has no catalog so prompts stay clean.
function catalogBlock(products) {
  if (!products?.length) return '';
  const rows = products.map((p) => ({
    name: p.name,
    description: p.description || undefined,
    price: p.price || undefined
  }));
  return `
Catalogo de productos/servicios REALES de la marca (nombres y precios exactos):
${compactJson(rows)}
`;
}

export async function generatePostContent({ brand, category, calendar, products = [] }) {
  const client = createOpenAIClient();
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;

  const prompt = `Genera una pieza diaria para Instagram de ${brand.name}.

Contexto de marca:
${compactJson({
  name: brand.name,
  description: brand.description,
  brand_manual: brand.brand_manual
})}

Categoria:
${compactJson({
  name: category.name,
  description: category.description,
  prompt_guidance: category.prompt_guidance
})}

Tema de calendario:
${compactJson({
  topic: calendar.topic,
  angle: calendar.angle,
  publish_date: calendar.publish_date
})}
${catalogBlock(products)}
Reglas:${products.length ? `
- Si el tema promociona un producto/servicio del catalogo, usa su nombre EXACTO y su precio EXACTO tal como figura. Jamas inventes ni redondees precios, y no menciones precios de items que no esten en el catalogo.` : ''}
- Hook maximo 14 palabras.
- Body maximo 34 palabras.
- CTA maximo 10 palabras.
- "image_headline": el texto que va DENTRO de la imagen. Version corta y potente del mensaje, maximo 9 palabras. No es un resumen tibio: es un titular publicitario con garra.
- "image_subline": bajada opcional para la imagen, maximo 16 palabras (1-2 lineas). Solo si suma de verdad; si el titular se sostiene solo, devolvela vacia. El desarrollo largo va al caption, nunca a la imagen.
- Caption Instagram: 1 parrafo breve + 3 a 6 hashtags.
- Caption X: maximo 240 caracteres.
- Caption LinkedIn: tono mas profesional, maximo 700 caracteres.
- No inventes features tecnicas especificas que no esten en el contexto.
- No uses emojis.
- Responde solo con el JSON solicitado.`;

  let response;

  try {
    response = await client.responses.create({
      model,
      input: [
        {
          role: 'system',
          content: 'Sos el content engine de la marca. Escribis copy claro, premium y accionable.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'capta_post_generation',
          strict: true,
          schema: postGenerationSchema
        }
      }
    });
  } catch (error) {
    throw new AppError(`OpenAI generation failed: ${error.message}`, 502, 'OPENAI_FAILED');
  }

  return {
    model,
    content: validateGeneratedPostContent(parseGenerationOutput(response)),
    raw: response
  };
}

function ideasSchema(categorySlugs) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['ideas'],
    properties: {
      ideas: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['topic', 'angle', 'category_slug', 'content_type'],
          properties: {
            topic: { type: 'string' },
            angle: { type: 'string' },
            category_slug: {
              type: 'string',
              enum: categorySlugs
            },
            content_type: {
              type: 'string',
              enum: ['image', 'product_video', 'ugc_video']
            }
          }
        }
      }
    }
  };
}

export async function generateContentIdeas({ brand, categories, existingTopics = [], count = 7, products = [] }) {
  const client = createOpenAIClient();
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const categorySlugs = categories.map((category) => category.slug);

  if (!categorySlugs.length) {
    throw new AppError('No categories available to generate ideas', 400, 'NO_CATEGORIES');
  }

  const prompt = `Proponé ${count} ideas nuevas de contenido diario para Instagram de ${brand.name}.

Contexto de marca:
${compactJson({
  name: brand.name,
  description: brand.description,
  brand_manual: brand.brand_manual
})}

Categorias disponibles (usá el slug exacto en category_slug):
${compactJson(categories.map((category) => ({
  slug: category.slug,
  name: category.name,
  objective: category.objective,
  prompt_guidance: category.prompt_guidance
})))}

Temas ya usados o programados (NO los repitas ni generes variantes casi iguales):
${compactJson(existingTopics)}
${catalogBlock(products)}
Reglas:
- Le hablamos a la audiencia de esta marca, en su rubro. Ideas concretas para su negocio.${products.length ? `
- La marca tiene catalogo: al menos la mitad de las ideas deben promocionar productos/servicios concretos del catalogo, nombrandolos igual que en la lista (podes mencionar el precio real en el angle). Jamas inventes productos ni precios.` : ''}
- Cada idea es un tema concreto y accionable, no un titulo generico.
- "content_type": el formato de cada idea. La MAYORIA deben ser "image" (post normal). Marca 1 o 2 de cada 7 como video: "product_video" para mostrar el producto en movimiento (ideal cuando el foco es el producto en si), o "ugc_video" para un testimonial estilo persona hablando (ideal para recomendaciones, resenas, generar confianza). No pongas mas de 2-3 videos en total.
- "topic": el tema puntual del post, maximo 16 palabras.
- "angle": el enfoque o insight con el que se aborda, maximo 20 palabras.
- "category_slug": elegí la categoria que mejor calce, de la lista provista.
- Distribuí las ideas entre varias categorias, no uses siempre la misma.
- No inventes features tecnicas que no existan en el contexto de marca.
- No repitas ninguno de los temas ya usados.
- Responde solo con el JSON solicitado.`;

  let response;

  try {
    response = await client.responses.create({
      model,
      input: [
        {
          role: 'system',
          content: 'Sos el estratega de contenido de la marca. Proponés ideas frescas, especificas y no repetitivas.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'capta_content_ideas',
          strict: true,
          schema: ideasSchema(categorySlugs)
        }
      }
    });
  } catch (error) {
    throw new AppError(`OpenAI idea generation failed: ${error.message}`, 502, 'OPENAI_IDEAS_FAILED');
  }

  const parsed = parseGenerationOutput(response);
  const ideas = Array.isArray(parsed?.ideas) ? parsed.ideas : [];

  const VALID_TYPES = new Set(['image', 'product_video', 'ugc_video']);
  const cleaned = ideas
    .map((idea) => ({
      topic: String(idea?.topic ?? '').trim(),
      angle: String(idea?.angle ?? '').trim(),
      category_slug: String(idea?.category_slug ?? '').trim(),
      content_type: VALID_TYPES.has(idea?.content_type) ? idea.content_type : 'image'
    }))
    .filter((idea) => idea.topic && categorySlugs.includes(idea.category_slug));

  if (!cleaned.length) {
    throw new AppError('OpenAI returned no usable ideas', 502, 'OPENAI_IDEAS_EMPTY');
  }

  return { model, ideas: cleaned, raw: response };
}

const brandAnalysisSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['brand_name', 'rubro', 'description', 'audience', 'voice', 'visual_style', 'render_style', 'colors', 'design_rules', 'content_rules', 'avoid_phrases', 'categories'],
  properties: {
    brand_name: { type: 'string' },
    rubro: { type: 'string' },
    description: { type: 'string' },
    audience: { type: 'string' },
    voice: { type: 'string' },
    visual_style: { type: 'string' },
    render_style: {
      type: 'object',
      additionalProperties: false,
      required: ['photography', 'framing', 'lighting', 'color_mood', 'composition', 'visual_density', 'typography_feel', 'overlay_treatment', 'headline_position', 'text_in_image'],
      properties: {
        photography: { type: 'string' },
        framing: { type: 'string' },
        lighting: { type: 'string' },
        color_mood: { type: 'string' },
        composition: { type: 'string' },
        visual_density: { type: 'string', enum: ['minimal', 'moderada', 'alta'] },
        typography_feel: { type: 'string' },
        overlay_treatment: { type: 'string' },
        headline_position: { type: 'string' },
        text_in_image: { type: 'string', enum: ['casi_nunca', 'a_veces', 'frecuente'] }
      }
    },
    colors: {
      type: 'object',
      additionalProperties: false,
      required: ['background', 'accent', 'text'],
      properties: {
        background: { type: 'string' },
        accent: { type: 'string' },
        text: { type: 'string' }
      }
    },
    design_rules: { type: 'array', items: { type: 'string' } },
    content_rules: { type: 'array', items: { type: 'string' } },
    avoid_phrases: { type: 'array', items: { type: 'string' } },
    categories: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'slug', 'description', 'objective', 'prompt_guidance'],
        properties: {
          name: { type: 'string' },
          slug: { type: 'string' },
          description: { type: 'string' },
          objective: { type: 'string' },
          prompt_guidance: { type: 'string' }
        }
      }
    }
  }
};

const ugcScriptSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['script', 'product_visual'],
  properties: {
    script: { type: 'string' },
    product_visual: { type: 'string' }
  }
};

// Escribe un guion UGC corto + una descripcion visual PRECISA del producto que
// la persona muestra a camara, para que el modelo de video no invente el
// producto equivocado (ej. una barra de chocolate en vez de un helado).
export async function generateUgcScript({ post, brand, products = [] }) {
  const client = createOpenAIClient();
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const manual = brand?.brand_manual || {};
  const rubro = brand?.analysis?.rubro || '';

  const prompt = `Sos guionista de UGC. Para un video corto (5-12s, testimonial casero) de ${brand?.name || 'la marca'}, devolve DOS cosas: el guion hablado y una descripcion visual exacta del producto que la persona sostiene y muestra a camara.

Marca: ${brand?.name || ''}
Rubro / que vende: ${rubro || brand?.description || 'no especificado'}
Voz/tono: ${manual.voice || 'cercano, natural, real'}
Tema del post: ${post?.hook || post?.image_headline || ''}
Mensaje: ${post?.caption_instagram || post?.body || ''}
${products.length ? `Catalogo (nombres/precios exactos):\n${compactJson(products.map((p) => ({ name: p.name, description: p.description || undefined, price: p.price || undefined })))}` : ''}

"script" (lo que la persona DICE a camara):
- Hablado y natural. Nada de acotaciones, "[escena]", emojis ni hashtags.
- Maximo 2-3 frases, decible en 5-12s. Un gancho fuerte al inicio.
- Coherente con la voz de la marca. No inventes precios ni promos fuera del catalogo.

"product_visual" (EN INGLES, para el modelo de video — es lo MAS importante):
- Describi con precision el producto REAL que la persona sostiene, coherente con el RUBRO de la marca. Ej: una heladeria vende HELADO, no barras de chocolate; si el sabor es "chocolate oreo", el producto es "a cup/cone of chocolate-Oreo ice cream with crushed Oreo cookie pieces on top", NO a chocolate bar.
- Se concreto: formato (cono, vasito, pote), color, toppings, textura. Que se entienda que es exactamente ese producto de ese rubro.
- Si hay un item del catalogo que calza, describilo a partir de su nombre/descripcion.

Devolve solo el JSON pedido.`;

  const response = await client.responses.create({
    model,
    input: [
      { role: 'system', content: 'Sos guionista y director visual de UGC. Escribis parlamentos naturales y descripciones de producto precisas y fieles al rubro.' },
      { role: 'user', content: prompt }
    ],
    text: { format: { type: 'json_schema', name: 'ugc_script', strict: true, schema: ugcScriptSchema } }
  });

  const parsed = parseGenerationOutput(response);
  return {
    model,
    script: String(parsed?.script || '').trim(),
    productVisual: String(parsed?.product_visual || '').trim()
  };
}

const menuExtractionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['products'],
  properties: {
    products: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'description', 'price'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          price: { type: 'string' }
        }
      }
    }
  }
};

// Reads a photo of a menu / price list / service catalog and extracts the
// items with their exact prices, ready to insert as brand products.
export async function extractMenuProducts({ imageDataUrls = [] }) {
  if (!imageDataUrls.length) {
    throw new AppError('No hay imagen de la carta para analizar', 400, 'NO_MENU_IMAGE');
  }
  const client = createOpenAIClient();
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;

  const textPrompt = `Esta imagen es la carta / lista de precios / catalogo de un negocio.
Extrae TODOS los productos o servicios que se lean con claridad.

Instrucciones:
- "name": nombre del producto/servicio tal como figura (limpio, sin numeracion).
- "description": ingredientes o detalle si figura; si no, cadena vacia.
- "price": el precio EXACTO tal como esta escrito (con moneda/simbolo si figura, ej. "$12.500"). Si un item no tiene precio legible, cadena vacia. JAMAS inventes ni completes precios.
- Ignora titulos de secciones, promociones vencidas y texto decorativo.
- Si la imagen no es una carta/lista de precios, devolve el array vacio.
- Responde solo con el JSON solicitado.`;

  const userContent = [{ type: 'input_text', text: textPrompt }];
  for (const dataUrl of imageDataUrls.slice(0, 4)) {
    userContent.push({ type: 'input_image', image_url: dataUrl });
  }

  let response;
  try {
    response = await client.responses.create({
      model,
      input: [
        { role: 'system', content: 'Extraes datos estructurados de cartas y listas de precios con precision literal. Nunca inventas datos.' },
        { role: 'user', content: userContent }
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'menu_extraction',
          strict: true,
          schema: menuExtractionSchema
        }
      }
    });
  } catch (error) {
    throw new AppError(`OpenAI menu extraction failed: ${error.message}`, 502, 'OPENAI_MENU_FAILED');
  }

  const parsed = parseGenerationOutput(response);
  const JUNK_NAME = /illegible|ilegible|unknown|desconocido|n\/a|sin nombre|no legible/i;
  const products = (Array.isArray(parsed?.products) ? parsed.products : [])
    .map((p) => ({
      name: String(p?.name ?? '').trim(),
      description: String(p?.description ?? '').trim(),
      price: String(p?.price ?? '').trim()
    }))
    .filter((p) => p.name && p.name.length >= 3 && !JUNK_NAME.test(p.name));

  return { model, products };
}

// Analyzes a brand from its Instagram profile (bio + captions + post images)
// and the onboarding answers — or, without Instagram, from the user's own
// description — producing a full brand manual + categories.
export async function analyzeInstagramBrand({ handle, brandName, profile, answers = {}, imageDataUrls = [] }) {
  const client = createOpenAIClient();
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;

  const textPrompt = `Analiza esta marca para configurar su motor de contenido de Instagram.

${handle ? `Cuenta: @${handle}` : `Marca: ${brandName || 'sin nombre'} (todavia no tiene Instagram o prefirio no conectarlo)`}
${profile ? `Datos del perfil:
${compactJson({
  nombre: profile.full_name,
  bio: profile.biography,
  seguidores: profile.followers,
  captions_recientes: (profile.posts || []).slice(0, 8).map((post) => post.caption).filter(Boolean)
})}` : 'No hay datos de Instagram disponibles: basate en la descripcion y las respuestas del usuario. Tomalas como fuente de verdad y desarrollalas con criterio profesional para su rubro.'}

Respuestas del usuario en el onboarding:
${compactJson(answers)}

${imageDataUrls.length ? `Te adjunto ${imageDataUrls.length} imagenes de sus posts recientes: analiza su estilo visual real (paleta, tipografia, composicion, recursos graficos) y describilo con precision para poder replicarlo.` : ''}

Instrucciones:
- "brand_name": nombre limpio de la marca (no el handle).
- "rubro": rubro/industria en pocas palabras.
- "description": que hace la marca y que vende (3-4 frases, concreto).
- "audience": a quien le habla.
- "voice": tono de voz para los copies (idioma incluido, ej. espanol rioplatense con voseo si aplica).
- "visual_style": descripcion detallada del estilo visual para generar imagenes consistentes (fondo, paleta, tipografia, recursos, mood).
- "render_style": el ADN visual de la cuenta, deducido de las imagenes reales (o propuesto con criterio si no hay). Se precisa para replicar su estetica:
  - "photography": tipo de fotografia (ej. close-ups de producto, lifestyle, flat lay, retratos, render 3D).
  - "framing": encuadres tipicos (ej. primer plano cenital, 3/4, macro con fondo desenfocado).
  - "lighting": iluminacion (ej. calida de horno, natural lateral, neon nocturno, estudio suave).
  - "color_mood": clima cromatico (ej. calido tostado con rojos profundos; pastel aireado).
  - "composition": composicion habitual (ej. producto centrado con aire arriba, regla de tercios, simetria).
  - "visual_density": cuanta carga visual usa la cuenta (minimal / moderada / alta).
  - "typography_feel": estilo tipografico si usan texto (ej. sans condensada bold en mayusculas; serif elegante) o el que mejor calce.
  - "overlay_treatment": como resolver la legibilidad del texto segun su estetica (ej. degradado oscuro inferior, panel translucido crema, bloque de color pleno).
  - "headline_position": donde anclar el titular de forma consistente (ej. tercio inferior alineado a la izquierda).
  - "text_in_image": con que frecuencia esta cuenta pone texto sobre la imagen (casi_nunca / a_veces / frecuente).
- "colors": colores hex principales (background, accent, text) deducidos de las imagenes o propuestos si no hay.
- "design_rules": 6-10 reglas de diseno accionables.
- "content_rules": 5-8 reglas de contenido (estructura, temas, formato).
- "avoid_phrases": 4-8 frases/cliches a evitar.
- "categories": 4-5 categorias de contenido para su calendario (slug en kebab-case, con description, objective y prompt_guidance especificos del rubro).
- Responde solo con el JSON solicitado.`;

  const userContent = [{ type: 'input_text', text: textPrompt }];
  for (const dataUrl of imageDataUrls.slice(0, 4)) {
    userContent.push({ type: 'input_image', image_url: dataUrl });
  }

  let response;
  try {
    response = await client.responses.create({
      model,
      input: [
        { role: 'system', content: 'Sos un estratega de marca y contenido. Analizas cuentas de Instagram y produces manuales de marca precisos y accionables.' },
        { role: 'user', content: userContent }
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'brand_analysis',
          strict: true,
          schema: brandAnalysisSchema
        }
      }
    });
  } catch (error) {
    throw new AppError(`OpenAI brand analysis failed: ${error.message}`, 502, 'OPENAI_ANALYSIS_FAILED');
  }

  return { model, analysis: parseGenerationOutput(response) };
}

function clampWords(text, maxWords) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  return words.slice(0, maxWords).join(' ');
}

function aiPosterPrompt(post, brand, referenceCount, artDirection = '', hasLogo = false) {
  const manual = brand?.brand_manual || {};
  const designRules = Array.isArray(manual.design_rules) ? manual.design_rules : [];
  const colors = manual.colors && typeof manual.colors === 'object' ? manual.colors : {};
  const colorLine = Object.entries(colors)
    .map(([name, value]) => `${name} ${value}`)
    .join(', ');
  const rs = manual.render_style && typeof manual.render_style === 'object' ? manual.render_style : null;

  // Hard word caps for on-image copy: headline stays punchy, subline stays
  // to 1-2 light lines. Long-form copy lives in the caption, never on the art.
  const headline = clampWords(post.image_headline || post.hook, 12);
  const subline = clampWords(post.image_subline || '', 20);

  const designSystem = rs
    ? `Design system of THIS account (derived from its real Instagram feed — this is the source of truth, never a generic template):
- Photography: ${rs.photography}
- Framing: ${rs.framing}
- Lighting: ${rs.lighting}
- Color mood: ${rs.color_mood}
- Composition habits: ${rs.composition}
- Usual visual density: ${rs.visual_density} — respect it; do not make the piece busier than the account normally is.
- Typography feel: ${rs.typography_feel}
- Legibility device that fits this account: ${rs.overlay_treatment}
- Headline anchor position (keep consistent across posts): ${rs.headline_position}
- How often this account places text on images: ${rs.text_in_image}${rs.text_in_image === 'casi_nunca' ? ' — strongly prefer a clean, text-free or near-text-free piece.' : ''}`
    : `Design system defaults (no account analysis available):
- Photography-first, appetizing/product-hero, sharp subject with soft depth of field.
- Warm, premium, editorial mood; intentional negative space.
- Headline anchored in the lower third, left-aligned to a clean grid.
- Legibility via a soft dark warm gradient rising from the bottom edge (subtle, never muddy).
- Typography: modern sans, strong weight for the headline, light weight for the subline.`;

  const base = `Art-direct and design a finished, ready-to-publish vertical Instagram creative for ${brand?.name || 'the brand'}. You are acting as a senior art director at a top advertising studio: the result must look like a deliberately DESIGNED piece — layered, balanced, editorial — never like a photo with text pasted on top.

THE PHOTOGRAPH IS THE PROTAGONIST. Build a gorgeous, appetizing, professional hero image first (following the visual direction below), then integrate the copy into the composition as a designed layer.

Visual direction for the photograph:
- ${post.visual_direction || 'Hero shot of the product/subject, appetizing and professional.'}
- ${post.background_idea || ''}

${designSystem}

On-image copy (exact text — render it verbatim or omit it, NEVER paraphrase, translate, or respell):
- Headline: "${headline}"${subline ? `\n- Subline: "${subline}"` : ''}
- Text is OPTIONAL: if this particular image is stronger as a clean, text-free piece (for example a stunning product hero that speaks for itself), you may omit the subline or omit ALL text. Only include text that earns its place. When in doubt, less text.
- The full message lives in the caption; the image must never carry paragraphs.

Typographic hierarchy (non-negotiable when text is present):
- The headline is the single dominant text element: large, confident, expressive.
- The subline is clearly subordinate: roughly one third of the headline size, lighter weight, comfortable line-height, max 2 lines.
- Never give two text blocks the same visual weight. Maximum 2 text sizes in the whole piece.
- Generous letter-spacing discipline and margins: keep all text inside a safe area (~7% from every edge), aligned to a clean grid (left-aligned block or centered — pick ONE).
- Text must remain effortlessly legible on a phone screen.

Layered, non-flat composition (this is what separates design from "photo + text"):
- NEVER place plain flat text straight over a busy area of the photo.
- Create real depth with ONE deliberate legibility device that matches the account's mood: a soft dark/warm gradient scrim, a subtly blurred or darkened zone of the background, a translucent panel, or a clean solid color block bleeding off one edge.
- Use soft, natural shadows on text or panel edges; keep the device subtle — it should feel like light, not like a sticker.
- Compose with intentional negative space: let the image breathe. The text block occupies one clear zone; the subject stays sharp and unobstructed.
- Any darkening/blur must be local and gentle: the food/product itself stays crisp, vivid and appetizing.
${artDirection ? `
ART DIRECTION FOR THIS SPECIFIC PIECE (this is the concrete creative brief — follow it precisely for the typography treatment, colour, personality detail, layout and how the type integrates with the scene; it overrides the generic guidance above):
${artDirection}
` : ''}
Brand style:
- Voice/tone: ${manual.voice || 'Premium, warm, direct.'}
- Visual style: ${manual.visual_style || 'Warm, premium, editorial; appetizing and modern; never generic stock.'}${designRules.length ? `\n- Design rules: ${designRules.join('; ')}.` : ''}${colorLine ? `\n- Brand palette: ${colorLine}. Stay inside it.` : ''}
${hasLogo
  ? `- BRAND LOGO: the LAST reference image provided is the brand's official logo. Integrate it PHYSICALLY and naturally into the scene as real-world branding — printed on the product packaging (ice-cream tubs, cups, boxes, bags, labels), on apparel (aprons, t-shirts, caps), on signage or glassware — matching the surface's perspective, curvature, lighting and material. Reproduce the logo faithfully: never redraw, distort, recolor, translate or typeset it. Keep it crisp and believable, sized like real product branding. It must never compete with the headline.`
  : (manual.show_logo
    ? `- Include a small, discreet wordmark reading "${brand?.name || ''}" in one corner, never competing with the headline.`
    : `- Do NOT include any logo, wordmark, brand name text, or app icon anywhere in the image.`)}

Hard constraints — do NOT violate:
- NO call-to-action or promotional buttons, badges or bars ("Pedí ya", "Reservá", "Order now", "Book now", "Sign up", phone numbers, website bars). No button-shaped elements inviting action.
- NO invented taglines, prices, offers, or any words beyond the exact headline/subline above.
- All rendered text crisp and correctly spelled; if you cannot render the text cleanly, prefer the text-free version.`;

  const customInstructions = String(manual.image_instructions ?? '').trim();
  const withCustom = customInstructions
    ? `${base}

Additional instructions from the brand owner (HIGHEST priority — follow them even if they override guidance above):
${customInstructions}`
    : base;

  if (referenceCount > 0) {
    return `${withCustom}

You are given ${referenceCount} style reference image(s) taken from this account's real feed${hasLogo ? ' (plus the brand logo as the FINAL image — that one is a branding asset, NOT a style reference)' : ''}. They define its visual identity: photography style, framing, lighting, palette, mood, composition and text density. Match that identity closely — the new piece must look like it was posted by the same account on the same grid. Do NOT copy their literal content or reproduce any text visible in them; create a new, original piece that clearly belongs to the same visual system.`;
  }

  if (hasLogo) {
    return `${withCustom}

The single reference image provided is the brand's official logo — a branding asset to integrate into the scene as described above, NOT a style reference for the overall composition.`;
  }

  return withCustom;
}

// Acts like the LLM layer behind ChatGPT's web image tool: instead of a fixed
// generic prompt, it art-directs THIS specific piece — concrete typographic
// treatment, colour, layout and integration — so the type looks designed and
// varied rather than "same white font, flat, pasted on top".
export async function generateImageArtDirection({ post, brand }) {
  const client = createOpenAIClient();
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const manual = brand?.brand_manual || {};
  const headline = clampWords(post.image_headline || post.hook, 12);
  const subline = clampWords(post.image_subline || '', 20);

  const prompt = `Sos director de arte senior de un estudio de publicidad top. Vas a escribir la direccion de arte para UNA pieza de Instagram que va a generar un modelo de imagen (foto + tipografia en una sola pasada). Tu trabajo es que el texto se vea DISENADO y con personalidad, no una fuente blanca plana pegada encima.

Marca: ${brand?.name || ''}
Rubro/estilo visual: ${manual.visual_style || 'gastronomico, calido, apetecible'}
Paleta: ${compactJson(manual.colors || {})}
${manual.render_style ? `ADN visual de la cuenta: ${compactJson(manual.render_style)}` : ''}

Texto que ira en la imagen (exacto, no lo cambies):
- Titular: "${headline}"
${subline ? `- Bajada: "${subline}"` : '- Sin bajada.'}

Foto de fondo (concepto): ${post.visual_direction || ''} ${post.background_idea || ''}

Escribi una direccion de arte concreta y visual (un solo parrafo denso, 90-140 palabras, en ingles para el modelo de imagen). DEBE incluir decisiones especificas de:
- Tratamiento tipografico del titular: familia sugerida (ej. condensed grotesque, elegant high-contrast serif, rounded sans, script), peso, mayusculas/minusculas, tracking, si va en una o varias lineas y como se rompen.
- COLOR del texto: NO por defecto blanco. Elegi color(es) que salgan de la paleta/escena (ej. crema calido, un word destacado en color de acento, texto sobre bloque de color). Buen contraste.
- Un detalle de diseno que le de personalidad: una palabra clave en otro peso/estilo/color, un subrayado, un kicker chico, numeros o simbolo tratados aparte, textura sutil, etc. (elegi UNO, sin recargar).
- Como se integra el texto con la foto y el dispositivo de legibilidad (gradiente/panel/bloque) para que tenga profundidad.
- Layout: donde va el bloque y como usa el espacio negativo.

Reglas: coherente con el ADN de la cuenta y su densidad visual; jerarquia clara (titular manda); si la pieza es mas fuerte sin bajada, deci que se omita. No inventes texto nuevo ni CTAs. Devolve SOLO el parrafo de direccion de arte, sin encabezados.`;

  try {
    const response = await client.responses.create({
      model,
      input: [
        { role: 'system', content: 'Sos director de arte. Devolves direcciones de arte tipograficas concretas y con criterio, en un solo parrafo.' },
        { role: 'user', content: prompt }
      ]
    });
    return String(response.output_text || '').trim();
  } catch (error) {
    console.warn('[generateImageArtDirection] fallo, sigo sin direccion de arte:', error.message);
    return '';
  }
}

export async function generatePostImageAsset(post, { brand, referenceBuffers = [], artDirection = '', logoBuffer = null, quality: qualityOverride } = {}) {
  const client = createOpenAIClient();
  const model = process.env.OPENAI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL;
  const size = process.env.OPENAI_IMAGE_SIZE || DEFAULT_IMAGE_SIZE;
  const quality = qualityOverride || brand?.image_quality || process.env.OPENAI_IMAGE_QUALITY || 'high';
  const prompt = aiPosterPrompt(post, brand, referenceBuffers.length, artDirection, Boolean(logoBuffer));

  // The logo always goes LAST so the prompt can point at "the last image".
  const allBuffers = logoBuffer ? [...referenceBuffers, logoBuffer] : referenceBuffers;

  let response;

  try {
    if (allBuffers.length > 0) {
      const referenceFiles = await Promise.all(
        allBuffers.map((buffer, index) => toFile(
          buffer,
          logoBuffer && index === allBuffers.length - 1 ? 'brand-logo.png' : `reference-${index}.png`,
          { type: 'image/png' }
        ))
      );

      response = await client.images.edit({
        model,
        image: referenceFiles,
        prompt,
        n: 1,
        size,
        quality,
        output_format: 'png',
        background: 'opaque'
      });
    } else {
      response = await client.images.generate({
        model,
        prompt,
        n: 1,
        size,
        quality,
        output_format: 'png',
        background: 'opaque'
      });
    }
  } catch (error) {
    throw new AppError(`OpenAI image generation failed: ${error.message}`, 502, 'OPENAI_IMAGE_FAILED');
  }

  const image = response.data?.[0];

  if (!image?.b64_json) {
    throw new AppError('OpenAI image generation returned no image data', 502, 'OPENAI_IMAGE_EMPTY_RESPONSE');
  }

  return {
    model,
    size,
    buffer: Buffer.from(image.b64_json, 'base64'),
    raw: response
  };
}

const SUPPORTED_REFERENCE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

// Fetches an image URL and validates it is actually image bytes (not an HTML
// page — e.g. a link to an Instagram post page instead of its photo file),
// since GPT Image 2 rejects mislabeled non-image input with a 400 error.
export async function fetchRemoteImageBytes(url) {
  const res = await fetch(url);

  if (!res.ok) {
    throw new AppError(`Image URL download failed: ${res.status} ${res.statusText}`, 502, 'IMAGE_DOWNLOAD_FAILED');
  }

  const contentType = (res.headers.get('content-type') || '').split(';')[0].trim();

  if (!SUPPORTED_REFERENCE_TYPES.includes(contentType)) {
    throw new AppError(
      `URL does not point to a direct image file (got content-type "${contentType || 'unknown'}"). Use a direct link to a .png/.jpg/.webp file, not a page URL.`,
      400,
      'IMAGE_NOT_DIRECT_URL'
    );
  }

  return Buffer.from(await res.arrayBuffer());
}
