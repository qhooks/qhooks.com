import {mountCommunityActivity} from '/qx-community-activity.mjs';
import {mountCommunityPicker} from '/qx-community-intent.mjs';
import {mountCallerRankings} from './qx-community-empty.mjs';
const picker=document.getElementById('cx-token-picker');if(picker)mountCommunityPicker(picker);
const activityHost=document.getElementById('cx-community-activity'),activity=activityHost?mountCommunityActivity(activityHost,{initialView:location.hash==='#following'?'following':'recent'}):null;
addEventListener('hashchange',()=>{if(location.hash==='#following')activity?.selectView('following');else if(location.hash==='#recent-calls')activity?.selectView('recent');});
// Community page: the changelog card appears once the trust layer's /changelog is live.
const card = document.getElementById('cx-changelog');
if (card) fetch('/changelog', { method: 'HEAD', cache: 'no-store' }).then(r => { if (r.ok) card.hidden = false; }).catch(() => {});
// Boards with posts, most recent first (/api/community/boards). Real counts only; nothing shows until a board has posts.
const list = document.getElementById('cx-board-list');
if (list) {
  if (!document.querySelector('link[href="/qx-board.css"]')) document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: '/qx-board.css' }));
  import('/qx-board-rows.mjs').then(m => list.replaceWith(m.boardTabs({ limit: 6 })))
    .catch(() => { list.replaceChildren(Object.assign(document.createElement('p'), { className: 'qa-empty', textContent: 'The boards didn’t answer. Try again in a moment.' })); });
}
// Keep the existing generated page useful until the source template is rebuilt.
let callers = document.getElementById('cx-caller-list');
if (!callers && list) {
  const make = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls, ...(text ? { textContent: text } : {}) });
  const section = make('section', 'cx-sec'), head = make('div', 'cx-sec-head'), title = make('h2', 'cx-h2', 'Callers.');
  section.id = 'callers'; section.setAttribute('aria-labelledby', 'cx-callers'); title.id = 'cx-callers';
  head.append(title, make('p', '', "Caller record v2 ranks observed 24h outcomes. Each row shows its sample and missing coverage; indexed sales never erase outcomes."));
  callers = make('div', 'qb-callers'); callers.id = 'cx-caller-list'; callers.append(make('p', 'qa-empty', 'Reading callers…'));
  section.append(head, callers); list.closest('section').after(section);
}
if (callers) {
  if (!document.querySelector('link[href="/qx-board.css"]')) document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: '/qx-board.css' }));
  let note=document.getElementById('cx-ranking-note');if(!note){note=document.createElement('p');note.id='cx-ranking-note';note.className='qa-empty';callers.before(note);}
  const rankings=mountCallerRankings(callers,note);addEventListener('pagehide',()=>rankings.dispose(),{once:true});
}
// Links to /community#boards or #callers land on the section once it has filled in (it loads after the page).
if (/^#(boards|callers|make-a-call)$/.test(location.hash)) addEventListener('load', () => setTimeout(() => document.querySelector(location.hash)?.scrollIntoView({ block: 'start' }), 600));
