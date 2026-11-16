// Quick Launch is the existing Plain token preset, with one native-quote pool.
// No range/floor follow-up, first buy, reserve, extra pool, or quantum-key setup.
export const QUICK_LAUNCH_DEFAULTS=Object.freeze({chainId:'4663',cardId:'plain',style:'none',snipe:15,startTier:'standard',startSteps:0,quoteIndex:0,extraPools:Object.freeze([]),quantum:false});
export function quickLaunchEntry({chain,style,start,hash}={}){return {chain:chain||QUICK_LAUNCH_DEFAULTS.chainId,card:style||/^#quick-([a-z-]+)$/.exec(hash||'')?.[1]||QUICK_LAUNCH_DEFAULTS.cardId,simple:!style&&!start&&!/^#quick-/.test(hash||'')};}
