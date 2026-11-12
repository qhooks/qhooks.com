// QHooks System A: /android. Draws the app's real home screen inside the phone: the hook, the brand line, the live
// QHOOKS price and the newest launches, from one read of the public launch feed. No polling: this is a download page.
import { h, icon, RM, fmt, coin, brandLine, inView } from '/qx-a/components.mjs';

const app = document.querySelector('[data-and-app]'), screen = document.querySelector('[data-and-screen]');
const QH = '0x20429af7ca3b0ce4d99edbaa0693f26c5df05195';
const CHAINS = { '4663': 'Robinhood Chain', '8453': 'Base', '56': 'BNB Chain', '42161': 'Arbitrum', '1': 'Ethereum', '99901': 'Elysium', solana: 'Solana' };
const logoOf = (u) => { if (typeof u !== 'string' || !u) return null; if (u.startsWith('data:image/') || u.startsWith('/')) return u; try { const x = new URL(u); return x.hostname === 'qhooks.com' ? x.pathname + x.search : null; } catch { return null; } };
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const cls = (x) => (x > .0005 ? 'qa-up' : x < -.0005 ? 'qa-down' : 'qa-muted');

if (app && screen) {
  const fit = () => app.style.setProperty('--and-k', (screen.clientWidth / 390).toFixed(4));
  new ResizeObserver(fit).observe(screen); fit();

  const line = brandLine({ play: 'none', hook: false });
  const price = h('b', null, 'Refreshing'), change = h('small', { class: 'qa-muted' }, '');
  const rows = h('div', { class: 'qa-list' });
  const tabs = [['trade', 'Trade'], ['hook', 'Hooks'], ['plus', 'Launch'], ['community', 'Community'], ['wallet', 'Portfolio']]
    .map(([ic, label]) => ic === 'plus' ? h('span', { class: 'is-launch' }, h('span', { class: 'and-plus' }, icon('plus')), label) : h('span', null, icon(ic), label));
  app.append(
    h('div', { class: 'and-app__glow' }),
    h('div', { class: 'and-app__bar' }, h('span', { class: 'qa-brand__mark' }), h('b', null, 'QHooks'), h('span', null, 'Connect wallet')),
    h('div', { class: 'and-app__hook' }, h('img', { src: '/qx-a/img/hook-cut.png', alt: '', width: 520, height: 1000 })),
    h('div', { class: 'and-app__body' }, line.el,
      h('div', { class: 'and-app__tag' }, coin('/qhooks-logo.jpg', { size: 'sm' }), h('span', { class: 'and-app__who' }, h('b', null, 'QHOOKS'), h('span', null, 'Robinhood Chain')), h('span', { class: 'and-app__px' }, price, change)),
      h('div', { class: 'and-app__do' }, h('span', null, 'Launch a token'), h('span', null, 'Open the terminal')),
      h('p', { class: 'and-app__h' }, 'Newest launches'), rows),
    h('div', { class: 'and-app__tabs' }, tabs));
  inView(screen, () => line.run(), .4);
  if (RM) line.rest();

  fetch('/api/terminal/feed?chain=all', { cache: 'no-store', credentials: 'omit' }).then((r) => (r.ok ? r.json() : null)).then((body) => {
    const list = Array.isArray(body?.markets) ? body.markets.filter((m) => m?.live) : [];
    const q = list.find((m) => String(m.token).toLowerCase() === QH)?.summary;
    if (num(q?.priceUsd) != null) { price.textContent = fmt.price(q.priceUsd); if (num(q.change24) != null) { change.textContent = fmt.pct(q.change24); change.className = cls(q.change24); } }
    const newest = list.filter((m) => String(m.token).toLowerCase() !== QH).sort((a, b) => (b.listedAt || 0) - (a.listedAt || 0)).slice(0, 3);
    rows.replaceChildren(...newest.map((m) => {
      const s = m.summary || {}, src = logoOf(m.logo), ic = h('span', { class: 'and-ic' }, src ? h('img', { src, alt: '' }) : String(m.symbol || '?').slice(0, 1));
      return h('div', { class: 'qa-row' }, ic, h('span', { class: 'qa-row__main' }, h('span', { class: 'qa-row__t' }, m.symbol || m.name), h('span', { class: 'qa-row__s' }, CHAINS[String(m.chainId)] || '')),
        h('span', { class: 'qa-row__v' }, num(s.mcapUsd) != null ? fmt.usd(s.mcapUsd) : '', num(s.change24) != null ? h('small', { class: cls(s.change24) }, fmt.pct(s.change24)) : null));
    }));
  }).catch(() => {});
}
