// Published Elysium deployment associations for read-only infrastructure.
// This independent manifest does not import or enable the shared chain registry.
// A deployment association is NOT pool-origin evidence, runtime admission, or permission to execute.
const freeze = value => {
 if(value && typeof value === 'object') { for(const child of Object.values(value))freeze(child); Object.freeze(value); }
 return value;
};
export const ELYSIUM_NETWORK = freeze({
  "chainId": "99901",
  "hexChainId": "0x1863d",
  "name": "Elysium",
  "native": "HYPE",
  "nativeDecimals": 18,
  "parent": {
    "chainId": "999",
    "name": "HyperEVM",
    "native": "HYPE"
  },
  "rpc": "https://rpc-live.elyspump.com",
  "explorer": "https://scan.elysp.com/#",
  "rpcProviders": [
    {
      "id": "elyspump-live",
      "url": "https://rpc-live.elyspump.com",
      "operatorGroup": "elyspump",
      "state": "live-execution",
      "status": "recorded-read-only",
      "recordedReadAt": "2026-11-05T17:35:32.166479+00:00",
      "sourceURL": "https://docs.elyspump.com/",
      "independentlyCorroborated": false
    },
    {
      "id": "elysp-live-alias",
      "url": "https://rpc-live.elysp.com",
      "operatorGroup": "elyspump",
      "state": "live-execution",
      "status": "recorded-read-only",
      "recordedReadAt": "2026-11-05T17:35:32.166479+00:00",
      "sourceURL": "https://docs.elyspump.com/",
      "independentlyCorroborated": false
    },
    {
      "id": "boxa-live",
      "url": "https://rpc-live.boxa.club",
      "operatorGroup": "boxa",
      "state": "live-execution",
      "status": "published",
      "sourceURL": "https://boxa.club/developers",
      "independentlyCorroborated": false
    },
    {
      "id": "boxa-batch",
      "url": "https://rpc.boxa.club",
      "operatorGroup": "boxa",
      "state": "batch-confirmed",
      "status": "published",
      "sourceURL": "https://boxa.club/developers",
      "independentlyCorroborated": false
    },
    {
      "id": "kleos",
      "url": "https://rpc.thekleos.pro/rpc",
      "operatorGroup": "kleos",
      "state": "unspecified",
      "status": "published",
      "sourceURL": "https://www.thekleos.pro/docs",
      "independentlyCorroborated": false
    }
  ],
  "providerProvenance": {
    "kind": "community-providers",
    "officialNetworkConfirmed": false,
    "officialSourceURL": "https://elysium.kinetiq.xyz/docs/connecting-to-elysium",
    "warningSourceURL": "https://docs.chainzy.io/elysium-mainnet-warning",
    "note": "Official docs still mark mainnet details as forthcoming; a community RPC execution observation does not establish settlement or admission."
  },
  "observedAt": "2026-11-06T05:01:28.906734+00:00",
  "status": "observed-early-network",
  "observationScope": "Documentation and historical read evidence; this module performs no fresh RPC probe",
  "admitted": false,
  "capabilities": {
    "read": true,
    "quote": false,
    "execute": false,
    "bridge": false,
    "claim": false
  }
});
export const ELYSIUM_VENUES = freeze([
  {
    "id": "kleos-v5-current",
    "name": "Kleos v5",
    "venue": "kleos",
    "generation": "v5-current",
    "protocol": "uniswap-v4",
    "manager": "0xe2e105d3f7209a9da11f83ccf3e7398a753823f1",
    "factory": "0x1c24b6d08220c9584df1e3d8a15ad7b0d9bc2e6a",
    "router": "0x15c7ee481ce8c57461bc8620adc5fb784374c240",
    "hook": "0x0fa71294c909b11a0b805df4763ba576c69c2acc",
    "sourceURL": "https://www.thekleos.pro/abi/index.json",
    "notes": [
      "factory is launcher ERC1967 proxy, not a separate PoolManager factory",
      "Registry also proxy; runtime/implementation unadmitted",
      "Quote is per pool; never infer a single wrappedNative"
    ],
    "chainId": "99901",
    "observedAt": "2026-11-06T05:01:28.906734+00:00",
    "status": "published",
    "admitted": false,
    "executionEnabled": false,
    "registryKey": "99901:kleos:v5-current",
    "address": "0xe2e105d3f7209a9da11f83ccf3e7398a753823f1",
    "attribution": "published deployment association; pool origin requires launch event",
    "capabilities": {
      "read": true,
      "quote": false,
      "execute": false,
      "bridge": false,
      "claim": false
    }
  },
  {
    "id": "kleos-v5-earlier",
    "name": "Kleos v5 earlier deployment",
    "venue": "kleos",
    "generation": "v5-earlier",
    "protocol": "uniswap-v4",
    "manager": "0xb308b5df891c300a5f5a5b8fdbc30108ba842490",
    "factory": "0x2da68edff4588a77b55a829689c382f2acb39502",
    "router": "0xb15d5a0159fc11bf1a1f9e383b0de76440ec6fc3",
    "hook": "0xd5068e7f4e2d70d5efbac6fd28a8407252e1eacc",
    "sourceURL": "https://www.thekleos.pro/abi/index.json",
    "notes": [
      "factory is launcher ERC1967 proxy",
      "Published index calls manager Kleos own v4-core deployment"
    ],
    "chainId": "99901",
    "observedAt": "2026-11-06T05:01:28.906734+00:00",
    "status": "published",
    "admitted": false,
    "executionEnabled": false,
    "registryKey": "99901:kleos:v5-earlier",
    "address": "0xb308b5df891c300a5f5a5b8fdbc30108ba842490",
    "attribution": "published deployment association; pool origin requires launch event",
    "capabilities": {
      "read": true,
      "quote": false,
      "execute": false,
      "bridge": false,
      "claim": false
    }
  },
  {
    "id": "kleos-classic-v3",
    "name": "Kleos Classic / KleosSwap",
    "venue": "kleos",
    "generation": "classic",
    "protocol": "uniswap-v3",
    "factory": "0x809ff79945fffbf9b8df33bb3b62872ceb2efaf1",
    "launcher": "0x6e3afddc49f5d43858a1fdd48184426ded11029b",
    "router": "0x03c291d55cc178b8fc3e20607125b8f6e9d12687",
    "quoter": "0x18c139815b72f06a89e5e7f811427cd96b61caff",
    "wrappedNative": "0x0269031ace34a7821e9d9980d087c35ce7c19eef",
    "sourceURL": "https://www.thekleos.pro/abi/index.json",
    "chainId": "99901",
    "observedAt": "2026-11-06T05:01:28.906734+00:00",
    "status": "published",
    "admitted": false,
    "executionEnabled": false,
    "registryKey": "99901:kleos:classic",
    "variant": "kleosswap-fork",
    "address": "0x809ff79945fffbf9b8df33bb3b62872ceb2efaf1",
    "attribution": "published deployment association; pool origin requires launch event",
    "capabilities": {
      "read": true,
      "quote": false,
      "execute": false,
      "bridge": false,
      "claim": false
    }
  },
  {
    "id": "boxa-v4",
    "name": "BOXA v4 HYPE launches",
    "venue": "boxa",
    "generation": "v4",
    "protocol": "uniswap-v4",
    "manager": "0x06c63714fbf1f5753017123e2fcfdede4540b2c4",
    "factory": "0x00d4c904f74f74c6920c95e3ee807ab3c52dd205",
    "router": "0x7d812380c241b331d753e8eef1cefdea4e539496",
    "quoter": "0x1ad2186a2734dc8715dea55967df823fd6e6fea4",
    "hook": "0xbcc1f22d137c1d98dfa5548e4d4261d7aee06acc",
    "stateView": "0xbc3aeff4c6c232d8b79cf9988cd522496e5edba8",
    "sourceURL": "https://boxa.club/developers",
    "notes": [
      "factory is BoxaV4Launcher",
      "Native HYPE zero-address pool key; fee0 with hook tax",
      "Do not inject network WHYPE into native pool"
    ],
    "chainId": "99901",
    "observedAt": "2026-11-06T05:01:28.906734+00:00",
    "status": "published",
    "admitted": false,
    "executionEnabled": false,
    "registryKey": "99901:boxa:v4",
    "address": "0x06c63714fbf1f5753017123e2fcfdede4540b2c4",
    "attribution": "published deployment association; pool origin requires launch event",
    "capabilities": {
      "read": true,
      "quote": false,
      "execute": false,
      "bridge": false,
      "claim": false
    }
  },
  {
    "id": "boxa-v4-pair-v2",
    "name": "BOXA v4 pair launches",
    "venue": "boxa",
    "generation": "v4-pair-v2",
    "protocol": "uniswap-v4",
    "manager": "0x06c63714fbf1f5753017123e2fcfdede4540b2c4",
    "factory": "0xa9f082af704a8b2e0087cca2edb41e3ebf665e42",
    "router": "0x1a3e2535e6fe26c82dfd3600745349326b2355de",
    "quoter": "0x1ad2186a2734dc8715dea55967df823fd6e6fea4",
    "hook": "0xb3e25cdf4a2f42e7f37ab3ae43bfb90ee8052acc",
    "pairRegistry": "0xbcab4ce5a3db3341728865d400d694fd05f48809",
    "sourceURL": "https://boxa.club/developers",
    "notes": [
      "factory is BoxaV4LauncherV2",
      "Developer page places V2 on same v4 suite; getter/runtime validation still required",
      "Pair assets may lack HYPE route; retain NoHypeRoute and pair-only states"
    ],
    "chainId": "99901",
    "observedAt": "2026-11-06T05:01:28.906734+00:00",
    "status": "published",
    "admitted": false,
    "executionEnabled": false,
    "registryKey": "99901:boxa:v4-pair-v2",
    "address": "0x06c63714fbf1f5753017123e2fcfdede4540b2c4",
    "attribution": "published deployment association; pool origin requires launch event",
    "capabilities": {
      "read": true,
      "quote": false,
      "execute": false,
      "bridge": false,
      "claim": false
    }
  },
  {
    "id": "boxa-v3-legacy",
    "name": "BOXA v3 earlier launches",
    "venue": "boxa",
    "generation": "v3-legacy",
    "protocol": "uniswap-v3",
    "factory": "0xd5a7c10820446c58868a204b8979b8cc9cb2a1a3",
    "launcher": "0x8ca88b12bc89b58034c583f1a5df02f7e67d62e1",
    "router": "0x03c820b17f17ea86449f6cf700788c97511566c4",
    "quoter": "0x4f7dc08e8cc4579763bdec97dd9753086e4f1e3f",
    "sourceURL": "https://boxa.club/developers",
    "notes": [
      "SwapRouter interface, not SwapRouter02",
      "No wrappedNative assumed from chain-wide declaration; read actual pool token0/token1"
    ],
    "chainId": "99901",
    "observedAt": "2026-11-06T05:01:28.906734+00:00",
    "status": "published",
    "admitted": false,
    "executionEnabled": false,
    "registryKey": "99901:boxa:v3-legacy",
    "address": "0xd5a7c10820446c58868a204b8979b8cc9cb2a1a3",
    "attribution": "published deployment association; pool origin requires launch event",
    "capabilities": {
      "read": true,
      "quote": false,
      "execute": false,
      "bridge": false,
      "claim": false
    }
  },
  {
    "id": "elyspump-v3",
    "name": "ElysPump v3",
    "venue": "elyspump",
    "generation": "v3-launchpad",
    "protocol": "uniswap-v4",
    "manager": "0xe2e105d3f7209a9da11f83ccf3e7398a753823f1",
    "factory": "0xbacf71bf02b8cfe171853c5ec4a060ba2ac1e0cc",
    "router": "0x1b341fdd55d56f8e08409a2c25ddfad93eb03c1a",
    "quoter": "0x379f556c5a748bd7cc9baf0f7a344094ac1814f5",
    "sourceURL": "https://docs.elyspump.com/",
    "observedAt": "2026-11-06T05:01:28.906734+00:00",
    "chainId": "99901",
    "status": "published",
    "admitted": false,
    "executionEnabled": false,
    "notes": [
      "Published v3 app configuration; static document may still show old v1 content.",
      "Shared manager with Kleos currentv5 is not proof any pool originated on either launchpad.",
      "Do not treat vendor official-deployment label as independent provenance."
    ],
    "address": "0xe2e105d3f7209a9da11f83ccf3e7398a753823f1",
    "attribution": "published deployment association; pool origin requires launch event",
    "capabilities": {
      "read": true,
      "quote": false,
      "execute": false,
      "bridge": false,
      "claim": false
    },
    "registryKey": "99901:elyspump:v3-launchpad"
  }
]);

const ZERO='0x'+'0'.repeat(40);
const managerSet=new Set(ELYSIUM_VENUES.filter(v=>v.protocol==='uniswap-v4').map(v=>v.manager));
const factorySet=new Set(ELYSIUM_VENUES.filter(v=>v.protocol==='uniswap-v3').map(v=>v.factory));
const absent=value=>value===undefined||value===null;
function address(value,label,{zero=false}={}){
 if(typeof value!=='string'||!/^0x[0-9a-f]{40}$/i.test(value))throw new TypeError('Invalid '+label);
 const out=value.toLowerCase();if(!zero&&out===ZERO)throw new TypeError('Invalid '+label);return out;
}
function poolHash(value){
 if(typeof value!=='string'||!/^0x[0-9a-f]{64}$/i.test(value))throw new TypeError('Invalid pool ID');
 return value.toLowerCase();
}
function family(value){
 if(value==='v4'||value==='uniswap-v4')return 'v4';
 if(value==='v3'||value==='uniswap-v3'||value==='uniswap-v3-fork')return 'v3';
 throw new TypeError('Unsupported Elysium pool protocol');
}
function inputObject(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new TypeError('Elysium pool identity required');
 if(!absent(input.chainId)&&input.chainId!==ELYSIUM_NETWORK.chainId)throw new TypeError('Identity is not on Elysium');
}
export function elysiumVenue(id){return typeof id==='string'?ELYSIUM_VENUES.find(v=>v.id===id)||null:null;}

// Physical pool identity: venue/token/quote labels cannot multiply the same on-chain pool.
// Only published manager/factory namespaces are accepted. This does not admit their runtime.
export function elysiumPoolIdentity(input){
 inputObject(input);const kind=family(input.protocol);
 if(kind==='v4'){
  const manager=address(input.manager,'manager');
  if(!managerSet.has(manager))throw new TypeError('Unknown Elysium PoolManager');
  if(!absent(input.poolAddress))throw new TypeError('v4 pools use a pool ID, not a pool address');
  return ELYSIUM_NETWORK.chainId+':v4:'+manager+':'+poolHash(input.poolId);
 }
 const factory=address(input.factory,'factory');
 if(!factorySet.has(factory))throw new TypeError('Unknown Elysium v3 factory');
 if(!absent(input.manager)||!absent(input.poolId))throw new TypeError('v3 pools use a factory and pool address');
 return ELYSIUM_NETWORK.chainId+':v3:'+factory+':'+address(input.poolAddress,'pool address');
}

// Route/context identity: bind the selected venue generation, physical pool, and actual asset addresses.
// A shared manager alone never attributes this pool to the selected launchpad.
export function elysiumMarketIdentity(input){
 inputObject(input);const venue=elysiumVenue(input.venueId);
 if(!venue)throw new TypeError('Unknown Elysium venue');
 const token=address(input.token,'token'),quote=address(input.quote,'quote',{zero:venue.protocol==='uniswap-v4'});
 if(token===quote)throw new TypeError('Token and quote must differ');
 let pool;
 if(venue.protocol==='uniswap-v4'){
  const manager=address(input.manager,'manager');
  if(manager!==venue.manager)throw new TypeError('PoolManager differs from the selected venue generation');
  pool=elysiumPoolIdentity({protocol:venue.protocol,manager,poolId:input.poolId,poolAddress:input.poolAddress});
 }else{
  if(!absent(input.manager)||!absent(input.poolId))throw new TypeError('v3 route does not accept a manager or pool ID');
  pool=elysiumPoolIdentity({protocol:venue.protocol,factory:venue.factory,poolAddress:input.poolAddress});
 }
 return ELYSIUM_NETWORK.chainId+':route:'+venue.venue+':'+venue.generation+':'+venue.id+':'+pool.slice(ELYSIUM_NETWORK.chainId.length+1)+':'+token+':'+quote;
}
