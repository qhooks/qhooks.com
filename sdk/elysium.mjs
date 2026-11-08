// QHooks Elysium observations. This client has no signing or send interface.
const address=/^0x[0-9a-f]{40}$/i,hash=/^0x[0-9a-f]{64}$/i,quantity=/^0x(?:0|[1-9a-f][0-9a-f]*)$/i;
export function createElysiumClient({baseURL='https://qhooks.com',fetcher=(...args)=>globalThis.fetch(...args)}={}){
 const base=new URL(baseURL);if(!['https:','http:'].includes(base.protocol)||base.username||base.password||base.search||base.hash)throw TypeError('Use the QHooks API origin.');
 async function get(path,{signal}={}){
  const response=await fetcher(new URL(path,base).href,{method:'GET',headers:{accept:'application/json'},signal,credentials:'omit',redirect:'manual'});
  if(response.type==='opaqueredirect'||response.status>=300&&response.status<400)throw Error('Unexpected Elysium API redirect.');
  let body;try{body=await response.json();}catch{throw Error('Elysium data could not be read.');}
  if(!response.ok)throw Object.assign(Error(body.detail||'Elysium data could not be refreshed.'),{code:body.error,status:response.status});
  if(body.version!==1||body.chainId!=='99901')throw TypeError('Wrong Elysium observation.');return body;
 }
 const checked=(value,rule,label)=>{if(typeof value!=='string'||!rule.test(value))throw TypeError('Enter a valid '+label+'.');return value.toLowerCase();};
 return Object.freeze({network:options=>get('/api/elysium/network',options),venues:options=>get('/api/elysium/venues',options),
  async assets(input,{blockNumber,signal}={}){
   if(!Array.isArray(input)||input.length<1||input.length>4)throw TypeError('Read one to four asset addresses.');
   const wanted=[...new Set(input.map(value=>checked(value,address,'asset address')))].sort(),query=new URLSearchParams({addresses:wanted.join(',')});
   if(blockNumber!==undefined)query.set('block',checked(blockNumber,quantity,'block number'));
   const body=await get('/api/elysium/assets?'+query,{signal});
   if(!body.block||!quantity.test(body.block.number)||!hash.test(body.block.hash)||blockNumber!==undefined&&BigInt(body.block.number)!==BigInt(blockNumber))throw TypeError('Wrong Elysium asset block.');
   if(!Array.isArray(body.assets)||body.assets.length!==wanted.length||new Set(body.assets.map(row=>row.address)).size!==wanted.length||body.assets.some(row=>!row||row.chainId!=='99901'||row.blockNumber!==body.block.number||!wanted.includes(row.address)))throw TypeError('Wrong Elysium asset observation.');return body;
  },
  async pools(venue,{toBlock,signal}={}){if(typeof venue!=='string'||!/^[a-z0-9-]{1,64}$/.test(venue))throw TypeError('Choose an Elysium venue.');const query=new URLSearchParams({venue});if(toBlock!==undefined)query.set('to',checked(toBlock,quantity,'block number'));const value=await get('/api/elysium/pools?'+query,{signal});if(value.venue?.id!==venue)throw TypeError('Wrong Elysium venue.');return value;},
  async swaps(venue,poolId,{toBlock,signal}={}){
   if(typeof venue!=='string'||!/^[a-z0-9-]{1,64}$/.test(venue))throw TypeError('Choose an Elysium venue.');const wanted=checked(poolId,hash,'pool ID'),query=new URLSearchParams({venue,pool:wanted});if(toBlock!==undefined)query.set('to',checked(toBlock,quantity,'block number'));
   const value=await get('/api/elysium/swaps?'+query,{signal}),pool=value.pool,window=value.window,coverage=value.coverage;
   if(value.executionEnabled!==false||value.venue?.id!==venue||value.venue.protocol!=='uniswap-v4'||!address.test(value.venue.manager||'')||pool?.chainId!=='99901'||pool.protocol!=='uniswap-v4'||pool.manager!==value.venue.manager.toLowerCase()||pool.poolId!==wanted||pool.identity!=='99901:v4:'+pool.manager+':'+wanted)throw TypeError('Wrong Elysium swap pool.');
   if(!quantity.test(window?.fromBlock||'')||!quantity.test(window?.toBlock||'')||BigInt(window.fromBlock)>BigInt(window.toBlock)||BigInt(window.toBlock)-BigInt(window.fromBlock)>=100n||window.maxBlocks!==100||window.nextToBlock!==null&&(!quantity.test(window.nextToBlock)||BigInt(window.nextToBlock)>=BigInt(window.fromBlock))||toBlock!==undefined&&BigInt(window.toBlock)!==BigInt(toBlock)||value.block?.number!==window.toBlock||!hash.test(value.block?.hash||''))throw TypeError('Wrong Elysium swap window.');
   if(!coverage||typeof coverage.completeWindow!=='boolean'||coverage.completeHistory!==false||!Array.isArray(value.swaps)||value.swaps.length>64||coverage.returnedCount!==value.swaps.length||['receivedCount','rejectedCount','duplicateCount','truncatedCount'].some(key=>!Number.isInteger(coverage[key])||coverage[key]<0||coverage[key]>1000)||coverage.maxLogs!==1000||coverage.maxEvents!==64||coverage.maxEventBlocks!==8||coverage.returnedCount+coverage.rejectedCount+coverage.duplicateCount+coverage.truncatedCount!==coverage.receivedCount||coverage.limitReached!==(coverage.receivedCount===1000)||coverage.completeWindow!==(!coverage.rejectedCount&&!coverage.duplicateCount&&!coverage.truncatedCount&&!coverage.limitReached))throw TypeError('Incomplete Elysium swap coverage.');
   let previous=null;const identities=new Set(),blocks=new Map();
   for(const row of value.swaps){
    const integer=(raw,bits,signed=false)=>{if(typeof raw!=='string'||!new RegExp(signed?'^(0|-?[1-9][0-9]*)$':'^(0|[1-9][0-9]*)$').test(raw)||raw.length>50)return false;const n=BigInt(raw);return signed?n>=-(1n<<BigInt(bits-1))&&n<(1n<<BigInt(bits-1)):n>=0n&&n<(1n<<BigInt(bits));};
    if(!row||row.chainId!=='99901'||row.manager!==pool.manager||row.poolId!==wanted||!address.test(row.caller||'')||!hash.test(row.tx||'')||!hash.test(row.blockHash||'')||!Number.isSafeInteger(row.blockNumber)||row.blockNumber<0||!Number.isSafeInteger(row.logIndex)||row.logIndex<0||BigInt(row.blockNumber)<BigInt(window.fromBlock)||BigInt(row.blockNumber)>BigInt(window.toBlock)||!integer(row.amount0,128,true)||!integer(row.amount1,128,true)||!integer(row.sqrtPriceX96,160)||BigInt(row.sqrtPriceX96)<4295128739n||BigInt(row.sqrtPriceX96)>=1461446703485210103287273052203988822378723970342n||!integer(row.liquidity,128)||!Number.isInteger(row.tick)||Math.abs(row.tick)>887272||!Number.isInteger(row.fee)||row.fee<0||row.fee>1000000)throw TypeError('Incomplete Elysium swap event.');
    if(!quantity.test(row.timestamp||'')||BigInt(row.tx)===0n||BigInt(row.blockHash)===0n||BigInt(row.caller)===0n)throw TypeError('Incomplete Elysium swap identity.');
    const blockIdentity=row.blockHash+':'+row.timestamp,known=blocks.get(row.blockNumber);if(known&&known!==blockIdentity||BigInt(row.blockNumber)===BigInt(value.block.number)&&row.blockHash!==value.block.hash)throw TypeError('Inconsistent Elysium swap block.');
    const identity=row.blockNumber+':'+row.logIndex;if(identities.has(identity)||previous&&(row.blockNumber>previous.blockNumber||row.blockNumber===previous.blockNumber&&row.logIndex>=previous.logIndex))throw TypeError('Unordered Elysium swap events.');identities.add(identity);blocks.set(row.blockNumber,blockIdentity);previous=row;
   }
   if(blocks.size>8)throw TypeError('Elysium swap block limit exceeded.');return value;
  },
  async hook(value,options){const wanted=checked(value,address,'hook address'),body=await get('/api/elysium/hook/'+wanted,options);if(body.address!==wanted)throw TypeError('Wrong Elysium hook.');return body;},
  async transaction(value,options){const wanted=checked(value,hash,'transaction hash'),body=await get('/api/elysium/transaction/'+wanted,options);if(body.hash!==wanted)throw TypeError('Wrong Elysium transaction.');return body;},
 });
}
