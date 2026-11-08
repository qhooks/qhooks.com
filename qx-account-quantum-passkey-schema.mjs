// Strict shared ciphertext schema. No WebAuthn output or plaintext key fields.
export const PASSKEY_RP='qhooks.com';
export function bytesToBase64url(value){return btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
export function base64urlToBytes(value){
 if(typeof value!=='string'||!value||value.length>8192||!/^[A-Za-z0-9_-]+$/.test(value))throw new TypeError('Invalid passkey encoding.');
 let bytes;try{bytes=Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0));}catch{throw new TypeError('Invalid passkey encoding.');}
 if(bytesToBase64url(bytes)!==value)throw new TypeError('Invalid passkey encoding.');return bytes;
}
export function accountPasskey(value,publicKey){
 if(value===null)return null;
 const keys=['version','mode','credentialId','publicKey','iv','wrappedKey'];
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||Object.keys(value).some(k=>!keys.includes(k)))throw new TypeError('Use only the encrypted passkey entry.');
 if(value.version!==1||!['prf','largeBlob'].includes(value.mode)||!/^0x[0-9a-f]{64}$/.test(value.publicKey||'')||value.publicKey!==publicKey)throw new TypeError('The passkey must match the quantum key.');
 const credential=base64urlToBytes(value.credentialId),iv=base64urlToBytes(value.iv),wrapped=base64urlToBytes(value.wrappedKey);
 if(credential.length>1024||iv.length!==12||wrapped.length<32||wrapped.length>4096)throw new TypeError('Invalid encrypted passkey size.');
 return Object.freeze(Object.fromEntries(keys.map(k=>[k,value[k]])));
}
