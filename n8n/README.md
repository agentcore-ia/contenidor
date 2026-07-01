# n8n — Capta Content Engine

Workflow de n8n que ejecuta el ciclo diario de generacion de posts para Capta.

## Archivos

- `workflows/capta-daily-content.json` — workflow exportado (fuente de verdad).
- `scripts/deploy-workflow.js` — script idempotente que crea o actualiza el workflow via la API publica de n8n.

## Contrato que consume del engine

| Endpoint | Metodo | Uso |
|---|---|---|
| `/health` | GET | Sanity check antes de empezar. |
| `/today` | GET | Devuelve el item pendiente del calendario + brand + category. |
| `/generate-and-render` | POST `{ "calendar_id": "..." }` | Genera copy + renderiza PNG + sube a Storage. Devuelve `image_url` y captions. |

El engine no requiere autenticacion. Si lo expones publicamente, agrega un header `X-Internal-Key` o similar y configuralo como header auth credential en los nodos HTTP Request.

## Importar manualmente (UI)

1. Abrir n8n -> Workflows -> Import from File.
2. Seleccionar `workflows/capta-daily-content.json`.
3. Ajustar las URLs en los nodos `Health Check`, `Get Today Content` y `Generate and Render` segun donde corra el engine:
   - Local mismo equipo: `http://localhost:3000`
   - Docker en el mismo host: `http://host.docker.internal:3000`
   - Easypanel / remoto: `http://<service-name>:<port>` o la URL publica
4. (Opcional) Extender despues del nodo `Prepare Review Payload` con Slack, Email, Notion, etc.
5. Probar con `Execute Workflow`.
6. Activar (`Active = true`) cuando este validado.

## Deploy via API (recomendado para iterar)

El script busca un workflow con el mismo nombre y lo crea o actualiza. No requiere UI.

### PowerShell

```powershell
$env:N8N_URL = "https://agentcore-n8n.8zp1cp.easypanel.host"
$env:N8N_API_KEY = "<tu-api-key>"
node n8n/scripts/deploy-workflow.js n8n/workflows/capta-daily-content.json
```

### bash / zsh

```bash
N8N_URL="https://agentcore-n8n.8zp1cp.easypanel.host" \
N8N_API_KEY="<tu-api-key>" \
node n8n/scripts/deploy-workflow.js n8n/workflows/capta-daily-content.json
```

La API key se lee solo de variables de entorno. Nunca queda en archivos del repo. Si la perdes o rotas, regenerala en n8n -> Settings -> API.

## Como generar la API key en n8n

1. Settings (icono engranaje) -> API.
2. Create an API key. Copiar el valor (no se vuelve a mostrar).
3. Guardarla en tu password manager.

## Horario

- Trigger: cron `0 0 9 * * *` = 09:00:00 todos los dias.
- Timezone del workflow: `America/Argentina/Buenos_Aires` (configurado en `settings.timezone`, no en el cron).

## Timeouts y retries

- `Health Check`: timeout 10s, 2 retries con 3s entre intentos.
- `Get Today Content`: timeout 15s, 2 retries con 5s. `neverError: true` para que 404 (sin contenido hoy) pase como `{ success: false }` en vez de cortar el workflow.
- `Generate and Render`: timeout 180s (3 min) por el costo de Playwright, 2 retries con 15s. `neverError: true` para distinguir 502 de OpenAI/Storage del 200 OK.

## Extender el workflow

El ultimo nodo, `Prepare Review Payload`, expone en `$json`:

```json
{
  "post_id": "uuid",
  "image_url": "https://.../post-assets/generated-posts/<post_id>.png",
  "caption_instagram": "...",
  "caption_x": "...",
  "caption_linkedin": "...",
  "topic": "..."
}
```

Opciones tipicas para el siguiente nodo:

- **Slack/Email** -> enviar `image_url` + captions para aprobacion manual, esperar webhook para `POST /render` final o marcar review.
- **Webhook propio** -> mismo payload a un endpoint de preview interna.
- **Airtable/Notion** -> fila nueva con link al asset para QA.

## Troubleshooting

- **Workflow queda en "Skip: Engine Down"**: el engine no esta corriendo o el host es inaccesible desde n8n. Probar `curl <engine-url>/health` desde el host de n8n.
- **Workflow queda en "Skip: No Content Today"**: no hay item `pending` en `content_calendar` para la fecha local. Correr `seed_capta.sql` o insertar manualmente.
- **Workflow queda en "Skip: Render Failed"**: ver logs del engine (`console.error` en stdout). 502 suele ser OpenAI (`OPENAI_API_KEY` falta/quota) o Storage (bucket `post-assets` no existe o service role sin permisos).
- **Cron no dispara**: verificar que el workflow esta `Active` y que la timezone del workflow esta bien configurada (no la del host).
