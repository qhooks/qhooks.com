// Community capability only. This does not admit a chain for trading, quotes or launches.
const ADDRESS=/^0x[0-9a-f]{40}$/i,POST=/^p[0-9a-v]{12}$/;
export const isElysiumDiscussion=board=>board?.kind==='token'&&String(board.chainId)==='99901'&&ADDRESS.test(board.address||'')&&BigInt(board.address)!==0n;
export function elysiumAddressUrl(address){
 if(typeof address!=='string'||!ADDRESS.test(address)||BigInt(address)===0n)throw TypeError('An exact Elysium address is required.');
 return'https://scan.elysp.com/#/address/'+address.toLowerCase();
}
export function elysiumContractUrl(board){
 if(typeof board?.address!=='string'||!isElysiumDiscussion(board))throw TypeError('An exact Elysium token contract is required.');
 return elysiumAddressUrl(board.address);
}
export function communityCapabilities(board){const elysium=String(board?.chainId)==='99901',discussionOnly=isElysiumDiscussion(board);return{discussion:!elysium||discussionOnly,calls:!elysium,trade:!elysium,holderBadges:!elysium,automaticRefresh:!elysium,discussionOnly};}
export function discussionPath(board,post){
 if(!isElysiumDiscussion(board)||!POST.test(post?.id||''))throw Error('Open an Elysium discussion to share this post.');
 return'/discussion/'+post.id;
}
