// Community lane (System A): the shared pieces of community, board, profile, creator and call pages.
// Presentation only. Every read and write goes through the endpoints and modules the site already runs:
// /api/community/* (boards, reactions), /api/community/post/<id>/thanks (via qx-community-thanks.mjs),
// the one follow store (qx-community-follow.mjs), member profiles (qx-member-profile.mjs) and the market index
// (/api/terminal/feed). Nothing here invents a number: a field that is missing is simply not drawn.
import { mountShell } from '/qx-a/shell.mjs';
import { h, icon, RM, fmt, avatar, xBadge, restart, toast } from '/qx-a/components.mjs';
import { createMemberProfileClient } from '/qx-member-profile.mjs';
import { profileUrl } from '/qx-profile-address.mjs';
import { callLinks, communityKey } from '/qx-community-intent.mjs';
import { mountBoardCallThanks } from '/qx-community-thanks.mjs';
import { boardSession, authHeaders, signIn } from '/qx-board-session.mjs';
import { getWalletHub } from '/wallet-hub.mjs';

export { h, icon, RM, fmt };
export const QHOOKS_ART = { banner: '/qx-a/img/qhooks-banner.jpg', blur: '/qx-a/img/qhooks-banner-blur.jpg', icon: '/qx-a/img/qhooks-icon.jpg' };
const hub = (() => { try { return getWalletHub(window); } catch { return null; } })();
export const viewer = () => hub?.snapshot?.().current?.owner?.toLowerCase() || null;
export const openWallet = () => { try { hub?.open(); } catch {} };
export const onWallet = (fn) => { try { return hub?.subscribe(fn) || (() => {}); } catch { return () => {}; } };

/* ---------- shell: the page's own wallet control moves into the shell's wallet slot ---------- */
export function laneShell({ active = 'community', mode = 'app', title = '', back = '/community', ribbon = false, overArt = false } = {}) {
  const trig = document.getElementById('qhc-trigger');
  if (trig) trig.classList.add('qa-btn', 'qa-btn--primary', 'qa-wallet__btn');
  const shell = mountShell({ active, mode, title, back, ribbon, overArt, logo: '/qhooks-logo.jpg', wallet: trig || document.createTextNode(''), links: { portfolio: '/me' } });
  if (trig) {
    const paint = () => { const on = /^0x|…/i.test(trig.textContent.trim()) && !/connect/i.test(trig.textContent); trig.classList.toggle('qa-btn--primary', !on); trig.classList.toggle('qa-btn--secondary', on); };
    new MutationObserver(paint).observe(trig, { childList: true, characterData: true, subtree: true }); paint();
  }
  // Legacy page buttons that open the wallet ([data-qa-connect]) keep working through the same hub.
  addEventListener('qa:wallet', openWallet);
  return shell;
}

/* ---------- same-origin art: qhooks.com URLs are served by this origin ---------- */
export function sameOrigin(u) {
  if (!u) return '';
  try { const url = new URL(u, location.href); if (url.origin === 'https://qhooks.com' || url.origin === location.origin) return url.pathname + url.search; if (url.protocol === 'https:') return url.href; } catch {}
  return '';
}

/* ---------- people: name, picture, verified X handle (public profile read, cached per page) ---------- */
const profiles = createMemberProfileClient();
const people = new Map();
export function person(wallet) {
  const w = String(wallet || '').toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(w)) return Promise.resolve({ wallet: w });
  if (!people.has(w)) people.set(w, profiles.read(w).then((v) => ({
    wallet: w, name: v.profile?.name || '', bio: v.profile?.bio || '', image: v.profile?.image || '', handle: v.handle || null,
    x: (v.accounts || []).find((a) => a.kind === 'x' && a.verified !== false)?.handle || null, accounts: v.accounts || [], links: v.profile?.links || [],
  })).catch(() => ({ wallet: w })));
  return people.get(w);
}
// An avatar that starts as the wallet's gradient and becomes the person's picture once their profile answers.
export function face(wallet, size = 'lg', { link = true } = {}) {
  const ava = avatar(wallet, size);
  const el = link ? h('a', { class: 'cx-face', href: profileUrl({ wallet }), 'aria-label': 'Profile of ' + fmt.short(wallet) }, ava) : ava;
  person(wallet).then((p) => {
    if (p.image) { const img = new Image(); img.onload = () => ava.style.setProperty('background-image', `url("${p.image}")`); img.src = p.image; }
    if (link && (p.handle || p.name)) { el.href = profileUrl({ wallet, handle: p.handle }); el.setAttribute('aria-label', 'Profile of ' + (p.name || p.handle)); }
  });
  return el;
}
// A name that starts as the short wallet and becomes the profile name (with the verified X badge).
export function nameTag(wallet, { link = true, cls = 'qa-post__name', badge = true } = {}) {
  const name = h(link ? 'a' : 'span', { class: cls, href: link ? profileUrl({ wallet }) : null, title: wallet }, fmt.short(wallet));
  const wrap = h('span', { class: 'cx-who' }, name);
  person(wallet).then((p) => {
    if (p.name) name.textContent = p.name;
    if (link && p.handle) name.href = profileUrl({ wallet, handle: p.handle });
    if (badge && p.x) wrap.append(xBadge('@' + p.x));
  });
  return wrap;
}

/* ---------- token art and live prices from the market index ---------- */
let feedP = null, feedAt = 0;
const marketListeners = new Set();
let markets = new Map();
export function readMarkets(force = false) {
  if (!force && feedP && Date.now() - feedAt < 15000) return feedP;
  feedAt = Date.now();
  feedP = fetch('/api/terminal/feed?chain=all', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => {
    const next = new Map();
    for (const m of j?.markets || []) {
      const row = { symbol: m.symbol, name: m.name, chainId: String(m.chainId), token: String(m.token || '').toLowerCase(), controller: String(m.controller || '').toLowerCase(),
        logo: sameOrigin(m.logo || m.launchImage || m.profileImage), banner: sameOrigin(m.profileBanner || ''), quote: m.quoteSymbol, s: m.summary || {} };
      next.set(row.chainId + ':' + row.token, row); next.set(row.chainId + ':' + row.controller, row);
    }
    const prev = markets; markets = next;
    for (const fn of marketListeners) try { fn(next, prev); } catch {}
    return next;
  }).catch(() => markets);
  return feedP;
}
export const onMarkets = (fn) => { marketListeners.add(fn); return () => marketListeners.delete(fn); };
export function marketFor(board) {
  if (!board) return null;
  const c = String(board.chainId);
  return markets.get(c + ':' + String(board.address || board.token || '').toLowerCase()) || markets.get(c + ':' + String(board.controller || '').toLowerCase()) || null;
}
// The price a call is measured in: USD calls follow the index's USD price, quote calls follow the pool price.
export function livePrice(board, quoteSymbol) {
  const m = marketFor(board); if (!m) return null;
  if (!quoteSymbol || quoteSymbol === 'USD') return m.s.priceUsd > 0 ? m.s.priceUsd : null;
  return quoteSymbol === m.quote && m.s.price > 0 ? m.s.price : null;
}
export function tokenArt(board, logo) {
  const m = marketFor(board);
  const isQ = String(board?.symbol || m?.symbol || '').toUpperCase() === 'QHOOKS';
  return { logo: sameOrigin(logo) || m?.logo || (isQ ? QHOOKS_ART.icon : ''), banner: m?.banner || (isQ ? QHOOKS_ART.banner : ''), blur: isQ ? QHOOKS_ART.blur : '' };
}
export function tokenMark(board, logo, size = 20) {
  const sym = String(board?.symbol || '?');
  const el = h('i', { class: 'cx-tok', 'aria-hidden': 'true' }, sym.replace(/^\$/, '').slice(0, 1));
  const src = tokenArt(board, logo).logo;
  if (src) { const img = new Image(); img.onload = () => { el.textContent = ''; el.style.setProperty('background-image', `url("${src}")`); }; img.src = src; }
  if (size !== 20) el.style.setProperty('--s', size + 'px');
  return el;
}

/* ---------- price and move text ---------- */
export function priceIn(p, unit) {
  if (!(p > 0)) return '—';
  if (!unit || unit === 'USD') return fmt.price(p);
  return fmt.price(p).replace(/^\$/, '') + ' ' + unit;
}
// The same price as nodes: the quote unit is set small so long quote prices fit a phone.
export function priceNode(p, unit) {
  if (!(p > 0) || !unit || unit === 'USD') return priceIn(p, unit);
  return [fmt.price(p).replace(/^\$/, ''), h('small', { class: 'cx-unit' }, unit)];
}
export function moveOf(entry, now) { return entry > 0 && now > 0 ? now / entry : NaN; }
export function moveText(m) { if (!Number.isFinite(m)) return '—'; return m >= 2 ? fmt.mult(m) : fmt.pct(m - 1); }
const dec = (u, d) => { try { const n = Number(BigInt(String(u || '0'))) / 10 ** (Number(d) || 0); return Number.isFinite(n) ? n : NaN; } catch { return NaN; } };

/* ---------- the call outcome: Called -> Now, the move, and the timed checkpoints ---------- */
export function outcome(c, { live } = {}) {
  const entry = Number(c?.price), unit = c?.quoteSymbol || c?.quote || 'USD';
  if (!(entry > 0)) return null;
  const nowB = h('b'), x = h('b'), xl = h('span', null, 'since the call');
  const el = h('div', { class: 'qa-outcome cx-outcome' },
    h('div', { class: 'qa-outcome__col' }, h('span', null, 'Called at'), h('b', null, priceNode(entry, unit))),
    h('div', { class: 'qa-outcome__col' }, h('span', null, 'Now'), nowB),
    h('div', { class: 'qa-outcome__x' }, x, xl));
  let last = null;
  el.update = (now, { flash = false } = {}) => {
    if (!(now > 0)) { nowB.textContent = 'Refreshing'; x.textContent = ''; return; }
    const m = moveOf(entry, now);
    nowB.replaceChildren(...[priceNode(now, unit)].flat()); x.textContent = moveText(m); x.className = m >= 1 ? 'qa-up' : 'qa-down';
    if (flash && last != null && now !== last) { flashOnce(nowB); flashOnce(x); }
    last = now;
  };
  el.update(Number(live ?? c.priceNow));
  el.move = () => moveOf(entry, Number(live ?? c.priceNow));
  return el;
}
// One quiet line: 1h, 24h and 7d checkpoints as they were recorded (pending ones say so).
export function checkpoints(c) {
  const entry = Number(c?.price); if (!(entry > 0)) return null;
  const cp = c.scoreV2?.checkpoints || {};
  const part = (label, p, status) => {
    if (p > 0) { const m = p / entry; return h('span', null, label + ' ', h('b', { class: m >= 1 ? 'qa-up' : 'qa-down' }, fmt.pct(m - 1))); }
    return status === 'pending' ? h('span', null, label + ' ', h('b', { class: 'qa-muted' }, 'scoring')) : null;
  };
  const kids = [part('1h', Number(c.price1h)), part('24h', Number(c.price24h ?? (cp.day?.status === 'observed' ? cp.day.price : null)), cp.day?.status), part('7d', Number(c.price7d ?? (cp.week?.status === 'observed' ? cp.week.price : null)), cp.week?.status)].filter(Boolean);
  return kids.length ? h('p', { class: 'cx-checks' }, kids) : null;
}

/* ---------- the caller's own position, read from the chain. Drawn only when the record is complete. ---------- */
export function positionOf(pos) {
  if (!pos || pos.complete !== true || pos.source !== 'chain') return null;
  const d = pos.atCall?.decimals, at = dec(pos.atCall?.units, d), now = dec(pos.now?.units, d), sold = dec(pos.soldSinceCall?.units, d);
  if (!Number.isFinite(at) || !Number.isFinite(now)) return null;
  return { held: !!pos.heldAtCall, at, now, sold: Number.isFinite(sold) ? sold : 0, soldPct: Number(pos.soldSinceCall?.pctOfAtCall), atUsd: Number(pos.atCall?.usd), nowUsd: Number(pos.now?.usd), firstBuyAt: Number(pos.firstBuyAt), vs: pos.firstBuyVsCall };
}
export function positionBars(pos, callAt) {
  const p = positionOf(pos); if (!p) return null;
  const scale = Math.max(p.at, p.now, p.sold, 1) * 1.04;
  const bar = (cls, v) => { const s = h('span', { class: cls }); s.style.setProperty('width', (Math.max(0, v / scale) * 100).toFixed(2) + '%'); return s; };
  const usd = (v) => (Number.isFinite(v) ? h('small', null, fmt.usd(v)) : null);
  const rows = h('div', { class: 'qa-posbars' },
    h('div', { class: 'qa-cb' }, h('span', { class: 'qa-cb__l' }, 'At the call'), h('span', { class: 'qa-cb__track' }, bar('qa-cb__held', p.at)), h('span', { class: 'qa-cb__v' }, fmt.tok(p.at), usd(p.atUsd))),
    h('div', { class: 'qa-cb' }, h('span', { class: 'qa-cb__l' }, 'Holds now'), h('span', { class: 'qa-cb__track' }, p.now > 0 ? bar('qa-cb__now', p.now) : h('span', { class: 'qa-cb__zero' })), h('span', { class: 'qa-cb__v' }, fmt.tok(p.now), usd(p.nowUsd))),
    h('div', { class: 'qa-cb' }, h('span', { class: 'qa-cb__l' }, 'Sold since'), h('span', { class: 'qa-cb__track' }, p.sold > 0 ? bar('qa-cb__out', p.sold) : h('span')), h('span', { class: 'qa-cb__v' }, fmt.tok(p.sold))));
  const when = Number.isFinite(p.firstBuyAt) && p.firstBuyAt > 0 && callAt ? ' First bought ' + span(Math.abs(callAt - p.firstBuyAt)) + (p.vs === 'before' ? ' before calling.' : p.vs === 'after' ? ' after calling.' : '.') : '';
  const note = !p.held ? h('p', { class: 'qa-note' }, 'Did not hold it at the call.' + when)
    : p.now <= 0 && p.sold > 0 ? h('p', { class: 'qa-note qa-note--warn' }, 'Sold ' + (Number.isFinite(p.soldPct) ? Math.round(p.soldPct) + '%' : 'all') + ' since the call.' + when)
    : p.sold > 0 ? h('p', { class: 'qa-note qa-note--warn' }, 'Sold ' + fmt.tok(p.sold) + ' since the call, still holds ' + fmt.tok(p.now) + '.' + when)
    : h('p', { class: 'qa-note qa-note--good' }, (p.now > p.at ? 'Added ' + fmt.tok(p.now - p.at) + ' since the call. ' : 'Still holding. ') + 'Sold none.' + when);
  return h('div', { class: 'cx-pos', 'aria-label': 'The caller’s own position, read from the chain' }, h('p', { class: 'cx-pos__t' }, 'Their own position, read from the chain'), rows, note);
}
// A value that changed glows gold, then fades back over 1.1 s (the class comes off two frames later so the fade runs).
export function flashOnce(el) { if (!el || RM) return; el.classList.add('cx-tick'); requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('cx-tick'))); }
export const span = (ms) => { const s = ms / 1000; return s < 3600 ? Math.max(1, Math.round(s / 60)) + ' min' : s < 86400 ? Math.round(s / 3600) + ' h' : Math.round(s / 86400) + ' days'; };
export function holdingTag(pos) {
  const p = positionOf(pos); if (!p) return null;
  if (!p.held) return h('span', { class: 'qa-tag' }, 'Not holding at the call');
  return p.sold > 0 ? h('span', { class: 'qa-tag qa-tag--warn' }, 'Sold ' + (Number.isFinite(p.soldPct) ? Math.round(p.soldPct) + '%' : 'some') + ' since') : h('span', { class: 'qa-tag qa-tag--new' }, 'Still holding');
}

/* ---------- reactions on a board post (Agree, Insight, Doubt) through /api/community/post/<id>/react ---------- */
const REACT = [['up', 'up', 'Agree'], ['insight', 'star', 'Insight'], ['doubt', null, 'Doubt']];
const boards = new Map();
export function boardApiPath(b) { return b.kind === 'token' ? '/api/community/token/' + b.chainId + '/' + b.address : '/api/community/board/' + b.chainId + '/' + b.controller; }
// One read per board: id -> { reactions, mine, replies, badges }.
export function boardPosts(b, { force = false } = {}) {
  let key; try { key = communityKey(b); } catch { return Promise.resolve(new Map()); }
  if (force || !boards.has(key)) boards.set(key, fetch(boardApiPath(b) + '?order=latest', { cache: 'no-store', headers: authHeaders() }).then((r) => (r.ok ? r.json() : null)).then((j) => {
    const map = new Map(); for (const p of [...(j?.pinned || []), ...(j?.posts || [])]) map.set(p.id, p); map.board = j?.board || null; return map;
  }).catch(() => new Map()));
  return boards.get(key);
}
async function ensureSignedIn(status) {
  if (boardSession()) return true;
  if (!viewer()) { openWallet(); status('Connect a wallet to react. Reading stays open.'); return false; }
  status('Sign in with one free message. No funds move.');
  await signIn(); status(''); return !!boardSession();
}
export function reactRow(post, { replies = 0, replyHref, call, links, buyLabel } = {}) {
  const status = h('p', { class: 'cx-react-status', role: 'status', 'aria-live': 'polite' });
  const row = h('div', { class: 'qa-reacts cx-reacts' });
  let state = { reactions: post?.reactions || {}, mine: post?.mine || [] };
  const btns = REACT.map(([k, ic, label]) => {
    const n = h('span'); const b = h('button', { class: 'qa-react cx-react', type: 'button', 'aria-pressed': 'false', 'aria-label': label, title: label, dataset: { react: k } }, ic ? icon(ic) : h('span', { class: 'cx-q', 'aria-hidden': 'true' }, '?'), n);
    b.paint = () => { const on = state.mine.includes(k), c = state.reactions?.[k] || 0; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); n.textContent = c ? String(c) : ''; };
    b.addEventListener('click', async () => {
      if (!post?.id) return; const on = !state.mine.includes(k); b.disabled = true;
      try {
        if (!(await ensureSignedIn((t) => (status.textContent = t)))) return;
        const r = await fetch('/api/community/post/' + post.id + '/react', { method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json', ...authHeaders() }, body: JSON.stringify({ reaction: k, on }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw Error(j.error === 'sign_in' ? 'Sign in again to react.' : j.error === 'slow_down' ? 'Slow down a little and try again.' : 'That didn’t save. Try again.');
        state = { reactions: j.reactions || state.reactions, mine: j.mine || state.mine }; btns.forEach((x) => x.paint()); if (on && !RM) restart(b, 'is-pop');
      } catch (e) { status.textContent = e.message || 'That didn’t save. Try again.'; } finally { b.disabled = false; }
    });
    b.paint(); return b;
  });
  row.append(...btns);
  if (replyHref) row.append(h('a', { class: 'qa-react', href: replyHref, 'aria-label': 'Reply on the board' }, icon('reply'), h('span', null, replies ? String(replies) : '')));
  if (links?.permalink) {
    const share = h('button', { class: 'qa-react', type: 'button', 'aria-label': 'Copy call link' }, icon('share'));
    share.addEventListener('click', async () => { try { await navigator.clipboard.writeText(links.permalink); toast({ kind: 'call', title: 'Copied', body: 'Call link ready to share' }); } catch { status.replaceChildren('Copy this call link: ', h('a', { href: links.permalink }, links.permalink)); } });
    row.append(share);
  }
  if (call && post?.id && post.author) { const t = h('span', { class: 'cx-thanks' }); row.append(t); void mountBoardCallThanks(t, { id: post.id, author: post.author }); }
  if (links?.trade && buyLabel) row.append(h('a', { class: 'qa-react qa-react--buy', href: links.trade, title: 'Trades through this link credit the caller as referrer where eligible.' }, buyLabel));
  row.setReactions = (p) => { if (!p) return; state = { reactions: p.reactions || {}, mine: p.mine || [] }; btns.forEach((x) => x.paint()); };
  return h('div', { class: 'cx-actions' }, row, status);
}

/* ---------- a call, drawn as a post: face, name, X badge, time, "called $X", thesis, outcome, position ---------- */
export function callPost(c, { enter = false, onBoard = false, showToken = true } = {}) {
  const b = c.board || {}; let links = null; try { links = callLinks(b, c); } catch {}
  const k = c.call || {}, sym = b.symbol ? '$' + b.symbol : 'this token';
  const age = h('time', { datetime: new Date(c.createdAt).toISOString(), title: new Date(c.createdAt).toLocaleString() }, fmt.age((Date.now() - c.createdAt) / 1000));
  age.dataset.ts = c.createdAt;
  const what = showToken ? h('span', { class: 'qa-post__what' }, 'called ', h('a', { class: 'qa-token-chip cx-chip', href: links?.path || '#' }, tokenMark(b, b.logo), sym), labelsOf(k)) : h('span', { class: 'qa-post__what' }, 'called it', labelsOf(k));
  const text = h('p', { class: 'qa-post__text' }, c.text || '');
  const live = livePrice(b, k.quoteSymbol);
  const out = outcome(k, { live });
  const media = [out, checkpoints(k), positionBars(c.position, k.at || c.createdAt)].filter(Boolean);
  const actions = reactRow(c, { call: true, links, replyHref: links?.board || links?.path, buyLabel: b.symbol ? 'Buy ' + sym : 'Buy on this call' });
  const body = h('div', { class: 'qa-post__body' },
    h('div', { class: 'qa-post__head' }, nameTag(c.author), age, holdingTag(c.position), what),
    c.folded ? folded(c, text) : text,
    media.length ? h('a', { class: 'qa-post__media cx-media', href: '/call/' + c.id, 'aria-label': 'Open the call record' }, media) : null,
    actions);
  const el = h('article', { class: 'qa-post cx-post' + (enter && !RM ? ' is-enter' : ''), id: (onBoard ? 'cxp-' : 'call-') + c.id, dataset: { id: c.id } }, face(c.author, 'lg'), body);
  el.outcome = out; el.actions = actions; el.call = c;
  el.refresh = (flash) => { const p = livePrice(b, k.quoteSymbol); if (p && out) out.update(p, { flash }); };
  return el;
}
function labelsOf(k) {
  const L = new Set(k?.labels || []);
  return [L.has('creator_call') ? h('span', { class: 'qa-tag' }, 'Creator’s call') : null, L.has('linked') ? h('span', { class: 'qa-tag' }, 'Linked to creator') : null];
}
function folded(c, text) {
  text.hidden = true;
  const b = h('button', { type: 'button', class: 'qa-btn qa-btn--quiet', 'aria-expanded': 'false' }, c.folded === 'reports' ? 'Reported call · show' : 'New wallet · show thesis');
  b.addEventListener('click', () => { text.hidden = !text.hidden; b.setAttribute('aria-expanded', String(!text.hidden)); });
  return h('div', null, b, text);
}
// Fill a set of call posts with their board's reaction and reply counts (one read per board).
export async function hydrateReactions(posts) {
  const byBoard = new Map();
  for (const el of posts) { if (!el.call) continue; let key; try { key = communityKey(el.call.board); } catch { continue; } if (!byBoard.has(key)) byBoard.set(key, { board: el.call.board, els: [] }); byBoard.get(key).els.push(el); }
  await Promise.all([...byBoard.values()].map(async ({ board, els }) => {
    const map = await boardPosts(board);
    for (const el of els) { const p = map.get(el.call.id); if (!p) continue; el.actions.querySelector('.cx-reacts')?.setReactions?.(p); const r = el.actions.querySelector('a[aria-label="Reply on the board"] span'); if (r) r.textContent = p.replies?.length ? String(p.replies.length) : ''; }
  }));
}
// Keep relative ages fresh ("3m" becomes "4m").
export function tickAges(root = document) { const run = () => root.querySelectorAll('time[data-ts]').forEach((t) => { t.textContent = fmt.age((Date.now() - +t.dataset.ts) / 1000); }); run(); return setInterval(run, 15000); }
// Poll only while the page is visible.
export function visiblePoll(fn, ms) {
  let t = null, dead = false;
  const run = async () => { if (dead) return; if (!document.hidden) { try { await fn(); } catch {} } t = setTimeout(run, ms); };
  const wake = () => { if (!document.hidden && !dead) { clearTimeout(t); run(); } };
  document.addEventListener('visibilitychange', wake); t = setTimeout(run, ms);
  return () => { dead = true; clearTimeout(t); document.removeEventListener('visibilitychange', wake); };
}
