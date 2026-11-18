// Display words only. This never classifies evidence or edits a stored report.
// Provider identifiers remain in canonical checks/receipts/fact sources for machines.
// House style after the label is lower case ("Reported: one wallet holds 15.3%"); acronyms such as LP stay.
const reported=s=>/^Reported\s*:/i.test(s)?s:'Reported: '+s.replace(/^([A-Z])(?=[a-z])/,c=>c.toLowerCase());
const holderStatement=s=>/\(GoPlus(?:\s+list)?\s*(?:;|\))|\bFrom GoPlus[’']s list of LP holders\b/i.test(s);
// Follow-up 3: a replacement that can land mid-sentence starts lower case there and upper case at a sentence start.
const lead=(all,at,phrase)=>/(?:^|[.!?]\s*)$/.test(all.slice(0,at))?phrase[0].toUpperCase()+phrase.slice(1):phrase;
function words(value){
 if(typeof value!=='string')return value;
 const holders=holderStatement(value);
 let s=value
  // Follow-up 3: machine provider-kind prefixes of skipped-read reasons ("goplus: ...") and the remaining
  // dynamic read/capacity phrases that still named a provider.
  .replace(/\b(?:goplus|dexscreener|dexcdn|jupiter|helius-general|helius|sourcify|rh-blockscout|base-blockscout|robinhood-alchemy|elysium-testnet-alchemy|elysium-alchemy|hyperevm-testnet-alchemy|hyperevm-alchemy|solana-raven|rugcheck|birdeye): (?=[A-Z])/g,'')
  .replace(/\bGoPlus headroom\b/gi,'Token-security headroom')
  .replace(/\bPublicNode log reads\b/gi,'Public chain log reads')
  .replace(/\bBlockscout credits\b/gi,'Explorer credits')
  .replace(/\bBase Blockscout read unavailable\b/gi,'Base explorer read unavailable')
  .replace(/\bDexScreener images read unavailable\b/gi,'Token image read unavailable')
  .replace(/\bDexScreener read unavailable\b/gi,'Market index read unavailable')
  .replace(/\bJupiter read unavailable\b/gi,'Swap-route read unavailable')
  .replace(/\b(?:Helius(?: \(Constant-K fallback\))?|Raven \/ Constant-K RPC) read unavailable\b/gi,'Solana chain read unavailable')
  .replace(/\bGoPlus reports\s+/gi,'Reported: ')
  .replace(/\bGoPlus flags a honeypot\b/gi,'Reported: honeypot')
  .replace(/\bFrom GoPlus[’']s list of LP holders\b/gi,'Reported: LP holder list')
  // Follow-up 3: the holder sentence already starts "Reported: ", so the inner source word is dropped, not repeated.
  .replace(/\(GoPlus\s*;\s*/gi,'(')
  .replace(/\(GoPlus list\s*;/gi,'(reported list;')
  .replace(/\s*\(GoPlus\)/gi,'')
  .replace(/\bMeasured by GoPlus[’']s buy and sell simulation\b/gi,'Reported: a buy and sell simulation')
  .replace(/\bGoPlus simulated\b/gi,'Reported: a provider simulated')
  .replace(/\bGoPlus[’']s own simulation\b/gi,'Reported: a provider’s own simulation')
  .replace(/\bGoPlus (?:answer reused|facts from)\b/gi,m=>m.toLowerCase().includes('facts')?'Reported: facts from':'Reported: answer reused')
  .replace(/\bGoPlus read unavailable\b/gi,'Token-security read unavailable')
  .replace(/\bGoPlus (answered|returned|had|does not cover)\b/gi,(m,v,at,all)=>lead(all,at,'the token-security provider '+v))
  .replace(/\bGoPlus sees\b/gi,(m,at,all)=>lead(all,at,'the token-security provider reports'))
  .replace(/\bGoPlus[’']s rate limit\b/gi,'the token-security provider’s rate limit')
  .replace(/\b(?:live )?GoPlus read failed\b/gi,'token-security read failed')
  .replace(/\bGoPlus\s*:/gi,'Token-security provider:')
  .replace(/\bNot listed on DexScreener\b/gi,'Not listed on the market index')
  .replace(/\bDexScreener lists\b/gi,'the market index lists')
  .replace(/\(DexScreener\)/gi,'(reported market index)')
  .replace(/\bverified on Sourcify\b/gi,'verified in the source registry')
  .replace(/\b(?:on|in) Sourcify\b/gi,'in the source registry')
  .replace(/\bSourcify (exact_match|exact|perfect|partial|match)\b/gi,(_,m)=>'source verification: '+m.replaceAll('_',' '))
  .replace(/\bSourcify read unavailable\b/gi,'Source-verification read unavailable')
  .replace(/\bSourcify\s*:/gi,'Source verifier:')
  .replace(/\b(?:BNB|Base|Arbitrum|Ethereum|Solana|Robinhood) PublicNode read unavailable\b/gi,m=>m.replace(/PublicNode/i,'chain'))
  .replace(/\bPublicNode read unavailable\b/gi,'Chain read unavailable')
  .replace(/\b(BNB|Base|Arbitrum|Ethereum|Solana|Robinhood) PublicNode\s*:/gi,'$1 chain reader:')
  .replace(/\b(Robinhood|Elysium|Elysium testnet|HyperEVM|HyperEVM testnet) \(Alchemy\) read unavailable\b/gi,'$1 chain read unavailable')
  .replace(/\b(?:RH )?Blockscout read unavailable\b/gi,'Explorer read unavailable');
 if(holders)s=reported(s);
 return s;
}
export function qproofCheckDisplayCopy(check){
 if(!check||typeof check!=='object'||Array.isArray(check))return check;
 const out={...check},holderReport=holderStatement(check.detail||'');
 for(const key of ['title','detail','why','reason','notCheckedReason'])if(typeof check[key]==='string')out[key]=words(check[key]);
 // A holder/LP title without a provider name still describes the attributed list in its detail.
 if(holderReport&&typeof out.title==='string'&&out.title)out.title=reported(out.title);
 // Follow-up 3: the remaining provider-sourced rows carry the label in the title too: token-security flags (gp- ids)
 // and the provider's buy/sell simulation that stands in when no pool could be simulated locally.
 const providerSim=check.id==='sell-simulation'&&/^(?:A provider simulated|Reported by a provider[’']s buy and sell simulation|Measured by GoPlus[’']s buy and sell simulation|GoPlus simulated)/.test(String(check.detail||''));
 if((/^gp-/.test(String(check.id||''))||providerSim)&&typeof out.title==='string'&&out.title)out.title=reported(out.title.replace(/^Honeypot: selling fails$/,'Honeypot, selling fails'));
 return out;
}
