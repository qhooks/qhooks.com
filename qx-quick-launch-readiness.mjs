// Display readiness only. Canonical validators and transaction guards still own admission.
export function launchReadiness(s={}){
 const error=String(s.validationError||''),invalid=s.taken?'ticker':/ticker/i.test(error)?'ticker':/\bname\b/i.test(error)?'name':/image/i.test(error)?'image':null;
 const sol=s.kind==='solana',checks=[['image','Image',!!s.image],['name','Name',!!String(s.name||'').trim()],['ticker','Ticker',!!String(s.symbol||'').trim()],['wallet','Wallet',!!s.wallet]].map(([id,label,complete])=>({id,label,complete:complete&&id!==invalid}));
 const answer=(reason,message,{disabled=true,label=sol?'Prepare launch review':'Launch',action='wait'}={})=>({reason,message,disabled,label,action,checks});
 if(s.busy)return answer('busy',s.pending?'Waiting for launch confirmation.':'Your launch is in progress. Keep this page open.',{label:s.pending?'Confirming…':'Launching…'});
 if(s.pending)return answer('pending','A launch is waiting for confirmation. Use Check launch confirmation to continue.');
 if(s.available===false)return answer('hold',s.hold||'Launches are not available on this chain. Choose another chain.');
 if(sol&&s.available==null)return answer('availability','Checking Solana launch availability…');
 if(!s.image)return answer('image','Add a token image.');
 if(!String(s.name||'').trim())return answer('name','Enter a token name.');
 if(!String(s.symbol||'').trim())return answer('ticker','Enter a ticker.');
 if(!s.banner)return answer('banner',s.bannerMessage||'Preparing your banner…');
 if(s.validationError)return answer('validation',s.validationError);
 if(s.taken)return answer('taken','This ticker is already in use. Choose another ticker.');
 if(!s.wallet)return answer('wallet',sol?'Connect your Solana wallet to review the launch.':'Connect your wallet to review the launch cost.',{disabled:false,label:sol?'Connect Solana wallet':'Connect wallet to launch',action:'connect'});
 if(s.wrongChain)return answer('chain',s.chainMessage||'Switch your wallet to the selected chain.',{disabled:false,label:s.chainLabel||'Switch chain and launch',action:'switch'});
 if(s.priceBlocked||s.poolsBlocked)return answer('price','Refreshing price… The starting market cap needs a live price. Try again in a moment, or choose Standard.');
 if(s.keyBlocked)return answer('key','Unlock your quantum key, or turn the post-quantum key off, then launch.');
 if(!sol&&!s.cost)return answer('cost',s.costError||'Reading the launch cost. Wait for the estimate to finish.');
 if(s.funded===false)return answer('balance',s.balanceMessage||'The wallet balance does not cover this launch.');
 return answer('ready',s.reviewError|| (sol?(s.prepared?'Review is ready. Confirm in your wallet.':'Review the launch cost before confirming in your wallet.'):'Ready to launch. Review the cost, then confirm in your wallet.'),{disabled:false,label:sol?(s.prepared?'Confirm and launch':'Prepare launch review'):'Launch',action:'launch'});
}
export function paintLaunchReadiness(host,state){
 const d=host.ownerDocument,items=d.createElement('ul');items.className='qq-readiness-checks';items.setAttribute('aria-label','Launch checklist');
 for(const c of state.checks){const li=d.createElement('li');li.className=c.complete?'is-complete':'';li.dataset.check=c.id;li.textContent=(c.complete?'✓ ':'· ')+c.label;li.setAttribute('aria-label',c.label+(c.complete?(c.id==='wallet'?' connected':' entered'):' needed'));items.append(li);}
 const reason=d.createElement('p');reason.className='qq-readiness-reason';reason.textContent=state.message;host.dataset.reason=state.reason;host.replaceChildren(items,reason);
}
