import {chainById} from './chains.mjs';
export const launchChainName=chain=>String(chain)==='solana'?'Solana':chainById(chain)?.name||'Unknown chain';
export const T3_CHAINS = ['4663','8453','1','42161','56','99901','143','solana'];
export const DAY=86400000, MAX_AGE=900000;
const number=(v,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max?v:null;
export function launchFilter(v){
 if(!v||typeof v!=='object'||Array.isArray(v))return null;
 const chains=Array.isArray(v.chains)?[...new Set(v.chains)]:[];
 if(!chains.length||chains.some(c=>!T3_CHAINS.includes(c)))return null;
 const liquidity=number(v.liquidity,1e10),holders=number(v.holders,1e8);
 if(liquidity===null||holders===null||!Number.isInteger(holders)||typeof v.clean!=='boolean'||typeof v.creatorHistory!=='boolean'||typeof v.push!=='boolean'||typeof v.telegram!=='boolean'||!v.push&&!v.telegram)return null;
 return {chains,liquidity,holders,clean:v.clean,creatorHistory:v.creatorHistory,push:v.push,telegram:v.telegram};
}
export function launchMatch(filter,item,now){
 if(!filter?.chains.includes(item?.chain)||!Number.isFinite(item.launchedAt)||item.launchedAt>now||now-item.launchedAt>DAY)return false;
 const fresh=Number.isFinite(item.observedAt)&&item.observedAt<=now&&now-item.observedAt<=MAX_AGE;
 if(filter.liquidity>0&&(!fresh||typeof item.liquidity!=='number'||item.liquidity<filter.liquidity))return false;
 if(filter.holders>0&&(!fresh||!Number.isInteger(item.holders)||item.holders<filter.holders))return false;
 if(filter.clean&&(!fresh||item.proof?.level!=='clear'||!Number.isFinite(item.proof.at)||item.proof.at>now||now-item.proof.at>MAX_AGE))return false;
 // No first-party source currently proves a creator's complete launch history.
 // Never turn absent evidence, a creator-sells check or an empty list into "no rugs".
 if(filter.creatorHistory)return false;
 return true;
}
export function launchEvidence(report,chain,token,now){
 const names={'4663':'robinhood','8453':'base','1':'ethereum','42161':'arbitrum','56':'bnb','99901':'elysium',solana:'solana'};
 if(!report||report.subject?.chain!==names[chain]||String(report.subject?.address||'')!==(chain==='solana'?token:token.toLowerCase()))return null;
 const at=Date.parse(report.retrievedAt||report.completedAt||'');
 if(!Number.isFinite(at)||at>now||now-at>MAX_AGE||!Array.isArray(report.checks))return null;
 let level=report.verdict?.level||'unknown';
 if(report.checks.some(c=>c.status==='danger'))level='danger';
 else if(report.checks.some(c=>c.status==='caution')&&level==='clear')level='caution';
 if(level==='clear'&&(!report.checks.length||report.status!=='observed'||report.checks.some(c=>c.status==='unknown'&&c.required!==false)))level='unknown';
 return {level,at,id:/^[a-f0-9-]{36}$/.test(report.id||'')?report.id:null};
}
