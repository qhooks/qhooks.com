export const POST_LIMIT=3000,POST_PREVIEW=140;
export function tokenPostText(value){
 if(typeof value!=='string'||!value.isWellFormed()||[...value].length>POST_LIMIT||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(value))throw Error('Use up to 3,000 characters.');
 const text=value.normalize('NFKC').trim();if(!text||text.split('\n').length>40||[...text].length>POST_LIMIT)throw Error('Use 1 to 3,000 characters.');return text;
}
export function tokenPostMarket(value){
 const chainId=String(value?.chainId||''),sol=chainId==='solana',address=sol?/^[1-9A-HJ-NP-Za-km-z]{32,44}$/:/^0x[0-9a-f]{40}$/i;
 let token=String(value?.token||''),owner=String(value?.owner||'').replace(/^solana:/,'');if((!sol&&!/^\d{1,8}$/.test(chainId))||!address.test(token)||!address.test(owner))throw Error('A matching token and wallet are required.');
 if(!sol){token=token.toLowerCase();owner=owner.toLowerCase();}return {chainId,token,owner};
}
export function buyPostContext(value){
 const c=tokenPostMarket(value),sol=c.chainId==='solana',hash=sol?/^[1-9A-HJ-NP-Za-km-z]{64,90}$/:/^0x[0-9a-f]{64}$/i;let tx=String(value?.tx||'');if(!hash.test(tx))throw Error('A matching buy receipt is required.');if(!sol)tx=tx.toLowerCase();
 return {...c,tx,...(typeof value.requestId==='string'&&value.requestId.length<=160?{requestId:value.requestId}:{}),key:c.chainId+':'+tx+':'+c.owner};
}
export function holdingPostContext(value){const nonce=String(value?.nonce||'');if(!/^[a-f0-9]{32}$/.test(nonce))throw Error('A post id is required.');const c=tokenPostMarket(value);return {...c,mode:'holding',nonce,tx:'holding:'+nonce,key:'holding:'+c.chainId+':'+c.owner+':'+nonce};}
export const tokenPostContext=value=>value?.mode==='holding'?holdingPostContext(value):buyPostContext(value);
export function previewPost(text){const chars=[...String(text||'')];return {text:chars.slice(0,POST_PREVIEW).join(''),more:chars.length>POST_PREVIEW};}
