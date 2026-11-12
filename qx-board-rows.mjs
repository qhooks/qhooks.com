import {boardUrl} from './qx-board-address.mjs';
import {priceText,moveText} from './qx-call-format.mjs';
import {profileUrl} from './qx-profile-address.mjs';
// Board rows and small formatters shared by the board page, the Community hub and profiles (no side effects on import).
import { CHAIN_NAME, h } from '/qx-chain.mjs';
import {memberIdentity} from './qx-member-identity.mjs';
import {checkpointView,scoreCoverageText} from './qx-caller-score-ui.mjs';
import {firstCallPrompt} from './qx-community-empty.mjs';
export const num = n => Number(n || 0).toLocaleString();
export const boardPath = boardUrl;
export const chainName = chain => chain === 'solana' ? 'Solana' : String(chain)==='99901'?'Elysium':CHAIN_NAME[chain] || chain;
// The same address mark works for EVM and case-sensitive Solana identities.
export function addressMark(address) {
  const value = String(address || ''), n = /^0x[0-9a-f]+$/i.test(value) ? BigInt(value) : [...value].reduce((n, ch) => (n * 31n + BigInt(ch.charCodeAt(0))) & 0xffffffffn, 0n);
  const hue = Number(n % 50n) + 25, hue2 = Number((n >> 8n) % 60n) + 90, ang = Number((n >> 16n) % 360n);
  // noir + gold (2026-11-12): the shared avatar family
  return h('span', { class: 'qb-mark', 'aria-hidden': 'true', style: 'background:' + `radial-gradient(circle at 30% 24%, rgba(255,248,232,.32), transparent 56%), conic-gradient(from ${(ang) % 360}deg, ${[['#f1e7d0','#c99a52'],['#d2ad72','#2a1d0e'],['#e8cf99','#0d0c0a'],['#9a6f33','#f1e7d0'],['#6e4c1f','#0d0c0a'],['#f6efe0','#4a3418'],['#b8894a','#14110c'],['#0d0c0a','#d9b779']][(Number(n % 8n)) % 8][0]} 0 ${30 + (Number((n >> 24n) % 41n)) % 41}%, ${[['#f1e7d0','#c99a52'],['#d2ad72','#2a1d0e'],['#e8cf99','#0d0c0a'],['#9a6f33','#f1e7d0'],['#6e4c1f','#0d0c0a'],['#f6efe0','#4a3418'],['#b8894a','#14110c'],['#0d0c0a','#d9b779']][(Number(n % 8n)) % 8][1]} ${30 + (Number((n >> 24n) % 41n)) % 41}% 100%)` });
}
export function boardIcon(b) {
  const fallback = addressMark(b.address || b.controller), icon = h('span', { class: 'qb-token-icon', 'aria-hidden': 'true' }, fallback);
  let url; try { const u = new URL(b.logo); if (u.protocol === 'https:') url = u.href; } catch {}
  if (url) {
    const img = h('img', { class: 'qb-token-logo', src: url, alt: '', width: 32, height: 32, referrerpolicy: 'no-referrer' });
    fallback.hidden = true; img.addEventListener('error', () => { img.hidden = true; fallback.hidden = false; }); icon.append(img);
  }
  return icon;
}
export function ago(ms) {
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min'; if (s < 86400) return Math.floor(s / 3600) + ' h';
  if (s < 7 * 86400) return Math.floor(s / 86400) + ' d';
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(s > 300 * 86400 ? { year: 'numeric' } : {}) });
}
export const emptyNote = text => h('p', { class: 'qa-empty' }, text);
// Calls use quote-token prices and percentage moves, never a dollar-profit estimate.
export {priceText,moveText} from './qx-call-format.mjs';
export const qualityText = value => value == null ? '—' : moveText(1 + Number(value));
export function callLabels(call) {
  const labels=new Set(call?.labels||[]);if(call?.scoreV2?.indexedFirstDaySales?.status==='observed')labels.add('indexedSales');else if(!call?.scoreV2&&call?.soldAfter)labels.add('legacySale');
  return[...labels].map(key=>({creator_call:"Creator's call",linked:'Known creator link',indexedSales:'Indexed first-day sales · outcome retained',legacySale:'Indexed sale'})[key]).filter(Boolean);
}
export function callLabelPills(call) { return callLabels(call).map(label => h('span', { class: 'qb-badge qb-call-label' }, label)); }
function agoText(at){const s=Math.max(0,Math.round((Date.now()-at)/1000));return s<90?'Live · '+s+'s ago':s<5400?'Live · '+Math.round(s/60)+'m ago':'Live · '+Math.round(s/3600)+'h ago';}
export function callRecord(call) {
  const c=call||{},top=h('div',{class:'qb-call-head'},h('b',{},'Call'),h('span',{class:'qb-call-price'},priceText(c.price)+' '+(c.quoteSymbol||'')));
  const points=[checkpointView(c,'day'),checkpointView(c,'week')],figures=h('div',{class:'qb-call-figures'},...points.map(point=>{
   const observed=point.status==='observed',direction=!observed?'':point.price>c.price?' is-up':point.price<c.price?' is-down':'';
   return h('div',{class:'qb-call-figure'+direction},h('span',{},point.label),h('b',{},priceText(point.price)),observed?h('small',{},moveText(point.price,c.price)):null,h('small',{},point.note));
  }),c.price1h!=null?h('div',{class:'qb-call-figure'+(c.price1h>c.price?' is-up':c.price1h<c.price?' is-down':'')},h('span',{},'1h'),h('b',{},priceText(c.price1h)),h('small',{},moveText(c.price1h,c.price))):null,
  c.priceNow!=null?h('div',{class:'qb-call-figure'+(c.priceNow>c.price?' is-up':c.priceNow<c.price?' is-down':'')},h('span',{},'Now'),h('b',{},priceText(c.priceNow)),h('small',{},moveText(c.priceNow,c.price)+(Number.isSafeInteger(c.priceNowAt)?' · '+agoText(c.priceNowAt):''))):null);
  const labels=callLabelPills(c),ref=callRef(c.ref),proof=points.filter(point=>point.provenance&&Number.isSafeInteger(point.observedAt));
  const details=proof.length?h('details',{class:'qb-call-proof'},h('summary',{},'Indexed quote sources'),...proof.map(point=>h('p',{},point.label+' · '+point.note+' · block '+point.provenance.block+' · ',h('code',{},point.provenance.transaction)))):null;
  return h('section',{class:'qb-call','aria-label':'Call record'},top,figures,labels.length?h('div',{class:'qb-call-labels'},...labels):null,details,ref?h('a',{class:'qb-call-ref',href:ref,rel:'nofollow ugc noopener'},'Trade via this call'):null);
}
function callRef(ref) {
  try {
    const u = new URL(ref), launch = /^\/l\/\d+\/0x[0-9a-f]{40}$/.test(u.pathname);
    const token = ['/terminal', '/terminal.html'].includes(u.pathname) && /^#t=(?:(?:8453|1|42161|56|4663):0x[0-9a-f]{40}|solana:[1-9A-HJ-NP-Za-km-z]{32,44})$/.test(u.hash);
    return u.origin === 'https://qhooks.com' && (launch || token) && /^0x[0-9a-f]{40}$/.test(u.searchParams.get('ref') || '') ? u.href : null;
  } catch { return null; }
}
export function callerRow(c,rank){
 const wallet=String(c.wallet||''),valid=c.version===2&&c.rankEligible&&c.coverage?.completeRecordSet;
 return h('a',{class:'qb-caller-row',href:profileUrl({wallet,handle:c.handle}),title:wallet},h('span',{class:'qb-caller-rank'},valid?String(rank):'—'),memberIdentity(wallet,{linked:false,mark:addressMark(wallet),className:'qb-caller-wallet'}),
  h('span',{class:'qb-caller-hit'},h('b',{},valid?Math.round(c.hitRate*100)+'%':'—'),h('small',{},num(c.hits)+' / '+num(c.counted)+' timed hits')),
  h('span',{class:'qb-caller-quality'},h('b',{},qualityText(c.quality)),h('small',{},'24h/7d median · '+num(c.qualityN)+' calls')),
  h('span',{class:'qb-caller-count'},scoreCoverageText(c)));
}
/** The boards with recent posts, across launches and outside tokens. */
export function boardRow(b) {
  const token = b.kind === 'token';
  return h('a', { class: 'qb-row', href: boardPath(b) },
    h('span', { class: 'qb-row-name' }, token ? boardIcon(b) : null, h('b', {}, b.name), ' ', h('code', {}, '$' + b.symbol), h('span', { class: 'qa-chain' }, chainName(b.chainId)), token ? h('span', { class: 'qb-outside' }, 'Not a QHooks launch') : b.gate ? h('span', { class: 'qb-gate-chip is-gated' }, 'Holders post') : null),
    b.announcement ? h('span', { class: 'qb-row-ann' }, b.announcement) : null,
    h('span', { class: 'qb-row-meta' }, num(b.posts) + ' post' + (b.posts === 1 ? '' : 's') + (b.replies ? ' · ' + num(b.replies) + ' repl' + (b.replies === 1 ? 'y' : 'ies') : '') + (b.lastPostAt ? ' · latest ' + ago(b.lastPostAt) : '')));
}

/** Two tabs over the active boards: "QHooks launches" (default) and "All tokens", each by latest activity (/api/community/boards?kind=).
 *  Returns one element; each tab loads its list once, on first open. */
export function boardTabs({ limit = 50, empty = {} } = {}) {
  const TABS = [['launch', 'QHooks launches'], ['token', 'All tokens']], cache = new Map();
  const list = h('div', { class: 'qb-rows', 'aria-live': 'polite' }), bar = h('div', { class: 'qb-orders qb-tabs', role: 'tablist', 'aria-label': 'Boards' });
  let current = null;
  const show = async kind => {
    current = kind;
    for (const b of bar.children) { const on = b.getAttribute('data-kind') === kind; b.setAttribute('aria-selected', String(on)); b.setAttribute('aria-pressed', String(on)); b.tabIndex = on ? 0 : -1; }
    if (!cache.has(kind)) cache.set(kind, fetch('/api/community/boards?kind=' + kind, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null));
    list.replaceChildren(h('p', { class: 'qa-loading' }, 'Reading boards…'));
    const j = await cache.get(kind), valid = Array.isArray(j?.boards), rows = valid ? j.boards.slice(0, limit) : [];
    if (current !== kind) return;
    if(!valid){const retry=h('button',{type:'button',class:'qa-btn'},'Retry boards');retry.addEventListener('click',()=>{cache.delete(kind);show(kind);});list.replaceChildren(emptyNote('The boards did not answer. Try the read again.'),retry);return;}
    list.replaceChildren(...(rows.length?rows.map(boardRow):[firstCallPrompt(document,{text:empty[kind]||(kind==='launch'?'No QHooks launch board has posts yet.':'No token board has posts yet.')})]));
  };
  for (const [kind, label] of TABS) { const b = h('button', { type: 'button', class: 'qb-order', role: 'tab', 'data-kind': kind }, label); b.addEventListener('click', () => show(kind)); bar.append(b); }
  bar.addEventListener('keydown', e => { if (!/^Arrow(Left|Right)$/.test(e.key)) return; const next = [...bar.children].find(b => b.getAttribute('data-kind') !== current); next?.click(); next?.focus(); });
  show('launch');
  return h('div', { class: 'qb-tabbed' }, bar, list);
}
