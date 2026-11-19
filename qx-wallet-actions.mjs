import {freshChainBalances} from './qx-balances.mjs';
import { parseAmountInput } from './qx-amount-input.mjs';
import { guardedSend, tradeError } from './qx-chain-guard.mjs';
import { gasPreflight, gasNote } from './qx-gas-preflight.mjs';
const hx = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); n.append(...kids); return n; };
// Account panel actions (2026-11-08): "Send" any balance on a chain (its coin, WETH/WBNB, USDC/USDG, QHooks launch
// tokens) and "Unwrap WETH → ETH" (WETH.withdraw). Sent from the account panel's connected wallet on the row's chain
// (a row on another chain offers "Switch to …" first). The wallet always shows its own confirmation: these never run
// inside a one-click press.
const ADDR = /^0x[0-9a-fA-F]{40}$/;
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
/// "1.5" with 18 decimals → 1500000000000000000n; null when not a positive amount with at most `decimals` places.
// walletmenu (2026-11-13): the site's shared amount reader, so "1,000,000", "1.234,56" and "0,5" (decimal comma) all work.
// Before, every comma was stripped, so a Danish "0,5" read as 5.
export function parseAmount(text, decimals) {
  try { const v = parseAmountInput(String(text || ''), decimals); return v > 0n ? v : null; } catch { return null; }
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
export async function sendFrom(provider, from, chainId, tx, say = () => {}, { rpc, assert = () => {} } = {}) {
  assert(); rpc ||= (await import('/qx-chain.mjs')).rpc; assert();
  const hash=await guardedSend(provider,chainId,{...tx,from},{rpc,assert,onStatus:say});
  say('Waiting for the transaction…');
  for (let i = 0; i < 180; i++) {
    const r = await rpc(chainId, 'eth_getTransactionReceipt', [hash]).catch(() => null);
    if (r) { if (r.status !== '0x1') throw Error('The transaction reverted.'); return r; }
    await new Promise(res => setTimeout(res, 2000));
  }
  throw Error('Still pending. Check your wallet activity.');
}
// walletmenu (2026-11-12, Randall: "i don't have a button to unwrap WETH in my wallet anymore"): a row on another chain
// still shows Unwrap. One tap switches the wallet to that chain and remembers the request; the menu redraws the row on
// the new chain and the Unwrap form opens by itself. A request is kept for 90 s.
const AFTER_SWITCH_MS = 90000;
let afterSwitch = null; // {chainId, which, until}
export const pendingAfterSwitch = () => afterSwitch && afterSwitch.until > Date.now() ? afterSwitch : null;
/// Action buttons + inline forms under one chain row. onDone() reloads balances. `wallet` = {provider, from, here, switchTo}.
export function walletActions(row, { onDone = () => {}, explorer = null, wallet = null, readRow = freshChainBalances, rpc = null, getContext = null } = {}) {
  const wrapped = (row.tokens || []).find(t => t.kind === 'wrapped' && t.rawAmount && BigInt(t.rawAmount) > 0n);
  if (!wallet && !sendable(row).length) return null;
  const box = el('div', 'qwm-acts'), bar = el('div', 'qwm-act-bar'), panel = el('div', 'qwm-act-panel'); panel.hidden = true;
  let epoch = 0;
  const sender = String(wallet?.from || '').toLowerCase(), provider = wallet?.provider;
  const active = () => { try { const live = getContext ? getContext() : {from: sender, provider, open: true}; return live?.open === true && String(live.from || '').toLowerCase() === sender && live.provider === provider && box.isConnected; } catch { return false; } };
  const current = id => id === epoch && !panel.hidden && panel.dataset.open === 'send' && active();
  const assertCurrent = id => { if (!current(id)) throw Error('Wallet context changed. Close and reopen Send to review again.'); };
  const open = async (which) => {
    const id = ++epoch; panel.hidden = panel.dataset.open === which && !panel.hidden; panel.dataset.open = which;
    panel.replaceChildren();
    if (!panel.hidden && which === 'send') {
      const say = status(); say.textContent = 'Refreshing'; panel.append(say); panel.setAttribute('aria-busy','true');
      try { assertCurrent(id); const fresh = await readRow(row,wallet?.from,{rpc}); assertCurrent(id); panel.replaceChildren(sendForm(sendable(fresh),id)); }
      catch { if(current(id))say.textContent='Refreshing. Close and reopen Send to try again.'; }
      finally { if(current(id))panel.setAttribute('aria-busy','false'); }
    } else if (!panel.hidden) panel.append(unwrapForm());
    box.dispatchEvent(new CustomEvent('qwm:panel', { bubbles: true }));
  };
  // Randall (2026-11-13): "It used to be permanent now it's not". Send and Unwrap always show on a chain row that holds
  // them, whatever chain the wallet is on; from another chain one tap switches the wallet, then opens the form.
  if (wallet && !wallet.here) {
    const later = (which, label, aria) => { const b = el('button', 'qwm-act', label); b.type = 'button'; b.dataset.after = 'switch'; b.setAttribute('aria-label', aria);
      b.addEventListener('click', () => { afterSwitch = { chainId: String(row.chainId), which, until: Date.now() + AFTER_SWITCH_MS }; wallet.switchTo(row.chainId); }); bar.append(b); };
    later('send', 'Send', 'Switch to ' + row.name + ' and send');
    if (wrapped) later('unwrap', 'Unwrap ' + wrapped.symbol + ' → ' + row.native.symbol, 'Switch to ' + row.name + ' and unwrap ' + wrapped.symbol + ' to ' + row.native.symbol);
    box.append(bar, el('p', 'qwm-act-note', 'Switches your wallet to ' + row.name + ' first.'));
    return box;
  }
  const sendBtn = el('button', 'qwm-act', 'Send'); sendBtn.type = 'button'; sendBtn.addEventListener('click', () => open('send')); bar.append(sendBtn);
  if (wrapped) { const u = el('button', 'qwm-act', 'Unwrap ' + wrapped.symbol + ' → ' + row.native.symbol); u.type = 'button'; u.addEventListener('click', () => open('unwrap')); bar.append(u); }
  const status = () => { const p = el('p', 'qwm-act-status'); p.setAttribute('role', 'status'); return p; };
  const done = (say, receipt) => { say.textContent = 'Done.'; if (explorer && receipt?.transactionHash) { const a = el('a', null, ' View transaction'); a.href = explorer + '/tx/' + receipt.transactionHash; a.target = '_blank'; a.rel = 'noopener noreferrer'; say.append(a); } setTimeout(() => { panel.hidden = true; panel.replaceChildren(); onDone(); }, 2500); };
  async function run(button, say, tx, assert = null) {
    const id = epoch, which = panel.dataset.open;
    assert ||= () => { if (!active() || id !== epoch || panel.hidden || panel.dataset.open !== which) throw Error('Wallet context changed. Close and reopen this action to review again.'); };
    button.disabled = true;
    try { assert(); if (!wallet?.provider) throw Error('Connect your wallet first.');
      // G4: never open a wallet prompt without gas for it. The exact tx is estimated; "≈" when estimation fails.
      const read = rpc || (await import('/qx-chain.mjs')).rpc;
      const gas = await gasPreflight({ chainId: row.chainId, owner: wallet.from, action: /^0x2e1a7d4d/.test(tx.data || '') ? 'unwrap' : 'swap', tx, rpc: read }); assert();
      if (!gas.ok) { say.replaceChildren(gasNote(hx, gas, { owner: wallet.from })); button.disabled = true; const again = async () => { const g2 = await gasPreflight({ chainId: row.chainId, owner: wallet.from, action: 'unwrap', tx, rpc: read }).catch(() => null); if (g2?.ok) { globalThis.removeEventListener?.('focus', again); button.disabled = false; say.textContent = ''; } }; globalThis.addEventListener?.('focus', again); return false; }
      const receipt = await sendFrom(wallet.provider, wallet.from, row.chainId, tx, t => { say.textContent = t; }, {rpc,assert}); done(say, receipt); return true; }
    catch (e) { say.textContent = tradeError(e); button.disabled = false; return false; }
  }
  function amountField(asset) {
    const wrap = el('div', 'qwm-act-amt'), input = el('input'); input.inputMode = 'decimal'; input.placeholder = '0.0'; input.setAttribute('aria-label', 'Amount');
    const max = el('button', 'qwm-act-max', 'Max'); max.type = 'button'; max.addEventListener('click', () => { const a=asset();if(a)input.value = formatRaw(a.raw, a.decimals); });
    wrap.append(input, max); return { wrap, input, max };
  }
  function sendForm(initialAssets, id) {
    let assets = initialAssets;
    const f = el('form', 'qwm-act-form'), sel = el('select'); sel.setAttribute('aria-label', 'Asset');
    const populate = key => { sel.replaceChildren(); sel.value=''; for(const a of assets){const o=el('option',null,a.symbol+' · '+formatRaw(a.raw,a.decimals));o.value=a.key;sel.append(o);}if(assets.some(a=>a.key===key))sel.value=key;else if(assets.length)sel.value=assets[0].key; };
    populate();
    const asset = () => assets.find(a => a.key === sel.value);
    const amt = amountField(asset), to = el('input'); to.placeholder = 'Recipient 0x…'; to.setAttribute('aria-label', 'Recipient address'); to.autocomplete = 'off'; to.spellcheck = false;
    const go = el('button', 'qwm-act qwm-act-go', 'Review'); go.type = 'submit'; const say = status();
    let reviewed = null, busy = false;
    const reset = () => { reviewed = null; go.textContent = 'Review'; };
    const controls = [sel,amt.input,amt.max,to,go];
    const available = () => {go.disabled=amt.max.disabled=!assets.length;if(!assets.length)say.textContent='No assets to send on this chain.';};available();
    for (const i of [sel, amt.input, to]) i.addEventListener('input', reset);
    sel.addEventListener('change', reset); amt.max.addEventListener('click', reset);
    f.addEventListener('submit', async e => {
      e.preventDefault(); if(busy)return; busy=true;
      const selected=sel.value || f.dataset.selected, text=amt.input.value, dest=to.value.trim(), previous=reviewed;
      f.dataset.selected=selected; assets=[]; sel.replaceChildren(); reviewed=null; say.textContent='Refreshing';go.textContent='Refreshing';
      for(const n of controls)n.disabled=true;f.setAttribute('aria-busy','true');
      let ready=false, submitted=false;
      try {
        assertCurrent(id); assets=sendable(await readRow(row,wallet?.from,{rpc})); assertCurrent(id);
        populate(selected); ready=true;
        if(text!==amt.input.value || dest!==to.value.trim()){reset();return;}
        const a=assets.find(a=>a.key===selected);
        if(!a){say.textContent='That asset is no longer available. Choose an asset to review.';return;}
        const v=parseAmount(text,a.decimals);
        if(!v){say.textContent='Enter an amount.';return;}
        if(v>BigInt(a.raw)){say.textContent='That is more than your '+a.symbol+' balance.';return;}
        if(!ADDR.test(dest)||BigInt(dest)===0n){say.textContent='Enter a full 0x address.';return;}
        if(a.token&&dest.toLowerCase()===a.token.toLowerCase()){say.textContent='That is the token’s own contract. Tokens sent there are lost.';return;}
        const key=a.key+':'+v+':'+dest.toLowerCase();
        if(previous!==key){
          let note='';
          try {const read=rpc || (await import('/qx-chain.mjs')).rpc,code=await read(row.chainId,'eth_getCode',[dest,'latest'],{purpose:'transaction'});if(code&&code!=='0x')note=' This address is a contract: make sure it can receive '+a.symbol+'.';}catch{}
          assertCurrent(id);
          reviewed=key;say.textContent='Send '+formatRaw(v,a.decimals)+' '+a.symbol+' to '+dest+' on '+row.name+'?'+note+' Press Send to confirm in your wallet.';
          return;
        }
        submitted=await run(go,say,a.token?{to:a.token,data:transferData(dest,v),value:0n}:{to:dest,data:'0x',value:v},()=>assertCurrent(id));
      } catch {if(current(id))say.textContent='Refreshing. Try Review again.';}
      finally {busy=false;if(current(id)){for(const n of controls)n.disabled=false;amt.max.disabled=!assets.length;sel.disabled=!assets.length;go.textContent=submitted?'Sent':reviewed?'Send':'Review';if(submitted)for(const n of controls)n.disabled=true;f.setAttribute('aria-busy','false');if(!ready)reviewed=null;}}
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
  box.append(bar, panel);
  // the Unwrap requested from another chain: the row is now on its chain, so open the form
  const p = pendingAfterSwitch();
  if (p && p.chainId === String(row.chainId) && wallet?.here && (p.which === 'send' || wrapped)) { afterSwitch = null; queueMicrotask(() => open(p.which)); }
  return box;
}
