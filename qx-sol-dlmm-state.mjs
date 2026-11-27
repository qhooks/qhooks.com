// Public position preferences only. Never store wallet keys or transaction/signature material.
const shapes=new Set(['spot','curve','bidask']);
export function positionPreferences(storage,owner,position){try{const p=JSON.parse(storage.getItem('qhooks:dlmm:'+owner+':'+position));return {shape:shapes.has(p?.shape)?p.shape:null,lastRebalance:Number.isSafeInteger(p?.lastRebalance)&&p.lastRebalance>0?p.lastRebalance:null};}catch{return {shape:null,lastRebalance:null};}}
export function savePositionPreferences(storage,owner,summary,{now=Date.now()}={}){if(!shapes.has(summary.shape))return;try{storage.setItem('qhooks:dlmm:'+owner+':'+summary.position,JSON.stringify({shape:summary.shape,lastRebalance:summary.previousPosition?now:null}));}catch{}}
export function reviewGate(){let generation=0;return {begin:()=>++generation,cancel:()=>{generation++;},current:ticket=>ticket===generation};}

export function formatDlmmUnits(raw,decimals){if(!Number.isInteger(decimals)||decimals<0||decimals>18||!/^\d+$/.test(String(raw)))return String(raw)+' base units';const s=String(raw).padStart(decimals+1,'0');return decimals?(s.slice(0,-decimals)+'.'+s.slice(-decimals)).replace(/\.?0+$/,''):s;}
