// Official QHOOKS badge and impostor guard (lead, launch night 2026-11-07).
// OFFICIAL is empty until the launch-day release fills it, so everything here is a no-op until then.
// - The configured token gets "Official QHOOKS ✓" and is pinned first when someone searches for qhooks.
// - Any other token whose name or symbol reads as QHOOKS (case-insensitive, lookalike letters, spacing and
//   accents ignored) gets a red "Not official" mark and, on its own page, a banner before Buy. Buying stays possible.
export const OFFICIAL = [{chainId: '4663', token: '0x20429af7ca3b0ce4d99edbaa0693f26c5df05195', symbol: 'QHOOKS', logo: 'https://qhooks.com/token-logos/qhooks-256.png'}];
// Local tests only: ?official=<chainId>:<address>:<SYMBOL> on localhost.
try {
  const loc = globalThis.location;
  if (loc && ['localhost', '127.0.0.1', '[::1]'].includes(loc.hostname)) {
    const m = /^(\w+):(0x[0-9a-fA-F]{40}):([A-Za-z0-9]{1,16})$/.exec(new URLSearchParams(loc.search).get('official') || '');
    if (m && !OFFICIAL.length) OFFICIAL.push({chainId: m[1], token: m[2].toLowerCase(), symbol: m[3].toUpperCase()});
  }
} catch {}

const LOOK = {'0': 'o', 'о': 'o', 'ο': 'o', 'օ': 'o', 'ᴏ': 'o', 'ⲟ': 'o', 'σ': 'o', 'ø': 'o', '○': 'o', '◯': 'o',
  'ѕ': 's', '5': 's', '$': 's', 'ꜱ': 's', 'ʂ': 's', 'ԛ': 'q', 'ɋ': 'q', 'ϙ': 'q', '9': 'q', 'һ': 'h', 'ℎ': 'h', 'н': 'h', 'ħ': 'h',
  'к': 'k', 'κ': 'k', 'ĸ': 'k', 'ᴋ': 'k', 'ķ': 'k', 'ⱪ': 'k'};
/** Lowercase letters only, lookalikes folded: "Q-H0OKS", "ＱＨＯＯＫＳ" and "QНООКЅ" all read "qhooks". */
export function skeleton(s) {
  return [...String(s || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()].map(c => LOOK[c] || c).join('').replace(/[^a-z]/g, '');
}
const lower = a => String(a || '').toLowerCase();
/** The official token's own logo (absolute https URL), or null. */
export function officialLogo(chainId, token) { return officialFor(chainId, token)?.logo || null; }
export function officialFor(chainId, token) {
  const t = lower(token); if (!t) return null;
  return OFFICIAL.find(o => String(o.chainId) === String(chainId) && o.token === t) || null;
}
/** The official entry this token imitates, or null (the official token itself is never an impostor). */
export function impostorOf(chainId, token, name, symbol) {
  if (!OFFICIAL.length || officialFor(chainId, token)) return null;
  const n = skeleton(name), s = skeleton(symbol);
  return OFFICIAL.find(o => { const k = skeleton(o.symbol); return k && (n.includes(k) || s.includes(k)); }) || null;
}
/** True when a search box query is looking for an official token ("qho", "QHOOKS", "$qhooks"…). */
export function queryWantsOfficial(q) {
  const k = skeleton(q); if (k.length < 3) return false;
  return OFFICIAL.some(o => { const s = skeleton(o.symbol); return s.startsWith(k) || k.includes(s); });
}
/** Stable: official rows first when the query asks for them; everything else keeps its order. */
export function pinOfficial(rows, q, chainOf = r => r.chainId, tokenOf = r => r.token) {
  if (!OFFICIAL.length || !queryWantsOfficial(q)) return rows;
  const first = [], rest = [];
  for (const r of rows) (officialFor(chainOf(r), tokenOf(r)) ? first : rest).push(r);
  return first.length ? [...first, ...rest] : rows;
}
const shortAddr = a => a.slice(0, 6) + '…' + a.slice(-4);

let styled = false;
function style(d) {
  if (styled || !d?.head) return; styled = true;
  const el = d.createElement('style'); el.id = 'qx-official-style';
  el.textContent = `.qxo-official,.qxo-fake{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:600;padding:2px 7px;border-radius:99px;white-space:nowrap;font-style:normal}
.qxo-official{color:var(--qxt-up,#1f7a46);border:1px solid color-mix(in srgb,var(--qxt-up,#1f7a46) 55%,transparent);background:color-mix(in srgb,var(--qxt-up,#1f7a46) 10%,transparent)}
.qxo-fake{color:var(--qxt-down,#b42318);border:1px solid color-mix(in srgb,var(--qxt-down,#b42318) 60%,transparent);background:color-mix(in srgb,var(--qxt-down,#b42318) 10%,transparent)}
.qxo-banner{display:grid;gap:4px;margin:0 0 10px;padding:10px 12px;border-radius:10px;border:1px solid var(--qxt-down,#b42318);background:color-mix(in srgb,var(--qxt-down,#b42318) 12%,transparent);color:var(--qx-ink,inherit);font-size:13px;line-height:1.4;overflow-wrap:anywhere;font-style:normal}
.qxo-banner b{color:var(--qxt-down,#b42318)}.qxo-banner a{color:inherit;text-decoration:underline}`;
  d.head.append(el);
}
function span(d, cls, text, title) { style(d); const e = d.createElement('span'); e.className = cls; e.textContent = text; if (title) e.title = title; return e; }
export function officialBadge(o, d = document) { return span(d, 'qxo-official', 'Official ' + o.symbol + ' ✓', 'The official ' + o.symbol + ' contract ' + o.token); }
export function notOfficialBadge(o, d = document) { return span(d, 'qxo-fake', 'Not official', 'Not the official ' + o.symbol + '. The official contract is ' + o.token); }
/** Badge for a row: official, not official, or null. */
export function rowMark(chainId, token, name, symbol, d = document) {
  const o = officialFor(chainId, token); if (o) return officialBadge(o, d);
  const f = impostorOf(chainId, token, name, symbol); return f ? notOfficialBadge(f, d) : null;
}
export function impostorBanner(o, d = document) {
  style(d);
  const box = d.createElement('div'); box.className = 'qxo-banner'; box.setAttribute('role', 'alert');
  const b = d.createElement('b'); b.textContent = 'This is not the official ' + o.symbol + '.';
  const p = d.createElement('span'); p.append('The official contract is ' + shortAddr(o.token) + '. ');
  const a = d.createElement('a'); a.href = '/terminal#t=' + o.chainId + ':' + o.token; a.textContent = 'Open the official ' + o.symbol;
  p.append(a); box.append(b, p); return box;
}
