// Profile handles are public addresses; wallets remain the owner identity.
import {BUILT} from './chains.mjs';
export const QHOOKS_HANDLE_WALLET='0xaf48a5ab32ef96ee7a72ed6ed4534be1bc928c73';
export const normalizeProfileHandle=value=>typeof value==='string'&&/^[a-z0-9_]{3,24}$/i.test(value)?value.toLowerCase():null;
export const slugProfileHandle=name=>typeof name==='string'?normalizeProfileHandle(name.toLowerCase().replace(/[\s-]+/g,'_').replace(/[^a-z0-9_]/g,'').slice(0,24)):null;
const reserved=new Set(['qhooks','qhook','official','admin','support','team','help','api','profile','profiles','settings','me','wallet','founding','launch','create','terminal','trade','hooks','boards','community','proof','solana']);
for(const chain of BUILT)for(const value of [chain.id,chain.key,chain.name,chain.short]){
 const plain=String(value||'').toLowerCase();reserved.add(plain);const slug=slugProfileHandle(plain);if(slug)reserved.add(slug);
}
export const isReservedProfileHandle=(handle,wallet)=>reserved.has(String(handle).toLowerCase())&&!(String(handle).toLowerCase()==='qhooks'&&String(wallet).toLowerCase()===QHOOKS_HANDLE_WALLET);
