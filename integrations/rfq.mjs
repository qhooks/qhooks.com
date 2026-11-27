// Generated EIP-191 message builder. Your wallet signs the returned text.
const OTC_DEPLOYMENTS={"1":{"address":"0xc4e3a8814be75e3df699471356e679cac69f7069"},"56":{"address":"0x06233e40f7e837b001f5a9196fa4f18457172949"},"4663":{"address":"0xbea24499f82f1e018a4dff5607b7c54141cbfbf8"},"8453":{"address":"0x45e8d352267bffc19a86ca11e4bbd952cca4a053"},"42161":{"address":"0x3999ae7b9ecfd8ee9ef4b39f56de4af73263c2fd"},"99901":{"address":"0xf27c0bea4847e48f1127fd09e465ce8759bcddcc"}};
function canonical(v) {return JSON.stringify(v,(_,x)=> x && typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);}
export function rfqMessage(tool,args) {
 const {signature,dryRun,...body}=args,chain=String(args.chain??'4663');
 return 'QHooks OTC RFQ v1\n'+canonical({tool,...body,wallet:args.wallet?.toLowerCase(),chain,escrow:OTC_DEPLOYMENTS[chain]?.address,dryRun:!!dryRun});
}
