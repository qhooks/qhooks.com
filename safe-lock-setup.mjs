// Reuse the current shell without its generic fact-collapsing/address decorator:
// these operation pages keep the financial impact and full hash visible.
import {ambient,setArt,initTheme}from'./qx-a/components.mjs';
import {mountShell}from'./qx-a/shell.mjs';
initTheme();setArt({banner:'/qx-a/img/qhooks-banner.jpg',blur:'/qx-a/img/qhooks-banner-blur.jpg'});
document.body.prepend(ambient());
const trigger=document.getElementById('qhc-trigger'),kind=document.getElementById('safe-operation')?.dataset.kind;
const shell=mountShell({mode:'detail',title:kind==='treasury'?'Treasury cliff':'Lock 4 drops',back:'/taps',active:'portfolio',logo:'/qx-a/img/qhooks-icon.jpg',wallet:trigger});
document.querySelector('.setup-fallback').hidden=true;document.body.dataset.setupShell='mounted';
trigger.classList.add('qa-btn','qa-btn--secondary','qa-wallet__btn');
shell.slots.wallet.querySelector('button')?.classList.add('qa-btn--secondary');
