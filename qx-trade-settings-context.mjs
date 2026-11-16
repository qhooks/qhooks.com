import {getWalletHub} from './wallet-hub.mjs';
import {solAddress} from './qx-solana.mjs';
import {scopedTradingStorage} from './qx-trade-settings-store.mjs';
export function tradingOwner(chain){return String(chain)==='solana'?(solAddress()?'solana:'+solAddress():null):getWalletHub(window).snapshot().current?.owner||null;}
export function walletTradingStorage(storage,chain=()=>getWalletHub(window).snapshot().current?.chainId){return scopedTradingStorage(storage,{owner:()=>tradingOwner(typeof chain==='function'?chain():chain)});}
