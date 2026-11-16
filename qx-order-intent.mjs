// URL entry context only. This never produces an order amount, trigger, quote,
// approval, signature or submission, and the review budget is not a spend cap.
export function readOrderIntent(search = '') {
  const params = new URLSearchParams(String(search));
  const market = /^(\d+):(0x[\da-f]{40})$/i.exec(params.get('m') || '');
  if (!market) return null;
  const side = params.getAll('side').length === 1 && ['buy', 'sell', 'tpsl'].includes(params.get('side')) ? params.get('side') : null;
  const raw = params.getAll('budgetUsd').length === 1 ? params.get('budgetUsd') : '';
  const budget = side && /^(?:0|1|2)(?:\.\d{1,2})?$/.test(raw) ? Number(raw) : null;
  return {chainId: market[1], controller: market[2].toLowerCase(), side,
    budgetUsd: budget > 0 && budget <= 2 ? String(budget) : null};
}

export function orderReviewNote(intent, market, side) {
  if (!intent?.budgetUsd || intent.side !== side || intent.chainId !== String(market?.chainId) ||
      intent.controller !== String(market?.controller || '').toLowerCase()) return null;
  const unit = side === 'buy' ? market.quoteSymbol : market.symbol;
  return `Review budget: up to $${intent.budgetUsd}${side === 'buy' ? '' : ' of ' + unit}. Enter and review the ${unit} amount manually.`;
}
