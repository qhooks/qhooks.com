// /usage (usagemon, 2026-11-13): owner-only usage rows. The key comes from the link in the Telegram alert (#k=…, never sent
// to the server as part of the URL) and is kept on this device; the API answers 403 without it.
const STORE = 'qhooks-usage-key', ORDER = ['Alchemy', 'Cloudflare', 'Workers AI', 'Outside APIs'];
const LABEL = {ok: 'OK', warn: 'Warn', high: 'High', critical: 'Critical', info: 'Info', unknown: 'Refreshing'};
const $ = id => document.getElementById(id);
function key() {
 const m = /(?:^#|&)k=([0-9a-f]{16,64})/.exec(location.hash || '');
 if (m) { try { localStorage.setItem(STORE, m[1]); } catch {} try { history.replaceState(null, '', location.pathname); } catch {} return m[1]; }
 try { return localStorage.getItem(STORE) || ''; } catch { return ''; }
}
export function num(n, unit) {
 if (n == null || !Number.isFinite(n)) return '—';
 if (unit === 'ETH') return n.toLocaleString('en-US', {maximumFractionDigits: 8}) + ' ETH';
 if (unit === 'bytes') return (n / 1e9).toFixed(2) + ' GB';
 if (unit === '%') return n.toFixed(1) + '%';
 const a = Math.abs(n), s = a >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : a >= 1e6 ? (n / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M' : a >= 1e4 ? Math.round(n / 1e3) + 'K' : a >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(Math.round(n));
 return s + (unit && unit !== 'req' && unit !== 'rows' ? ' ' + unit : '');
}
const when = ms => ms == null ? '' : new Date(ms).toLocaleString(undefined, {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'});
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
export function rowEl(r) {
 const level = LABEL[r.level] ? r.level : 'unknown', box = el('section', 'um-row'); box.dataset.level = level;
 const head = el('div', 'um-head'); head.append(el('span', 'um-label', r.label));
 const chip = el('span', 'um-chip', LABEL[level] + (r.partial && level === 'ok' ? ' so far' : '')); chip.dataset.level = level; head.append(chip); box.append(head);
 const nums = el('p', 'um-nums');
 if (level === 'unknown' && r.used == null) nums.textContent = 'Refreshing';
 else if (r.period === 'signal') nums.textContent = (r.used == null ? '—' : r.used.toFixed(1) + '%') + ' failing · ' + num(r.calls) + ' calls last hour · alert at ' + r.cap + '%';
 else {
  const b = el('b', null, (r.partial ? '≥ ' : '') + num(r.used, r.unit)); nums.append(b); if (r.cap != null) nums.append(' of ' + num(r.cap, r.unit));
  if(r.period==='window'&&r.pct!=null)nums.append(' · '+Math.round(r.pct)+'% of clock-hour cap');
  else if (r.projected != null) nums.append(' · heading for ' + num(r.projected, r.unit) + (r.pct != null ? ' (' + Math.round(r.pct) + '%)' : ''));
  if (r.usdProjected > 0.5) nums.append(' · ~$' + (r.usdProjected >= 100 ? Math.round(r.usdProjected) : r.usdProjected.toFixed(2)));
  if(r.id==='d1.size')nums.append(Number.isFinite(r.rate)?' · Observed post-pause '+(r.rate>0?'+':'')+num(r.rate,'bytes')+'/day':' · Post-pause growth measuring');
 }
 box.append(nums);
 if (r.pct != null && Number.isFinite(r.pct)) { const bar = el('div', 'um-bar'), fill = el('span'); fill.style.width = Math.max(1, Math.min(100, r.pct)) + '%'; bar.append(fill); box.append(bar); }
 const notes = [r.hitsCapAt ? 'Cap around ' + when(r.hitsCapAt) + '.' : '', r.note || '', r.source ? 'Source: ' + r.source + '.' : ''].filter(Boolean).join(' ');
 if (notes) box.append(el('p', 'um-note', notes));
 if (r.action && ['warn', 'high', 'critical'].includes(level)) box.append(el('p', 'um-do', 'Do: ' + r.action));
 return box;
}
export function render(root, data, now = Date.now()) {
 root.replaceChildren();
 const groups = new Map(); for (const r of data.rows || []) { if (!groups.has(r.group)) groups.set(r.group, []); groups.get(r.group).push(r); }
 const rank = {critical: 0, high: 1, warn: 2, unknown: 3, ok: 4, info: 5};
 for (const g of [...ORDER, ...[...groups.keys()].filter(k => !ORDER.includes(k))]) {
  const rows = groups.get(g); if (!rows?.length) continue;
  const sec = el('div', 'um-group'); sec.append(el('h2', null, g));
  for (const r of [...rows].sort((a, b) => (rank[a.level] ?? 3) - (rank[b.level] ?? 3))) sec.append(rowEl(r));
  root.append(sec);
 }
 const age = data.at ? Math.max(0, Math.round((now - data.at) / 60000)) : null;
 return age == null || data.stale ? 'Refreshing…' : 'Live · ' + (age < 1 ? 'just now' : age + ' min ago');
}
async function load() {
 const k = key(), root = $('um-root');
 if (!k) { root.replaceChildren(el('p', 'um-gate', 'Open this page from the link in the QHooks usage message on Telegram.')); $('um-live').textContent = ''; $('um-foot').textContent = ''; return; }
 try {
  const r = await fetch('/api/usage/status', {headers: {'x-qhooks-usage-key': k}, cache: 'no-store'});
  if (r.status === 403) { try { localStorage.removeItem(STORE); } catch {} root.replaceChildren(el('p', 'um-gate', 'This link has changed. Open the newest link from the QHooks usage message on Telegram.')); $('um-live').textContent = ''; $('um-foot').textContent = ''; return; }
  if (!r.ok) throw Error('usage_unavailable');
  const data = await r.json();
  if (!data || !Array.isArray(data.rows)) throw Error('usage_unavailable');
  if (!data.at || data.refreshing) {
   root.replaceChildren(el('p', 'um-gate', 'Waiting for the next usage check. This page updates automatically.'));
   $('um-live').textContent = 'Refreshing…'; $('um-foot').textContent = ''; return;
  }
  $('um-live').textContent = render(root, data);
  $('um-foot').textContent = data.cloudflare === 'on' ? 'Cloudflare numbers are exact (analytics).' : data.cloudflare === 'error' ? 'Cloudflare analytics is unavailable. Rows marked ≥ are lower bounds.' : 'Cloudflare rows marked ≥ are lower bounds until analytics is available.';
 } catch {
  const saved = root.children.length > 0 && !root.children[0].className.includes('um-gate');
  if (!saved) root.replaceChildren(el('p', 'um-gate', 'Usage could not be loaded. This page will try again automatically.'));
  $('um-live').textContent = saved ? 'Unavailable · showing the last saved reading' : 'Usage unavailable';
  $('um-foot').textContent = '';
 }
}
if (typeof document !== 'undefined' && document.getElementById('um-root')) {
 load();
 setInterval(() => { if (document.visibilityState === 'visible') load(); }, 300000);
 document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(); });
}
