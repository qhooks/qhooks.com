import{EXIT_CHAINS}from'./qx-profile-exit.mjs';
const freeze=value=>Object.freeze(value);
export const EXIT_PRESENTATION=freeze({
 local:freeze({title:'Price alerts',note:'Checks received prices only while this token is open. Reached alerts require you to review and sell manually.'}),
 delivery:freeze({title:'Delivery alerts',note:'Saved on QHooks for web push or Telegram. Server delivery uses fresh market updates; it never sells tokens.'}),
 signed:freeze({title:'TP/SL orders',type:'Signed orders · QOrderExecutor',note:'Signed orders remain saved after this page closes. Fills depend on the keeper and the order’s trigger, minimum and expiry. Tokens stay in your wallet until a fill.'}),
 escrow:freeze({title:'TP/SL orders',type:'Escrow orders · QTriggerOrders',note:'Tokens are escrowed on chain. A reached order needs an execution transaction; this page offers execution while open. The order keeps its configured minimum.'})
});
// Navigation only. Never infer a QHooks controller from an outside-token address.
export function signedOrderDestination(selection){
 const chain=String(selection?.chainId||'');if(!EXIT_CHAINS.includes(chain))return null;
 const controller=selection?.kind==='launch'&&/^0x[\da-f]{40}$/i.test(selection.controller||'')?selection.controller.toLowerCase():null;
 return{href:controller?'/orders?'+new URLSearchParams({m:chain+':'+controller,side:'tpsl'}):'/orders',label:controller?'Open TP/SL orders':'TP/SL orders for QHooks pools'};
}
