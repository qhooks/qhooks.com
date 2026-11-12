// QHooks System A: the terminal and token page (token lane, 2026-11-11).
// Presentation only. Every number here comes from what the terminal already loaded (window.qxTerminal.state /
// display(), the 'qxt:paint' event after each market read) or from public reads the page already makes (community
// calls, buybacks). Nothing is replayed or invented: motion only fires when a new trade, holder or call arrives.
import { h, icon, RM, fmt, avatar, keeperAvatar, setArt, absUrl, bigPrice, changeLine, ticker, toast, toastHost, liveLabel, tabs, dock, supplyMap, countdown, restart, tag } from '/qx-a/components.mjs';
import { mountShell } from '/qx-a/shell.mjs';
import { activityQuery } from '/qx-community-activity.mjs';
import { profileUrl } from '/qx-profile-address.mjs';

const doc = document, root = doc.documentElement, body = doc.body;
const $ = (id) => doc.getElementById(id);
const desk = matchMedia('(min-width:1100px)');
const inTelegram = root.dataset.tg === '1';
const main = $('qxt-main');
const api = () => window.qxTerminal;
const OFFICIAL = { chainId: '4663', token: '0x20429af7ca3b0ce4d99edbaa0693f26c5df05195' };
const isOfficial = (m) => m && String(m.chainId) === OFFICIAL.chainId && String(m.token || '').toLowerCase() === OFFICIAL.token;
const CHAIN = { 1: 'Ethereum', 56: 'BNB Chain', 8453: 'Base', 42161: 'Arbitrum', 4663: 'Robinhood Chain', 99901: 'Elysium', 143: 'Monad', solana: 'Solana' };
const CHAIN_DOT = { 1: '#8FA3FF', 56: '#F3BA2F', 8453: '#2F6BFF', 42161: '#28A0F0', 4663: 'var(--qa-chain-rh)', 99901: '#7CC8A0', 143: '#836EF9', solana: '#9945FF' };
const EXPLORER = { 1: 'https://etherscan.io', 56: 'https://bscscan.com', 8453: 'https://basescan.org', 42161: 'https://arbiscan.io', 4663: 'https://robinhoodchain.blockscout.com', 143: 'https://monadscan.com', solana: 'https://solscan.io' };
const tickSet = (el, cls, ms = 60) => { if (RM) return; el.classList.add(cls); setTimeout(() => el.classList.remove(cls), ms); };

/* ================= shell ================= */
const holder = $('ta-holder'), walletBox = holder?.querySelector('.qxt-wallet'), searchBox = holder?.querySelector('.qxt-search');
const shell = doc.querySelector('.qa-hdr') ? null : mountShell({ active: 'trade', mode: 'app', title: 'Trade', back: '/terminal', wallet: walletBox, logo: '/qhooks-logo.jpg', footer: !inTelegram });
if (inTelegram) body.classList.add('ta-tg');
const hdr = doc.querySelector('.qa-hdr');
// The terminal's own search field lives in the header on desktop and at the top of the token list on a phone.
const hdrSearch = hdr?.querySelector('.qa-hdr__search');
if (searchBox) { searchBox.classList.add('ta-search'); searchBox.prepend(icon('search')); }
function placeSearch() {
  if (!searchBox) return;
  if (desk.matches && hdrSearch) { if (searchBox.parentElement !== hdrSearch.parentElement) hdrSearch.replaceWith(searchBox); }
  else { const head = doc.querySelector('#qxt-discover .qxfd-heading'); if (head && searchBox.parentElement !== head) head.after(searchBox); }
}
// qx-terminal.mjs writes the connected wallet into #qt-connection (a screen-reader line) on every wallet change.
const srLine = $('qt-connection'); if (srLine) body.append(srLine);
holder?.remove();
// The old wallet menu opens under the header.
const walletMenu = $('qxt-wallets');
if (walletMenu) walletMenu.classList.add('ta-menu');
// The header's back button returns to the token list the way the terminal's own back does.
hdr?.querySelector('.qa-hdr__back')?.addEventListener('click', (e) => { const back = doc.querySelector('.qxfd-back'); if (back && main.classList.contains('has-market')) { e.preventDefault(); back.click(); scrollTo({ top: 0 }); } });
// "Trade" in the tab bar / nav from a token page goes back to the list too.
for (const a of doc.querySelectorAll('.qa-tabbar__a[data-id="trade"], .qa-nav-links a[data-id="trade"]')) a.addEventListener('click', (e) => { const back = doc.querySelector('.qxfd-back'); if (back && main.classList.contains('has-market')) { e.preventDefault(); back.click(); scrollTo({ top: 0 }); } });
const actions = hdr?.querySelector('[data-qa-slot="actions"]');

/* ================= token art + identity (the stage) ================= */
const top = $('ta-top');
const P = { price: bigPrice(), change: changeLine(), live: liveLabel() };
P.price.el.setAttribute('aria-live', 'off');
const stageImg = h('img', { class: 'qa-stage__img', alt: '', width: 1500, height: 500, decoding: 'async' });
const coinImg = h('img', { class: 'qa-coin__img', alt: '', width: 96, height: 96, decoding: 'async' });
const coinLetter = h('span', { class: 'ta-coin-letter', 'aria-hidden': 'true' });
coinImg.addEventListener('error', () => { coinImg.hidden = true; coinLetter.hidden = false; });
coinImg.addEventListener('load', () => { coinImg.hidden = false; coinLetter.hidden = true; });
const coinPulse = h('span', { class: 'qa-coin__pulse', 'aria-hidden': 'true' });
const coinEl = h('span', { class: 'qa-coin ta-coin' }, coinImg, coinLetter, h('span', { class: 'qa-coin__ring', 'aria-hidden': 'true' }), coinPulse);
const pulseCoin = (dir) => { if (RM) return; coinPulse.className = 'qa-coin__pulse'; void coinPulse.offsetWidth; coinPulse.classList.add(dir > 0 ? 'is-buy' : 'is-sell'); };
const sealEl = h('span', { class: 'qa-seal', title: 'Official QHooks token', hidden: true }, icon('seal', ''), h('span', { class: 'qa-vh' }, 'Official'));
const symWrap = h('div', { class: 'qa-sym ta-sym' });
const socials = h('span', { class: 'ta-socials' });
const chainMeta = h('span', { class: 'ta-chain' }, h('span', { class: 'qa-chain-dot' }), h('span'));
const proofChip = h('button', { type: 'button', class: 'qa-meta__proof ta-proof', hidden: true }, icon('shield'), h('span'), h('b'));
const nameMeta = h('span', { class: 'ta-name', hidden: true });
const meta = h('p', { class: 'qa-meta ta-meta' }, chainMeta, nameMeta, proofChip);
const identTools = h('div', { class: 'ta-ident-tools' });
const socWrap = h('div', { class: 'qa-socials ta-soc' }, socials, identTools);
const ident = h('div', { class: 'qa-ident' }, coinEl, symWrap, socWrap, meta);
const quote = h('div', { class: 'qa-quote ta-quote' }, P.price.el, P.change.el);
const stage = h('section', { class: 'qa-stage qa-stage--wide ta-stage', 'aria-label': 'Token' },
  h('div', { class: 'qa-stage__art', 'aria-hidden': 'true' }, h('div', { class: 'qa-stage__glow' }), h('div', { class: 'qa-stage__frame' }, stageImg, h('span', { class: 'qa-stage__sheen' }))),
  h('div', { class: 'qa-stage__copy' }, ident, quote));
const tickerSlot = h('div', { class: 'ta-ticker', hidden: true });
top.append(stage, tickerSlot);
// The terminal's own identity nodes move into the stage (they keep their ids, so the terminal still finds them).
symWrap.append($('qxt-symbol'), sealEl);
$('qxt-symbol').classList.add('ta-sym-h');
// shellfix3 (2026-11-12): the full ticker always shows. Step the size down until it fits its column (15 px floor),
// then wrap; refit when the symbol changes or the column resizes.
{
  const symH = $('qxt-symbol'); let fitW = -1, fitText = null;
  const fitSym = () => {
    const w = symH.clientWidth, t = symH.textContent;
    if (w === fitW && t === fitText) return; fitW = w; fitText = t;
    const over = () => symH.scrollWidth > symH.clientWidth + 1;
    const step = (floor) => { let s = parseFloat(getComputedStyle(symH).fontSize) || 26; while (over() && s > floor) { s -= 1; symH.style.fontSize = s + 'px'; } };
    symH.style.fontSize = ''; symH.classList.remove('ta-sym-wrap'); ident.classList.remove('ta-long');
    step(18);
    // a long ticker: the socials move to their own row so the ticker gets the full width, then step down again
    if (over()) { symH.style.fontSize = ''; ident.classList.add('ta-long'); step(15); }
    if (over()) symH.classList.add('ta-sym-wrap');
    fitW = symH.clientWidth;
  };
  new MutationObserver(() => requestAnimationFrame(fitSym)).observe(symH, { childList: true, characterData: true, subtree: true });
  if (globalThis.ResizeObserver) new ResizeObserver(() => requestAnimationFrame(fitSym)).observe(symWrap);
  requestAnimationFrame(fitSym);
}
nameMeta.append($('qxt-name'));
const markSlot = h('span', { class: 'ta-marks' }); meta.append(markSlot);
for (const id of ['qxt-copy']) { const b = $(id); if (b) { b.classList.add('ta-copy'); b.prepend(icon('copy')); meta.append(b); } }
const star = $('qxt-star'), share = $('qxt-share');
star?.classList.add('qa-btn', 'qa-btn--icon', 'ta-icon-btn', 'ta-star'); share?.classList.add('qa-btn', 'qa-btn--icon', 'ta-icon-btn', 'ta-share');
function placeTools() {
  const into = desk.matches || !actions ? identTools : actions;
  for (const b of [star, share]) if (b && b.parentElement !== into) into.append(b);
}
if (!RM) {
  addEventListener('scroll', () => stageImg.style.setProperty('--qa-par-y', (Math.min(scrollY, 600) * .32).toFixed(1) + 'px'), { passive: true });
  const frame = stage.querySelector('.qa-stage__frame');
  stage.addEventListener('pointermove', (e) => { if (!desk.matches) return; const r = stage.getBoundingClientRect(); frame.style.setProperty('--qa-tilt-y', (((e.clientX - r.left) / r.width - .5) * -5).toFixed(2) + 'deg'); frame.style.setProperty('--qa-tilt-x', (((e.clientY - r.top) / r.height - .5) * 4).toFixed(2) + 'deg'); });
}
// Back to the list on desktop: the terminal's own button, quietly at the top of the stage.
function placeBack() { const back = doc.querySelector('.qxfd-back'); if (back && back.parentElement !== stage) { back.classList.add('ta-back'); stage.prepend(back); } }

/* art: profile banner, the launch banner, the feed's banner, the official banner; else the icon lights the page */
const art = { key: '', profile: null, feed: null };
function iconSrc(m) {
  const img = doc.querySelector('#qxt-av img.qxt-av-logo');
  if (img && img.getAttribute('data-avatar-state') === 'image' && (img.currentSrc || img.src)) return img.currentSrc || img.src;
  return art.profile?.image || art.feed?.profileImage || art.feed?.logo || art.feed?.logoURI || (isOfficial(m) ? '/qx-a/img/qhooks-icon.jpg' : '');
}
function bannerSrc(m) {
  return art.profile?.banner || art.feed?.profileBanner || art.feed?.launchBanner || (isOfficial(m) ? '/qx-a/img/qhooks-banner.jpg' : '');
}
let paintedArt = '';
function paintArt(m) {
  const ic = iconSrc(m), banner = bannerSrc(m), blur = isOfficial(m) && !art.profile?.banner ? '/qx-a/img/qhooks-banner-blur.jpg' : '';
  const sig = ic + '|' + banner;
  if (sig === paintedArt) return; paintedArt = sig;
  stage.classList.toggle('ta-noart', !banner); root.classList.toggle('ta-noart-page', !banner);
  if (banner) { stageImg.src = banner; stageImg.hidden = false; } else if (ic) { stageImg.src = ic; stageImg.hidden = false; } else stageImg.hidden = true;
  if (ic) { coinImg.src = ic; coinImg.hidden = false; coinLetter.hidden = true; } else { coinImg.hidden = true; coinLetter.hidden = false; }
  setArt({ banner: banner || ic || undefined, blur: blur || undefined, icon: ic || undefined });
  if (!banner && !ic) root.style.setProperty('--qa-banner-blur', 'none');
}
// the terminal's avatar fills in a little after the header: follow it
new MutationObserver(() => { const d = api()?.display?.(); if (d) paintArt(d.meta); }).observe($('qxt-av'), { subtree: true, attributes: true, attributeFilter: ['src', 'data-avatar-state', 'hidden'] });
// token profile (banner, image, links) from qx-token-profile-view.mjs
addEventListener('qxt:profile', (e) => { const d = api()?.display?.(); art.profile = e.detail?.profile || null; paintSocials(d?.meta); if (d) paintArt(d.meta); });

function paintSocials(m) {
  const L = art.profile?.links || {}, list = [];
  const off = isOfficial(m);
  const web = L.website || (off ? 'https://qhooks.com' : ''), x = L.x || (off ? 'https://x.com/qHooks_' : ''), tg = L.telegram || (off ? 'https://t.me/qhooks_bot' : '');
  if (web) list.push(['globe', 'Website', web]); if (x) list.push(['x', 'X', x]); if (tg) list.push(['tg', 'Telegram', tg]);
  const sig = list.map((l) => l[2]).join('|'); if (socials.dataset.sig === sig) return; socials.dataset.sig = sig;
  socials.replaceChildren(...list.map(([ic, label, href]) => h('a', { href, target: '_blank', rel: 'noopener noreferrer ugc', 'aria-label': label }, icon(ic))));
}

/* proof chip: from the selected RepoProof report the page already shows */
function paintProof() {
  const rp = $('qxt-repoproof'), text = rp && !rp.hidden ? rp.textContent : '';
  const m = /Danger\s*(\d+)\D+Caution\s*(\d+)\D+Clear\s*(\d+)(?:\D+Unknown\s*(\d+))?/i.exec(text || '');
  if (!m) { proofChip.hidden = true; return; }
  const [danger, caution, clear, unknown] = [m[1], m[2], m[3], m[4] || 0].map(Number), total = danger + caution + clear + unknown;
  proofChip.hidden = false;
  proofChip.classList.toggle('is-warn', !danger && caution > 0); proofChip.classList.toggle('is-danger', danger > 0);
  proofChip.children[1].textContent = danger ? 'Proof · high risk' : caution ? 'Proof · caution' : 'Proof clear';
  proofChip.children[2].textContent = danger ? danger + '/' + total : caution ? caution + '/' + total : clear + '/' + total;
}
/* newcomerA (2026-11-12): the chip opens the checks themselves (a sheet on a phone, a popover on desktop), the ones
   that need a look first, each with a one-line reason, and a link to the full report. Read from the same RepoProof
   report the page already shows (#qxt-repoproof); nothing new is fetched. */
const PROOF_RANK = { danger: 0, caution: 1, unknown: 2, clear: 3, info: 4 };
const PROOF_WORD = { danger: 'Failed', caution: 'Warning', unknown: 'Not checked', clear: 'Passed', info: 'Note' };
const oneLine = (t) => { const s = String(t || '').replace(/\s+/g, ' ').trim(), first = (s.match(/^.+?[.!?](?=\s|$)/) || [s])[0].replace(/[.]$/, ''); return first.length > 96 ? first.slice(0, first.lastIndexOf(' ', 92)) + '…' : first; };
function readProofChecks() {
  const rp = $('qxt-repoproof');
  const list = [...(rp?.querySelectorAll('.qpr-checks > details') || [])].map((d) => {
    const st = (d.querySelector(':scope > summary .qpr-check-status')?.className.match(/\b(danger|caution|clear|unknown|info)\b/) || [])[1] || 'unknown';
    const det = d.querySelector(':scope > .qpr-disclosure-body .qpr-detail')?.textContent || '';
    return { st, title: d.querySelector(':scope > summary .qpr-check-title b')?.textContent.trim() || 'Check', why: /^No further detail/.test(det) ? '' : oneLine(det) };
  }).sort((a, b) => PROOF_RANK[a.st] - PROOF_RANK[b.st]);
  return { list, link: rp?.querySelector('.qpr-report-link')?.href || '' };
}
const proofScrim = h('div', { class: 'qa-scrim ta-proofscrim', hidden: true });
const proofPop = h('div', { class: 'ta-proofpop', id: 'ta-proofpop', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ta-proofpop-h', hidden: true });
proofChip.setAttribute('aria-haspopup', 'dialog'); proofChip.setAttribute('aria-controls', 'ta-proofpop'); proofChip.setAttribute('aria-expanded', 'false');
body.append(proofScrim, proofPop);
const proofRow = (c) => h('li', { class: 'ta-pc is-' + c.st }, h('span', { class: 'ta-pc__dot', 'aria-hidden': 'true' }),
  h('div', { class: 'ta-pc__txt' }, h('b', null, c.title), c.why ? h('span', null, c.why) : null), h('span', { class: 'ta-pc__st' }, PROOF_WORD[c.st]));
function paintProofPop() {
  const { list, link } = readProofChecks(), scored = list.filter((c) => c.st !== 'info'), notes = list.filter((c) => c.st === 'info');
  const passed = scored.filter((c) => c.st === 'clear').length, look = scored.filter((c) => c.st === 'danger' || c.st === 'caution').length;
  const unchecked = scored.filter((c) => c.st === 'unknown').length;
  const close = h('button', { type: 'button', class: 'qa-btn qa-btn--icon ta-proofpop__x', 'aria-label': 'Close checks' }, h('span', { 'aria-hidden': 'true' }, '×'));
  close.addEventListener('click', () => closeProof(true));
  const full = link ? h('a', { class: 'qa-btn qa-btn--secondary qa-btn--sm ta-proofpop__full', href: link, target: '_blank', rel: 'noopener noreferrer' }, 'Full report', icon('out'))
    : h('button', { type: 'button', class: 'qa-btn qa-btn--secondary qa-btn--sm ta-proofpop__full' }, 'Full report');
  if (!link) full.addEventListener('click', () => { closeProof(); $('qxt-repoproof')?.scrollIntoView({ block: 'start', behavior: RM ? 'auto' : 'smooth' }); });
  proofPop.replaceChildren(...[
    desk.matches ? null : h('span', { class: 'qa-sheet__grip', 'aria-hidden': 'true' }),
    h('header', { class: 'ta-proofpop__head' }, h('div', null, h('h2', { id: 'ta-proofpop-h' }, 'Proof checks'),
      h('p', null, scored.length ? passed + ' of ' + scored.length + ' passed' + (look ? ' · ' + look + ' to look at' : '') + (unchecked ? ' · ' + unchecked + ' not checked' : '') : 'Refreshing…')), close),
    scored.length ? h('ul', { class: 'ta-pcs' }, scored.map(proofRow)) : null,
    notes.length ? h('details', { class: 'ta-pcs-notes' }, h('summary', null, notes.length + (notes.length === 1 ? ' note' : ' notes')), h('ul', { class: 'ta-pcs' }, notes.map(proofRow))) : null,
    h('footer', { class: 'ta-proofpop__foot' }, h('span', null, 'Checked by RepoProof'), full)].filter(Boolean));
}
function placeProofPop() {
  if (!desk.matches) { proofPop.style.removeProperty('top'); proofPop.style.removeProperty('left'); return; }
  const r = proofChip.getBoundingClientRect(), w = proofPop.offsetWidth || 400;
  proofPop.style.top = Math.round(r.bottom + scrollY + 10) + 'px';
  proofPop.style.left = Math.round(Math.max(16, Math.min(r.left + scrollX, scrollX + doc.documentElement.clientWidth - w - 16))) + 'px';
}
let proofOpen = false;
function openProof() {
  paintProofPop(); proofOpen = true;
  proofPop.classList.toggle('qa-sheet', !desk.matches); proofPop.classList.toggle('is-pop', desk.matches);
  proofPop.hidden = false; proofScrim.hidden = desk.matches; placeProofPop();
  proofChip.setAttribute('aria-expanded', 'true');
  proofPop.querySelector('.ta-proofpop__x')?.focus({ preventScroll: true });
}
function closeProof(refocus) {
  if (!proofOpen) return; proofOpen = false; proofPop.hidden = true; proofScrim.hidden = true;
  proofChip.setAttribute('aria-expanded', 'false'); if (refocus) proofChip.focus({ preventScroll: true });
}
proofChip.addEventListener('click', (e) => { e.stopPropagation(); proofOpen ? closeProof() : openProof(); });
proofScrim.addEventListener('click', () => closeProof());
doc.addEventListener('click', (e) => { if (proofOpen && desk.matches && !proofPop.contains(e.target) && !proofChip.contains(e.target)) closeProof(); });
addEventListener('keydown', (e) => { if (proofOpen && e.key === 'Escape') closeProof(true); });
addEventListener('resize', () => { if (proofOpen) { proofPop.classList.toggle('qa-sheet', !desk.matches); proofPop.classList.toggle('is-pop', desk.matches); proofScrim.hidden = desk.matches; placeProofPop(); } });
addEventListener('hashchange', () => closeProof());
new MutationObserver(() => { paintProof(); if (proofOpen) paintProofPop(); }).observe($('qxt-repoproof'), { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden'] });

/* ================= stats: the terminal's own strip, ruled, with ticks ================= */
const statsEl = $('qxt-stats');
let statPrev = new Map();
function syncStats() {
  const cells = [...statsEl.children];
  const next = new Map();
  for (const c of cells) {
    const k = c.querySelector('dt')?.textContent.trim().toLowerCase() || '', dd = c.querySelector('dd'); if (!dd) continue;
    if (k === 'price' || k === '24h') c.classList.add('ta-mirrored');
    const v = dd.textContent.trim(); next.set(k, v);
    if (!dd.dataset.split && v.includes(' · ') && /^[<~≈]?\s*\$/.test(v)) { dd.dataset.split = '1'; const [lead, ...more] = v.split(' · '); dd.title = v; dd.replaceChildren(lead, h('span', { class: 'ta-sec' }, ' · ' + more.join(' · '))); }
    if (/^buys \/ sells/.test(k)) { const m = v.match(/^\s*([\d,]+)\s*\/\s*([\d,]+)/); const b = m ? +m[1].replace(/,/g, '') : 0, s = m ? +m[2].replace(/,/g, '') : 0; c.classList.toggle('ta-ratio', b + s > 0); if (b + s > 0) c.style.setProperty('--ta-buys', (100 * b / (b + s)).toFixed(1) + '%'); }
    const before = statPrev.get(k);
    if (before && before !== v && statsEl.dataset.key === statKey) tickSet(dd, 'is-tick');
  }
  statsEl.dataset.key = statKey; statPrev = next;
}
let statKey = '';
new MutationObserver(syncStats).observe(statsEl, { childList: true });

/* ================= chart: the licensed TradingView chart, styled; the hanging line on top ================= */
const chartBox = $('qxt-chart'), chartWrap = $('ta-chart');
const liveSlot = h('div', { class: 'ta-live' }, P.live.el);
chartWrap.prepend(liveSlot);
const overlay = h('canvas', { class: 'ta-overlay', 'aria-hidden': 'true' });
chartBox.append(overlay);
const pressure = h('div', { class: 'ta-pressure', hidden: true }, h('div', { class: 'qa-pressure__bar' }, h('span', { class: 'qa-pressure__buy' }), h('span', { class: 'qa-pressure__sell' })),
  h('div', { class: 'qa-pressure__legend' }, h('span', { class: 'qa-up' }), h('span', null, 'trades, last 24h'), h('span', { class: 'qa-down' })));
chartWrap.append(pressure);
// line or candles (gold line on graphite is the default; candles stay one tap away)
let mode = 'line'; try { mode = localStorage.getItem('qa-chart-mode') === 'candles' ? 'candles' : 'line'; } catch {}
const modeBtn = h('button', { type: 'button', class: 'ta-mode', 'aria-pressed': String(mode === 'candles'), title: 'Candles' }, icon('candles'));
modeBtn.addEventListener('click', () => { mode = mode === 'line' ? 'candles' : 'line'; try { localStorage.setItem('qa-chart-mode', mode); } catch {} modeBtn.setAttribute('aria-pressed', String(mode === 'candles')); modeBtn.replaceChildren(icon(mode === 'line' ? 'candles' : 'line')); modeBtn.title = mode === 'line' ? 'Candles' : 'Line'; syncSeries(true); });
modeBtn.replaceChildren(icon(mode === 'line' ? 'candles' : 'line'));
$('qxt-chart')?.parentElement && doc.querySelector('.qxt-chartbar')?.append(modeBtn);

const C = { area: null, lastSig: '', lastSync: 0, rings: [], spring: null, t0: performance.now(), marks: [], pins: [], burnTx: new Set(), dpr: 1 };
const gold = () => getComputedStyle(body).getPropertyValue('--qa-gold').trim() || '#D2AD72';
function providerShown() { return !!chartBox.querySelector('iframe') || chartBox.hidden; }
function syncSeries(force = false) {
  const H = api()?.chart?.(); if (!H) return null;
  const { chart, candles } = H;
  let bars; try { bars = candles.data(); } catch { return H; }
  const last = bars.at(-1), sig = mode + ':' + bars.length + ':' + (last ? last.time + ':' + last.close : '');
  if (!force && sig === C.lastSig) return H;
  C.lastSig = sig;
  // A chart opened before its history arrived keeps its first few-bar window; once the history lands, show the
  // latest 90 bars the way the terminal frames a fresh chart (only until the reader moves the chart).
  if (C.fitKey !== T.key) { C.fitKey = T.key; C.fitFrom = bars.length; }
  if (C.fitFrom < 20 && bars.length >= 30) { C.fitFrom = bars.length; try { const lr = chart.timeScale().getVisibleLogicalRange(); if (lr && lr.to - lr.from < 30) chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, bars.length - 90), to: bars.length + 5 }); } catch {} }
  const light = root.dataset.theme === 'light';
  if (mode === 'line') {
    if (!C.area) C.area = chart.addAreaSeries({ lineWidth: 2, priceScaleId: 'right', lastValueVisible: true, priceLineVisible: true, priceLineStyle: 2, crosshairMarkerRadius: 4 });
    C.area.applyOptions({ visible: true, lineColor: light ? '#8B6631' : '#E4C48C', topColor: light ? 'rgba(139,102,49,.20)' : 'rgba(226,190,128,.30)', bottomColor: 'rgba(210,173,114,0)', priceLineColor: gold(), crosshairMarkerBackgroundColor: light ? '#8B6631' : '#F0DAAE', priceFormat: candles.options().priceFormat });
    C.area.setData(bars.map((b) => ({ time: b.time, value: b.close })));
    try { C.area.setMarkers(candles.markers()); } catch {}
    candles.applyOptions({ visible: false });
  } else {
    if (C.area) { C.area.applyOptions({ visible: false }); C.area.setData([]); }
    candles.applyOptions({ visible: true, priceLineColor: gold(), priceLineStyle: 2 });
  }
  return H;
}
addEventListener('qa:theme', () => syncSeries(true));
new MutationObserver(() => syncSeries(true)).observe(root, { attributes: true, attributeFilter: ['data-theme'] });

function drawOverlay() {
  const ctx = overlay.getContext('2d'), rect = chartBox.getBoundingClientRect(), W = rect.width, Hh = rect.height;
  if (!W || !Hh) return;
  const dpr = Math.min(3, devicePixelRatio || 1);
  if (overlay.width !== Math.round(W * dpr) || overlay.height !== Math.round(Hh * dpr)) { overlay.width = Math.round(W * dpr); overlay.height = Math.round(Hh * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, Hh);
  if (providerShown() || !main.classList.contains('has-market')) return;
  const now = performance.now();
  if (now - C.lastSync > 600) { C.lastSync = now; syncSeries(); }
  const H = api()?.chart?.(); if (!H) return;
  const { chart, candles } = H, series = mode === 'line' && C.area ? C.area : candles;
  let bars; try { bars = candles.data(); } catch { return; }
  const last = bars.at(-1); if (!last) return;
  const ts = chart.timeScale(), plotW = ts.width(), plotH = Hh - ts.height();
  const x = ts.timeToCoordinate(last.time), y0 = series.priceToCoordinate(last.close);
  if (x == null || y0 == null || x > plotW + 2) return;
  const light = root.dataset.theme === 'light';
  const css = getComputedStyle(body), col = (n) => css.getPropertyValue(n).trim();
  const goldHi = col('--qa-gold-hi') || '#F0DAAE', g = col('--qa-gold') || '#D2AD72', buy = col('--qa-buy'), sell = col('--qa-sell'), fire = col('--qa-fire'), floor = col('--qa-floor');
  // trades, buybacks and calls on the line (the bucket's close), drawn under the beacon
  const tf = api()?.state?.tf || 60, byTime = new Map(bars.map((b) => [b.time, b]));
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, plotW, plotH); ctx.clip();
  for (const t of C.marks) {
    const b = byTime.get(Math.floor(t.ts / tf) * tf); if (!b) continue;
    const mx = ts.timeToCoordinate(b.time), my = series.priceToCoordinate(b.close); if (mx == null || my == null || mx < 0 || mx > plotW) continue;
    const r = t.kind === 'burn' ? 2.4 : Math.min(5, 1.8 + Math.log10(1 + (t.usd || 1)) * .95);
    ctx.beginPath(); ctx.arc(mx, my, r + 1.4, 0, 7); ctx.fillStyle = floor; ctx.fill();
    ctx.beginPath(); ctx.arc(mx, my, r, 0, 7); ctx.fillStyle = t.kind === 'burn' ? fire : t.kind === 'buy' ? buy : sell; ctx.fill();
  }
  for (const p of C.pins) {
    const b = byTime.get(Math.floor(p.ts / tf) * tf); if (!b) continue;
    const px = ts.timeToCoordinate(b.time), py = series.priceToCoordinate(b.close); if (px == null || py == null || px < 0 || px > plotW) continue;
    ctx.setLineDash([2, 4]); ctx.strokeStyle = g; ctx.globalAlpha = .55; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px, 6); ctx.lineTo(px, py - 11); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(px, py, 8.5, 0, 7); ctx.fillStyle = floor; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = g; ctx.stroke();
    ctx.fillStyle = goldHi; ctx.font = '800 9.5px "Mona Sans"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('C', px, py + .5);
  }
  ctx.restore();
  // the live price hangs from a fine gold line dropped from the top of the chart; trades tug it
  let off = 0; if (C.spring && !RM) { const st = (now - C.spring.t0) / 1000; off = C.spring.a * Math.exp(-st * 4.2) * Math.cos(st * 17); if (st > 1.6) C.spring = null; }
  const y = y0 + off;
  const hg = ctx.createLinearGradient(0, 0, 0, y); hg.addColorStop(0, 'rgba(0,0,0,0)'); hg.addColorStop(1, goldHi);
  ctx.strokeStyle = hg; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, y - 6); ctx.stroke();
  C.rings = C.rings.filter((r) => now - r.t0 < 750);
  for (const r of C.rings) { const k = (now - r.t0) / 750, e = 1 - Math.pow(1 - k, 3); ctx.globalAlpha = (1 - k) * .8; ctx.beginPath(); ctx.arc(x, y, 6 + e * (r.big ? 30 : 18), 0, 7); ctx.strokeStyle = r.c; ctx.lineWidth = r.big ? 2 : 1.5; ctx.stroke(); ctx.globalAlpha = 1; }
  const pulse = RM ? 0 : (Math.sin((now - C.t0) / 1000 * 3.2) + 1) / 2, glow = ctx.createRadialGradient(x, y, 0, x, y, 18 + pulse * 6);
  glow.addColorStop(0, light ? 'rgba(139,102,49,.35)' : 'rgba(246,226,184,.55)'); glow.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, 24, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fillStyle = light ? '#fff' : '#FFF3DA'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = g; ctx.stroke();
}
let overlayRunning = false;
function overlayLoop() { drawOverlay(); if (!RM && main.classList.contains('has-market') && !doc.hidden) requestAnimationFrame(overlayLoop); else overlayRunning = false; }
function startOverlay() { if (overlayRunning) { return; } overlayRunning = true; requestAnimationFrame(overlayLoop); }
doc.addEventListener('visibilitychange', () => { if (!doc.hidden) startOverlay(); });
// the chart's own parts: marker layers beside the live label, timeframes under the chart (inside its stage, so they
// come along into fullscreen), tools below them
function placeChartParts() {
  const legend = chartWrap.querySelector('.qxt-layer-legend'); if (legend && legend.parentElement !== liveSlot) liveSlot.append(legend);
  const stageEl = chartWrap.querySelector('.qxt-chart-stage'), bar = doc.querySelector('.qxt-chartbar');
  if (stageEl && bar && bar.previousElementSibling !== chartBox) chartBox.after(bar);
}
function chartTrade(side, usd) { if (RM) { drawOverlay(); return; } const css = getComputedStyle(body); C.rings.push({ t0: performance.now(), c: css.getPropertyValue(side === 'burn' ? '--qa-fire' : side === 'buy' ? '--qa-buy' : '--qa-sell').trim(), big: usd >= 300 }); C.spring = { t0: performance.now(), a: (side === 'sell' ? 1 : -1) * Math.min(9, 3 + Math.log10(1 + usd) * 2) }; }

/* ================= toasts: new holders and calls ================= */
function placeToasts() { toastHost(desk.matches ? chartBox.parentElement === chartWrap ? chartWrap : body : body); }

/* ================= slab extras (desktop): links + a compact live tape ================= */
const side = $('qxt-trade');
const slabTape = h('ol', { class: 'qa-tape qa-tape--compact ta-slab-tape' });
const slabExtras = h('div', { class: 'ta-slab-extras' },
  h('nav', { class: 'ta-trade-links', 'aria-label': 'More ways to trade' },
    h('a', { href: '/orders' }, 'Limit orders'), h('a', { href: '/perps' }, 'Perps'), h('a', { href: '/copy' }, 'Copy trading'), h('a', { href: '/portfolio' }, 'Positions')),
  h('div', { class: 'ta-slab-tape-wrap' }, h('header', { class: 'ta-slab-head' }, h('h3', null, 'Tape'), h('span', { class: 'ta-slab-note' }, 'Live trades')), slabTape));
side.append(slabExtras);
// Limit as a third side, when the pro orders module offers it for this token.
const limitBtn = $('qx-pro-limit');
const limitTab = h('button', { type: 'button', class: 'ta-limit-tab', hidden: true }, 'Limit');
limitTab.addEventListener('click', () => limitBtn?.click());
function placeLimit() { const t = $('qxt-ticket')?.querySelector('.qxt-side-toggle'); if (t && limitTab.previousElementSibling !== t) t.after(limitTab); limitTab.hidden = !limitBtn || limitBtn.hidden; }
if (limitBtn) new MutationObserver(placeLimit).observe(limitBtn, { attributes: true, attributeFilter: ['hidden'] });
new MutationObserver(placeLimit).observe($('qxt-ticket'), { childList: true });

/* ================= phone dock ================= */
const dk = dock({ onBuy: () => window.qxSheet?.open('buy'), onSell: () => window.qxSheet?.open('sell') });
dk.classList.add('ta-dock'); body.append(dk);
addEventListener('qx:sheet', (e) => body.classList.toggle('ta-sheet-open', !!e.detail?.open));

/* ================= section nav: Traders / Callers / Holders / Builder ================= */
const SECTIONS = [['traders', 'Traders'], ['callers', 'Callers'], ['holders', 'Holders'], ['builder', 'Builder']];
const secTabs = tabs(SECTIONS.map(([id, label]) => ({ id, label })), { active: 'traders', variant: 'section', label: 'Sections', onChange: (id) => { spyHold = Date.now() + 900; const el = $(id); if (el) scrollTo({ top: el.getBoundingClientRect().top + scrollY - stickyTop() - 8, behavior: RM ? 'auto' : 'smooth' }); } });
secTabs.el.classList.add('ta-secnav');
$('traders').before(secTabs.el);
let spyHold = 0;
const stickyTop = () => (hdr?.getBoundingClientRect().bottom || 0) + secTabs.el.offsetHeight;
const spy = new IntersectionObserver((es) => { if (Date.now() < spyHold) return; for (const e of es) if (e.isIntersecting) secTabs.set(e.target.id); }, { rootMargin: '-35% 0px -60% 0px' });
for (const [id] of SECTIONS) spy.observe($(id));

/* ================= Traders: the terminal's own tape, as an A tape ================= */
const pane = $('qxt-pane');
let seenRows = null, paneKey = '';
function decorateTape() {
  const table = pane.querySelector('table.qxt-table'); if (!table) { moreBtn.hidden = true; return; }
  const heads = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim().toLowerCase());
  const vi = heads.indexOf('value'), si = heads.indexOf('side'), ti = heads.indexOf('trader');
  table.classList.toggle('ta-tape', vi >= 0 && si >= 0);
  if (vi < 0 || si < 0) { table.classList.add('ta-grid'); moreBtn.hidden = true; return; }
  const rows = [...table.querySelectorAll('tbody tr')];
  const usdOf = (t) => { const m = /\$\s*([\d,]*\.?\d+)\s*([KMB])?/.exec(t || ''); return m ? Number(m[1].replace(/,/g, '')) * ({ K: 1e3, M: 1e6, B: 1e9 }[m[2]] || 1) : NaN; };
  const vals = rows.map((tr) => usdOf(tr.cells[vi]?.textContent)).filter((v) => v > 0).sort((a, b) => a - b), topV = Math.max(vals[Math.floor((vals.length - 1) * .95)] || 0, .01);
  const key = (api()?.state?.sel ? JSON.stringify(api().state.sel) : '') + (api()?.state?.filter || '');
  const fresh = seenRows && key === paneKey;
  const nextSeen = new Set();
  for (const tr of rows) {
    const link = tr.querySelector('a[href*="/tx/"]'), id = link ? link.getAttribute('href') : tr.textContent;
    nextSeen.add(id);
    const v = usdOf(tr.cells[vi]?.textContent), sideTxt = tr.cells[si]?.textContent.trim().toLowerCase() || '';
    const isBurn = !!link && C.burnTx.has((link.getAttribute('href').split('/tx/')[1] || '').toLowerCase());
    tr.classList.add('ta-trow', isBurn ? 'is-burn' : sideTxt.startsWith('buy') ? 'is-buy' : 'is-sell');
    if (v > 0) { tr.style.setProperty('--w', Math.max(2, Math.min(100, 100 * v / topV)).toFixed(1) + '%'); tr.classList.toggle('is-big', v >= 300); }
    if (!tr.querySelector('.ta-glyph')) tr.cells[si]?.prepend(icon(isBurn ? 'flame' : sideTxt.startsWith('buy') ? 'up' : 'down', 'qa-glyph ta-glyph'));
    const vc = tr.cells[vi]; if (vc && !vc.dataset.split && vc.childElementCount === 0 && vc.textContent.includes(' · ')) { vc.dataset.split = '1'; const [lead, ...more] = vc.textContent.split(' · '); vc.title = vc.textContent; vc.replaceChildren(lead, h('span', { class: 'ta-sec' }, ' · ' + more.join(' · '))); }
    const who = ti >= 0 ? tr.cells[ti] : null, addr = who?.querySelector('a[href*="/address/"], a[href*="/account/"]')?.getAttribute('href')?.split('/').pop();
    if (who && addr && !who.querySelector('.qa-ava')) who.prepend(isBurn ? keeperAvatar() : avatar(addr.startsWith('0x') ? addr : '0x' + [...addr].map((c) => c.charCodeAt(0).toString(16)).join('').slice(0, 40)));
    if (fresh && !seenRows.has(id) && !RM) tr.classList.add('is-enter');
  }
  seenRows = nextSeen; paneKey = key;
  moreBtn.hidden = rows.length <= 12 || !table.getClientRects().length || !!table.closest('details:not([open])');
  moreBtn.textContent = pane.classList.contains('ta-all') ? 'Show fewer trades' : 'Show all ' + rows.length + ' trades';
}
const moreBtn = h('button', { type: 'button', class: 'ta-more', hidden: true });
moreBtn.addEventListener('click', () => { pane.classList.toggle('ta-all'); decorateTape(); if (!pane.classList.contains('ta-all')) $('traders')?.scrollIntoView({ block: 'start' }); });
pane.after(moreBtn);
pane.addEventListener('toggle', () => requestAnimationFrame(decorateTape), true);
$('qxt-data-tabs').addEventListener('click', () => requestAnimationFrame(() => { if (!pane.querySelector('table.ta-tape')) moreBtn.hidden = true; }));
new MutationObserver(() => { requestAnimationFrame(decorateTape); }).observe(pane, { childList: true });

/* ================= Callers: calls on this token, with the caller's own position when it is complete ================= */
const callsEl = $('ta-calls'), callsCount = $('ta-calls-count');
const CL = { key: '', latest: null, calls: [], timer: 0, busy: false, seeded: false };
function callBoard(d) {
  const m = d.meta, sel = api()?.state?.sel;
  if (!sel) return null;
  return sel.ext ? { kind: 'token', chainId: String(m.chainId), address: m.token, symbol: m.symbol, name: m.name } : { kind: 'launch', chainId: String(m.chainId), controller: sel.controller, token: m.token || null, symbol: m.symbol, name: m.name };
}
async function loadCalls(d, { poll = false } = {}) {
  const board = callBoard(d); if (!board || CL.busy || doc.hidden) return;
  CL.busy = true;
  try {
    const qs = String(activityQuery({ view: 'recent', board, limit: 12 }));
    const r = await fetch('/api/community/activity?' + qs.replace(/^\?/, ''), { cache: 'no-store' });
    if (!r.ok) throw Error('calls');
    const j = await r.json(); const list = (j.calls || []).filter((c) => c.kind === 'call' && c.call);
    const before = new Set(CL.calls.map((c) => c.id));
    const added = CL.seeded ? list.filter((c) => !before.has(c.id)) : [];
    CL.calls = list; CL.seeded = true;
    renderCalls(d, new Set(added.map((c) => c.id)));
    for (const c of added.slice(0, 2)) toast({ kind: 'call', title: h('span', null, h('b', null, 'New call'), ' · ' + (c.board?.symbol ? '$' + c.board.symbol : '')), body: fmt.short(c.author) + ' called at ' + fmt.price(Number(c.call.price)), ava: avatar(c.author) });
  } catch { if (!CL.calls.length && !poll) callsEl.replaceChildren(h('p', { class: 'ta-quiet' }, 'Calls are refreshing.')); }
  finally { CL.busy = false; }
}
const units = (u, dec) => { try { const n = BigInt(u || '0'), d = 10n ** BigInt(dec || 18); return Number(n / d) + Number(n % d) / Number(d); } catch { return 0; } };
function callPosition(p) {
  if (!p || p.complete !== true) return null;
  const dec = p.atCall?.decimals ?? 18, at = units(p.atCall?.units, dec), now = units(p.now?.units, dec), out = units(p.soldSinceCall?.units, dec);
  const scale = Math.max(at, now, out, 1) * 1.04, bar = (cls, f) => h('span', { class: cls, style: { width: (Math.max(0, f) * 100).toFixed(2) + '%' } });
  const el = h('div', { class: 'qa-posbars' },
    h('div', { class: 'qa-cb' }, h('span', { class: 'qa-cb__l' }, 'At the call'), h('span', { class: 'qa-cb__track' }, bar('qa-cb__held', at / scale)), h('span', { class: 'qa-cb__v' }, fmt.tok(at), p.atCall?.usd != null ? h('small', null, fmt.usd(p.atCall.usd)) : null)),
    h('div', { class: 'qa-cb' }, h('span', { class: 'qa-cb__l' }, 'Holds now'), h('span', { class: 'qa-cb__track' }, now ? bar('qa-cb__now', now / scale) : h('span', { class: 'qa-cb__zero' })), h('span', { class: 'qa-cb__v' }, fmt.tok(now), p.now?.usd != null ? h('small', null, fmt.usd(p.now.usd)) : null)),
    h('div', { class: 'qa-cb' }, h('span', { class: 'qa-cb__l' }, 'Sold since'), h('span', { class: 'qa-cb__track' }, bar('qa-cb__out', out / scale)), h('span', { class: 'qa-cb__v' }, fmt.tok(out), p.soldSinceCall?.pctOfAtCall != null ? h('small', null, Math.round(p.soldSinceCall.pctOfAtCall) + '%') : null)));
  return h('div', null, el, h('p', { class: 'qa-note ' + (out > 0 && !now ? 'qa-note--warn' : now >= at ? 'qa-note--good' : '') }, out > 0 && !now ? 'Sold all of it since the call' : now >= at ? 'Still holds what they called with' : 'Sold ' + fmt.tok(out) + ' since the call'));
}
function renderCalls(d, fresh = new Set()) {
  const nowP = Number(d.summary?.priceUsd ?? (d.ext ? d.summary?.price : null));
  callsCount.textContent = CL.calls.length ? String(CL.calls.length) : '';
  if (!CL.calls.length) { callsEl.replaceChildren(h('div', { class: 'ta-empty' }, h('p', null, 'No calls on ' + (d.meta.symbol ? '$' + d.meta.symbol : 'this token') + ' yet.'), h('a', { class: 'qa-btn qa-btn--secondary qa-btn--sm', href: '/community#make-a-call' }, 'Make the first call'))); return; }
  callsEl.replaceChildren(...CL.calls.slice(0, 6).map((c) => {
    const cp = Number(c.call.price), usdCall = c.call.quoteSymbol === 'USD' && cp > 0, mult = usdCall && nowP > 0 ? nowP / cp : null;
    const age = fmt.age((Date.now() - (c.createdAt || c.call.at)) / 1000);
    const outcome = usdCall ? h('div', { class: 'qa-outcome' },
      h('div', { class: 'qa-outcome__col' }, h('span', null, 'Called at'), h('b', null, fmt.price(cp))),
      nowP > 0 ? h('div', { class: 'qa-outcome__col' }, h('span', null, 'Now'), h('b', { 'data-ta-now': '' }, fmt.price(nowP))) : null,
      mult ? h('div', { class: 'qa-outcome__x' }, h('b', { class: mult >= 1 ? 'qa-up' : 'qa-down', 'data-ta-mult': String(cp) }, fmt.mult(mult)), h('span', null, 'since the call')) : null) : null;
    const pos = callPosition(c.position);
    const prof = profileUrl({ wallet: c.author });
    const el = h('article', { class: 'qa-post ta-call' + (fresh.has(c.id) && !RM ? ' is-enter' : '') }, h('a', { class: 'cx-face', href: prof, 'aria-label': 'Open profile of ' + fmt.short(c.author) }, avatar(c.author, 'lg')),
      h('div', { class: 'qa-post__body' },
        h('div', { class: 'qa-post__head' }, h('a', { class: 'qa-post__name cx-who__link', href: prof, title: 'Open profile', 'aria-label': 'Open profile of ' + fmt.short(c.author) }, h('span', { class: 'cx-who__t' }, fmt.short(c.author)), h('span', { class: 'cx-who__chev', 'aria-hidden': 'true' }, '›')), h('span', null, age),
          h('span', { class: 'qa-post__what' }, 'called ', h('b', null, c.board?.symbol ? '$' + c.board.symbol : d.meta.symbol))),
        c.text ? h('p', { class: 'qa-post__text' }, c.text) : null,
        outcome ? h('div', { class: 'qa-post__media' }, outcome, pos) : pos ? h('div', { class: 'qa-post__media' }, pos) : null,
        h('div', { class: 'qa-reacts ta-call-acts' }, h('a', { class: 'qa-react', href: '/call/' + c.id }, icon('reply'), h('span', null, 'Open call')), h('button', { class: 'qa-react qa-react--buy', type: 'button', onclick: () => (desk.matches ? $('qxt-amount')?.focus() : window.qxSheet?.open('buy')) }, 'Buy on this call'))));
    return el;
  }));
}
function tickCalls(d) {
  const nowP = Number(d.summary?.priceUsd ?? (d.ext ? d.summary?.price : null)); if (!(nowP > 0)) return;
  for (const b of callsEl.querySelectorAll('[data-ta-now]')) b.textContent = fmt.price(nowP);
  for (const b of callsEl.querySelectorAll('[data-ta-mult]')) { const m = nowP / Number(b.dataset.taMult); b.textContent = fmt.mult(m); b.className = m >= 1 ? 'qa-up' : 'qa-down'; }
}

/* ================= Holders: where the supply sits, top wallets, burn ================= */
const holdersEl = $('ta-holders'), holdersCount = $('ta-holders-count'), holdersNote = $('ta-holders-note');
const SUPPLY_COLORS = { locked: 'var(--qa-gold)', staked: 'var(--qa-gold-hi)', pool: '#7FA7D9', burned: 'var(--qa-fire)', platform: '#9B8BD1', top: 'var(--qa-buy)', rest: 'var(--qa-rule-2)' };
const LABEL_KIND = { 'Locked (QLocks)': 'locked', 'Stakers vault': 'staked', Pool: 'pool', Burned: 'burned', 'Platform Safe': 'platform', Flywheel: 'platform' };
let holderSig = '';
function renderHolders(d) {
  const s = d.summary || {}, list = (d.holders || []).filter((x) => Number.isFinite(Number(x.units)));
  holdersCount.textContent = Number.isFinite(s.holders) ? String(s.holders) : '';
  if (!list.length) {
    if (holderSig === 'none') return; holderSig = 'none'; holdersNote.textContent = '';
    holdersEl.replaceChildren(h('div', { class: 'ta-empty' }, h('p', null, 'Holder balances for this token are in the Traders tabs.'), h('button', { type: 'button', class: 'qa-btn qa-btn--secondary qa-btn--sm', onclick: () => { doc.querySelector('#qxt-data-tabs [data-pane="holders"]')?.click(); $('traders')?.scrollIntoView({ block: 'start' }); } }, 'Open holders')));
    return;
  }
  const price = Number(s.priceUsd ?? (d.ext ? s.price : NaN));
  const total = Number(s.supply) > 0 ? Number(s.supply) + (Number(s.burned) || 0) : list.reduce((a, x) => a + Number(x.units), 0);
  const sig = total.toFixed(0) + ':' + list.slice(0, 12).map((x) => x.holder + Math.round(x.units)).join(',') + ':' + (Number.isFinite(price) ? price.toPrecision(3) : '');
  if (sig === holderSig) return; holderSig = sig;
  holdersNote.textContent = total > 0 ? 'Where the ' + fmt.tok(total) + ' supply sits' : '';
  const parts = { locked: 0, staked: 0, pool: 0, burned: Number(s.burned) || 0, platform: 0, top: 0, rest: 0 };
  const people = [];
  for (const x of list) { const k = LABEL_KIND[x.label]; if (k) { if (k !== 'burned') parts[k] += Number(x.units); } else if (x.excludedFromHolderCount) parts.platform += Number(x.units); else people.push(x); }
  people.sort((a, b) => b.units - a.units);
  parts.top = people.slice(0, 10).reduce((a, x) => a + Number(x.units), 0);
  parts.rest = Math.max(0, total - parts.locked - parts.staked - parts.pool - parts.burned - parts.platform - parts.top);
  const names = { locked: 'Locked', staked: 'Staked', pool: 'Pool', burned: 'Burned', platform: 'Platform', top: 'Top 10 wallets', rest: 'Everyone else' };
  const shares = Object.entries(parts).filter(([, v]) => v > 0 && total > 0).map(([key, v]) => ({ key, label: names[key], share: 100 * v / total }));
  const maxUnits = people[0]?.units || 1, chainId = String(d.meta.chainId);
  const rows = people.slice(0, 10).map((x, i) => {
    const pct = total > 0 ? 100 * x.units / total : null, href = EXPLORER[chainId] ? EXPLORER[chainId] + (chainId === 'solana' ? '/account/' : '/address/') + x.holder : null;
    return h(href ? 'a' : 'div', { class: 'qa-row ta-holder-row', href, target: href ? '_blank' : null, rel: href ? 'noopener' : null, style: { '--w': (100 * x.units / maxUnits).toFixed(1) + '%' } },
      h('span', { class: 'ta-holder-lead' }, h('span', { class: 'qa-rank' + (i < 3 ? ' is-top' : '') }, String(i + 1)), avatar(x.holder, 'md')),
      h('span', { class: 'qa-row__main' }, h('span', { class: 'qa-row__t' }, x.label || fmt.short(x.holder)), h('span', { class: 'qa-row__s' }, fmt.tok(Number(x.units)) + ' ' + (d.meta.symbol || ''))),
      h('span', { class: 'qa-row__v' }, pct != null ? pct.toFixed(2) + '%' : '', Number.isFinite(price) && price > 0 ? h('small', { class: 'qa-muted' }, fmt.usd(x.units * price)) : null));
  });
  holdersEl.replaceChildren(shares.length ? supplyMap(shares, SUPPLY_COLORS) : '', h('div', { class: 'qa-list ta-holder-list' }, rows));
}
/* burn: QHOOKS buybacks (the page already shows them); the countdown to the next run */
const BB = { timer: 0, nextAt: 0, cd: null, read: 0, key: '' };
async function loadBuybacks(m) {
  if (!isOfficial(m)) { $('ta-burn').replaceChildren(); BB.key = ''; return; }
  if (Date.now() - BB.read < 60000 && BB.key) return; BB.read = Date.now(); BB.key = 'q';
  try {
    const r = await fetch('/api/qhooks/buybacks', { cache: 'no-store' }); if (!r.ok) return; const j = await r.json();
    BB.nextAt = Number(j.rules?.nextAt) || 0;
    for (const b of j.burns?.recent || []) if (b.tx) C.burnTx.add(String(b.tx).toLowerCase());
    if (!BB.cd) { BB.cd = countdown({ label: 'until the next buyback', total: Number(j.rules?.cooldown) || 900 }); $('ta-burn').prepend(h('div', { class: 'ta-burn-row' }, BB.cd)); }
    clearInterval(BB.timer); const tickCd = () => BB.cd.set(BB.nextAt - Date.now() / 1000); tickCd(); BB.timer = setInterval(tickCd, 1000);
  } catch {}
}
function placeBurnParts() {
  const burn = $('ta-burn');
  for (const id of ['qxt-buybacks', 'qxt-burn-ticker']) { const n = $(id); if (n && n.parentElement !== burn) burn.append(n); }
}

/* ================= Builder: launched by, launch facts ================= */
const aboutEl = $('ta-about');
let aboutSig = '';
function renderAbout(d) {
  const m = d.meta, s = d.summary || {}, chainId = String(m.chainId), feed = art.feed || {};
  const owner = m.owner, launched = Number(feed.launchedAt || s.firstTradeAt) || 0;
  const sig = [owner, launched, feed.style, feed.kind, feed.bonded, m.token].join('|'); if (sig === aboutSig) return; aboutSig = sig;
  const rows = [];
  if (owner) rows.push(['Launched by', h('span', { class: 'ta-who' }, avatar(owner), EXPLORER[chainId] ? h('a', { href: EXPLORER[chainId] + '/address/' + owner, target: '_blank', rel: 'noopener' }, fmt.short(owner)) : fmt.short(owner))]);
  if (launched && !d.ext) rows.push(['Launched', fmt.age(Date.now() / 1000 - launched) + ' ago']);
  if (!d.ext && feed.kind === 'simple') rows.push(['Launch', [feed.style ? feed.style[0].toUpperCase() + feed.style.slice(1) : 'Simple', feed.bonded ? 'bonded' : feed.progressBps != null ? (feed.progressBps / 100).toFixed(1) + '% to bond' : ''].filter(Boolean).join(' · ')]);
  if (m.token) rows.push(['Contract', h('span', { class: 'ta-who' }, EXPLORER[chainId] ? h('a', { href: EXPLORER[chainId] + (chainId === 'solana' ? '/token/' : '/token/') + m.token, target: '_blank', rel: 'noopener' }, fmt.short(m.token), icon('out')) : fmt.short(m.token))]);
  rows.push(['Chain', CHAIN[chainId] || chainId]);
  aboutEl.replaceChildren(h('dl', { class: 'qa-kv ta-kv' }, rows.map(([k, v]) => h('div', null, h('dt', null, k), h('dd', null, v)))),
    !d.ext ? h('p', { class: 'ta-builder-cta' }, h('a', { class: 'qa-btn qa-btn--secondary qa-btn--sm', href: '/create' }, 'Launch your own'), h('a', { class: 'qa-link', href: '/community#make-a-call' }, 'Make a call', icon('out'))) : null);
}

/* ================= ticker band (desktop): other QHooks markets, live ================= */
let tickerSig = '', tickerEl = null;
function paintTicker(markets) {
  const live = (markets || []).filter((x) => x.live && x.summary && (x.summary.priceUsd > 0 || x.summary.price > 0)).slice(0, 14);
  if (live.length < 3) { tickerSlot.hidden = true; return; }
  const items = live.map((x) => ({ symbol: x.symbol, img: x.logo || x.logoURI || x.profileImage || '', price: x.summary.priceUsd || 0, change: Number(x.summary.change24) || 0, mcap: x.summary.mcapUsd ?? null, href: '#m=' + x.chainId + ':' + x.controller }));
  const sig = items.map((i) => i.symbol + i.price.toPrecision(4) + i.change.toFixed(3)).join('|');
  tickerSlot.hidden = false; if (sig === tickerSig) return;
  if (!tickerEl || tickerEl.dataset.n !== String(items.length)) { tickerEl = ticker(items, 3); tickerEl.dataset.n = String(items.length); tickerSlot.replaceChildren(tickerEl); tickerSig = sig; return; }
  // in place: prices that moved flash
  const nodes = [...tickerEl.querySelectorAll('.qa-tk')];
  nodes.forEach((a, i) => { const it = items[i % items.length], spans = a.querySelectorAll('span'), b = a.querySelector('b'); const np = fmt.price(it.price);
    if (spans[0] && spans[0].textContent !== np) { spans[0].textContent = np; tickSet(a, 'ta-tk-tick', 900); }
    if (b) { b.textContent = fmt.pct(it.change); b.className = it.change > .0005 ? 'qa-up' : it.change < -.0005 ? 'qa-down' : ''; }
    if (spans[1] && it.mcap != null) spans[1].textContent = 'MC ' + fmt.usd(it.mcap); });
  tickerSig = sig;
}

/* ================= the paint: everything follows the terminal's market read ================= */
const T = { key: '', trades: null, holders: null, lastPrice: null, lastTs: 0 };
function setMode(token) {
  body.classList.toggle('ta-token', token);
  body.classList.toggle('qa-shell--detail', token);
  body.classList.toggle('qa-shell--over-art', token);
  top.hidden = !token;
  const drop = doc.querySelector('.qx-drop[data-drop-banner]');
  if (drop && token && drop.parentElement !== chartWrap) chartWrap.append(drop);
  if (drop && !token && drop.parentElement === chartWrap) main.before(drop);
  if (token) startOverlay();
}
function paint() {
  const A = api(), d = A?.display?.(); if (!d?.meta) return;
  const sel = A.state.sel, m = d.meta, s = d.summary || {};
  const key = sel ? (sel.ext ? 't:' + sel.chainId + ':' + sel.ext : 'm:' + sel.chainId + ':' + sel.controller) : '';
  setMode(true);
  const switched = key !== T.key;
  if (switched) {
    T.key = key; T.trades = null; T.holders = null; T.lastPrice = null; seenRows = null; holderSig = ''; aboutSig = ''; statKey = key;
    CL.calls = []; CL.seeded = false; clearInterval(CL.timer); C.marks = []; C.pins = []; paintedArt = '';
    art.feed = (A.state.markets || []).find((x) => String(x.chainId) === String(m.chainId) && String(x.token || '').toLowerCase() === String(m.token || '').toLowerCase()) || null;
    art.profile = null; callsEl.replaceChildren(); callsCount.textContent = ''; holdersEl.replaceChildren(); slabTape.replaceChildren();
    if (shell) shell.setTitle(m.symbol || 'Token');
    void loadCalls(d); CL.timer = setInterval(() => { const dd = api()?.display?.(); if (dd && main.classList.contains('has-market')) void loadCalls(dd, { poll: true }); }, 30000);
  }
  // identity
  sealEl.hidden = !isOfficial(m);
  const chainId = String(m.chainId);
  chainMeta.lastChild.textContent = CHAIN[chainId] || chainId; chainMeta.firstChild.style.setProperty('background', CHAIN_DOT[chainId] || 'var(--qa-gold)'); chainMeta.firstChild.style.setProperty('box-shadow', '0 0 9px ' + (CHAIN_DOT[chainId] || 'var(--qa-gold)'));
  nameMeta.hidden = !m.name || m.name.toLowerCase() === (m.symbol || '').toLowerCase();
  coinLetter.textContent = (m.symbol || '?').replace(/^\$/, '').slice(0, 1).toUpperCase();
  for (const id of ['qxt-official', 'qxt-trust']) { const n = $(id); if (n && n.parentElement !== markSlot) markSlot.append(n); }
  paintArt(m); paintSocials(m); paintProof(); placeTools(); placeBack(); placeBurnParts(); placeLimit(); placeChartParts();
  // price: dollars when known; the quote price otherwise
  const usd = Number(s.priceUsd ?? (d.ext ? s.price : NaN)), q = Number(s.price);
  const live = Number.isFinite(usd) && usd > 0 ? usd : null;
  const dir = T.lastPrice != null && live != null && live !== T.lastPrice ? (live > T.lastPrice ? 1 : -1) : 0;
  if (live != null) { P.price.set(live, dir); P.price.el.classList.remove('ta-quote-unit'); }
  else if (q > 0) { P.price.el.textContent = fmt.price(q).slice(1) + ' ' + (m.quoteSymbol || ''); P.price.el.classList.add('ta-quote-unit'); }
  else { P.price.el.textContent = '—'; }
  const ch = Number(s.change24);
  if (Number.isFinite(ch)) { const delta = live != null && ch > -1 ? live - live / (1 + ch) : null; P.change.set(ch, { label: '24h', delta, words: 'past day', pulse: !!dir }); P.change.el.hidden = false; } else P.change.el.hidden = true;
  if (live != null) T.lastPrice = live;
  // pressure: buys vs sells, last 24h
  const b24 = Number(s.buys24), s24 = Number(s.sells24);
  if (b24 + s24 > 0) { pressure.hidden = false; const [pb, ps] = pressure.querySelectorAll('.qa-pressure__bar span'); pb.style.flexGrow = b24; ps.style.flexGrow = s24; const lg = pressure.querySelectorAll('.qa-pressure__legend span'); lg[0].textContent = b24.toLocaleString('en-US') + ' buys'; lg[2].textContent = s24.toLocaleString('en-US') + ' sells'; } else pressure.hidden = true;
  // live label + trades
  const trades = (d.trades || []).filter((t) => t && t.ts);
  const latest = trades.reduce((a, t) => Math.max(a, t.ts), Number(s.lastTradeAt) || 0);
  const tradeKey = (t) => t.id || t.tx + ':' + (t.logIndex ?? t.idx ?? '');
  const usdOf = (t) => Number(t.valueUsd ?? (d.ext ? t.quote : NaN));
  if (d.refreshing || d.providerLive) P.live.refreshing(false);
  if (latest) P.live.setLast(Math.max(0, Date.now() - latest * 1000));
  // chart marks: the latest trades and buybacks
  C.marks = trades.slice(0, 80).map((t) => ({ ts: t.ts, kind: C.burnTx.has(String(t.tx || '').toLowerCase()) ? 'burn' : t.buy ? 'buy' : 'sell', usd: usdOf(t) || 1 }));
  if (T.trades) {
    const fresh = trades.filter((t) => !T.trades.has(tradeKey(t))).sort((a, b) => a.ts - b.ts).slice(-6);
    for (const t of fresh) {
      const v = usdOf(t), dirT = t.buy ? 1 : -1, burn = C.burnTx.has(String(t.tx || '').toLowerCase());
      pulseCoin(dirT); P.live.hit(); chartTrade(burn ? 'burn' : t.buy ? 'buy' : 'sell', v || 0);
      pushSlab(t, d, true);
      // a wallet that did not hold before and now does: a new holder
      if (t.buy && T.holders && !d.ext && t.trader && !T.holders.has(String(t.trader).toLowerCase()) && (d.holders || []).some((x) => String(x.holder).toLowerCase() === String(t.trader).toLowerCase()))
        toast({ kind: 'holder', title: h('span', null, h('b', null, 'New holder'), ' · ' + fmt.tok(Number(t.token) || 0) + ' ' + (m.symbol || '')), body: fmt.short(t.trader) + (v > 0 ? ' bought ' + fmt.usdExact(v) : ' bought'), ava: avatar(t.trader) });
    }
  } else {
    slabTape.replaceChildren(); [...trades].sort((a, b) => b.ts - a.ts).slice(0, 9).reverse().forEach((t) => pushSlab(t, d, false));
  }
  T.trades = new Set(trades.map(tradeKey));
  if (!d.ext && d.holders?.length) T.holders = new Set(d.holders.map((x) => String(x.holder).toLowerCase()));
  // sections
  renderHolders(d); renderAbout(d); tickCalls(d); void loadBuybacks(m);
  C.pins = CL.calls.filter((c) => c.call?.at).map((c) => ({ ts: Math.floor(Number(c.call.at) / 1000) }));
  syncStats(); syncSeries(); placeToasts();
}
function pushSlab(t, d, enter) {
  const usd = Number(t.valueUsd ?? (d.ext ? t.quote : NaN));
  const row = { ts: t.ts, b: t.buy ? 1 : 0, usd: Number.isFinite(usd) ? usd : 0, tok: Number(t.token) || 0, w: t.trader || '', bb: C.burnTx.has(String(t.tx || '').toLowerCase()) };
  const li = h('li', { class: `qa-trow ${row.bb ? 'is-burn' : row.b ? 'is-buy' : 'is-sell'}${row.usd >= 300 ? ' is-big' : ''}${enter && !RM ? ' is-enter' : ''}`, style: { '--w': Math.min(100, 8 + 21 * Math.log10(1 + row.usd)).toFixed(1) + '%' } },
    icon(row.bb ? 'flame' : row.b ? 'up' : 'down', 'qa-glyph'), h('span', { class: 'qa-trow__usd' }, Number.isFinite(usd) ? fmt.usdExact(row.usd) : fmt.tok(row.tok)),
    h('span', { class: 'qa-trow__who' }, row.bb ? keeperAvatar() : avatar(row.w), h('span', null, row.bb ? 'Buyback' : fmt.short(row.w))), h('span', { class: 'qa-trow__age', dataset: { ts: String(row.ts) } }, fmt.age(Date.now() / 1000 - row.ts)));
  slabTape.prepend(li); while (slabTape.children.length > 9) slabTape.lastElementChild.remove();
}
setInterval(() => { const now = Date.now() / 1000; for (const n of slabTape.querySelectorAll('[data-ts]')) n.textContent = fmt.age(now - +n.dataset.ts); }, 1000);
function clear() { setMode(false); if (shell) shell.setTitle('Trade'); clearInterval(CL.timer); T.key = ''; root.style.removeProperty('--qa-banner-blur'); paintedArt = ''; }

doc.addEventListener('qxt:paint', paint);
doc.addEventListener('qxt:clear', () => { if (!api()?.state?.sel) clear(); });
doc.addEventListener('qxt:discover', clear);
function connect() {
  const A = api(); if (!A || connect.done) return; connect.done = true;
  A.onMarkets((markets) => { paintTicker(markets); if (T.key && !art.feed) { const d = A.display?.(); if (d) { art.feed = (markets || []).find((x) => String(x.chainId) === String(d.meta.chainId) && String(x.token || '').toLowerCase() === String(d.meta.token || '').toLowerCase()) || null; paintArt(d.meta); } } });
  if (A.state.data) paint();
}
doc.addEventListener('qxt:ready', connect); connect();

/* ================= layout follow-ups ================= */
function relayout() { placeSearch(); placeTools(); placeToasts(); }
desk.addEventListener('change', relayout);
new MutationObserver(() => placeSearch()).observe(main, { childList: true });
relayout();
// The token list's live rows: a row whose price moved washes in its direction (qx-terminal-feed.mjs marks the cell).
