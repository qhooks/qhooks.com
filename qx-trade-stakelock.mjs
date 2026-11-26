// Terminal staking tab, QHOOKS only: optional timed locks (QStakeLock) next to the unchanged flexible staking card.
// Locks stake in the same vault and earn the same staking rewards; on top they share a bonus pot by shares (1 week 1,
// 2 weeks 2, 30 days 4 per QHOOKS), paid when the lock ends. Early exit returns everything locked plus staking rewards and gives up
// only that lock's bonus. Flexible stakers can move staked QHOOKS into a lock (unstake, approve, lock: one EIP-5792 batch when the
// wallet supports it, else three prompts), and a move that stops after unstake offers the lock next. Shown once the lock contract is deployed with the expected code. Copy reviewed by the main thread.
import {createReadClient} from '/qx-taps.mjs';
import {readTimedLocks} from '/qx-stake-lock-data.mjs';
import {parseAmountInput} from '/qx-amount-input.mjs';
import {calldata, ethCall, codeAt, words, parseUnits, formatUnits, send, sendCallsAtomic, ensureAllowance, connectedAddress, onWalletChange, rpc, h} from '/qx-chain.mjs';
import {routerLive, sendCallsWithNote, reportLockReceipts} from '/qx-stakelock-note.mjs';

const card = document.getElementById('qtzl');
const TERMS = [[1, '1 week', '1 bonus share'], [2, '2 weeks', '2 bonus shares'], [3, '30 days', '4 bonus shares']];
let cfg = null, live = false, seq = 0, flash = '', currentPool = null, marketSeq=0, eligible=false, actingOwner=null;
const standalone=card?.hasAttribute('data-timed-locks-standalone'),lastGood=new Map();
const readClient=()=>createReadClient({fetchImpl:(url,init={})=>fetch(url,{...init,qhooksPublicOnly:true})});
const current=(revision,owner)=>revision===seq&&connectedAddress()===owner;
function arm(root,owner){for(const b of root.querySelectorAll('button:not([data-lock-retry])')){b.dataset.lockOwner=owner||'';b.disabled=!!actingOwner||!live||!owner||b.dataset.lockReadUnavailable==='true';}}
function retryButton(){const b=h('button',{type:'button',class:'qtx-mini','data-lock-retry':''},'Refresh timed locks');b.addEventListener('click',()=>{if(cfg)render().catch(showError);else show(currentPool);});return b;}
function showError(){if(!card||!eligible)return;card.hidden=false;const status=card.querySelector('.qtzl-load-status');if(status)status.textContent='Could not refresh timed locks. Your last loaded positions stay visible. Try again.';}
   // flash: the last action's message, kept across the re-render
const sha = async hex => [...new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(hex.slice(2).match(/../g), x => parseInt(x, 16))))].map(x => x.toString(16).padStart(2, '0')).join('');
const fmt = (v, max = 2) => formatUnits(v, 18, max);
// After a move stops between unstake and lock, the card remembers the amount and term for this wallet (per browser) so it can
// offer the lock from the wallet next. Storage can be missing; the in-memory copy then covers this visit.
const moved = new Map();
const MK = me => 'qtzl-move:' + me;
const getMove = me => { try { const v = JSON.parse(localStorage.getItem(MK(me)) || 'null'); if (v) return {amount: BigInt(v.amount), term: String(v.term)}; } catch {} return moved.get(me) || null; };
const setMove = (me, v) => { if (v) moved.set(me, v); else moved.delete(me); try { v ? localStorage.setItem(MK(me), JSON.stringify({amount: v.amount.toString(), term: v.term})) : localStorage.removeItem(MK(me)); } catch {} };
const when = t => new Date(Number(t) * 1000).toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
// FR2SWITCH (2026-11-26): QFeeRouterV2 counts timed locks toward the holder bonus once each lock id is listed there
// (qx-stakelock-note.mjs). Once v2 has code: a wallet with atomic batches gets noteLocks([nextId]) in the same batch as its
// lock; any other wallet sends exactly what it sent before, and the new id from the receipt goes to the keeper. No new copy.
const batchWithNote = (c, calls, s) => sendCallsWithNote({chainId: c, calls, onStatus: s, sendCallsAtomic, ethCall, codeAt, owner: connectedAddress()});
const noteReceipt = receipt => { reportLockReceipts(receipt, {owner: connectedAddress(), codeAt}).catch(() => {}); };
/// Lock `a` QHOOKS from the wallet for `tv`. With v2 live and an atomic-batch wallet: [approve if needed, lock, noteLocks] in
/// one batch; otherwise the unchanged approve-then-lock prompts.
async function lockFromWallet(c, a, tv, s) {
  const lockCall = {to: cfg.lock, data: calldata(cfg.sel.lock, ['uint256', 'uint8'], [a, tv])}, me = connectedAddress();
  if (me && await routerLive(codeAt)) {
    const allowance = BigInt(await ethCall(c, cfg.token, calldata(cfg.sel.allowance, ['address', 'address'], [me, cfg.lock])));
    const calls = allowance < a ? [{to: cfg.token, data: calldata(cfg.sel.approve, ['address', 'uint256'], [cfg.lock, a])}, lockCall] : [lockCall];
    if (await batchWithNote(c, calls, s)) return;
  }
  await ensureAllowance(c, cfg.token, cfg.lock, a, s);
  s('Confirm the lock in your wallet…');
  noteReceipt(await send(c, lockCall, s));
}

async function act(btn, status, fn) {
  if(actingOwner)return;
  if(!live||btn.dataset.lockOwner!==connectedAddress()){status.textContent='Wait for the wallet and contract check, then try again.';return;}
  actingOwner=connectedAddress();arm(card,actingOwner);btn.disabled = true; status.textContent = '';
  try { await fn(t => { status.textContent = t; }); } catch (e) { status.textContent = /reject|denied|cancel/i.test(e?.message || '') ? 'Cancelled in your wallet. Nothing was sent.' : (e?.message || 'That did not go through.'); }
  finally { actingOwner=null;btn.disabled = false; flash = status.textContent; render().catch(() => {}); }
}

function rewardText(l){
 return 'Staking rewards: '+(l.q===null||l.t===null?'refreshing…':fmt(l.q,6)+' WETH + '+fmt(l.t,0)+' QHOOKS')+' · Bonus so far: '+(l.bonus===null?'refreshing…':fmt(l.bonus,0)+' QHOOKS')+' (paid when the lock ends)';
}
function lockRows(locks,now){
  const c=cfg.chainId;
  return locks.map(l => {
    const ended = now !== null && now >= l.end, st = h('p', {class: 'qtx-status', role: 'status'});
    const claim = h('button', {type: 'button', class: 'qtx-mini'}, 'Claim staking rewards');
    claim.addEventListener('click', () => act(claim, st, async s => { await send(c, {to: cfg.lock, data: calldata(cfg.sel.claimBase, ['uint256'], [l.id])}, s); s('Claimed.'); }));
    const out = h('button', {type: 'button', class: 'qtx-mini'}, ended ? 'Withdraw with bonus' : 'Withdraw now (gives up the bonus)');
    out.addEventListener('click', () => act(out, st, async s => {
      if (!ended && !confirm('Leaving before ' + when(l.end) + ' returns everything you locked plus staking rewards, and gives up this lock\'s bonus. Continue?')) return;
      await send(c, {to: cfg.lock, data: calldata(cfg.sel.withdraw, ['uint256'], [l.id])}, s); s('Withdrawn.');
    }));
    const kids = [h('p', {}, fmt(l.amount, 0) + ' QHOOKS · ' + TERMS[l.term - 1][1] + ' · ' + (ended ? 'ended ' : 'ends ') + when(l.end)),
      h('p', {class: 'qtx-fine qtzl-rewards'}, rewardText(l)), claim, out];
    if (l.term < 3) {
      const up = h('button', {type: 'button', class: 'qtx-mini'}, 'Move to 30 days');
      up.addEventListener('click', () => act(up, st, async s => { await send(c, {to: cfg.lock, data: calldata(cfg.sel.upgrade, ['uint256', 'uint8'], [l.id, 3n])}, s); s('Moved to 30 days.'); }));
      kids.push(up);
    }
    kids.push(st);
    return h('div', {class: 'qtx-lock', 'data-lock-id':String(l.id), style: 'display:grid;gap:8px;margin:14px 0;padding-top:12px;border-top:1px solid currentColor;border-top-color:color-mix(in srgb,currentColor 18%,transparent)'}, ...kids);
  });
}

async function render() {
  if(!card||!cfg||!eligible)return;
  const me=connectedAddress();if(actingOwner===me&&me)return;
  const mine=++seq,c=cfg.chainId,io=readClient();
  card.hidden=false;
  let locks=me?(lastGood.get(me)||[]):[],now=null;
  const load=h('p',{class:'qtx-status qtzl-load-status',role:'status'},me?'Loading your timed locks…':'Connect a wallet to see your timed locks.');
  const positions=h('div',{class:'qtzl-positions',role:'region','aria-label':'Your timed locks'});
  const paint=()=>{if(!current(mine,me)||actingOwner===me&&me)return;positions.replaceChildren(...lockRows(locks,now));arm(positions,me);const flexible=document.getElementById('qtz');if(locks.length&&flexible?.parentElement===card.parentElement)flexible.before(card);};
  paint();card.replaceChildren(h('h2',{id:'qtzl-heading'},'Timed locks'),load,retryButton(),positions);
  if(me)card.dataset.lockOwner=me;else delete card.dataset.lockOwner;
  // Contract verification and optional detail reads never gate the position table.
  const verified=(async()=>{if(!live)try{const code=await io.rpc(c,'eth_getCode',[cfg.lock,'latest']);if(!current(mine,me))return;live=code!=='0x'&&(await sha(code))===cfg.runtimeSha256;}catch{}if(current(mine,me))arm(card,me);})();
  const extras=Promise.allSettled([io.rpc(c,'eth_call',[{to:cfg.lock,data:cfg.sel.potHeld},'latest']),io.rpc(c,'eth_call',[{to:cfg.lock,data:cfg.sel.potFinish},'latest']),
    ...TERMS.map(([term])=>io.rpc(c,'eth_call',[{to:cfg.lock,data:calldata(cfg.sel.bonusPerDay,['uint8','uint256'],[term,10n**24n])},'latest'])),
    ...(me?[io.rpc(c,'eth_call',[{to:cfg.vault,data:calldata(cfg.sel.staked,['address'],[me])},'latest']),io.rpc(c,'eth_call',[{to:cfg.token,data:calldata(cfg.sel.balanceOf,['address'],[me])},'latest'])]:[Promise.resolve('0x0'),Promise.resolve('0x0')]),io.rpc(c,'eth_getBlockByNumber',['latest',false])]);
  let listFailed=false;
  if(me)try{locks=await readTimedLocks({owner:me,cfg,rpc:readClient().rpc});if(!current(mine,me))return;lastGood.set(me,locks);paint();load.textContent=locks.length?'Your timed locks · '+me.slice(0,6)+'…'+me.slice(-4):'No active timed locks for this wallet.';}catch{listFailed=true;if(current(mine,me))load.textContent='Could not refresh the lock list. Last loaded positions are kept; try Refresh timed locks.';}
  const enrich=Promise.allSettled(locks.map(async l=>{
    const reader=readClient(),call=data=>reader.rpc(c,'eth_call',[{to:cfg.lock,data,from:me},'latest']);
    const pending=call(calldata(cfg.sel.pending,['uint256'],[l.id])).then(words).then(p=>{if(p.length>=3){l.q=p[0];l.t=p[1];l.bonus=p[2];}}).catch(()=>{});
    await pending;
    try{const p=words(await call(calldata(cfg.sel.claimBase,['uint256'],[l.id])));if(p.length>=2){l.q=p[0];l.t=p[1];}}catch{}
    if(current(mine,me)){const el=positions.querySelector('[data-lock-id="'+l.id+'"] .qtzl-rewards');if(el)el.textContent=rewardText(l);}
  }));
  const optional=await extras;if(!current(mine,me)||actingOwner===me&&me)return;
  const value=i=>optional[i]?.status==='fulfilled'?optional[i].value:null;
  const potHeld=value(0),potFinish=value(1),perDay=[value(2),value(3),value(4)],stakedHex=value(5),walletHex=value(6);
  const staked=stakedHex===null?null:BigInt(stakedHex),wallet=walletHex===null?null:BigInt(walletHex);
  now=value(7)?.timestamp?BigInt(value(7).timestamp):null;
  let resume=me?getMove(me):null;
  if(resume&&wallet===0n){setMove(me,null);resume=null;}
  const status = h('p', {class: 'qtx-status', role: 'status'}, flash); flash = '';
  const amount = h('input', {type: 'text', inputmode: 'decimal', placeholder: 'QHOOKS amount', 'aria-label': 'QHOOKS to lock'});
  const term = h('select', {'aria-label': 'Lock term'}, ...TERMS.map(([v, name, m]) => h('option', {value: String(v)}, name + ' · ' + m)));
  term.value = '3';
  const lockBtn = h('button', {type: 'button', class: 'qtx-mini'}, 'Lock');
  lockBtn.addEventListener('click', () => act(lockBtn, status, async s => {
    const a = parseAmountInput(amount.value, 18); if (!a) throw Error('Enter an amount.');
    await lockFromWallet(c, a, BigInt(term.value), s);
    if (me) setMove(me, null);
    s('Locked.');
  }));
  const termPicker = v => { const t = h('select', {'aria-label': 'Lock term'}, ...TERMS.map(([x, name, m]) => h('option', {value: String(x)}, name + ' · ' + m))); t.value = v; return t; };
  let moveBox = null;
  if (resume && wallet !== null) {
    // Stopped after unstake: the QHOOKS are in the wallet; approve (if needed) + lock remain.
    const n = resume.amount < wallet ? resume.amount : wallet, t = termPicker(resume.term), st = h('p', {class: 'qtx-status', role: 'status'});
    const btn = h('button', {type: 'button', class: 'qtx-mini'}, 'Lock ' + fmt(n, 0) + ' QHOOKS from your wallet');
    btn.addEventListener('click', () => act(btn, st, async s => {
      await lockFromWallet(c, n, BigInt(t.value), s);
      setMove(me, null); s('Locked.');
    }));
    moveBox = h('div', {class: 'qtx-move', style: 'display:grid;gap:8px;margin:14px 0'},
      h('p', {}, 'Your QHOOKS are out of staking and back in your wallet.'), h('div', {class: 'qtx-row'}, t, btn), st);
  } else if (staked !== null && staked > 0n) {
    const t = termPicker(term.value), st = h('p', {class: 'qtx-status', role: 'status'});
    const full = formatUnits(staked, 18, 18);
    const amt = h('input', {type: 'text', inputmode: 'decimal', value: full, 'aria-label': 'Staked QHOOKS to move'});
    const btn = h('button', {type: 'button', class: 'qtx-mini'}, 'Move my staked QHOOKS into a lock');
    btn.addEventListener('click', () => act(btn, st, async s => {
      const a = amt.value.trim() === full ? staked : parseAmountInput(amt.value,18);
      if (!a) throw Error('Enter an amount.');
      if (a > staked) throw Error('That is more than you have staked (' + fmt(staked, 0) + ' QHOOKS).');
      const tv = BigInt(t.value), allowance = BigInt(await ethCall(c, cfg.token, calldata(cfg.sel.allowance, ['address', 'address'], [me, cfg.lock])));
      const calls = [{to: cfg.vault, data: calldata(cfg.sel.unstake, ['uint256'], [a]), label: 'Unstake'}];
      if (allowance < a) calls.push({to: cfg.token, data: calldata(cfg.sel.approve, ['address', 'uint256'], [cfg.lock, a]), label: 'Approve'});
      calls.push({to: cfg.lock, data: calldata(cfg.sel.lock, ['uint256', 'uint8'], [a, tv]), label: 'Lock'});
      const batch = await batchWithNote(c, calls, s);
      if (batch) { s('Moved into a lock.'); return; }
      for (let i = 0; i < calls.length; i++) {
        const step = 'Step ' + (i + 1) + ' of ' + calls.length + ' · ' + calls[i].label + ': ';
        try { const r = await send(c, calls[i], x => s(step + x)); if (i === calls.length - 1) noteReceipt(r); }
        catch (e) { if (i === 0) throw e; throw Error('Stopped before the lock.'); }
        if (i === 0) setMove(me, {amount: a, term: t.value});   // unstaked: remember the next step
      }
      setMove(me, null); s('Moved into a lock.');
    }));
    moveBox = h('div', {class: 'qtx-move', style: 'display:grid;gap:8px;margin:14px 0'},
      h('p', {}, 'Already staking? Move your staked QHOOKS into a lock in one go. Rewards you\'ve earned so far stay claimable in Staking above.'),
      h('p', {class: 'qtx-fine'}, 'Staked now: ' + fmt(staked, 0) + ' QHOOKS'),
      h('div', {class: 'qtx-row'}, amt, t, btn), st);
  }
  const potKnown=potHeld!==null&&potFinish!==null&&perDay.every(v=>v!==null)&&now!==null;
  const potLeft=potKnown&&now<BigInt(potFinish);
  card.replaceChildren(
    h('h2', {id: 'qtzl-heading'}, 'Timed locks'),load,retryButton(),positions,
    h('p', {}, 'Flexible staking stays available. Lock QHOOKS for 1 week, 2 weeks or 30 days to earn the same staking rewards plus a share of a bonus pot. Longer locks get more of it: per QHOOKS, a 2-week lock gets twice the share of a 1-week lock, and a 30-day lock four times.'),
    h('p', {class: 'qtx-fine'}, 'Locks take QHOOKS from your wallet.'),
    h('p', {class: 'qtx-fine'}, 'When a lock ends it stops earning bonus. Withdraw it with the bonus, or move it into a new lock.'),
    h('p', {class: 'qtx-fine'}, 'The bonus is paid when your lock ends. You can leave early at any time: you get back everything you locked plus staking rewards, and only that lock\'s bonus goes back to the pot. Nobody else can move your locked QHOOKS.'),
    h('p', {class: 'qtx-fine'}, !potKnown?'Bonus details are refreshing. Your timed locks and their controls remain available below.':potLeft ? 'Bonus pot: ' + fmt(BigInt(potHeld), 0) + ' QHOOKS. Bonus right now for 1,000,000 QHOOKS: ' + TERMS.map(([, name], i) => name + ' ' + fmt(BigInt(perDay[i]), 0) + '/day').join(' · ') + '. It changes as others lock.' : 'The bonus pot is empty right now. Locks still earn the same staking rewards.'),
    ...(moveBox ? [moveBox] : []), h('div', {class: 'qtx-row'}, amount, term, lockBtn), status);   // no move box: nothing (replaceChildren would print "null")
  paint();lockBtn.dataset.lockReadUnavailable=String(wallet===null);arm(card,me);
  if(listFailed)load.textContent='Could not refresh the lock list. Last loaded positions are kept; try Refresh timed locks.';
  await Promise.allSettled([verified,enrich]);
  if(current(mine,me)){arm(positions,me);if(!live)load.textContent+=' Contract check is unavailable; refresh to enable actions.';}
  if(current(mine,me)&&eligible)card.hidden = false;
}

async function show(pool){
 if(!card)return;const stage=++marketSeq;seq++;currentPool=pool;eligible=standalone||!!pool&&String(pool.chainId)==='4663'&&String(pool.token||pool.controller||'').toLowerCase()==='0x20429af7ca3b0ce4d99edbaa0693f26c5df05195';if(!eligible){card.hidden=true;return;}
 cfg ||= await fetch('/full-launch/stake-lock-v1.json',{cache:'no-store',signal:AbortSignal.timeout(5000)}).then(r=>{if(!r.ok)throw Error('Configuration read failed');return r.json();}).catch(()=>null);
 if(stage!==marketSeq)return;
 if(!cfg){card.hidden=false;card.replaceChildren(h('h2',{},'Timed locks'),h('p',{role:'status'},'Could not load timed locks. Try again.'),retryButton());return;}
 if(!standalone&&(!pool||String(pool.chainId)!==cfg.chainId||String(pool.token||pool.controller||'').toLowerCase()!==cfg.token)){seq++;card.hidden=true;return;}
 await render().catch(showError);
}
document.addEventListener('qhooks:pool',e=>show(e.detail));
onWalletChange(()=>{if(cfg&&eligible)render().catch(showError);});
if(standalone)show(null);else if(window.__qhooksPool)show(window.__qhooksPool);

document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&cfg&&eligible)render().catch(showError);});
