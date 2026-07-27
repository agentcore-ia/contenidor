// Configura los mails de autenticacion de Supabase (plantillas y URLs de
// redireccion) via la Management API, para que queden versionados aca y no
// dependan de que alguien se acuerde de tocar el dashboard.
//
//   node scripts/supabase-auth-config.mjs          -> muestra el estado actual
//   node scripts/supabase-auth-config.mjs --apply  -> escribe
//
// Lo que NO hace: cambiar el remitente. El nombre "Supabase Auth" viene del
// servidor de mail propio de Supabase y solo se puede cambiar configurando un
// SMTP propio, que requiere credenciales que van cargadas a mano en el
// dashboard (Authentication > Emails > SMTP Settings).

import 'dotenv/config';

const PAT = process.env.SUPABASE_PAT;
const REF = process.env.SUPABASE_URL?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
const APP_URL = process.env.APP_PUBLIC_URL || 'https://app.postia.ar';
const LANDING_URL = process.env.LANDING_PUBLIC_URL || 'https://postia.ar';

if (!PAT || !REF) {
  console.error('Faltan SUPABASE_PAT y/o SUPABASE_URL en .env');
  process.exit(1);
}

const apply = process.argv.includes('--apply');
const endpoint = `https://api.supabase.com/v1/projects/${REF}/config/auth`;

const mail = (titulo, parrafo, boton, cierre) => `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#18181b">
  <div style="font-size:20px;font-weight:700;letter-spacing:-.02em;margin-bottom:28px">
    <span style="display:inline-block;width:24px;height:24px;line-height:24px;text-align:center;background:#ff6a00;color:#fff;border-radius:7px;font-size:14px;margin-right:8px">P</span>Postia
  </div>
  <h1 style="font-size:22px;font-weight:700;letter-spacing:-.02em;margin:0 0 12px">${titulo}</h1>
  <p style="font-size:15px;line-height:1.6;color:#3f3f46;margin:0 0 24px">${parrafo}</p>
  <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 26px;border-radius:10px">${boton}</a>
  <p style="font-size:13px;line-height:1.6;color:#71717a;margin:28px 0 0">${cierre}</p>
  <p style="font-size:12px;line-height:1.6;color:#a1a1aa;margin:24px 0 0;padding-top:20px;border-top:1px solid #e4e4e7">
    Postia · <a href="${LANDING_URL}" style="color:#a1a1aa">postia.ar</a>
  </p>
</div>`.trim();

// Las URLs se pueden cambiar siempre, en cualquier plan. Sin esto el link del
// mail lleva a donde apunte site_url — estaba en localhost:3000 (el default de
// Supabase), asi que el mail de recuperacion mandaba a una pagina que no existe.
//
// site_url apunta DIRECTO al dashboard, no a la raiz: probado contra la API,
// Supabase ignora el redirect_to que le mandamos y usa siempre site_url. Con
// la raiz, el mail caia en app.postia.ar y dependiamos de que el navegador
// conservara el fragmento con el token a traves del redirect a /dashboard.
// Apuntando aca, el link del mail cae donde tiene que caer sin intermediarios.
const urls = {
  site_url: `${APP_URL}/dashboard`,
  uri_allow_list: [
    `${APP_URL}/*`,
    `${APP_URL}/**`,
    `${LANDING_URL}/*`,
    `${LANDING_URL}/**`
  ].join(',')
};

// Las plantillas SOLO se pueden editar con plan pago o con SMTP propio: en el
// plan gratis con el mail de Supabase la API responde 400. Por eso van aparte,
// para que su rechazo no impida aplicar las URLs.
const plantillas = {
  mailer_subjects_recovery: 'Cambiá tu contraseña de Postia',
  mailer_templates_recovery_content: mail(
    'Cambiá tu contraseña',
    'Pediste volver a entrar a tu cuenta de Postia. Tocá el botón y elegí una contraseña nueva.',
    'Elegir contraseña nueva',
    'El link vence en una hora. Si no lo pediste vos, podés ignorar este mail: tu contraseña no cambia.'
  ),

  mailer_subjects_confirmation: 'Confirmá tu cuenta de Postia',
  mailer_templates_confirmation_content: mail(
    'Confirmá tu cuenta',
    'Ya casi estás. Confirmá tu mail y empezamos a armar el contenido de tu marca.',
    'Confirmar mi cuenta',
    'Si no creaste una cuenta en Postia, podés ignorar este mail.'
  ),

  mailer_subjects_email_change: 'Confirmá tu nuevo email en Postia',
  mailer_templates_email_change_content: mail(
    'Confirmá tu nuevo email',
    'Pediste cambiar el mail de tu cuenta de Postia. Confirmalo desde acá.',
    'Confirmar el cambio',
    'Si no pediste este cambio, escribinos: alguien podria estar intentando entrar a tu cuenta.'
  )
};

async function leer() {
  const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${PAT}` } });
  const body = await res.json();
  if (!res.ok) throw new Error(`GET ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

const actual = await leer();

console.log('--- estado actual ---');
console.log(`  site_url               ${actual.site_url || '(vacio)'}`);
console.log(`  uri_allow_list         ${actual.uri_allow_list || '(vacio)'}`);
console.log(`  asunto de recuperacion ${actual.mailer_subjects_recovery || '(vacio)'}`);
console.log(`  SMTP propio            ${actual.smtp_host ? actual.smtp_host : 'NO (remitente fijo: "Supabase Auth")'}`);

if (!apply) {
  console.log('\n--- se aplicaria ---');
  console.log(`  site_url               ${urls.site_url}`);
  console.log(`  uri_allow_list         ${urls.uri_allow_list}`);
  console.log(`  asunto de recuperacion ${plantillas.mailer_subjects_recovery}`);
  console.log('\n(dry run — corre con --apply para escribir)');
  process.exit(0);
}

async function patch(payload) {
  const res = await fetch(endpoint, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return { ok: res.ok, status: res.status, body: await res.json() };
}

// Las URLs primero y por separado: son las que arreglan el link roto, y no
// pueden quedar sin aplicar porque el plan gratis rechace las plantillas.
const urlsRes = await patch(urls);
if (!urlsRes.ok) {
  console.error(`\nNo se pudieron aplicar las URLs (${urlsRes.status}):`, JSON.stringify(urlsRes.body).slice(0, 300));
  process.exit(1);
}
console.log('\n✓ URLs aplicadas');

const tplRes = await patch(plantillas);
if (tplRes.ok) {
  console.log('✓ Plantillas en castellano aplicadas');
} else {
  console.log(`\n⚠ Las plantillas NO se aplicaron (${tplRes.status}): ${tplRes.body?.message || ''}`);
  console.log('  Los mails siguen en ingles y con el remitente "Supabase Auth".');
  console.log('  Se arregla con un SMTP propio (Authentication > Emails > SMTP Settings).');
  console.log('  Con el SMTP puesto, volve a correr este script y las plantillas entran.');
}

const despues = await leer();
console.log('\n--- estado final ---');
console.log(`  site_url               ${despues.site_url}`);
console.log(`  uri_allow_list         ${despues.uri_allow_list}`);
console.log(`  asunto de recuperacion ${despues.mailer_subjects_recovery}`);
