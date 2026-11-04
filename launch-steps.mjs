export function renderLaunchSteps(container,stages){
 if(!Array.isArray(stages)||stages.length!==19)throw new TypeError('Invalid launch stages');
 for(const stage of stages){
  if(!stage||typeof stage!=='object'||Array.isArray(stage)||typeof stage.id!=='string'||!/^[a-z-]{1,32}$/.test(stage.id))throw new TypeError('Invalid stage');
  if(!['pending','submitting','unknown','submitted','confirmed','reverted','rejected'].includes(stage.status))throw new TypeError('Invalid status');
  if(stage.hash!==null&&(typeof stage.hash!=='string'||!/^0x[0-9a-f]{64}$/.test(stage.hash)))throw new TypeError('Invalid transaction hash');
 }
 const ol=document.createElement('ol');ol.className='launch-steps';
 stages.forEach((stage,i)=>{
  const li=document.createElement('li'),strong=document.createElement('strong'),span=document.createElement('span');
  strong.textContent=(i+1)+'. '+stage.id.replaceAll('-',' ');span.textContent=stage.status;li.appendChild(strong);li.appendChild(span);
  if(stage.hash){const code=document.createElement('code');code.textContent=stage.hash;li.appendChild(code);}ol.appendChild(li);
 });container.replaceChildren(ol);
}
