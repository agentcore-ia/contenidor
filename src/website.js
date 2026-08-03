// Lee la web de la marca para darle contexto real al motor de ideas.
//
// SEGURIDAD (lo importante de este archivo): la URL la escribe el usuario y la
// descarga NUESTRO servidor. Sin control, alguien pone http://169.254.169.254/
// (metadatos de la nube) o una IP de la red interna de Easypanel y usa a Postia
// de proxy para leer cosas que desde afuera no se ven. Eso es SSRF.
//
// Por eso: solo http/https, se resuelve el nombre a IP y se rechaza todo lo que
// sea privado/loopback/link-local, y los redirects se siguen a mano revalidando
// CADA salto (si no, el atacante publica una URL publica que redirige a
// 127.0.0.1 y el chequeo inicial no sirve de nada).

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { AppError } from './errors.js';

const MAX_BYTES = 500_000;      // por pagina
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const MAX_PAGES = 4;            // home + 3 internas

// Rangos que nunca pueden ser el destino: si la web de un cliente resuelve aca,
// o esta mal configurada o nos estan atacando. En los dos casos, no se descarga.
export function isPrivateIp(ip) {
  if (isIP(ip) === 6) {
    const v6 = ip.toLowerCase();
    if (v6 === '::1' || v6 === '::') return true;
    if (v6.startsWith('fe80')) return true;            // link-local
    if (/^f[cd]/.test(v6)) return true;                // unique-local
    // IPv4 mapeada (::ffff:127.0.0.1): se valida la parte v4.
    const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return false;
  }

  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  if (p[0] === 10 || p[0] === 127 || p[0] === 0) return true;
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
  if (p[0] === 192 && p[1] === 168) return true;
  if (p[0] === 169 && p[1] === 254) return true;       // metadatos de la nube
  if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;  // CGNAT
  if (p[0] >= 224) return true;                        // multicast / reservado
  return false;
}

export function normalizeUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;

  // Si trae un esquema explicito y no es http(s), se rechaza ACA. Antes se le
  // pegaba "https://" adelante igual ("https://file:///etc/passwd") y quedaba
  // bloqueado de rebote, con un mensaje que no explicaba nada.
  const scheme = raw.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if (scheme && !['http', 'https'].includes(scheme)) {
    throw new AppError('Solo se pueden analizar direcciones http o https.', 400, 'BAD_URL');
  }

  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  let url;
  try {
    url = new URL(withScheme);
  } catch {
    throw new AppError('Esa direccion no parece una web valida.', 400, 'BAD_URL');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new AppError('Solo se pueden analizar direcciones http o https.', 400, 'BAD_URL');
  }
  if (!url.hostname.includes('.')) {
    throw new AppError('Falta el dominio completo (por ejemplo: minegocio.com.ar).', 400, 'BAD_URL');
  }

  url.hash = '';
  return url.toString();
}

async function assertPublicHost(url) {
  const { hostname } = new URL(url);

  // Si ya es una IP literal, se valida directo (no hay DNS que resolver).
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new AppError('Esa direccion apunta a una red interna.', 400, 'BLOCKED_URL');
    }
    return;
  }

  let resolved;
  try {
    resolved = await lookup(hostname, { all: true });
  } catch {
    throw new AppError('No se pudo encontrar ese dominio.', 400, 'DNS_FAIL');
  }

  if (!resolved.length || resolved.some((entry) => isPrivateIp(entry.address))) {
    throw new AppError('Esa direccion apunta a una red interna.', 400, 'BLOCKED_URL');
  }
}

// Sigue los redirects a mano para revalidar el host en cada salto.
async function safeFetch(startUrl) {
  let url = startUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await assertPublicHost(url);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response;
    try {
      response = await fetch(url, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': 'PostiaBot/1.0 (+https://postia.ar)', Accept: 'text/html,*/*' }
      });
    } catch {
      throw new AppError('No se pudo abrir esa web (no responde o tarda demasiado).', 400, 'FETCH_FAIL');
    } finally {
      clearTimeout(timer);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new AppError('La web redirige a un lugar invalido.', 400, 'FETCH_FAIL');
      url = new URL(location, url).toString();
      continue;
    }

    if (!response.ok) {
      throw new AppError(`La web respondio ${response.status}.`, 400, 'FETCH_FAIL');
    }

    const type = response.headers.get('content-type') || '';
    if (!type.includes('html') && !type.includes('text')) {
      throw new AppError('Esa direccion no devuelve una pagina web.', 400, 'NOT_HTML');
    }

    // Se corta a mano en MAX_BYTES: confiar en content-length deja pasar
    // respuestas sin ese header o que mienten.
    const reader = response.body?.getReader();
    if (!reader) return { url, html: await response.text() };

    const chunks = [];
    let total = 0;
    while (total < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
    reader.cancel().catch(() => {});
    return { url, html: new TextDecoder('utf-8').decode(Buffer.concat(chunks.map(Buffer.from))) };
  }

  throw new AppError('La web tiene demasiados redirects.', 400, 'FETCH_FAIL');
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', Ntilde: 'Ñ' };

function decode(text) {
  return text.replace(/&(#?\w+);/g, (match, code) => ENTITIES[code] ?? match);
}

export function extractText(html) {
  const title = decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim());
  const metaDescription = decode(
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] || ''
  );

  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6])[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  const text = decode(body)
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim();

  return { title, metaDescription, text };
}

// Links internos que suelen tener la sustancia (que vende, precios, quienes son).
const INTERESTING = /(nosotros|about|quienes|servicio|service|producto|product|precio|price|plan|menu|carta|tienda|shop|contacto|contact)/i;

export function pickInternalLinks(html, baseUrl, max = MAX_PAGES - 1) {
  const base = new URL(baseUrl);
  const found = new Map();

  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const [, href, label] = match;
    if (/^(mailto:|tel:|javascript:|#)/i.test(href)) continue;

    let target;
    try {
      target = new URL(href, baseUrl);
    } catch {
      continue;
    }
    if (target.hostname !== base.hostname) continue;

    target.hash = '';
    const key = target.toString();
    if (key === baseUrl || found.has(key)) continue;
    if (!INTERESTING.test(target.pathname) && !INTERESTING.test(label)) continue;

    found.set(key, true);
    if (found.size >= max) break;
  }

  return [...found.keys()];
}

// Devuelve el texto de la web listo para mandarle al modelo.
export async function readWebsite(rawUrl) {
  const url = normalizeUrl(rawUrl);
  if (!url) throw new AppError('Falta la direccion de la web.', 400, 'BAD_URL');

  const home = await safeFetch(url);
  const first = extractText(home.html);
  const pages = [{ url: home.url, ...first }];

  for (const link of pickInternalLinks(home.html, home.url)) {
    try {
      const page = await safeFetch(link);
      const parsed = extractText(page.html);
      if (parsed.text.length > 120) pages.push({ url: page.url, ...parsed });
    } catch {
      // Una interna que falla no invalida el analisis: seguimos con lo que hay.
    }
  }

  const combined = pages
    .map((page) => `--- ${page.url}\n${page.title}\n${page.metaDescription}\n${page.text}`)
    .join('\n\n')
    .slice(0, 24_000);   // techo de tokens para el analisis

  if (combined.replace(/\s/g, '').length < 200) {
    throw new AppError('Esa web casi no tiene texto para analizar.', 400, 'EMPTY_SITE');
  }

  return { url: home.url, pages: pages.map((page) => page.url), title: pages[0].title, text: combined };
}
