// A compact result uses the same checkpoint states and percentage formatter as board/profile records.
import {checkpointView} from './qx-caller-score-ui.mjs';
import {moveText} from './qx-call-format.mjs';
export function callResultText(call){
 if(!(Number(call?.price)>0))return null;
 const points=['day','week'].map(horizon=>checkpointView(call,horizon));
 const observed=points.filter(point=>point.status==='observed'&&point.price>0);
 if(observed.length)return observed.map(point=>point.label+' move: '+moveText(point.price,call.price)).join(' · ');
 const market=points.find(point=>point.price>0);
 if(market)return market.label+' move: '+moveText(market.price,call.price)+' · '+market.note;
 if(Number(call.priceNow)>0)return 'Now move: '+moveText(call.priceNow,call.price);
 return null;
}
