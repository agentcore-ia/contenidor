# Deploy en Easypanel

Guia paso a paso para levantar el engine en Easypanel y conectarlo con el workflow de n8n que ya desplegamos.

## Pre-requisitos

- Cuenta en Easypanel con un proyecto (puede ser el mismo donde esta n8n).
- Repo en GitHub: `https://github.com/agentcore-ia/contenidor` (ya esta pusheado).
- Las 4 variables de entorno:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `OPENAI_API_KEY`
  - `OPENAI_MODEL` (opcional, default `gpt-5.4-mini`)

## 1. Crear el servicio en Easypanel

1. Entrar a Easypanel -> tu proyecto (recomendado: el mismo donde esta n8n).
2. **Create Service** -> **App**.
3. **Source**: GitHub -> seleccionar `agentcore-ia/contenidor`.
4. **Branch**: `main`.
5. **Build method**: **Dockerfile** (Easypanel lo autodetecta porque hay un `Dockerfile` en la raiz).
6. **Port**: `3000`.
7. **Healthcheck path**: `/health`.

## 2. Variables de entorno

En la seccion **Environment** del servicio, agregar:

| Key | Value | Notas |
|---|---|---|
| `NODE_ENV` | `production` | |
| `PORT` | `3000` | |
| `CONTENT_TIME_ZONE` | `America/Argentina/Buenos_Aires` | |
| `SUPABASE_URL` | `https://wdowrhbkzydwdcsxcxzg.supabase.co` | o tu URL de Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | `<tu service role key>` | **secreto** |
| `OPENAI_API_KEY` | `sk-...` | **secreto** |
| `OPENAI_MODEL` | `gpt-5.4-mini` | o el modelo que prefieras |

Easypanel guarda estas vars de forma segura. No se exponen en el build context.

## 3. Deploy

1. Click **Deploy**.
2. Easypanel hace `git clone` -> `docker build` (toma ~3-5 min la primera vez por Playwright + Chromium) -> `docker run`.
3. Una vez verde, ir a la pestana **Logs** y confirmar:
   ```
   Capta Content Engine listening on port 3000
   ```
4. Probar el healthcheck desde la pestana **Shell** del contenedor:
   ```bash
   wget -qO- http://127.0.0.1:3000/health
   ```
   Deberia devolver `{"ok":true,"service":"capta-content-engine"}`.

## 4. URL interna para n8n

Como n8n y el engine van a correr en el mismo Easypanel, n8n puede hablarle por nombre de servicio sin pasar por HTTPS publico.

**Si estan en el mismo proyecto:**
- Nombre del servicio (por convencion) = `capta-content-engine`
- URL interna = `http://capta-content-engine:3000`

**Si estan en proyectos diferentes:**
- Ir al servicio del engine -> **Domains** -> agregar un dominio publico (Easypanel te da algo como `capta-content-engine.<tu-dominio>`).
- Usar esa URL publica desde n8n.

## 5. Actualizar el workflow de n8n

Las URLs del workflow hoy apuntan a `http://localhost:3000`. Cambiar las 3 URLs en el editor de n8n:

1. Abrir el workflow `Capta - Daily Content` en n8n.
2. Nodo **Health Check**: cambiar URL a `http://capta-content-engine:3000/health`.
3. Nodo **Get Today Content**: cambiar URL a `http://capta-content-engine:3000/today`.
4. Nodo **Generate and Render**: cambiar URL a `http://capta-content-engine:3000/generate-and-render`.
5. **Save**.

Alternativamente, re-deployar el workflow con la URL ya corregida. Editar `n8n/workflows/capta-daily-content.json`, reemplazar `http://localhost:3000` por `http://capta-content-engine:3000` en las 3 URLs, commit, push, y correr:

```powershell
$env:N8N_URL = "https://agentcore-n8n.8zp1cp.easypanel.host"
$env:N8N_API_KEY = "<key>"
node n8n/scripts/deploy-workflow.js n8n/workflows/capta-daily-content.json
```

## 6. Test end-to-end

Antes de activar el cron:

1. En n8n, abrir el workflow.
2. Click **Execute Workflow** (ejecuta manualmente).
3. Seguir las ejecuciones: Health Check -> Get Today Content -> Generate and Render -> Prepare Review Payload.
4. El ultimo nodo deberia tener en su output el `image_url` apuntando a `https://wdowrhbkzydwdcsxcxzg.supabase.co/storage/v1/object/public/post-assets/generated-posts/<post_id>.png`.
5. Si algo falla, Easypanel **Logs** del engine muestra el `console.error` con el codigo:
   - `OPENAI_FAILED` -> problema con OpenAI
   - `STORAGE_UPLOAD_FAILED` -> problema con bucket `post-assets`
   - `CALENDAR_NOT_FOUND` -> calendar_id invalido
   - `TODAY_CONTENT_NOT_FOUND` -> no hay item `pending` para hoy (correr seed o insertar uno)

## 7. Activar el cron

Cuando todo lo anterior pasa:

1. Toggle **Active** arriba a la derecha del workflow en n8n.
2. El workflow va a correr todos los dias a las 09:00 ART.

## Troubleshooting

### "Connection refused" desde n8n al engine

- Verificar que el servicio del engine esta **Running** en Easypanel.
- Verificar el nombre del servicio. Si le pusiste otro nombre al crear el servicio, ese es el hostname que n8n debe usar.
- Si estan en distintos proyectos de Easypanel, no se ven por nombre. Usar el dominio publico del engine.

### Engine tarda mucho en arrancar la primera vez

Normal. La imagen pesa ~1.5 GB por Chromium. Builds subsiguientes son mas rapidos porque Easypanel cachea capas Docker.

### "STORAGE_UPLOAD_FAILED"

- El bucket `post-assets` no existe en Supabase. Crearlo como **public bucket**.
- La `SUPABASE_SERVICE_ROLE_KEY` no tiene permisos. Confirmar que estas usando la **service role** (no la anon key).

### "OPENAI_FAILED"

- `OPENAI_API_KEY` mal copiada o sin creditos.
- Modelo no disponible para tu cuenta. Cambiar `OPENAI_MODEL` a `gpt-4o-mini` o el que tengas habilitado.

## Alternativa: docker-compose en otra VPS

Si despues queres mover el engine a otro server (Hetzner, DigitalOcean, etc.):

```bash
# En el server, una vez clonado el repo:
cp .env.example .env
nano .env  # poner las keys reales
docker compose up -d --build
```

El `docker-compose.yml` ya esta listo. Las vars se leen de `.env` automaticamente.
