import { AppError } from './errors.js';

const ACTOR = 'apify~instagram-profile-scraper';

export function parseInstagramHandle(input) {
  const raw = String(input || '').trim();
  const match = raw.match(/instagram\.com\/([A-Za-z0-9._]+)/) || raw.match(/^@?([A-Za-z0-9._]+)$/);
  const handle = match?.[1]?.replace(/\/+$/, '');

  if (!handle || handle.length < 2) {
    throw new AppError('Link o usuario de Instagram invalido', 400, 'INVALID_IG_HANDLE');
  }

  return handle.toLowerCase();
}

// Scrapes a public Instagram profile via Apify. Returns null (instead of
// throwing) when no token is configured, so onboarding can degrade to a
// questions-only flow.
export async function scrapeInstagramProfile(handle) {
  const token = process.env.APIFY_TOKEN;

  if (!token) {
    console.warn('[apify] APIFY_TOKEN no configurado: onboarding sin datos de Instagram');
    return null;
  }

  const url = `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${token}&timeout=180`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180000);

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: [handle] }),
      signal: controller.signal
    });
  } catch (error) {
    throw new AppError(`No se pudo analizar el perfil de Instagram: ${error.message}`, 502, 'APIFY_FAILED');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    throw new AppError(`Apify devolvio ${res.status}: ${body}`, 502, 'APIFY_FAILED');
  }

  const items = await res.json();
  const profile = Array.isArray(items) ? items.find((item) => item?.username) || items[0] : null;

  if (!profile) {
    throw new AppError('No se encontro el perfil de Instagram (es publico?)', 404, 'IG_PROFILE_NOT_FOUND');
  }

  const posts = (profile.latestPosts || profile.posts || [])
    .filter((post) => post && (post.displayUrl || post.imageUrl))
    .map((post) => ({
      caption: String(post.caption || '').slice(0, 500),
      image_url: post.displayUrl || post.imageUrl,
      likes: post.likesCount ?? post.likes ?? 0,
      type: post.type || 'Image'
    }));

  return {
    username: profile.username || handle,
    full_name: profile.fullName || '',
    biography: profile.biography || '',
    followers: profile.followersCount ?? null,
    posts_count: profile.postsCount ?? null,
    profile_pic: profile.profilePicUrlHD || profile.profilePicUrl || null,
    posts
  };
}
