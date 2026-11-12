import {profileUrl} from './qx-profile-address.mjs';
// /founding (2026-11-10): Founding Launchers counter, rules, the founding launches with milestone progress and trust
// links, and, with a wallet connected, that wallet's founding rewards. Reads /api/founding only (plus the existing
// RepoProof cache and builder routes per launch). No price, market cap or chart data.
import {getWalletHub} from '/wallet-hub-fresh.mjs';
import {signFoundingLink} from '/founding-config.mjs';
import {createSolanaProfileWallet} from '/qx-solana-profile-wallet.mjs';
import {chainById} from '/chains.mjs';
const solLinkWallet=createSolanaProfileWallet(window);
const hub = getWalletHub(window), $ = id => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v); n.append(...kids.filter(k => k != null && k !== false)); return n; };
const out = (href, text) => el('a', {href, target: '_blank', rel: 'noopener noreferrer'}, text);
const day = s => new Date(s * 1000).toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
const short = a => a.slice(0, 6) + '…' + a.slice(-4);
const weth = v => { const n = Number(BigInt(v || '0')) / 1e18; return n === 0 ? '0' : n < 0.0001 ? '<0.0001' : n.toLocaleString('en-US', {maximumFractionDigits: 4}); };
let data = null, stopLinkWatch=()=>{};

async function load() {
  try { const r = await fetch('/api/founding', {cache: 'no-store'}); data = r.ok ? await r.json() : null; } catch { data = null; }
  render(); mine();
}
// System A (2026-11-12): the counter is a seat map of the 50 spots, the launches are a leaderboard ranked by milestone
// progress, and the prize figures read from the same /api/founding rules. A value that moved since the last read flashes.
const prev = new Map(); let prevLeft = null;
const clamp01 = v => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
const usd0 = v => '$' + Math.round(Number(v) || 0).toLocaleString('en-US');
const progress = l => { const g = data.rules.grant; return l.qualifiedAt ? 2 : (clamp01(l.holders / g.holders) + clamp01(Number(l.volumeUsd) / g.volumeUsd)) / 2; };
const reduced = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const flashIf = (node, on) => { if (on && !reduced()) node.classList?.add('cx-flash'); return node; };
const coinOf = l => {
  const box = el('span', {class: 'fd-coin', 'aria-hidden': 'true'}, el('span', {}, String(l.symbol || '?').slice(0, 1).toUpperCase()));
  if (/^\d+$/.test(String(l.chainId)) && /^0x[0-9a-f]{40}$/i.test(l.token || '')) { const img = el('img', {alt: '', width: '48', height: '48', loading: 'lazy', decoding: 'async', src: '/api/token-profiles/' + l.chainId + '/' + String(l.token).toLowerCase() + '/image'}); img.addEventListener?.('error', () => img.remove(), {once: true}); box.append(img); }
  return box;
};
function prizes() {
  const r = data.rules, set = (k, v) => document.querySelectorAll('[data-prize="' + k + '"]').forEach(n => { n.textContent = v; });
  try { set('grant', Number(BigInt(r.grant.amount) / 10n ** 18n).toLocaleString('en-US')); } catch {}
  if (r.bounty?.prizeUsd) set('bounty', usd0(r.bounty.prizeUsd));
  if (r.bounty?.mcapUsd) set('bounty-cap', usd0(r.bounty.mcapUsd));
  if (r.creatorShare?.bps) set('share', r.creatorShare.bps / 100 + '%');
  if (r.creatorShare?.days) set('share-days', String(r.creatorShare.days));
  if (r.boost?.days) set('boost-days', String(r.boost.days));
}
// Audit #15 (2026-11-12): one horizontal bar for the spots taken, then the launched tokens as a plain list (no seat
// grid of rings). Same data as before: spotsLeft for the bar, data.launches for the list.
function seats(total, launches, open) {
  const taken = open ? total - data.spotsLeft : 0, moved = prevLeft != null && prevLeft !== data.spotsLeft;
  const fill = el('span', {class: 'fd-meter__f'}); fill.style?.setProperty('--p', (clamp01(taken / total) * 100).toFixed(1) + '%');
  const meter = el('div', {class: 'fd-meter', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(taken), 'aria-label': taken + ' of ' + total + ' spots taken'},
    el('p', {class: 'fd-meter__l'}, flashIf(el('b', {}, taken + ' of ' + total), moved), el('span', {}, 'taken')),
    el('span', {class: 'fd-meter__t', 'aria-hidden': 'true'}, fill));
  const sorted = [...launches].sort((a, b) => Number(a.slot) - Number(b.slot));
  const list = sorted.length ? el('ol', {class: 'fd-launched', 'aria-label': 'Launched tokens'}, ...sorted.map(l => el('li', {},
    el('span', {class: 'fd-launched__n'}, '#' + l.slot),
    el('a', {href: '/terminal#' + (l.chainId === 'solana' ? 't=' : 'm=') + l.chainId + ':' + l.token}, el('b', {}, l.symbol || 'Token')),
    el('span', {class: 'fd-launched__c'}, l.chainId === 'solana' ? 'Solana' : chainById(l.chainId)?.name || l.chainId)))) : null;
  return el('div', {class: 'fd-seats'}, meter, list);
}
function render() {
  const count = $('qfd-count'), list = $('qfd-launches');
  if (!data) { count.replaceChildren(el('p', {class: 'fd-count__note'}, 'Refreshing…')); return; }
  const g = data.rules.grant;
  document.querySelectorAll('[data-rule="holders"]').forEach(n => { n.textContent = String(g.holders); });
  document.querySelectorAll('[data-rule="volume"]').forEach(n => { n.textContent = '$' + Number(g.volumeUsd).toLocaleString('en-US'); });
  prizes();
  const ch = $('qfd-chains'), list6 = data.rules.chains || [];
  if (ch && list6.length) ch.textContent = list6.map(c => c.name + (c.open ? '' : ' (opening soon)')).join(', ') + '. Launches on a chain marked opening soon count from the moment it opens.';
  const b = $('qfd-bounty'); if (b) b.textContent = data.bounty?.winner ? 'Won by ' + data.bounty.winner.symbol + '.' : 'Bounty: open.';
  const spots = data.rules.spots;
  if (data.status === 'soon') {
    const at = data.opensAt || data.rules.start, left = at ? at - Math.floor(Date.now() / 1000) : null;
    const hm = left > 0 ? Math.floor(left / 3600) + 'h ' + String(Math.floor(left % 3600 / 60)).padStart(2, '0') + 'm' : null;
    count.replaceChildren(el('div', {class: 'fd-count__num'}, el('b', {class: 'qfd-big'}, String(spots)), el('span', {}, 'of ' + spots + ' spots open')),
      seats(spots, [], false),
      el('p', {class: 'fd-count__note'}, 'Opens 5:00 PM CT (23:00 UTC) on November 10' + (hm ? ' · in ' + hm : '') + '. Launches before it don\'t count.'));
  }
  else {
    const moved = prevLeft != null && prevLeft !== data.spotsLeft;
    count.replaceChildren(
      el('div', {class: 'fd-count__num'}, flashIf(el('b', {class: 'qfd-big'}, String(data.spotsLeft)), moved), el('span', {}, 'of ' + spots + ' spots left')),
      // the sticky launch button lives in its own box below the number, so on phone it can never slide over the count
      el('div', {class: 'fd-count__rest'},
        seats(spots, data.launches, true),
        el('p', {class: 'fd-count__note'}, data.status === 'full' ? 'All 50 founding spots are taken.' : 'Counting launches since ' + new Date(data.rules.start * 1000).toLocaleString('en-US', {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short'}) + '.'),
        data.status === 'full' ? null : el('p', {class: 'fd-count__go'}, el('a', {class: 'qa-btn qa-btn--primary qa-btn--lg', href: '/create'}, 'Launch a token'))));
    prevLeft = data.spotsLeft;
  }
  const tc = $('fd-team-count'); if (tc) tc.textContent = data.launches.length ? String(data.launches.length) : '';
  if (!data.launches.length) { list.replaceChildren(el('li', {class: 'fd-empty'}, data.status === 'soon' ? 'The list starts when the campaign opens.' : 'No founding launches yet. Be the first.')); return; }
  const ranked = [...data.launches].sort((a, b) => progress(b) - progress(a) || Number(a.slot) - Number(b.slot));
  list.replaceChildren(...ranked.map((l, i) => row(l, i + 1)));
  for (const l of data.launches) prev.set(l.chainId + ':' + l.token, {holders: l.holders, volumeUsd: l.volumeUsd});
}
function bar(label, have, need, text, moved) {
  const fill = el('span', {class: 'fd-bar__f'}); fill.style?.setProperty('--p', (clamp01(have / need) * 100).toFixed(1) + '%');
  return el('div', {class: 'fd-bar' + (have >= need ? ' is-full' : '')}, el('span', {class: 'fd-bar__l'}, label), flashIf(el('b', {class: 'fd-bar__v'}, text), moved), el('span', {class: 'fd-bar__t', 'aria-hidden': 'true'}, fill));
}
function row(l, rank) {
  const chain = l.chainId === 'solana' ? 'Solana' : chainById(l.chainId)?.name || l.chainId, g = data.rules.grant;
  const key = l.chainId + ':' + l.token, old = prev.get(key), fresh = prev.size > 0 && !old;
  const grant = l.qualifiedAt ? '50,000 QHOOKS milestone reached ' + day(l.qualifiedAt)
    : l.grantOpen ? 'Milestone open until ' + day(l.grantBy)
    : 'Milestone window closed';
  const trust = el('span', {class: 'qfd-trust'}, el('a', {href: '/verify'}, 'Verify launch'));
  const li = el('li', {class: 'qfd-launch fd-team' + (rank === 1 ? ' is-top' : '') + (l.qualifiedAt ? ' is-qualified' : '') + (fresh && !reduced() ? ' is-new' : '')},
    el('span', {class: 'qa-rank' + (rank <= 3 ? ' is-top' : '')}, String(rank)),
    coinOf(l),
    el('div', {class: 'fd-team__main'},
      el('p', {class: 'qfd-head fd-team__name'}, el('b', {}, l.symbol || 'Token'), ' ', el('span', {}, l.name && l.name !== l.symbol ? l.name : '')),
      el('p', {class: 'qa-meta fd-team__meta'}, el('span', {}, '#' + l.slot + ' spot'), el('span', {}, chain), el('span', {}, l.chainId==='solana'?'Solana launch':l.kind === 'studio' ? 'Studio' : 'One-tap'), el('span', {}, 'launched ' + day(l.launchedAt))),
      l.carriedFrom?.id === 'qwerty-relaunch-20261111' ? el('p', {class: 'fd-team__note'}, 'Relaunch of QWERTY, spot held from ' + new Date(l.carriedFrom.launchedAt * 1000).toISOString().slice(11, 16) + ' UTC.') : null,
      el('p', {class: 'fd-team__note'}, 'Creator ', el('a', {href: profileUrl({wallet:l.creator})}, short(l.creator)),
        l.chainId==='solana' ? (l.waitingForLink?' · waiting for a wallet link':' · rewards to '+short(l.payTo)) : l.creatorShareOpen ? ' · earns on volume until ' + day(l.creatorShareUntil) : ' · volume share ended',
        l.boostOpen ? ' · 50% cashback for traders until ' + day(l.boostUntil) : '')),
    el('div', {class: 'fd-team__race'},
      bar('Holders', Number(l.holders) || 0, g.holders, (Number(l.holders) || 0) + ' of ' + g.holders, !!old && old.holders !== l.holders),
      bar('Volume', Number(l.volumeUsd) || 0, g.volumeUsd, usd0(l.volumeUsd) + ' of ' + usd0(g.volumeUsd), !!old && old.volumeUsd !== l.volumeUsd),
      el('p', {class: 'fd-team__grant'}, grant)),
    el('p', {class: 'fd-team__acts'}, el('a', {class: 'qa-btn qa-btn--secondary qa-btn--sm', href: '/terminal#' + (l.chainId==='solana'?'t=':'m=') + l.chainId + ':' + l.token}, 'Trade'), ' ', trust));
  if(l.chainId!=='solana')trustLinks(l, trust);
  return li;
}
// RepoProof (cached report only; this page never starts a scan) and the builder record, when they exist.
async function trustLinks(l, host) {
  try {
    const r = await fetch(l.links.proof, {cache: 'no-store'}), env = r.ok ? await r.json() : null, u = env?.report?.url;
    host.append(' · ', /^https:\/\/repoproof\.online\/proof\/[\w-]+$/.test(u || '') ? out(u, 'QProof report ↗') : el('span', {}, 'QProof check pending'));
  } catch {}
  if (!l.links.builder) return;
  try {
    const r = await fetch(l.links.builder, {headers: {accept: 'application/json'}}), d = r.status === 200 ? await r.json() : null;
    if (d?.appliesToToken && /^https:\/\/heyresearch\.xyz\//.test(d.projectLink || '')) host.append(' · ', out(d.projectLink, 'Builder record ↗'));
  } catch {}
}
async function mine() {
  const box = $('qfd-mine'), conn = hub.snapshot().current;
  if (!conn || !data || data.status === 'soon') { box.hidden = true; return; }
  let a = null;
  try { const r = await fetch('/api/founding/account?wallet=' + String(conn.owner).toLowerCase(), {cache: 'no-store'}); a = r.ok ? await r.json() : null; } catch {}
  if (!a) { box.hidden = true; return; }
  const any = a.launch || [a.creator.listed, a.creator.next, a.cashback.listed, a.cashback.next].some(v => v !== '0');
  if (!any) { box.hidden = true; return; }
  box.hidden = false;
  const fig = (label, listed, next) => el('div', {class: 'fd-fig'}, el('b', {}, weth(listed) + ' WETH'), el('span', {}, label + ': in drop lists · ' + weth(next) + ' WETH in the next one'));
  box.replaceChildren(el('header', {class: 'qa-head'}, el('h2', {class: 'qa-head__t qa-head__t--s'}, 'Your founding rewards')),
    a.launch ? el('p', {}, 'Your founding launch: #' + a.launch.slot + ' ' + (a.launch.symbol || '') + (a.launch.qualifiedAt ? ' · milestone reached, the 50,000 QHOOKS grant goes out in the next weekly batch' : '')) : null,
    el('div', {class: 'fd-figs'}, fig('Volume share', a.creator.listed, a.creator.next), fig('Extra cashback', a.cashback.listed, a.cashback.next)),
    el('p', {}, 'Claim from ', el('a', {href: '/me'}, 'My QHooks'), ' on Robinhood Chain.'));
}
// "Check my wallet": the connected wallet fills the field; any address can be checked.
const form = $('qfd-form'), input = $('qfd-wallet'), result = $('qfd-result');
const fill = () => { const c = hub.snapshot().current; if (c && !input.value) input.value = String(c.owner); };
form.addEventListener('submit', async e => {
  e.preventDefault();
  const raw = input.value.trim(), sol=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(raw), w=sol?raw:raw.toLowerCase();
  if (!sol && !/^0x[0-9a-f]{40}$/.test(w)) { result.textContent = 'Enter an EVM wallet, Solana wallet or token mint.'; return; }
  stopLinkWatch();stopLinkWatch=()=>{};result.textContent = 'Refreshing…';
  try {
    const r = await fetch('/api/founding/eligibility?wallet=' + w, {cache: 'no-store'}), d = await r.json();
    if (!r.ok) { result.textContent = d.error || 'Refreshing… try again in a moment.'; return; }
    if(d.chainId==='solana') {
      if(d.waitingForLink) {
        const button=el('button',{type:'button',class:'qtx-mini'},'Link reward wallet');
        const select=el('select',{'aria-label':'Solana launch wallet',id:'qfd-sol-wallet'}),note=el('span',{});
        const update=()=>{const previous=select.value,ws=solLinkWallet.snapshot().wallets;select.replaceChildren(...ws.map(w=>el('option',{value:w.id},w.name)));if(ws.some(w=>w.id===previous))select.value=previous;select.hidden=ws.length<2;};
        const unsubscribe=solLinkWallet.subscribe(update);stopLinkWatch=unsubscribe;
        result.replaceChildren(el('span',{},'Link the EVM wallet your rewards go to: sign one message with it and one with your Solana launch wallet. No transaction.'),select,button,note);
        button.addEventListener('click',async()=>{button.disabled=true;note.textContent='';try{
          const conn=hub.snapshot().current;
          if(!conn){hub.open();button.textContent='Sign wallet link';return;}
          const ws=solLinkWallet.snapshot().wallets;if(!ws.length)throw Error('Open this page in your Solana wallet app or connect a Solana wallet with message signing.');
          await solLinkWallet.connect(select.value||ws[0].id);
          const sol=solLinkWallet.capture();
          if(sol.owner!=='solana:'+d.creator)throw Error('Choose the Solana wallet you launched with.');
          const proof=await signFoundingLink({mint:d.mint,creator:d.creator,issued:Math.floor(Date.now()/1000),evmSession:conn,solSession:sol,currentEvm:()=>hub.snapshot().current,onStep:step=>{note.textContent=step==='evm'?'Sign the message with your EVM wallet.':'Sign the same message with your Solana launch wallet.';}});
          const response=await fetch('/api/founding/link',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(proof)}),linked=await response.json();
          if(linked.eligible){unsubscribe();result.textContent='Eligible. Rewards will go to '+short(linked.payTo)+'.';load();}
          else {button.textContent='Sign wallet link again';note.textContent=linked.reason==='no_spot'?'This reward wallet or creator already has a founding spot, or the spots are full.':response.ok?'This EVM wallet could not be linked.':linked.error==='link_cutoff_passed'?'The wallet link cutoff has passed.':linked.error==='pay_to_immutable'?'This launch already has a reward wallet.':'Refreshing… try again in a moment.';}
        }catch(error){note.textContent=error.message||'Refreshing…';}finally{button.disabled=false;}});
      } else result.textContent=d.eligible?'Eligible. Rewards go to '+short(d.payTo)+'.':!d.open?'Solana: opening soon':d.mint?'The wallet link cutoff has passed.':'No qualifying launch found for this wallet or mint.';
      return;
    }
    const f = v => Math.floor(Number(BigInt(v) / 10n ** 18n)).toLocaleString('en-US');
    result.textContent = 'No QHOOKS holding is needed. Launch a token from this wallet and it takes a spot while spots are open (one per creator wallet).';
  } catch { result.textContent = 'Refreshing… try again in a moment.'; }
});
fill();
load();
setInterval(() => { if (data?.status === 'soon') render(); }, 30000);
hub.subscribe(() => { fill(); mine(); });
setInterval(load, 60000);

window.addEventListener('pagehide',()=>{stopLinkWatch();solLinkWallet.dispose();},{once:true});
