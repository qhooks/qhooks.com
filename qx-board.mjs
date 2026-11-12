import {readBoardAddress} from './qx-board-address.mjs';
import {profileUrl} from './qx-profile-address.mjs';
// Community board for a listed launch (#m=<chain>:<controller>) or token (#t=<chain>:<address>). Reading is public. Posting identity is
// the wallet: one free EIP-191 sign-in (no transaction) opens a 7-day session kept in this browser, then posts, replies,
// reactions and reports need no further prompts. The board's creator can pin, hide and set a minimum holding to post.
// Text is plain text end to end: everything here is built with textContent; links become <a rel="nofollow ugc">.
// Server: /api/community/* (qhooks-market-l201 src/community.mjs). Without a board hash the page lists active boards.
import { CHAIN_NAME, connectedAddress, onWalletChange, signMessage, h } from '/qx-chain.mjs';
import {mountCommunityFollowButton} from '/qx-community-follow.mjs';
import {mountBoardCallThanks} from './qx-community-thanks.mjs';
import {mountCallEntry} from '/qx-call-entry.mjs';
import {clampInto, CALL_TEXT_MAX} from '/qx-more-text.mjs';
import { openWallet } from '/qx-account-wallet.mjs';
import {communityKey,communityPath,createCommunityDrafts,mountCommunityPicker,callLinks,publishCommunityCall,recoverCommunityCall,launchIntroduction} from '/qx-community-intent.mjs';
import { boardRow, boardTabs, num, ago, callRecord, addressMark, boardIcon, chainName } from '/qx-board-rows.mjs';
import {memberIdentity} from './qx-member-identity.mjs';
import {communityCapabilities,isElysiumDiscussion,discussionPath,elysiumContractUrl} from './qx-community-capabilities.mjs';
import {firstCallPrompt,boardHasNoCalls} from './qx-community-empty.mjs';

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
  unknown_token: 'No token data was found for that address.', invalid_address:'Check the full token contract and selected chain.',use_launch_board: 'This token has a QHooks launch board. Open its launch board to post.',
  thesis_mismatch: 'The thesis changed after signing. Sign the call again.', hash_mismatch: 'The thesis changed after signing. Sign the call again.', call_limit: 'Five calls per wallet per day. Try again tomorrow.'
};
let target = null, data = null, seq = 0, order = 'top', liveAfter = 0, polling = false;
const pending = new Map(), drafts = createCommunityDrafts();
let lastPublished = null;
const followBindings=[];
function followAt(host,subject){const binding=mountCommunityFollowButton(host,subject);followBindings.push(binding);}
const callIntent = () => new URLSearchParams(location.search).get('intent') === 'call' || /(?:^|&)compose=call(?:&|$)/.test(location.hash.slice(1));
const introIntent = () => new URLSearchParams(location.hash.slice(1)).get('compose') === 'intro';

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
  const head = h('header', { class: 'qb-post-head' }, memberIdentity(p.author,{mark:mark(p.author),className:'qb-author'}),
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
  const body = h('div', { class: 'qb-post-body' }, p.kind === 'call' && p.call ? callRecord({ ...p.call, boardKind: b.kind }) : null, (p.kind === 'call' ? clampInto(h('div', { class: 'qb-text' }), p.text || '', { render: richText }) : h('div', { class: 'qb-text' }, ...richText(p.text || ''))));
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
    const callerFollow=h('span',{});acts.append(callerFollow);followAt(callerFollow,{kind:'caller',wallet:p.author});
    if (p.kind === 'call') { const thanks=h('span',{class:'qb-thanks-wrap'});acts.append(thanks);void mountBoardCallThanks(thanks,{id:p.id,author:p.author});acts.append(actBtn('Copy call link', () => copyCall(data.board, p, card.querySelector('.qb-status')))); }
    if(isElysiumDiscussion(b)&&p.kind==='post')acts.append(h('a',{class:'qb-act',href:discussionPath(b,p)},'Share discussion →'));
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
  const b = data.board, viewer = data.viewer, s = session(), owner = s?.wallet || 'guest';
  let draft = drafts.read(b, owner, replyTo);
  const introducing=!replyTo&&b.kind==='launch'&&introIntent();
  let callMode = communityCapabilities(b).calls && !replyTo && !introducing && (draft.callMode || (!draft.post && !draft.call && callIntent()));
  const persist = () => { draft.callMode = callMode; drafts.save(b, owner, draft, replyTo); };
  const ta = h('textarea', { rows: small ? 2 : introducing ? 6 : 3, maxLength: 1200, placeholder, 'aria-label': replyTo ? 'Your reply' : 'Your post' });
  const count = h('span', { class: 'qb-count' }, '0 / ' + MAX);
  const status = h('p', { class: 'qb-status', role: 'status', 'aria-live': 'polite' });
  const ann = b.kind !== 'token' && viewer?.creator && !replyTo ? h('label', { class: 'qb-ann' }, h('input', { type: 'checkbox' }), ' Announcement (pinned to the top)') : null;
  const send = h('button', { type: 'submit', class: 'qa-btn qa-btn-primary' });
  const who = s ? h('span', { class: 'qb-who' }, mark(s.wallet), 'Posting as ', h('b', {}, short(s.wallet)), ' · ', signOutLink()) : h('span', { class: 'qb-who' }, 'Draft first. Publishing uses your EVM wallet and a free sign-in message.');
  const gateNote = viewer?.reason === 'chain' ? h('p', { class: 'qb-gate-note is-short' }, ERR.chain) : b.gate && !viewer?.creator ? h('p', { class: 'qb-gate-note' + (viewer && !viewer.canPost ? ' is-short' : '') },
    viewer && !viewer.canPost ? 'Posting here needs ' + num(b.gate.min) + ' $' + b.gate.symbol + ' (wallet plus staked). This wallet holds ' + num(viewer.holding) + '.' : 'Posting here needs ' + num(b.gate.min) + ' $' + b.gate.symbol + ' or more, in the wallet or staked.') : null;
  const callNote = h('p', { class: 'qb-call-note' }, 'Your thesis stays saved on this browser. QHooks records the market price when your signed call publishes; your profile keeps the record.');
  const introNote=introducing?h('p',{class:'qb-call-note'},'Start with your token’s details, add your story, and invite people to join in.'):null;
  const entry=!replyTo&&b.kind==='launch'?mountCallEntry({h,board:b,referrer:new URLSearchParams(location.search).get('ref')||'',current:()=>!!target&&communityKey(target)===communityKey(b),onChange:()=>updateSend()}):null;
  function updateSend(){send.textContent=callMode&&entry&&['no_quote','stale','unavailable'].includes(entry.snapshot().state)?'Check entry quote to continue':!connectedAddress()?'Connect wallet to continue':!session()?'Sign in to review '+(callMode?'your call':'your post'):callMode?'Sign and publish call':replyTo?'Reply':'Post';}
  const callToggle = communityCapabilities(b).calls && !replyTo ? h('button', { type: 'button', class: 'qb-call-toggle', 'aria-pressed': String(callMode) }, 'Make a call') : null;
  const intro=introducing?h('button',{type:'button',class:'qb-call-toggle qb-intro'},'Use launch intro'):null;
  const countText = () => { const n = [...ta.value].length, max = callMode ? CALL_TEXT_MAX : MAX; count.textContent = n + ' / ' + max; count.classList.toggle('is-over', n > max); };
  const mode = () => {
    ta.value = draft[callMode ? 'call' : 'post']; ta.maxLength = callMode ? 2000 : 1200;
    ta.placeholder = callMode ? 'Your thesis for $' + b.symbol + '…' : placeholder; ta.setAttribute('aria-label', callMode ? 'Your call thesis' : replyTo ? 'Your reply' : 'Your post');
    callNote.hidden = !callMode;if(introNote)introNote.hidden=callMode;if(entry)entry.element.hidden=!callMode; if (ann) ann.hidden = callMode; callToggle?.setAttribute('aria-pressed', String(callMode));
    updateSend();countText(); persist();
  };
  callToggle?.addEventListener('click', () => { draft[callMode ? 'call' : 'post'] = ta.value; callMode = !callMode; mode(); check.hidden=!callMode||!draft.attemptAt; ta.focus(); });
  ta.addEventListener('input', () => { draft[callMode ? 'call' : 'post'] = ta.value; persist(); countText(); });
  mode(); if(!drafts.persistent())status.textContent='Browser storage is unavailable. Keep this tab open to preserve your draft.'; if (viewer && !viewer.canPost) send.disabled = true;
  const retryHolding = viewer?.reason === 'chain' ? actBtn('Check holding again', () => load({ keep: true })) : null;
  const check = actBtn('Check previous publication', async () => {
    check.disabled = true; status.textContent = 'Checking your public call record…';
    try { const wallet = session()?.wallet || connectedAddress(), post = await recoverCommunityCall({board:b,wallet,thesis:draft.call,attemptAt:draft.attemptAt,api});
      if (!post) { status.textContent = 'No matching published call was found. Your thesis is saved. Review before trying again.'; return; }
      lastPublished = {board:b,post}; draft.call=''; draft.attemptAt=null; persist(); history.replaceState(history.state,'',callLinks(b,post).path); await load({keep:true,focus:post.id});
    } catch(error) { status.textContent = errText(error); } finally { check.disabled = false; }
  });
  check.hidden = !callMode || !draft.attemptAt;
  intro?.addEventListener('click',()=>{
    if(ta.disabled||intro.disabled)return;
    draft[callMode?'call':'post']=ta.value;
    if(draft.post.trim()){status.textContent='Your saved post draft is kept. Clear it first to insert the launch intro.';return;}
    try{draft.post=launchIntroduction(b);callMode=false;mode();check.hidden=true;status.textContent='Launch details added. Add your story, then review before posting.';ta.focus();ta.setSelectionRange?.(0,0);ta.scrollTop=0;}
    catch(error){status.textContent=error.message;}
  });
  const form = h('form', { class: 'qb-compose' + (small ? ' is-small' : '') }, callToggle ? h('div', { class: 'qb-compose-mode' }, callToggle,intro) : null, ta, introNote,callNote,
    entry?.element,
    h('div', { class: 'qb-compose-foot' }, who, h('span', { class: 'qb-compose-right' }, ann, count, send)), gateNote, retryHolding, check, status);
  form.addEventListener('submit', async e => {
    e.preventDefault(); status.textContent = ''; draft[callMode ? 'call' : 'post'] = ta.value; persist();
    const text = ta.value.trim(); if (!text) { status.textContent = callMode ? 'Write your thesis first.' : ERR.empty; return; }
    if ([...text].length > (callMode ? CALL_TEXT_MAX : MAX)) { status.textContent = callMode ? 'That’s over 1,000 characters.' : ERR.too_long; return; }
    if(callMode&&entry&&(!connectedAddress()||!session())){
      const wallet=connectedAddress();send.disabled=true;
      try{const quote=await entry.refresh({isCurrent:()=>callMode&&form.isConnected!==false&&connectedAddress()===wallet&&ta.value.trim()===text});if(!quote||quote.state!=='ready')return;}
      finally{send.disabled=!!viewer&&!viewer.canPost;}
    }
    if (!connectedAddress()) { openWallet(); status.textContent = 'Your draft is saved. Connect your EVM wallet, then continue when ready.'; return; }
    if (!session()) {
      send.disabled=true;
      try { if (!(await signIn(t=>status.textContent=t))) return; drafts.adopt(b,session().wallet,replyTo); await load({keep:true}); }
      catch(error) { status.textContent=errText(error); } finally { send.disabled=false; }
      return; // Signing in never publishes or requests the separate call signature.
    }
    send.disabled = true; ta.disabled=true;if(callToggle)callToggle.disabled=true;if(intro)intro.disabled=true;
    try {
      if (viewer && !viewer.canPost) { status.textContent = ERR[viewer.reason] || ERR.gate; return; }
      if (callMode) {
        const wallet=session().wallet;
        const post=await publishCommunityCall({board:b,thesis:text,wallet,api,signMessage,status:t=>status.textContent=t,
          onEntry:value=>entry?.present(value),beforePublish:()=>{draft.attemptAt ||= Date.now();persist();},
          current:()=>callMode&&form.isConnected!==false&&session()?.wallet===wallet&&connectedAddress()===wallet&&target&&communityKey(target)===communityKey(b)&&ta.value.trim()===text});
        lastPublished={board:b,post};history.replaceState(history.state,'',callLinks(b,post).path);draft.attemptAt=null;
      } else await api(boardApi(b) + '/posts', { method: 'POST', auth: true, body: { text, ...(replyTo ? { replyTo } : {}), ...(ann?.querySelector('input').checked ? { kind: 'announcement' } : {}) } });
      ta.value = ''; draft[callMode ? 'call' : 'post'] = ''; persist(); await onDone?.();
    } catch (err) { if(err.entryQuote)entry?.present(err.entryQuote);else if(callMode&&entry&&err.code==='no_price')entry.present({state:'unavailable',detail:'The indexed entry quote changed before publication. Your thesis stays saved. Open the market or check again.'});status.textContent = errText(err); check.hidden = !callMode || !draft.attemptAt || err.code === 4001; }
    finally { send.disabled = !!viewer && !viewer.canPost; ta.disabled=false;if(callToggle)callToggle.disabled=false;if(intro)intro.disabled=false; }
  });
  return form;
}
async function copyCall(board, post, status) {
  const link=callLinks(board,post).permalink;
  try { await navigator.clipboard.writeText(link); if(status)status.textContent='Call link copied. It opens this record and its token.'; }
  catch { if(status)status.replaceChildren('Copy your call link: ',h('a',{href:link},link)); }
}
function publishedCard(board,post){
 const links=callLinks(board,post),status=h('p',{class:'qb-status',role:'status'}),copy=actBtn('Copy call link',()=>copyCall(board,post,status));
 copy.disabled=!!post.hidden;
 return h('section',{class:'qb-published',role:'status','aria-label':'Published call'},h('p',{class:'qx-eyebrow'},post.hidden?'Call saved for review':'Your call is on record'),h('h2',{},post.hidden?'Saved. Waiting for review.':'Now bring your community.'),
  h('p',{},post.hidden?'This call becomes public when review clears. Your draft was saved as a signed record.':'Share the exact call, or send traders directly to this token with your referral link.'),
  h('div',{class:'qa-actions'},copy,h('a',{class:'qa-btn qa-btn-primary',href:links.trade},'Trade this token →'),h('a',{class:'qa-btn',href:links.path},'Open call record')),status);
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
      h('li', {}, h('b', {}, 'Badges are facts. '), isElysiumDiscussion(b)?'Elysium holder and creator badges are not read here.':b.kind === 'token' ? (b.chainId === 'solana' ? "Holder badges aren't read on Solana yet." : 'Holder badges are read live from the chain when each post is written.') : 'Creator, verified X account, early buyer, staker and holder are read from the chain when each post is written.'),
      h('li', {}, h('b', {}, 'Moderated in the open. '), b.kind === 'token' ? 'Reports and QHooks moderation only. Five reports hide a post until QHooks reviews it. Links from new wallets without a holder badge are held for review for their first 24 hours; only the author can see them until cleared.' : 'The creator can hide posts here; hidden posts stay openable. Five reports hide a post until QHooks reviews it.'),
      h('li', {}, h('b', {}, 'Never advice. '), isElysiumDiscussion(b)?'Posts are people’s opinions. Scored calls and trading are unavailable for Elysium here.':b.kind === 'token' ? 'Posts are people’s opinions. Read the token’s safety information before you trade.' : 'Posts are people’s opinions. Read the launch terms before you trade.')));
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
  const meta = h('p', { class: 'qb-meta' }, h('span', { class: 'qa-chain' }, chainName(b.chainId)), h('code', {}, isElysiumDiscussion(b)&&!b.symbol?'Contract discussion':'$' + b.symbol), token ? h('span', { class: 'qb-outside' }, 'Not a QHooks launch') : h('span', { class: 'qb-ours' }, 'QHooks launch'), token ? null : h('span', { id: 'qb-trust' }),
    token ? null : h('span', { class: 'qb-gate-chip' + (b.gate ? ' is-gated' : '') }, b.gate ? 'Holders of ' + num(b.gate.min) + ' $' + b.gate.symbol + ' post' : 'Open to every wallet'));
  const links = h('div', { class: 'qa-launch-links' }, h('span',{id:'qb-follow-topic'}),isElysiumDiscussion(b)?h('a',{class:'qa-btn qa-btn-primary',href:'/elysium'},'Explore Elysium pools →'):h('a', { class: 'qa-btn qa-btn-primary', href: '/terminal#' + (token ? 't=' : 'm=') + key }, 'Trade $' + b.symbol),
    isElysiumDiscussion(b)?h('a',{class:'qa-btn',href:elysiumContractUrl(b),target:'_blank',rel:'noopener noreferrer'},'View contract on ElysScan'):null,
    !token && b.creators?.[0] ? h('a', { class: 'qa-btn', href: profileUrl({wallet:b.creators[0]}) }, 'Creator profile') : null);
  const tiles = h('div', { class: 'qa-tiles qb-tiles' },
    h('div', { class: 'qa-tile' }, h('span', {}, 'Posts'), h('b', {}, num(b.posts))), h('div', { class: 'qa-tile' }, h('span', {}, 'Replies'), h('b', {}, num(b.replies))),
    h('div', { class: 'qa-tile' }, h('span', {}, 'Latest'), h('b', {}, b.lastPostAt ? ago(b.lastPostAt) : '—')));
  const sec = h('section', { class: 'qb-hero', 'aria-labelledby': 'qb-title' },
    h('div', { class: 'qb-hero-main' }, h('p', { class: 'qx-eyebrow' }, 'Community board'), h('h1', { id: 'qb-title' }, token ? boardIcon(b) : null, b.name + ' ', h('span', { class: 'qx-serif' }, 'board.')), meta, token ? h('div', { class: 'qb-safety', 'aria-label': 'Token safety' }, ...(b.safety?.available ? ((b.safety.flags || []).length ? b.safety.flags.slice(0, 8).map(flag => h('span', { class: 'qb-flag' }, flag)) : [h('span', { class: 'qb-flag is-clear' }, 'Available checks: no flags returned')]) : [h('span', { class: 'qb-flag' }, 'Safety scan unavailable')])) : null, links), tiles);
  if (!token) import('/qx-trust.mjs').then(t => t.trustOf(b.chainId, b.controller).then(v => { const el = $('qb-trust'); if (el && v?.verified) el.replaceChildren(t.badge(v.verified)); if (el && v?.copyOf) el.prepend(t.copyLabel(v.copyOf)); })).catch(() => {});
  if(isElysiumDiscussion(b)){
    sec.querySelector('.qb-safety')?.remove();
    sec.querySelector('.qb-hero-main').append(h('code',{class:'qb-token-contract'},b.address),h('p',{class:'qb-help'},'Elysium · 99901. Discuss this exact address. '+(!b.symbol?'The token label is unavailable. ':'')+'Pool exploration opens the read-only tools; it does not select this token. Calls and trading are unavailable here.'));
  }
  return sec;
}
function render({ focus } = {}) {
  for(const binding of followBindings.splice(0))binding.dispose();
  const pinned = data.pinned || [], posts = data.posts || [];
  const controls = h('div', { class: 'qb-feed-head' }, h('h2', { id: 'qb-feed-h', class: 'qb-h2' }, 'Posts'), isElysiumDiscussion(data.board)?h('div',{class:'qb-orders'},h('span',{class:'qb-help'},'Newest first'),actBtn('Refresh posts',()=>load({keep:true}))):h('div', { class: 'qb-orders', 'aria-label': 'Post order' }, ...['top', 'latest'].map(value => {
    const btn = h('button', { type: 'button', class: 'qb-order', 'aria-pressed': String(order === value) }, value === 'top' ? 'Top' : 'Latest');
    btn.addEventListener('click', () => { if (order !== value) { order = value; load({ keep: true }); } }); return btn;
  })));
  const firstCall=communityCapabilities(data.board).calls&&boardHasNoCalls(data)?firstCallPrompt(document,{href:communityPath(data.board,{intent:true})}):null;
  const feed = h('section', { class: 'qb-feed', 'aria-labelledby': 'qb-feed-h' }, controls, liveBar(),firstCall,
    ...(posts.length ? posts.map(p => postCard(p)) : firstCall?[]:[h('p', { class: 'qb-empty' }, pinned.length ? 'No other posts yet.' : 'Nothing posted yet. Start the board.')]));
  if (data.next) { const more = actBtn('Older posts', () => loadMore(more)); more.classList.add('qb-more'); feed.append(more); }
  const main = h('div', { class: 'qb-main' },
    pinned.length ? h('section', { class: 'qb-pinned', 'aria-labelledby': 'qb-pin-h' }, h('h2', { id: 'qb-pin-h', class: 'qb-h2' }, 'Pinned by the creator'), ...pinned.map(p => postCard(p))) : null,
    composer({ placeholder: 'Say something about ' + (data.board.symbol?'$'+data.board.symbol:isElysiumDiscussion(data.board)?'this Elysium address':'this token') + '…', onDone: () => load({ keep: true }) }), feed);
  root.replaceChildren(hero(), ...(lastPublished&&communityKey(lastPublished.board)===communityKey(data.board)?[publishedCard(data.board,lastPublished.post)]:[]), ...(data.linkedCall?[h('section',{class:'qb-linked-call','aria-label':'Shared call'},h('h2',{},'The shared call'),postCard(data.linkedCall))]:[]), ...(data.linkedCallError?[h('p',{class:'qb-status',role:'status'},data.linkedCallError)]:[]), ...(data.linkedDiscussion?[h('section',{class:'qb-linked-call','aria-label':'Shared discussion'},h('h2',{},'The shared discussion'),postCard(data.linkedDiscussion))]:[]), ...(data.linkedDiscussionError?[h('p',{class:'qb-status',role:'status'},data.linkedDiscussionError)]:[]),h('div', { class: 'qb-layout' }, main, h('aside', { class: 'qb-side' }, ...side())));
  followAt($('qb-follow-topic'),{kind:'board',board:data.board,label:data.board.symbol});
  document.title = (data.board.symbol?'$'+data.board.symbol:isElysiumDiscussion(data.board)?'Elysium contract':'Token') + ' board | QHooks';
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
  if (document.hidden || polling || !target || !data || !communityCapabilities(target).automaticRefresh) return;
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
  if(isElysiumDiscussion(target))order='latest';
  if (!keep) root.replaceChildren(h('p', { class: 'qa-loading' }, 'Opening the board…'));
  try {
    const j = await api(boardApi(target) + '?order=' + order);
    if (mine !== seq) return;
    if (j.redirect) {
      const next={kind:'launch',chainId:String(j.redirect.chainId),controller:String(j.redirect.controller).toLowerCase()},owner=session()?.wallet||'guest',previous=drafts.read(target,owner);
      if(previous.post||previous.call)drafts.save(next,owner,previous);
      const linkedPost=new URLSearchParams(location.hash.slice(1)).get('post');
      location.hash='m='+next.chainId+':'+next.controller+(callIntent()?'&compose=call':'')+(/^p[0-9a-v]{12}$/.test(linkedPost||'')?'&post='+linkedPost:'');return;
    }
    const post=new URLSearchParams(location.hash.slice(1)).get('post');
    if(/^p[0-9a-v]{12}$/.test(post||''))try{const thread=await api(boardApi(target)+'/thread/'+post);if(mine!==seq)return;const loaded=[...(j.posts||[]),...(j.pinned||[])].find(p=>p.id===thread.parentId);if(!loaded)j.linkedDiscussion=thread.post;focus=thread.parentId;}
    catch{j.linkedDiscussionError='This discussion could not be opened. You can still read the board or refresh to retry.';}
    if(mine!==seq)return;
    const query=new URLSearchParams(location.search),call=query.get('call'),caller=query.get('caller');
    if(/^p[0-9a-v]{12}$/.test(call||'')&&/^0x[0-9a-f]{40}$/.test(caller||'')){
      const loaded=[...(j.posts||[]),...(j.pinned||[])].find(post=>post.id===call);
      if(loaded)focus=call;
      else try{const record=await api('/caller/'+caller),shared=(record.calls||[]).find(post=>post.id===call&&post.board&&communityKey(post.board)===communityKey(j.board));if(mine!==seq)return;j.linkedCall=shared||null;if(!shared)j.linkedCallError='That call is unavailable or under review. You can still read this token’s board.';}
      catch{j.linkedCallError='The shared call did not load. Refresh this board to try again.';}
    }
    if(mine!==seq)return;
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
      h('p', {}, e.code === 'not_listed' ? 'Boards open for every launch listed on QHooks Markets.' : errText(e)), h('a', { class: 'qa-btn', href: '/community#boards' }, 'See active boards'),actBtn('Retry this board',()=>load())));
  }
}
function parseTarget() {
  // A legacy fragment may switch boards without a full navigation.
  if (!/^#[mt]=/.test(location.hash)) { const address=readBoardAddress(location.pathname); if(address)return address; }
  const m = /^#m=(\d{1,6}):(0x[0-9a-fA-F]{40})$/.exec(location.hash.split('&')[0]);
  if (m) return { kind: 'launch', chainId: m[1], controller: m[2].toLowerCase() };
  const t = /^#t=(8453|1|42161|56|4663|solana|99901):(.+)$/.exec(location.hash.split('&')[0]);
  if (!t || !(t[1] === 'solana' ? /^[1-9A-HJ-NP-Za-km-z]{32,44}$/ : /^0x[0-9a-fA-F]{40}$/).test(t[2])) return null;
  return { kind: 'token', chainId: t[1], address: t[1] === 'solana' ? t[2] : t[2].toLowerCase() };
}
async function index(mine) {
  document.title = 'Community boards | QHooks';
  root.replaceChildren(h('section', { class: 'qb-hero' }, h('div', { class: 'qb-hero-main' }, h('p', { class: 'qx-eyebrow' }, 'Community'), h('h1', {}, 'Boards ', h('span', { class: 'qx-serif' }, 'for any token.')),
    h('p', { class: 'qa-lede' }, 'Choose a token, write your thesis and put your call on record. Read and draft without a wallet.'),
    h('div', { class: 'qa-launch-links' }, h('a', { class: 'qa-btn', href: '/terminal' }, 'Open the terminal'),h('a',{class:'qa-btn',href:'/community#following'},'Following')))), h('section',{class:'qb-picker-card','aria-labelledby':'qb-picker-title'},h('h2',{id:'qb-picker-title'},'What’s your call?'),h('div',{id:'qb-token-picker'})),
    h('section', { class: 'qa-section' }, h('div', { class: 'qa-section-head' }, h('h2', {}, 'Active boards'), h('p', {}, 'Boards with posts, most recent activity first.')),
      boardTabs()));
  mountCommunityPicker($('qb-token-picker'),{drafts});
}

addEventListener('hashchange', () => load());
onWalletChange(() => { if (target) load({ keep: true }); });
setInterval(poll, 15000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
load();
