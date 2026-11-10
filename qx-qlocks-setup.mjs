// Staged one-tap setup for QLocks v2 + QGrants, one chain at a time. Each button sends the pinned init code to the
// deterministic deployer (0x4e59…956C) from the connected wallet; the address is the same on every chain and code
// there can only be this exact contract. Per-chain setup waits for Randall's go: buttons stay off until the page is
// opened with ?go=<chain id> for that chain.
import { openWallet } from '/qx-qlocks-wallet.mjs';
import { send, codeAt, connectedAddress, onWalletChange, h } from '/qx-chain.mjs';
import { visibleChains } from '/chains.mjs';

const root = document.getElementById('qlks-root');
const go = new Set((new URLSearchParams(location.search).get('go') || '').split(',').filter(Boolean));
const short = a => a.slice(0, 6) + '…' + a.slice(-4);
let art, busy = false, seq = 0;
async function render() {
  if (busy) return;
  const mine = ++seq;
  art ||= await fetch('/full-launch/qlocks-v2.json', { cache: 'no-store' }).then(r => r.json());
  const me = connectedAddress();
  const wallet = me
    ? h('p', { class: 'qlk-flash' }, 'Wallet connected: ' + short(me) + '. Your wallet will ask to switch network and confirm each setup.')
    : h('div', { class: 'qlk-connect' }, h('p', { class: 'qtb-note' }, 'Connect your wallet to set up. Any way of connecting works: browser wallet, email, WalletConnect or MetaMask Mobile. It needs a little ETH on the chain for gas.'),
      (() => { const b = h('button', { type: 'button', class: 'workspace-button' }, 'Connect your wallet to set up'); b.addEventListener('click', () => openWallet()); return b; })());
  const rows = await Promise.all(visibleChains(true).map(async ch => {
    const cells = await Promise.all(['locksV2', 'grants'].map(async k => {
      const c = art.contracts[k], st = h('span', { class: 'qtx-meta', role: 'status' });
      let on = false; try { on = (await codeAt(ch.id, c.address)) !== '0x'; } catch { st.textContent = 'Refreshing…'; }
      if (on) return h('div', {}, h('b', {}, c.name), h('span', { class: 'qtx-meta' }, ' set up'));
      const b = h('button', { type: 'button', class: 'qtx-mini', disabled: !me || !go.has(ch.id) }, 'Set up ' + c.name);
      b.addEventListener('click', async () => {
        b.disabled = true; busy = true;
        try {
          await send(ch.id, { to: art.deployer, data: art.salt + c.initCode.slice(2) }, t => { st.textContent = t; });
          st.textContent = (await codeAt(ch.id, c.address)) !== '0x' ? 'Set up.' : 'Sent, not visible yet. Refreshing…';
          setTimeout(() => { busy = false; render(); }, 2000);
        } catch (e) { busy = false; st.textContent = e?.code === 4001 ? 'Cancelled in your wallet.' : e.message || 'That did not go through'; b.disabled = false; }
      });
      return h('div', {}, b, ' ', st);
    }));
    return h('li', {}, h('div', {}, h('b', {}, ch.name), h('span', { class: 'qtx-meta' }, go.has(ch.id) ? ' · cleared to set up' : ' · waiting for a go')), ...cells);
  }));
  if (mine !== seq) return;
  root.replaceChildren(wallet, h('p', { class: 'qtb-note' }, 'QLocks v2 ' + art.contracts.locksV2.address + ' · QGrants ' + art.contracts.grants.address + '. Same address on every chain.'), h('ul', { class: 'qtx-locks' }, ...rows));
}
render().catch(e => { root.textContent = e.message; });
onWalletChange(() => render());
