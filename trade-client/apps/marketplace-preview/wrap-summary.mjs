export function wrapSummary(snapshot) {
  if (!snapshot) return {
    title: 'Wrap native currency',
    detail: 'Choose an exact amount. Keep native currency for transaction fees.'
  };
  const {quoteSymbol,nativeSymbol,amountHuman,recoveryOnly,attention,stage}=snapshot;
  let title='Prepare wrapping';
  let detail=`Exchange ${amountHuman} ${nativeSymbol} for ${quoteSymbol} in the connected wallet.`;
  switch(stage?.status) {
    case 'pending': title='Review wrapping'; break;
    case 'submitting': case 'submitted':
      title='Wrapping pending'; detail+=' Check the existing transaction before continuing.'; break;
    case 'unknown':
      title='Recover wrapping transaction'; detail+=' Find the original wallet transaction hash. Do not send again.'; break;
    case 'confirmed': title='Wrapping confirmed'; break;
    case 'reverted': title='Wrapping reverted'; break;
    case 'rejected': title='Wrapping not sent'; break;
  }
  if(recoveryOnly) detail+=' Restored progress cannot resend a transaction.';
  if(attention==='save-failed') detail+=' Save public progress before continuing.';
  return {title,detail};
}
