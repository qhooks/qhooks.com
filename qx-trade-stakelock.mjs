// Terminal staking tab, QHOOKS only: optional timed locks (QStakeLock) next to the unchanged flexible staking card.
// Locks stake in the same vault and earn the same staking rewards; on top they share a bonus pot by shares (1 week 1,
// 2 weeks 2, 30 days 4 per QHOOKS), paid when the lock ends. Early exit returns everything locked plus staking rewards and gives up
// only that lock's bonus. Flexible stakers can move staked QHOOKS into a lock (unstake, approve, lock: one EIP-5792 batch when the
// wallet supports it, else three prompts), and a move that stops after unstake offers the lock next. Shown once the lock contract is deployed with the expected code. Copy reviewed by the main thread.
import {calldata, ethCall, codeAt, words, parseUnits, formatUnits, send, sendCallsAtomic, ensureAllowance, connectedAddress, onWalletChange, rpc, h} from '/qx-chain.mjs';

const card = document.getElementById('qtzl');
const TERMS = [[1, '1 week', '1 bonus share'], [2, '2 weeks', '2 bonus shares'], [3, '30 days', '4 bonus shares']];
let cfg = null, live = false, seq = 0, flash = '';   // flash: the last action's message, kept across the re-render
const sha = async hex => [...new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(hex.slice(2).match(/../g), x => parseInt(x, 16))))].map(x => x.toString(16).padStart(2, '0')).join('');
const fmt = (v, max = 2) => formatUnits(v, 18, max);
// After a move stops between unstake and lock, the card remembers the amount and term for this wallet (per browser) so it can
// offer the lock from the wallet next. Storage can be missing; the in-memory copy then covers this visit.
const moved = new Map();
const MK = me => 'qtzl-move:' + me;
const getMove = me => { try { const v = JSON.parse(localStorage.getItem(MK(me)) || 'null'); if (v) return {amount: BigInt(v.amount), term: String(v.term)}; } catch {} return moved.get(me) || null; };
const setMove = (me, v) => { if (v) moved.set(me, v); else moved.delete(me); try { v ? localStorage.setItem(MK(me), JSON.stringify({amount: v.amount.toString(), term: v.term})) : localStorage.removeItem(MK(me)); } catch {} };
const when = t => new Date(Number(t) * 1000).toLocaleDateString(undefined, {month: 'short', day: 'numeric'});

async function act(btn, status, fn) {
  btn.disabled = true; status.textContent = '';
  try { await fn(t => { status.textContent = t; }); } catch (e) { status.textContent = /reject|denied|cancel/i.test(e?.message || '') ? 'Cancelled in your wallet. Nothing was sent.' : (e?.message || 'That did not go through.'); }
  finally { btn.disabled = false; flash = status.textContent; render().catch(() => {}); }
}

async function myLocks(me) {
  const c = cfg.chainId;
  // 2026-11-10: windows of 9,000,000 blocks (RPC limit 10M; this range grows ~345k blocks a day on Robinhood). A failed
  // window is retried with backoff instead of silently showing no locks.
  const head = BigInt(await rpc(c, 'eth_blockNumber', []));
  const topics = [cfg.lockedTopic, null, '0x' + me.slice(2).toLowerCase().padStart(64, '0')], wins = [];
  for (let lo = BigInt(cfg.fromBlock); lo <= head; lo += 9000000n) { const hi = lo + 8999999n < head ? lo + 8999999n : head; wins.push([lo, hi]); }
  const read = ([lo, hi]) => rpc(c, 'eth_getLogs', [{address: cfg.lock, fromBlock: '0x' + lo.toString(16), toBlock: '0x' + hi.toString(16), topics}]);
  // Up to 4 tries per window with backoff (1 s, 2.5 s, 5 s): the RPC rate-limits bursts of wide reads.
  const tries = async w => { for (const wait of [0, 1000, 2500, 5000]) { if (wait) await new Promise(r => setTimeout(r, wait)); try { return await read(w); } catch (e) { if (wait === 5000) throw e; } } };
  const logs = (await Promise.all(wins.map(tries))).flat();
  const out = [];
  for (const l of logs) {
    const id = BigInt(l.topics[1]);
    const w = words(await ethCall(c, cfg.lock, calldata(cfg.sel.locks, ['uint256'], [id])));
    if (w[5] === 0n) continue;   // withdrawn
    const p = words(await ethCall(c, cfg.lock, calldata(cfg.sel.pending, ['uint256'], [id])));
    // pending() only counts what the lock contract has already collected from the staking vault. The real claimable amount
    // is what claimBase(id) would pay right now, so simulate it from the owner (the same read a wallet preview does).
    let q = p[0], t = p[1];
    try { const r = words(await ethCall(c, cfg.lock, calldata(cfg.sel.claimBase, ['uint256'], [id]), me)); if (r.length >= 2) { q = r[0]; t = r[1]; } } catch {}
    out.push({id, term: Number(w[1]), end: w[3], amount: w[5], q, t, bonus: p[2]});
  }
  return out;
}

async function render() {
  const mine = ++seq, c = cfg.chainId, me = connectedAddress();
  const [potHeld, potFinish, perDay] = await Promise.all([ethCall(c, cfg.lock, cfg.sel.potHeld), ethCall(c, cfg.lock, cfg.sel.potFinish),
    Promise.all(TERMS.map(([t]) => ethCall(c, cfg.lock, calldata(cfg.sel.bonusPerDay, ['uint8', 'uint256'], [t, 10n ** 24n]))))]);
  const got = me ? await myLocks(me).catch(() => null) : [], locks = got || [];
  if (got === null && !flash) flash = 'Refreshing your locks…';
  const [stakedHex, walletHex] = me ? await Promise.all([ethCall(c, cfg.vault, calldata(cfg.sel.staked, ['address'], [me])), ethCall(c, cfg.token, calldata(cfg.sel.balanceOf, ['address'], [me]))]) : ['0x0', '0x0'];
  const staked = BigInt(stakedHex || '0x0'), wallet = BigInt(walletHex || '0x0');
  let resume = me ? getMove(me) : null;
  if (resume && wallet === 0n) { setMove(me, null); resume = null; }
  const now = BigInt((await rpc(c, 'eth_getBlockByNumber', ['latest', false]))?.timestamp || Math.floor(Date.now() / 1000));   // chain time decides
  if (mine !== seq) return;
  const status = h('p', {class: 'qtx-status', role: 'status'}, flash); flash = '';
  const amount = h('input', {type: 'text', inputmode: 'decimal', placeholder: 'QHOOKS amount', 'aria-label': 'QHOOKS to lock'});
  const term = h('select', {'aria-label': 'Lock term'}, ...TERMS.map(([v, name, m]) => h('option', {value: String(v)}, name + ' · ' + m)));
  term.value = '3';
  const lockBtn = h('button', {type: 'button', class: 'qtx-mini'}, 'Lock');
  lockBtn.addEventListener('click', () => act(lockBtn, status, async s => {
    const a = parseUnits(amount.value, 18); if (!a) throw Error('Enter an amount.');
    await ensureAllowance(c, cfg.token, cfg.lock, a, s);
    s('Confirm the lock in your wallet…');
    await send(c, {to: cfg.lock, data: calldata(cfg.sel.lock, ['uint256', 'uint8'], [a, BigInt(term.value)])}, s);
    if (me) setMove(me, null);
    s('Locked.');
  }));
  const termPicker = v => { const t = h('select', {'aria-label': 'Lock term'}, ...TERMS.map(([x, name, m]) => h('option', {value: String(x)}, name + ' · ' + m))); t.value = v; return t; };
  let moveBox = null;
  if (resume) {
    // Stopped after unstake: the QHOOKS are in the wallet; approve (if needed) + lock remain.
    const n = resume.amount < wallet ? resume.amount : wallet, t = termPicker(resume.term), st = h('p', {class: 'qtx-status', role: 'status'});
    const btn = h('button', {type: 'button', class: 'qtx-mini'}, 'Lock ' + fmt(n, 0) + ' QHOOKS from your wallet');
    btn.addEventListener('click', () => act(btn, st, async s => {
      await ensureAllowance(c, cfg.token, cfg.lock, n, s);
      s('Confirm the lock in your wallet…');
      await send(c, {to: cfg.lock, data: calldata(cfg.sel.lock, ['uint256', 'uint8'], [n, BigInt(t.value)])}, s);
      setMove(me, null); s('Locked.');
    }));
    moveBox = h('div', {class: 'qtx-move', style: 'display:grid;gap:8px;margin:14px 0'},
      h('p', {}, 'Your QHOOKS are out of staking and back in your wallet.'), h('div', {class: 'qtx-row'}, t, btn), st);
  } else if (staked > 0n) {
    const t = termPicker(term.value), st = h('p', {class: 'qtx-status', role: 'status'});
    const full = formatUnits(staked, 18, 18);
    const amt = h('input', {type: 'text', inputmode: 'decimal', value: full, 'aria-label': 'Staked QHOOKS to move'});
    const btn = h('button', {type: 'button', class: 'qtx-mini'}, 'Move my staked QHOOKS into a lock');
    btn.addEventListener('click', () => act(btn, st, async s => {
      const a = amt.value.trim() === full ? staked : parseUnits(amt.value.replace(/,/g, ''), 18);
      if (!a) throw Error('Enter an amount.');
      if (a > staked) throw Error('That is more than you have staked (' + fmt(staked, 0) + ' QHOOKS).');
      const tv = BigInt(t.value), allowance = BigInt(await ethCall(c, cfg.token, calldata(cfg.sel.allowance, ['address', 'address'], [me, cfg.lock])));
      const calls = [{to: cfg.vault, data: calldata(cfg.sel.unstake, ['uint256'], [a]), label: 'Unstake'}];
      if (allowance < a) calls.push({to: cfg.token, data: calldata(cfg.sel.approve, ['address', 'uint256'], [cfg.lock, a]), label: 'Approve'});
      calls.push({to: cfg.lock, data: calldata(cfg.sel.lock, ['uint256', 'uint8'], [a, tv]), label: 'Lock'});
      const batch = await sendCallsAtomic(c, calls, s);
      if (batch) { s('Moved into a lock.'); return; }
      for (let i = 0; i < calls.length; i++) {
        const step = 'Step ' + (i + 1) + ' of ' + calls.length + ' · ' + calls[i].label + ': ';
        try { await send(c, calls[i], x => s(step + x)); }
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
  const rows = locks.map(l => {
    const ended = now >= l.end, st = h('p', {class: 'qtx-status', role: 'status'});
    const claim = h('button', {type: 'button', class: 'qtx-mini'}, 'Claim staking rewards');
    claim.addEventListener('click', () => act(claim, st, async s => { await send(c, {to: cfg.lock, data: calldata(cfg.sel.claimBase, ['uint256'], [l.id])}, s); s('Claimed.'); }));
    const out = h('button', {type: 'button', class: 'qtx-mini'}, ended ? 'Withdraw with bonus' : 'Withdraw now (gives up the bonus)');
    out.addEventListener('click', () => act(out, st, async s => {
      if (!ended && !confirm('Leaving before ' + when(l.end) + ' returns everything you locked plus staking rewards, and gives up this lock\'s bonus. Continue?')) return;
      await send(c, {to: cfg.lock, data: calldata(cfg.sel.withdraw, ['uint256'], [l.id])}, s); s('Withdrawn.');
    }));
    const kids = [h('p', {}, fmt(l.amount, 0) + ' QHOOKS · ' + TERMS[l.term - 1][1] + ' · ' + (ended ? 'ended ' : 'ends ') + when(l.end)),
      h('p', {class: 'qtx-fine'}, 'Staking rewards: ' + fmt(l.q, 6) + ' WETH + ' + fmt(l.t, 0) + ' QHOOKS · Bonus so far: ' + fmt(l.bonus, 0) + ' QHOOKS' + (ended ? '' : ' (paid when the lock ends)')), claim, out];
    if (l.term < 3) {
      const up = h('button', {type: 'button', class: 'qtx-mini'}, 'Move to 30 days');
      up.addEventListener('click', () => act(up, st, async s => { await send(c, {to: cfg.lock, data: calldata(cfg.sel.upgrade, ['uint256', 'uint8'], [l.id, 3n])}, s); s('Moved to 30 days.'); }));
      kids.push(up);
    }
    kids.push(st);
    return h('div', {class: 'qtx-lock', style: 'display:grid;gap:8px;margin:14px 0;padding-top:12px;border-top:1px solid currentColor;border-top-color:color-mix(in srgb,currentColor 18%,transparent)'}, ...kids);
  });
  const potLeft = now < BigInt(potFinish);
  card.replaceChildren(
    h('h2', {id: 'qtzl-heading'}, 'Timed lock (optional)'),
    h('p', {}, 'Flexible staking above stays as it is. Lock QHOOKS for 1 week, 2 weeks or 30 days to earn the same staking rewards plus a share of a bonus pot. Longer locks get more of it: per QHOOKS, a 2-week lock gets twice the share of a 1-week lock, and a 30-day lock four times.'),
    h('p', {class: 'qtx-fine'}, 'Locks take QHOOKS from your wallet.'),
    h('p', {class: 'qtx-fine'}, 'When a lock ends it stops earning bonus. Withdraw it with the bonus, or move it into a new lock.'),
    h('p', {class: 'qtx-fine'}, 'The bonus is paid when your lock ends. You can leave early at any time: you get back everything you locked plus staking rewards, and only that lock\'s bonus goes back to the pot. Nobody else can move your locked QHOOKS.'),
    h('p', {class: 'qtx-fine'}, potLeft ? 'Bonus pot: ' + fmt(BigInt(potHeld), 0) + ' QHOOKS. Bonus right now for 1,000,000 QHOOKS: ' + TERMS.map(([, name], i) => name + ' ' + fmt(BigInt(perDay[i]), 0) + '/day').join(' · ') + '. It changes as others lock.' : 'The bonus pot is empty right now. Locks still earn the same staking rewards.'),
    moveBox, h('div', {class: 'qtx-row'}, amount, term, lockBtn), status, ...rows);
  card.hidden = false;
}

async function show(pool) {
  card.hidden = true;
  if (!card || !pool || String(pool.chainId) !== '4663') return;
  cfg ||= await fetch('/full-launch/stake-lock-v1.json', {cache: 'no-store'}).then(r => r.json()).catch(() => null);
  if (!cfg || String(pool.token || pool.controller || '').toLowerCase() !== cfg.token) return;
  if (!live) { const code = await codeAt(cfg.chainId, cfg.lock).catch(() => '0x'); live = code !== '0x' && (await sha(code)) === cfg.runtimeSha256; }
  if (live) await render().catch(() => { card.hidden = true; });
}
document.addEventListener('qhooks:pool', e => show(e.detail).catch(() => {}));
onWalletChange(() => { if (live && !card.hidden) render().catch(() => {}); });
