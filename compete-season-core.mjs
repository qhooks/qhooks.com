import {WEEK} from './compete-core.mjs';
export const SEASON_WEEKS=8;
export const SEASON_POINTS=Object.freeze([10,6,3]);
export const SEASON_PRIZE=Object.freeze({asset:'QHOOKS',locked:true,lockDays:30,placements:3,amount:null,amounts:[null,null,null]});
export function seasonDefinition(start){
 if(typeof start!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(start))return null;
 const from=Date.parse(start+'T00:00:00Z');
 if(!Number.isSafeInteger(from)||from<0||new Date(from).toISOString().slice(0,10)!==start||new Date(from).getUTCDay()!==1)return null;
 return {id:'season:'+start,from,to:from+SEASON_WEEKS*WEEK,weeks:SEASON_WEEKS,points:[...SEASON_POINTS],prize:SEASON_PRIZE};
}
