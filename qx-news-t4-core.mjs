export const PROOF_CHAINS={robinhood:'Robinhood',base:'Base',ethereum:'Ethereum',arbitrum:'Arbitrum',bnb:'BNB',elysium:'Elysium',solana:'Solana'};
export function proofSubject(chain,input){
 const address=String(input||'').trim();if(!chain&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address))chain='solana';
 if(!Object.hasOwn(PROOF_CHAINS,chain))throw Error('Choose the address’s chain.');
 if(chain==='solana'?!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address):!/^0x[0-9a-f]{40}$/i.test(address))throw Error('Paste one token or wallet address on this chain.');
 return {chain,address:chain==='solana'?address:address.toLowerCase()};
}
export function proofCard(report,subject,now=Date.now()){
 if(!report||report.subject?.chain!==subject.chain||String(report.subject?.address||'')!==subject.address||!Array.isArray(report.checks))throw Error('The returned report does not match this address and chain.');
 const counts={danger:0,caution:0,clear:0,unknown:0};for(const c of report.checks)if(Object.hasOwn(counts,c.status))counts[c.status]++;
 let level=Object.hasOwn(counts,report.verdict?.level)?report.verdict.level:'unknown';
 if(counts.danger)level='danger';else if(counts.caution&&level==='clear')level='caution';
 const at=Date.parse(report.retrievedAt||report.completedAt||''),fresh=Number.isFinite(at)&&at<=now&&now-at<=900000;
 if(level==='clear'&&(!report.checks.length||!fresh||report.status!=='observed'||report.checks.some(c=>c.status==='unknown'&&c.required!==false)))level='unknown';
 return {level,counts,at:Number.isFinite(at)?at:null,fresh,title:({danger:'Red flags',caution:'Look first',clear:'No red flags',unknown:'Not fully checked'})[level],url:/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(report.id||'')?'/qproof/'+report.id:'/qproof?'+new URLSearchParams({chain:subject.chain,q:subject.address})};
}
