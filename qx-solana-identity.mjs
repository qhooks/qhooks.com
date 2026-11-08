// Existing Solana reward-key codec, shared without wallet or network access.
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function base58Decode(text){if(typeof text!=='string'||!text||text.length>100)throw Error('invalid_base58');let n=0n;for(const c of text){const at=alphabet.indexOf(c);if(at<0)throw Error('invalid_base58');n=n*58n+BigInt(at);}let hex=n.toString(16);if(hex.length%2)hex='0'+hex;const value=n===0n?[]:hex.match(/../g).map(s=>parseInt(s,16));const zero=/^1*/.exec(text)[0].length;return new Uint8Array([...Array(zero).fill(0),...value]);}
export function base58Encode(bytes){let n=0n;for(const v of bytes)n=n*256n+BigInt(v);let text='';while(n){text=alphabet[Number(n%58n)]+text;n/=58n;}let zero=0;while(zero<bytes.length&&bytes[zero]===0)zero++;return '1'.repeat(zero)+text;}
export const solWallet=value=>{try{return base58Decode(value).length===32?value:null;}catch{return null;}};
