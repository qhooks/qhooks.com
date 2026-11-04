// Carry the selected launch chain to a separate designer tab without touching launch state.
import {selectedLaunchChain} from './l141-lab-export-route.mjs';
export function bindQTokenDesignLink({document:d=document,target=window}={}){
 const link=d.getElementById('l162-design-qtoken'),chain=d.getElementById('ql-chain');
 if(!link||!chain)return Object.freeze({dispose(){}});
 try{selectedLaunchChain(target.location.search||'');}catch{link.hidden=true;return Object.freeze({blocked:true,dispose(){}});}
 const sync=()=>{try{const id=selectedLaunchChain('?chain='+encodeURIComponent(chain.value));link.href='qtoken-studio.html?chain='+encodeURIComponent(id);link.hidden=false;}catch{link.hidden=true;link.removeAttribute('href');}};
 const click=event=>{sync();if(link.hidden)event.preventDefault();};
 chain.addEventListener('change',sync);link.addEventListener('click',click);sync();
 return Object.freeze({dispose(){chain.removeEventListener('change',sync);link.removeEventListener('click',click);}});
}
if(typeof document!=='undefined')bindQTokenDesignLink();
