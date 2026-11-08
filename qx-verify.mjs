// Verify a launch's creator on X (/verify#m=<chain>:<controller>). The creator's wallet signs a short message
// naming the launch and the X account (free, no transaction); the site answers with a code; the creator posts the code
// from that X account and pastes the post's link. The site reads the public post and records the link.
// QHooks never posts to X and never asks for an X login. Without #m the page lists the connected wallet's launches.
import { CHAIN_NAME, connectedAddress, onWalletChange, signMessage, h } from '/qx-chain.mjs';
import { badge, forget } from '/qx-trust.mjs';
import '/qx-account-wallet.mjs';

const root = document.getElementById('qvf-root');
const SAVE = 'qhooks:verify:v1';
const ERR = {
  invalid_handle: 'That is not an X username. Use letters, numbers and underscores, up to 15.',
  not_listed: 'This launch is not listed on QHooks yet. List it from the terminal first.',
  not_the_creator: 'This wallet did not create the launch. Connect the wallet that launched it.',
  invalid_signature: 'The signature could not be read. Sign again.', message_expired: 'That signature is more than a week old. Sign again.',
  invalid_post_url: 'Paste the link of your post, like https://x.com/you/status/123….',
  post_not_found: 'That post could not be found. Check that it is public and not deleted.', post_unreadable: 'X did not answer just now. Try again in a minute.',
  post_by_another_account: 'That post is from a different X account than the one you signed for.', code_not_in_post: 'The code is not in that post. Post the text exactly as shown.',
  post_older_than_message: 'That post is older than your signature. Post the new code.', rate_limited: 'Too many tries from here this hour. Try again later.'
};
const say = (el, text, bad = false) => { el.textContent = text; el.classList.toggle('bad', bad); };
const load = () => { try { return JSON.parse(localStorage.getItem(SAVE) || '{}'); } catch { return {}; } };
const save = v => { try { localStorage.setItem(SAVE, JSON.stringify(v)); } catch {} };
const post = async (path, body) => {
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(ERR[j.error] || 'That did not work (' + (j.error || r.status) + ').');
  return j;
};
const parseTarget = () => { const m = /^#m=(\d+):(0x[0-9a-fA-F]{40})$/.exec(location.hash); return m ? { chainId: m[1], controller: m[2].toLowerCase() } : null; };
const step = (n, title, ...body) => h('section', { class: 'qvf-card', 'data-step': String(n) }, h('h2', {}, h('span', {}, String(n)), title), ...body);

async function render() {
  const target = parseTarget(), me = connectedAddress();
  if (!target) return renderList(me);
  const r = await fetch(`/api/trust/market/${target.chainId}/${target.controller}`, { cache: 'no-store' });
  if (!r.ok) { root.replaceChildren(h('section', { class: 'qvf-card' }, h('p', {}, r.status === 404 ? ERR.not_listed : 'This launch could not be loaded right now.'))); return; }
  const t = await r.json(), L = t.launch, key = L.chainId + ':' + L.controller, saved = load()[key] || {};
  const head = h('div', { class: 'qvf-launch' }, h('b', {}, '$' + L.symbol), h('span', {}, L.name + ' · ' + (CHAIN_NAME[L.chainId] || L.chainId)),
    t.verified ? badge(t.verified) : h('span', { class: 'qtr-muted' }, 'Creator not verified yet'),
    h('a', { class: 'qtr-link', href: '/terminal#m=' + key }, 'Open in the terminal'));
  const isCreator = me && me === L.creator;
  // 1. Wallet
  const s1 = step(1, 'Connect the wallet that launched it',
    h('p', {}, me ? (isCreator ? 'Connected: ' + me.slice(0, 6) + '…' + me.slice(-4) + '. This wallet created the launch.' : 'Connected: ' + me.slice(0, 6) + '…' + me.slice(-4) + '. The launch was created by ' + L.creator.slice(0, 6) + '…' + L.creator.slice(-4) + '. If you rotated your keys, sign with the wallet that acts for the launch now.') : 'Signing is free and moves no funds.'),
    me ? null : h('button', { type: 'button', class: 'qvf-btn', 'data-qa-connect': '' }, 'Connect wallet'));
  if (me && isCreator) s1.classList.add('done');
  // 2. Handle + signature → code
  const handle = h('input', { type: 'text', placeholder: '@yourname', value: saved.handle ? '@' + saved.handle : '', ariaLabel: 'Your X username', autocomplete: 'off', spellcheck: false, id: 'qvf-handle' });
  const signBtn = h('button', { type: 'button', class: 'qvf-btn', disabled: !me, id: 'qvf-sign' }, saved.code ? 'Sign again' : 'Sign and get my code');
  const st2 = h('p', { class: 'qvf-status', role: 'status', ariaLive: 'polite' });
  const s2 = step(2, 'Name your X account and sign', h('p', {}, 'Your wallet signs a message naming this launch and your X account. It is not a transaction and costs nothing.'),
    h('div', { class: 'qvf-row' }, handle, signBtn), st2);
  // 3. Post + link
  const st3 = h('p', { class: 'qvf-status', role: 'status', ariaLive: 'polite' });
  const s3 = h('section', { class: 'qvf-card' + (saved.code ? '' : ' off'), 'data-step': '3' });
  function fillPost(v) {
    if (!v.code) { s3.replaceChildren(h('h2', {}, h('span', {}, '3'), 'Post the code from @your account'), h('p', {}, 'Your code appears here after you sign.')); return; }
    const url = h('input', { type: 'url', placeholder: 'https://x.com/' + v.handle + '/status/…', ariaLabel: 'Link to your post', autocomplete: 'off', id: 'qvf-url' });
    const check = h('button', { type: 'button', class: 'qvf-btn', id: 'qvf-check' }, 'Check my post');
    const intent = 'https://x.com/intent/post?text=' + encodeURIComponent(v.post);
    check.addEventListener('click', async () => {
      check.disabled = true; say(st3, 'Reading your post…');
      try {
        const j = await post('/api/trust/verify/post', { message: v.message, signature: v.signature, postUrl: url.value.trim() });
        forget(L.chainId, L.controller); const all = load(); delete all[key]; save(all);
        say(st3, 'Verified. Your launch now shows ' + '@' + j.verified.handle + ' as its creator.');
        await render();
      } catch (e) { say(st3, e.message, true); check.disabled = false; }
    });
    s3.className = 'qvf-card';
    s3.replaceChildren(h('h2', {}, h('span', {}, '3'), 'Post the code from @' + v.handle),
      h('p', {}, 'Your code is ', h('span', { class: 'qvf-code', id: 'qvf-code' }, v.code), '. Post this from @' + v.handle + ' (you can add your own words), then paste the post\'s link.'),
      h('div', { class: 'qvf-post', id: 'qvf-post' }, v.post),
      h('div', { class: 'qvf-row' }, h('a', { class: 'qvf-btn ghost', href: intent, target: '_blank', rel: 'noopener' }, 'Open X to post'),
        h('button', { type: 'button', class: 'qvf-btn ghost', onclick: async e => { try { await navigator.clipboard.writeText(v.post); e.target.textContent = 'Copied'; } catch {} } }, 'Copy text')),
      h('div', { class: 'qvf-row', style: 'margin-top:12px' }, url, check), st3);
  }
  fillPost(saved);
  signBtn.addEventListener('click', async () => {
    const name = handle.value.trim().replace(/^@/, '');
    if (!/^[A-Za-z0-9_]{1,15}$/.test(name)) { say(st2, ERR.invalid_handle, true); return; }
    signBtn.disabled = true;
    try {
      say(st2, 'Preparing the message…');
      const { message } = await post('/api/trust/verify/message', { chainId: L.chainId, controller: L.controller, handle: name });
      say(st2, 'Sign the message in your wallet…');
      const signature = await signMessage(message);
      say(st2, 'Checking the signature…');
      const j = await post('/api/trust/verify/code', { message, signature });
      const v = { handle: j.handle, code: j.code, post: j.post, message, signature };
      const all = load(); all[key] = v; save(all);
      say(st2, 'Signed by the launch\'s creator. Now post your code.'); s2.classList.add('done'); fillPost(v);
    } catch (e) { say(st2, e.message || 'The wallet did not sign.', true); }
    signBtn.disabled = false;
  });
  const done = t.verified ? h('section', { class: 'qvf-card done' }, h('h2', {}, h('span', {}, '✓'), 'Verified'),
    h('p', {}, 'This launch shows ', badge(t.verified), ' on its page, in the terminal list and on its share card. To link a different account, go through the steps again.')) : null;
  root.replaceChildren(h('section', { class: 'qvf-card' }, head), done, s1, s2, s3,
    h('p', { class: 'qvf-note' }, 'How it works: the signature proves the wallet that created the launch chose this X account, and the post proves the account owner agreed. Anyone can check both: the post stays public on X, and the signed message is kept with the record. Launches that reuse the ticker or name of an earlier verified launch are labelled as copies; nothing is ever blocked.'));
}

async function renderList(me) {
  if (!me) { root.replaceChildren(step(1, 'Connect the wallet that launched your token', h('p', {}, 'We list your launches so you can pick one. Signing later is free and moves no funds.'), h('button', { type: 'button', class: 'qvf-btn', 'data-qa-connect': '' }, 'Connect wallet'))); return; }
  root.replaceChildren(h('section', { class: 'qvf-card' }, h('p', {}, 'Reading your launches…')));
  const r = await fetch('/api/account/' + me + '/launches', { cache: 'no-store' }).catch(() => null), j = r?.ok ? await r.json() : { launches: [] };
  const live = (j.launches || []).filter(l => l.live);
  root.replaceChildren(h('section', { class: 'qvf-card' }, h('h2', {}, 'Your launches'),
    live.length ? h('ul', { class: 'qvf-list' }, ...live.map(l => h('li', {}, h('span', {}, h('b', {}, '$' + l.symbol), ' ' + l.name + ' · ' + (CHAIN_NAME[l.chainId] || l.chainId)),
      h('a', { class: 'qvf-btn ghost', href: '#m=' + l.chainId + ':' + l.controller }, 'Verify'))))
      : h('p', {}, 'No listed launches for ' + me.slice(0, 6) + '…' + me.slice(-4) + '. Launches appear here once they are listed in the terminal.')));
}

window.addEventListener('hashchange', () => render());
onWalletChange(() => render());
render();
