export function swapSummary(snapshot){
 if(snapshot===null)return Object.freeze({title:'Trade your token',detail:'Choose a pool, amount and maximum slippage.'});
 const {current,recoveryOnly,attention,stage,completed}=snapshot;
 const titles={'erc20-reset':'Reset token allowance','erc20-approve':'Approve exact token amount','permit2-approve':'Approve this router',swap:'Review swap'};
 let title=titles[current]||'Prepare swap';
 let detail='Review the exact transaction and network fee before approving in your wallet.';
 const status=stage?.status;
 if(status==='submitting'||status==='submitted'){
  title='Transaction pending';detail='Check the existing transaction before continuing.';
 }else if(status==='unknown'){
  title='Recover transaction';detail='Find the original wallet transaction hash. Do not send again.';
 }else if(status==='reverted')title='Transaction reverted';
 else if(status==='rejected')title='Transaction not sent';
 else if(status==='confirmed'&&attention!=='review-required')title='Transaction confirmed';
 if(completed===true&&status==='confirmed'){
  title='Trade complete';detail='The transaction and trade outcome have been checked.';
 }
 if(recoveryOnly)detail+=' Restored progress cannot resend a transaction.';
 if(attention==='save-failed'||snapshot.saveFailed===true)detail+=' Save public progress before continuing.';
 return Object.freeze({title,detail});
}
