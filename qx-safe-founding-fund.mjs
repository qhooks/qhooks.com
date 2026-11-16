// Hidden page (2026-11-10): the QHooks Safe's two Founding Launchers transactions, same approve-then-send flow as
// /safe-drops-fund (no Safe app; owner A calls approveHash, owner B execTransaction with both v=1 signatures).
// 1. Grants: 50,000 QHOOKS each, vested 30 days, for founding creators who reached the milestone before today 00:00
//    UTC and don't have one yet (read from QGrants on chain), in slot order, within the 2.5M budget.
// 2. Top-up: WETH into QDrops for founding top-ups and callout rewards (one WETH budget). The amount field starts at
//    0.05 WETH (main thread 2026-11-12) and lives in the link (?weth=), so both owners sign the same amount; it never
//    changes unless an owner edits it. The rest is the callout reserve, shown in weeks at recent pool size.
// Everything that decides the hash is fixed for the day (the cut, on-chain grants, a list update), so both owners
// build the same transaction. Nothing is sent unless an eth_call of the exact transaction succeeds from the owner.
import {getWalletHub} from '/wallet-hub-fresh.mjs';
import {OWNERS,createSafeReader} from '/safe-founding-read.mjs';
import {createSafeSection} from '/safe-founding-section.mjs';
import {FOUNDING, beneficiary, grantBatch, dayCut} from '/founding-config.mjs';
import {grantsTx, topUpTx, decodeGrant, grantedSet, SEL, parseWeth, DEFAULT_WETH} from '/founding-fund.mjs';
import {safeHashCall, safeExecData} from '/qdrops-core.mjs';
const hub = getWalletHub(window), CHAIN = FOUNDING.pay.chain, SAFE = FOUNDING.grant.grantor;
if(new URLSearchParams(location.search).has('weth')){const topup=document.getElementById('qff-weth');topup.parentElement.prepend(topup);}
const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v); n.append(...kids.filter(k => k != null)); return n; };
const pad = a => a.toLowerCase().slice(2).padStart(64, '0'), W = v => BigInt(v).toString(16).padStart(64, '0');
const fmt = (v, d = 0) => (Number(BigInt(v)) / 1e18).toLocaleString('en-US', {maximumFractionDigits: d});
const reader=createSafeReader({wallet:()=>hub.snapshot().current}),{rpc,call}=reader;
let foundingHint=null;
async function foundingJSON(){const r=await fetch('/api/founding',{cache:'no-store',signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('Founding list unavailable (HTTP '+r.status+'). Retry.');return r.json();}
const words = h => { const s = h.slice(2), o = []; for (let i = 0; i < s.length; i += 64) o.push(BigInt('0x' + s.slice(i, i + 64))); return o; };

async function readCommon(requireFounding=false){const c=await reader.common();return {...c,api:requireFounding?await foundingJSON():foundingHint};}
async function readGrants() {
  const c = await readCommon(true), g = FOUNDING.grant;
  const ids = words(await call(g.qgrants, '0x' + SEL.grantsBy + pad(SAFE), null, c.blockTag)).slice(2);
  const grants = await Promise.all(ids.map(id => call(g.qgrants, '0x' + SEL.get + W(id), null, c.blockTag).then(decodeGrant)));
  const granted = grantedSet(grants), cut = dayCut(c.now);
  // Entry rule at payout: only creators holding 100,000 QHOOKS right now (others wait for a later batch).
  const due = (c.api.launches || []).filter(l => l.qualifiedAt && l.qualifiedAt < cut && !granted.has(beneficiary(l)));
  const holding = new Set(), waiting = [];
  await Promise.all(due.map(async l => { try { const r = await fetch('/api/founding/eligibility?wallet=' + beneficiary(l), {cache: 'no-store'}), d = await r.json(); if (d.eligible) holding.add(beneficiary(l)); else waiting.push(l); } catch { waiting.push(l); } }));
  const {rows, left} = grantBatch((c.api.launches || []).filter(l => holding.has(beneficiary(l))), granted, cut);
  const bal = BigInt(await call(g.token, '0x' + SEL.balanceOf + pad(SAFE), null, c.blockTag));
  const tx = rows.length ? grantsTx(rows) : null;
  return {...c, kind: 'grants', rows, left, granted: granted.size, bal, tx, short: tx && bal < tx.total, waiting};
}
const wethInput = el('input', {id: 'qff-amount', type: 'text', inputmode: 'decimal', autocomplete: 'off', value: new URLSearchParams(location.search).get('weth') || DEFAULT_WETH, 'aria-describedby': 'qff-amount-hint'});
const wethField = el('p', {class: 'qff-amount'}, el('label', {for: 'qff-amount'}, 'Amount (WETH) '), wethInput, el('span', {id: 'qff-amount-hint'}, ' Both devices use the same proposal link. The amount is never raised or rounded; use up to four decimal places.'));
let poolCache = null;
// One shared request, at most 8 s: the pool size is a hint for the split, never a reason to hold the page.
function calloutPool() {
  if (poolCache && (poolCache.body === undefined || Date.now() - poolCache.at < 300000)) return poolCache.p;
  const entry = {at: Date.now(), body: undefined};
  entry.p = Promise.race([fetch('/api/drops/callouts-pool', {cache: 'no-store'}).then(r => r.ok ? r.json() : null).catch(() => null), new Promise(res => setTimeout(() => res(null), 8000))])
    .then(b => { entry.body = b; if (!b) entry.at = Date.now() - 240000; return b; });
  poolCache = entry; return entry.p;
}
async function readTopUp() {
  const c=await readCommon(), pool=poolCache?.body||null, need=/^\d+$/.test(c.api?.wethWaiting||'')?BigInt(c.api.wethWaiting):null;
  const bal=BigInt(await call(FOUNDING.pay.token,'0x'+SEL.balanceOf+pad(SAFE),null,c.blockTag));
  const typed=parseWeth(wethInput.value);let tx=typed!==null&&typed>0n?topUpTx(typed):null,amountError='';
  if(tx&&tx.amount!==typed){tx=null;amountError='Use up to four decimal places. No rounding was applied.';}
  const callouts=tx&&need!==null?(tx.amount>need?tx.amount-need:0n):null,daily=pool?.dailyPoolWei?BigInt(pool.dailyPoolWei):null;
  const weeks=callouts!==null&&daily&&daily>0n?Number(callouts)/Number(daily*7n):null;
  return {...c,kind:'topup',need,bal,tx,short:tx&&bal<tx.amount,typed,amountError,callouts,daily,weeks,days:pool?.days?.length||0};
}
wethInput.addEventListener('input',()=>drawTopUp.edit());
wethInput.addEventListener('change',()=>{const u=new URL(location.href);u.searchParams.set('weth',wethInput.value.trim());u.searchParams.delete('nonce');u.searchParams.delete('safeHash');history.replaceState(null,'',u);drawTopUp.reset();});
const section=(root,read,describe)=>createSafeSection({root,read,describe,hub,reader,topup:root.id==='qff-weth'});
const drawGrants = section(document.getElementById('qff-grants'), readGrants, s => ({
  title: s.rows.length ? 'Grant 50,000 QHOOKS to ' + s.rows.length + ' founding creator' + (s.rows.length > 1 ? 's' : '') : 'No grants due',
  facts: [['Budget', '2,500,000 QHOOKS · ' + s.granted + ' granted · ' + fmt(s.left) + ' left after this batch'], ['Safe QHOOKS', fmt(s.bal)],
    ['Vesting', '30 days from the grant, claimable as it vests; the Safe can take back what has not vested']],
  extra: s.rows.length ? [el('ol', {}, ...s.rows.map(r => el('li', {}, '#' + r.slot + ' ' + r.beneficiary + ' · token ' + r.chainId + ':' + r.token + ' ',
    el('a', {href: '/terminal#m=' + r.chainId + ':' + r.token, target: '_blank', rel: 'noopener'}, 'check it'))))] : [],
  extraNote: null,
  note: (s.waiting?.length ? s.waiting.length + ' qualified creator' + (s.waiting.length > 1 ? 's hold' : ' holds') + ' under 100,000 QHOOKS right now and will join a later batch. ' : '') + (s.rows.length ? 'Each creator reached ' + FOUNDING.grant.holders + ' holders and $' + FOUNDING.grant.volumeUsd.toLocaleString('en-US') + ' of volume within 14 days, before today 00:00 UTC. Check the tokens before approving.' : 'Milestones reached today join tomorrow\'s batch.'),
}));
const weeksText = s => s.weeks == null ? 'Refreshing…' : s.weeks >= 52 ? 'over a year' : s.weeks >= 2 ? Math.floor(s.weeks) + ' weeks' : s.weeks >= 1 ? 'about 1 week' : Math.max(1, Math.floor(s.weeks * 7)) + ' days';
const drawTopUp = section(document.getElementById('qff-weth'), readTopUp, s => ({
  title: s.tx ? 'Deposit ' + fmt(s.tx.amount, 4) + ' WETH for rewards' : s.typed === null ? 'Enter an amount' : 'Nothing to deposit',
  facts: [['Founding top-ups', s.need===null?'List unavailable; entered amount stays fixed':fmt(s.need, 6) + ' WETH waiting in the drop list'],
    ['Callout rewards', (s.callouts===null?'Reserve estimate unavailable':fmt(s.callouts, 6)+' WETH') + ' · covers ' + weeksText(s) + (s.daily ? ' at ' + fmt(s.daily, 6) + ' WETH a day (10% of terminal fees, last ' + s.days + ' days)' : '')],
    ['Safe WETH', (s.bal/10n**18n).toString()+'.'+(s.bal%10n**18n).toString().padStart(18,'0')], ['Into', 'QDrops ' + FOUNDING.pay.drops]],
  extra: [wethField],
  note: s.amountError || (s.tx ? (s.short ? 'The Safe holds less WETH than this. Move WETH to the Safe first.' : 'Drop lists pay founding top-ups and callout rewards from this. What is not used yet stays in QDrops for later lists.') : s.typed === null ? 'Type an amount like 0.05.' : 'Each weekly drop list adds what founding launches and callers earned.'),
}));
drawGrants(); drawTopUp();
let resumed=0;const refreshVisible=()=>{if(document.visibilityState==='visible'&&document.activeElement!==wethInput&&Date.now()-resumed>=2000){resumed=Date.now();void drawTopUp();}};setInterval(refreshVisible,15000);document.addEventListener('visibilitychange',refreshVisible);window.addEventListener('focus',refreshVisible);
Promise.allSettled([foundingJSON().then(j=>{foundingHint=j;}),calloutPool()]).then(()=>{drawTopUp.render();});
