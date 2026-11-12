const ID=/^p[0-9a-v]{12}$/;
export function createCallThanksClient({fetcher=(...args)=>globalThis.fetch(...args)}={}){
 return{async request(id,{auth={},on,connection,signal}={}){
  if(!ID.test(id||''))throw Error('This call record is invalid.');const writing=typeof on==='boolean';
  if(writing){if(!auth.authorization||!connection)throw Error('Sign in before sending thanks.');await connection.check();connection.assertCurrent();}
  const response=await fetcher('/api/community/post/'+id+'/thanks',{cache:'no-store',credentials:'omit',redirect:'error',...(signal?{signal}:{}),...(writing?{method:'POST',headers:{'content-type':'application/json',...auth},body:JSON.stringify({on})}:{headers:auth})});
  if(writing)connection.assertCurrent();const body=await response.json().catch(()=>null);
  if(!response.ok)throw Error(({sign_in:'Sign in with this wallet again.',own_call:'You cannot thank your own call.',no_such_call:'This call is no longer public.',slow_down:'Too many changes. Try again later.'})[body?.error]||'Thanks could not be read or saved. Try again.');
  if(body?.version!==1||body.id!==id||!Number.isSafeInteger(body.count)||body.count<0||typeof body.mine!=='boolean'||!/^0x[0-9a-f]{40}$/.test(body.author||''))throw Error('The thanks response did not match this call.');
  return body;
 }};
}
export function mountCallThanks(target,{id,author,hub,sessions,client=createCallThanksClient(),document:doc=globalThis.document}={}){
 const auth=sessions.createBoardSession({getConnection:()=>hub.snapshot().current}),button=doc.createElement('button'),status=doc.createElement('span');button.type='button';button.className='qb-react qb-thanks';button.textContent='Thank caller';button.setAttribute('aria-pressed','false');button.title='A free thank-you for this call. Does not affect caller rank.';status.className='qb-thanks-status';status.setAttribute('role','status');target.append(button,status);
 let body=null,disposed=false,busy=false,readRevision=0,operation=0,readController=null,stop=()=>{};
 const owner=()=>hub.snapshot().current?.owner?.toLowerCase()||null;
 let lastOwner=owner();
 function render(){if(disposed)return;const mine=body?.viewer===owner()&&body?.mine;button.textContent=(mine?'Thanked':'Thank caller')+(body?' · '+body.count:'');button.setAttribute('aria-pressed',String(!!mine));button.disabled=busy||owner()===author;}
 function invalidateRead(){readRevision++;readController?.abort();readController=null;}
 async function refresh(){if(disposed)return;invalidateRead();const mine=readRevision,who=owner(),controller=new AbortController();readController=controller;
  try{const result=await client.request(id,{auth:auth.authHeaders(),signal:controller.signal});if(disposed||mine!==readRevision||target.isConnected===false||who!==owner())return;if(result.author!==author)throw Error('The call author changed. Reload the board.');body=result;render();}catch(error){if(!disposed&&mine===readRevision&&who===owner()&&target.isConnected!==false&&error.name!=='AbortError')status.textContent='Thanks count refreshing.';}finally{if(readController===controller)readController=null;}
 }
 const click=async()=>{if(button.disabled||disposed)return;invalidateRead();const who=owner(),mine=++operation;busy=true;render();const active=()=>!disposed&&mine===operation&&owner()===who&&target.isConnected!==false;
  try{if(!who){hub.open();if(active())status.textContent='Connect a wallet to thank this caller.';return;}if(who===author)throw Error('You cannot thank your own call.');
   const connection=auth.capture();await connection.check();if(!active())return;if(!auth.boardSession()){status.textContent='Sign in with a free message. No funds move.';await auth.signIn(connection);if(active())status.textContent='Signed in. Press Thank caller to send your thanks.';return;}
   const thanked=body?.viewer===who&&body?.mine;const result=await client.request(id,{auth:auth.authHeaders(),on:!thanked,connection});if(!active())return;if(result.author!==author)throw Error('The call author changed. Reload the board.');body=result;status.textContent=result.mine?'Thanks sent. Caller rank is unchanged.':'Thanks removed.';
  }catch(error){if(active())status.textContent=error.message;}finally{if(active()){busy=false;render();}}
 };
 function dispose(){if(disposed)return;disposed=true;operation++;invalidateRead();stop();button.removeEventListener('click',click);}
 button.addEventListener('click',click);
 stop=hub.subscribe(()=>{if(disposed)return;if(target.isConnected===false){dispose();return;}const who=owner();if(who!==lastOwner){lastOwner=who;operation++;busy=false;invalidateRead();status.textContent='';render();void refresh();}else render();});
 render();void refresh();return{refresh,dispose,button,status};
}
// Cards are built detached and connected together; clean up after that render turn.
const boardControls=new Map();
export async function mountBoardCallThanks(target,post){
 const previous=boardControls.get(target);previous?.control?.dispose();const entry={target,control:null};boardControls.set(target,entry);
 try{const[wallet,sessions]=await Promise.all([import('./wallet-hub.mjs'),import('./qx-board-session.mjs')]);
  for(const[key,item]of boardControls)if(item.target.isConnected===false){item.control?.dispose();boardControls.delete(key);}
  if(boardControls.get(target)!==entry)return null;entry.control=mountCallThanks(target,{...post,hub:wallet.getWalletHub(window),sessions});return entry.control;
 }catch{if(boardControls.get(target)===entry)boardControls.delete(target);return null;}
}
