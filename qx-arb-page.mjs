// /arb: QHooks Arb. Scans every reviewed Robinhood route in the browser (real fee fields) and offers one button per gap;
// Contract facts stay unknown until a single live model has been verified.
import {getWalletHub} from '/wallet-hub-fresh.mjs';
import {createArbClient} from '/qx-arb-open.mjs';
import {chainById} from '/chains.mjs';
import {loadVerifiedArbRoutes,arbContractCopy} from './qx-arb-contract-state.mjs';
import {renderArbList} from '/qx-arb-gap-panel.mjs';
const root = document.getElementById('qxa-root'), hub = getWalletHub(window);
const el = (t, a = {}, ...k) => { const n = document.createElement(t); for (const [x, v] of Object.entries(a)) n.setAttribute(x, v); n.append(...k); return n; };
const client=createArbClient({chainId:'4663'});
const list = el('div'), status = el('p', {role: 'status', class: 'qxa-status'}), btn = el('button', {type: 'button', class: 'qtx-mini qas-go'}, 'Scan routes'),retry=el('button',{type:'button',class:'qa-btn'},'Retry contract check');
let d=null,busy = false, gaps = [], ctl = null,loadController=null,disposed=false;
const say = t => { status.textContent = t; };
async function initialize(){
 loadController?.abort();const checking=loadController=new AbortController();d=null;btn.disabled=true;btn.hidden=true;retry.hidden=true;root.setAttribute('aria-busy','true');say('Checking the live contract…');
 try{const next=await loadVerifiedArbRoutes({rpc:chainById('4663').rpc,signal:checking.signal});if(disposed||checking!==loadController)return;
  const copy=arbContractCopy(next);for(const node of document.querySelectorAll('[data-arb-contract]'))node.textContent=({summary:copy.summary,terms:copy.terms,executor:next.executor,hookList:next.hookList,abi:next.abi})[node.dataset.arbContract];
  d=next;btn.textContent='Scan all '+d.routes.length+' routes';btn.hidden=false;btn.disabled=false;say('Contract checked. Scan to find a gap.');
 }catch{if(disposed||checking!==loadController)return;
  for(const node of document.querySelectorAll('[data-arb-contract]'))node.textContent=node.dataset.arbContract==='summary'?'Contract details unavailable':node.dataset.arbContract==='terms'?'Check the live contract to see its split.':'Not verified';
  say('Could not verify the live contract. Retry to check again.');retry.hidden=false;}
 finally{if(checking===loadController)root.setAttribute('aria-busy','false');}
}
async function scan() {
  if (busy||!d) return; busy = true; btn.disabled = true; ctl = new AbortController();
  try { gaps = await client.scan(d.routes, d.executor, {from: hub.snapshot().current?.owner, signal: ctl.signal,
    onProgress: (n, t, found) => { say('Checked ' + n + ' of ' + t + ' routes · ' + found.length + ' gap' + (found.length === 1 ? '' : 's') + ' so far'); renderArbList(list, found, run, true); }});
    say('Checked all ' + d.routes.length + ' routes at ' + new Date().toLocaleTimeString() + '.');
  } catch (e) { say(e.message); }
  busy = false; btn.disabled = false; renderArbList(list, gaps, run, false);
}
async function run(g) {
  if(!d)return;
  const conn = hub.snapshot().current; if (!conn) { hub.open(); return; } if (busy) return; busy = true; renderArbList(list, gaps, run, true);
  try { if (conn.chainId !== '4663') { const c2 = await hub.switchChain('4663'); if (c2?.chainId !== '4663') throw Error('Switch your wallet to Robinhood Chain, then try again.'); }
    const r = await client.run(hub.snapshot().current, d.executor, g, {say});
    say(r.ok ? 'Done: the gap is closed.' : r.ok === false ? 'The gap was gone before it landed; the trade cancelled itself (only gas was spent).' : 'Still pending. Check your wallet activity.');
    gaps = gaps.filter(x => x !== g);
  } catch (e) { say(/reject|denied|cancel/i.test(e?.message || '') ? 'Cancelled in your wallet. Nothing was sent.' : e.message); }
  busy = false; renderArbList(list, gaps, run, false);
}
btn.addEventListener('click', scan);
retry.addEventListener('click',initialize);
root.replaceChildren(btn,retry,status,list);
addEventListener('pagehide',()=>{disposed=true;loadController?.abort();ctl?.abort();},{once:true});
void initialize();
