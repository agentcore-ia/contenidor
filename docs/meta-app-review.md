# Meta App Review — guía completa

Preparado el 2026-07-30. Todo verificado contra producción antes de escribir esto.

## Estado del terreno (ya verificado, no tenés que tocar nada)

| Cosa | Estado |
|---|---|
| postia.ar/privacidad, /terminos, /eliminacion-datos | ✅ responden 200 |
| Capta conectada a @capta.arg | ✅ token válido hasta sept 2026 |
| Posts listos para aprobar/publicar en vivo | ✅ 5 con imagen en "Esperando revisión" |
| Cuenta demo para revisores | ✅ `meta.review@postia.ar` / `Postia-Review-a2b610e2` |
| Marca demo con contenido | ⚠️ BLOQUEADA: OpenAI sin crédito — recargar y avisar |

## Permisos que se piden

1. **`instagram_business_basic`** — conectar la cuenta y leer el perfil (usuario, id) y los medios propios (likes/comentarios para Analytics).
2. **`instagram_business_content_publish`** — publicar los posts aprobados en la cuenta del usuario.

---

# EL GUION DE GRABACIÓN

**Regla de oro de Meta:** el video tiene que mostrar el flujo completo, real y sin cortes
de edición en los momentos clave (el diálogo de OAuth y la publicación). Un solo video
que cubra los dos permisos alcanza; se sube el mismo en ambos.

## Antes de apretar grabar

1. **Idioma del navegador en inglés** si podés (los revisores no hablan castellano;
   si no, no pasa nada — las notas del formulario explican todo).
2. Abrí una ventana **limpia** del navegador (sin extensiones raras ni pestañas de más).
3. Cerrá sesión en app.postia.ar.
4. En otra pestaña dejá abierto **instagram.com/capta.arg** (para el final).
5. **Desconectá Instagram de Capta**: app.postia.ar → Marca → sección Instagram →
   "Desconectar cuenta". *Esto es a propósito: así el video muestra la conexión
   OAuth completa desde cero.*
6. Grabá **la pantalla entera** (no una ventana recortada), con resolución legible.
   El video puede durar 2-4 minutos; más largo no suma.

## La secuencia, paso a paso

**1. Login (10s)**
- Entrá a `https://app.postia.ar`
- Iniciá sesión con tu cuenta (`matiirodriguez2346@gmail.com`)
- *Qué está viendo Meta: dónde arranca el flujo del usuario.*

**2. Conectar Instagram — permiso `instagram_business_basic` (40s)**
- En el Resumen va a estar el banner naranja **"Conectá tu Instagram"** → tocá
  **Conectar Instagram**
- Aparece el diálogo de OAuth de Instagram → **mostralo unos segundos quieto**
  (que se lea qué permisos pide) → autorizá con @capta.arg
- Volvés a la app: se ve el aviso "Instagram conectado (@capta.arg)"
- Andá a **Marca** y mostrá la tarjeta de Instagram conectada (@capta.arg, "Conexión
  válida hasta...")
- *Qué está viendo Meta: el permiso basic en acción — login + lectura del perfil.*

**3. Mostrar el producto 30 segundos (30s)**
- Pasá por **Agenda** (el calendario con ideas) y por **Posts** (los creativos
  generados esperando revisión)
- No hace falta generar nada nuevo: ya hay 5 posts con imagen esperando
- *Qué está viendo Meta: que la app es real y hace lo que dice.*

**4. Aprobar y publicar — permiso `content_publish` (60s)**
- En **Posts**, elegí uno de los que están "Esperando revisión" (el carrusel es el
  más vistoso, pero un post simple es más rápido y menos riesgoso)
- Tocá **Aprobar** → después **Publicar ahora**
- Esperá el aviso de éxito **sin cortar el video**
- *Qué está viendo Meta: el permiso de publicación en acción, con consentimiento
  explícito del usuario (el botón Aprobar). Ese detalle les importa.*

**5. La prueba final (20s)**
- Cambiá a la pestaña de **instagram.com/capta.arg**
- Refrescá y mostrá el post recién publicado en el feed
- Entrá al post para que se vea la imagen y el caption completos
- *Qué está viendo Meta: que lo publicado aparece de verdad en Instagram.*

**Fin.** No hace falta narrar; si querés, subtitulá en inglés, pero las notas del
formulario cubren la explicación.

## Si algo sale mal grabando

- La publicación es real: si publicás un post y después querés regrabar, publicá
  OTRO post (hay 5 listos) — no borres el publicado hasta que el review termine.
- Si el OAuth falla, verificá que estás logueado en Instagram con @capta.arg en
  ese navegador antes de tocar "Conectar Instagram".

---

# QUÉ PEGAR EN EL FORMULARIO DE META (en inglés)

## Campo "How will your app use this permission" — instagram_business_basic

> Postia is a content studio for small businesses. We use instagram_business_basic
> to let the business owner connect their own Instagram professional account to
> Postia via Instagram Login, display which account is connected (username), and
> read the metrics of the media that Postia itself published (like and comment
> counts) so the user can see how their posts performed inside Postia's analytics.
> We only access the account explicitly connected by its owner through the OAuth
> dialog. See the screencast from 0:15, where the user connects their account and
> the app shows the connected username.

## Campo "How will your app use this permission" — instagram_business_content_publish

> Postia generates Instagram post drafts (image + caption) for the business.
> Nothing is ever published automatically without consent: every post requires an
> explicit "Approve" action from the account owner inside the app. Once approved,
> the user can publish it to their own connected Instagram account with the
> "Publish now" button, which uses content_publish. The screencast shows the full
> flow: the user reviews a draft, approves it, publishes it, and the post appears
> on their Instagram feed (shown live at the end of the video).

## Campo de instrucciones para el revisor (App Review > Testing instructions)

> Test credentials for our app (Postia, https://app.postia.ar):
> Email: meta.review@postia.ar
> Password: Postia-Review-a2b610e2
>
> 1. Go to https://app.postia.ar and log in with the credentials above.
> 2. You will see the dashboard of a demo brand with an AI-generated content
>    calendar and post drafts under "Posts".
> 3. The "Conectar Instagram" (Connect Instagram) button on the home screen
>    starts the Instagram Login OAuth flow (instagram_business_basic).
> 4. Publishing (instagram_business_content_publish) requires an approved post
>    and a connected professional Instagram account; the full connect → approve →
>    publish → live-on-Instagram flow is shown in the screencast using our own
>    account @capta.arg.
>
> Privacy policy: https://postia.ar/privacidad
> Terms: https://postia.ar/terminos
> Data deletion: https://postia.ar/eliminacion-datos (users can also delete their
> account and all data in-app: Ajustes → Cuenta → "Borrar mi cuenta").

---

## Pendientes antes de enviar

- [ ] **Recargar crédito en OpenAI** (bloquea la generación en prod y la marca demo)
- [ ] Avisarme para terminar la marca demo del revisor (Aroma Cafe quedó en error por lo de OpenAI)
- [ ] Grabar el video siguiendo el guion
- [ ] Subir el mismo video en los dos permisos y pegar los textos de arriba
