// Builder row on Robinhood Chain token pages: HEY Research's Partner Card, in HEY's own words, via /api/builder/4663/<token>.
// Not a rating or a buy signal. Null counts read "Not measured". Quiet (hidden) when HEY is busy or down.
const A40 = /^0x[0-9a-f]{40}$/, memo = new Map(), TTL = 60000;
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) el.setAttribute(k, v === true ? '' : String(v));
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k);
  return el;
}
const out = (href, label) => h('a', {href, target: '_blank', rel: 'noopener'}, label);
const day = v => v ? new Date(v).toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'}) : null;
// The ship's date, unless its title already names that day (HEY titles changelog ships by date: "November 10, 2026").
export function dateUnlessNamed(title, iso) {
  const at = day(iso); if (!at || !title) return at;
  const d = new Date(iso), t = String(title).toLowerCase();
  const names = [at, d.toISOString().slice(0, 10), d.toLocaleDateString('en-US', {month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC'})];
  return names.some(n => t.includes(n.toLowerCase())) ? null : at;
}
function load(token) {
  const hit = memo.get(token);
  if (hit && Date.now() - hit.at < TTL) return hit.promise;
  const promise = fetch('/api/builder/4663/' + token, {headers: {accept: 'application/json'}})
    .then(async r => r.status === 200 || r.status === 404 ? r.json() : null).catch(() => null);
  memo.set(token, {at: Date.now(), promise});
  return promise;
}
const shell = (...kids) => h('details', {class: 'qxt-builder', 'aria-label': 'Builder records from HEY Research', open: !matchMedia('(max-width:760px)').matches}, ...kids);
export function renderBuilder(d) {
  if (!d || typeof d !== 'object') return null;
  const credit = h('p', {class: 'qxt-builder-fine'}, (d.disclaimer ? d.disclaimer + ' ' : '') + 'Builder records by HEY Research.');
  if (d.found === false) return shell(
    h('summary', {class: 'qxt-builder-head'}, h('span', {}, 'Builder'), h('b', {}, 'Not on HEY yet'), d.scanUrl ? out(d.scanUrl, 'Look up on HEY ↗') : null),
    d.message ? h('p', {class: 'qxt-builder-note'}, d.message) : null);
  if (!d.appliesToToken) return shell(
    h('summary', {class: 'qxt-builder-head'}, h('span', {}, 'Builder'), h('b', {}, 'Project names another contract')),
    h('p', {class: 'qxt-builder-note'}, 'The project HEY tracks names a different contract, so its activity is not shown for this token.'), credit);
  const ship = d.latestShip, at = dateUnlessNamed(ship?.title, ship?.at);
  const shipCell = ship && (ship.title || at)
    ? [ship.title || 'Ship', at ? ' · ' + at : '', ship.evidence ? ' · ' : '', ship.evidence ? out(ship.evidence, 'Evidence ↗') : null]
    : ['Not measured'];
  return shell(
    h('summary', {class: 'qxt-builder-head'}, h('span', {}, 'Builder'), h('b', {title: d.statusHelp || ''}, d.statusLabel || 'Not measured'),
      d.verifiedBuilder ? h('span', {class: 'qxt-builder-tag'}, 'Verified Builder') : null,
      d.projectLink ? out(d.projectLink, 'Research on HEY ↗') : null),
    h('dl', {},
      h('div', {}, h('dt', {}, 'Latest ship'), h('dd', {}, ...shipCell)),
      h('div', {}, h('dt', {}, 'Ships, 30 days'), h('dd', {}, Number.isSafeInteger(d.ships30d) ? String(d.ships30d) : 'Not measured')),
      d.verification === 'VERIFIED' ? h('div', {}, h('dt', {}, 'Contract'), h('dd', {}, 'Project names this contract')) : null),
    d.statusHelp ? h('p', {class: 'qxt-builder-note'}, d.statusHelp) : null,
    credit);
}
// Keeps `el` showing the card for the selected token; one read per token per minute, stale answers dropped.
export function syncBuilder(el, {chainId, token} = {}) {
  if (!el) return;
  const t = String(token || '').toLowerCase(), want = String(chainId) === '4663' && A40.test(t) ? t : '';
  if (el.dataset.token === want) return;
  el.dataset.token = want; el.replaceChildren(); el.hidden = true;
  if (!want) return;
  load(want).then(d => {
    if (el.dataset.token !== want) return;
    const view = renderBuilder(d);
    if (view) { el.replaceChildren(view); el.hidden = false; }
  });
}
