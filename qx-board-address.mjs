// Board addresses put identity before the fragment so link previews can read it.
const EVM=/^0x[0-9a-f]{40}$/i,SOL=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export function boardAddress(value){
 const kind=value?.kind==='launch'||value?.controller?'launch':'token',chainId=String(value?.chainId||''),address=String(kind==='launch'?value?.controller||'':value?.address||'');
 if(kind==='launch'?!/^\d{1,6}$/.test(chainId)||!EVM.test(address):!['8453','4663','1','42161','56','solana','99901'].includes(chainId)||!(chainId==='solana'?SOL:EVM).test(address))return null;
 if(kind==='token'&&chainId==='99901'&&BigInt(address)===0n)return null;
 return{kind,chainId,[kind==='launch'?'controller':'address']:chainId==='solana'?address:address.toLowerCase()};
}
export function boardUrl(value){const board=boardAddress(value);return board?'/board/'+board.kind+'/'+board.chainId+'/'+(board.controller||board.address):'/board';}
export function readBoardAddress(pathname){
 const match=/^\/board\/(token|launch)\/([^/]+)\/([^/]+)\/?$/.exec(pathname||'');if(!match)return null;
 let address;try{address=decodeURIComponent(match[3]);}catch{return null;}
 return boardAddress({kind:match[1],chainId:match[2],[match[1]==='launch'?'controller':'address']:address});
}
