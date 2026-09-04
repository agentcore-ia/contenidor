# Meta App Review — guía completa

Preparado el 2026-07-30, corregido el 2026-08-15 tras el primer rechazo,
corregido de nuevo el 2026-09-04 tras el segundo.

## ⚠️⚠️ Rechazo #2 (17-ago-2026): la causa real, encontrada mirando el video

Mismo motivo textual que la primera vez ("la captura de vídeo no se corresponde
con los detalles del caso de uso"), pero esta vez se miró frame a frame el
video que quedó adjunto en la revisión de Meta y se encontró el problema real:

**El paso "Desconectá Instagram de Capta" (más abajo) solo borra el token del
lado de Postia. Instagram, del otro lado, sigue recordando que la app ya
estuvo autorizada.** Por eso, al tocar "Conectar Instagram" para grabar de
nuevo, Instagram NO mostró el flujo completo de autorización (el que lista
los permisos que se piden) — mostró la pantalla corta de "Anteriormente
conectaste Postia-IG con tu cuenta de Instagram. ¿Quieres seguir compartiendo
información sobre capta.arg con Postia-IG?", sin listar permisos ni mostrar el
flujo real. Eso es exactamente lo que Meta objeta: no es "el flujo de inicio
de sesión completo" ni "un usuario concediendo acceso" en el sentido que
piden ver.

**La corrección real: revocar el acceso desde ADENTRO de Instagram, no solo
desde Postia**, antes de grabar. Ver el paso 5 corregido más abajo.

## ⚠️ Rechazo del 3-ago-2026: qué pasó y qué se corrigió

Meta rechazó `instagram_business_basic` e `instagram_business_content_publish`
(solo `public_profile` se aprobó). El motivo textual: **"La captura de vídeo no
se corresponde con los detalles del caso de uso"** (Apartado 1.6) — Meta
confirma que el caso de uso está permitido, pero el video enviado no mostró la
experiencia completa. Piden que el video nuevo incluya explícitamente:
1. El flujo de inicio de sesión completo de Meta.
2. Un usuario concediendo acceso en la app al permiso.
3. La experiencia integral del caso de uso (conectar → aprobar → publicar → verse en vivo).

**Se encontró un error en esta guía**: el email de la cuenta revisor estaba
escrito al revés (`meta.review@` en vez de `revisor.meta@postia.ar`). Ya está
corregido abajo. La contraseña también se regeneró porque no había forma de
confirmar que la vieja siguiera siendo válida.

Se dejó un borrador de reenvío iniciado en Meta (con los dos permisos
agregados) pero **sin enviar** — falta grabar el video nuevo y completar
"Tratamiento de datos", que requiere criterio del operador, no automatizable.

## Estado del terreno (verificado 2026-08-15)

| Cosa | Estado |
|---|---|
| postia.ar/privacidad, /terminos, /eliminacion-datos | ✅ responden 200 |
| Capta conectada a @capta.arg | ✅ token válido hasta 29-sept-2026 |
| Cuenta demo para revisores | ✅ `revisor.meta@postia.ar` / `Postia-Meta-Review-7f2b9c` (login verificado) |
| Marca demo del revisor | ✅ "Demo Cafe Postia", 1 post con imagen en "Esperando revisión" |

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
5. **Revocá el acceso de la app en las DOS puntas** — esto es lo que falló la
   segunda vez, hacelo completo:
   a. Primero, **desde Instagram**: abrí Instagram (app o instagram.com) con
      @capta.arg → Configuración → Seguridad → **Apps y sitios web** (o
      "Aplicaciones autorizadas") → buscá **"Postia-IG"** → **quitale el
      acceso ahí**. Sin este paso, Instagram va a mostrar la pantalla corta de
      "¿seguís compartiendo?" en vez del flujo completo — ese fue el motivo
      del segundo rechazo.
   b. Después, **desde Postia**: app.postia.ar → Marca → sección Instagram →
      "Desconectar cuenta" (esto limpia el token guardado en Postia).
   *Con las dos hechas, al tocar "Conectar Instagram" Instagram trata la
   conexión como si fuera la primera vez: muestra el listado de permisos y el
   flujo completo, que es lo que Meta necesita ver.*
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
> Email: revisor.meta@postia.ar
> Password: Postia-Meta-Review-7f2b9c
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

## Checklist para que el video no se rechace de nuevo

Meta pidió estas tres cosas EXPLÍCITAMENTE — el guion de arriba ya las cubre,
pero al grabar de nuevo verificá cada una en cámara, sin cortes:

- [ ] **Revocaste el acceso desde ADENTRO de Instagram** (no solo desde
      Postia) antes de grabar — si no, Instagram muestra la pantalla corta de
      "¿seguís compartiendo?" en vez del flujo completo. Esto causó el
      rechazo #2.
- [ ] **Se ve el flujo de login de Meta completo**: el diálogo de OAuth de
      Instagram tiene que quedar en pantalla el tiempo suficiente para leerse,
      no un flash de medio segundo. Si dice "Anteriormente conectaste..." en
      vez de listar permisos, algo del paso anterior falló — no sigas grabando,
      revisá primero.
- [ ] **Se ve al usuario dando el consentimiento**: el click en "Autorizar"
      (o como se llame el botón) tiene que ser visible, no cortado antes o
      después.
- [ ] **Se ve la experiencia de punta a punta**, sin saltos de edición:
      conectar → aprobar → publicar → el post en vivo en instagram.com/capta.arg.
- [ ] Grabación en una sola toma si es posible; si hay que cortar, que no sea
      justo en esos tres momentos.
- [ ] Ídioma de interfaz en inglés si se puede (opcional pero recomendado).

## Pendientes antes de reenviar

- [ ] Grabar el video nuevo siguiendo el guion + checklist de arriba
- [ ] Subir el mismo video en los dos permisos (ya hay un borrador iniciado
      en Meta con ambos agregados — entrar por Revisión > Revisión de la
      aplicación > Sin enviar)
- [ ] Completar "Tratamiento de datos" del formulario (requiere criterio del
      operador sobre qué datos maneja la app)
- [ ] Confirmar el texto de "Instrucciones para revisores" tenga el email y
      contraseña correctos (arriba)
- [ ] Enviar a revisión
