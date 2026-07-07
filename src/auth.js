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
