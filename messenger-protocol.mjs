// Public browser request boundary only. No provider, key, signature or crypto code.
export const PROTOCOL = 'messenger-qwallet-browser/v1';
export const ZERO = '0x' + '0'.repeat(40);
export const CHAINS = Object.freeze({ '8453':['Base','ETH'], '4663':['Robinhood','ETH'], '1':['Ethereum','ETH'], '42161':['Arbitrum One','ETH'], '56':['BNB Chain','BNB'], '5042':['Arc','USDC (native, 18 decimals)'] });
export const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export const address = value => typeof value === 'string' && /^0x[0-9a-f]{40}$/.test(value);
export const hash = value => typeof value === 'string' && /^0x[0-9a-f]{64}$/.test(value);
export function exact(value, fields) { if (!value || Object.getPrototypeOf(value)!==Object.prototype) return false; const own=Reflect.ownKeys(value); return own.length===fields.length && fields.every(key=>{const d=Object.getOwnPropertyDescriptor(value,key);return d&&d.enumerable&&Object.hasOwn(d,'value');}); }
const ensure = (ok,message) => { if(!ok) throw Error(message); };
export function origin(value) { const u=new URL(value); ensure(u.origin===value && !u.username && !u.password && (u.protocol==='https:' || u.protocol==='http:' && u.hostname==='127.0.0.1' && u.port),'Expected an exact HTTPS or explicit loopback origin.'); return u.origin; }
export function atomic(value,decimals) { ensure(Number.isInteger(decimals)&&decimals>=0&&decimals<=18 && typeof value==='string' && value.length<=100 && /^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value),'Use a plain decimal amount and 0–18 decimals.'); const [whole,fraction='']=value.split('.'); ensure(fraction.length<=decimals,'Amount exceeds asset precision.'); const n=BigInt(whole)*10n**BigInt(decimals)+BigInt(fraction.padEnd(decimals,'0')||'0'); ensure(n>0n&&n<(1n<<256n),'Positive uint256 amount required.'); return n.toString(); }
export function format(value,decimals) { const s=value.padStart(decimals+1,'0'),f=decimals?s.slice(-decimals).replace(/0+$/,''):''; return decimals?s.slice(0,-decimals)+(f?'.'+f:''):s; }
export function request(value, now=Date.now()) {
  ensure(exact(value,['version','requestId','chainId','asset','decimals','amount','recipient','expiresAt']),'Unexpected payment request fields.');
  ensure(value.version===1&&uuid(value.requestId)&&typeof value.chainId==='string'&&Object.hasOwn(CHAINS,value.chainId),'Unsupported payment request or network.');
  ensure(address(value.asset)&&address(value.recipient)&&value.recipient!==ZERO,'A nonzero lowercase EVM recipient address is required.');
  ensure(!/^0x([0-9a-f])\1{39}$/.test(value.recipient),'Generated demo addresses cannot receive real payments.');
  ensure(Number.isInteger(value.decimals)&&value.decimals>=0&&value.decimals<=18 && (value.asset!==ZERO||value.decimals===18),'Unsupported precision; native units use 18 decimals.');
  ensure(typeof value.amount==='string'&&/^[1-9][0-9]{0,77}$/.test(value.amount)&&BigInt(value.amount)<(1n<<256n),'Positive uint256 base units required.');
  ensure(Number.isSafeInteger(now)&&Number.isSafeInteger(value.expiresAt)&&value.expiresAt>now&&value.expiresAt<=now+600000,'Payment request expired or exceeds ten minutes.');
  return Object.freeze({...value});
}
export const same = (a,b) => ['version','requestId','chainId','asset','decimals','amount','recipient','expiresAt'].every(k=>a?.[k]===b?.[k]);
export function proof(value, expected) {
  ensure(exact(value,['chainId','vault','owner','asset','amount','recipient','nonce','transactionHash','blockHash','blockNumber','logIndex']),'Unexpected inclusion evidence.');
  ensure(value.chainId===expected.chainId&&value.asset===expected.asset&&value.amount===expected.amount&&value.recipient===expected.recipient,'Inclusion differs from the request.');
  ensure(address(value.vault)&&value.vault!==ZERO&&address(value.owner)&&value.owner!==ZERO&&value.vault!==value.recipient&&hash(value.transactionHash)&&hash(value.blockHash),'Invalid public inclusion identity.');
  ensure(typeof value.nonce==='string'&&/^(0|[1-9][0-9]{0,77})$/.test(value.nonce)&&BigInt(value.nonce)<(1n<<256n),'Invalid action nonce.');
  ensure(['blockNumber','logIndex'].every(k=>typeof value[k]==='string'&&value[k].length<=66&&/^0x(0|[1-9a-f][0-9a-f]*)$/.test(value[k])),'Invalid inclusion location.');
  return Object.freeze({...value});
}
