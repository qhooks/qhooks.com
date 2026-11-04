import {normalizeRequest, dataObject} from './rules.mjs';
export const STUDIO_URL = 'https://qhooks.com/qtoken-studio.html';
export const MAX_TOKEN_LENGTH = 2048;
export const MAX_TTL = 86400;
const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', {fatal:true});
const ensure = (v,m) => { if (!v) throw new TypeError(m); };
export function encode64(bytes) { return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,''); }
export function decode64(text) {
  ensure(typeof text === 'string' && text.length > 0 && text.length <= MAX_TOKEN_LENGTH && /^[A-Za-z0-9_-]+$/.test(text), 'Invalid launch encoding');
  const bytes = Uint8Array.from(atob(text.replaceAll('-','+').replaceAll('_','/')), c => c.charCodeAt(0));
  ensure(encode64(bytes) === text, 'Noncanonical launch encoding'); return bytes;
}
export function envelope(request, {kid, now, ttl = 3600} = {}) {
  ensure(typeof kid === 'string' && /^[a-zA-Z0-9_-]{1,24}$/.test(kid), 'Signing key ID required');
  ensure(Number.isSafeInteger(now) && now >= 0 && Number.isInteger(ttl) && ttl > 0 && ttl <= MAX_TTL, 'Link expiry must be 1–86400 seconds');
  ensure(Number.isSafeInteger(now + ttl), 'Invalid expiry');
  return {v:1, aud:STUDIO_URL, kid, iat:now, exp:now + ttl, request:normalizeRequest(request)};
}
export function signedBytes(body) { return encoder.encode('qhooks-launch-link:v1.' + body); }
export function bodyFor(value) { return encode64(encoder.encode(JSON.stringify(value))); }
export function linkFor(token) { ensure(token.length <= MAX_TOKEN_LENGTH, 'Launch link is too long; shorten the image URL or name'); return STUDIO_URL + '#launch=' + token; }
export function tokenFromLink(link) {
  ensure(typeof link === 'string' && link.length <= STUDIO_URL.length + MAX_TOKEN_LENGTH + 8, 'Invalid launch link');
  const u = new URL(link);
  ensure(u.origin + u.pathname === STUDIO_URL && u.search === '' && u.username === '' && u.password === '' && /^#launch=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(u.hash), 'Use the signed QHooks Studio link without query settings');
  return u.hash.slice(8);
}
export async function verifyToken(token, {publicKeys, now = Math.floor(Date.now()/1000), subtle = globalThis.crypto?.subtle} = {}) {
  ensure(subtle && typeof token === 'string' && token.length <= MAX_TOKEN_LENGTH, 'Signed launch link unavailable');
  const parts = token.split('.'); ensure(parts.length === 2, 'Invalid signed launch link');
  const [body, sigText] = parts, sig = decode64(sigText); ensure(sig.length === 64, 'Invalid launch signature');
  const raw = JSON.parse(decoder.decode(decode64(body)));
  const e = dataObject(raw, ['v','aud','kid','iat','exp','request'], ['v','aud','kid','iat','exp','request']);
  ensure(e.v === 1 && e.aud === STUDIO_URL && typeof e.kid === 'string' && /^[a-zA-Z0-9_-]{1,24}$/.test(e.kid), 'Unsupported launch link');
  ensure(Number.isSafeInteger(now) && now >= 0 && Number.isSafeInteger(e.iat) && e.iat >= 0 && Number.isSafeInteger(e.exp) && e.exp > e.iat && e.exp - e.iat <= MAX_TTL, 'Invalid launch lifetime');
  ensure(now >= e.iat && now < e.exp, 'Launch link has expired or is not yet valid; request a fresh link');
  ensure(publicKeys && Object.hasOwn(publicKeys,e.kid), 'Unknown launch signing key');
  const keyBytes = decode64(publicKeys[e.kid]); ensure(keyBytes.length === 32, 'Invalid launch public key');
  const key = await subtle.importKey('raw',keyBytes,{name:'Ed25519'},false,['verify']);
  ensure(await subtle.verify('Ed25519',key,sig,signedBytes(body)), 'Launch signature did not verify');
  const request = normalizeRequest(e.request);
  ensure(bodyFor({v:1,aud:STUDIO_URL,kid:e.kid,iat:e.iat,exp:e.exp,request}) === body, 'Noncanonical launch payload');
  return Object.freeze({...e, request});
}
