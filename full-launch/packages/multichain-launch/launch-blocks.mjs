// Launch blocks configuration: the exact QLaunchBlocks constructor, canonical form and
// the same bounds the contract enforces, so a creator sees a problem before paying gas.
import {stakeVaultAddress} from './stake-vault.mjs';
import {moduleById,moduleIdOfPayee,moduleAddress} from './market-modules.mjs';
const ensure=(ok,m)=>{if(!ok)throw new TypeError(m);};
const isAddress=x=>typeof x==='string'&&/^0x[0-9a-f]{40}$/.test(x);
export const ZERO_ADDRESS='0x'+'0'.repeat(40);
export const BLOCK_BITS=Object.freeze({openDelay:0,antiSnipe:1,walletCap:2,maxTrade:3,cooldown:4,holderGate:5,exitClock:6,sandwich:7,impactFee:8,stormFee:9,sessionFee:10,tax:11,sizeTiers:12,autoBurn:13,king:14,clockPot:15,buyback:16,referrals:17,points:18});
// Config fields in struct order. token and quote are filled in at deployment.
export const BLOCK_FIELDS=Object.freeze([
 ['token','address'],['mask','uint32'],['openDelay','uint32'],['guardSeconds','uint32'],['quote','address'],
 ['snipeBps','uint16'],['snipeFloorBps','uint16'],['snipeDecay','uint32'],['walletCapBps','uint16'],['maxTradeBps','uint16'],
 ['maxBuyPerBlock','uint128'],['maxTradeSeconds','uint32'],['cooldownSeconds','uint32'],['exitTopBps','uint16'],['exitFloorBps','uint16'],['exitHorizon','uint32'],
 ['gateToken','address'],['gateSeconds','uint32'],['sandwichMaxBps','uint16'],['impactCeilBps','uint16'],['impactSlope','uint16'],
 ['gateMin','uint128'],['stormFloorBps','uint16'],['stormCeilBps','uint16'],['stormInterval','uint32'],['stormDecay','uint32'],['stormMult','uint16'],
 ['regularBps','uint16'],['extendedBps','uint16'],['overnightBps','uint16'],['closedBps','uint16'],['buyTaxBps','uint16'],['sellTaxBps','uint16'],['launchTaxBps','uint16'],['taxDecay','uint32'],
 ['tier1Bps','uint16'],['tier2Bps','uint16'],['burnBps','uint16'],['tier1','uint128'],['tier2','uint128'],
 ['kingShareBps','uint16'],['kingRound','uint32'],['clockShareBps','uint16'],['clockTimer','uint32'],['buybackShareBps','uint16'],['buybackCooldown','uint32'],['buybackSlipBps','uint16'],['referralShareBps','uint16'],
 ['clockMinBuy','uint128'],['buybackMax','uint128']
]);
const SETTINGS=BLOCK_FIELDS.filter(([k])=>k!=='token'&&k!=='quote');
const DAY=86400,HOUR=3600;
function uint(v,bits,name){ensure(typeof v==='string'&&/^(0|[1-9][0-9]{0,38})$/.test(v)&&BigInt(v)<(1n<<BigInt(bits)),'Block setting out of range: '+name);return BigInt(v);}
/** Returns the canonical text of a blocks configuration, or '' for a launch without blocks. */
export function normalizeBlocks(text){
 if(text==='')return '';
 ensure(typeof text==='string'&&text.length<=4000,'Bounded blocks configuration required');
 const o=JSON.parse(text);ensure(o&&typeof o==='object'&&!Array.isArray(o),'Blocks configuration object required');
 const keys=[...SETTINGS.map(([k])=>k),'payees'];ensure(Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k)),'Exact blocks settings required');
 const c={};for(const[k,t]of SETTINGS){if(t==='address'){ensure(isAddress(o[k]),'Canonical address required: '+k);c[k]=o[k];}else{uint(o[k],Number(t.slice(4)),k);c[k]=o[k];}}
 ensure(Array.isArray(o.payees)&&o.payees.length>=1&&o.payees.length<=8,'One to eight payees required');
 const payees=o.payees.map(p=>{ensure(Array.isArray(p)&&p.length===2&&isAddress(p[0])&&p[0]!==ZERO_ADDRESS,'Payee address required');uint(p[1],16,'share');ensure(BigInt(p[1])>0n,'Payee share required');return[p[0],p[1]];});
 checkBlocks(c,payees);
 const canonical=JSON.stringify({...Object.fromEntries(SETTINGS.map(([k])=>[k,c[k]])),payees});
 ensure(canonical===text,'Canonical blocks configuration required');return canonical;
}
const on=(c,name)=>(BigInt(c.mask)>>BigInt(BLOCK_BITS[name]))&1n;
/** Mirrors QLaunchBlocks._check. */
export function checkBlocks(c,payees){
 const n=k=>BigInt(c[k]),bit=k=>on(c,k)===1n;
 ensure(n('mask')<(1n<<19n),'Unknown block');
 ensure(n('openDelay')<=7*DAY&&n('guardSeconds')<=7*DAY,'Opening delay and launch guard are at most 7 days');
 if(bit('antiSnipe'))ensure(n('guardSeconds')>0n&&n('snipeBps')<=5000n&&n('snipeFloorBps')<=n('snipeBps')&&n('snipeDecay')<=n('guardSeconds'),'Anti-snipe: tax up to 50%, floor below it, decay within the guard');
 if(bit('walletCap'))ensure(n('guardSeconds')>0n&&n('walletCapBps')>0n&&n('walletCapBps')<=10000n,'Wallet cap needs a launch guard and a share of supply');
 if(bit('maxTrade'))ensure(n('maxTradeBps')>0n&&n('maxTradeBps')<=10000n&&n('maxTradeSeconds')<=30n*BigInt(DAY),'Max trade: a share of supply, for up to 30 days or always');
 if(bit('cooldown'))ensure(n('guardSeconds')>0n&&n('cooldownSeconds')>0n&&n('cooldownSeconds')<=BigInt(HOUR),'Cooldown: up to an hour, during the launch guard');
 if(bit('holderGate'))ensure(isAddress(c.gateToken)&&c.gateToken!==ZERO_ADDRESS&&n('gateMin')>0n&&n('gateSeconds')>0n&&n('gateSeconds')<=7n*BigInt(DAY),'Holder gate: a token, a minimum and up to 7 days');
 if(bit('exitClock'))ensure(n('exitTopBps')<=2500n&&n('exitFloorBps')<=n('exitTopBps')&&n('exitHorizon')>0n&&n('exitHorizon')<=30n*BigInt(DAY),'Exit clock: up to 25%, falling over up to 30 days');
 if(bit('sandwich'))ensure(n('sandwichMaxBps')>=100n&&n('sandwichMaxBps')<=1500n,'Sandwich guard: maximum between 1% and 15%');
 if(bit('impactFee'))ensure(n('impactCeilBps')>0n&&n('impactCeilBps')<=1000n&&n('impactSlope')>0n&&n('impactSlope')<=1000n,'Impact fee: ceiling up to 10%');
 if(bit('stormFee'))ensure(n('stormFloorBps')<=n('stormCeilBps')&&n('stormCeilBps')<=1000n&&n('stormMult')>0n&&n('stormMult')<=1000n&&n('stormInterval')>=60n&&n('stormInterval')<=BigInt(DAY)&&n('stormDecay')>=n('stormInterval')&&n('stormDecay')<=7n*BigInt(DAY),'Storm fee: ceiling up to 10%, measured every minute to every day');
 if(bit('sessionFee'))ensure(['regularBps','extendedBps','overnightBps','closedBps'].every(k=>n(k)<=1000n),'Session fees are at most 10%');
 if(bit('tax')){ensure(n('buyTaxBps')<=1000n&&n('sellTaxBps')<=1000n&&n('launchTaxBps')<=3000n&&n('taxDecay')<=7n*BigInt(DAY),'Tax: up to 10% a side, launch rate up to 30%');ensure(n('launchTaxBps')===0n||n('launchTaxBps')>=n('buyTaxBps')&&n('launchTaxBps')>=n('sellTaxBps')&&n('taxDecay')>0n,'Launch tax must start above both sides and fall over time');}
 if(bit('sizeTiers'))ensure(n('tier1')>0n&&n('tier2')>n('tier1')&&n('tier1Bps')<=n('tier2Bps')&&n('tier2Bps')<=1000n,'Size tiers: two rising sizes, up to 10%');
 if(bit('autoBurn'))ensure(n('burnBps')>0n&&n('burnBps')<=1000n,'Auto burn: up to 10% of each buy');
 let shares=0n;
 if(bit('king')){ensure(n('kingShareBps')>0n&&n('kingRound')>=300n&&n('kingRound')<=7n*BigInt(DAY),'King of the pool: rounds of 5 minutes to 7 days');shares+=n('kingShareBps');}
 if(bit('clockPot')){ensure(n('clockShareBps')>0n&&n('clockTimer')>=60n&&n('clockTimer')<=BigInt(DAY),'Last-buyer clock: 1 minute to 1 day');shares+=n('clockShareBps');}
 if(bit('buyback')){ensure(n('buybackShareBps')>0n&&n('buybackCooldown')>=60n&&n('buybackCooldown')<=BigInt(DAY)&&n('buybackMax')>0n&&n('buybackSlipBps')>=10n&&n('buybackSlipBps')<=1000n,'Buyback: a size, a cooldown and a price limit');shares+=n('buybackShareBps');}
 if(bit('referrals')){ensure(n('referralShareBps')>0n,'Referral share required');shares+=n('referralShareBps');}
 ensure(shares<=10000n,'Pots, buyback and referrals share at most 100% of charges');
 ensure(new Set(payees.map(p=>p[0])).size===payees.length,'Distinct payees required');
 ensure(payees.reduce((s,p)=>s+BigInt(p[1]),0n)===10000n,'Payee shares must add up to 100%');
}
const word=v=>BigInt(v).toString(16).padStart(64,'0');
/** Payee placeholder for the launch's holder-staking vault: replaced by the (token, quote) vault address when the
 * constructor is encoded, because the token address only exists by then. */
export const STAKERS_PAYEE='0x000000000000000000000000000000000057a4e5';
/** The address a payee placeholder stands for at (token, quote): the legacy staking vault, or a marketplace module
 * (market-modules.mjs, modulePayee(id)). Real addresses pass through. */
export function resolvePayee(a,token,quote){
 if(a===STAKERS_PAYEE)return stakeVaultAddress(token,quote);
 const id=moduleIdOfPayee(a);if(id<0)return a;
 const m=moduleById(id);ensure(m,'Unknown marketplace module '+id+': reload Studio');
 return moduleAddress(m,token,quote);
}
/** QLaunchBlocks constructor arguments for a canonical configuration. */
export function encodeBlocksConstructor(text,token,quote){
 const canonical=normalizeBlocks(text);ensure(canonical!=='','Blocks configuration required');ensure(isAddress(token)&&isAddress(quote)&&token!==quote,'Token and quote required');
 const o=JSON.parse(canonical),c={...o,token,quote};
 const head=BLOCK_FIELDS.map(([k])=>word(c[k])).join('');
 const p=[...o.payees,...Array(8-o.payees.length).fill([ZERO_ADDRESS,'0'])];
 return head+p.map(x=>word(resolvePayee(x[0],token,quote))).join('')+p.map(x=>word(x[1])).join('');
}
export const BLOCKS_CONSTRUCTOR_WORDS=BLOCK_FIELDS.length+16;
export function emptyBlocks(owner){return {...Object.fromEntries(SETTINGS.map(([k,t])=>[k,t==='address'?ZERO_ADDRESS:'0'])),payees:[[owner,'10000']]};}
export function blocksText(o){return JSON.stringify({...Object.fromEntries(SETTINGS.map(([k])=>[k,o[k]])),payees:o.payees});}
export const blockEnabled=(text,name)=>text!==''&&on(JSON.parse(text),name)===1n;
