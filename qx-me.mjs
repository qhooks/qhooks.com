// My QHooks (/me.html): everything the connected wallet has across the ecosystem, on every chain.
// Launches it created (income waiting, its own share, vesting streams, keys), tokens it holds, stakes and raffle
// entries in marketplace modules, module builder earnings, and terminal cashback and referral rewards.
// Data: /api/account/<w>/launches and /api/terminal/wallet/<w> (the worker's Markets directory and indexer), then
// on-chain reads through the public RPCs. Every button sends the same call as the launch page's own panel.
import { connectedAddress, onWalletChange, CHAIN_NAME, h } from '/qx-chain.mjs';
import { loadEarnings, renderEarnings, section } from '/qx-earnings.mjs';
import '/qx-account-wallet.mjs';

const $ = id => document.getElementById(id);
let seq = 0;

function holdingsSection(positions) {
  const held = positions.filter(p => p.balance > 0).sort((a, b) => b.balance * b.price - a.balance * a.price);
  if (!held.length) return [h('p', { class: 'qa-empty' }, 'No QHooks launch tokens in this wallet. ', h('a', { href: '/terminal.html' }, 'Open the terminal'), '.')];
  return [h('div', { class: 'qa-table', role: 'table' },
    h('div', { class: 'qa-tr qa-th', role: 'row' }, ...['Token', 'Chain', 'Holding', 'Value', 'Result'].map(t => h('span', { role: 'columnheader' }, t))),
    ...held.map(p => {
      const value = p.balance * p.price, pnl = p.received + value - p.spent;
      return h('a', { class: 'qa-tr', role: 'row', href: '/terminal.html#m=' + p.chainId + ':' + p.controller },
        h('span', { role: 'cell' }, h('b', {}, p.symbol || '?')), h('span', { role: 'cell' }, CHAIN_NAME[p.chainId] || p.chainId),
        h('span', { role: 'cell' }, p.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })),
        h('span', { role: 'cell' }, value.toLocaleString(undefined, { maximumSignificantDigits: 4 }) + ' ' + (p.quoteSymbol || '')),
        h('span', { role: 'cell', class: pnl >= 0 ? 'qa-up' : 'qa-down' }, (pnl >= 0 ? '+' : '') + pnl.toLocaleString(undefined, { maximumSignificantDigits: 3 }) + ' ' + (p.quoteSymbol || '')));
    }))];
}

const tile = (k, v, sub) => h('div', { class: 'qa-tile' }, h('span', {}, k), h('b', {}, v), sub ? h('small', {}, sub) : null);

async function load(quiet = false) {
  const me = connectedAddress(), mine = ++seq, root = $('qa-root');
  if (!me) {
    root.replaceChildren(h('div', { class: 'qa-connect' }, h('h2', {}, 'Connect a wallet to see your QHooks'), h('p', {}, 'Launches you created, tokens you hold, stakes, raffle entries, vesting and rewards, on every chain. Reading is free; nothing is sent without your confirmation.'),
      h('button', { type: 'button', class: 'qx-btn qx-btn-primary', 'data-qa-connect': '' }, 'Connect wallet')));
    $('qa-tiles').replaceChildren(); return;
  }
  if (!quiet) root.replaceChildren(h('p', { class: 'qa-loading' }, 'Reading your launches, holdings and rewards on every chain…'));
  const data = await loadEarnings(me, {refresh: () => load(true)});
  if (mine !== seq) return;
  const {launches, positions, earn, vests, rewards} = data;
  const value = positions.reduce((s, p) => s + p.balance * p.price, 0), held = positions.filter(p => p.balance > 0).length;
  $('qa-tiles').replaceChildren(tile('Launches', String(launches.length), launches.length ? 'created by you' : 'none yet'), tile('Tokens held', String(held), held ? 'QHooks launches' : '—'),
    tile('Earning', String(earn.length + vests.length), 'stakes, raffles, vesting'), tile('To claim', String(rewards.rows.length + earn.filter(r => r.querySelector('.qa-btn-primary:not([disabled])')).length), 'rewards and payouts'));
  root.replaceChildren(...[
    ...await renderEarnings(me, data, {refresh: () => load(true)}),
    section('qa-holdings', 'Holdings', 'Launch tokens in this wallet, from the terminal\'s index (value at the last trade price).', holdingsSection(positions)),
    section('qa-keys', 'Wallet and keys', null, [h('p', { class: 'qa-muted' }, 'Connected: ' + me + '. Each launch\'s two keys (this wallet and its post-quantum key) are on its dashboard under Keys: rotate them, or start or cancel a recovery. QHooks never sees your post-quantum key or its passphrase.'),
      h('div', { class: 'qa-actions' }, h('a', { class: 'qa-btn qa-btn-primary', href: '/profile.html#' + me }, 'Your public profile →'), h('a', { class: 'qa-btn', href: '/qwallets.html' }, 'qWallets'), h('button', { type: 'button', class: 'qa-btn', 'data-qa-connect': '' }, 'Wallet details'))])].filter(Boolean));
}

onWalletChange(() => load());
load();
