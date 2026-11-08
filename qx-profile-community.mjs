import {mountCommunityFollowButton} from './qx-community-follow.mjs';
import {mountCallThanks} from './qx-community-thanks.mjs';

export function confirmedEmptyCalls(caller,fallbackStats){
  const stats=caller?.stats||fallbackStats,calls=caller?.calls||[];
  return !calls.length&&stats?.version===2&&stats.coverage?.completeRecordSet===true&&stats.sample?.total===0;
}

// Reuse device-local follows. This never subscribes a wallet or creates a social graph.
export function mountProfileCallerActions(target,{wallet,label='',hub,document:doc=globalThis.document,events=globalThis.window,following,caller,fallbackStats}={}){
  const follow=doc.createElement('span'),feed=doc.createElement('a');
  target.classList.add('qmp-profile-actions');feed.setAttribute('href','/community#following');feed.className='qmp-thanks-link';feed.textContent='Open your Following feed →';
  target.append(follow,feed);
  const control=mountCommunityFollowButton(follow,{kind:'caller',wallet,label},{document:doc,events,noun:confirmedEmptyCalls(caller,fallbackStats)?'':'caller',...(following?{store:following}:{})});
  control.button.classList.add('qa-btn');
  const stop=hub.subscribe(snapshot=>{follow.hidden=snapshot.current?.owner?.toLowerCase()===wallet;});
  return{update(caller,fallbackStats){control.setNoun(confirmedEmptyCalls(caller,fallbackStats)?'':'caller');},dispose(){stop();control.dispose();}};
}

// Counts are read only when this call's disclosure opens. Sending thanks remains
// a separate explicit action through the existing session/ownership controls.
export function mountProfileCallThanks(post,{hub,sessions,document:doc=globalThis.document,client}={}){
  if(post.hidden||!/^p[0-9a-v]{12}$/.test(post.id||'')||!/^0x[0-9a-f]{40}$/i.test(post.author||''))return null;
  const details=doc.createElement('details'),summary=doc.createElement('summary'),body=doc.createElement('div'),help=doc.createElement('p'),own=doc.createElement('p'),host=doc.createElement('span');
  details.className='qmp-call-thanks';summary.textContent='Say thanks';body.className='qmp-call-thanks-body';help.textContent='A free, reversible thank-you for this call. No funds move, and caller rank stays unchanged.';own.className='qmp-thanks-own';host.className='qb-thanks-wrap';
  body.append(help,own,host);details.append(summary,body);
  let control=null,disposed=false,stop=()=>{};
  const author=post.author.toLowerCase();
  const toggle=()=>{
    if(disposed||!details.open||control||!details.isConnected)return;
    control=mountCallThanks(host,{id:post.id,author,hub,sessions,document:doc,...(client?{client}:{})});
    stop=hub.subscribe(snapshot=>{const isOwn=snapshot.current?.owner?.toLowerCase()===author;own.hidden=!isOwn;own.textContent=isOwn?'You made this call. Other wallets can thank you.':'';});
  };
  details.addEventListener('toggle',toggle);
  return{element:details,dispose(){disposed=true;details.removeEventListener('toggle',toggle);stop();control?.dispose();}};
}
