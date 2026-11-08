// Public token identity shared by the launch editor and its publication API.
export const PROFILE_LIMITS = Object.freeze({description: 1000, image: 220000, banner: 440000, body: 700000});
const fail = message => { throw new TypeError(message); };
export function socialURL(value, kind) {
  const raw = String(value || '').trim(); if (!raw) return '';
  const entered = kind === 'x' && /^@?[a-zA-Z0-9_]{1,15}$/.test(raw) ? 'https://x.com/' + raw.replace(/^@/, '') : raw;
  let u; try { u = new URL(entered.includes('://') ? entered : 'https://' + entered); } catch { return fail('Enter a valid ' + kind + ' link.'); }
  if (u.protocol !== 'https:' || u.username || u.password || u.port || u.hostname === 'localhost' || !u.hostname.includes('.') || /^[\d.]+$/.test(u.hostname) || u.hostname.includes(':')) return fail('Use a public HTTPS ' + kind + ' link.');
  const host = u.hostname.replace(/^www\./, '');
  if (kind === 'x' && (!['x.com', 'twitter.com'].includes(host) || !/^\/[a-zA-Z0-9_]{1,15}\/?$/.test(u.pathname))) return fail('Use your X profile link or @handle.');
  if (kind === 'telegram' && !['t.me', 'telegram.me'].includes(host)) return fail('Use a t.me Telegram link.');
  if (kind === 'discord' && !['discord.gg', 'discord.com'].includes(host)) return fail('Use a discord.gg or discord.com invite.');
  if (kind !== 'website' && u.pathname === '/') return fail('Enter the full ' + kind + ' profile or invite link.');
  return u.href;
}
export function profileImage(value, kind = 'image') {
  if (!value) return '';
  if (typeof value !== 'string' || value.length > PROFILE_LIMITS[kind]) return fail(kind === 'banner' ? 'Choose a smaller banner.' : 'Choose a smaller profile picture.');
  const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!m) return fail('Choose a PNG, JPEG or WebP image.');
  let b; try { b = atob(m[2]); } catch { return fail('The image could not be read.'); }
  const valid = m[1] === 'png' ? b.startsWith('\x89PNG\r\n\x1a\n') : m[1] === 'jpeg' ? b.charCodeAt(0) === 255 && b.charCodeAt(1) === 216 && b.charCodeAt(2) === 255 : b.startsWith('RIFF') && b.slice(8, 12) === 'WEBP';
  if (!valid) return fail('The image format does not match its file.');
  return value;
}
export function normalizeTokenProfile(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('The token profile could not be read.');
  const description = typeof value.description === 'string' ? value.description.trim() : '';
  if (description.length > PROFILE_LIMITS.description) return fail('Keep the description to 1,000 characters.');
  const links = {};
  for (const kind of ['website', 'x', 'discord', 'telegram']) links[kind] = socialURL(value.links?.[kind], kind);
  return {version: 1, description, image: profileImage(value.image, 'image'), banner: profileImage(value.banner, 'banner'), links};
}
export const hasTokenProfile = value => !!(value.description || value.image || value.banner || Object.values(value.links || {}).some(Boolean));
export function poolFromShareLink(link) {
  const u = new URL(link, 'https://qhooks.com');
  if (!u.hash.startsWith('#pool=') || u.hash.includes('&') || u.hash.length > 60000) return fail('Finish launching before publishing the token profile.');
  let pool; try { pool = JSON.parse(decodeURIComponent(u.hash.slice(6))); } catch { return fail('The public pool link could not be read.'); }
  if (!/^\d+$/.test(String(pool.chainId)) || !/^0x[0-9a-fA-F]{40}$/.test(pool.controller || '')) return fail('The public pool link is incomplete.');
  return pool;
}
