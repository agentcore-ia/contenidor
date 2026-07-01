import OpenAI from 'openai';
import { AppError, assertRequiredEnv } from './errors.js';

const DEFAULT_MODEL = 'gpt-5.4-mini';

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
