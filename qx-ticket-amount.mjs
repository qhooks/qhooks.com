import {normalizeAmountInput} from './qx-amount-input.mjs';

// Display is separate from the canonical decimal string used by the existing quote paths.
// Focusing restores every entered digit; rounding the preview never rounds a quote or Max.
export function formatTicketAmount(value, {editing = false} = {}) {
  if (value === '') return '';
  let exact; try { exact = normalizeAmountInput(String(value)); } catch { return String(value); }
  let [whole, fraction = ''] = exact.split('.'); whole = (whole || '0').replace(/^0+(?=\d)/, '');
  if (!editing) {
    let places = whole.length >= 4 ? 0 : 4;
    if (whole === '0' && fraction) places = Math.max(4, (fraction.match(/^0*/)?.[0].length || 0) + 4);
    if (fraction.length > places) {
      const scale = 10n ** BigInt(places), kept = fraction.slice(0, places).padEnd(places, '0');
      const n = BigInt(whole) * scale + BigInt(kept || '0') + (fraction[places] >= '5' ? 1n : 0n);
      whole = String(n / scale); fraction = places ? String(n % scale).padStart(places, '0') : '';
    }
    fraction = fraction.replace(/0+$/, '');
  }
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction || editing && exact.endsWith('.') ? '.' + fraction : '');
}

export function amountPreview(input, exactInput, {onInput = () => {}, maxFont = 40} = {}) {
  let focused = false, scheduled = false;
  const doc = input.ownerDocument || globalThis.document;
  const canvas = doc?.createElement?.('canvas'), context = canvas?.getContext?.('2d');
  function fit() {
    if (input.hidden || !context || !globalThis.getComputedStyle) return;
    const style = getComputedStyle(input), width = input.clientWidth - parseFloat(style.paddingLeft || 0) - parseFloat(style.paddingRight || 0) - 4;
    if (!(width > 0)) return;
    context.font = `${style.fontWeight} ${maxFont}px ${style.fontFamily}`;
    const text = input.value || input.placeholder || '0', measured = context.measureText(text).width;
    input.style.fontSize = Math.min(maxFont, Math.max(1, Math.floor(maxFont * width / Math.max(width, measured)))) + 'px';
  }
  function scheduleFit() {
    if (scheduled) return; scheduled = true;
    (globalThis.requestAnimationFrame || (f => f()))(() => { scheduled = false; fit(); });
  }
  function sync() {
    input.value = formatTicketAmount(exactInput.value, {editing: focused});
    input.title = exactInput.value ? 'Exact amount: ' + exactInput.value : '';
    input.setAttribute('aria-description', input.title); scheduleFit();
  }
  function set(value) { exactInput.value = String(value ?? ''); sync(); }
  input.addEventListener('focus', () => { focused = true; sync(); });
  input.addEventListener('blur', () => { focused = false; sync(); });
  input.addEventListener('input', () => {
    // Preserve invalid edits as invalid. An incomplete or rejected paste cannot reuse an earlier valid quote.
    try { exactInput.value = input.value === '' ? '' : normalizeAmountInput(input.value); }
    catch { exactInput.value = input.value; }
    input.title = exactInput.value ? 'Exact amount: ' + exactInput.value : ''; scheduleFit(); onInput();
  });
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(scheduleFit) : null;
  observer?.observe(input); doc?.fonts?.ready?.then(scheduleFit, () => {}); sync();
  return {set, sync, fit: scheduleFit, dispose: () => observer?.disconnect()};
}

// Only a display hint. Execution and presets continue to reread the spendable balance on chain.
export function cachedTokenHolding({owner, chainId, token, decimals, storage, now = Date.now()} = {}) {
  const sol = String(chainId) === 'solana', keyOwner = sol ? String(owner || '') : String(owner || '').toLowerCase();
  if (!keyOwner || !sol && !/^0x[0-9a-f]{40}$/.test(keyOwner)) return null;
  try {
    storage ??= globalThis.localStorage;
    const v = JSON.parse(storage?.getItem('qhooks:portfolio:last:v1:' + (sol ? 'solana:' : 'evm:') + keyOwner) || 'null');
    if (!v || !Number.isFinite(v.at) || v.at > now + 60000 || now - v.at >= 7 * 86400000 || v.report?.version !== 1 || v.report.address !== keyOwner || !Array.isArray(v.report.chains)) return null;
    const chain = v.report.chains.find(c => String(c.chainId) === String(chainId));
    const row = chain?.tokens?.find(t => sol ? t.address === token : String(t.address).toLowerCase() === String(token).toLowerCase());
    if (!row || row.decimals !== decimals || !/^\d{1,78}$/.test(row.balance || '')) return null;
    const raw = BigInt(row.balance); if (raw >= 1n << 256n) return null;
    return {raw, at: v.at};
  } catch { return null; }
}
