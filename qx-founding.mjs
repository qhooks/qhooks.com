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
function render() {
  const count = $('qfd-count'), list = $('qfd-launches');
  if (!data) { count.replaceChildren(el('p', {}, 'Refreshing…')); return; }
  const g = data.rules.grant;
  document.querySelectorAll('[data-rule="holders"]').forEach(n => { n.textContent = String(g.holders); });
  document.querySelectorAll('[data-rule="volume"]').forEach(n => { n.textContent = '$' + Number(g.volumeUsd).toLocaleString('en-US'); });
  const ch = $('qfd-chains'), list6 = data.rules.chains || [];
  if (ch && list6.length) ch.textContent = list6.map(c => c.name + (c.open ? '' : ' (opening soon)')).join(', ') + '. Launches on a chain marked opening soon count from the moment it opens.';
  const b = $('qfd-bounty'); if (b) b.textContent = data.bounty?.winner ? 'Won by ' + data.bounty.winner.symbol + '.' : 'Bounty: open.';
  if (data.status === 'soon') {
    const at = data.opensAt || data.rules.start, left = at ? at - Math.floor(Date.now() / 1000) : null;
    const hm = left > 0 ? Math.floor(left / 3600) + 'h ' + String(Math.floor(left % 3600 / 60)).padStart(2, '0') + 'm' : null;
    count.replaceChildren(el('p', {class: 'qfd-big'}, data.rules.spots + ' of ' + data.rules.spots + ' spots open'),
      el('p', {}, 'Opens 5:00 PM CT (23:00 UTC) on November 10' + (hm ? ' · in ' + hm : '') + '. Launches before it don\'t count.'));
  }
  else count.replaceChildren(
    el('p', {class: 'qfd-big'}, data.spotsLeft + ' of ' + data.rules.spots + ' spots left'),
    el('p', {}, data.status === 'full' ? 'All 50 founding spots are taken.' : 'Counting launches since ' + new Date(data.rules.start * 1000).toLocaleString('en-US', {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short'}) + '.'),
    data.status === 'full' ? null : el('p', {}, el('a', {class: 'qtx-mini', href: '/create'}, 'Launch a token')));
  if (!data.launches.length) { list.replaceChildren(el('li', {}, data.status === 'soon' ? 'The list starts when the campaign opens.' : 'No founding launches yet. Be the first.')); return; }
  list.replaceChildren(...data.launches.map(row));
}
function row(l) {
  const chain = l.chainId === 'solana' ? 'Solana' : chainById(l.chainId)?.name || l.chainId, g = data.rules.grant;
  const grant = l.qualifiedAt ? '50,000 QHOOKS milestone reached ' + day(l.qualifiedAt)
    : l.grantOpen ? 'Milestone: ' + l.holders + ' of ' + g.holders + ' holders · $' + Number(l.volumeUsd).toLocaleString('en-US') + ' of $' + Number(g.volumeUsd).toLocaleString('en-US') + ' volume · until ' + day(l.grantBy)
    : 'Milestone window closed';
  const trust = el('span', {class: 'qfd-trust'}, el('a', {href: '/verify'}, 'Verify launch'));
  const li = el('li', {class: 'qfd-launch'},
    el('p', {class: 'qfd-head'}, el('b', {}, '#' + l.slot + ' ' + (l.symbol || 'Token')), ' ', el('span', {}, (l.name || '') + ' · ' + chain + ' · ' + (l.chainId==='solana'?'Solana launch':l.kind === 'studio' ? 'Studio' : 'One-tap') + ' · launched ' + day(l.launchedAt))),
    l.carriedFrom?.id === 'qwerty-relaunch-20261111' ? el('p', {}, 'Relaunch of QWERTY, spot held from ' + new Date(l.carriedFrom.launchedAt * 1000).toISOString().slice(11, 16) + ' UTC.') : null,
    el('p', {}, 'Creator ', el('a', {href: '/profile#' + l.creator}, short(l.creator)),
      l.chainId==='solana' ? (l.waitingForLink?' · waiting for a wallet link':' · rewards to '+short(l.payTo)) : l.creatorShareOpen ? ' · earns on volume until ' + day(l.creatorShareUntil) : ' · volume share ended',
      l.boostOpen ? ' · 50% cashback for traders until ' + day(l.boostUntil) : ''),
    el('p', {}, grant),
    el('p', {}, el('a', {href: '/terminal#' + (l.chainId==='solana'?'t=':'m=') + l.chainId + ':' + l.token}, 'Trade'), ' · ', trust));
  if(l.chainId!=='solana')trustLinks(l, trust);
  return li;
}
// RepoProof (cached report only; this page never starts a scan) and the builder record, when they exist.
async function trustLinks(l, host) {
  try {
    const r = await fetch(l.links.proof, {cache: 'no-store'}), env = r.ok ? await r.json() : null, u = env?.report?.url;
    host.append(' · ', /^https:\/\/repoproof\.online\/proof\/[\w-]+$/.test(u || '') ? out(u, 'RepoProof report ↗') : el('span', {}, 'RepoProof check pending'));
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
  box.replaceChildren(el('h2', {}, 'Your founding rewards'),
    a.launch ? el('p', {}, 'Your founding launch: #' + a.launch.slot + ' ' + (a.launch.symbol || '') + (a.launch.qualifiedAt ? ' · milestone reached, the 50,000 QHOOKS grant goes out in the next weekly batch' : '')) : null,
    el('p', {}, 'Volume share: ' + weth(a.creator.listed) + ' WETH in drop lists · ' + weth(a.creator.next) + ' WETH in the next one'),
    el('p', {}, 'Extra cashback: ' + weth(a.cashback.listed) + ' WETH in drop lists · ' + weth(a.cashback.next) + ' WETH in the next one'),
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
        result.replaceChildren(el('span',{},'Link the EVM wallet that holds your QHOOKS: sign one message with it and one with your Solana launch wallet. No transaction.'),select,button,note);
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
