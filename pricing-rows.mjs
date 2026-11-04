export function renderPriceRows(catalog) {
  if (!catalog || !Array.isArray(catalog.products)) throw new Error('Malformed catalog');
  const rows = [];
  for (const p of catalog.products) {
    if (!p || typeof p !== 'object') throw new Error('Malformed product');
    const { id, title, amountAtomic, description, unit } = p;
    if (typeof id !== 'string' || typeof title !== 'string' ||
        typeof amountAtomic !== 'string' || typeof description !== 'string' ||
        typeof unit !== 'string') {
      throw new Error('Malformed product fields');
    }
    if (amountAtomic.length > 18 || !/^(0|[1-9][0-9]*)$/.test(amountAtomic)) {
      throw new Error('Invalid amountAtomic');
    }
    const amount = BigInt(amountAtomic);
    const fractional = (amount % 1000000n).toString().padStart(6, '0').replace(/0+$/, '');
    const decimal = `${amount / 1000000n}${fractional ? '.' + fractional : ''}`;
    const price = amount === 0n
      ? 'Free'
      : `${decimal} USDC / ${escapeHtml(unit)}`;
    rows.push(`<tr><th scope="row">${escapeHtml(title)}</th><td>${price}</td><td>${escapeHtml(description)}</td></tr>`);
  }
  return rows.join('\n');
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
    }
  });
}
