// Hidden one-off page (2026-11-10, timed staking: deploy QStakeLock, then the Safe seeds the bonus pot with 1M QHOOKS + sync in one
// MultiSend; one owner approves the hash, the other executes). Based on the QHOOKS floor setup page. (was:, Randall's go via the main thread): set up the QHOOKS rising floor and its flywheel feeder.
// Step 1 (any wallet): make the QHOOKS floor through the live QFloorMaker. Step 2 (any wallet): deploy the feeder, with or
// without the one-time 0.07 WETH seed. Step 3 (the QHooks Safe, both owners): WETH.approve(feeder, 5 WETH), one owner
// calls approveHash, the other sends execTransaction with both signatures in approved-hash form. The hash is always the
// Safe's own getTransactionHash at its live nonce. Every send is simulated first; nothing is sent if code differs.
import {getWalletHub} from '/wallet-hub-fresh.mjs';
import {chainById} from '/chains.mjs';

const NAMES = {'0x88db60586866294409e47bbbb0b436104f09c1b5': 'Qhooks 1', '0x9b13398df547c18e68d1cfe086ff1cb5f1a84127': 'Qhooks2'};
const root = document.getElementById('qsl-root'), hub = getWalletHub(window);
const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (v === false || v == null) continue; if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v); } n.append(...kids.flat().filter(x => x != null && x !== false)); return n; };
const pad = a => a.toLowerCase().slice(2).padStart(64, '0');
const fmt = (v, d = 18) => { const s = BigInt(v), b = 10n ** BigInt(d), w = s / b, f = s % b; return w.toString() + (f ? '.' + f.toString().padStart(d, '0').slice(0, 4).replace(/0+$/, '') : '').replace(/\.$/, ''); };
let art, busy = false, registered = false, status = {text: '', tone: ''};
async function rpc(method, params) {
  const r = await fetch(chainById(art.chainId).rpc, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params})});
  const j = await r.json(); if (j.error) throw Error(j.error.message || 'Network read failed'); return j.result;
}
const call = (to, data, from) => rpc('eth_call', [{to, data, ...(from ? {from} : {})}, 'latest']);
const sha256 = async hex => { const b = new Uint8Array(hex.slice(2).match(/../g).map(x => parseInt(x, 16))); return [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map(x => x.toString(16).padStart(2, '0')).join(''); };
/// getTransactionHash at nonce n: the nonce is the 10th head word of the template.
const hashCall = (tpl, n) => { const o = 2 + 8 + 9 * 64; return tpl.slice(0, o) + n.toString(16).padStart(64, '0') + tpl.slice(o + 64); };

async function read() {
  const c = await rpc('eth_getCode', [art.lock.address, 'latest']);
  const live = c === '0x' ? 'none' : (await sha256(c)) === art.lock.runtimeSha256 ? 'ok' : 'other';
  const nonce = BigInt(await call(art.safe, '0xaffed0e0'));
  let pot = 0n, hash = null, approved = [false, false];
  if (live === 'ok') {
    pot = BigInt(await call(art.lock.address, '0x245a6c70'));
    hash = await call(art.safe, hashCall(art.seedTx.getHash, nonce));
    approved = await Promise.all(art.owners.map(o => call(art.safe, '0x7d832974' + pad(o) + hash.slice(2)).then(v => BigInt(v) !== 0n)));
  }
  return {live, nonce, pot, hash, approved, done: live === 'ok' && pot >= BigInt(art.seed)};
}
const say = (text, tone = '') => { status = {text, tone}; render(); };
async function send(to, data, label) {
  if (busy) return; let conn = hub.snapshot().current; if (!conn) { hub.open(); return; }
  busy = true; say('');
  try {
    if (conn.chainId !== art.chainId) { say('Switching your wallet to Robinhood Chain…'); conn = await hub.switchChain(art.chainId); if (conn?.chainId !== art.chainId) throw Error('Switch your wallet to Robinhood Chain, then try again.'); }
    const from = conn.owner, tx = {from, to, data, value: '0x0'};
    try { await call(to, data, from); } catch (e) { throw Error('This would fail right now (' + (e.message || 'reverted') + '). Nothing was sent.'); }
    try { const est = BigInt(await rpc('eth_estimateGas', [{from, to, data, value: '0x0'}])); tx.gas = '0x' + (est * 13n / 10n).toString(16); } catch { throw Error('This would fail right now. Nothing was sent.'); }
    try { const b = await rpc('eth_getBlockByNumber', ['latest', false]), tip = BigInt(await conn.entry.provider.request({method: 'eth_maxPriorityFeePerGas'}).catch(() => '0x0')); if (b?.baseFeePerGas) { tx.maxPriorityFeePerGas = '0x' + tip.toString(16); tx.maxFeePerGas = '0x' + (BigInt(b.baseFeePerGas) * 2n + tip).toString(16); } } catch {}
    if (hub.snapshot().current?.owner !== from) throw Error('Your wallet changed. Try again.');
    say('Confirm in your wallet…');
    const hash = await conn.entry.provider.request({method: 'eth_sendTransaction', params: [tx]});
    say('Sent. Waiting for the network…');
    let r = null; for (let i = 0; i < 180 && !r; i++) { r = await rpc('eth_getTransactionReceipt', [hash]).catch(() => null); if (!r) await new Promise(res => setTimeout(res, 2000)); }
    if (!r) throw Error('Still pending. Check your wallet activity, then reload this page.');
    if (r.status !== '0x1') throw Error('The network refused it. Only gas was spent.');
    say(label, 'ok');
  } catch (e) { say(/reject|denied|cancel/i.test(e?.message || '') ? 'Cancelled in your wallet. Nothing was sent.' : (e?.message || 'That did not go through.'), 'bad'); }
  finally { busy = false; render(); }
}
const btn = (label, onclick, disabled = false) => el('button', {type: 'button', class: 'qtx-mini qas-go', disabled: disabled || busy, onclick}, label);
async function render() {
  art ||= await fetch('/full-launch/stake-lock-setup-v1.json', {cache: 'no-store'}).then(r => r.json());
  let s = null; try { s = await read(); } catch {}
  const conn = hub.snapshot().current, me = conn && art.owners.find(o => o === String(conn.owner).toLowerCase());
  const kids = [];
  if (!s) { root.replaceChildren(el('p', {}, 'Refreshing…')); return; }
  kids.push(el('dl', {},
    el('dt', {}, '1 · Timed lock contract'), el('dd', {}, art.lock.address + ' · ' + (s.live === 'ok' ? 'deployed' : s.live === 'other' ? 'different code at the address: stop' : 'not yet')),
    el('dt', {}, '2 · Bonus pot'), el('dd', {}, s.live === 'ok' ? fmt(s.pot).split('.')[0] + ' of ' + fmt(art.seed).split('.')[0] + ' QHOOKS' : '–'),
    el('dt', {}, 'Safe'), el('dd', {}, art.safe + ' · nonce ' + s.nonce)));
  if (s.live === 'none') kids.push(btn('Step 1: Deploy the timed lock contract', () => send(art.lock.to, art.lock.data, 'Deployed.')));
  else if (s.live === 'ok' && !s.done) {
    const i = me ? art.owners.indexOf(me) : -1, j = 1 - i;
    kids.push(el('p', {}, 'One Safe transaction sends ' + fmt(art.seed).split('.')[0] + ' QHOOKS to the bonus pot and starts its 60-day stream.'),
      el('p', {}, art.owners.map((o, k) => NAMES[o] + ': ' + (s.approved[k] ? 'approved' : 'not yet')).join(' · ')));
    if (!me) kids.push(btn(conn ? 'Switch to a Safe owner wallet' : 'Connect a Safe owner wallet', () => hub.open()));
    else if (s.approved[j]) kids.push(btn('Step 2: Seed the bonus pot (completes it)', () => send(art.safe, art.seedTx.exec, 'Done. The bonus pot is streaming.')));
    else if (s.approved[i]) kids.push(el('p', {}, 'Approved by ' + NAMES[me] + '. Open this page with ' + NAMES[art.owners[j]] + ' to finish.'));
    else kids.push(btn('Step 2: Approve as ' + NAMES[me], () => send(art.safe, '0xd4d9bdcd' + s.hash.slice(2), 'Approved. Now open this page with ' + NAMES[art.owners[j]] + '.')));
  }
  if (s.done) kids.push(el('p', {}, 'Set up. The timed lock is live in the QHOOKS staking tab. The Safe can add to the pot any time by sending QHOOKS to the contract.'));
  kids.push(el('p', {class: 'qas-status', role: 'status', 'aria-live': 'polite', 'data-tone': status.tone || false}, status.text));
  root.replaceChildren(...kids);
}
render().catch(e => { root.textContent = e.message; });
hub.subscribe(() => { if (art) render(); });
