import {memberWallet,memberWalletKey} from './qx-member-wallet.mjs';
import {profileUrl,resolveProfileAddress,replaceProfileAddress} from './qx-profile-address.mjs';
import {normalizeProfileHandle} from './qx-profile-handle-core.mjs';
import {base58Decode} from './qx-solana-identity.mjs';
import {createSolanaProfileWallet} from './qx-solana-profile-wallet.mjs';
import {solanaProfileSessions} from './qx-profile-session.mjs';
// Public profile for any wallet (at a named or wallet profile address): the launches it created on QHooks (with the modules they pay
// and where to trade them), opt-in QHooks holdings, badges and recent community-board posts. Public reads use /api/account/<w>/launches (the Markets directory, the same source My QHooks
// uses) plus public RPC reads of each launch's blocks contract; holdings from the terminal index (/api/terminal/wallet/<w>);
// posts and post badges from the boards (/api/community/wallet/<w>). Profile edits use explicit wallet sign-in; browsing never signs.
// Optional account chips come from the current member profile's verified public read.
// Existing trust-layer badges and copy warnings keep their separate read path.
import { chainMap } from '/chains.mjs';
import {getWalletHub} from './wallet-hub.mjs';
import {memberHoldingsObservation} from './qx-member-profile-core.mjs';
import {scoreHeadline,scoreCoverageText,checkpointView} from './qx-caller-score-ui.mjs';
import * as profileSessions from './qx-board-session.mjs';
import {readPendingMemberLink} from './qx-member-linked-editor.mjs';
import {createMemberProfileClient,mountMemberProfileEditor,callerMethodElement} from './qx-member-profile.mjs';
import {appendMemberAccountChips,appendUnverifiedMemberLinks} from './qx-member-accounts.mjs';
import { ethCall, words, toAddress, erc20, CHAIN_NAME, h } from '/qx-chain.mjs';
import { BLOCK_FIELDS } from '/full-launch/packages/multichain-launch/launch-blocks.mjs';
import { stakeVaultAddress } from '/full-launch/packages/multichain-launch/stake-vault.mjs';
import { modulesAmong, loadModules } from '/full-launch/packages/multichain-launch/market-modules.mjs';
import { priceText, moveText, qualityText, callLabelPills, boardPath, boardIcon } from '/qx-board-rows.mjs';
import {callLinks} from './qx-community-intent.mjs';
import {isElysiumDiscussion,discussionPath,elysiumAddressUrl} from './qx-community-capabilities.mjs';
import {mountProfileCallerActions,mountProfileCallThanks,confirmedEmptyCalls} from './qx-profile-community.mjs';

const $ = id => document.getElementById(id);
// Board pieces (badges, post lines) share the boards' stylesheet.
if (!document.querySelector('link[href="/qx-board.css"]')) document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: '/qx-board.css' }));
const ZERO = '0x' + '0'.repeat(40);
const CONFIG = '0x79502c55', PHASE_SEL = '0xb1c9fe6e';
const PHASE = ['Not started', 'Launch pool', 'Graduated', 'Closed'];
const EXPLORER = chainMap(c => c.explorer);
const ADDR = /^0x[0-9a-fA-F]{40}$/;
let seq = 0,requestedEditor=null,requestedSolEditor=null,viewedProfileKey=null,shownMember=null,linkedRevision=0;
const profileControls=[];
function clearProfileControls(){for(const control of profileControls.splice(0))control.dispose();}
const memberClient=createMemberProfileClient(),hub=getWalletHub(window);
// Both owner and public headers use only the saved public response, never editor fields.
function showMemberHeader(value){
  if(value?.wallet!==viewedProfileKey||!value.profile)return;
  if(shownMember?.wallet===value.wallet&&(shownMember.updatedAt||0)>(value.updatedAt||0))value=shownMember;
  shownMember=value;
  const identity=memberWallet(value.wallet),name=value.profile.name||short(identity.address),title=$('qp-title');
  title.replaceChildren(h('span',{class:'qmp-profile-name'},name));
  appendMemberAccountChips(title,value.accounts?.filter(row=>row.kind==='x'),{document});
  document.title=name+' | QHooks';
  replaceProfileAddress(location,history,value);
  const target=$('qp-member-identity'),details=h('div',{class:'qmp-profile-details'});
  if(value.profile.bio)details.append(h('p',{class:'qmp-bio'},value.profile.bio));
  appendMemberAccountChips(details,value.accounts?.filter(row=>row.kind!=='x'),{document});
  appendUnverifiedMemberLinks(details,value.profile.links,{document});
  const old=target.querySelector('.qmp-profile-details');if(old)old.replaceWith(details);else target.prepend(details);
  $('qp-avatar').replaceChildren(...(value.profile.image?[h('img',{src:value.profile.image,alt:'',width:'88',height:'88'})]:[]));
}
function linkedAccountsPublished(value){if(value?.wallet!==viewedProfileKey)return;linkedRevision++;showMemberHeader({...shownMember,wallet:value.wallet,profile:shownMember?.profile||{name:'',bio:'',image:'',links:[]},accounts:value.accounts});}
const memberEditor=mountMemberProfileEditor($('qp-member-editor'),{hub,sessions:profileSessions,client:memberClient,onPublished:value=>{showMemberHeader(value);void load(value);},onAccountsPublished:linkedAccountsPublished});
const solHub=$('qp-solana-editor')?createSolanaProfileWallet(window):null;
const solSessions=solHub?solanaProfileSessions(solHub):null;
const solEditor=solHub?mountMemberProfileEditor($('qp-solana-editor'),{hub:solHub,sessions:solSessions,client:memberClient,idPrefix:'qmps',onPublished:value=>{showMemberHeader(value);void load(value);},onAccountsPublished:linkedAccountsPublished}):null;
async function prepareSolProfileEditor(wallet,revision){
  if(!solEditor)return;await solEditor.setWallet(wallet);
  if(revision!==seq||requestedSolEditor!==wallet||solHub.snapshot().current?.owner!==wallet||viewedProfileKey!==wallet)return;
  requestedSolEditor=null;solEditor.open();
}
if(solHub){
  const choices=$('qp-solana-wallets'),connect=$('qp-solana-connect'),disconnect=$('qp-solana-disconnect'),status=$('qp-solana-status');
  const nativeAuth=solSessions.createBoardSession({getConnection:()=>solHub.snapshot().current});
  solHub.subscribe(snapshot=>{
    const owner=snapshot.current?.owner;if(requestedSolEditor&&requestedSolEditor!==owner)requestedSolEditor=null;
    const selected=choices.value;choices.replaceChildren(...snapshot.wallets.map(wallet=>h('option',{value:wallet.id},wallet.name)));
    if(snapshot.wallets.some(wallet=>wallet.id===selected))choices.value=selected;
    choices.disabled=!!snapshot.current||snapshot.busy;connect.disabled=snapshot.busy||!snapshot.current&&!snapshot.wallets.length;
    connect.textContent=snapshot.busy?'Connecting…':snapshot.current?'Edit my Solana profile →':'Connect Solana profile';disconnect.hidden=!snapshot.current;disconnect.disabled=snapshot.busy;
    status.textContent=snapshot.current?'Profile wallet: Solana · '+snapshot.current.address:snapshot.wallets.length?'Connecting shares your address here. Saving your public profile is a separate action.':'No Solana message-signing wallet detected. Open this page with Phantom, Solflare or another Solana wallet in your browser.';
    const target=memberWallet(viewedProfileKey);if(target?.family==='solana')void prepareSolProfileEditor(target.key,seq);
  });
  connect.addEventListener('click',async()=>{
    try{const current=solHub.snapshot().current,connection=current||await solHub.connect(choices.value);if(solHub.snapshot().current!==connection)return;requestedSolEditor=connection.owner;
      if(viewedProfileKey===connection.owner)void prepareSolProfileEditor(connection.owner,seq);else navigateProfile({wallet:connection.owner});
    }catch(error){status.textContent=error.message;}
  });
  disconnect.addEventListener('click',()=>{requestedSolEditor=null;nativeAuth.signOut();void solHub.disconnect();});
}

async function prepareProfileEditor(wallet,revision){
  await memberEditor.setWallet(wallet);
  if(revision!==seq||requestedEditor!==wallet||hub.snapshot().current?.owner?.toLowerCase()!==wallet||viewedProfileKey!==wallet)return;
  requestedEditor=null;memberEditor.open();
}
$('qp-my-profile').addEventListener('click',()=>{const owner=hub.snapshot().current?.owner?.toLowerCase();if(!owner){$('qp-hint').textContent='Connect your EVM wallet, then choose Edit my profile & privacy. Nothing is saved by connecting.';hub.open();return;}requestedEditor=owner;if(viewedProfileKey===owner)void prepareProfileEditor(owner,seq);else navigateProfile({wallet:owner});});
hub.subscribe(s=>{const owner=s.current?.owner?.toLowerCase();if(requestedEditor&&owner!==requestedEditor)requestedEditor=null;$('qp-my-profile').textContent=owner?'Edit my EVM profile & privacy →':'Create my EVM profile →';if(owner&&!viewedProfileKey&&!location.hash&&/^\/profile(?:\.html)?\/?$/.test(location.pathname)&&readPendingMemberLink(owner)){requestedEditor=owner;navigateProfile({wallet:owner});}const target=viewedProfileKey||'';if(ADDR.test(target))void prepareProfileEditor(target,seq);});

const short = a => a.slice(0, 6) + '…' + a.slice(-4);
const day = s => { const d = new Date((s > 1e12 ? s : s * 1000)); return isNaN(d) ? '—' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); };
const tile = (k, v, sub) => h('div', { class: 'qa-tile' }, h('span', {}, k), h('b', {}, v), sub ? h('small', {}, sub) : null);

// A deterministic mark from the address: two brass/sage stops and an angle, no external service.
function paintAvatar(el, w) {
  const n = w.startsWith('solana:')?[...base58Decode(w.slice(7))].reduce((n,b)=>n*256n+BigInt(b),0n):BigInt(w), hue = Number(n % 50n) + 25, hue2 = Number((n >> 8n) % 60n) + 90, ang = Number((n >> 16n) % 360n);
  el.style.background = `conic-gradient(from ${ang}deg, hsl(${hue} 48% 58%), hsl(${hue2} 22% 42%), hsl(${hue} 30% 22%), hsl(${hue} 48% 58%))`;
}

async function blocksOf(chainId, blocks) {
  const w = words(await ethCall(chainId, blocks, CONFIG));
  const at = k => BLOCK_FIELDS.findIndex(([n]) => n === k);
  const payees = w.slice(BLOCK_FIELDS.length, BLOCK_FIELDS.length + 8).map(toAddress);
  const n = payees.findIndex(p => p === ZERO);
  return { token: toAddress(w[at('token')]), quote: toAddress(w[at('quote')]), payees: n < 0 ? payees : payees.slice(0, n) };
}

async function launchCard(L, T) {
  const link = '/terminal#m=' + L.chainId + ':' + L.controller;
  const facts = h('dl', { class: 'qa-facts' }, h('div', {}, h('dt', {}, 'Reading'), h('dd', {}, 'on chain…')));
  const card = h('article', { class: 'qa-launch qp-launch' },
    h('div', { class: 'qa-launch-head' },
      h('div', {}, h('h3', {}, L.name + ' ', h('small', {}, L.symbol)),
        h('span', { class: 'qa-chain' }, CHAIN_NAME[L.chainId] || L.chainId), h('span', { class: 'qp-state' + (L.live ? '' : ' is-off') }, L.live ? 'Listed' : 'No longer listed'),
        h('span', { class: 'qp-date' }, 'Listed ' + day(L.listedAt)), ...(T ? [T.badge, T.copy].filter(Boolean) : [])),
      h('div', { class: 'qa-launch-links' }, h('a', { class: 'qa-btn qa-btn-primary', href: link }, 'Trade'),
        L.live ? h('a', { class: 'qa-btn', href: '/board#m=' + L.chainId + ':' + L.controller }, 'Board') : null,
        EXPLORER[L.chainId] ? h('a', { class: 'qa-btn', href: EXPLORER[L.chainId] + '/address/' + L.token, target: '_blank', rel: 'noopener noreferrer' }, 'Token ↗') : null)),
    facts);
  (async () => {
    const rows = [];
    const phase = await ethCall(L.chainId, L.controller, PHASE_SEL).then(BigInt).catch(() => null);
    rows.push(['Pool', phase == null ? '—' : PHASE[Number(phase)] || '—']);
    const blocks = L.pool?.constructor?.blocks;
    if (blocks && BigInt(blocks) !== 0n) {
      const b = await blocksOf(L.chainId, blocks);
      const [q] = await Promise.all([erc20(L.chainId, b.quote).catch(() => ({ symbol: '?' }))]);
      const mods = modulesAmong(b.payees, b.token, b.quote).map(m => m.module.name);
      // Holder staking: a payee of this launch's own blocks that answers token() = this token (a Simple Flywheel vault
      // need not sit at the predicted address).
      const staking = b.payees.includes(stakeVaultAddress(b.token, b.quote)) || (await Promise.all(b.payees.map(p => ethCall(L.chainId, p, '0xfc0c546a').then(t => typeof t === 'string' && ('0x' + t.slice(-40)).toLowerCase() === b.token.toLowerCase() && ethCall(L.chainId, p, '0x008cc262' + '0'.repeat(64)).then(e => typeof e === 'string' && e.length === 130)).catch(() => false)))).some(Boolean);
      if (staking) mods.push('Holder staking');
      rows.push(['Paired with', q.symbol], ['Modules', mods.length ? mods.join(', ') : 'none'], ['Payees', String(b.payees.length)]);
    } else rows.push(['Modules', 'none']);
    if (L.summary) rows.push(['Holders', String(L.summary.holders ?? '—')]);
    facts.replaceChildren(...rows.map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v))));
  })().catch(() => facts.replaceChildren(h('div', {}, h('dt', {}, 'On chain'), h('dd', {}, 'Could not read this launch right now.'))));
  return card;
}

function showLookup(message) {
  viewedProfileKey=null;shownMember=null;requestedSolEditor=null;void solEditor?.setWallet(null);$('qp-hint').textContent='Look up an EVM or Solana wallet. Name, picture and bio become public only on an explicit save.';
  $('qp-title').replaceChildren('Profiles on ', h('span', { class: 'qx-serif' }, 'QHooks.'));
  $('qp-addr').hidden = true; $('qp-explorers').hidden = true; $('qp-verified').replaceChildren(); $('qp-avatar').removeAttribute('style'); $('qp-avatar').classList.remove('is-set');
  $('qp-tiles').replaceChildren(); $('qp-member-identity').replaceChildren(); $('qp-avatar').replaceChildren(); void memberEditor.setWallet(null);
  $('qp-root').replaceChildren(h('div', { class: 'qa-pick' }, h('h2', {}, message || 'Find your people.'),
    h('p', {}, 'Look up a wallet to read its public calls and launches. Add a name, picture and bio to make your own profile easy to recognize.')));
  document.title = 'Profiles | QHooks';
}

async function load(published) {
  const mine=++seq;clearProfileControls();
  if(!location.hash&&/^\/profile(?:\.html)?\/?$/.test(location.pathname))return showLookup();
  let resolved;try{resolved=published?.wallet===viewedProfileKey?{wallet:published.wallet,handle:published.handle||null}:await resolveProfileAddress(location);}catch(error){if(mine===seq)showLookup(error.message);return;}
  if(mine!==seq)return;
  if(resolved.notFound){showLookup('Profile not found.');$('qp-hint').textContent='No profile uses this address: '+resolved.handle;return;}
  const identity=memberWallet(resolved.wallet);
  if(requestedEditor&&identity?.key!==requestedEditor)requestedEditor=null;
  if(requestedSolEditor&&requestedSolEditor!==identity?.key)requestedSolEditor=null;
  if (!identity) return showLookup('Enter a full EVM or Solana wallet address.');
  const who = identity.key;if(viewedProfileKey!==who)shownMember=null;viewedProfileKey=who;if(published?.wallet===who)shownMember=published;replaceProfileAddress(location,history,resolved);
  if(identity.family==='solana'){requestedEditor=null;void memberEditor.setWallet(null);return loadSolanaProfile(identity,mine);}
  requestedSolEditor=null;void solEditor?.setWallet(null);
  $('qp-hint').textContent='Read public calls and launches. Holdings appear only when the wallet owner chooses to share them.';
  $('qp-input').value = who;
  $('qp-title').replaceChildren(h('span', { class: 'qp-mono' }, short(who)));
  $('qp-full').textContent = who; $('qp-addr').hidden = false; $('qp-verified').replaceChildren();
  $('qp-avatar').replaceChildren(); $('qp-member-identity').replaceChildren(); void prepareProfileEditor(who,mine);
  paintAvatar($('qp-avatar'), who); $('qp-avatar').classList.add('is-set');
  document.title = short(who) + ' | Profile | QHooks';
  if(shownMember?.wallet===who)showMemberHeader(shownMember);
  $('qp-root').replaceChildren(h('p', { class: 'qa-loading' }, 'Reading this wallet’s launches…'));
  const get = u => fetch(u, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);
  const callerRead=get('/api/community/v2/caller/'+who);
  // Profile identity paints as soon as its own read finishes; optional reads cannot hide it.
  const accountsRevision=linkedRevision;
  const memberRead=memberClient.read(who).then(value=>{if(mine===seq)showMemberHeader(accountsRevision!==linkedRevision&&shownMember?.wallet===who?{...value,accounts:shownMember.accounts}:value);return shownMember?.wallet===who?shownMember:value;}).catch(()=>shownMember?.wallet===who?shownMember:null);
  const [acct, , member, social] = await Promise.all([get('/api/account/' + who + '/launches'), loadModules().catch(() => null), memberRead, get('/api/community/v2/wallet/' + who)]);
  if(mine!==seq)return;
  const callerActions=h('div',{});$('qp-member-identity').append(callerActions);const callerControl=mountProfileCallerActions(callerActions,{wallet:who,label:member?.profile.name||short(who),hub,document});profileControls.push(callerControl);
  const caller=await callerRead;if(mine!==seq)return;callerControl.update(caller,social?.callStats);
  let held=member?.profile.shareHoldings?memberHoldingsObservation(await get('/api/terminal/wallet/'+who),who):null;
  if (mine !== seq) return;
  const launches = acct?.launches || [];
  const chains = [...new Set(launches.map(L => L.chainId))];
  const ex = (chains.length ? chains : ['8453']).filter(c => EXPLORER[c]);
  const hasElysiumContext=who!==ZERO&&social&&social.legacyAvailable!==false&&Array.isArray(social.posts)&&social.posts.some(post=>post?.kind==='post'&&!post.hidden&&String(post.author||'').toLowerCase()===who&&isElysiumDiscussion(post.board));
  const elysiumWalletLink=hasElysiumContext?h('a',{href:elysiumAddressUrl(who),target:'_blank',rel:'noopener noreferrer',title:'Elysium · wallet address '+who,'aria-label':'View wallet address '+who+' on ElysScan (Elysium)'},'Elysium (ElysScan) ↗'):null;
  $('qp-explorers').replaceChildren('Wallet on ', ...ex.flatMap((c, i) => [i ? ' · ' : '', h('a', { href: EXPLORER[c] + '/address/' + who, target: '_blank', rel: 'noopener noreferrer' }, (CHAIN_NAME[c] || c) + ' ↗')]),...(elysiumWalletLink?[ex.length?' · ':'',elysiumWalletLink]:[]));
  $('qp-explorers').hidden = false;
  const first = launches.reduce((m, L) => Math.min(m, L.listedAt || Infinity), Infinity);
  const holdingRows=value=>(value?.positions||[]).filter(p=>p.balance>0).sort((a,b)=>b.balance*b.price-a.balance*a.price);
  const holdingTileFor=value=>tile('Holdings',member?.profile.shareHoldings?value?String(holdingRows(value).length):'Unavailable':'Not shared',member?.profile.shareHoldings?'QHooks index only':'chosen by the wallet owner');
  let holdingTile=holdingTileFor(held),holdingPanel;
  const retryHoldings=async()=>{const next=memberHoldingsObservation(await get('/api/terminal/wallet/'+who),who);if(mine!==seq)return;held=next;const nextTile=holdingTileFor(next),nextPanel=holdingsSection(holdingRows(next),true,next,retryHoldings);holdingTile.replaceWith(nextTile);holdingTile=nextTile;holdingPanel.replaceWith(nextPanel);holdingPanel=nextPanel;};
  holdingPanel=holdingsSection(holdingRows(held),member?.profile.shareHoldings,held,retryHoldings);
  const socialReadable=social&&social.legacyAvailable!==false;
  const posts = socialReadable?social.posts||[]:[];
  $('qp-tiles').replaceChildren(tile('Launches', acct?String(launches.length):'Unavailable', launches.length ? launches.filter(L => L.live).length + ' listed now' : 'created by this wallet'),
    holdingTile,
    tile('Board posts', socialReadable?String(posts.length >= 20 ? '20+' : posts.length):'Unavailable', social?.boards ? 'on ' + social.boards + ' board' + (social.boards === 1 ? '' : 's') : 'none yet'),
    tile('First launch', launches.length ? day(first) : '—'));
  const extra = [!member?h('p',{class:'qa-empty'},'Profile details could not be read. Holdings stay hidden.'):null,!acct?h('p',{class:'qa-empty'},'The launch directory did not answer. Calls and profile details are still shown below.'):null,badgeSection(launches, social), callsSection(caller, social?.callStats), holdingPanel, postsSection(posts)].filter(Boolean);
  if (!launches.length) {
    $('qp-root').replaceChildren(...extra, h('section', { class: 'qa-section' }, h('div', { class: 'qa-section-head' }, h('h2', {}, 'Launches')),
      h('p', { class: 'qa-empty' }, acct?'No launches from this wallet. Launches show up here once they are listed on QHooks Markets; only the wallet that created a launch counts as its creator.':'Launches are unavailable right now. Retry this profile in a moment.')));
    return;
  }
  // Trust layer: verified X handles (per launch, signed by this wallet) and copy-of labels.
  const trust = await import('/qx-trust.mjs').catch(() => null), T = new Map();
  if (trust) try {
    const [tv, list] = await Promise.all([fetch('/api/trust/creator/' + who, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null), trust.trustList()]);
    const seen = new Set(), badges = [];
    for (const v of tv?.launches || []) {
      const k = v.chainId + ':' + String(v.controller).toLowerCase();
      T.set(k, { badge: trust.badge(v, { compact: true }) });
      if (v.handle && !seen.has(v.handle)) { seen.add(v.handle); const b = trust.badge(v); if (b) badges.push(b); }
    }
    for (const L of launches) { const k = L.chainId + ':' + L.controller.toLowerCase(), c = list?.[k]?.copyOf; if (c) T.set(k, { ...(T.get(k) || {}), copy: trust.copyLabel(c, { compact: true }) }); }
    if (mine === seq) $('qp-verified').replaceChildren(...badges);
  } catch { /* labels only */ }
  const cards = await Promise.all(launches.map(L => launchCard(L, T.get(L.chainId + ':' + L.controller.toLowerCase()))));
  if (mine !== seq) return;
  $('qp-root').replaceChildren(...extra, h('section', { class: 'qa-section', 'aria-labelledby': 'qp-launches-h' },
    h('div', { class: 'qa-section-head' }, h('h2', { id: 'qp-launches-h' }, 'Launches'), h('p', {}, 'Newest first. Each launch’s rules are fixed at launch and readable on chain; the terminal shows them before you trade.')),
    ...cards));
}

// ---- Holdings, badges and board posts (any wallet) ----
const sym = s => '$' + String(s || '?').replace(/^\$/, '');
const amount = n => n >= 1e6 ? (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k' : n >= 1 ? n.toFixed(2).replace(/\.?0+$/, '') : n.toPrecision(3);
function badgeSection(launches, social) {
  const b = social?.badges || {}, pill = (cls, text, href, title) => h('a', { class: 'qb-badge ' + cls, href, title }, text);
  const key = boardPath;
  const pills = [
    ...launches.filter(L => L.live).map(L => pill('is-creator', 'Creator of ' + sym(L.symbol), '/terminal#m=' + L.chainId + ':' + L.controller, 'Created this launch')),
    ...(b.early || []).map(x => pill('is-early', 'Early buyer of ' + sym(x.symbol), key(x), 'Among the first 25 buyers, as stamped on a board post')),
    ...(b.staker || []).map(x => pill('is-staker', 'Staker of ' + sym(x.symbol), key(x), 'Had tokens staked when posting')),
    ...(b.holder || []).map(x => pill('is-holder', 'Holder of ' + sym(x.symbol), key(x), 'Held the token when posting'))];
  if (!pills.length) return null;
  return h('section', { class: 'qa-section', 'aria-labelledby': 'qp-badges-h' }, h('div', { class: 'qa-section-head' }, h('h2', { id: 'qp-badges-h' }, 'Badges'),
    h('p', {}, 'Read from the chain: launches this wallet created, and what it held when it posted on a board.')), h('div', { class: 'qb-badgeset' }, ...pills));
}
function holdingsSection(rows,shared,observed,retry) {
  if(!shared)return h('section',{class:'qa-section'},h('h2',{},'Holdings'),h('p',{class:'qa-empty'},'This profile does not share its holdings. Public calls and launches stay on record.'));
  if(!observed){const button=h('button',{type:'button',class:'qa-btn'},'Retry holdings'),note=h('p',{class:'qa-empty',role:'status'},'The holdings index is unavailable. This is not a zero balance.');button.addEventListener('click',async()=>{button.disabled=true;note.textContent='Reading shared holdings…';try{await retry?.();}catch{note.textContent='The holdings index is unavailable. This is not a zero balance.';}finally{button.disabled=false;}});return h('section',{class:'qa-section'},h('h2',{},'Shared holdings'),note,button);}
  if (!rows.length) return h('section',{class:'qa-section'},h('h2',{},'Shared holdings'),h('p',{class:'qa-empty'},'No current QHooks holdings were returned by the index. Other tokens and trade history are not included.'));
  return h('section', { class: 'qa-section', 'aria-labelledby': 'qp-hold-h' }, h('div', { class: 'qa-section-head' }, h('h2', { id: 'qp-hold-h' }, 'Holdings'),
    h('p', {}, 'Shared by this wallet’s owner. Current indexed EVM holdings on QHooks; other tokens, trade history and profit and loss are not included.')),
    h('div', { class: 'qa-table' }, h('div', { class: 'qa-tr qa-th' }, h('span', {}, 'Token'), h('span', {}, 'Chain'), h('span', {}, 'Balance'), h('span', {}, 'Value'), h('span', {}, '')),
      ...rows.map(p => h('div', { class: 'qa-tr' }, h('span', {}, h('a', { href: '/terminal#m=' + p.chainId + ':' + p.controller }, sym(p.symbol))), h('span', {}, CHAIN_NAME[p.chainId] || p.chainId),
        h('span', {}, amount(p.balance)), h('span', {}, p.price ? '≈ ' + amount(p.balance * p.price) + ' ' + (p.quoteSymbol || '') : '—'),
        h('span', {}, h('a', { href: '/board#m=' + p.chainId + ':' + p.controller }, 'Board'))))));
}
function callMarketLink(board,post) {
  try {
    const href=callLinks(board,post).trade,chain=board.chainId==='solana'?'Solana':CHAIN_NAME[board.chainId]||'Chain '+board.chainId;
    const identity=board.kind==='launch'?board.controller:board.address,kind=board.kind==='launch'?'launch':'token';
    return h('a',{class:'qmp-thanks-link',href,title:chain+' · '+kind+' '+identity,'aria-label':'Open '+sym(board.symbol)+' market on '+chain+', '+kind+' '+identity},'Open market · '+chain+' · '+short(identity)+' ↗');
  } catch { return null; }
}
function callsSection(caller, fallbackStats) {
  const stats = caller?.stats || fallbackStats, calls = caller?.calls || [];
  const confirmedEmpty=confirmedEmptyCalls(caller,fallbackStats);
  const recordsKnown=stats?.sample?.total>0||stats?.sample?.loaded>0||stats?.calls>0;
  const line=stats?.version===2?scoreHeadline(stats):'The versioned call record did not answer. Try again in a moment.';
  return h('section', { class: 'qa-section', 'aria-labelledby': 'qp-calls-h' }, h('div', { class: 'qa-section-head' }, h('h2', { id: 'qp-calls-h' }, 'Calls'),h('a',{class:'qmp-thanks-link',href:'/community#make-a-call'},'Make your own call →'),confirmedEmpty?null:h('p', { class: 'qb-call-stats' }, line)),!confirmedEmpty&&stats?.version===2?h('p',{class:'qmp-score-coverage'},scoreCoverageText(stats)):null,!confirmedEmpty&&stats?.version===2?h('p',{class:'qmp-score-coverage'},'Median 24h/7d move '+qualityText(stats.quality)+' · '+numCalls(stats.qualityN)+' completed calls'):null,callerMethodElement(document),
    ...(calls.length ? calls.map(p => {
      const c=p.call||{},b=p.board||{},labels=callLabelPills({...c,boardKind:b.kind}),point=checkpointView(c,'day'),change=point.status==='observed'?moveText(point.price,c.price):point.note,direction=point.status!=='observed'?'':point.price>c.price?' is-up':point.price<c.price?' is-down':'';
      const thanks=mountProfileCallThanks(p,{hub,sessions:profileSessions,document});if(thanks)profileControls.push(thanks);
      return h('article', { class: 'qb-callline' }, h('div', { class: 'qb-postline-head' }, h('a', { class: 'qb-board-name', href: boardPath(b) }, b.kind === 'token' ? boardIcon(b) : null, sym(b.symbol)),
        h('time', { datetime: new Date(c.at || p.createdAt).toISOString() }, day(c.at || p.createdAt))),
        h('div', { class: 'qb-callline-prices' }, h('span', {}, 'Entry '+priceText(c.price) + ' · latest source quote ' + priceText(c.priceNow) + ' ' + (c.quoteSymbol || '')), h('span', { class: 'qb-call-result' + direction,title:point.note }, point.label+' '+change)),
        point.status==='observed'?h('p',{class:'qmp-score-coverage'},h('time',{datetime:new Date(point.observedAt).toISOString()},point.note),' · ',EXPLORER[b.chainId]?h('a',{href:EXPLORER[b.chainId]+'/tx/'+point.provenance.transaction,target:'_blank',rel:'noopener noreferrer'},'Block '+point.provenance.block+' ↗'):'Block '+point.provenance.block):null,
        labels.length ? h('div', { class: 'qb-call-labels' }, ...labels) : null,
        p.text ? h('p', { class: 'qb-call-thesis' }, p.text) : null, h('div',{class:'qa-actions'},h('a',{class:'qmp-thanks-link',href:'/call/'+p.id},'Read call →'),callMarketLink(b,p),thanks?.element));
    }) : [h('p', { class: 'qa-empty' }, confirmedEmpty ? 'No calls from this wallet yet. Choose a token to make your own call.' : recordsKnown?'Call records exist, but their public details are unavailable in this view.':'Calls couldn’t be read just now.')]));
}
async function loadSolanaProfile(identity,mine){
  const {key,address}=identity;$('qp-input').value=address;$('qp-title').textContent=short(address);$('qp-full').textContent=address;$('qp-addr').hidden=false;$('qp-verified').replaceChildren();$('qp-avatar').replaceChildren();$('qp-member-identity').replaceChildren();$('qp-tiles').replaceChildren();
  paintAvatar($('qp-avatar'),key);$('qp-avatar').classList.add('is-set');document.title=short(address)+' | Solana profile | QHooks';if(shownMember?.wallet===key)showMemberHeader(shownMember);
  $('qp-explorers').replaceChildren('Wallet on ',h('a',{href:'https://solscan.io/account/'+address,target:'_blank',rel:'noopener noreferrer'},'Solana (Solscan) ↗'));$('qp-explorers').hidden=false;
  $('qp-root').replaceChildren(h('p',{class:'qa-loading'},'Reading this Solana profile…'));void prepareSolProfileEditor(key,mine);
  $('qp-hint').textContent='Solana profile. Name, picture and bio are public when saved. Holdings and trade history are not shared.';
  const accountsRevision=linkedRevision;let member=null,error=null;try{member=await memberClient.read(key);if(accountsRevision!==linkedRevision&&shownMember?.wallet===key)member={...member,accounts:shownMember.accounts};}catch(value){error=value;}
  if(mine!==seq)return;
  if(member)showMemberHeader(member);
  const note=h('section',{class:'qa-section'},h('h2',{},'Join the community'),h('p',{},'Explore token discussions and caller records. Posting, signed calls and sending thanks currently require an EVM wallet.'),h('div',{class:'qa-actions'},h('a',{class:'qa-btn',href:'/community#boards'},'Explore discussions →'),h('a',{class:'qa-btn',href:'/community#callers'},'Discover callers →')));
  if(error){const retry=h('button',{type:'button',class:'qa-btn'},'Retry profile');retry.addEventListener('click',()=>load());note.prepend(h('p',{role:'status'},'This Solana profile could not be read. '+error.message),retry);}
  else if(!member?.profile.name&&!member?.profile.bio&&!member?.profile.image)note.prepend(h('p',{class:'qa-empty'},'This wallet has not added a public name, picture or bio yet.'));
  $('qp-root').replaceChildren(note);
}
const numCalls = n => Number(n || 0).toLocaleString();
function postsSection(posts) {
  if (!posts.length) return null;
  const when = ms => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return h('section', { class: 'qa-section', 'aria-labelledby': 'qp-posts-h' }, h('div', { class: 'qa-section-head' }, h('h2', { id: 'qp-posts-h' }, 'Recent posts'), h('p', {}, 'On QHooks community boards, newest first.')),
    ...posts.slice(0, 8).map(p => h('a', { class: 'qb-postline', href: isElysiumDiscussion(p.board)?discussionPath(p.board,p):boardPath(p.board) },
      h('span', { class: 'qb-postline-head' }, p.board.kind === 'token' ? boardIcon(p.board) : null, h('b', {}, isElysiumDiscussion(p.board)&&!p.board.symbol?short(p.board.address):sym(p.board.symbol)),isElysiumDiscussion(p.board)?'Elysium · ':null,p.kind === 'call' ? 'Call' : p.kind === 'announcement' ? 'Announcement' : p.replyTo ? 'Reply' : 'Post', ' · ', when(p.createdAt)),
      h('p', {}, p.text || ''))));
}

$('qp-find').addEventListener('submit', e => {e.preventDefault();const value=$('qp-input').value.trim(),identity=memberWallet(value,{allowBareSolana:true}),handle=normalizeProfileHandle(value);if(identity)navigateProfile({wallet:identity.key});else if(handle)navigateProfile({handle});else $('qp-hint').textContent='Enter a profile name or a full EVM or Solana wallet address.';});
const copy = async(text,btn,done)=>{try{if(!navigator.clipboard?.writeText)throw Error('clipboard');await navigator.clipboard.writeText(text);const previous=btn.textContent;btn.textContent=done;setTimeout(()=>btn.textContent=previous,1400);}catch{$('qp-hint').textContent='Select and copy: '+text;}};
$('qp-copy').addEventListener('click', e => copy($('qp-full').textContent, e.currentTarget, 'Copied'));
$('qp-share').addEventListener('click', e => copy(location.origin + profileUrl({wallet:viewedProfileKey||$('qp-full').textContent,handle:shownMember?.handle}), e.currentTarget, 'Link copied'));
function navigateProfile(value){history.pushState(null,'',profileUrl(value));window.dispatchEvent(new CustomEvent('qhooks:profile-address'));void load();}
addEventListener('hashchange',()=>void load());
addEventListener('popstate',()=>void load());
load();
