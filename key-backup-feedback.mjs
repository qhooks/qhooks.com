// UI-only backup preflight. Never logs, saves or returns a passphrase or key.
export function bindKeyBackupFeedback({document:d,prefix,run,busy}){
 const $=name=>d.getElementById(prefix+name);
 function message(text,error=false){const node=$('key-feedback');if(node){node.textContent=text;node.dataset.error=String(error);}}
 async function perform(fn,success,{passwordRequired=true,fileRequired=false}={}){
  if(busy())return;
  // Capture before disabling controls: password-manager values must be committed
  // before the parent's busy render changes the input. Invalid input stays put.
  let password='';
  if(fileRequired){const file=$('backup-file').files?.[0];if(!file||file.size>20000){message('Choose the encrypted JSON backup you downloaded, then verify it.',true);return;}}
  if(passwordRequired){
   password=$('password').value;
   const bytes=new TextEncoder().encode(password),length=bytes.length;bytes.fill(0);
   if(length<16||length>1024){message('Enter a passphrase of at least 16 characters (up to 1024 UTF-8 bytes). Your entry has not been cleared.',true);return;}
  }
  message('Working… Keep this page open.');
  try{await run(()=>fn(password),success);const feedback=$('feedback');message(feedback?.textContent||success,feedback?.dataset.error==='true');}
  finally{password='';}
 }
 return Object.freeze({perform,message});
}
