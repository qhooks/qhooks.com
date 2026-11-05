// Community board for a listed launch (#m=<chain>:<controller>) or token (#t=<chain>:<address>). Reading is public. Posting identity is
// the wallet: one free EIP-191 sign-in (no transaction) opens a 7-day session kept in this browser, then posts, replies,
// reactions and reports need no further prompts. The board's creator can pin, hide and set a minimum holding to post.
// Text is plain text end to end: everything here is built with textContent; links become <a rel="nofollow ugc">.
// Server: /api/community/* (qhooks-market-l201 src/community.mjs). Without a board hash the page lists active boards.
import { CHAIN_NAME, connectedAddress, onWalletChange, signMessage, h } from '/qx-chain.mjs';
import { openWallet } from '/qx-account-wallet.mjs';
import { boardRow, boardTabs, num, ago, callRecord, addressMark, boardIcon, chainName } from '/qx-board-rows.mjs';

const $ = id => document.getElementById(id);
const root = $('qb-root');
const SESSION = 'qhooks:board-session:v1';
const MAX = 1000;
const REACT = [['up', '▲', 'Agree'], ['insight', '✦', 'Insight'], ['doubt', '?', 'Doubt']];
const ERR = {
  sign_in: 'Sign in again to post: your board session ended.', gate: 'This board asks posters to hold a minimum of the token.', blocked: 'This wallet can’t post on QHooks boards.',
  empty: 'Write something first.', too_long: 'That’s over 1000 characters.', too_many_lines: 'That’s over 20 lines.', too_many_links: 'Two links per post at most.',
  links_only: 'Add a few words to go with the link.', duplicate: 'You posted the same words recently.', slow_down: 'Slow down a little', board_busy: 'This board is busy. Try again in a minute.',
  creator_only: 'Only the launch’s creator can do that.', reply_depth: 'Reply to the first post in the thread.', no_such_post: 'That post is gone.', pin_limit: 'Three pinned posts at most. Unpin one first.',
  invalid_min: 'Enter a positive amount, like 1000 or 0.5.', chain_unavailable: 'Couldn’t read balances from the chain just now. Try again shortly.', own_post: 'You can’t report your own post.',
  platform_hidden: 'QHooks moderation hid this post; it can’t be restored here.', not_listed: 'This launch isn’t listed on QHooks.', rate_limited: 'Too many sign-ins from here. Try again later.',
  invalid_signature: 'The signature didn’t match this wallet.', not_the_wallet: 'Sign with the wallet that is signed in here.', message_expired: 'That signing request expired. Try again.', nonce_used: 'That sign-in was already used. Try again.',
  wallet_address: 'Use only this launch’s token, controller or your own wallet address.', contact_bait: 'Keep contact requests and phone numbers off the board.',
  scam_bait: 'Wallet-secret requests and claim offers aren’t allowed.', slur: 'Those words aren’t allowed on the board.', chain: 'Couldn’t read your holding just now. You can read the board; try posting again shortly.',
  call_open: 'You already have a call on this launch from the past 7 days.', no_price: 'This launch needs a recent trade before you can call it.',
  unknown_token: 'No token data was found for that address.', use_launch_board: 'This token has a QHooks launch board. Open its launch board to post.',
  thesis_mismatch: 'The thesis changed after signing. Sign the call again.', hash_mismatch: 'The thesis changed after signing. Sign the call again.', call_limit: 'Five calls per wallet per day. Try again tomorrow.'
};
let target = null, data = null, seq = 0, order = 'top', liveAfter = 0, polling = false;
const pending = new Map(), drafts = new Map();

// ---- Small helpers ----
const short = a => a.slice(0, 6) + '…' + a.slice(-4);
const fullTime = ms => new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const mark = addressMark;
const boardIdentity = b => b.chainId + ':' + (b.kind === 'token' ? b.address : b.controller);
const draftIdentity = b => (b.kind === 'token' ? 't:' : '') + boardIdentity(b);
const boardApi = b => (b.kind === 'token' ? '/token/' + b.chainId + '/' + b.address : '/board/' + b.chainId + '/' + b.controller);
/** Plain text with http(s) links as anchors. Never parses HTML: every piece is a text node or an <a> with textContent. */
function richText(text) {
  const out = [], re = /https?:\/\/[^\s<>"']+/g; let at = 0, m;
  while ((m = re.exec(text))) {
    let url = m[0].replace(/[.,;:!?)\]]+$/, ''); const end = m.index + url.length;
    if (m.index > at) out.push(document.createTextNode(text.slice(at, m.index)));
    let ok = null; try { const u = new URL(url); if (u.protocol === 'https:' || u.protocol === 'http:') ok = u; } catch {}
    out.push(ok ? h('a', { href: ok.href, target: '_blank', rel: 'nofollow ugc noopener noreferrer', title: ok.href }, ok.host + (ok.pathname.length > 1 ? ok.pathname.slice(0, 24) + (ok.pathname.length > 24 ? '…' : '') : '')) : document.createTextNode(url));
    at = end; re.lastIndex = end;
  }
  if (at < text.length) out.push(document.createTextNode(text.slice(at)));
  return out;
}
function badgePill(b) {
  if (b === 'creator') return h('span', { class: 'qb-badge is-creator', title: 'Created this launch' }, 'Creator');
  if (b.startsWith('verified:')) return h('span', { class: 'qb-badge is-verified', title: 'The creator’s wallet signed a code this X account posted' }, '✓ @' + b.slice(9));
  const L = { early: ['Early buyer', 'Among the first 25 buyers of this launch'], staker: ['Staker', 'Had tokens staked in the holder vault when posting'], holder: ['Holder', 'Held the token when posting'] }[b];
  return L ? h('span', { class: 'qb-badge is-' + b, title: L[1] }, L[0]) : null;
}

// ---- Session (the wallet's free sign-in) ----
function session() {
  try { const s = JSON.parse(localStorage.getItem(SESSION) || 'null'); if (s && s.expiresAt > Date.now() && s.wallet === connectedAddress()) return s; } catch {}
  return null;
}
const forgetSession = () => { try { localStorage.removeItem(SESSION); } catch {} };
async function api(path, { method = 'GET', body, auth = false } = {}) {
  const s = session(), headers = { accept: 'application/json' };
  if (body) headers['content-type'] = 'application/json';
  if (s && (auth || method === 'GET')) headers.authorization = 'Bearer ' + s.token;
  const r = await fetch('/api/community' + path, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { if (j.error === 'sign_in') forgetSession(); const tokenError = target?.kind === 'token' ? ({ wallet_address: 'Use only this token’s address or your own wallet address.', call_open: 'You already have a call on this token from the past 7 days.', no_price: 'A current price is needed before you can call this token.' })[j.error] : null; const e = new Error(tokenError || ERR[j.error] || 'Something went wrong. Try again.'); e.code = j.error; e.retryAfter = j.retryAfter; throw e; }
  return j;
}
async function signIn(status) {
  let me = connectedAddress();
  if (!me) { openWallet(); status('Connect a wallet, then sign in.'); return false; }
  status('Sign the message in your wallet. It’s free and sends nothing on chain.');
  const { message } = await api('/session/message', { method: 'POST', body: { wallet: me } });
  const signature = await signMessage(message);
  const s = await api('/session', { method: 'POST', body: { message, signature } });
  try { localStorage.setItem(SESSION, JSON.stringify(s)); } catch {}
  status('');
  return true;
}
function errText(e) { return e.code === 'slow_down' && e.retryAfter ? ERR.slow_down + ': try again in ' + Math.ceil(e.retryAfter) + ' s.' : e.message || String(e); }

// ---- Posts ----
function postCard(p, { reply = false } = {}) {
  const b = data.board, viewer = data.viewer, creator = b.kind !== 'token' && !!viewer?.creator;
  const head = h('header', { class: 'qb-post-head' }, mark(p.author),
    h('a', { class: 'qb-author', href: '/profile.html#' + p.author, title: p.author }, short(p.author)),
    ...(p.badges || []).map(badgePill).filter(Boolean),
    p.kind === 'announcement' ? h('span', { class: 'qb-kind' }, 'Announcement') : null,
    h('time', { class: 'qb-time', datetime: new Date(p.createdAt).toISOString(), title: fullTime(p.createdAt) }, ago(p.createdAt)));
  const card = h('article', { class: 'qb-post' + (reply ? ' is-reply' : '') + (p.pinned ? ' is-pinned' : '') + (p.kind === 'announcement' ? ' is-ann' : ''), id: 'post-' + p.id, 'data-id': p.id });
  if (p.hidden && !(p.hidden === 'review' || (p.hidden === 'creator' && p.text))) {
    card.classList.add('is-hidden');
    card.append(head, h('p', { class: 'qb-hidden-note' }, p.hidden === 'platform' ? 'Removed by QHooks moderation.' : p.hidden === 'reports' ? 'Hidden after reports from several wallets. Under review.' : 'Hidden by the creator.'));
    if (creator && p.hidden === 'creator') card.append(h('div', { class: 'qb-actions' }, actBtn('Unhide', () => moderate(p, 'hide', { hidden: false }))));
    return card;
  }
  const body = h('div', { class: 'qb-post-body' }, p.kind === 'call' && p.call ? callRecord({ ...p.call, boardKind: b.kind }) : null, h('div', { class: 'qb-text' }, ...richText(p.text || '')));
  if (p.hidden === 'creator' || p.hidden === 'review' || p.folded) {
    card.classList.add('is-hidden');
    const show = h('button', { type: 'button', class: 'qb-link' }, 'Show post');
    body.hidden = true; show.setAttribute('aria-expanded', 'false'); show.addEventListener('click', () => { body.hidden = !body.hidden; show.textContent = body.hidden ? 'Show post' : 'Hide again'; show.setAttribute('aria-expanded', String(!body.hidden)); });
    const reason = p.hidden === 'review' ? 'Held for review. Links from new wallets wait for a check. ' : p.hidden === 'creator' ? 'Hidden by the creator. ' : p.folded === 'reports' ? 'Reported by several wallets. ' : 'New wallet. ';
    card.append(head, h('p', { class: 'qb-hidden-note' }, reason, show), body);
  } else card.append(head, body);
  const acts = h('div', { class: 'qb-actions' });
  if (!p.hidden) {
    for (const [k, g, label] of REACT) {
      const on = (p.mine || []).includes(k), n = p.reactions?.[k] || 0;
      const btn = h('button', { type: 'button', class: 'qb-react' + (on ? ' is-on' : ''), 'aria-pressed': String(on), title: label, 'data-react': k }, h('span', { class: 'qb-glyph', 'aria-hidden': 'true' }, g), h('span', {}, label), n ? h('b', {}, String(n)) : null);
      btn.addEventListener('click', () => react(p, k, !on));
      acts.append(btn);
    }
    if (!reply) acts.append(actBtn('Reply', () => openReply(p, card)));
    if (viewer && viewer.wallet !== p.author) acts.append(reportMenu(p));
  }
  if (creator) {
    if (!reply && !p.hidden) acts.append(actBtn(p.pinned ? 'Unpin' : 'Pin', () => moderate(p, 'pin', { pinned: !p.pinned })));
    acts.append(actBtn(p.hidden ? 'Unhide' : 'Hide', () => moderate(p, 'hide', { hidden: !p.hidden })));
  }
  card.append(acts, h('p', { class: 'qb-status', role: 'status' }));
  if (!reply && p.replies?.length) card.append(h('div', { class: 'qb-replies' }, ...p.replies.map(r => postCard(r, { reply: true }))));
  return card;
}
const actBtn = (label, fn) => { const b = h('button', { type: 'button', class: 'qb-act' }, label); b.addEventListener('click', fn); return b; };
function reportMenu(p) {
  const d = h('details', { class: 'qb-report' }, h('summary', { class: 'qb-act' }, 'Report'));
  const list = h('div', { class: 'qb-report-menu' }, h('p', {}, 'Why should QHooks look at this?'));
  for (const [k, l] of [['spam', 'Spam'], ['scam', 'Scam or phishing'], ['abuse', 'Abuse'], ['other', 'Something else']]) list.append(actBtn(l, async () => {
    d.open = false; await run(p, async () => { const r = await api('/post/' + p.id + '/report', { method: 'POST', auth: true, body: { reason: k } }); return 'Reported. Thanks.' + (r.reports >= 5 ? '' : ''); });
  }));
  d.append(list); return d;
}
async function run(p, fn) {
  const st = document.querySelector('#post-' + p.id + ' > .qb-status');
  if (!session()) { const ok = await signIn(t => { if (st) st.textContent = t; }).catch(e => { if (st) st.textContent = errText(e); return false; }); if (!ok) return; }
  try { const msg = await fn(); if (st && typeof msg === 'string') st.textContent = msg; } catch (e) { if (st) st.textContent = errText(e); }
}
async function react(p, k, on) { await run(p, async () => { const r = await api('/post/' + p.id + '/react', { method: 'POST', auth: true, body: { reaction: k, on } }); p.reactions = r.reactions; p.mine = r.mine; rerenderPost(p); }); }
async function moderate(p, what, body) { await run(p, async () => { await api('/post/' + p.id + '/' + what, { method: 'POST', auth: true, body }); await load({ keep: true }); }); }
function rerenderPost(p) { const el = $('post-' + p.id); if (el) el.replaceWith(postCard(p, { reply: !!p.replyTo })); }
function openReply(p, card) {
  if (card.querySelector(':scope > .qb-compose')) { card.querySelector(':scope > .qb-compose textarea')?.focus(); return; }
  const c = composer({ replyTo: p.id, placeholder: 'Reply to ' + short(p.author) + '…', small: true, onDone: () => load({ keep: true, focus: p.id }) });
  card.append(c); c.querySelector('textarea').focus();
}

// ---- Composer ----
function composer({ replyTo = null, placeholder, small = false, onDone }) {
  const b = data.board, viewer = data.viewer, s = session();
  const key = draftIdentity(b) + ':' + (s?.wallet || 'guest') + ':' + (replyTo || 'post');
  const draft = drafts.get(key) || { post: '', call: '', callMode: false }; drafts.set(key, draft);
  let callMode = !!s && !replyTo && draft.callMode;
  const ta = h('textarea', { rows: small ? 2 : 3, maxLength: 1200, placeholder, 'aria-label': replyTo ? 'Your reply' : 'Your post' });
  const count = h('span', { class: 'qb-count' }, '0 / ' + MAX);
  const status = h('p', { class: 'qb-status', role: 'status', 'aria-live': 'polite' });
  const ann = b.kind !== 'token' && viewer?.creator && !replyTo ? h('label', { class: 'qb-ann' }, h('input', { type: 'checkbox' }), ' Announcement (pinned to the top)') : null;
  const send = h('button', { type: 'submit', class: 'qa-btn qa-btn-primary' }, s ? (replyTo ? 'Reply' : 'Post') : 'Sign in to post');
  const who = s ? h('span', { class: 'qb-who' }, mark(s.wallet), 'Posting as ', h('b', {}, short(s.wallet)), ' · ', signOutLink()) : h('span', { class: 'qb-who' }, 'Posting is free: your wallet signs one message, nothing goes on chain.');
  const gateNote = viewer?.reason === 'chain' ? h('p', { class: 'qb-gate-note is-short' }, ERR.chain) : b.gate && !viewer?.creator ? h('p', { class: 'qb-gate-note' + (viewer && !viewer.canPost ? ' is-short' : '') },
    viewer && !viewer.canPost ? 'Posting here needs ' + num(b.gate.min) + ' $' + b.gate.symbol + ' (wallet plus staked). This wallet holds ' + num(viewer.holding) + '.' : 'Posting here needs ' + num(b.gate.min) + ' $' + b.gate.symbol + ' or more, in the wallet or staked.') : null;
  const callNote = h('p', { class: 'qb-call-note' }, 'Your wallet signs the call. QHooks records the price now; your profile keeps the record.');
  const callToggle = s && !replyTo ? h('button', { type: 'button', class: 'qb-call-toggle', 'aria-pressed': String(callMode) }, 'Make a call') : null;
  const countText = () => { const n = [...ta.value].length, max = callMode ? 280 : MAX; count.textContent = n + ' / ' + max; count.classList.toggle('is-over', n > max); };
  const mode = () => {
    draft.callMode = callMode; ta.value = draft[callMode ? 'call' : 'post']; ta.maxLength = callMode ? 560 : 1200;
    ta.placeholder = callMode ? 'Your thesis for $' + b.symbol + '…' : placeholder; ta.setAttribute('aria-label', callMode ? 'Your call thesis' : replyTo ? 'Your reply' : 'Your post');
    callNote.hidden = !callMode; if (ann) ann.hidden = callMode; callToggle?.setAttribute('aria-pressed', String(callMode));
    send.textContent = callMode ? 'Sign and call' : s ? (replyTo ? 'Reply' : 'Post') : 'Sign in to post'; countText();
  };
  callToggle?.addEventListener('click', () => { callMode = !callMode; mode(); ta.focus(); });
  ta.addEventListener('input', () => { draft[callMode ? 'call' : 'post'] = ta.value; countText(); });
  mode(); if (viewer && !viewer.canPost) send.disabled = true;
  const retryHolding = viewer?.reason === 'chain' ? actBtn('Check holding again', () => load({ keep: true })) : null;
  const form = h('form', { class: 'qb-compose' + (small ? ' is-small' : '') }, callToggle ? h('div', { class: 'qb-compose-mode' }, callToggle) : null, ta, callNote,
    h('div', { class: 'qb-compose-foot' }, who, h('span', { class: 'qb-compose-right' }, ann, count, send)), gateNote, retryHolding, status);
  form.addEventListener('submit', async e => {
    e.preventDefault(); status.textContent = '';
    try {
      if (!session()) { if (!(await signIn(t => status.textContent = t))) return; drafts.set(draftIdentity(b) + ':' + session().wallet + ':' + (replyTo || 'post'), draft); await load({ keep: true }); return; }
      const text = ta.value.trim(); if (!text) { status.textContent = ERR.empty; return; }
      if ([...text].length > (callMode ? 280 : MAX)) { status.textContent = callMode ? 'That’s over 280 characters.' : ERR.too_long; return; }
      send.disabled = true;
      if (callMode) {
        const { message } = await api('/call/message', { method: 'POST', auth: true, body: { chainId: b.chainId, ...(b.kind === 'token' ? { address: b.address } : { controller: b.controller }), wallet: session().wallet, thesis: text } });
        status.textContent = 'Sign the call in your wallet. It’s free and sends no transaction.';
        const signature = await signMessage(message);
        await api(boardApi(b) + '/calls', { method: 'POST', auth: true, body: { message, thesis: text, signature } });
      } else await api(boardApi(b) + '/posts', { method: 'POST', auth: true, body: { text, ...(replyTo ? { replyTo } : {}), ...(ann?.querySelector('input').checked ? { kind: 'announcement' } : {}) } });
      ta.value = ''; draft[callMode ? 'call' : 'post'] = ''; onDone?.();
    } catch (err) { status.textContent = errText(err); } finally { send.disabled = !!viewer && !viewer.canPost; }
  });
  return form;
}
function signOutLink() {
  const a = h('button', { type: 'button', class: 'qb-link' }, 'Sign out');
  a.addEventListener('click', async () => { try { await api('/session', { method: 'DELETE', auth: true }); } catch {} forgetSession(); load({ keep: true }); });
  return a;
}

// ---- Sidebar ----
function side() {
  const b = data.board, viewer = data.viewer;
  const how = h('section', { class: 'qb-card qb-how' }, h('h2', {}, 'How this board works'),
    h('ul', {},
      h('li', {}, h('b', {}, 'Free to post. '), 'Your wallet signs one message to sign in for 7 days. Nothing is sent on chain.'),
      h('li', {}, h('b', {}, b.gate ? 'Holders post. ' : 'Open to every wallet. '), b.gate ? 'Posting needs ' + num(b.gate.min) + ' $' + b.gate.symbol + ' in the wallet or staked, checked when you post. Anyone can read.' : b.kind === 'token' ? 'Anyone can read and post. This token board has no creator controls or minimum holding.' : 'Anyone can read; any wallet can post. The creator can ask for a minimum holding.'),
      h('li', {}, h('b', {}, 'Badges are facts. '), b.kind === 'token' ? (b.chainId === 'solana' ? "Holder badges aren't read on Solana yet." : 'Holder badges are read live from the chain when each post is written.') : 'Creator, verified X account, early buyer, staker and holder are read from the chain when each post is written.'),
      h('li', {}, h('b', {}, 'Moderated in the open. '), b.kind === 'token' ? 'Reports and QHooks moderation only. Five reports hide a post until QHooks reviews it. Links from new wallets without a holder badge are held for review for their first 24 hours; only the author can see them until cleared.' : 'The creator can hide posts here; hidden posts stay openable. Five reports hide a post until QHooks reviews it.'),
      h('li', {}, h('b', {}, 'Never advice. '), b.kind === 'token' ? 'Posts are people’s opinions. Read the token’s safety information before you trade.' : 'Posts are people’s opinions. Read the launch terms before you trade.')));
  const out = [how];
  if (b.kind !== 'token' && viewer?.creator) {
    const input = h('input', { type: 'text', inputMode: 'decimal', id: 'qb-gate-min', placeholder: 'No minimum', value: b.gate?.min || '', autocomplete: 'off', 'aria-describedby': 'qb-gate-help' });
    const st = h('p', { class: 'qb-status', role: 'status' });
    const form = h('form', { class: 'qb-gate-form' }, h('label', { for: 'qb-gate-min' }, 'Minimum $' + b.symbol + ' to post'), h('div', {}, input, h('button', { type: 'submit', class: 'qa-btn' }, 'Save')),
      h('p', { id: 'qb-gate-help', class: 'qb-help' }, 'Wallet balance plus staked, read live when someone posts. Leave empty to let every wallet post. You always can.'), st);
    form.addEventListener('submit', async e => { e.preventDefault(); st.textContent = '';
      try { if (!session() && !(await signIn(t => st.textContent = t))) return; await api('/board/' + b.chainId + '/' + b.controller + '/gate', { method: 'POST', auth: true, body: { min: input.value.trim() || null } }); await load({ keep: true }); }
      catch (err) { st.textContent = errText(err); } });
    out.push(h('section', { class: 'qb-card qb-tools' }, h('h2', {}, 'Creator tools'), h('p', { class: 'qb-help' }, 'You created this launch, so you can pin, post announcements and hide posts on this board.'), form,
      b.hidden ? h('p', { class: 'qb-help' }, num(b.hidden) + ' hidden post' + (b.hidden === 1 ? '' : 's') + ' on this board.') : null));
  }
  return out;
}

// ---- The page ----
function hero() {
  const b = data.board, token = b.kind === 'token', key = boardIdentity(b);
  const meta = h('p', { class: 'qb-meta' }, h('span', { class: 'qa-chain' }, chainName(b.chainId)), h('code', {}, '$' + b.symbol), token ? h('span', { class: 'qb-outside' }, 'Not a QHooks launch') : h('span', { class: 'qb-ours' }, 'QHooks launch'), token ? null : h('span', { id: 'qb-trust' }),
    token ? null : h('span', { class: 'qb-gate-chip' + (b.gate ? ' is-gated' : '') }, b.gate ? 'Holders of ' + num(b.gate.min) + ' $' + b.gate.symbol + ' post' : 'Open to every wallet'));
  const links = h('div', { class: 'qa-launch-links' }, h('a', { class: 'qa-btn qa-btn-primary', href: '/terminal.html#' + (token ? 't=' : 'm=') + key }, 'Trade $' + b.symbol),
    !token && b.creators?.[0] ? h('a', { class: 'qa-btn', href: '/profile.html#' + b.creators[0] }, 'Creator profile') : null);
  const tiles = h('div', { class: 'qa-tiles qb-tiles' },
    h('div', { class: 'qa-tile' }, h('span', {}, 'Posts'), h('b', {}, num(b.posts))), h('div', { class: 'qa-tile' }, h('span', {}, 'Replies'), h('b', {}, num(b.replies))),
    h('div', { class: 'qa-tile' }, h('span', {}, 'Latest'), h('b', {}, b.lastPostAt ? ago(b.lastPostAt) : '—')));
  const sec = h('section', { class: 'qb-hero', 'aria-labelledby': 'qb-title' },
    h('div', { class: 'qb-hero-main' }, h('p', { class: 'qx-eyebrow' }, 'Community board'), h('h1', { id: 'qb-title' }, token ? boardIcon(b) : null, b.name + ' ', h('span', { class: 'qx-serif' }, 'board.')), meta, token ? h('div', { class: 'qb-safety', 'aria-label': 'Token safety' }, ...(b.safety?.available ? ((b.safety.flags || []).length ? b.safety.flags.slice(0, 8).map(flag => h('span', { class: 'qb-flag' }, flag)) : [h('span', { class: 'qb-flag is-clear' }, 'Safety scan: no flags')]) : [h('span', { class: 'qb-flag' }, 'Safety scan unavailable')])) : null, links), tiles);
  if (!token) import('/qx-trust.mjs').then(t => t.trustOf(b.chainId, b.controller).then(v => { const el = $('qb-trust'); if (el && v?.verified) el.replaceChildren(t.badge(v.verified)); if (el && v?.copyOf) el.prepend(t.copyLabel(v.copyOf)); })).catch(() => {});
  return sec;
}
function render({ focus } = {}) {
  const pinned = data.pinned || [], posts = data.posts || [];
  const controls = h('div', { class: 'qb-feed-head' }, h('h2', { id: 'qb-feed-h', class: 'qb-h2' }, 'Posts'), h('div', { class: 'qb-orders', 'aria-label': 'Post order' }, ...['top', 'latest'].map(value => {
    const btn = h('button', { type: 'button', class: 'qb-order', 'aria-pressed': String(order === value) }, value === 'top' ? 'Top' : 'Latest');
    btn.addEventListener('click', () => { if (order !== value) { order = value; load({ keep: true }); } }); return btn;
  })));
  const feed = h('section', { class: 'qb-feed', 'aria-labelledby': 'qb-feed-h' }, controls, liveBar(),
    ...(posts.length ? posts.map(p => postCard(p)) : [h('p', { class: 'qb-empty' }, pinned.length ? 'No other posts yet.' : 'Nothing posted yet. Start the board.')]));
  if (data.next) { const more = actBtn('Older posts', () => loadMore(more)); more.classList.add('qb-more'); feed.append(more); }
  const main = h('div', { class: 'qb-main' },
    pinned.length ? h('section', { class: 'qb-pinned', 'aria-labelledby': 'qb-pin-h' }, h('h2', { id: 'qb-pin-h', class: 'qb-h2' }, 'Pinned by the creator'), ...pinned.map(p => postCard(p))) : null,
    composer({ placeholder: 'Say something about $' + data.board.symbol + '…', onDone: () => load({ keep: true }) }), feed);
  root.replaceChildren(hero(), h('div', { class: 'qb-layout' }, main, h('aside', { class: 'qb-side' }, ...side())));
  document.title = '$' + data.board.symbol + ' board | QHooks';
  if (focus) $('post-' + focus)?.scrollIntoView({ block: 'nearest' });
}
async function loadMore(btn) {
  const mine = seq, selectedOrder = order, path = boardApi(target);
  btn.disabled = true;
  try { const j = await api(path + '?order=' + selectedOrder + (selectedOrder === 'top' ? '&page=' : '&before=') + encodeURIComponent(data.next)); if (mine !== seq) return; const ids = new Set(data.posts.map(p => p.id)); data.posts.push(...j.posts.filter(p => !ids.has(p.id))); data.next = j.next; render(); }
  catch (e) { btn.textContent = errText(e); btn.disabled = false; }
}
function liveBar() {
  const bar = h('div', { class: 'qb-live', id: 'qb-live', role: 'status', 'aria-live': 'polite' });
  bar.hidden = !pending.size;
  if (pending.size) {
    const show = h('button', { type: 'button', class: 'qb-link' }, 'Show');
    show.addEventListener('click', () => load({ keep: true }));
    bar.append(pending.size + ' new post' + (pending.size === 1 ? '' : 's') + ' · ', show);
  }
  return bar;
}
async function poll() {
  if (document.hidden || polling || !target || !data) return;
  polling = true; const mine = seq, path = boardApi(target);
  try {
    // A one-millisecond overlap catches different wallets posting at the same timestamp.
    const j = await api(path + '/since?after=' + Math.max(0, liveAfter - 1));
    if (mine !== seq || document.hidden) return;
    const loaded = new Set([...(data.pinned || []), ...(data.posts || [])].flatMap(p => [p.id, ...(p.replies || []).map(r => r.id)]));
    for (const p of [...(j.posts || []), ...(j.replies || []).map(r => r.post)]) {
      if (!loaded.has(p.id)) pending.set(p.id, p);
      liveAfter = Math.max(liveAfter, p.createdAt);
    }
    $('qb-live')?.replaceWith(liveBar());
  } catch { /* A quiet refresh failure leaves the board and the next refresh usable. */ }
  finally { polling = false; }
}
async function load({ keep = false, focus } = {}) {
  const mine = ++seq;
  const previous = target; target = parseTarget();
  if (!target || previous?.chainId !== target.chainId || previous?.controller !== target.controller || previous?.address !== target.address || previous?.kind !== target.kind) { data = null; pending.clear(); liveAfter = 0; order = 'top'; }
  if (!target) return index(mine);
  if (!keep) root.replaceChildren(h('p', { class: 'qa-loading' }, 'Opening the board…'));
  try {
    const j = await api(boardApi(target) + '?order=' + order);
    if (mine !== seq) return;
    if (j.redirect) { location.hash = 'm=' + j.redirect.chainId + ':' + String(j.redirect.controller).toLowerCase(); return; }
    data = j; pending.clear(); liveAfter = j.board.lastPostAt || 0; render({ focus });
  } catch (e) {
    if (mine !== seq) return;
    if (keep && data) {
      const retryOrder = order; order = data.order || order; render({ focus });
      const bar = $('qb-live');
      bar.replaceChildren(errText(e) + ' ', actBtn('Try again', () => { order = retryOrder; load({ keep: true }); })); bar.hidden = false;
      return;
    }
    root.replaceChildren(h('div', { class: 'qa-pick' }, h('h2', {}, e.code === 'not_listed' ? 'No board for that launch.' : 'The board didn’t load.'),
      h('p', {}, e.code === 'not_listed' ? 'Boards open for every launch listed on QHooks Markets.' : errText(e)), h('a', { class: 'qa-btn', href: '/community.html#boards' }, 'See active boards')));
  }
}
function parseTarget() {
  const m = /^#m=(\d{1,6}):(0x[0-9a-fA-F]{40})$/.exec(location.hash);
  if (m) return { kind: 'launch', chainId: m[1], controller: m[2].toLowerCase() };
  const t = /^#t=(8453|1|42161|56|4663|solana):(.+)$/.exec(location.hash);
  if (!t || !(t[1] === 'solana' ? /^[1-9A-HJ-NP-Za-km-z]{32,44}$/ : /^0x[0-9a-fA-F]{40}$/).test(t[2])) return null;
  return { kind: 'token', chainId: t[1], address: t[1] === 'solana' ? t[2] : t[2].toLowerCase() };
}
async function index(mine) {
  document.title = 'Community boards | QHooks';
  root.replaceChildren(h('section', { class: 'qb-hero' }, h('div', { class: 'qb-hero-main' }, h('p', { class: 'qx-eyebrow' }, 'Community'), h('h1', {}, 'Boards ', h('span', { class: 'qx-serif' }, 'for any token.')),
    h('p', { class: 'qa-lede' }, 'Talk about any token by its chain and contract. Anyone can read; any wallet can post. Open a board from a token in the terminal.'),
    h('div', { class: 'qa-launch-links' }, h('a', { class: 'qa-btn qa-btn-primary', href: '/terminal.html' }, 'Open the terminal')))),
    h('section', { class: 'qa-section' }, h('div', { class: 'qa-section-head' }, h('h2', {}, 'Active boards'), h('p', {}, 'Boards with posts, most recent activity first.')),
      boardTabs()));
}

addEventListener('hashchange', () => load());
onWalletChange(() => { if (target) load({ keep: true }); });
setInterval(poll, 15000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
load();
