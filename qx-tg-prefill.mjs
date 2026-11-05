// Trade links fill the terminal's existing controls. They never submit the ticket.
const EVM = /^0x[0-9a-fA-F]{40}$/, MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const decimal = value => typeof value === 'string' && /^\d{1,18}(?:\.\d{1,18})?$/.test(value) && Number(value) > 0;
const validPercent = value => { if (!decimal(value)) return false; const [whole, fraction = ''] = value.split('.'); return BigInt(whole + fraction) <= 100n * 10n ** BigInt(fraction.length); };

export function parseTerminalHash(hash) {
  const params = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  const kind = params.has('m') ? 'm' : params.has('t') ? 't' : null;
  if (!kind) return null;
  const parts = params.get(kind).split(':'), [chain, address] = parts;
  if (parts.length !== 2 || !(chain === 'solana' && kind === 't' ? MINT.test(address) : /^\d+$/.test(chain) && EVM.test(address))) return null;
  const side = params.get('side');
  let trade = null;
  if (side === 'buy' && decimal(params.get('amt'))) trade = { side, amount: params.get('amt') };
  if (side === 'sell' && validPercent(params.get('pct'))) trade = { side, percent: params.get('pct') };
  const slip = params.get('slip');
  if (trade && /^\d{1,5}$/.test(slip || '') && Number(slip) > 0 && Number(slip) <= 10000) trade.slippageBps = String(Number(slip));
  const wallet = params.get('wallet');
  if (trade?.side === 'sell' && wallet) {
    if (!(chain === 'solana' ? MINT.test(wallet) : EVM.test(wallet))) trade = null;
    else trade.wallet = chain === 'solana' ? wallet : wallet.toLowerCase();
  }
  return { kind, chain, address: address.startsWith('0x') ? address.toLowerCase() : address, trade };
}

export function percentAmount(amount, percent) {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(amount) || !validPercent(percent)) throw new Error('Invalid sell amount');
  const [whole, fraction = ''] = amount.split('.'), [pwhole, pfrac = ''] = percent.split('.');
  const raw = BigInt(whole + fraction) * BigInt(pwhole + pfrac) / (100n * 10n ** BigInt(pfrac.length));
  const result = raw.toString().padStart(fraction.length + 1, '0');
  return fraction.length ? (result.slice(0, -fraction.length) + '.' + result.slice(-fraction.length)).replace(/\.?0+$/, '') || '0' : result;
}

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(test, { timeout = 8000, active = () => true } = {}) {
  const end = Date.now() + timeout;
  do { if (!active()) return false; if (test()) return true; await pause(25); } while (Date.now() < end);
  return false;
}
function setControl(el, value) {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
// Bring the ticket into view and get the Buy/Sell button ready. Never focus the amount field: on a phone that
// opens the keyboard over the ticket.
function focusTrade(go, amount, active) {
  const doc = go.ownerDocument, target = doc.getElementById?.('qxt-trade') || go.closest?.('.qxt-card');
  try { target?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }); } catch {}
  const ready = () => { const a = doc.activeElement; if (!a || a === doc.body || a === amount) go.focus({ preventScroll: true }); };
  if (!go.disabled) { ready(); return; }
  if (typeof MutationObserver === 'undefined') return;
  const observer = new MutationObserver(() => {
    if (!active()) { observer.disconnect(); return; }
    if (!go.disabled) { ready(); observer.disconnect(); }
  });
  observer.observe(go, { attributes: true, attributeFilter: ['disabled'] });
  setTimeout(() => observer.disconnect(), 15000);
}

export function matchesTradeWallet(chain, expected, actual) {
  return !expected || (chain === 'solana' ? expected === actual : expected.toLowerCase() === actual?.toLowerCase());
}
export async function readBoundBalance(chain, expected, getOwner, read) {
  const owner = getOwner(); if (!owner) return null;
  if (!matchesTradeWallet(chain, expected, owner)) throw new Error('selected_wallet_required');
  const balance = await read(owner);
  if (!matchesTradeWallet(chain, expected || owner, getOwner())) throw new Error('selected_wallet_required');
  return balance;
}
export async function readTokenBalance({ chain, address, wallet }, fetchImpl = globalThis.fetch) {
  if (chain === 'solana') {
    const { solAddress } = await import('/qx-solana.mjs');
    return readBoundBalance(chain, wallet, solAddress, async owner => {
      const r = await fetchImpl('/api/terminal/sol/balance/' + owner + '?mint=' + encodeURIComponent(address), { cache: 'no-store' });
      if (!r.ok) throw new Error('Token balance is unavailable.');
      const balance = await r.json();
      if (!Number.isInteger(balance.decimals) || balance.decimals < 0 || balance.decimals > 30 || !/^\d+$/.test(balance.token || '')) throw new Error('Token balance is unavailable.');
      const raw = balance.token.padStart(balance.decimals + 1, '0');
      return balance.decimals ? raw.slice(0, -balance.decimals) + '.' + raw.slice(-balance.decimals) : raw;
    });
  }
  const { connectedAddress, erc20, formatUnits } = await import('/qx-chain.mjs');
  return readBoundBalance(chain, wallet, connectedAddress, async owner => {
    const token = await erc20(chain, address, owner);
    return formatUnits(token.balance, token.decimals, token.decimals).replace(/,/g, '');
  });
}

const pendingPrefills = new WeakMap();
export async function applyTradePrefill(card, trade, { active = () => true, timeout = 8000, Observer = globalThis.MutationObserver, balanceOf = null } = {}) {
  if (!card || !trade || !active()) return false;
  pendingPrefills.get(card)?.cancel();
  const amount = card.querySelector('#qxt-amount'), go = card.querySelector('.qxt-go');
  const side = card.querySelector(`[data-side="${trade.side}"]`);
  if (!amount || !go || !side) return false;
  const pay = card.querySelector('select[aria-label="Pay with"]');
  const run = { cancelled: false, writing: true, observer: null };
  const isActive = () => !run.cancelled && active();
  const manualEdit = () => { if (!run.writing) cancel(); };
  const buttons = [...(card.querySelectorAll?.('[data-side]') || [])];
  const cancel = () => {
    run.cancelled = true; run.observer?.disconnect();
    amount.removeEventListener('input', manualEdit); pay?.removeEventListener('change', manualEdit);
    buttons.forEach(b => b.removeEventListener('click', manualEdit));
    card.ownerDocument?.removeEventListener?.('qxt:token', cancel);
    if (pendingPrefills.get(card) === run) pendingPrefills.delete(card);
  };
  run.cancel = cancel; pendingPrefills.set(card, run);
  amount.addEventListener('input', manualEdit); pay?.addEventListener('change', manualEdit);
  buttons.forEach(b => b.addEventListener('click', manualEdit));
  card.ownerDocument?.addEventListener?.('qxt:token', cancel);
  const writeAmount = value => { run.writing = true; setControl(amount, value); run.writing = false; };
  side.click();
  if (trade.side === 'buy') {
    if (pay && [...pay.options].some(o => o.value === 'native')) setControl(pay, 'native');
    else {
      const status = card.querySelector('.qtx-status');
      if (status) status.textContent = 'This pool does not accept a native-coin buy. Choose a payment amount to continue.';
      cancel(); return false;
    }
  }
  const tolerance = card.querySelector('select[aria-label="Price tolerance"]');
  if (tolerance && trade.slippageBps) {
    if (![...tolerance.options].some(o => o.value === trade.slippageBps)) {
      const option = tolerance.ownerDocument.createElement('option'); option.value = trade.slippageBps;
      option.textContent = (Number(trade.slippageBps) / 100) + '%'; tolerance.append(option);
    }
    setControl(tolerance, trade.slippageBps);
  }
  run.writing = false;
  if (trade.side === 'sell' && trade.wallet) writeAmount('');
  const fillSell = async balance => {
    if (!isActive()) { cancel(); return false; }
    let full;
    if (balanceOf) {
      try { full = await balanceOf(); }
      catch { const status = card.querySelector('.qtx-status'); if (status && isActive()) status.textContent = trade.wallet ? 'Connect '+trade.wallet.slice(0,6)+'…'+trade.wallet.slice(-4)+' to fill this sell.' : 'Token balance is unavailable. Choose a sell amount to continue.'; return false; }
      if (full == null) return false;
    } else {
      amount.value = ''; balance.click();
      if (!await waitFor(() => /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(amount.value), { active: isActive, timeout })) return false;
      full = amount.value;
    }
    if (!isActive()) return false;
    writeAmount(percentAmount(full, trade.percent));
    focusTrade(go, amount, isActive); return true;
  };
  if (trade.side === 'sell') {
    const balance = card.querySelector('.qxt-bal');
    if (!balance) { cancel(); return false; }
    if (!await waitFor(() => !balance.disabled, { active: isActive, timeout })) {
      if (!isActive() || !Observer) return false;
      const status = card.querySelector('.qtx-status');
      if (status) status.textContent = 'Connect your wallet to fill the sell amount.';
      run.observer = new Observer(() => {
        if (!isActive()) { cancel(); return; }
        if (!balance.disabled) {
          run.observer.disconnect(); run.observer = null;
          fillSell(balance).catch(() => cancel());
        }
      });
      run.observer.observe(balance, { attributes: true, attributeFilter: ['disabled'] });
      return false;
    }
    return fillSell(balance);
  }
  if (!isActive()) return false;
  writeAmount(trade.amount); focusTrade(go, amount, isActive);
  return true;
}

export function openTerminalView(view, doc) {
  if (!['orders', 'rewards'].includes(view)) return () => {};
  const sync = doc.querySelector('#qxt-sync');
  const find = () => doc.querySelector(view === 'orders' ? '#qxt-tool-tabs [data-tool="qts"]' : '#qxt-rewards');
  const open = () => {
    const button = find();
    if (!button || button.hidden || button.disabled) return false;
    if (view === 'orders' || button.getAttribute('aria-expanded') !== 'true') button.click();
    if (view === 'orders') doc.querySelector('#qxt-trade')?.scrollIntoView({ block: 'start' });
    return true;
  };
  if (open()) return () => {};
  if (sync) sync.textContent = view === 'orders' ? 'Choose a launch to see its TP/SL orders.' : 'Connect your wallet to see rewards.';
  if (typeof MutationObserver === 'undefined') return () => {};
  const observer = new MutationObserver(() => { if (open()) observer.disconnect(); });
  observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  return () => observer.disconnect();
}
