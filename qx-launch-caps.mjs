// "Started at $X · Bonded at $Y" for a QHooks Simple launch (lead queue item 8, 2026-11-08). From the launch record's start
// and target ticks (/api/v1/launches/<chain>/<token>): market cap = price at the tick × supply × the quote's dollar price.
// "Bonds at" until the launch has bonded. Hidden when a price or the record is missing.
import {readCreateNativeUSD} from '/qx-create-prices.mjs';
import {usdShort} from '/qx-quick-launch-core.mjs';
import {chainById} from '/chains.mjs';
/// Quote units per token at `tick` (v4 price = currency1/currency0), in human units.
export function priceAtTick(tick, tokenIs0, tokenDecimals = 18, quoteDecimals = 18) {
  const raw = Math.pow(1.0001, tokenIs0 ? tick : -tick);
  return raw * Math.pow(10, tokenDecimals - quoteDecimals);
}
export function capsLine(launch, quoteUsd, quoteDecimals = 18) {
  if (!launch || !(quoteUsd > 0) || !Number.isFinite(launch.startTick) || !Number.isFinite(launch.targetTick)) return null;
  const tokenIs0 = BigInt(launch.token) < BigInt(launch.quote), supply = Number(BigInt(launch.supply || '0') / 10n ** BigInt(launch.decimals ?? 18));
  const cap = t => priceAtTick(t, tokenIs0, launch.decimals ?? 18, quoteDecimals) * supply * quoteUsd;
  const start = cap(launch.startTick), target = cap(launch.targetTick);
  if (!(start > 0) || !(target > 0)) return null;
  return 'Started at ' + usdShort(start) + ' · ' + (launch.bonded ? 'Bonded at ' : 'Bonds at ') + usdShort(target);
}
export async function mountLaunchCaps(el, {chainId, token}) {
  try {
    const r = await fetch('/api/v1/launches/' + chainId + '/' + String(token).toLowerCase(), {cache: 'no-store'});
    const launch = r.ok ? (await r.json())?.launch : null; if (!launch || !el.isConnected) return;
    const c = chainById(String(chainId)), q = String(launch.quote).toLowerCase() === String(c?.quote?.address || '').toLowerCase() ? c.quote : null;
    const sym = q?.symbol || c?.native || '';
    let usd = /USD/.test(sym) ? 1 : null; // a cold price read can miss: up to 3 tries
    for (let i = 0; i < 3 && !(usd > 0) && el.isConnected; i++) { if (i) await new Promise(r => setTimeout(r, 3000)); usd = await readCreateNativeUSD(sym.replace(/^W/, '')).catch(() => null); }
    const line = capsLine(launch, usd, q?.decimals ?? 18);
    if (line && el.isConnected) { el.textContent = line; el.hidden = false; }
  } catch {}
}
if (typeof document !== 'undefined') for (const el of document.querySelectorAll('[data-launch-caps][data-chain][data-token]')) mountLaunchCaps(el, {chainId: el.dataset.chain, token: el.dataset.token});
