import {networkProfile} from '../../packages/multichain/profiles.mjs';
import {parseWalletFields} from './wallet-fields.mjs';
const plain=o=>!!o&&Object.getPrototypeOf(o)===Object.prototype;
const exact=(o,keys)=>plain(o)&&Object.keys(o).length===keys.length&&Object.keys(o).every(k=>keys.includes(k));
const freeze=o=>{if(o&&typeof o==='object'){Object.values(o).forEach(freeze);Object.freeze(o);}return o;};
export function parseWalletEnvelope(text,chainId){
 networkProfile(chainId);if(typeof text!=='string'||text.length>250000)throw new TypeError('Bounded wallet progress required');const o=JSON.parse(text);
 if(!exact(o,['version','kind','chainId','publicKey','fields','approval','journal'])||o.version!==1||o.kind!=='qhooks-chain-wallet-account'||o.chainId!==chainId)throw new TypeError('Wallet progress identity');
 if(typeof o.publicKey!=='string'||!/^0x[0-9a-f]{64}$/.test(o.publicKey)||BigInt(o.publicKey)===0n)throw new TypeError('Wallet public key');
 const f=parseWalletFields(o.fields);
 if(['deposit','approve-token'].includes(f.kind)){if(o.approval!==null)throw new TypeError('No signature approval for funding');}
 else if(!exact(o.approval,['action','walletDigestHex','walletSignatureHex','pqSignatureHex','publicKeyHex','keyId'])||!plain(o.approval.action)||!['walletDigestHex','walletSignatureHex','pqSignatureHex','publicKeyHex','keyId'].every(k=>typeof o.approval[k]==='string'))throw new TypeError('Protected wallet approval required');
 if(!plain(o.journal))throw new TypeError('Wallet transaction progress required');return freeze(o);
}
export const packWalletEnvelope=({chainId,publicKey,fields,approval,journal})=>parseWalletEnvelope(JSON.stringify({version:1,kind:'qhooks-chain-wallet-account',chainId,publicKey,fields,approval,journal}),chainId);
