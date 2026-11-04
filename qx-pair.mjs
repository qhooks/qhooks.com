// Studio: on Robinhood Chain a launch can trade against a tokenized stock (TSLA, NVDA…) instead of WETH. The choice is
// remembered per chain (stock-pairs.mjs) and read by the launch workspace; only vetted stock tokens are offered, and
// each is verified on chain (proxy, beacon and implementation code) before any launch transaction.
import { STOCK_PAIRS, selectedPair, choosePair } from '/full-launch/packages/multichain-launch/stock-pairs.mjs';
const d = document, $ = id => d.getElementById(id);
const chain = $('ql-chain'), liq = d.querySelector('.qtd-liquidity');
if (chain && liq && !$('ql-pair')) {
  const select = d.createElement('select'); select.id = 'ql-pair';
  const field = d.createElement('div'); field.className = 'qtd-field qtd-pair';
  const label = d.createElement('label'); label.htmlFor = 'ql-pair'; label.textContent = 'Pair';
  const note = d.createElement('small'); note.className = 'qtd-muted'; note.id = 'ql-pair-note';
  field.append(label, select, note); liq.prepend(field);
  const fill = id => {
    const set = STOCK_PAIRS[id];
    select.replaceChildren(new Option('WETH (ETH)', ''), ...(set ? set.tokens.map(([a, s, n]) => new Option(s + ' · ' + n, a)) : []));
    select.value = selectedPair(id) || '';
    field.hidden = !set;
    note.textContent = select.value ? 'Your pool trades against tokenized ' + select.selectedOptions[0].text.split(' · ')[0] + '. You fund it with that stock token; buyers can pay with ETH, routed through the deepest stock market in one trade.' : '';
  };
  const refresh = () => { $('ql-quote-funding')?.dispatchEvent(new Event('input', { bubbles: true })); d.dispatchEvent(new CustomEvent('qhooks:pair', { detail: { chainId: chain.value, pair: select.value || null } })); };
  select.addEventListener('change', () => { choosePair(chain.value, select.value); fill(chain.value); refresh(); });
  chain.addEventListener('change', () => fill(chain.value));
  // Locked while a launch is in progress (Studio disables the chain picker then).
  new MutationObserver(() => { select.disabled = chain.disabled; }).observe(chain, { attributes: true, attributeFilter: ['disabled'] });
  fill(chain.value); select.disabled = chain.disabled;
}
