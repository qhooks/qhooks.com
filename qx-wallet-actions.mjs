import { guardedSend, tradeError } from './qx-chain-guard.mjs';
// Account panel actions (2026-11-08): "Send" any balance on a chain (its coin, WETH/WBNB, USDC/USDG, QHooks launch
// tokens) and "Unwrap WETH → ETH" (WETH.withdraw). Sent from the account panel's connected wallet on the row's chain
// (a row on another chain offers "Switch to …" first). The wallet always shows its own confirmation: these never run
// inside a one-click press.
const ADDR = /^0x[0-9a-fA-F]{40}$/;
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
/// "1.5" with 18 decimals → 1500000000000000000n; null when not a positive amount with at most `decimals` places.
export function parseAmount(text, decimals) {
  const t = String(text || '').trim().replace(/,/g, '');
  if (!/^\d*\.?\d*$/.test(t) || !/\d/.test(t)) return null;
  const [w, f = ''] = t.split('.'); if (f.length > decimals) return null;
  const v = BigInt(w || '0') * 10n ** BigInt(decimals) + BigInt((f + '0'.repeat(decimals)).slice(0, decimals) || '0');
  return v > 0n ? v : null;
}
export function formatRaw(raw, decimals) {
  const v = BigInt(raw), s = v.toString().padStart(decimals + 1, '0'), f = s.slice(-decimals).replace(/0+$/, '');
  return s.slice(0, -decimals) + (f ? '.' + f : '');
}
const pad = v => BigInt(v).toString(16).padStart(64, '0');
export const transferData = (to, amount) => '0xa9059cbb' + to.toLowerCase().slice(2).padStart(64, '0') + pad(amount);
export const withdrawData = amount => '0x2e1a7d4d' + pad(amount);
/// The assets on one balances row that can be sent: [{key, symbol, decimals, raw, token|null}].
export function sendable(row) {
  const out = [];
  if (row.native?.rawAmount && BigInt(row.native.rawAmount) > 0n) out.push({ key: 'native', symbol: row.native.symbol, decimals: 18, raw: row.native.rawAmount, token: null });
  for (const t of row.tokens || []) if (t.rawAmount && BigInt(t.rawAmount) > 0n) out.push({ key: t.address, symbol: t.symbol, decimals: t.decimals, raw: t.rawAmount, token: t.address });
  if (row.stable?.rawAmount && BigInt(row.stable.rawAmount) > 0n) out.push({ key: row.stable.address, symbol: row.stable.symbol, decimals: row.stable.decimals, raw: row.stable.rawAmount, token: row.stable.address });
  return out;
}
/// Sends one transaction from `from` through `provider` on `chainId` (explicit EIP-1559 fees, 30% gas headroom) and waits.
export async function sendFrom(provider, from, chainId, tx, say = () => {}, { rpc } = {}) {
  rpc ||= (await import('/qx-chain.mjs')).rpc;
  const hash=await guardedSend(provider,chainId,{...tx,from},{rpc,onStatus:say});
  say('Waiting for the transaction…');
  for (let i = 0; i < 180; i++) {
    const r = await rpc(chainId, 'eth_getTransactionReceipt', [hash]).catch(() => null);
    if (r) { if (r.status !== '0x1') throw Error('The transaction reverted.'); return r; }
    await new Promise(res => setTimeout(res, 2000));
  }
  throw Error('Still pending. Check your wallet activity.');
}
/// Action buttons + inline forms under one chain row. onDone() reloads balances. `wallet` = {provider, from, here, switchTo}.
export function walletActions(row, { onDone = () => {}, explorer = null, wallet = null } = {}) {
  const assets = sendable(row), wrapped = (row.tokens || []).find(t => t.kind === 'wrapped' && t.rawAmount && BigInt(t.rawAmount) > 0n);
  if (!assets.length) return null;
  const box = el('div', 'qwm-acts'), bar = el('div', 'qwm-act-bar'), panel = el('div', 'qwm-act-panel'); panel.hidden = true;
  const open = (which) => { panel.hidden = panel.dataset.open === which && !panel.hidden; panel.dataset.open = which; if (!panel.hidden) panel.replaceChildren(which === 'send' ? sendForm() : unwrapForm()); else panel.replaceChildren(); box.dispatchEvent(new CustomEvent('qwm:panel', { bubbles: true })); };
  if (wallet && !wallet.here) { const sw = el('button', 'qwm-act', 'Switch to ' + row.name + ' to send'); sw.type = 'button'; sw.addEventListener('click', () => wallet.switchTo(row.chainId)); bar.append(sw); box.append(bar); return box; }
  const sendBtn = el('button', 'qwm-act', 'Send'); sendBtn.type = 'button'; sendBtn.addEventListener('click', () => open('send')); bar.append(sendBtn);
  if (wrapped) { const u = el('button', 'qwm-act', 'Unwrap ' + wrapped.symbol + ' → ' + row.native.symbol); u.type = 'button'; u.addEventListener('click', () => open('unwrap')); bar.append(u); }
  const status = () => { const p = el('p', 'qwm-act-status'); p.setAttribute('role', 'status'); return p; };
  const done = (say, receipt) => { say.textContent = 'Done.'; if (explorer && receipt?.transactionHash) { const a = el('a', null, ' View transaction'); a.href = explorer + '/tx/' + receipt.transactionHash; a.target = '_blank'; a.rel = 'noopener noreferrer'; say.append(a); } setTimeout(() => { panel.hidden = true; panel.replaceChildren(); onDone(); }, 2500); };
  async function run(button, say, tx) {
    button.disabled = true;
    try { if (!wallet?.provider) throw Error('Connect your wallet first.'); const receipt = await sendFrom(wallet.provider, wallet.from, row.chainId, tx, t => { say.textContent = t; }); done(say, receipt); }
    catch (e) { say.textContent = tradeError(e); button.disabled = false; }
  }
  function amountField(asset) {
    const wrap = el('div', 'qwm-act-amt'), input = el('input'); input.inputMode = 'decimal'; input.placeholder = '0.0'; input.setAttribute('aria-label', 'Amount');
    const max = el('button', 'qwm-act-max', 'Max'); max.type = 'button'; max.addEventListener('click', () => { input.value = formatRaw(asset().raw, asset().decimals); });
    wrap.append(input, max); return { wrap, input, max };
  }
  function sendForm() {
    const f = el('form', 'qwm-act-form'), sel = el('select'); sel.setAttribute('aria-label', 'Asset');
    for (const a of assets) { const o = el('option', null, a.symbol + ' · ' + formatRaw(a.raw, a.decimals)); o.value = a.key; sel.append(o); }
    const asset = () => assets.find(a => a.key === sel.value) || assets[0];
    const amt = amountField(asset), to = el('input'); to.placeholder = 'Recipient 0x…'; to.setAttribute('aria-label', 'Recipient address'); to.autocomplete = 'off'; to.spellcheck = false;
    const go = el('button', 'qwm-act qwm-act-go', 'Review'); go.type = 'submit'; const say = status();
    let reviewed = null;
    const reset = () => { reviewed = null; go.textContent = 'Review'; };
    for (const i of [sel, amt.input, to]) i.addEventListener('input', reset);
    sel.addEventListener('change', reset); amt.max.addEventListener('click', reset);
    f.addEventListener('submit', async e => {
      e.preventDefault(); const a = asset(), v = parseAmount(amt.input.value, a.decimals), dest = to.value.trim();
      if (!v) { say.textContent = 'Enter an amount.'; return; }
      if (v > BigInt(a.raw)) { say.textContent = 'That is more than your ' + a.symbol + ' balance.'; return; }
      if (!ADDR.test(dest) || BigInt(dest) === 0n) { say.textContent = 'Enter a full 0x address.'; return; }
      if (a.token && dest.toLowerCase() === a.token.toLowerCase()) { say.textContent = 'That is the token’s own contract. Tokens sent there are lost.'; return; }
      const key = a.key + ':' + v + ':' + dest.toLowerCase();
      if (reviewed !== key) {
        reviewed = key; go.textContent = 'Send';
        let note = '';
        try { const { rpc } = await import('/qx-chain.mjs'); const code = await rpc(row.chainId, 'eth_getCode', [dest, 'latest']); if (code && code !== '0x') note = ' This address is a contract: make sure it can receive ' + a.symbol + '.'; } catch {}
        say.textContent = 'Send ' + formatRaw(v, a.decimals) + ' ' + a.symbol + ' to ' + dest + ' on ' + row.name + '?' + note + ' Press Send to confirm in your wallet.';
        return;
      }
      await run(go, say, a.token ? { to: a.token, data: transferData(dest, v), value: 0n } : { to: dest, data: '0x', value: v });
    });
    f.append(sel, amt.wrap, to, go, say); return f;
  }
  function unwrapForm() {
    const f = el('form', 'qwm-act-form'), asset = () => ({ raw: wrapped.rawAmount, decimals: wrapped.decimals });
    const amt = amountField(asset); amt.input.value = formatRaw(wrapped.rawAmount, wrapped.decimals);
    const go = el('button', 'qwm-act qwm-act-go', 'Unwrap'); go.type = 'submit'; const say = status();
    f.addEventListener('submit', async e => {
      e.preventDefault(); const v = parseAmount(amt.input.value, wrapped.decimals);
      if (!v) { say.textContent = 'Enter an amount.'; return; }
      if (v > BigInt(wrapped.rawAmount)) { say.textContent = 'That is more than your ' + wrapped.symbol + ' balance.'; return; }
      await run(go, say, { to: wrapped.address, data: withdrawData(v), value: 0n });
    });
    f.append(el('p', 'qwm-act-note', wrapped.symbol + ' becomes ' + row.native.symbol + ' in this wallet on ' + row.name + ', one for one.'), amt.wrap, go, say); return f;
  }
  box.append(bar, panel); return box;
}
