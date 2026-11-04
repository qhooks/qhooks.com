export function formatWei(raw){
 if(typeof raw!=='string'||!/^(0|[1-9][0-9]{0,77})$/.test(raw))throw new TypeError('Invalid raw amount');
 const micro=(BigInt(raw)+999999999999n)/1000000000000n;
 return (micro/1000000n).toString()+'.'+(micro%1000000n).toString().padStart(6,'0')+' ETH';
}
export function deploymentSummary(snapshot){
 if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot))throw new TypeError('Deployment snapshot required');
 const lines=['Network: Base (8453)','Wallet: '+(snapshot.owner||'Not connected'),'Verifier: '+(snapshot.verifier||'Not deployed'),'Pool: '+(snapshot.pool||'Not deployed'),'Progress: '+(snapshot.status||'idle')];
 if(snapshot.quote)lines.push('Gas allowance: '+snapshot.quote.gas,'Execution fee allowance: '+formatWei(snapshot.quote.executionWei),'L1 data estimate: '+formatWei(snapshot.quote.l1Wei),'Operator fee estimate: '+formatWei(snapshot.quote.operatorWei),'Total fee estimate (includes data-fee buffer): '+formatWei(snapshot.quote.totalWei));
 return Object.freeze(lines);
}
