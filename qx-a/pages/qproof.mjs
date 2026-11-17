// QProof page (qhooks.com/qproof): check any token, pool, wallet, chart link or GitHub repository, read the report, share
// it, scan code, and (QHOOKS holders) run the scanned checks. Every request goes to this site's own /api/qproof/* routes.
// Stored reports are read first; a fresh check runs only when the visitor presses Check. Nothing here asks for a wallet
// except the holder step of "Run it".
import '/qx-a/pages/hooks-lane.mjs';
import { connectedAddress, onWalletChange, signMessage } from '/qx-chain.mjs';
import {readQProofPresentation,renderQProofSummary,safeQProofUrl,ensureQProofStyles,qproofReadParams,qproofReportLocation} from '/qproof-view.mjs';
ensureQProofStyles();

const $ = (id) => document.getElementById(id);
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
function h(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c);
  return n;
}
const CHAIN = { solana: 'Solana', base: 'Base', ethereum: 'Ethereum', arbitrum: 'Arbitrum', bnb: 'BNB Chain', robinhood: 'Robinhood Chain', elysium: 'Elysium', github: 'GitHub' };
const EXPLORER = { base: 'https://basescan.org', ethereum: 'https://etherscan.io', arbitrum: 'https://arbiscan.io', bnb: 'https://bscscan.com', robinhood: 'https://robinhoodchain.blockscout.com', elysium: 'https://elysium.kinetiq.xyz', solana: 'https://solscan.io' };
const WORD = { danger: 'Danger', caution: 'Watch', clear: 'Passed', unknown: 'Not checked', info: 'Note' };
const RANK = { danger: 0, caution: 1, clear: 2, unknown: 3, info: 4 };
const QHOOKS = '4663:0x20429af7ca3b0ce4d99edbaa0693f26c5df05195';
// What each check means, in plain words (the engine's own line follows it).
const MEANS = {
  upgradeable: 'If the code can be swapped, every other check can change after you buy.',
  functions: 'Switches like these let someone mint supply, block your wallet, pause trading or raise the sell fee.',
  liquidity: 'Thin liquidity means a small sale moves the price a lot.',
  'lp-burn': 'Unlocked launch liquidity can be pulled, leaving holders unable to sell.',
  'sell-simulation': 'A buy and an immediate sell, simulated with nothing sent: shows the real tax and that selling works.',
  'sell-route': 'Whether a sell can actually be routed right now.',
  holders: 'A few wallets holding most of the supply can sell into everyone else.',
  'creator-sells': 'Shows whether the wallet that created the token has been selling it.',
  'launch-creator': 'Who controls the launch’s settings, and how that control is protected.',
  source: 'Published, verified source lets anyone read what the code does.',
  ownership: 'An owner can sometimes change settings; no owner means fewer levers.',
  'pair-age': 'Very new pools carry more risk: less history to judge.',
};
const short = (a) => (a && a.length > 14 ? a.slice(0, a.startsWith('0x') ? 6 : 4) + '…' + a.slice(-4) : a || '—');
const pct = (v) => (v == null ? '—' : v >= 10 ? v.toFixed(1) + '%' : v >= 0.1 ? v.toFixed(2) + '%' : v > 0 ? '<0.1%' : '0%');
const money = (v) => (v == null || !Number.isFinite(+v) ? '—' : v >= 1e9 ? '$' + (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? '$' + (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? '$' + (v / 1e3).toFixed(1) + 'K' : v >= 1 ? '$' + (+v).toFixed(2) : v > 0 ? '$' + (+v).toPrecision(3) : '$0');
const num = (v) => (v == null || !Number.isFinite(v) ? '—' : v >= 1e9 ? (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : v >= 1 ? v.toFixed(2) : v.toPrecision(3));
const ago = (iso) => { const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000); return s < 90 ? Math.round(s) + ' s ago' : s < 5400 ? Math.round(s / 60) + ' min ago' : s < 172800 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' days ago'; };
const units = (raw, d = 18) => { try { return Number(BigInt(raw)) / 10 ** d; } catch { return null; } };
const isEvm = (v) => /^0x[0-9a-fA-F]{40}$/.test(v), isSol = (v) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v), isRepo = (v) => /^(?:https?:\/\/)?(?:www\.)?github\.com\/[^/\s]+\/[^/\s]+/i.test(v);
function detect(v) {
  v = v.trim(); if (!v) return '';
  if (isRepo(v)) return 'GitHub repository';
  if (isEvm(v)) return 'EVM address';
  if (isSol(v)) return 'Solana address';
  if (/^https?:\/\//i.test(v) || /^[\w.-]+\.[a-z]{2,}\//i.test(v)) return 'Chart link';
  return 'Text (the first address in it is checked)';
}
function explorer(chain, addr, kind = 'address') {
  const base = EXPLORER[chain]; if (!base || !addr) return null;
  if (chain === 'solana') return base + '/' + (kind === 'tx' ? 'tx' : 'account') + '/' + addr;
  if (/^0x[0-9a-f]{64}$/i.test(addr) && kind !== 'tx') return null; // V4 pool ids are not addresses
  return base + '/' + (kind === 'tx' ? 'tx' : 'address') + '/' + addr;
}
const addrLink = (chain, addr, label) => { const u = explorer(chain, addr); return u ? h('a', { class: 'qp-addr', href: u, target: '_blank', rel: 'noopener noreferrer' }, label || short(addr)) : h('code', { class: 'qp-addr' }, label || short(addr)); };

async function api(path, body) {
  const readParams=qproofReadParams();if(!body&&path.startsWith('latest?')&&readParams.cached_only)path+='&'+new URLSearchParams(readParams);
  if(body&&path==='check'&&readParams.cached_only)throw Error('This view reads stored reports only.');
  const r = await fetch('/api/qproof/' + path, { method: body ? 'POST' : 'GET', headers: body ? { 'content-type': 'application/json' } : { accept: 'application/json' }, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin', cache: 'no-store' });
  let data = null; try { data = await r.json(); } catch {}
  if (!r.ok) throw Object.assign(Error(data?.message || (data?.error && !/^[a-z_]+$/.test(data.error) ? data.error : 'QProof could not finish that. Try again shortly.')), { status: r.status, code: data?.error, retryAt: data?.retryAt || (data?.retryAfterSeconds ? new Date(Date.now() + data.retryAfterSeconds * 1000).toISOString() : undefined) });
  return data;
}

/* ---------- check form ---------- */
const form = $('qp-form'), q = $('qp-q'), chainSel = $('qp-chain'), go = $('qp-go'), msg = $('qp-msg'), out = $('qp-report');
let busy = false, shown = null;
const sync = () => { const d = detect(q.value); $('qp-detected').textContent = d ? 'Reading this as: ' + d : ''; };
q.addEventListener('input', sync);
for (const [label, query, chain] of [['QHOOKS', '0x20429af7ca3b0ce4d99edbaa0693f26c5df05195', 'robinhood'], ['DEGEN · Base', '0x4ed4e862860bed51a9570b96d89af5e1b0efefed', 'base'], ['BONK · Solana', 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', 'solana']])
  $('qp-tries').append(h('button', { type: 'button', class: 'qp-try', onclick: () => { q.value = query; chainSel.value = chain; sync(); run(); } }, 'Try ', h('b', null, label)));
form.addEventListener('submit', (e) => { e.preventDefault(); run(); });

function checking(label) {
  focusReportLayout();
  out.hidden = false;
  out.replaceChildren(h('div', { class: 'qp-verdict is-wait' }, h('p', { class: 'qp-k' }, 'Checking…'), h('p', { class: 'qp-headline' }, label), h('span', { class: 'qa-skel' })),
    ...['Checks', 'Buy-and-sell test', 'Supply map', 'Holders', 'Market'].map((t) => h('section', { class: 'qp-sec is-wait' }, h('h3', { class: 'qp-sec__h' }, t), h('p', { class: 'qp-wait' }, 'Checking…'), h('span', { class: 'qa-skel' }))));
}
async function run({ fresh = false } = {}) {
  const query = q.value.trim(); let chain = chainSel.value;
  if (busy) return;
  if (!query) { msg.textContent = 'Paste an address, a chart link or a GitHub repository.'; q.focus(); return; }
  if (isSol(query) && !isEvm(query)) chain = chain && chain !== 'solana' ? chain : 'solana';
  if (chain === 'solana' && isEvm(query)) { msg.textContent = 'That is an EVM address. Pick its chain, or leave the chain on auto-detect.'; return; }
  busy = true; go.disabled = true; go.textContent = 'Checking…'; msg.textContent = ''; checking(short(query) + (chain ? ' · ' + CHAIN[chain] : ''));
  try {
    // 1. Stored report first, for an exact address on a known chain.
    if (!fresh && chain && (isEvm(query) || (chain === 'solana' && isSol(query)))) {
      const got = await api('latest?' + new URLSearchParams({ chain, address: query })).catch(() => null);
      if (got?.report) { show(got.report, { stored: true,envelope:got }); return; }
    }
    // 2. A fresh check.
    const got = await api('check', { query, ...(chain ? { chain } : {}) });
    show(got.report, { stored: false,envelope:got });
  } catch (e) {
    msg.textContent = e.message + (e.retryAt ? ' Try again after ' + new Date(e.retryAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '.' : '');
    if (shown) render(shown.report, shown.opts); else { out.hidden = true; out.replaceChildren(); }
  } finally { busy = false; go.disabled = false; go.textContent = 'Check'; }
}
function show(report, opts) {
  shown = { report, opts };
  const path=report.subject?.type==='token'&&report.subject?.chain&&report.subject?.address?'/proof/'+encodeURIComponent(report.subject.chain)+'/'+encodeURIComponent(report.subject.address):report.id?'/qproof/'+report.id:null;
  if(path){const next=qproofReportLocation(path);if(location.pathname+location.search!==next)history.replaceState(null,'',next);}
  render(report, opts);
  if (isRepo(q.value) && !$('qp-repo').value) $('qp-repo').value = q.value.trim().replace(/^(?!https?:\/\/)/, 'https://');
}

/* ---------- report ---------- */
function focusReportLayout(){
 document.body.classList.add('qp-has-report');
 const hero=document.querySelector('.qp-hero');if(hero&&out.nextElementSibling!==hero)out.after(hero);
 const old=hero?.querySelector('h1');if(old){const heading=document.createElement('h2');heading.className='qp-h2';heading.textContent='Check another token';old.replaceWith(heading);}
}
function reveal(nodes){nodes.forEach(n=>n.classList.add('qp-in'));}
async function refreshReport(){
 const r=shown?.report,s=r?.subject;if(!s?.chain||!s?.address)return;
 const button=out.querySelector('[data-proof-action="refresh"]');if(button){button.disabled=true;button.textContent='Reading…';}
 try{const got=await api('latest?'+new URLSearchParams({chain:s.chain,address:s.address}));if(got?.report){show(got.report,{stored:true,envelope:got});}else{const note=out.querySelector('.qp-refresh-note');if(note)note.textContent=got?.freshness?.refreshQueued?'A check is queued.':'No stored report is available yet.';}}
 catch(e){const note=out.querySelector('.qp-refresh-note');if(note)note.textContent=e.message;}
 finally{if(button?.isConnected){button.disabled=false;button.textContent='Refresh';}}
}
function render(r,opts={}){
 focusReportLayout();
 const s=r.subject||{},o=r.observations||{},p=readQProofPresentation(opts.envelope||r),chain=s.chain||r.input?.chain,summary=renderQProofSummary(h,p,{onRefresh:refreshReport});
 const stable=s.type==='token'&&s.address&&chain?'/proof/'+encodeURIComponent(chain)+'/'+encodeURIComponent(s.address):r.id?'/qproof/'+r.id:'/qproof';
 const link=safeQProofUrl(p.links.report)||location.origin+stable;
 const copy=h('button',{type:'button',class:'qa-btn qa-btn--secondary qa-btn--sm qp-copy',onclick:async e=>{try{await navigator.clipboard.writeText(link);e.currentTarget.textContent='Link copied';}catch{e.currentTarget.textContent=stable;}}},'Copy link');
 const name=s.name||o.market?.listedName||s.label||short(s.address),symbol=o.market?.listedSymbol||String(s.label||'').replace(/^\$/,'');
 const image=o.profile?.image,avatar=h('span',{class:'qp-token-avatar','aria-hidden':'true'},String(symbol||name||'?').slice(0,1).toUpperCase());
 if(typeof image==='string'&&/^data:image\/(?:png|webp|jpeg);base64,[A-Za-z0-9+/=]+$/.test(image)&&image.length<262144){const img=h('img',{src:image,alt:'',onerror:()=>img.remove()});avatar.append(img);}
 const price=typeof o.market?.priceUsd==='string'&&/^\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(o.market.priceUsd)?Number(o.market.priceUsd):typeof o.market?.priceUsd==='number'?o.market.priceUsd:null;
 const chainIds={robinhood:'4663',base:'8453',ethereum:'1',arbitrum:'42161',bnb:'56',elysium:'99901',solana:'solana'},trade=s.type==='token'&&chainIds[chain]&&s.address?'/terminal#t='+chainIds[chain]+':'+s.address:null;
 const tokenHeader=h('header',{class:'qp-token-header'},h('div',{class:'qp-token-title'},avatar,h('div',null,h('p',{class:'qp-token-chain'},CHAIN[chain]||chain||'QProof'),h('h1',null,name),symbol&&symbol!==name?h('p',{class:'qp-token-symbol'},symbol):null)),
  s.address?h('p',{class:'qp-token-address'},addrLink(chain,s.address),h('button',{type:'button',class:'qp-address-copy',onclick:async e=>{try{await navigator.clipboard.writeText(s.address);e.currentTarget.textContent='Copied';}catch{e.currentTarget.textContent=s.address;}}},'Copy')):null,
  price!==null||o.market?.marketCap!=null?h('dl',{class:'qp-token-market'},price!==null?h('div',null,h('dt',null,'Price'),h('dd',null,money(price))):null,o.market?.marketCap!=null?h('div',null,h('dt',null,'Market cap'),h('dd',null,money(o.market.marketCap))):null):null);
 document.title=name+' · '+p.verdict.label+' · QProof | QHooks';
 const aside=h('aside',{class:'qp-report-summary'},tokenHeader,summary.bar,summary.strip,summary.fee,
  h('p',{class:'qp-refresh-note',role:'status'},p.freshness.refreshQueued?'A refresh is queued. Showing the last report.':p.freshness.nextRefreshAt?'Next scheduled refresh window after '+new Date(p.freshness.nextRefreshAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})+'.':''),
  h('div',{class:'qp-actions'},copy,trade?h('a',{class:'qa-btn qa-btn--primary',href:trade},'Trade on QHooks'):null),
  p.links.reportVersion?h('a',{class:'qp-version-link',href:p.links.reportVersion},'This report version'):null);
 const sections=[sellSection(o,chain,r),supplySection(o,s),holdersSection(o,chain),creatorSection(r,o,s,chain),marketSection(o,r),repoSection(s),readsSection(r)].filter(Boolean);
 const details=sections.map(section=>{const title=section.querySelector('h3')?.textContent||'Evidence',first=section.querySelector('p')?.textContent||'',node=h('details',{class:'qp-report-section'},h('summary',null,h('b',null,title),first?h('span',null,first.length>120?first.slice(0,117)+'…':first):null),section);if(title==='Audit trail')node.id='qp-audit-trail';return node;});
 const main=h('div',{class:'qp-report-sections'},checksSection(r,chain),...details);
 out.hidden=false;out.replaceChildren(h('div',{class:'qp-report-layout'},aside,main));reveal([aside,main]);
}
function sec(title, ...body) { return h('section', { class: 'qp-sec' }, h('h3', { class: 'qp-sec__h' }, title), ...body); }
function checksSection(r, chain) {
  const list = [...(r.checks || [])].sort((a, b) => RANK[a.status] - RANK[b.status]), scored = list.filter((x) => x.status !== 'info'), notes = list.filter((x) => x.status === 'info');
  const row = (x) => {
    const means = MEANS[x.id], reads = (x.evidence || []).map((i) => r.receipts?.[i]).filter(Boolean);
    return h('li', { class: 'qp-check is-' + x.status },
      h('div', { class: 'qp-check__top' }, h('span', { class: 'qp-st is-' + x.status }, WORD[x.status] || x.status), h('b', null, x.title)),
      means ? h('p', { class: 'qp-means' }, means) : null,
      x.detail ? h('p', { class: 'qp-detail' }, x.detail) : null,
      x.address ? h('p', { class: 'qp-detail' }, 'Contract: ', addrLink(chain, x.address)) : null,
      (x.evidenceLinks||[]).length?h('div',{class:'qp-evidence-links'},x.evidenceLinks.filter(e=>safeQProofUrl(e.url)).map(e=>h('a',{href:safeQProofUrl(e.url),target:'_blank',rel:'noopener noreferrer'},e.label||e.value||'Open evidence'))):null,
      reads.length?h('a',{class:'qp-audit-link',href:'#qp-audit-trail',onclick:()=>{const audit=$('qp-audit-trail');if(audit)audit.open=true;}},'Audit trail'):null);
  };
  const group=(title,items,collapsed=false)=>!items.length?null:collapsed?h('details',{class:'qp-finding-group'},h('summary',null,title+' ('+items.length+')'),h('ul',{class:'qp-checklist'},items.map(row))):h('section',{class:'qp-finding-group'},h('h2',null,title+' ('+items.length+')'),h('ul',{class:'qp-checklist'},items.map(row)));
  return sec('Findings',group('Red flags',scored.filter(x=>x.status==='danger')),group('Watch',scored.filter(x=>x.status==='caution')),group('Passed',scored.filter(x=>x.status==='clear'),true),group('Not checked',scored.filter(x=>x.status==='unknown'),true),group('Notes',notes,true));
}
function sellSection(o, chain, r) {
  const sim = o.simulation; if (!sim) { const sr = (r.checks || []).find((x) => x.id === 'sell-route'); return sr ? sec('Sell test', h('p', { class: 'qp-p' }, sr.title + '. ' + (sr.detail || ''))) : null; }
  const q2 = sim.quote || 'WETH', inn = units(sim.ethIn), back = units(sim.ethBack);
  const outcome = { sold: 'Bought, then sold straight back', 'buy-failed': 'The buy failed', 'sell-failed': 'The sell failed', honeypot: 'The sell failed' }[sim.outcome] || sim.outcome || 'Unknown outcome';
  const kv = [['Result', outcome], ['Spent', inn != null ? num(inn) + ' ' + q2 : '—'], ['Got back', back != null ? num(back) + ' ' + q2 : '—'], ['Returned', sim.returned != null ? pct(sim.returned) : '—'],
    ['Token buy tax · sell tax', pct(sim.buyTax ?? null) + ' · ' + pct(sim.sellTax ?? null)], ...(sim.buyCharge != null ? [['Launch charges', 'buy ' + pct(sim.buyCharge) + ' · sell ' + pct(sim.sellCharge)]] : []),
    ...(sim.lpFee != null ? [['Pool fee', pct(sim.lpFee)]] : []), ['Venue', sim.venue || '—'], ['At block', sim.block ? Number(sim.block).toLocaleString() : '—']];
  return sec('Buy-and-sell test', h('p', { class: 'qp-p' }, 'Simulated in one call at one block: nothing was sent or signed. What you get back is shaped by the pool fee, any launch charges and any token tax.'),
    h('dl', { class: 'qa-kv qp-kv' }, kv.map(([k, v]) => h('div', null, h('dt', null, k), h('dd', null, v)))),
    sim.pool ? h('p', { class: 'qp-detail' }, 'Pool ', addrLink(chain, sim.pool)) : null, sim.reason ? h('p', { class: 'qp-note' }, sim.reason) : null);
}
const SEG = { Locked: 'locked', Staked: 'staked', Burned: 'burned', 'Top 10 wallets': 'wallets', 'Everyone else': 'rest', Creator: 'creator', Owner: 'creator', Contract: 'contract', 'Program-held': 'contract', 'Bonding curve': 'pool' };
function supplySection(o, s) {
  const raw = (o.shares || []).filter((x) => x.share > 0); if (!raw.length) return s.type === 'wallet' || s.type === 'repository' ? null : sec('Supply map', h('p', { class: 'qp-p' }, 'No supply split was readable for this token.'));
  const pools = raw.filter((x) => !SEG[x.label]), shares = [...(pools.length ? [{ label: pools.length > 1 ? 'Pools' : pools[0].label, share: pools.reduce((n, x) => n + x.share, 0), cls: 'pool' }] : []), ...raw.filter((x) => SEG[x.label]).map((x) => ({ ...x, cls: SEG[x.label] }))];
  const bar = h('div', { class: 'qp-bar', role: 'img', 'aria-label': 'Supply: ' + shares.map((x) => x.label + ' ' + pct(x.share)).join(', ') }, shares.map((x) => { const i = h('i', { class: 'qp-seg is-' + x.cls, title: x.label + ' ' + pct(x.share) }); i.style.width = Math.max(0.6, x.share) + '%'; return i; }));
  const supply = s.supply ? units(s.supply, s.decimals || 0) : null;
  return sec('Supply map', bar, h('ul', { class: 'qp-legend-list' }, shares.map((x) => h('li', null, h('i', { class: 'qp-sw is-' + x.cls, 'aria-hidden': 'true' }), h('span', null, x.label + (x.source === 'QHooks pool index' ? ' (QHooks index)' : '') + (x.unranked ? ' (unranked)' : '')), h('b', null, pct(x.share))))),
    supply ? h('p', { class: 'qp-detail' }, num(supply) + ' total supply') : null);
}
function holdersSection(o, chain) {
  const hd = o.holders; if (!hd?.top?.length) return null;
  const max = Math.max(...hd.top.map((x) => x.share || 0), 1e-9);
  return sec('Top holders', h('p', { class: 'qp-detail' }, (hd.source ? 'From ' + hd.source : '') + (hd.holderCount ? ' · ' + hd.holderCount.toLocaleString() + ' holders' : '')),
    h('ol', { class: 'qp-holders' }, hd.top.slice(0, 10).map((x, i) => { const fill = h('i'); fill.style.width = Math.max(1.5, (x.share || 0) / max * 100) + '%';
      return h('li', null, h('span', { class: 'qp-rank' }, String(i + 1)), h('span', { class: 'qp-tag' }, x.label === 'Exchange' && x.tag ? x.tag : x.label || 'Wallet'), x.owner ? addrLink(chain, x.owner) : h('span', null, '—'), h('span', { class: 'qp-hbar' }, fill), h('b', null, pct(x.share))); })));
}
function creatorSection(r, o, s, chain) {
  const t = o.creatorTrail, creator = s.launch?.creator || s.creator, rows = (r.checks || []).filter((x) => /creator/.test(x.id || ''));
  if (!t && !creator && !rows.length) return null;
  return sec('Creator trail', creator ? h('p', { class: 'qp-detail' }, 'Creator ', addrLink(chain, creator)) : null,
    ...rows.map((x) => h('p', { class: 'qp-p' }, h('span', { class: 'qp-st is-' + x.status }, WORD[x.status]), ' ', h('b', null, x.title), x.detail ? ' · ' + x.detail : '')),
    t ? h('p', { class: 'qp-detail' }, `${t.read ?? 0} transactions read${t.complete ? ' (complete history)' : t.more ? ' (more exist)' : ''}${t.trades?.length ? ' · ' + t.trades.length + ' trades' : ''}`) : null,
    t?.trades?.length ? h('ul', { class: 'qp-trades' }, t.trades.slice(0, 8).map((x) => h('li', null, h('b', null, x.side || x.kind || 'Trade'), ' ', x.amount != null ? num(+x.amount) : '', x.at || x.time ? ' · ' + new Date(x.at || x.time).toISOString().slice(0, 16).replace('T', ' ') : '', x.signature ? [' · ', h('a', { href: explorer('solana', x.signature, 'tx'), target: '_blank', rel: 'noopener noreferrer' }, 'tx')] : null))) : null);
}
function marketSection(o, r) {
  const m = o.market; if (!m) return null;
  const cap = m.marketCap ?? m.capFromSupply, liq = m.liquidityTotalUsd ?? m.liquidityUsd, t = m.txns?.h24 || {};
  const kv = [['Market cap', money(cap)], ['Price', money(+m.priceUsd)], ['Liquidity', money(liq)], ['Volume 24h', money(m.volumeTotal24 ?? m.volume?.h24)], ['Pool age', m.pairCreatedAt ? ago(m.pairCreatedAt).replace(' ago', '') : '—'], ['Trades 24h', (t.buys ?? '—') + ' buys · ' + (t.sells ?? '—') + ' sells']];
  return sec('Market', h('dl', { class: 'qa-kv qp-kv' }, kv.map(([k, v]) => h('div', null, h('dt', null, k), h('dd', null, v)))), h('p', { class: 'qp-detail' }, 'Listed market data from DexScreener · ' + (m.pairs || 0) + (m.pairs === 1 ? ' pair' : ' pairs') + (r.retrievedAt ? ' · read ' + ago(r.retrievedAt) : '')));
}
function repoSection(s) {
  if (s.type !== 'repository') return null;
  const kv = [['Repository', s.address || s.label], ['Created', String(s.createdAt || '—').slice(0, 10)], ['Last push', String(s.pushedAt || '—').slice(0, 10)], ['Stars · forks', (s.stars ?? '—') + ' · ' + (s.forks ?? '—')], ...(s.language ? [['Language', s.language]] : [])];
  return sec('Repository', h('dl', { class: 'qa-kv qp-kv' }, kv.map(([k, v]) => h('div', null, h('dt', null, k), h('dd', null, String(v))))), h('p', { class: 'qp-detail' }, 'Stars and forks can be bought; they are context, not proof. Scan the code below to see the checks it would run.'));
}
function readsSection(r) {
  const rec = r.receipts || []; if (!rec.length) return null;
  const providers = [...new Set(rec.map((x) => x.provider))];
  return sec('Audit trail', h('p', { class: 'qp-detail' }, rec.length + ' public reads from ' + providers.join(', ') + (r.elapsedMs ? ' in ' + (r.elapsedMs / 1000).toFixed(1) + ' s' : '') + '. Each response is fingerprinted (SHA-256).'),
    h('details', { class: 'qp-reads' }, h('summary', null, 'Show every read'), h('ul', null, rec.map((x) => h('li', null, h('b', null, x.provider), ' · ', x.request || '', ' · HTTP ' + (x.httpStatus ?? '—'), x.responseSha256 ? h('code', { class: 'qp-sha' }, ' ' + x.responseSha256.slice(0, 16) + '…') : null)))));
}

/* ---------- opening a shared report, or a check link ---------- */
const params=new URLSearchParams(location.search),chainAliases={'4663':'robinhood','8453':'base','1':'ethereum','42161':'arbitrum','56':'bnb','99901':'elysium',solana:'solana'};
function stableTarget(){try{const m=/^\/proof\/([^/]+)\/([^/]+)(?:\/([0-9a-f-]{36}))?\/?$/.exec(location.pathname);if(!m)return null;const chain=chainAliases[decodeURIComponent(m[1])]||decodeURIComponent(m[1]),address=decodeURIComponent(m[2]);return CHAIN[chain]&&(chain==='solana'?isSol(address):isEvm(address))?{chain,address:chain==='solana'?address:address.toLowerCase(),id:m[3]||null}:null;}catch{return null;}}
const targetFromPath=stableTarget(),idFromPath=/^\/qproof\/([0-9a-f-]{36})\/?$/.exec(location.pathname)?.[1],id=targetFromPath?.id||idFromPath||(/^[0-9a-f-]{36}$/.test(params.get('id')||'')?params.get('id'):null);
function matchesPath(report){if(!targetFromPath)return true;const s=report?.subject;return s?.chain===targetFromPath.chain&&(s.chain==='solana'?s.address===targetFromPath.address:String(s.address||'').toLowerCase()===targetFromPath.address);}
async function readStableTarget(){
 const t=targetFromPath;if(!t)return;const d=await api('latest?'+new URLSearchParams({chain:t.chain,address:t.address}));
 if(d.report){if(!matchesPath(d.report))throw Error('This report does not match the address in this link.');shown={report:d.report,opts:{stored:true,envelope:d}};q.value=t.address;chainSel.value=t.chain;sync();render(d.report,shown.opts);return;}
 focusReportLayout();const summary=renderQProofSummary(h,d,{onRefresh:()=>readStableTarget().catch(e=>{msg.textContent=e.message;})});
 out.hidden=false;out.replaceChildren(h('section',{class:'qp-empty-report'},h('h1',null,short(t.address)),h('p',{class:'qp-token-chain'},CHAIN[t.chain]),summary.bar,summary.strip,h('p',{class:'qp-refresh-note'},d.freshness?.refreshQueued?'The first check is queued.':'No stored report is available yet.')));
}
if (id) {
  checking('Opening the stored report');
  api('report/' + id).then((d) => {if(!matchesPath(d.report))throw Error('This report does not match the address in this link.');shown = { report: d.report, opts: { stored: true,envelope:d } }; const s = d.report.subject || {}; q.value = s.address || ''; if (s.chain && CHAIN[s.chain] && s.chain !== 'github') chainSel.value = s.chain; sync(); render(d.report, shown.opts); })
    .catch((e) => { out.hidden = true; msg.textContent = e.message; });
} else if(targetFromPath){checking('Reading the latest stored report');readStableTarget().catch(e=>{out.hidden=true;msg.textContent=e.message;});
} else if (params.get('q')) {
  q.value = params.get('q').slice(0, 2048); const c = params.get('chain'); if (c && CHAIN[c]) chainSel.value = c; sync(); run();
}

/* ---------- code: scan for everyone, run for holders ---------- */
const codeForm = $('qp-code-form'), repo = $('qp-repo'), scanBtn = $('qp-scan'), codeMsg = $('qp-code-msg'), scanOut = $('qp-scan-out'), runBox = $('qp-run');
let holder = null, scan = null, running = false, freeRun = null;
codeForm.addEventListener('submit', async (e) => {
  e.preventDefault(); const url = repo.value.trim().replace(/^(?!https?:\/\/)/, 'https://').replace(/\.git$/, '');
  if (!isRepo(url)) { codeMsg.textContent = 'Paste a public GitHub repository link, like https://github.com/owner/repo.'; return; }
  scanBtn.disabled = true; scanBtn.textContent = 'Scanning…'; codeMsg.textContent = 'Pinning the repository to one commit and reading it…';
  scanOut.replaceChildren(h('span', { class: 'qa-skel' }), h('span', { class: 'qa-skel' }));
  try { scan = await api('run/inspect', { url }); codeMsg.textContent = ''; paintScan(); }
  catch (err) { scan = null; scanOut.replaceChildren(); codeMsg.textContent = err.message + (err.retryAt ? ' Try again after ' + new Date(err.retryAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '.' : ''); }
  finally { scanBtn.disabled = false; scanBtn.textContent = 'Scan code'; paintRun(); }
});
function paintScan(result) {
  if (!scan) { scanOut.replaceChildren(); return; }
  const r = scan.repo || {}, checks = scan.plan?.checks || [], g = scan.guidance || {}, byId = new Map((result?.checks || []).map((x) => [x.id, x]));
  const status = (x) => { const o = byId.get(x.id); return o ? ({ pass: 'clear', fail: 'danger', blocked: 'caution' }[o.status] || 'unknown') : 'unknown'; };
  const label = (x) => { const o = byId.get(x.id); return o ? ({ pass: 'Passed', fail: 'Failed', blocked: 'Blocked', running: 'Running', queued: 'Queued' }[o.status] || 'Not tested') : 'Not run'; };
  scanOut.replaceChildren(h('div', { class: 'qp-sec qp-in' },
    h('h3', { class: 'qp-sec__h' }, result ? 'Run result' : 'Scan'),
    h('p', { class: 'qp-subject' }, h('b', null, r.name || 'Repository'), r.commit ? [' · commit ', h('a', { href: 'https://github.com/' + (r.name || '') + '/commit/' + r.commit, target: '_blank', rel: 'noopener noreferrer' }, r.commit.slice(0, 10))] : null),
    g.title || g.summary ? h('p', { class: 'qp-p' }, [g.title, g.summary].filter(Boolean).join('. ')) : null,
    result ? h('p', { class: 'qp-k qp-runstate is-' + ({ pass: 'clear', fail: 'danger' }[result.status] || 'unknown') }, { pass: 'The listed checks passed', fail: 'A listed check failed', blocked: 'The run stopped at a boundary', queued: 'Queued for the sandbox…', running: 'Running in the sandbox…' }[result.status] || 'Not tested') : null,
    checks.length ? h('ul', { class: 'qp-checklist' }, checks.map((x) => { const o = byId.get(x.id);
      return h('li', { class: 'qp-check is-' + status(x) }, h('div', { class: 'qp-check__top' }, h('span', { class: 'qp-st is-' + status(x) }, label(x)), h('b', null, x.title || x.id)),
        x.reason ? h('p', { class: 'qp-means' }, x.reason) : null, Array.isArray(x.command) ? h('code', { class: 'qp-cmd' }, x.command.join(' ')) : null,
        o?.output || o?.reason ? h('details', { class: 'qp-reads' }, h('summary', null, 'Output'), h('pre', { class: 'qp-out' }, String(o.output || o.reason).slice(0, 6000))) : null); }))
      : h('p', { class: 'qp-p' }, 'No runnable checks were found in this repository.'),
    h('p', { class: 'qp-detail' }, result ? 'Only the listed commands are covered; this is not a verdict on the whole project.' : 'Nothing has run yet. These are the commands a run would execute, in an isolated sandbox with no network and no secrets.')));
}
const GET_QHOOKS = () => h('a', { class: 'qa-btn qa-btn--primary qp-get', href: '/terminal#t=' + QHOOKS }, 'Get QHOOKS');
async function loadHolder() { try { holder = await api('run/holder'); } catch { holder = null; } paintRun(); }
function rule() {
  if (!holder?.configured) return 'Code runs are not open right now.';
  const where = (holder.counts || ['wallet']).map((k) => ({ wallet: 'in your wallet', staked: 'staked', locked: 'locked' }[k])).filter(Boolean), w = where.length > 1 ? where.slice(0, -1).join(', ') + ' or ' + where.at(-1) : where[0];
  const daily=holder.limits?.runsPerDay,pool=holder.limits?.poolRunsPerDay||holder.runs?.pool?.perDay;
  const budget=Number.isSafeInteger(daily)&&Number.isSafeInteger(pool)?`${daily} runs a day per wallet, from a pool of ${pool} a day for all holders`:'the current run limits are read before a run';
  const free = holder.trial?.available ? ` Hold ${holder.trial.minimum || '10,000'} or more? Your wallet gets 1 free run.` : '';
  return `Hold ${holder.minimum} ${holder.symbol} on ${holder.chainLabel}, ${w}, to run code: ${budget}.${free} Scans and token checks stay free for everyone.`;
}
let runNote = '';
// Runs left today, from the engine: this wallet's own allowance and the pool all holders share.
async function runsLeft(wallet) { try { const r = holder?.runs?.wallet?.address?.toLowerCase() === wallet?.toLowerCase() ? holder.runs : await api('run/holder/runs?wallet=' + encodeURIComponent(wallet)); return r?.pool ? r : null; } catch { return null; } }
async function paintRun() {
  if (!holder) { runBox.replaceChildren(h('h3', { class: 'qp-h3' }, 'Run it'), h('p', { class: 'qp-p' }, 'The holder rule could not be read right now.')); return; }
  const active = holder.active, kids = [h('h3', { class: 'qp-h3' }, 'Run it'), h('p', { class: 'qp-p' }, rule())];
  if (!holder.configured) { runBox.replaceChildren(...kids); return; }
  if (active) {
    const left = await runsLeft(active.wallet);
    kids.push(h('p', { class: 'qp-holder is-on' }, h('b', null, 'Holder verified'), ' · ', short(active.wallet), ' · until ', new Date(active.expires).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })),
      left ? h('p', { class: 'qp-detail' }, `Runs left today: ${left.runsLeftToday ?? left.wallet?.left ?? '—'} of ${left.wallet?.perDay ?? holder.limits?.runsPerDay ?? '—'} for this wallet · ${left.pool.left} of ${left.pool.perDay} left for all holders.`) : null);
    const btn = h('button', { type: 'button', class: 'qa-btn qa-btn--primary qp-go', disabled: !scan || running || scan?.executionSupport?.available === false ? true : null, onclick: startRun }, running ? 'Running…' : scan ? `Run ${scan.plan?.checks?.length || 0} checks` : 'Scan a repository first');
    kids.push(btn, scan?.executionSupport?.available === false ? h('p', { class: 'qp-note' }, scan.executionSupport.reason || 'This repository cannot run in the sandbox.') : null,
      h('button', { type: 'button', class: 'qa-btn qa-btn--quiet qa-btn--sm', onclick: forget }, 'Forget this wallet'));
  } else if (freeRun?.eligible) {
    kids.push(h('p', { class: 'qp-holder is-on' }, h('b', null, '1 free run'), ' · ', short(freeRun.wallet)),
      h('button', { type: 'button', class: 'qa-btn qa-btn--primary qp-go', disabled: !scan || running || scan?.executionSupport?.available === false ? true : null, onclick: () => startRun(true) }, running ? 'Running…' : scan ? `Use my free run · ${scan.plan?.checks?.length || 0} checks` : 'Scan a repository first'),
      scan?.executionSupport?.available === false ? h('p', { class: 'qp-note' }, scan.executionSupport.reason || 'This repository cannot run in the sandbox.') : null,
      h('p', { class: 'qp-detail' }, 'One free run per wallet, in the same sandbox as holder runs. It may wait behind holder runs.'), GET_QHOOKS());
  } else {
    const addr = connectedAddress();
    kids.push(h('div', { class: 'qp-actions' }, h('button', { type: 'button', class: 'qa-btn qa-btn--secondary qp-go', onclick: verify }, addr ? 'Check my holdings · ' + short(addr) : 'Connect a wallet to check holdings'), GET_QHOOKS()),
      h('p', { class: 'qp-detail' }, 'Checking holdings asks your wallet to sign a plain message. It is not a transaction and cannot move funds.'));
  }
  if (runNote) kids.push(h('p', { class: 'qp-note', role: 'status' }, runNote));
  runBox.replaceChildren(...kids);
}
async function verify() {
  const addr = connectedAddress();
  if (!addr) { document.getElementById('qhc-trigger')?.click(); runNote = 'Connect a wallet, then press the button again.'; paintRun(); return; }
  runNote = 'Sign the message in your wallet…'; paintRun();
  try {
    const ch = await api('run/holder/challenge', { address: addr });
    const signature = await signMessage(ch.message);
    const v = await api('run/holder/verify', { challenge: ch.challenge, signature });
    const parts = v.parts ? ' (' + [['wallet', 'in wallet'], ['staked', 'staked'], ['locked', 'locked']].map(([k, w]) => (v.parts[k] || '0') + ' ' + w).join(' · ') + ')' : '';
    freeRun = null;
    if (v.holder) { runNote = `Verified: ${v.balance} ${v.symbol}${parts}.`; holder.active = { wallet: v.wallet, expires: v.expires }; holder.runs = null; }
    else if (v.freeRun?.eligible) { freeRun = { wallet: v.wallet, eligible:true }; runNote = `${short(v.wallet)} holds ${v.balance} ${v.symbol}${parts}. Your wallet has 1 free run; ${v.minimum} unlocks daily runs.`; }
    else runNote = `${short(v.wallet)} holds ${v.balance} ${v.symbol}${parts}; ${v.minimum} needed.${v.freeRun?.used ? ' This wallet has used its free run.' : ''} Scans stay free.`;
  } catch (e) { runNote = e?.code === 4001 || /reject|denied|declined/i.test(e?.message || '') ? 'Signing was declined in the wallet.' : e.message; }
  paintRun();
}
async function forget() { try { await api('run/holder/forget', {}); holder.active = null; runNote = 'Wallet removed from this browser.'; } catch (e) { runNote = e.message; } paintRun(); }
async function startRun(free = false) {
  if (!scan || running) return; running = true; runNote = 'Starting the run…'; paintRun();
  try {
    let rep = await api(free === true ? 'run/trial' : 'run/runs', { planId: scan.id, digest: scan.digest, approved: true, requestId: crypto.randomUUID() });
    if (free === true) freeRun = null;
    for (let i = 0; i < 150 && ['queued', 'running'].includes(rep.status); i++) { paintScan(rep); runNote = rep.status === 'queued' ? 'Queued for the sandbox…' : 'Running…'; paintRun(); await new Promise((ok) => setTimeout(ok, 2000)); rep = await api('run/runs/' + rep.id); }
    paintScan(rep); runNote = ['queued', 'running'].includes(rep.status) ? 'Still running. Results stay with this browser; check back shortly.' : '';
  } catch (e) { runNote = e.message + (e.retryAt ? ' Try again after ' + new Date(e.retryAt).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }) + '.' : ''); }
  running = false; if (holder) holder.runs = null; paintRun();
}
onWalletChange?.(() => paintRun());
loadHolder();
