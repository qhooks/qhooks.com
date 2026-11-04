export function renderKeyControls(container) {
  const section=document.createElement('section'),h2=document.createElement('h2'),p=document.createElement('p');
  h2.textContent='Back up your quantum key';
  p.textContent='Use a fresh development key. Save an encrypted backup, then select that file to verify you can restore it.';
  section.appendChild(h2);section.appendChild(p);
  function buttons(rows){const div=document.createElement('div');div.className='lab-actions';for(const[id,label]of rows){const b=document.createElement('button');b.className='workspace-button';b.type='button';b.id=id;b.textContent=label;b.disabled=id!=='qkey-lock';div.appendChild(b);}section.appendChild(div);}
  buttons([['qkey-create','Create quantum key'],['qkey-lock','Lock key']]);
  const label1=document.createElement('label');label1.textContent='Backup passphrase';
  const input1=document.createElement('input');input1.id='qkey-password';input1.type='password';input1.autocomplete='new-password';input1.maxLength=1024;label1.appendChild(input1);section.appendChild(label1);
  const label2=document.createElement('label');label2.textContent='Encrypted backup file';
  const input2=document.createElement('input');input2.id='qkey-file';input2.type='file';input2.accept='.json';label2.appendChild(input2);section.appendChild(label2);
  buttons([['qkey-export','Download encrypted backup'],['qkey-verify','Verify backup'],['qkey-restore','Restore key']]);
  container.replaceChildren(section);
}
