import {createTradingProfiles} from './qx-trading-preferences.mjs';
const fields={tp:'takeProfitPct',sl:'stopLossPct',floor:'minimumBps',tip:'executorTipBps',auto:'autoAfterBuy'};
export function createExitPreferences(storage){
 let legacy;try{legacy=JSON.parse(storage?.getItem('qhooks:terminal:tpsl')||'null');}catch{}
 let legacyTolerance;try{legacyTolerance=storage?.getItem('qhooks:terminal:tol');}catch{}const profiles=createTradingProfiles(storage,{legacyTpsl:legacy,legacyTolerance});
 return {read(chain,key){return profiles.snapshot(String(chain)).profile.exit[fields[key]];},write(chain,key,value){if(!fields[key])return false;const s=profiles.snapshot(String(chain)),profile=s.profile;profile.exit[fields[key]]=key==='auto'?value===true:Number(value);profiles.save(String(chain),profile,s.revision);return true;}};
}
