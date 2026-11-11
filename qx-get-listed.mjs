// Slugs verified against GeckoTerminal /api/v2/networks; receipt in lead/tokenlist/.
export const GECKO_NETWORKS = Object.freeze({'1':'eth','56':'bsc','8453':'base','42161':'arbitrum','4663':'robinhood','99901':'elysium','143':'monad'});
export const UPDATE_TOKEN_INFO = 'https://www.geckoterminal.com/request-form/update-token';
export function listingDetails({chainId, token, pool, profile = {}}) {
  const chain = String(chainId), address = String(token || '').toLowerCase();
  if (!/^\d+$/.test(chain) || !/^0x[\da-f]{40}$/.test(address)) return null;
  const links = profile.links || {}, network = GECKO_NETWORKS[chain];
  const safe = value => { try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : ''; } catch { return ''; } };
  const fields = [['chain', 'Chain', chain], ['token', 'Token address', address], ['logo', 'Logo URL', `https://qhooks.com/api/token-profiles/${chain}/${address}/image`],
    ['website', 'Website', safe(links.website)], ...['x','discord','telegram'].map(key => [key, key === 'x' ? 'X' : key[0].toUpperCase() + key.slice(1), safe(links[key])])];
  return {fields, tokenList: 'https://qhooks.com/tokenlist.json', update: UPDATE_TOKEN_INFO,
    gecko: network && /^0x[\da-f]{40}(?:[\da-f]{24})?$/i.test(pool || '') ? `https://www.geckoterminal.com/${network}/pools/${pool.toLowerCase()}` : UPDATE_TOKEN_INFO};
}
export function mountGetListed(options, {document: doc = globalThis.document, clipboard = globalThis.navigator?.clipboard} = {}) {
  const model = listingDetails(options); if (!model) return null;
  const el = (tag, text, attrs = {}) => { const node = doc.createElement(tag); if (text) node.textContent = text; for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value); return node; };
  const root = el('section', '', {class: 'qgl-panel', 'aria-label': 'Get listed'});
  root.append(el('h3', 'Get your logo into wallets and apps'), el('p', 'Apps that read GeckoTerminal or CoinGecko show the icon after their review.'));
  const actions = el('div', '', {class: 'qgl-links'});
  actions.append(el('a', 'Update token info ↗', {href: model.update, target: '_blank', rel: 'noopener noreferrer'}));
  if (model.gecko !== model.update) actions.append(el('a', 'Open pool ↗', {href: model.gecko, target: '_blank', rel: 'noopener noreferrer'}));
  actions.append(el('a', 'QHooks token list ↗', {href: model.tokenList})); root.append(actions);
  const status = el('p', '', {class: 'qgl-status', role: 'status', 'aria-live': 'polite'}), rows = el('div', '', {class: 'qgl-fields'});
  for (const [key, label, value] of model.fields) {
    const input = el('input', '', {type: 'text', readonly: '', value, 'aria-label': label, 'data-listing-value': key});
    const button = el('button', 'Copy', {type: 'button', 'aria-label': 'Copy ' + label, 'data-listing-copy': key});
    if (!value) { input.setAttribute('placeholder', 'Add to your profile'); button.disabled = true; }
    button.addEventListener('click', async () => {
      try { await clipboard.writeText(value); status.textContent = label + ' copied.'; }
      catch { input.focus(); input.select(); status.textContent = 'Select and copy the ' + label.toLowerCase() + ' above.'; }
    });
    const row = el('div', '', {class: 'qgl-field'}); row.append(el('span', label), input, button); rows.append(row);
  }
  root.append(rows, el('p', 'GeckoTerminal sets its review fees.', {class: 'qgl-note'}), status); return root;
}
