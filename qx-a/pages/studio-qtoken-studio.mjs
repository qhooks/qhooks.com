// Expert Studio on System A. The launch scripts (journey, workspace, blocks, token profile, pair, team step, fee) own
// every field and step; this module only reads what they render and draws it:
//  - the step rail: progress line and done marks follow the step the journey selects (aria-current);
//  - a live preview of the token and pool being built: the person's own banner and image, name, ticker, chain, supply,
//    starting cap, LP fee, graduation mode, and the launch blocks clipped onto the pool's hook line as they are turned on;
//  - the page light follows the banner the person adds (System A: the token's art is the room);
//  - on phone, a bottom bar with the token so far and a Preview button that opens the same preview as a sheet.
// Every movement here is caused by the person's own edit (typing, an upload, a block turned on or off, a step change).
import { bootStudio, QHOOKS_ART, frameBatch } from '/qx-a/pages/studio-common.mjs';
import { h, icon, RM, restart, setArt, openSheet, closeSheet } from '/qx-a/components.mjs';

const $ = (id) => document.getElementById(id);
const shell = bootStudio({ active: 'launch', mode: 'detail', title: 'Expert Studio', back: '/create' });
document.body.classList.add('qst-has-dock');

/* ---------- step rail ---------- */
const nav = document.querySelector('.qj-nav');
const stepBtns = [0, 1, 2, 3].map((i) => $('qj-step-' + i)).filter(Boolean);
const stepVals = stepBtns.map((b) => { const v = h('span', { class: 'qst-rail__v', 'aria-hidden': 'true' }); b.append(v); return v; });
const stepBar = h('span', { class: 'qst-rail__bar', 'aria-hidden': 'true' }, h('i'));
nav?.prepend(stepBar);
let lastStep = -1;
function paintRail() {
  const cur = Math.max(0, stepBtns.findIndex((b) => b.getAttribute('aria-current') === 'step'));
  stepBtns.forEach((b, i) => { b.classList.toggle('is-done', i < cur); b.classList.toggle('is-on', i === cur); });
  nav?.style.setProperty('--qst-step', String(cur));
  nav?.style.setProperty('--qst-steps', String(stepBtns.length));
  if (cur !== lastStep) {
    lastStep = cur;
    document.body.dataset.qstStep = String(cur);
    // keep the current step in view on the phone strip (scrolls the strip only, never the page)
    const b = stepBtns[cur];
    if (nav && b && innerWidth < 1100) {
      const left = b.offsetLeft - (nav.clientWidth - b.offsetWidth) / 2;
      nav.scrollTo({ left: Math.max(0, cur === 0 ? 0 : left), behavior: RM ? 'auto' : 'smooth' });
    }
  }
}
new MutationObserver(paintRail).observe(nav || document.body, { subtree: true, attributes: true, attributeFilter: ['aria-current'] });
paintRail();

// the name and ticker are typed big, so an empty field says what goes there
for (const [id, ph] of [['ql-name', 'Name your token'], ['ql-symbol', 'TICKER']]) { const i = $(id); if (i && !i.placeholder) i.placeholder = ph; }

/* ---------- live preview ---------- */
const aside = document.querySelector('.qtd-summary');
const art = h('img', { class: 'qst-card__img', alt: '', hidden: true });
const artPh = h('span', { class: 'qst-card__ph' }, icon('image'), h('span', null, 'Banner · 3:1'));
const coinImg = h('img', { class: 'qst-coin__img', alt: '', hidden: true });
const coinLetter = h('span', { class: 'qst-coin__letter' }, 'Q');
const coinPulse = h('span', { class: 'qa-coin__pulse', 'aria-hidden': 'true' });
const coin = h('span', { class: 'qa-coin qa-coin--md qst-coin' }, coinLetter, coinImg, h('span', { class: 'qa-coin__ring', 'aria-hidden': 'true' }), coinPulse);
const nameEl = h('b', { class: 'qst-card__name' }, 'Your token');
const tickEl = h('span', { class: 'qst-card__tick' }, '$TICKER');
const chainIco = h('img', { class: 'qst-chain-ico', alt: '', width: 16, height: 16 });
const chainEl = h('span', null, chainIco, h('span', { class: 'qst-chain-name' }, 'Base'));
const supplyEl = h('span');
const live = h('span', { class: 'qa-live qst-pv__live' }, h('span', { class: 'qa-live__dot' }), h('b', null, 'Live preview'));
const pairEl = h('span', { class: 'qst-pool__pair' });
const fig = (label) => { const b = h('b'); return { b, el: h('div', null, b, h('span', null, label)) }; };
const fStart = fig('Starts at'), fFee = fig('Creator LP fee'), fMode = fig('Graduation');
const hookCount = h('span', { class: 'qst-hooks__n' }, '0');
const hookList = h('ol', { class: 'qst-hooks__list' });
const hookEmpty = h('p', { class: 'qst-hooks__empty' }, 'No blocks: a plain protected pool.');
const payBuy = fig('A buy pays'), paySell = fig('A sell pays');
const pv = h('section', { class: 'qst-pv', 'aria-label': 'Live preview of your token and pool' },
  h('div', { class: 'qst-pv__top' }, live),
  h('div', { class: 'qst-card' },
    h('div', { class: 'qst-card__art' }, art, artPh, h('span', { class: 'qst-card__sheen', 'aria-hidden': 'true' })),
    h('div', { class: 'qst-card__id' }, coin, h('div', { class: 'qst-card__names' }, nameEl, tickEl)),
    h('p', { class: 'qa-meta qst-card__meta' }, chainEl, supplyEl)),
  h('div', { class: 'qst-pool' },
    h('div', { class: 'qst-pool__head' }, h('span', { class: 'qst-pool__k' }, 'Pool'), pairEl),
    h('div', { class: 'qa-figures qst-figs' }, fStart.el, fFee.el, fMode.el)),
  h('div', { class: 'qst-hooks' },
    h('div', { class: 'qst-hooks__head' }, h('span', { class: 'qst-pool__k' }, 'Launch blocks'), hookCount),
    h('div', { class: 'qst-hooks__line' }, hookList, hookEmpty)),
  h('div', { class: 'qa-figures qst-pays' }, payBuy.el, paySell.el));
aside?.prepend(pv);

const val = (id) => ($(id)?.value || '').trim();
const optText = (id) => { const s = $(id); return s?.selectedOptions?.[0]?.textContent?.trim() || ''; };
const txt = (el) => (el?.textContent || '').trim();
// a changed value lights gold and fades back (the class comes off a beat later so the colour transitions out)
const tick = (el) => { el.classList.add('is-tick'); clearTimeout(el._qstTick); el._qstTick = setTimeout(() => el.classList.remove('is-tick'), 140); };
const setText = (el, t, flash = true) => { if (el.textContent === t) return false; el.textContent = t; if (flash && !RM && ready) tick(el); return true; };
let ready = false;

function readBlocks() {
  return [...document.querySelectorAll('#qx-blocks .qxb-card.on')].map((c) => ({
    id: c.dataset.block, name: txt(c.querySelector('h4')), group: txt(c.closest('.qxb-group')?.querySelector('h3')),
  })).filter((b) => b.id && b.name);
}
let shown = new Map();
function paintHooks() {
  const list = readBlocks(), next = new Set(list.map((b) => b.id));
  for (const [id, li] of shown) if (!next.has(id)) {
    shown.delete(id);
    if (RM) li.remove(); else { li.classList.add('is-out'); setTimeout(() => li.remove(), 260); }
  }
  list.forEach((b, i) => {
    let li = shown.get(b.id);
    if (!li) {
      li = h('li', { class: 'qst-hook', dataset: { block: b.id } }, h('span', { class: 'qst-hook__clip', 'aria-hidden': 'true' }), h('span', { class: 'qst-hook__t' }, b.name), h('span', { class: 'qst-hook__g' }, b.group));
      if (!RM && ready) li.classList.add('is-in');
      shown.set(b.id, li);
    }
    if (hookList.children[i] !== li) hookList.insertBefore(li, hookList.children[i] || null);
  });
  if (setText(hookCount, String(list.length))) coinPulseOnce(1);
  hookEmpty.hidden = list.length > 0;
  hookList.hidden = list.length === 0;
  stepVals[1] && (stepVals[1].textContent = list.length ? list.length + (list.length === 1 ? ' block' : ' blocks') : '');
  setText(dockBlocks, list.length ? list.length + (list.length === 1 ? ' block' : ' blocks') : 'No blocks');
}
function coinPulseOnce(dir) { if (RM || !ready) return; coinPulse.className = 'qa-coin__pulse'; void coinPulse.offsetWidth; coinPulse.classList.add(dir > 0 ? 'is-buy' : 'is-sell'); }

function mirrorImg(src, img, ph) {
  const on = !!(src && !src.hidden && src.getAttribute('src'));
  const url = on ? src.getAttribute('src') : '';
  if ((img.getAttribute('src') || '') === url && img.hidden === !on) return false;
  if (on) img.setAttribute('src', url); else img.removeAttribute('src');
  img.hidden = !on; if (ph) ph.hidden = on;
  return true;
}
let lastBanner = '';
function paintArt() {
  const pb = document.querySelector('#ql-profile .qtp-preview-banner'), pa = document.querySelector('#ql-profile .qtp-preview-avatar');
  const bannerChanged = mirrorImg(pb, art, artPh);
  const iconChanged = mirrorImg(pa, coinImg, coinLetter);
  [dockImg].forEach((d) => mirrorImg(pa, d, dockLetter));
  // the upload zones show what they hold, and light up when filled
  const zones = document.querySelectorAll('#ql-profile .qtp-upload');
  [[zones[0], pa], [zones[1], pb]].forEach(([z, src]) => {
    if (!z) return;
    const url = src && !src.hidden && src.getAttribute('src');
    const was = z.classList.contains('is-filled');
    if (url) z.style.setProperty('--qst-fill', `url("${url}")`); else z.style.removeProperty('--qst-fill');
    z.classList.toggle('is-filled', !!url);
    if (url && !was && !RM && ready) restart(z, 'is-ignite');
  });
  const b = art.hidden ? '' : art.getAttribute('src');
  if (b !== lastBanner) { lastBanner = b; setArt(b ? { banner: b, blur: b } : QHOOKS_ART); document.body.classList.toggle('qst-own-art', !!b); }
  if (bannerChanged && !art.hidden && !RM && ready) restart(art.parentElement, 'is-ignite');
  if (iconChanged && !coinImg.hidden) coinPulseOnce(1);
}

function paint() {
  const name = val('ql-name'), sym = val('ql-symbol').toUpperCase();
  setText(nameEl, name || 'Your token');
  setText(tickEl, '$' + (sym || 'TICKER'));
  coinLetter.textContent = (sym || name || 'Q').slice(0, 1).toUpperCase();
  stepVals[0] && (stepVals[0].textContent = sym ? '$' + sym : '');
  dockName.textContent = name || 'Your token'; dockTick.textContent = '$' + (sym || 'TICKER');
  const chainName = txt($('qtd-summary-chain')) || optText('ql-chain').split('·')[0].trim();
  setText(chainEl.querySelector('.qst-chain-name'), chainName, false);
  const ico = $('qtd-summary-chain-icon')?.getAttribute('src'); if (ico && chainIco.getAttribute('src') !== ico) chainIco.setAttribute('src', ico);
  dockChain.textContent = chainName;
  const supply = Number(val('ql-supply').replace(/[, _]/g, ''));
  setText(supplyEl, supply > 0 ? compact(supply) + ' supply' : 'Supply not set', false);
  const quote = (txt($('qtd-summary-quote')).split(/\s+/).pop() || '').replace(/[^A-Za-z0-9.]/g, '');
  const pairSel = $('ql-pair');
  const pairQuote = pairSel && !pairSel.closest('[hidden]') ? (pairSel.selectedOptions?.[0]?.textContent || '').split('(')[0].trim() : '';
  setText(pairEl, (sym || 'TOKEN') + ' / ' + (pairQuote || quote || 'quote'), false);
  setText(fStart.b, (optText('ql-start-tier') || '').replace(/^Standard\s*·\s*/, '') || '—');
  setText(fFee.b, (val('ql-fee') || '—') + (val('ql-fee') ? '%' : ''));
  setText(fMode.b, shortMode(optText('ql-mode')));
  const cols = document.querySelectorAll('#qx-blocks .qxb-sim .qxb-col');
  setText(payBuy.b, txt(cols[0]?.querySelector('.qxb-total b')) || '—');
  setText(paySell.b, txt(cols[1]?.querySelector('.qxb-total b')) || '—');
  paintHooks(); paintArt();
  if (ready && !RM) restart(live, 'is-hot');
}
const shortMode = (t) => ({ 'Owner-approved graduation': 'Owner-approved', 'Net quote-inflow target': 'Inflow target', 'Keep source pool': 'Stays put' }[t] || t || '—');
function compact(n) { if (n >= 1e12) return +(n / 1e12).toFixed(2) + 'T'; if (n >= 1e9) return +(n / 1e9).toFixed(2) + 'B'; if (n >= 1e6) return +(n / 1e6).toFixed(2) + 'M'; if (n >= 1e3) return +(n / 1e3).toFixed(1) + 'K'; return String(n); }

/* ---------- phone bar: the token so far + the preview sheet ---------- */
const dockImg = h('img', { alt: '', hidden: true });
const dockLetter = h('span', { class: 'qst-coin__letter' }, 'Q');
const dockName = h('b', null, 'Your token'), dockTick = h('span', null, '$TICKER'), dockChain = h('span'), dockBlocks = h('span');
const previewBtn = h('button', { class: 'qa-btn qa-btn--secondary qst-dock__btn', type: 'button', 'aria-haspopup': 'dialog' }, 'Preview');
const dock = h('div', { class: 'qst-dock', role: 'region', 'aria-label': 'Your token so far' },
  h('span', { class: 'qst-dock__coin', 'aria-hidden': 'true' }, dockLetter, dockImg),
  h('span', { class: 'qst-dock__main' }, h('span', { class: 'qst-dock__t' }, dockName, dockTick), h('span', { class: 'qa-meta qst-dock__s' }, dockChain, dockBlocks)),
  previewBtn);
document.body.append(dock);
previewBtn.addEventListener('click', () => { if (!aside) return; openSheet(aside, { label: 'Live preview', onClose: () => previewBtn.focus() }); });
addEventListener('resize', () => { if (innerWidth >= 1100) closeSheet(); }, { passive: true });

/* ---------- wiring: repaint on any edit the launch scripts reflect ---------- */
const schedule = frameBatch(paint);
const main = $('launch-workspace');
main.addEventListener('input', schedule, true);
main.addEventListener('change', schedule, true);
main.addEventListener('click', schedule, true);
// ignore this module's own drawing (the preview, the rail values, the upload zones' lit state)
const mine = (n) => pv.contains(n) || nav?.contains(n) || (n.nodeType === 1 && n.classList.contains('qtp-upload'));
new MutationObserver((muts) => { if (muts.some((m) => !mine(m.target))) schedule(); })
  .observe(main, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'src', 'hidden', 'aria-checked', 'aria-pressed'] });
paint();
// the launch scripts render their parts after load; start animating only once the first state is painted
setTimeout(() => { paint(); ready = true; }, 600);
export { shell };
