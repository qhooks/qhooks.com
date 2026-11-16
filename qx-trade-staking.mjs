// Trade page / terminal: holder staking for launches whose revenue split pays stakers: the marketplace staking module
// (QStakeModule, same functions) or, for launches made before the marketplace, the original QStakeVault. The launch's vault
// (one per token and pair, deterministic address) receives that share; stakers earn it, streamed over a day, in the
// token and the pair currency. Anyone can open the vault, pay out what the launch holds, and stake, unstake or claim.
import {createReadClient} from '/qx-taps.mjs';
import {parseAmountInput} from '/qx-amount-input.mjs';
import { decodeString, calldata, words, toAddress, formatUnits, send, ensureAllowance, connectedAddress, onWalletChange, h } from '/qx-chain.mjs';
import { BLOCK_FIELDS } from '/full-launch/packages/multichain-launch/launch-blocks.mjs';
import { stakeVaultAddress, stakeVaultDeployData, STAKE_DEPLOYER } from '/full-launch/packages/multichain-launch/stake-vault.mjs';
import { modulesAmong, moduleDeployData, MODULE_DEPLOYER, loadModules } from '/full-launch/packages/multichain-launch/market-modules.mjs';

// Use the existing checklist reader without the global proxy shim swallowing its public fallback.
function stakingReads(){
 // stakesafe: a connected wallet's staking reads are money-panel reads: the relay treats them as critical (never budget-paced).
 const client=createReadClient({purpose:connectedAddress()?'transaction':'',fetchImpl:(url,init={})=>fetch(url,{...init,qhooksPublicOnly:true})});
 const ethCall=(chain,to,data,from)=>client.rpc(chain,'eth_call',[{to,data,...(from?{from}:{})},'latest']);
 const codeAt=(chain,to)=>client.rpc(chain,'eth_getCode',[to,'latest']);
 const erc20=async(chain,token,owner)=>{const [balance,decimals,symbol]=await Promise.all([owner?ethCall(chain,token,calldata('0x70a08231',['address'],[owner])):'0x0',ethCall(chain,token,'0x313ce567'),ethCall(chain,token,'0x95d89b41')]);return {balance:BigInt(balance),decimals:Number(BigInt(decimals)),symbol:decodeString(symbol)};};
 return {ethCall,codeAt,erc20,begin:client.begin};
}

// Selectors of the pinned QStakeVault ABI (full-launch/extras.json, stakeVault) and the blocks contract.
const SEL = { stake: '0xa694fc3a', unstake: '0x2e17de78', claim: '0x4e71d92d', sync: '0xfff6cae9', earned: '0x008cc262', staked: '0x98807d84', totalStaked: '0x817b1cd2', stream: '0x2d94d8b5',
  config: '0x79502c55', release: '0x86d1a69f', creatorQuote: '0xe55e1ce9', creatorToken: '0x483a5f14' };
const card = document.getElementById('qtz');
const AMOUNT_HELP = 'Use numbers only, e.g. 1000000 or 1,000,000';
// "We hear about it first" (stakesafe): when the panel can read nothing even after every fallback, one small beacon
// (chain + token + reason; no wallet address) goes to /api/health/staking. Once per page and reason.
const reported = new Set();
function reportMiss(chain, token, reason) {
  const k = chain + ':' + token + ':' + reason; if (reported.has(k)) return; reported.add(k);
  try { const body = JSON.stringify({chain: String(chain), token: String(token).toLowerCase(), reason});
    if (!(navigator.sendBeacon && navigator.sendBeacon('/api/health/staking', new Blob([body], {type: 'application/json'}))))
      fetch('/api/health/staking', {method: 'POST', headers: {'content-type': 'application/json'}, body, keepalive: true}).catch(() => {}); } catch {}
}
// The panel's setup (vault, token, decimals, share) for a market, kept from the last good read so a failed setup read
// still draws the actions. Everything kept here is public chain data; money actions re-confirm the vault on chain.
const SETUP_KEY = 'qtz-setup:v1:';
const big = (k, v) => typeof v === 'bigint' ? {$big: v.toString()} : v, unbig = (k, v) => v && typeof v === 'object' && '$big' in v ? BigInt(v.$big) : v;
function saveSetup(pool, st) { try { localStorage.setItem(SETUP_KEY + pool.chainId + ':' + String(pool.controller).toLowerCase(), JSON.stringify({at: Date.now(), st: {...st, mod: st.mod ? {builderBps: st.mod.builderBps, builderName: st.mod.builderName} : null}}, big)); } catch {} }
function loadSetup(pool) { try { const j = JSON.parse(localStorage.getItem(SETUP_KEY + pool.chainId + ':' + String(pool.controller).toLowerCase()) || 'null', unbig); return j && Date.now() - j.at < 30 * 86400e3 ? j.st : null; } catch { return null; } }
const standalone = card?.hasAttribute('data-staking-standalone');
let state = null, seq = 0, renderSeq = 0;
let lastPool = null;

function setupPending() {
  const me = connectedAddress();
  return [h('h2', {id: 'qtz-heading'}, 'Staking'),
    h('p', {class: 'qtb-note', role: 'status'}, 'Refreshing staking setup. Actions become available after the setup and staking contract can be checked.'),
    ...(me ? [h('p', {class: 'qtb-note'}, 'For wallet ' + me.slice(0, 6) + '…' + me.slice(-4)),
      h('div', {class: 'qtx-actions'}, ...['Stake', 'Unstake', 'Claim rewards'].map(label => h('button', {type: 'button', class: 'qtx-mini', disabled: true}, label)))] : [])];
}

function unavailable(pool) {
  state = null; renderSeq++;
  if (!standalone) { card.hidden = true; return; }
  const retry = h('button', {type: 'button', class: 'qtx-mini'}, 'Retry');
  retry.addEventListener('click', () => show(pool));
  card.replaceChildren(...setupPending(), retry);
  card.setAttribute('aria-busy', 'false');
  card.hidden = false;
}

async function refresh() {
  if (!state) return;
  const before = state, wallet = connectedAddress();
  try { await render(); } catch { if (standalone && state === before && connectedAddress() === wallet) unavailable(lastPool); }
}

async function act(btn, status, fn) {
  btn.disabled = true; status.textContent = '';
  let last = '';
  try {
    await fn(t => { last = t; status.textContent = t; });
    await render();
    const fresh = card.querySelector('.qtx-status'); if (fresh) fresh.textContent = /…$/.test(last) ? 'Done.' : last || 'Done.';
  } catch (e) { status.textContent = e.message || 'That did not go through'; btn.disabled = false; }
}
const statGrid = (...cells) => { const g = h('div', { class: 'qtb-now' }, ...cells.filter(Boolean)); if (cells.filter(Boolean).length > 2) g.style.gridTemplateColumns = 'repeat(auto-fit,minmax(120px,1fr))'; return g; };
const cell = (k, v) => h('div', {}, h('span', {}, k), h('b', {}, v));

async function render() {
  if (!state) return;
  const snapshot = state, request = ++renderSeq;
  const reads = stakingReads(), {ethCall,codeAt,erc20} = reads;
  const { chainId, token, quote, vault, blocks, shareBps, t, q, supply, mod } = snapshot, me = connectedAddress();
  const current = () => request === renderSeq && state === snapshot && connectedAddress() === me;
  const assertAction = () => { if (state !== snapshot || connectedAddress() !== me) throw new Error('The wallet or staking market changed. Review this action again.'); };
  const verifySetup = async () => { assertAction();
    const io = stakingReads();
    // A saved setup can draw the panel, but never authorizes an allowance or transaction. Re-bind its vault, pair,
    // payee share and editable token precision to the current chain configuration before using it for a money action.
    if (!snapshot.setupVerified) {
      const verified = await Promise.all([io.ethCall(chainId, blocks, SEL.config).then(words), io.ethCall(chainId, token, '0x313ce567').then(BigInt)]).catch(() => null);
      assertAction();
      if (!verified) throw new Error('Could not refresh the staking setup right now. Try again in a moment.');
      const [config, decimals] = verified, pair = ['token', 'quote'].map(key => toAddress(config[BLOCK_FIELDS.findIndex(([k]) => k === key)]));
      const payees = config.slice(BLOCK_FIELDS.length, BLOCK_FIELDS.length + 8).map(toAddress), index = payees.indexOf(vault);
      if (pair[0] !== token || pair[1] !== quote || index < 0 || config[BLOCK_FIELDS.length + 8 + index] !== shareBps || decimals !== BigInt(t.decimals))
        throw new Error('The staking setup changed. Refresh staking before continuing.');
      snapshot.setupVerified = true;
    }
  };
  // Every action requires fresh on-chain code after any cached setup has been verified.
  const confirmVault = async () => {
    await verifySetup();
    const code = await stakingReads().codeAt(chainId, vault).catch(() => null);
    assertAction();
    if (code === null) throw new Error('Could not confirm the staking contract right now. Try again in a moment.');
    if (code === '0x') throw new Error('Staking has not been opened for this launch yet.'); };
  const fmtT = n => formatUnits(n, t.decimals, 2) + ' ' + t.symbol, fmtQ = n => formatUnits(n, q.decimals, 4) + ' ' + q.symbol;
  const status = h('p', { class: 'qtx-status', role: 'status', ariaLive: 'polite' });
  const head = [h('h2', { id: 'qtz-heading' }, 'Staking'),
    h('p', { class: 'qtb-note' }, 'This launch pays ' + (Number(shareBps) / 100) + '% of its income to holders who stake ' + t.symbol + '. Payouts stream to stakers over a day, in ' + t.symbol + ' and ' + q.symbol + '. No lockup: unstake any time.'
      + (mod?.builderBps ? ' The module\'s builder, ' + mod.builderName + ', keeps ' + mod.builderBps / 100 + '% of what it receives.' : ''))];
  // stakesafe (2026-11-13, Randall: "make sure we don't ever have that error on staking panel"): every read settles on
  // its own. A read that fails after the read client's relay → public fallbacks shows "Refreshing" and is retried in
  // place; it never removes the Stake / Unstake / Claim row. Buttons are disabled only by a known fact.
  const [liveR, cqR, ctR, totalR, mineR, earnedR, balR, streamR] = await Promise.allSettled([
    codeAt(chainId, vault),
    ethCall(chainId, blocks, SEL.creatorQuote).then(BigInt), ethCall(chainId, blocks, SEL.creatorToken).then(BigInt),
    ethCall(chainId, vault, SEL.totalStaked).then(BigInt),
    me ? ethCall(chainId, vault, calldata(SEL.staked, ['address'], [me])).then(BigInt) : 0n,
    me ? ethCall(chainId, vault, calldata(SEL.earned, ['address'], [me])).then(words) : [0n, 0n],
    me ? erc20(chainId, token, me).then(x => x.balance) : 0n,
    ethCall(chainId, vault, calldata(SEL.stream, ['uint256'], [1n])).then(words)]);
  if (!current()) return;
  const got = r => r.status === 'fulfilled' ? r.value : null, missing = [liveR, cqR, ctR, totalR, mineR, earnedR, balR, streamR].filter(r => r.status !== 'fulfilled').length;
  // A vault we can't confirm is treated as open (it is, for every launch that ever showed this panel); each money action
  // confirms the contract again before it asks the wallet to sign.
  const live = liveR.status === 'fulfilled' ? liveR.value !== '0x' : true;
  const cq = got(cqR) ?? 0n, ct = got(ctR) ?? 0n;
  const waitingQ = cq * shareBps / 10000n, waitingT = ct * shareBps / 10000n;
  // Payout: the launch's release() pays every payee (the vault included); the vault's sync() starts streaming it.
  const payBtn = h('button', { type: 'button', class: 'qtx-mini', disabled: !me || (!cq && !ct && !live) }, live ? 'Pay out to stakers' : 'Pay out');
  payBtn.addEventListener('click', () => act(payBtn, status, async s => {
    await verifySetup();
    reads.begin();
    // Read again: another panel (or anyone) may have paid the launch out since this one was drawn; release() reverts on nothing.
    const [nq, nt] = (await Promise.all([ethCall(chainId, blocks, SEL.creatorQuote), ethCall(chainId, blocks, SEL.creatorToken)])).map(BigInt);
    assertAction();
    if (nq || nt) { s('Confirm the payout in your wallet…'); await send(chainId, { to: blocks, data: SEL.release }, s, assertAction); }
    if ((await codeAt(chainId, vault)) !== '0x') { assertAction(); s('Confirm the stream start in your wallet…'); await send(chainId, { to: vault, data: SEL.sync }, s, assertAction); }
    s('Paid out.');
  }));
  const waiting = waitingQ || waitingT ? h('div', { class: 'qtx-actions' }, h('span', { class: 'qtx-meta' }, 'Waiting to be paid to stakers: ' + [waitingQ && fmtQ(waitingQ), waitingT && fmtT(waitingT)].filter(Boolean).join(' + ')), payBtn) : null;
  if (!live) {
    const open = h('button', { type: 'button', class: 'workspace-button', disabled: !me }, 'Open staking');
    open.addEventListener('click', () => act(open, status, async s => {
      await verifySetup();
      reads.begin();
      s('Confirm in your wallet: this deploys the staking vault for ' + t.symbol + ' (one time, anyone can do it)…');
      await send(chainId, mod ? { to: MODULE_DEPLOYER, data: moduleDeployData(mod, token, quote) } : { to: STAKE_DEPLOYER, data: stakeVaultDeployData(token, quote) }, s, assertAction);
      if ((await codeAt(chainId, vault)) === '0x') throw new Error('The vault did not deploy');
      s('Staking is open.');
    }));
    card.replaceChildren(...[...head, h('p', { class: 'qtb-note' }, 'Staking has not been opened for this launch yet. Income for stakers is kept at the vault address until it is.'), waiting, open, status].filter(Boolean));
    card.hidden = false; return;
  }
  const total = got(totalR), mine = got(mineR), earned = got(earnedR), bal = got(balR), stream = got(streamR);
  const [rq, finish] = stream || [0n, 0n];
  const perDay = stream && finish > BigInt(Math.floor(Date.now() / 1000)) ? rq * 86400n / 10n ** 18n : 0n;
  const REFRESHING = () => h('span', {class: 'qtz-refreshing'}, 'Refreshing');
  const pctOf = (n, d) => d ? (Number(n * 10000n / d) / 100).toString() + '%' : '0%';
  const stats = statGrid(cell('Staked', total === null ? REFRESHING() : pctOf(total, supply) + ' of supply'),
    cell('Paying out per day', stream === null ? REFRESHING() : perDay ? h('span',{class:'qtz-daily-rate'},fmtQ(perDay)) : 'nothing right now'),
    me ? cell('Your stake', mine === null ? REFRESHING() : mine ? fmtT(mine) + (total ? ' (' + pctOf(mine, total) + ')' : '') : 'none') : null);
  // Format problems and balance problems get different messages (stakesafe): a pasted "1,000,000" is a valid amount.
  const amountFrom = text => { try { return parseAmountInput(String(text || '').trim() || '0', t.decimals); } catch (e) { throw new TypeError(e.message || AMOUNT_HELP); } };
  const rows = [];
  if (standalone && !me) rows.push(h('button', {type: 'button', class: 'qtx-mini', 'data-qa-connect': ''}, 'Connect wallet'));
  if (me) {
    const amount = h('input', { type: 'text', inputMode: 'decimal', placeholder: '0.0', autocomplete: 'off', ariaLabel: 'Amount to stake', class: 'qtx-mini-input' });
    const unstakeAmount=h('input',{type:'text',inputMode:'decimal',placeholder:'0.0',autocomplete:'off',ariaLabel:'Amount to unstake',class:'qtx-mini-input'});
    const exact=n=>formatUnits(n,t.decimals,t.decimals).replace(/,/g,'');
    const fill=(input,value)=>{input.value=exact(value);input.focus();};
    const preset=(label,input,value,disabled)=>{const b=h('button',{type:'button',class:'qtx-mini',disabled},label);b.addEventListener('click',()=>fill(input,value));return b;};
    const stakePresets=h('div',{class:'qtx-actions qtz-presets',role:'group','aria-label':'Stake amount shortcuts'},preset('25%',amount,(bal??0n)/4n,bal===null||bal===0n),preset('50%',amount,(bal??0n)/2n,bal===null||bal===0n),preset('Max',amount,bal??0n,bal===null||bal===0n));
    const unstakeMax=preset('Max',unstakeAmount,mine??0n,mine===null||mine===0n);unstakeMax.setAttribute('aria-label','Max amount to unstake');
    const hold=h('button',{type:'button',class:'qtx-mini qtz-hold',disabled:bal===null||bal===0n},bal===null?'Reading your '+t.symbol+' balance… (Refreshing)':'You hold '+fmtT(bal)+' · Use max');if(bal!==null)hold.addEventListener('click',()=>fill(amount,bal));
    const stakeBtn = h('button', { type: 'button', class: 'qtx-mini', disabled: bal === 0n }, 'Stake');
    stakeBtn.addEventListener('click', () => act(stakeBtn, status, async s => {
      const amt = amountFrom(amount.value); if (amt === 0n) throw new TypeError('Enter an amount to stake');
      await confirmVault();
      const have = bal ?? await stakingReads().erc20(chainId, token, me).then(x => x.balance).catch(() => null);
      if (have !== null && amt > have) throw new TypeError('Enter an amount you hold (you hold ' + fmtT(have) + ')');
      assertAction();
      await ensureAllowance(chainId, token, vault, amt, s, assertAction);
      assertAction();
      s('Confirm the stake in your wallet…');
      await send(chainId, { to: vault, data: calldata(SEL.stake, ['uint256'], [amt]) }, s, assertAction);
      s('Staked.');
    }));
    const unstakeBtn = h('button', { type: 'button', class: 'qtx-mini', disabled: mine === 0n }, 'Unstake');
    unstakeBtn.addEventListener('click', () => act(unstakeBtn, status, async s => {
      await confirmVault();
      const staked = mine ?? await stakingReads().ethCall(chainId, vault, calldata(SEL.staked, ['address'], [me])).then(BigInt).catch(() => null);
      assertAction();
      const amt = unstakeAmount.value.trim() ? amountFrom(unstakeAmount.value) : staked;
      if (amt === null) throw new TypeError('Enter the amount to unstake');
      if (amt === 0n || (staked !== null && amt > staked)) throw new TypeError('Enter up to your stake' + (staked !== null ? ' (' + fmtT(staked) + ')' : ''));
      s('Confirm in your wallet…');
      await send(chainId, { to: vault, data: calldata(SEL.unstake, ['uint256'], [amt]) }, s, assertAction);
      s('Unstaked.');
    }));
    const canClaim = earned === null || earned[0] > 0n || earned[1] > 0n;
    const claimBtn = h('button', { type: 'button', class: 'qtx-mini qtz-claim', disabled: !canClaim, 'aria-describedby': 'qtz-claim-note' }, 'Claim rewards');
    claimBtn.addEventListener('click', () => act(claimBtn, status, async s => { await confirmVault(); s('Confirm the claim in your wallet…'); await send(chainId, { to: vault, data: SEL.claim }, s, assertAction); s('Claimed.'); }));
    const refreshBtn = h('button', { type: 'button', class: 'qtx-mini' }, 'Refresh rewards');
    refreshBtn.addEventListener('click', async () => { refreshBtn.disabled = true; refreshBtn.textContent = 'Refreshing…'; await refresh(); });
    // Nonzero rewards must stay visibly nonzero even below the usual display precision.
    const reward = (n, meta, digits) => n > 0n && n < 10n ** BigInt(Math.max(0, meta.decimals - digits))
      ? '<' + (10 ** -Math.min(digits, meta.decimals)).toFixed(Math.min(digits, meta.decimals)) + ' ' + meta.symbol
      : formatUnits(n, meta.decimals, digits) + ' ' + meta.symbol;
    const claimNote = earned === null ? 'Refreshing your rewards. Claim checks the staking contract before opening your wallet.' : canClaim ? 'These rewards are ready to claim on ' + (standalone ? 'Robinhood Chain.' : 'this pool’s chain.')
      : mine === 0n ? 'No rewards to claim for this wallet. Stake ' + t.symbol + ' to start earning; holding it in your wallet alone does not earn staking rewards.'
      : 'Nothing to claim yet. Rewards accrue while you stake. Refresh to check the latest amount.';
    rows.push(h('section', {class: 'qtz-rewards', 'aria-labelledby': 'qtz-rewards-heading'},
      h('h3', {id: 'qtz-rewards-heading'}, 'Claimable rewards'),
      h('p', {class: 'qtz-wallet', title: me}, 'For wallet ' + me.slice(0, 6) + '…' + me.slice(-4)),
      h('p', {class: 'qtz-reward-amount'}, earned === null ? REFRESHING() : reward(earned[1], q, 4) + ' + ' + reward(earned[0], t, 2)),
      h('p', {id: 'qtz-claim-note', class: 'qtb-note'}, claimNote),
      h('div', {class: 'qtx-actions'}, claimBtn, refreshBtn)),
      hold,
      h('div',{class:'qtz-amount-group'},h('h3',{},'Stake'),h('div',{class:'qtx-actions'},amount,stakeBtn),stakePresets),
      h('div',{class:'qtz-amount-group'},h('h3',{},'Unstake'),h('div',{class:'qtx-actions'},unstakeAmount,unstakeMax,unstakeBtn)));
  }
  card.replaceChildren(...[...head, stats, waiting, ...rows, status].filter(Boolean));
  card.hidden = false;
  // In-place retry for whatever could not be read: 4 s, 12 s, 30 s, then it waits for the next trade or wallet change.
  if (missing) {
    if (snapshot.retries === undefined) snapshot.retries = 0;
    if (snapshot.retries < 3) { const wait = [4000, 12000, 30000][snapshot.retries++]; setTimeout(() => { if (state === snapshot) refresh(); }, wait); }
    if (missing >= 7 && !snapshot.reported) { snapshot.reported = true; reportMiss(chainId, token, 'stats_unreadable'); }
  } else snapshot.retries = 0;
}

async function show(pool, tries = 0) {
  const mine = ++seq;
  lastPool = pool;
  const c = pool?.constructor, blocks = c?.blocks;
  if (!card) return;
  if (standalone) {
    state = null;
    card.hidden = false;
    card.setAttribute('aria-busy', 'true');
    card.replaceChildren(...setupPending());
  }
  if (!blocks || BigInt(blocks) === 0n) { unavailable(pool); return; }
  try {
    const {ethCall,erc20}=stakingReads();
    if (standalone && (String(pool.chainId) !== card.dataset.stakingChain || pool.controller?.toLowerCase() !== card.dataset.stakingToken)) throw Error('Unexpected staking market');
    const w = words(await ethCall(pool.chainId, blocks, SEL.config));
    const token = toAddress(w[BLOCK_FIELDS.findIndex(([k]) => k === 'token')]), quote = toAddress(w[BLOCK_FIELDS.findIndex(([k]) => k === 'quote')]);
    if (standalone && token !== card.dataset.stakingToken) throw Error('Unexpected staking token');
    const payees = w.slice(BLOCK_FIELDS.length, BLOCK_FIELDS.length + 8).map(toAddress), shares = w.slice(BLOCK_FIELDS.length + 8, BLOCK_FIELDS.length + 16);
    let vault = stakeVaultAddress(token, quote), at = payees.indexOf(vault), mod = null;
    // Simple launches (one-transaction factory) create their vault with a plain CREATE: find it among the payees by asking
    // each one for its token() and quote() (QStakeVault exposes both; same stake/unstake/claim ABI as the CREATE2 vault).
    if (at < 0) {
      for (let i = 1; i < payees.length && at < 0; i++) {
        const p = payees[i]; if (!p || BigInt(p) === 0n || !BigInt(shares[i] || 0)) continue;
        try { const [vt, vq] = await Promise.all([ethCall(pool.chainId, p, '0xfc0c546a'), ethCall(pool.chainId, p, '0x999b93af')]);
          if (toAddress(vt) === token && toAddress(vq) === quote) { vault = p; at = i; } } catch {}
      }
    }
    if (at < 0) { await loadModules(); const f = modulesAmong(payees, token, quote).find(x => x.module.panel === 'stake'); if (f) ({ address: vault, index: at, module: mod } = f); }
    if (at < 0) { if (mine === seq) unavailable(pool); return; }
    const [t, q, supply] = await Promise.all([erc20(pool.chainId, token), erc20(pool.chainId, quote), ethCall(pool.chainId, token, '0x18160ddd').then(BigInt)]);
    if (mine !== seq) return;
    state = { chainId: pool.chainId, token, quote, vault, blocks, shareBps: shares[at], t, q, supply, mod, setupVerified: true };
    saveSetup(pool, state);
    await render();
    if (standalone && mine === seq) card.setAttribute('aria-busy', 'false');
  } catch {
    // A public RPC read that fails (rate limits on a busy colo) hid the card for good, and links to the Staking tab
    // (/stake, the home page) landed nowhere. Two more tries, 1.5 s and 3 s apart, before hiding (2026-11-12).
    if (mine !== seq) return;
    if (tries < 2) { setTimeout(() => { if (mine === seq) show(pool, tries + 1); }, 1500 * (tries + 1)); return; }
    // stakesafe: with the last good setup for this market, the panel still draws (stats "Refreshing", actions live).
    const kept = loadSetup(pool);
    if (kept && blocks && kept.blocks?.toLowerCase?.() === String(blocks).toLowerCase()) { state = {...kept, setupVerified: false}; try { await render(); if (standalone) card.setAttribute('aria-busy', 'false'); return; } catch {} }
    reportMiss(pool.chainId, pool.controller, 'setup_unreadable');
    unavailable(pool);
  }
}

document.addEventListener('qhooks:pool', e => show(e.detail));
// Trades change what the launch holds for stakers (and the trader's balance): re-read after each one.
document.addEventListener('qhooks:traded', refresh);
if (window.__qhooksPool) show(window.__qhooksPool);
onWalletChange(refresh);
