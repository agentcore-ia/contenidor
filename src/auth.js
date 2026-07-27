import { createClient } from '@supabase/supabase-js';
import { AppError, assertRequiredEnv } from './errors.js';
import { supabase, getBrandForUser } from './supabase.js';

assertRequiredEnv('SUPABASE_ANON_KEY');

// Anon-key client used for password auth flows (login/refresh). The service
// role client handles admin user creation and token verification.
const anonAuth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

function sessionPayload(session, user) {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    user: { id: user.id, email: user.email }
  };
}

export async function signUp(email, password) {
  if (!email || !password) throw new AppError('Email y contrasena son requeridos', 400);
  if (String(password).length < 8) throw new AppError('La contrasena debe tener al menos 8 caracteres', 400);

  // Admin create with email pre-confirmed so no SMTP setup is needed.
  const { error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });

  if (error) {
    const exists = /already/i.test(error.message);
    throw new AppError(exists ? 'Ese email ya esta registrado' : error.message, exists ? 409 : 500, 'SIGNUP_FAILED');
  }

  return signIn(email, password);
}

export async function signIn(email, password) {
  const { data, error } = await anonAuth.auth.signInWithPassword({ email, password });

  if (error || !data?.session) {
    throw new AppError('Email o contrasena incorrectos', 401, 'INVALID_CREDENTIALS');
  }

  return sessionPayload(data.session, data.user);
}

export async function refreshSession(refreshToken) {
  if (!refreshToken) throw new AppError('refresh_token requerido', 400);

  const { data, error } = await anonAuth.auth.refreshSession({ refresh_token: refreshToken });

  if (error || !data?.session) {
    throw new AppError('Sesion expirada, inicia sesion de nuevo', 401, 'SESSION_EXPIRED');
  }

  return sessionPayload(data.session, data.user);
}

export async function authMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      throw new AppError('No autenticado', 401, 'UNAUTHENTICATED');
    }

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      throw new AppError('Sesion invalida o expirada', 401, 'UNAUTHENTICATED');
    }

    req.user = data.user;
    next();
  } catch (error) {
    res.status(error.statusCode || 401).json({
      success: false,
      error: error.message || 'No autenticado',
      code: error.code || 'UNAUTHENTICATED'
    });
  }
}

// Resolves the brand from the x-brand-id header and enforces ownership.
export async function requireBrand(req) {
  const brandId = req.headers['x-brand-id'];

  if (!brandId) {
    throw new AppError('Falta el header x-brand-id (selecciona una marca)', 400, 'BRAND_REQUIRED');
  }

  return getBrandForUser(brandId, req.user.id);
}

// --- Recuperar contrasena ----------------------------------------------------
// Supabase manda el mail y redirige a /dashboard#recuperar con un token de
// recuperacion en el fragmento. El front toma ese token y lo manda a
// resetPassword() junto con la contrasena nueva.
//
// REQUIERE SMTP configurado en Supabase. Con el SMTP por defecto los mails
// salen con un limite muy bajo y pueden no llegar a cualquier destinatario.
export async function requestPasswordReset(email, { redirectTo } = {}) {
  const clean = String(email || '').trim().toLowerCase();
  if (!clean) throw new AppError('Escribi tu email', 400, 'EMAIL_REQUIRED');

  const { error } = await anonAuth.auth.resetPasswordForEmail(clean, { redirectTo });

  // A proposito NO se distingue entre "existe" y "no existe": si respondieramos
  // distinto, cualquiera podria averiguar que mails tienen cuenta en Postia.
  if (error) console.warn(`[auth:reset] ${clean}: ${error.message}`);
  return { sent: true };
}

// Cambia la contrasena usando el access token de recuperacion que vino en el
// link del mail. Se llama al endpoint REST directo porque ese token es de un
// solo uso y no conviene meterlo en un cliente con sesion persistida.
export async function resetPassword(accessToken, password) {
  if (!accessToken) throw new AppError('Falta el token de recuperacion', 400, 'RESET_NO_TOKEN');
  if (String(password || '').length < 8) {
    throw new AppError('La contrasena debe tener al menos 8 caracteres', 400, 'WEAK_PASSWORD');
  }

  const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    method: 'PUT',
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ password })
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const expired = res.status === 401 || /expired|invalid/i.test(body?.msg || body?.error_description || '');
    throw new AppError(
      expired ? 'El link de recuperacion vencio. Pedi uno nuevo.' : (body?.msg || 'No se pudo cambiar la contrasena'),
      expired ? 401 : 400,
      'RESET_FAILED'
    );
  }

  return { email: body?.email || null };
}

// --- Borrar la cuenta --------------------------------------------------------
// Borra al usuario de Auth; las marcas y todo lo que cuelga de ellas se van por
// las foreign keys con on delete cascade. Es irreversible a proposito: es lo
// que pide la politica de eliminacion de datos que publicamos para Meta.
export async function deleteAccount(user) {
  const { data: brands } = await supabase.from('brands').select('id').eq('owner_id', user.id);

  for (const brand of brands || []) {
    const { error } = await supabase.from('brands').delete().eq('id', brand.id);
    if (error) throw new AppError(`No se pudo borrar la marca: ${error.message}`, 500, 'DELETE_BRAND_FAILED');
  }

  const { error } = await supabase.auth.admin.deleteUser(user.id);
  if (error) throw new AppError(`No se pudo borrar la cuenta: ${error.message}`, 500, 'DELETE_USER_FAILED');

  return { deleted: true, brands: brands?.length || 0 };
}
