// /relaunch: relaunch an existing token on QHooks with a swap-and-burn migration, and swap old for new.
// The contract (QRelaunch) only lets the old token's own team relaunch: its owner(), the wallet that deployed it, the
// creator/payout of its QHooks launch, or a wallet one of those signed for. This page finds which proof the connected
// wallet has, says plainly why a wallet isn't eligible, previews the ratio, and sends one transaction. With ?migrate=<old>
// (or once a token is relaunched) it shows the swap card instead. Every send is simulated first.
import {getWalletHub} from '/wallet-hub-fresh.mjs';
import {chainById} from '/chains.mjs';
import {SEL, RELAUNCHED_TOPIC, encodeTuple, relaunchCalldata} from '/qx-relaunch-abi.mjs';

const root = document.getElementById('qrl-root'), hub = getWalletHub(window), qs = new URLSearchParams(location.search);
const ZERO = '0x0000000000000000000000000000000000000000', DEAD = '0x000000000000000000000000000000000000dead';
const SUPPLY = 10n ** 27n, MAX_BPS = 3000n;
const STYLES = [[6, 'Flywheel'], [1, 'Fair'], [3, 'Community'], [5, 'Burn'], [4, 'Hours'], [0, 'No launch blocks']];
const ZKEY = [ZERO, ZERO, '0', '0', ZERO];
let cfg = null;
const S = {chainId: qs.get('chain') || null, old: (qs.get('migrate') || qs.get('token') || '').toLowerCase(), deployTx: '', authCode: '',
  facts: null, proofs: null, auth: null, mig: null, busy: false, msg: '', tone: '', form: {name: '', symbol: '', about: '', style: 6, window: 30}};

const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (v === false || v == null) continue; if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v); } n.append(...kids.filter(k => k != null)); return n; };
const pad = a => a.slice(2).toLowerCase().padStart(64, '0');
const W = n => BigInt.asUintN(256, BigInt(n)).toString(16).padStart(64, '0');
const isAddr = a => /^0x[0-9a-fA-F]{40}$/.test(a || '');
const short = a => a ? a.slice(0, 6) + '…' + a.slice(-4) : '';
const word = (hex, i = 0) => BigInt('0x' + (hex || '0x').slice(2 + 64 * i, 66 + 64 * i).padEnd(64, '0'));
const wAddr = (hex, i = 0) => '0x' + (hex || '0x').slice(2 + 64 * i + 24, 66 + 64 * i);
const units = (v, d) => { const s = BigInt(v), b = 10n ** BigInt(d), w = s / b, f = s % b; const fs = f ? '.' + f.toString().padStart(d, '0').slice(0, 4).replace(/0+$/, '') : ''; return w.toLocaleString('en-US') + (fs === '.' ? '' : fs); };
const toUnits = (txt, d) => { const m = String(txt).trim().match(/^(\d+)(?:\.(\d*))?$/); if (!m) return null; return BigInt(m[1]) * 10n ** BigInt(d) + BigInt((m[2] || '').slice(0, d).padEnd(d, '0') || '0'); };
const decodeString = hex => { try { if (!hex || hex === '0x') return ''; if (hex.length === 66) return new TextDecoder().decode(Uint8Array.from(hex.slice(2).match(/../g).map(x => parseInt(x, 16)).filter(x => x))); const len = Number(word(hex, 1)); const h = hex.slice(130, 130 + len * 2); return new TextDecoder().decode(Uint8Array.from(h.match(/../g) || [], x => parseInt(x, 16))); } catch { return ''; } };

async function rpc(method, params) {
  const r = await fetch(chainById(S.chainId).rpc, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params})});
  const j = await r.json(); if (j.error) { const e = Error(j.error.message || 'Network read failed'); e.data = j.error.data; throw e; } return j.result;
}
const call = (to, data, from, value) => rpc('eth_call', [{to, data, ...(from ? {from} : {}), ...(value ? {value} : {})}, 'latest']);
const tryCall = async (to, data) => { try { return await call(to, data); } catch { return null; } };
const C = () => cfg.chains[S.chainId];

function say(msg, tone = '') { S.msg = msg; S.tone = tone; render(); }

// ---------- reads ----------
async function loadFacts() {
  S.facts = null; S.proofs = null; S.mig = null;
  if (!isAddr(S.old) || !C()) return;
  const t = S.old, c = C();
  const code = await rpc('eth_getCode', [t, 'latest']);
  if (code === '0x') { S.facts = {error: 'No contract at this address on ' + chainById(S.chainId).name + '.'}; return; }
  const [nm, sy, dc, ts, dead, zero, pm, mig, ow, gow] = await Promise.all([tryCall(t, SEL.name), tryCall(t, SEL.symbol), tryCall(t, SEL.decimals), tryCall(t, SEL.totalSupply),
    tryCall(t, SEL.balanceOf + pad(DEAD)), tryCall(t, SEL.balanceOf + pad(ZERO)), tryCall(t, SEL.balanceOf + pad(c.poolManager)),
    call(c.relaunch, SEL.migratorOf + pad(t)), tryCall(t, SEL.owner), tryCall(t, SEL.getOwner)]);
  if (!ts) { S.facts = {error: 'This address does not look like a token (no totalSupply).'}; return; }
  let launch = null;
  try { const r = await fetch('/api/v1/launches/' + S.chainId + '/' + t); if (r.ok) launch = (await r.json()).launch || null; } catch {}
  const known = launch && c.knownFactories.includes(String(launch.factory).toLowerCase()) ? launch : null;
  const owner = ow && ow.length === 66 && word(ow) >> 160n === 0n ? wAddr(ow) : gow && gow.length === 66 && word(gow) >> 160n === 0n ? wAddr(gow) : null;
  S.facts = {name: decodeString(nm), symbol: decodeString(sy), decimals: dc ? Number(word(dc)) : 18, supply: word(ts), dead: word(dead) + word(zero), pool: word(pm),
    owner: owner && owner !== ZERO ? owner : null, launch: known, migrator: wAddr(mig) !== ZERO ? wAddr(mig) : null};
  if (S.facts.migrator) await loadMigration();
  else { S.form.name ||= S.facts.name; S.form.symbol ||= S.facts.symbol; }
}

async function loadMigration() {
  const m = S.facts.migrator;
  const [nt, end, cap, migrated, alloc, fin] = await Promise.all([call(m, SEL.newToken), call(m, SEL.end), call(m, SEL.cap), call(m, SEL.migrated), call(m, SEL.allocation), call(m, SEL.finished)]);
  const newToken = wAddr(nt), one = 10n ** BigInt(S.facts.decimals);
  const [nsym, q] = await Promise.all([tryCall(newToken, SEL.symbol), call(m, SEL.quote + W(one))]);
  S.mig = {address: m, newToken, newSymbol: decodeString(nsym) || 'NEW', end: Number(word(end)), cap: word(cap), migrated: word(migrated), allocation: word(alloc), finished: word(fin) === 1n, perOne: word(q)};
  await loadHolder();
}
async function loadHolder() {
  const w = hub.snapshot().current?.owner;
  if (!w || !S.mig) return;
  const [b, a] = await Promise.all([call(S.old, SEL.balanceOf + pad(w)), call(S.old, SEL.allowance + pad(w) + pad(S.mig.address))]);
  S.mig.balance = word(b); S.mig.allowance = word(a);
}

/// Which proofs the given wallet (or the authorizing signer) has; with plain-language reasons for the ones it lacks.
async function checkProofs() {
  S.proofs = null;
  const f = S.facts, conn = hub.snapshot().current;
  if (!f || f.error || f.migrator || !conn) return;
  const who = S.auth ? S.auth.signer : conn.owner, c = C();
  const team = async (kind, nonce, key) => word(await call(c.relaunch, SEL.isTeam + encodeTuple(['address', 'address', ['uint8', 'uint256', ['address', 'address', 'uint24', 'int24', 'address']]], [S.old, who, [kind, nonce, key]]))) === 1n;
  const out = {who, ok: null, reasons: []};
  // An authorization code carries the signer's own proof (e.g. a deployer nonce): check that first.
  if (S.auth?.proof) { const p = S.auth.proof; if (await team(p.kind, p.nonce, p.key)) { out.ok = p; S.proofs = out; return; } }
  // 1) owner()
  if (f.owner && await team(1, 0, ZKEY)) out.ok = {kind: 1, nonce: '0', key: ZKEY, label: 'its owner'};
  else out.reasons.push(f.owner ? 'The token\'s owner is ' + short(f.owner) + ', not ' + short(who) + '.' : 'The token has no owner (renounced or never set).');
  // 3) QHooks launch record
  if (!out.ok) {
    if (f.launch) {
      const k = f.launch.key, key = [k.currency0, k.currency1, String(k.fee), String(k.tickSpacing), k.hooks];
      if (await team(3, 0, key)) out.ok = {kind: 3, nonce: '0', key, label: 'its QHooks launch creator'};
      else out.reasons.push('Its QHooks launch is recorded for ' + short(f.launch.creator) + ', not ' + short(who) + '.');
    } else out.reasons.push('It is not a QHooks launch.');
  }
  // 2) deployer, from the transaction that created it
  if (!out.ok) {
    if (/^0x[0-9a-fA-F]{64}$/.test(S.deployTx)) {
      const [tx, rc] = await Promise.all([rpc('eth_getTransactionByHash', [S.deployTx]), rpc('eth_getTransactionReceipt', [S.deployTx])]);
      if (!tx || !rc) out.reasons.push('That deployment transaction was not found on this chain.');
      else if (String(rc.contractAddress || '').toLowerCase() !== S.old) out.reasons.push('That transaction did not create this token directly (a factory made it). Use the owner or launch record instead.');
      else if (String(tx.from).toLowerCase() !== who.toLowerCase()) out.reasons.push('It was deployed by ' + short(tx.from) + ', not ' + short(who) + '.');
      else if (await team(2, String(BigInt(tx.nonce)), ZKEY)) out.ok = {kind: 2, nonce: String(BigInt(tx.nonce)), key: ZKEY, label: 'its deployer'};
      else out.reasons.push('The deployer proof did not check out on chain.');
    } else out.reasons.push('To prove you deployed it, paste the transaction that created the token below.');
  }
  S.proofs = out;
}

function preview() {
  const f = S.facts; if (!f || f.error || f.migrator) return null;
  const locked = S.proofs?.ok?.kind === 3;
  const cap = f.supply - f.dead - (locked ? f.pool : 0n);
  if (cap <= 0n) return {error: 'No circulating supply to migrate.'};
  const d = f.decimals, capNew = d <= 18 ? cap * 10n ** BigInt(18 - d) : cap / 10n ** BigInt(d - 18);
  let bps = (capNew * 10000n + SUPPLY - 1n) / SUPPLY; if (bps === 0n) bps = 1n; if (bps > MAX_BPS) bps = MAX_BPS;
  const alloc = SUPPLY * bps / 10000n, oneToOne = capNew <= alloc;
  const per = oneToOne ? 10n ** 18n : 10n ** 18n * alloc / capNew;
  return {cap, capNew, bps, alloc, oneToOne, per, locked};
}

// ---------- actions ----------
async function send(to, data, value = 0n) {
  let conn = hub.snapshot().current; if (!conn) { hub.open(); throw Error('Connect a wallet first.'); }
  if (conn.chainId !== S.chainId) { say('Switching your wallet to ' + chainById(S.chainId).name + '…'); conn = await hub.switchChain(S.chainId); if (conn?.chainId !== S.chainId) throw Error('Switch your wallet to ' + chainById(S.chainId).name + ', then try again.'); }
  const from = conn.owner, provider = conn.entry.provider, v = '0x' + value.toString(16);
  try { await call(to, data, from, v); } catch (e) { throw Error(reason(e) + ' Nothing was sent.'); }
  const tx = {from, to, data, value: v};
  try { const est = BigInt(await rpc('eth_estimateGas', [{from, to, data, value: v}])); tx.gas = '0x' + (est * 13n / 10n).toString(16); } catch { throw Error('This would fail right now. Nothing was sent.'); }
  try { const b = await rpc('eth_getBlockByNumber', ['latest', false]), tip = BigInt(await provider.request({method: 'eth_maxPriorityFeePerGas'}).catch(() => '0x0')); if (b?.baseFeePerGas) { tx.maxPriorityFeePerGas = '0x' + tip.toString(16); tx.maxFeePerGas = '0x' + (BigInt(b.baseFeePerGas) * 2n + tip).toString(16); } } catch {}
  if (hub.snapshot().current?.owner !== from) throw Error('Your wallet changed. Try again.');
  say('Confirm in your wallet…');
  const hash = await provider.request({method: 'eth_sendTransaction', params: [tx]});
  say('Sent. Waiting for the network…');
  let r = null; for (let i = 0; i < 180 && !r; i++) { r = await rpc('eth_getTransactionReceipt', [hash]).catch(() => null); if (!r) await new Promise(res => setTimeout(res, 2000)); }
  if (!r) throw Error('Still pending. Check your wallet activity, then reload this page.');
  if (r.status !== '0x1') throw Error('The network refused it. Only gas was spent.');
  return r;
}
const ERRORS = {'0xea8e4eb5': 'This wallet is not the token\'s team.', '0x54f2db9b': 'This token was already relaunched.', '0x019af637': 'Some details are not allowed (window 7–90 days, a real token with circulating supply).',
  '0x5cd5d233': 'The authorization signature is not valid, or it expired.', '0x1cdde67b': 'The swap window is closed.', '0x749b5939': 'That amount can\'t be swapped (check your balance and the remaining room).', '0x52f0214c': 'The window has not ended yet.'};
function reason(e) { const d = String(e?.data || ''); for (const [k, v] of Object.entries(ERRORS)) if (d.startsWith(k)) return v; return 'This would fail right now.'; }
const guard = fn => async () => { if (S.busy) return; S.busy = true; say(''); try { await fn(); } catch (e) { say(/reject|denied|cancel/i.test(e?.message || '') ? 'Cancelled in your wallet. Nothing was sent.' : (e?.message || 'That did not go through.'), 'bad'); } finally { S.busy = false; render(); } };

const doRelaunch = guard(async () => {
  const p = S.proofs?.ok, f = S.form; if (!p) throw Error('This wallet is not eligible to relaunch this token.');
  if (!f.name.trim() || !f.symbol.trim()) throw Error('Give the new token a name and a ticker.');
  const fee = word(await call(cfg.launcher, SEL.chain), 3);
  const salt = '0x' + [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, '0')).join('');
  const meta = f.about.trim() ? JSON.stringify({description: f.about.trim().slice(0, 600), relaunchOf: S.old}) : JSON.stringify({relaunchOf: S.old});
  const auth = S.auth ? [S.auth.signer, String(S.auth.deadline), S.auth.signature] : [ZERO, '0', '0x'];
  const data = relaunchCalldata(SEL.relaunch, S.old, [p.kind, p.nonce, p.key], auth, [f.name.trim(), f.symbol.trim().toUpperCase(), meta, Number(f.style), 10000, salt, 15], Number(f.window));
  const r = await send(C().relaunch, data, fee);
  const log = r.logs.find(l => l.address.toLowerCase() === C().relaunch && l.topics[0] === RELAUNCHED_TOPIC);
  const nt = log ? '0x' + log.topics[2].slice(26) : null;
  await loadFacts(); await checkProofs();
  say(nt ? 'Relaunched. New token ' + nt + '. Holders can swap below; share this page.' : 'Relaunched.', 'ok');
});
const doMigrate = guard(async () => {
  const m = S.mig, amt = toUnits(S.amount || '', S.facts.decimals);
  if (!amt || amt <= 0n) throw Error('Enter how many old tokens to swap.');
  if (amt > m.balance) throw Error('That is more than this wallet holds.');
  if (amt > m.cap - m.migrated) throw Error('Only ' + units(m.cap - m.migrated, S.facts.decimals) + ' more can be swapped.');
  if (m.allowance < amt) { await send(S.old, SEL.approve + pad(m.address) + W(amt)); await loadHolder(); }
  await send(m.address, SEL.migrate + W(amt));
  await loadMigration(); say('Swapped. Your new tokens are in your wallet.', 'ok');
});
const doFinish = guard(async () => { await send(S.mig.address, SEL.finish); await loadMigration(); say('Finished: the unclaimed new tokens were burned.', 'ok'); });

// The team wallet signs that another wallet may relaunch (EIP-712). The code holds everything the other wallet needs.
const doSignFor = guard(async () => {
  const conn = hub.snapshot().current, to = (S.signFor || '').trim(), p = S.proofs?.ok;
  if (!conn) { hub.open(); return; }
  if (!p || S.auth) throw Error('Only a team wallet can authorize another wallet.');
  if (!isAddr(to)) throw Error('Enter the wallet that will relaunch.');
  const deadline = Math.floor(Date.now() / 1000) + 7 * 86400;
  const typed = {types: {EIP712Domain: [{name: 'name', type: 'string'}, {name: 'version', type: 'string'}, {name: 'chainId', type: 'uint256'}, {name: 'verifyingContract', type: 'address'}],
    Relaunch: [{name: 'oldToken', type: 'address'}, {name: 'newCreator', type: 'address'}, {name: 'deadline', type: 'uint256'}]},
    primaryType: 'Relaunch', domain: {name: 'QHooks Relaunch', version: '1', chainId: Number(S.chainId), verifyingContract: C().relaunch},
    message: {oldToken: S.old, newCreator: to, deadline: String(deadline)}};
  say('Sign in your wallet (no transaction, no cost)…');
  const sig = await conn.entry.provider.request({method: 'eth_signTypedData_v4', params: [conn.owner, JSON.stringify(typed)]});
  S.signedCode = btoa(JSON.stringify({v: 1, chain: S.chainId, old: S.old, signer: conn.owner, to, deadline, sig, proof: p}));
  say('Signed. Send this code to ' + short(to) + '; it works for 7 days.', 'ok');
});
function useCode() {
  try {
    const j = JSON.parse(atob((S.authCode || '').trim())), w = hub.snapshot().current?.owner;
    if (j.v !== 1 || j.chain !== S.chainId || j.old !== S.old) throw 0;
    if (!w || w.toLowerCase() !== j.to.toLowerCase()) { say('This code is for ' + short(j.to) + '. Connect that wallet.', 'bad'); return; }
    S.auth = {signer: j.signer, deadline: j.deadline, signature: j.sig, proof: j.proof};
    say('Authorization from ' + short(j.signer) + ' loaded.', 'ok');
  } catch { say('That code is not for this token on this chain.', 'bad'); }
}

// ---------- view ----------
function field(label, input) { return el('label', {class: 'qrl-field'}, el('span', {}, label), input); }
function input(key, attrs, obj = S.form) { const i = el('input', {...attrs, value: obj[key] ?? ''}); i.addEventListener('input', () => { obj[key] = i.value; }); return i; }

async function render() {
  cfg ||= await fetch('/full-launch/relaunch-v1.json', {cache: 'no-store'}).then(r => r.json());
  const conn = hub.snapshot().current;
  if (!S.chainId || !cfg.chains[S.chainId]) S.chainId = conn && cfg.chains[conn.chainId] ? conn.chainId : Object.keys(cfg.chains).includes('4663') ? '4663' : Object.keys(cfg.chains)[0];
  const kids = [];
  const chainSel = el('select', {onchange: async e => { S.chainId = e.target.value; await refresh(); }}, ...Object.keys(cfg.chains).map(id => el('option', {value: id, selected: id === S.chainId}, chainById(id)?.name || id)));
  const tokenIn = el('input', {placeholder: '0x… old token address', value: S.old, spellcheck: 'false', autocomplete: 'off'});
  tokenIn.addEventListener('change', async () => { S.old = tokenIn.value.trim().toLowerCase(); S.auth = null; await refresh(); });
  kids.push(el('div', {class: 'qrl-row'}, field('Chain', chainSel), field('Old token', tokenIn)));
  const live = C() && (await rpc('eth_getCode', [C().relaunch, 'latest']).catch(() => '0x')) !== '0x';
  if (!live) kids.push(el('p', {class: 'qrl-note'}, 'Relaunching is not set up on ' + (chainById(S.chainId)?.name || 'this chain') + ' yet.'));
  const f = S.facts;
  if (f?.error) kids.push(el('p', {class: 'qrl-note', 'data-tone': 'bad'}, f.error));
  else if (f && f.migrator && S.mig) kids.push(migrateCard());
  else if (f && live) kids.push(...relaunchCards(conn));
  kids.push(el('p', {class: 'qas-status', role: 'status', 'aria-live': 'polite', 'data-tone': S.tone || false}, S.msg));
  root.replaceChildren(...kids);
}

function relaunchCards(conn) {
  const f = S.facts, out = [];
  out.push(el('dl', {}, el('dt', {}, 'Token'), el('dd', {}, (f.name || '?') + ' (' + (f.symbol || '?') + ')'),
    el('dt', {}, 'Total supply'), el('dd', {}, units(f.supply, f.decimals)),
    el('dt', {}, 'Owner'), el('dd', {}, f.owner || 'none'),
    el('dt', {}, 'QHooks launch'), el('dd', {}, f.launch ? 'yes, creator ' + short(f.launch.creator) : 'no')));
  if (!conn) { out.push(el('button', {type: 'button', class: 'qtx-mini qas-go', onclick: () => hub.open()}, 'Connect the team wallet')); return out; }
  const pr = S.proofs;
  if (!pr) { out.push(el('p', {class: 'qrl-note'}, 'Checking this wallet…')); return out; }
  if (pr.ok) out.push(el('p', {class: 'qrl-ok'}, (S.auth ? 'Authorized by ' + short(S.auth.signer) + ', ' : 'This wallet is ') + pr.ok.label + '. You can relaunch this token.'));
  else {
    out.push(el('div', {class: 'qrl-why'}, el('p', {}, 'This wallet can\'t relaunch this token. Only the token\'s own team can (so nobody can copy someone else\'s token):'),
      el('ul', {}, ...pr.reasons.map(r => el('li', {}, r)))));
    const tx = input('deployTx', {placeholder: '0x… transaction that deployed the token', spellcheck: 'false'}, S);
    out.push(el('div', {class: 'qrl-row'}, field('Deployment transaction (optional)', tx), el('button', {type: 'button', class: 'qtx-mini', onclick: async () => { await checkProofs(); render(); }}, 'Check')));
    const code = input('authCode', {placeholder: 'Paste an authorization code from the team wallet'}, S);
    out.push(el('div', {class: 'qrl-row'}, field('Authorized by the team?', code), el('button', {type: 'button', class: 'qtx-mini', onclick: async () => { useCode(); await checkProofs(); render(); }}, 'Use code')));
    return out;
  }
  const pv = preview();
  if (pv?.error) { out.push(el('p', {class: 'qrl-note', 'data-tone': 'bad'}, pv.error)); return out; }
  out.push(el('dl', {class: 'qrl-preview'}, el('dt', {}, 'Circulating (can be swapped)'), el('dd', {}, units(pv.cap, f.decimals) + ' ' + (f.symbol || '')),
    el('dt', {}, 'Migration share of the new supply'), el('dd', {}, (Number(pv.bps) / 100) + '% (' + units(pv.alloc, 18) + ')'),
    el('dt', {}, 'Swap ratio'), el('dd', {}, pv.oneToOne ? '1 old = 1 new' : '1 old = ' + units(pv.per, 18) + ' new (every holder gets the same share of the new supply as of the old)'),
    el('dt', {}, 'Unclaimed after the window'), el('dd', {}, 'burned')));
  const style = el('select', {onchange: e => { S.form.style = e.target.value; }}, ...STYLES.map(([v, n]) => el('option', {value: v, selected: String(v) === String(S.form.style)}, n)));
  const win = el('select', {onchange: e => { S.form.window = e.target.value; }}, ...[7, 14, 30, 60, 90].map(d => el('option', {value: d, selected: String(d) === String(S.form.window)}, d + ' days')));
  out.push(el('div', {class: 'qrl-grid'}, field('New name', input('name', {maxlength: 64})), field('New ticker', input('symbol', {maxlength: 16})),
    field('Launch style', style), field('Swap window', win), field('Description (optional)', input('about', {maxlength: 600}))));
  out.push(el('button', {type: 'button', class: 'qtx-mini qas-go', disabled: S.busy, onclick: doRelaunch}, 'Relaunch ' + (f.symbol || 'token')));
  if (!S.auth) {
    const to = input('signFor', {placeholder: '0x… wallet that should relaunch instead'}, S);
    out.push(el('details', {}, el('summary', {}, 'Relaunch from a different wallet'), el('p', {}, 'Sign once here with this team wallet; the other wallet pastes the code on this page.'),
      el('div', {class: 'qrl-row'}, field('Other wallet', to), el('button', {type: 'button', class: 'qtx-mini', onclick: doSignFor}, 'Sign authorization')),
      S.signedCode ? el('textarea', {readonly: true, rows: 3}, S.signedCode) : null));
  }
  return out;
}

function migrateCard() {
  const m = S.mig, f = S.facts, now = Date.now() / 1000, open = !m.finished && now < m.end && m.migrated < m.cap;
  const kids = [el('h2', {}, (f.symbol || 'This token') + ' is migrating to ' + m.newSymbol),
    el('dl', {}, el('dt', {}, 'New token'), el('dd', {}, el('a', {href: '/terminal?chain=' + S.chainId + '&token=' + m.newToken}, m.newToken)),
      el('dt', {}, 'Ratio'), el('dd', {}, '1 ' + (f.symbol || 'old') + ' = ' + units(m.perOne, 18) + ' ' + m.newSymbol),
      el('dt', {}, 'Swapped so far'), el('dd', {}, units(m.migrated, f.decimals) + ' of ' + units(m.cap, f.decimals)),
      el('dt', {}, m.finished ? 'Status' : 'Window ends'), el('dd', {}, m.finished ? 'Finished; unclaimed tokens were burned' : new Date(m.end * 1000).toLocaleString()),
      ...(m.balance != null ? [el('dt', {}, 'You hold'), el('dd', {}, units(m.balance, f.decimals) + ' ' + (f.symbol || ''))] : []))];
  if (open) {
    if (!hub.snapshot().current) kids.push(el('button', {type: 'button', class: 'qtx-mini qas-go', onclick: () => hub.open()}, 'Connect wallet to swap'));
    else {
      S.amount ??= m.balance ? units(m.balance < m.cap - m.migrated ? m.balance : m.cap - m.migrated, f.decimals).replace(/,/g, '') : '';
      kids.push(el('div', {class: 'qrl-row'}, field('Old tokens to swap', input('amount', {inputmode: 'decimal'}, S)),
        el('button', {type: 'button', class: 'qtx-mini qas-go', disabled: S.busy, onclick: doMigrate}, 'Swap for ' + m.newSymbol)));
      kids.push(el('p', {class: 'qrl-note'}, 'Old tokens are retired to the dead address. If the old token charges a tax, you get new tokens for what arrives.'));
    }
  } else if (!m.finished) kids.push(el('button', {type: 'button', class: 'qtx-mini qas-go', disabled: S.busy, onclick: doFinish}, 'Finish: burn the unclaimed ' + m.newSymbol));
  return el('section', {class: 'qrl-migrate'}, ...kids);
}

async function refresh() { try { await loadFacts(); await checkProofs(); } catch (e) { S.facts = {error: e?.message || 'Network read failed.'}; } render(); }
render().then(refresh).catch(e => { root.textContent = e.message; });
hub.subscribe(async () => { if (!cfg) return; await loadHolder().catch(() => {}); await checkProofs().catch(() => {}); render(); });
