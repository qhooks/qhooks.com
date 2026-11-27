// Generated from server signing primitives; never sends or signs wallet messages.
const enc=new TextEncoder();
function canonical(v) {return JSON.stringify(v,(_,x)=> x && typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);}
async function digest(s) {return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),v=>v.toString(16).padStart(2,'0')).join('');}
export function webhookMessage(a) {
 return 'QHooks agent webhook v1\n'+canonical({wallet:a.wallet?.toLowerCase(),url:a.url,events:a.events,secretHash:a.secretHash,nonce:a.nonce,issuedAt:a.issuedAt});
}
export async function hmac(secret,text) {
 const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(text))),v=>v.toString(16).padStart(2,'0')).join('');
}
export async function prepareWebhook({wallet,url,events,secret,nonce,issuedAt=Date.now()}){const a={wallet,url,events,secret,nonce,issuedAt,secretHash:await digest(secret)};return {...a,message:webhookMessage(a)};}
export async function verifyWebhook(body,timestamp,signature,secret,{now=Date.now()}={}){if(!/^\d+$/.test(timestamp)||Math.abs(now-Number(timestamp))>300000||!/^sha256=[a-f0-9]{64}$/.test(signature))return false;const expected=await hmac(secret,timestamp+'.'+body);let different=0;for(let i=0;i<64;i++)different|=expected.charCodeAt(i)^signature.charCodeAt(i+7);return different===0;}
