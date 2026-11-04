export function readLaunchManagement(document) {
 const read=id=>{const el=document.getElementById('ql-'+id);if(!el||typeof el.value!=='string')throw new TypeError('Missing or invalid element: '+id);return el.value;};
 const kind=read('manage-kind');
 switch(kind){
  case 'cancel':case 'apply':return {kind};
  case 'fees':case 'exit':return {kind,recipient:read('recipient'),minToken:read('min-token'),minQuote:read('min-quote')};
  case 'migrate':return {kind,recipient:read('recipient'),minToken:read('min-token'),minQuote:read('min-quote'),tokenAmount:read('destination-token'),quoteAmount:read('destination-quote')};
  case 'announce':return {kind,mode:read('policy-mode'),threshold:read('policy-threshold'),destinationFee:read('policy-fee')};
  default:throw new TypeError('Unknown management action');
 }
}
