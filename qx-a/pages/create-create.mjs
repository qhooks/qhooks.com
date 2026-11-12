// System A, /create (create lane). Presentation only: it reads what the launch modules render and dresses it.
// It never sets a field the launch reads, never calls the launch, and never changes a price, cost or check.
//  - shell mount (wallet button moves into the shell's slot);
//  - "Launched on QHooks": the latest real launches from the public launch feed (re-read each minute, new ones drop in);
//  - the chain row: buttons that drive the quick launch's own chain <select> (#qq-chain) by value + change event;
//    the Chain field in the form (#cr-chainsel) mirrors and drives the same <select>;
//  - the idea reel: each idea from qx-quick-launch.mjs gets its own diagram of what it does (create-idea-art.mjs), playing while in focus;
//  - the stage: the token page header you are making (banner, icon, name, ticker, chain, idea) mirrors the form live;
//    once your banner is in, the page is lit by it. Launched (#qq-done shown) fires one burst.
import { laneShell, watch, flash, chainIcon } from '/qx-a/pages/create-common.mjs';
import { RM, fmt, setArt, absUrl } from '/qx-a/components.mjs';
import { LAUNCH_FEED_URL, readPublicJSON } from '/qx-market-live.mjs';
import { chainById } from '/chains.mjs';
import { ideaCards } from '/qx-quick-launch-core.mjs';
import { ideaArt } from '/qx-a/pages/create-idea-art.mjs';

laneShell();
const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; if (k === 'class') n.className = v; else n.setAttribute(k, v === true ? '' : v); } n.append(...kids.filter((k) => k != null && k !== false)); return n; };

/* ---------- Launched on QHooks (real launches, public feed) ---------- */
const launchedBox = $('cr-launched'), launchedList = $('cr-launched-list');
const seen = new Set();
// The feed's own logo: a published token-profile image path, an inline image, or a qhooks.com file (served same-origin).
function logoOf(v) {
  if (typeof v !== 'string' || !v) return '';
  if (/^data:image\/(png|jpeg|webp|gif);base64,/i.test(v)) return v;
  if (/^\/api\/token-profiles\/\d+\/0x[0-9a-f]{40}\/image(\?v=\d+)?$/i.test(v)) return v;
  try { const u = new URL(v); if (u.protocol === 'https:' && u.hostname === 'qhooks.com' && !u.username) return u.pathname; } catch {}
  return '';
}
const chainName = (id) => id === 'solana' ? 'Solana' : chainById(String(id))?.name || 'Chain ' + id;
function launchRow(m, fresh) {
  const c = String(m.chainId), tok = String(m.token || '').toLowerCase(), ctl = String(m.controller || m.token || '').toLowerCase();
  const url = logoOf(m.logo);
  const img = url ? el('img', { alt: '', width: '40', height: '40', decoding: 'async', src: url }) : null;
  const letter = el('span', { class: 'cr-launched__l', 'aria-hidden': 'true' }, String(m.symbol || m.name || '?').slice(0, 1).toUpperCase());
  img?.addEventListener('error', () => { img.remove(); }, { once: true });
  const age = m.launchedAt ? fmt.age(Date.now() / 1000 - Number(m.launchedAt)) : '';
  return el('li', { class: 'cr-launched__i' + (fresh && !RM ? ' is-fresh' : ''), 'data-key': c + ':' + tok },
    el('a', { class: 'cr-launched__a', href: '/terminal#m=' + encodeURIComponent(c) + ':' + encodeURIComponent(ctl) },
      el('span', { class: 'cr-launched__coin' }, letter, img),
      el('span', { class: 'cr-launched__t' }, el('b', {}, String(m.symbol || m.name || 'Token')), el('small', {}, [chainName(c), age && age + ' ago'].filter(Boolean).join(' · ')))));
}
async function readLaunched() {
  let body = null;
  try { body = await readPublicJSON(LAUNCH_FEED_URL); } catch { return; }
  const rows = (Array.isArray(body?.markets) ? body.markets : []).filter((m) => m && m.token && m.live !== false && Number(m.launchedAt) > 0)
    .sort((a, b) => Number(b.launchedAt) - Number(a.launchedAt));
  const uniq = []; const keys = new Set();
  for (const m of rows) { const k = String(m.chainId) + ':' + String(m.token).toLowerCase(); if (!keys.has(k)) { keys.add(k); uniq.push(m); } }
  const top = uniq.slice(0, 6);
  if (!top.length) return;
  const first = seen.size === 0;
  launchedList.replaceChildren(...top.map((m) => { const k = String(m.chainId) + ':' + String(m.token).toLowerCase(); const fresh = !first && !seen.has(k); seen.add(k); return launchRow(m, fresh); }));
  launchedBox.hidden = false;
}
if (launchedBox) {
  void readLaunched();
  setInterval(() => { if (document.visibilityState === 'visible') void readLaunched(); }, 60000);
}

/* ---------- chain row: drives #qq-chain ---------- */
const chainsRow = $('cr-chains');
function syncChains() {
  const sel = $('qq-chain'); if (!sel || !chainsRow) return;
  const opts = [...sel.options];
  const key = opts.map((o) => o.value).join(',');
  if (chainsRow.dataset.key !== key) {
    chainsRow.dataset.key = key;
    chainsRow.replaceChildren(...opts.map((o) => {
      const src = chainIcon(o.value), b = el('button', { type: 'button', class: 'cr-chain', 'data-chain': o.value, 'aria-pressed': 'false' },
        src ? el('img', { src, alt: '', width: '22', height: '22' }) : null, el('span', {}, (o.textContent || '').split(' · ')[0]));
      b.addEventListener('click', () => { const s = $('qq-chain'); if (!s || s.disabled || s.value === o.value) return; s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); syncChains(); });
      return b;
    }));
  }
  for (const b of chainsRow.children) { const on = b.dataset.chain === sel.value; if (b.getAttribute('aria-pressed') !== String(on)) b.setAttribute('aria-pressed', String(on)); b.disabled = sel.disabled; }
  document.body.classList.toggle('cr-is-solana', sel.value === 'solana');
  syncChainField(sel);
  paintStageChain();
}
// The Chain field in the form (newcomer walk, 2026-11-12): the chain shows next to Name and Ticker, so nobody launches on
// a chain they only saw as a tab far above. Same options and same change event as the row above.
const chainField = $('cr-chainsel');
function syncChainField(sel) {
  if (!chainField) return;
  const key = [...sel.options].map((o) => o.value + '=' + o.textContent).join(',');
  if (chainField.dataset.key !== key) { chainField.dataset.key = key; chainField.replaceChildren(...[...sel.options].map((o) => el('option', { value: o.value }, (o.textContent || '').split(' · ')[0]))); }
  if (chainField.value !== sel.value) chainField.value = sel.value;
  chainField.disabled = sel.disabled;
  const ico = $('cr-chainsel-ico'), src = chainIcon(sel.value);
  if (ico) { if (src) { if (ico.getAttribute('src') !== src) ico.src = src; ico.hidden = false; } else ico.hidden = true; }
}
chainField?.addEventListener('change', () => { const s = $('qq-chain'); if (!s || s.disabled || s.value === chainField.value) return; s.value = chainField.value; s.dispatchEvent(new Event('change', { bubbles: true })); syncChains(); });

/* ---------- idea reel: one diagram per idea (create-idea-art.mjs) ---------- */
// Each idea draws what its launch does, from its own numbers (the anti-snipe window comes from the card's preset).
// It plays only while its card is on (centred on phone, hovered, spotlit or picked) and the reel is on screen.
const arts = new WeakMap();
const ideaCache = new Map();
function ideaParams(id) {
  const chain = $('qq-chain')?.value || '4663';
  for (const c of [chain, '4663']) {
    if (c === 'solana') continue;
    if (!ideaCache.has(c)) { try { ideaCache.set(c, ideaCards(c)); } catch { ideaCache.set(c, []); } }
    const card = ideaCache.get(c).find((x) => x.id === id);
    if (card) return { snipe: card.snipe };
  }
  return {};
}
let reelSeen = true;
const cards = $('qq-cards');
let centerIO = null, visIO = null, spot = null;
function setOn(card, on) {
  const art = card.querySelector('.cr-art'); if (!art) return;
  card.classList.toggle('is-on', on);
  arts.get(card)?.play(on && reelSeen && document.visibilityState === 'visible');
}
function dressCards() {
  if (!cards) return;
  const list = [...cards.querySelectorAll('.qq-card')];
  if (!centerIO && 'IntersectionObserver' in window) {
    centerIO = new IntersectionObserver((es) => { for (const e of es) e.target.classList.toggle('is-center', e.isIntersecting); refreshOn(); }, { root: cards, rootMargin: '0px -30% 0px -30%', threshold: 0.5 });
    visIO = new IntersectionObserver((es) => { for (const e of es) e.target.classList.toggle('is-vis', e.isIntersecting); }, { root: cards, threshold: 0.6 });
    // the reel itself on screen: nothing plays once it is scrolled away
    new IntersectionObserver((es) => { reelSeen = es.some((e) => e.isIntersecting); refreshOn(); }, { threshold: 0.15 }).observe(cards);
  }
  list.forEach((card, i) => {
    if (card.querySelector('.cr-art')) return;
    const id = card.dataset.card || 'plain', art = ideaArt(id, ideaParams(id), { motion: !RM });
    arts.set(card, art);
    card.style.setProperty('--i', String(i));
    card.prepend(el('span', { class: 'cr-art', 'data-motif': id, 'aria-hidden': 'true' }, art.svg));
    card.addEventListener('pointerenter', () => { card.classList.add('is-hover'); refreshOn(); });
    card.addEventListener('pointerleave', () => { card.classList.remove('is-hover'); refreshOn(); });
    card.addEventListener('focusin', refreshOn); card.addEventListener('focusout', () => requestAnimationFrame(refreshOn));
    centerIO?.observe(card); visIO?.observe(card);
  });
  markPicked();
  refreshOn();
  reelNav();
}
const narrow = matchMedia('(max-width: 1099px)');
function refreshOn() {
  if (!cards) return;
  const list = [...cards.querySelectorAll('.qq-card')];
  const hovered = list.find((c) => c.classList.contains('is-hover') || c.contains(document.activeElement));
  for (const c of list) {
    const picked = list.some((x) => x.classList.contains('cr-picked'));
    const on = hovered ? c === hovered : picked ? c.classList.contains('cr-picked') : narrow.matches ? c.classList.contains('is-center') : c === spot;
    setOn(c, on);
  }
}
function markPicked() {
  const quick = $('qq-quick'), name = ($('qq-style-name')?.textContent || '').trim().toLowerCase(), open = quick && !quick.hidden;
  for (const c of cards?.querySelectorAll('.qq-card') || []) {
    const on = !!open && !!name && c.querySelector('h3')?.textContent.trim().toLowerCase() === name;
    if (c.classList.contains('cr-picked') !== on) c.classList.toggle('cr-picked', on);
  }
}
// Desktop with nothing hovered or picked: the spotlight walks the ideas in view, one at a time.
if (!RM) setInterval(() => {
  if (narrow.matches || document.visibilityState !== 'visible' || !cards) return;
  const vis = [...cards.querySelectorAll('.qq-card.is-vis:not([hidden])')];
  if (!vis.length) return;
  spot = vis[(vis.indexOf(spot) + 1) % vis.length];
  refreshOn();
}, 3400);
/* reel arrows (desktop) */
const nav = $('cr-reel-nav');
function reelNav() {
  if (!cards || !nav) return;
  const over = cards.scrollWidth > cards.clientWidth + 4;
  nav.hidden = !over;
  $('cr-reel-prev').disabled = cards.scrollLeft < 4;
  $('cr-reel-next').disabled = cards.scrollLeft + cards.clientWidth >= cards.scrollWidth - 4;
}
if (nav) {
  const step = (dir) => { const card = cards.querySelector('.qq-card:not([hidden])'); const w = card ? card.getBoundingClientRect().width + 16 : 320; cards.scrollBy({ left: dir * w * 2, behavior: RM ? 'auto' : 'smooth' }); };
  $('cr-reel-prev').addEventListener('click', () => step(-1));
  $('cr-reel-next').addEventListener('click', () => step(1));
  cards?.addEventListener('scroll', () => requestAnimationFrame(reelNav), { passive: true });
  addEventListener('resize', reelNav);
}

/* ---------- the stage: your token page, live ---------- */
const nameIn = $('qq-name'), symIn = $('qq-symbol'), icon = $('qq-preview'), banner = $('qq-banner-preview');
const stage = $('cr-stage'), ready = $('cr-ready');
function paintNames() {
  const n = (nameIn?.value || '').trim(), s = (symIn?.value || '').trim().toUpperCase();
  const nEl = $('cr-name'), sEl = $('cr-sym');
  nEl.textContent = n || 'Token name'; nEl.classList.toggle('is-empty', !n);
  sEl.textContent = '$' + (s || 'TICKER'); sEl.classList.toggle('is-empty', !s);
}
function paintStageChain() {
  const sel = $('qq-chain'); if (!sel) return;
  const o = sel.selectedOptions?.[0], ico = $('cr-chain-ico'), src = chainIcon(sel.value);
  $('cr-chain').textContent = o ? (o.textContent || '').split(' · ')[0] : '';
  if (src) { if (ico.getAttribute('src') !== src) ico.src = src; ico.hidden = false; } else ico.hidden = true;
}
function paintIdea() {
  const t = ($('qq-style-name')?.textContent || '').trim(); $('cr-idea').textContent = t; $('cr-idea').hidden = !t;
  // the idea's rules, as they will read on the token page (copied from the module's own icons, which carry the names)
  const src = $('qq-style-blocks'), dst = $('cr-rules'); if (!src || !dst) return;
  const key = [...src.querySelectorAll('.qq-icon')].map((n) => n.getAttribute('title')).join('|');
  if (dst.dataset.key === key) return; dst.dataset.key = key;
  dst.replaceChildren(...[...src.querySelectorAll('.qq-icon')].map((n) => { const c = n.cloneNode(true); c.removeAttribute('role'); c.removeAttribute('aria-label'); return c; }));
}
let lastBanner = '';
function paintArt() {
  const hasB = !!banner && !banner.hidden && !!banner.getAttribute('src'), hasI = !!icon && !icon.hidden && !!icon.getAttribute('src');
  const was = { b: stage.classList.contains('has-banner'), i: stage.classList.contains('has-icon') };
  stage.classList.toggle('has-banner', hasB); stage.classList.toggle('has-icon', hasI);
  if (hasB && !was.b) flash(stage.querySelector('.cr-stage__banner'), 'is-lit');
  if (hasI && !was.i) flash(stage.querySelector('.cr-stage__coin'), 'is-lit');
  // the page takes its light from your banner once it is in
  const src = hasB ? banner.getAttribute('src') : '';
  if (src !== lastBanner) {
    lastBanner = src;
    if (src) { const u = src.startsWith('data:') ? src : absUrl(src); document.documentElement.style.setProperty('--qa-banner-blur', `url("${u}")`); stage.style.setProperty('--cr-art', `url("${u}")`); }
    else { setArt({ blur: '/qx-a/img/qhooks-banner-blur.jpg' }); stage.style.removeProperty('--cr-art'); }
  }
  for (const box of document.querySelectorAll('.cr-up')) box.classList.toggle('is-ready', box.dataset.up === 'image' ? hasI : hasB);
  return { hasB, hasI };
}
function paintReady() {
  const { hasB, hasI } = paintArt();
  const have = { name: !!(nameIn?.value || '').trim(), symbol: !!(symIn?.value || '').trim(), image: hasI, banner: hasB };
  let n = 0;
  for (const li of ready?.children || []) { const on = have[li.dataset.need]; if (on) n++; if (li.classList.contains('is-done') !== on) { li.classList.toggle('is-done', on); if (on) flash(li); } }
  ready?.classList.toggle('is-all', n === 4);
  stage?.classList.toggle('is-ready', n === 4);
}
const launchBtn = $('qq-launch');
function paintLaunch() {
  const can = !!launchBtn && !launchBtn.disabled && !launchBtn.hidden;
  if (launchBtn && launchBtn.classList.contains('cr-armed') !== can) { launchBtn.classList.toggle('cr-armed', can); if (can) flash(launchBtn, 'cr-ignite'); }
}
const done = $('qq-done');
let celebrated = false;
function paintDone() {
  const on = !!done && !done.hidden;
  stage?.classList.toggle('is-live', on);
  if (on && !celebrated) { celebrated = true; flash(stage, 'is-launched'); }
  if (!on) celebrated = false;
}
for (const inp of [nameIn, symIn]) inp?.addEventListener('input', () => { paintNames(); paintReady(); });
watch($('qq-quick'), () => { paintIdea(); paintReady(); paintLaunch(); paintDone(); markPicked(); refreshOn(); }, { attributes: true, attributeFilter: ['hidden', 'src', 'disabled'], subtree: true, childList: true, characterData: true });
watch($('qq-ideas'), () => { syncChains(); dressCards(); }, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'hidden'] });
document.addEventListener('change', (e) => { if (e.target?.id === 'qq-chain') syncChains(); });
document.addEventListener('visibilitychange', refreshOn);
syncChains(); dressCards(); paintNames(); paintIdea(); paintReady(); paintLaunch(); paintDone();

/* ---------- upload tiles: Sale first and token profile pickers (finish sweep, 2026-11-12) ---------- */
// The native "Choose File" controls become tiles with the picked image inside. Presentation only: each input keeps its id,
// label and change handler (visually hidden, still focusable; the whole label opens the picker). The preview is the
// module's own image (Sale first: moved into the tile) or a copy of the profile editor's preview card (token profile).
// Quick launch already has its own rows (.cx-file), and the quantum key-file input is left alone.
const PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
function dressUpload(input) {
  if (input.dataset.crTile || input.classList.contains('cx-file')) return;
  const label = input.closest('label'); if (!label) return;
  input.dataset.crTile = '1'; input.classList.add('cx-file');
  const kind = /-restore$/.test(input.id) || /json/.test(input.accept) ? 'file' : /banner/.test(input.id) ? 'banner' : 'image';
  label.classList.add('cr-tiled', 'cr-tiled--' + kind);
  if (kind === 'file') { label.insertBefore(el('span', { class: 'cr-tile cr-tile--file', 'aria-hidden': 'true' }, 'Choose file'), input); return; }
  const tile = el('span', { class: 'cr-tile cr-tile--' + kind });
  const ask = el('span', { class: 'cr-tile__ask', 'aria-hidden': 'true' }); ask.innerHTML = PLUS; ask.append(el('b', {}, kind === 'banner' ? 'Add banner' : 'Add image'));
  const own = label.querySelector('img'), pv = own || el('img', { class: 'cr-tile__mirror', alt: '', hidden: true });
  const paint = () => tile.classList.toggle('has-img', !pv.hidden && !!pv.getAttribute('src'));
  tile.append(ask, pv, el('span', { class: 'cr-tile__change', 'aria-hidden': 'true' }, 'Change'));
  label.insertBefore(tile, input);
  if (!own) {
    const src = input.closest('.qtp-editor')?.querySelector(kind === 'banner' ? '.qtp-preview-banner' : '.qtp-preview-avatar');
    const copy = () => { const s = src && !src.hidden && src.getAttribute('src'); if (s) { if (pv.getAttribute('src') !== s) pv.src = s; pv.hidden = false; } else { pv.hidden = true; pv.removeAttribute('src'); } };
    if (src) { new MutationObserver(copy).observe(src, { attributes: true, attributeFilter: ['src', 'hidden'] }); copy(); }
  }
  new MutationObserver(paint).observe(pv, { attributes: true, attributeFilter: ['src', 'hidden'] });
  paint();
}
const dressUploads = () => { for (const i of document.querySelectorAll('#qsf-root input[type=file], .qtp-editor input[type=file]')) dressUpload(i); };
watch($('main'), dressUploads, { childList: true, subtree: true });
dressUploads();
document.fonts?.ready.then(reelNav);
