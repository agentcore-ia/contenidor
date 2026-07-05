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
    caption_instagram: { type: 'string' },
    caption_x: { type: 'string' },
    caption_linkedin: { type: 'string' },
    visual_direction: { type: 'string' },
    background_idea: { type: 'string' }
  }
};

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
  const missing = requiredFields.filter((field) => !String(content?.[field] ?? '').trim());

  if (missing.length) {
    throw new AppError(`OpenAI response is missing: ${missing.join(', ')}`, 502, 'OPENAI_INVALID_CONTENT');
  }

  return Object.fromEntries(
    requiredFields.map((field) => [field, String(content[field]).trim()])
  );
}

export async function generatePostContent({ brand, category, calendar }) {
  const client = createOpenAIClient();
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;

  const prompt = `Genera una pieza diaria para Instagram de Capta.

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

Reglas:
- Uso interno de Capta, no SaaS.
- Hablarle a duenos de negocios gastronomicos.
- Hook maximo 14 palabras.
- Body maximo 34 palabras.
- CTA maximo 10 palabras.
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
          content: 'Sos el content engine interno de Capta. Escribis copy claro, premium y accionable.'
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
          required: ['topic', 'angle', 'category_slug'],
          properties: {
            topic: { type: 'string' },
            angle: { type: 'string' },
            category_slug: {
              type: 'string',
              enum: categorySlugs
            }
          }
        }
      }
    }
  };
}

export async function generateContentIdeas({ brand, categories, existingTopics = [], count = 7 }) {
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

Reglas:
- Uso interno de Capta, no SaaS. Le hablamos a duenos de negocios gastronomicos.
- Cada idea es un tema concreto y accionable, no un titulo generico.
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
          content: 'Sos el estratega de contenido interno de Capta. Proponés ideas frescas, especificas y no repetitivas.'
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

  const cleaned = ideas
    .map((idea) => ({
      topic: String(idea?.topic ?? '').trim(),
      angle: String(idea?.angle ?? '').trim(),
      category_slug: String(idea?.category_slug ?? '').trim()
    }))
    .filter((idea) => idea.topic && categorySlugs.includes(idea.category_slug));

  if (!cleaned.length) {
    throw new AppError('OpenAI returned no usable ideas', 502, 'OPENAI_IDEAS_EMPTY');
  }

  return { model, ideas: cleaned, raw: response };
}

function aiPosterPrompt(post, brand, referenceCount) {
  const manual = brand?.brand_manual || {};

  const base = `Design a finished, ready-to-publish vertical Instagram post image for ${brand?.name || 'the brand'}.

This must be the COMPLETE final artwork as a poster-style graphic design, with all text rendered directly in the image — not a blank background or template.

Exact text to render (verbatim — do not paraphrase, add, remove, or misspell a single word):
- Headline (largest, most prominent element): "${post.hook || ''}"
- Supporting text (secondary, smaller, below the headline): "${post.body || ''}"
- Call to action (inside a pill/button-shaped element near the bottom): "${post.cta || ''}"

Brand style guide:
- Voice/tone: ${manual.voice || 'Premium, sober, direct, operational.'}
- Audience: ${manual.audience || 'Restaurant and gastronomic business owners.'}
- Visual style: ${manual.visual_style || 'Dark, sober, high-contrast editorial design. Black/graphite background, warm orange accent color (#ff6a1a), off-white highlights. Sophisticated and practical, not cartoonish, not generic stock photography.'}
- Include a small wordmark reading "${brand?.name || 'capta'}" with a round orange accent dot next to it, in the top-left corner.

Composition guidance:
- Vertical portrait poster format, feels like a premium social media ad.
- Strong typographic hierarchy: the headline is the dominant visual element and must stay fully legible.
- An abstract visual metaphor for restaurant operations, orders, customers, menus, or business signals becoming organized (subtle dashboard panels, connected nodes, order tickets) may appear alongside the text, but must never obscure or crowd the text.
- All rendered text must be crisp, correctly spelled, and exactly as provided above — no other text, watermarks, or UI labels.`;

  if (referenceCount > 0) {
    return `${base}

You are given ${referenceCount} reference image(s) showing this brand's established visual style. Use them ONLY as a style/mood/color/composition reference — do not copy their exact content or reproduce any text visible in them. Produce a new, original image consistent with that established look.`;
  }

  return base;
}

export async function generatePostImageAsset(post, { brand, referenceBuffers = [] } = {}) {
  const client = createOpenAIClient();
  const model = process.env.OPENAI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL;
  const size = process.env.OPENAI_IMAGE_SIZE || DEFAULT_IMAGE_SIZE;
  const quality = process.env.OPENAI_IMAGE_QUALITY || 'medium';
  const prompt = aiPosterPrompt(post, brand, referenceBuffers.length);

  let response;

  try {
    if (referenceBuffers.length > 0) {
      const referenceFiles = await Promise.all(
        referenceBuffers.map((buffer, index) => toFile(buffer, `reference-${index}.png`, { type: 'image/png' }))
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

export async function fetchRemoteImageBytes(url) {
  const res = await fetch(url);

  if (!res.ok) {
    throw new AppError(`Image URL download failed: ${res.status} ${res.statusText}`, 502, 'IMAGE_DOWNLOAD_FAILED');
  }

  return Buffer.from(await res.arrayBuffer());
}
