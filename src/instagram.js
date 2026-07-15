import crypto from 'node:crypto';
import { AppError } from './errors.js';

// Instagram API with Instagram Login (business login) — publishes photo posts
// on behalf of a connected Instagram professional account. No Facebook Page
// required. Docs: developers.facebook.com/docs/instagram-platform
//
// Required env:
//   INSTAGRAM_APP_ID       Instagram app id (Instagram > API setup with login)
//   INSTAGRAM_APP_SECRET   Instagram app secret
//   INSTAGRAM_REDIRECT_URI OAuth redirect, must match the value registered in
//                          Meta exactly (defaults to the prod callback below).

const GRAPH = 'https://graph.instagram.com/v21.0';
const AUTH_BASE = 'https://www.instagram.com/oauth/authorize';
const TOKEN_URL = 'https://api.instagram.com/oauth/access_token';
const SCOPES = 'instagram_business_basic,instagram_business_content_publish';

const DEFAULT_REDIRECT = 'https://app.postia.ar/oauth/instagram/callback';

function appId() {
  return process.env.INSTAGRAM_APP_ID || '';
}

function appSecret() {
  return process.env.INSTAGRAM_APP_SECRET || '';
}

export function redirectUri() {
  return process.env.INSTAGRAM_REDIRECT_URI || DEFAULT_REDIRECT;
}

export function instagramConfigured() {
  return Boolean(appId() && appSecret());
}

function assertConfigured() {
  if (!instagramConfigured()) {
    throw new AppError(
      'Instagram no esta configurado. Falta INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET en el servidor.',
      503,
      'IG_NOT_CONFIGURED'
    );
  }
}

// --- Signed OAuth state (CSRF-safe, carries the brand/user to attach) --------

function stateSecret() {
  return appSecret() || process.env.SUPABASE_SERVICE_ROLE_KEY || 'contenidor-ig-state';
}

export function signState(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', stateSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyState(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) throw new AppError('State invalido', 400, 'IG_BAD_STATE');
  const expected = crypto.createHmac('sha256', stateSecret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new AppError('State invalido', 400, 'IG_BAD_STATE');
  }
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (!payload.exp || payload.exp < Date.now()) throw new AppError('State expirado, reintenta', 400, 'IG_STATE_EXPIRED');
  return payload;
}

// --- OAuth ------------------------------------------------------------------

export function buildAuthUrl({ brandId, userId }) {
  assertConfigured();
  const state = signState({ brandId, userId, exp: Date.now() + 10 * 60 * 1000 });
  const params = new URLSearchParams({
    client_id: appId(),
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: SCOPES,
    state
  });
  return `${AUTH_BASE}?${params.toString()}`;
}

async function exchangeCodeForToken(code) {
  const body = new URLSearchParams({
    client_id: appId(),
    client_secret: appSecret(),
    grant_type: 'authorization_code',
    redirect_uri: redirectUri(),
    code
  });
  const res = await fetch(TOKEN_URL, { method: 'POST', body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new AppError(`No se pudo obtener el token corto: ${json.error_message || json.error || res.status}`, 502, 'IG_TOKEN_FAILED');
  }
  // Short-lived token comes back with the Instagram-scoped user id.
  return { token: json.access_token, userId: String(json.user_id) };
}

async function exchangeForLongLivedToken(shortToken) {
  const params = new URLSearchParams({
    grant_type: 'ig_exchange_token',
    client_secret: appSecret(),
    access_token: shortToken
  });
  const res = await fetch(`${GRAPH}/access_token?${params.toString()}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new AppError(`No se pudo obtener el token largo: ${json.error?.message || res.status}`, 502, 'IG_TOKEN_FAILED');
  }
  return { token: json.access_token, expiresInSeconds: Number(json.expires_in) || 60 * 24 * 3600 };
}

export async function refreshLongLivedToken(longToken) {
  // ig_refresh_token only needs the token itself, not the app secret.
  const params = new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: longToken });
  const res = await fetch(`${GRAPH}/refresh_access_token?${params.toString()}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new AppError(`No se pudo refrescar el token: ${json.error?.message || res.status}`, 502, 'IG_TOKEN_FAILED');
  }
  return { token: json.access_token, expiresInSeconds: Number(json.expires_in) || 60 * 24 * 3600 };
}

async function fetchProfile(igUserId, token) {
  const params = new URLSearchParams({ fields: 'user_id,username', access_token: token });
  const res = await fetch(`${GRAPH}/${igUserId}?${params.toString()}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AppError(`No se pudo leer el perfil de Instagram: ${json.error?.message || res.status}`, 502, 'IG_PROFILE_FAILED');
  }
  return { igUserId: String(json.user_id || igUserId), username: json.username || null };
}

// Resolves the connected account straight from a token (via /me), so a token
// generated manually in the Meta dashboard can be used without the OAuth flow.
async function fetchMe(token) {
  const params = new URLSearchParams({ fields: 'user_id,username', access_token: token });
  const res = await fetch(`${GRAPH}/me?${params.toString()}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.user_id) {
    throw new AppError(`El token no es valido: ${json.error?.message || res.status}`, 400, 'IG_BAD_TOKEN');
  }
  return { igUserId: String(json.user_id), username: json.username || null };
}

// Connects a brand using a long-lived token pasted by the user (from the Meta
// dashboard "Generar identificador"). Validates it against /me and assumes the
// standard 60-day lifetime; the scheduler refreshes it before it expires.
export async function connectWithToken(token) {
  const clean = String(token || '').trim();
  if (!clean) throw new AppError('Pega el token de acceso', 400, 'IG_NO_TOKEN');
  const me = await fetchMe(clean);
  return {
    ig_user_id: me.igUserId,
    ig_username: me.username,
    ig_access_token: clean,
    ig_token_expires_at: new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString(),
    ig_connected_at: new Date().toISOString()
  };
}

// Full connect handshake: code -> long-lived token + profile. Returns the
// values to persist on the brand.
export async function connectFromCode(code) {
  assertConfigured();
  const short = await exchangeCodeForToken(code);
  const long = await exchangeForLongLivedToken(short.token);
  const profile = await fetchProfile(short.userId, long.token);
  return {
    ig_user_id: profile.igUserId,
    ig_username: profile.username,
    ig_access_token: long.token,
    ig_token_expires_at: new Date(Date.now() + long.expiresInSeconds * 1000).toISOString(),
    ig_connected_at: new Date().toISOString()
  };
}

// --- Publishing (2-step: create container, then publish) --------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function createMediaContainer({ igUserId, token, imageUrl, caption }) {
  const body = new URLSearchParams({ image_url: imageUrl, access_token: token });
  if (caption) body.set('caption', caption);
  const res = await fetch(`${GRAPH}/${igUserId}/media`, { method: 'POST', body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.id) {
    throw new AppError(`Instagram rechazo la imagen: ${json.error?.message || res.status}`, 502, 'IG_PUBLISH_FAILED');
  }
  return json.id;
}

async function waitForContainerReady({ creationId, token, attempts = 6 }) {
  for (let i = 0; i < attempts; i += 1) {
    const params = new URLSearchParams({ fields: 'status_code', access_token: token });
    const res = await fetch(`${GRAPH}/${creationId}?${params.toString()}`);
    const json = await res.json().catch(() => ({}));
    const status = json.status_code;
    if (status === 'FINISHED') return;
    if (status === 'ERROR' || status === 'EXPIRED') {
      throw new AppError(`El contenedor de Instagram fallo (${status})`, 502, 'IG_PUBLISH_FAILED');
    }
    await sleep(2000);
  }
  // Images are usually ready immediately; if still not FINISHED, try publishing
  // anyway — media_publish will surface a definitive error if it isn't.
}

async function publishMediaContainer({ igUserId, token, creationId }) {
  const body = new URLSearchParams({ creation_id: creationId, access_token: token });
  const res = await fetch(`${GRAPH}/${igUserId}/media_publish`, { method: 'POST', body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.id) {
    throw new AppError(`No se pudo publicar en Instagram: ${json.error?.message || res.status}`, 502, 'IG_PUBLISH_FAILED');
  }
  return json.id;
}

// Publishes a single image + caption to the brand's connected account.
// Returns the published Instagram media id.
export async function publishToInstagram({ brand, imageUrl, caption }) {
  if (!brand?.ig_user_id || !brand?.ig_access_token) {
    throw new AppError('Esta marca no tiene Instagram conectado', 400, 'IG_NOT_CONNECTED');
  }
  if (!imageUrl) throw new AppError('El post no tiene imagen para publicar', 400, 'IG_NO_IMAGE');

  const igUserId = brand.ig_user_id;
  const token = brand.ig_access_token;
  const creationId = await createMediaContainer({ igUserId, token, imageUrl, caption });
  await waitForContainerReady({ creationId, token });
  return publishMediaContainer({ igUserId, token, creationId });
}
