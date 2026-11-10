// /partners page controller (no inline script, so the site CSP stays unchanged).
import {getWalletHub} from '/wallet-hub-fresh.mjs';
const $ = id => document.getElementById('partner-' + id), hub = getWalletHub(window);
const addressOK = value => /^0x[0-9a-f]{40}$/i.test(value) && BigInt(value) !== 0n;
const node = (tag, text) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; return el; };
let issued = new Date().toISOString(), lookupRun = 0, signing = false;
function fields() {
  const current = hub.snapshot().current, name = $('name').value.trim();
  if (!current || !name || [...name].length > 64 || /[\p{C}\p{Zl}\p{Zp}<>]/u.test(name)) throw Error('Enter a printable app name of 1–64 characters, without angle brackets.');
  const value = $('url').value;
  if (!value || value.length > 512 || /[\s\p{C}]/u.test(value)) throw Error('Enter an HTTP or HTTPS app URL.');
  let url; try { url = new URL(value); } catch { throw Error('Enter an HTTP or HTTPS app URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname) throw Error('Enter an HTTP or HTTPS app URL without credentials.');
  return {name, url: url.href, address: current.owner.toLowerCase(), issued};
}
const message = f => `QHooks partner\nName: ${f.name}\nURL: ${f.url}\nAddress: ${f.address}\nIssued: ${f.issued}`;
function preview() { try { $('message').value = message(fields()); } catch (e) { $('message').value = e.message; } }
hub.subscribe(state => {
  $('wallet-status').textContent = state.current ? 'Listing address: ' + state.current.owner : 'Connect a wallet to list your app.';
  $('sign').disabled = !state.current || state.busy || signing;
  $('connect').textContent = state.current ? 'Change wallet' : 'Connect wallet';
  preview();
});
$('connect').addEventListener('click', () => hub.open());
for (const id of ['name', 'url']) $(id).addEventListener('input', () => { issued = new Date().toISOString(); preview(); });
function units(raw, decimals) {
  const digits = BigInt(raw).toString().padStart(Number(decimals) + 1, '0'), d = Number(decimals);
  return d ? digits.slice(0, -d) + ('.' + digits.slice(-d)).replace(/0+$/, '').replace(/\.$/, '') : digits;
}
async function directory() {
  try {
    const response = await fetch('/api/v1/partners', {cache: 'no-store'}), data = await response.json(); if (!response.ok) throw Error();
    const terms = data.feeTerms;
    if (terms && ['feeBps', 'cashbackBps', 'referrerBps'].every(k => Number.isFinite(terms[k]))) $('terms').textContent = `Referral share: ${terms.referrerBps / 100}% of the ${terms.feeBps / 100}% QHooks routing fee. Traders receive ${terms.cashbackBps / 100}% of that fee as cashback. Pool and hook charges still apply.` + (Array.isArray(data.routerChains) && data.routerChains.length ? ` Live on ${data.routerChains.slice(0, -1).join(', ')}${data.routerChains.length > 1 ? ' and ' : ''}${data.routerChains.slice(-1)[0]}.` : '');
    const cards = data.partners.map(p => {
      const card = node('article'), link = node('a', p.name); link.href = p.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      card.append(link, node('p', p.url), node('code', p.address)); return card;
    });
    $('directory').replaceChildren(...cards); $('directory-status').textContent = cards.length ? `${cards.length} listed apps.` : 'No apps listed yet. Add yours below.';
  } catch { $('directory-status').textContent = 'Refreshing the partner directory. Try again shortly.'; $('terms').textContent = 'Refreshing routing terms.'; }
}
$('lookup').addEventListener('submit', async event => {
  event.preventDefault(); const wallet = $('address').value.trim(), run = ++lookupRun;
  if (!addressOK(wallet)) { $('rewards-status').textContent = 'Enter a nonzero public wallet address.'; return; }
  $('balances').replaceChildren(); $('rewards-status').textContent = 'Reading rewards.';
  try {
    const response = await fetch('/api/qhooks/rewards?wallet=' + encodeURIComponent(wallet), {cache: 'no-store'}), data = await response.json(); if (!response.ok) throw Error();
    if (run !== lookupRun) return;
    const table = node('table'), thead = node('thead'), tr = node('tr');
    for (const title of ['Chain / currency', 'Referral earned', 'Cashback earned', 'Claimable together']) tr.append(node('th', title));
    thead.append(tr); const tbody = node('tbody');
    for (const chain of data.chains) for (const c of chain.currencies) {
      const row = node('tr'); row.append(node('td', chain.name + ' / ' + c.symbol));
      for (const key of ['referralEarnedWei', 'cashbackEarnedWei', 'claimableWei']) row.append(node('td', units(c[key], c.decimals)));
      tbody.append(row);
    }
    table.append(thead, tbody); $('balances').replaceChildren(table);
    $('rewards-status').textContent = data.partial?.length ? 'Some chain reads are Refreshing. The table shows the completed reads.' : tbody.children.length ? 'Rewards read. Claims are made in the terminal and use network gas.' : 'No reward balances were returned for this address.';
  } catch { if (run === lookupRun) $('rewards-status').textContent = 'Refreshing rewards. Try again shortly.'; }
});
$('registration').addEventListener('submit', async event => {
  event.preventDefault(); if (signing) return;
  const current = hub.snapshot().current;
  try {
    // Refresh an expired preview, then ask for another click so the exact message stays reviewable.
    if (Date.now() - Date.parse(issued) > 9 * 60 * 1000) { issued = new Date().toISOString(); preview(); $('registration-status').textContent = 'Message time refreshed. Review it, then choose Sign and list app.'; return; }
    const data = fields(), text = message(data); $('message').value = text;
    signing = true; $('sign').disabled = true; $('registration-status').textContent = 'Review the message in your wallet.';
    const encoded = '0x' + [...new TextEncoder().encode(text)].map(n => n.toString(16).padStart(2, '0')).join('');
    const signature = await current.entry.provider.request({method: 'personal_sign', params: [encoded, data.address]});
    if (hub.snapshot().current !== current) throw Error('Wallet changed. Review the message and try again.');
    const response = await fetch('/api/v1/partners', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({...data, signature})});
    if (!response.ok) throw Error('The listing could not be saved. Refresh the message and try again.');
    $('registration-status').textContent = 'Your app is listed.'; await directory();
  } catch (e) { $('registration-status').textContent = Number(e?.code) === 4001 ? 'Signature declined. You can try again.' : e.message || 'The listing could not be saved.'; }
  finally { signing = false; $('sign').disabled = !hub.snapshot().current; }
});
preview(); directory();
