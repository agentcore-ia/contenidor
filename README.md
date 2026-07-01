# Capta Content Engine

MVP interno para generar, renderizar y guardar posts diarios de Instagram para Capta.

El sistema esta pensado para ser llamado por n8n u otro workflow interno. No incluye autenticacion, dashboard ni publicacion automatica en redes.

## Stack

- Node.js
- Express
- Playwright
- Supabase
- Supabase Storage
- OpenAI Responses API

## Configurar `.env`

```bash
cp .env.example .env
```

Variables:

```bash
SUPABASE_URL=https://wdowrhbkzydwdcsxcxzg.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-5.4-mini
CONTENT_TIME_ZONE=America/Argentina/Buenos_Aires
PORT=3000
```

`SUPABASE_SERVICE_ROLE_KEY` y `OPENAI_API_KEY` son secretos de backend. No los expongas en frontend.

## Crear tablas en Supabase

En Supabase SQL Editor, ejecutar:

```sql
-- copiar y ejecutar supabase/schema.sql
```

El schema crea:

- `brands`
- `content_categories`
- `content_calendar`
- `generated_posts`
- `post_assets`
- `post_reviews`

## Cargar seed de Capta

Luego ejecutar:

```sql
-- copiar y ejecutar supabase/seed_capta.sql
```

El seed carga:

- marca Capta
- manual de marca
- 5 categorias de contenido
- 14 temas iniciales en `content_calendar`, desde `current_date`

## Crear bucket `post-assets`

En Supabase:

1. Ir a Storage.
2. Crear bucket `post-assets`.
3. Marcarlo como public bucket.
4. Confirmar que la service role key pueda subir objetos.

Las imagenes se suben a:

```text
post-assets/generated-posts/{post_id}.png
```

## Instalar y correr local

```bash
npm install
npm run install:browsers
npm start
```

Desarrollo:

```bash
npm run dev
```

## Endpoints

### Health

```bash
curl http://localhost:3000/health
```

### Obtener contenido pendiente de hoy

```bash
curl http://localhost:3000/today
```

Si no hay contenido pendiente para la fecha actual devuelve `404`.

### Generar copy para un item del calendario

```bash
curl -X POST http://localhost:3000/generate \
  -H "Content-Type: application/json" \
  -d "{\"calendar_id\":\"CALENDAR_ID_HERE\"}"
```

Guarda un registro en `generated_posts` con:

- `hook`
- `body`
- `cta`
- `caption_instagram`
- `caption_x`
- `caption_linkedin`
- `visual_direction`
- `background_idea`

### Renderizar un post ya generado

```bash
curl -X POST http://localhost:3000/render \
  -H "Content-Type: application/json" \
  -d "{\"post_id\":\"POST_ID_HERE\"}"
```

Renderiza el PNG `1080x1350`, lo sube a `post-assets`, guarda `generated_posts.image_url` y registra metadata en `post_assets`.

### Generar y renderizar en un paso

```bash
curl -X POST http://localhost:3000/generate-and-render \
  -H "Content-Type: application/json" \
  -d "{\"calendar_id\":\"CALENDAR_ID_HERE\"}"
```

Respuesta:

```json
{
  "success": true,
  "post_id": "POST_ID_HERE",
  "image_url": "https://wdowrhbkzydwdcsxcxzg.supabase.co/storage/v1/object/public/post-assets/generated-posts/POST_ID_HERE.png",
  "caption_instagram": "...",
  "caption_x": "...",
  "caption_linkedin": "..."
}
```

## Templates

El render elige template usando `generated_posts.template_id`.

Templates disponibles:

- `pain_point_01`
- `before_after_01`
- `daily_situation_01`
- `product_feature_01`
- `insight_01`

Si el template no existe, usa `pain_point_01`.

## Flujo recomendado para n8n

1. `GET /today`
2. Tomar `calendar_id`
3. `POST /generate-and-render`
4. Usar `image_url` y captions devueltos para preview interna

## Errores esperados

- Falta `SUPABASE_URL`: error de configuracion al iniciar.
- Falta `SUPABASE_SERVICE_ROLE_KEY`: error de configuracion al iniciar.
- Falta `OPENAI_API_KEY`: `/generate` y `/generate-and-render` devuelven error.
- `calendar_id` inexistente: `404`.
- Sin contenido pendiente del dia: `GET /today` devuelve `404`.
- Falla OpenAI: `502`.
- Falla Supabase Storage: `502`.
