// Price impact and pool depth for the trade ticket (2026-11-10, Randall buying ~$7k-liquidity tokens such as ELYCORE).
// Pure helpers: no DOM, wallet or network. The ticket never blocks on these; minOut stays enforced on chain.
export const WARN_PCT = 5, TICKET_WARN_PCT = 10, CONFIRM_PCT = 15, LOW_LIQUIDITY_USD = 10000, CONFIRM_WINDOW_MS = 15000;

/// Impact in percent from the full trade and a reference trade through the same path.
/// got/spend vs refGot/refSpend (bigints): 1 - (got/spend)/(refGot/refSpend). Null when unknown.
export function impactFromQuotes(got, spend, refGot, refSpend) {
  try {
    if (![got, spend, refGot, refSpend].every(v => typeof v === 'bigint') || spend <= 0n || refSpend <= 0n || refGot <= 0n) return null;
    const ratio = Number(got * refSpend * 1000000n / (refGot * spend)) / 1000000;
    if (!Number.isFinite(ratio)) return null;
    return Math.min(100, Math.max(0, (1 - ratio) * 100));
  } catch { return null; }
}

export function formatPriceImpact(value) {
  if(typeof value!=='number'||!Number.isFinite(value))return null;
  const warning=Math.abs(value)>TICKET_WARN_PCT;
  return {text:'Price impact '+Math.abs(value).toFixed(1)+'%'+(warning?' · High impact':''),level:warning?'warn':'info'};
}
// The detailed API remains available to settings and existing consumers.
const pct=v=>v<0.01?'<0.01%':v<10?v.toFixed(2)+'%':Math.round(v)+'%';
const usd=v=>v>=1000?'$'+(v/1000).toFixed(v>=10000?0:1)+'K':'$'+Math.round(v);
export function impactLines({impactPct=null,liquidityUsd=null}={}) {
  const lines=[];
  if(typeof impactPct==='number'&&Number.isFinite(impactPct))lines.push(impactPct>WARN_PCT?{text:'Price impact about '+pct(impactPct)+'. This trade moves the price a lot.',level:'warn'}:{text:'Price impact '+pct(impactPct),level:'info'});
  if(typeof liquidityUsd==='number'&&Number.isFinite(liquidityUsd)&&liquidityUsd>0&&liquidityUsd<LOW_LIQUIDITY_USD)lines.push({text:'Low liquidity: about '+usd(liquidityUsd)+' in this pool. Small trades can move the price.',level:'warn'});
  return lines;
}

/// Whether this press needs the extra confirm tap. 'arm' = show the confirm and stop; 'send' = go ahead.
export function impactGate({impactPct, armedAt = null, now = Date.now()} = {}) {
  if (!(typeof impactPct === 'number' && impactPct > CONFIRM_PCT)) return 'send';
  return Number.isFinite(armedAt) && now >= armedAt && now - armedAt < CONFIRM_WINDOW_MS ? 'send' : 'arm';
}
export function confirmCopy(side, impactPct) {
  const n = Math.round(impactPct);
  return {status: 'This trade moves the price about ' + n + '%. ' + (side === 'sell' ? 'Sell' : 'Buy') + ' anyway?', button: (side === 'sell' ? 'Sell' : 'Buy') + ' anyway · ' + n + '% impact'};
}
