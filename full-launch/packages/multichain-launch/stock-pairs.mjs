// Tokenized stocks a Robinhood Chain launch can pair with instead of WETH. Every entry is a proxy with the same
// runtime, pointing (EIP-1967 beacon slot) at the same beacon and implementation; a launch admits a stock pair only
// after checking all three code hashes, the beacon slot, decimals and symbol on chain, so a look-alike token with the
// same ticker is refused. Data observed on chain 2026-11-04 (70 tokens, all 18 decimals).
export const STOCK_PAIRS=Object.freeze({'4663':Object.freeze({
 beaconSlot:'0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50',
 beacon:{address:'0xe10b6f6b275de231345c20d14ab812db62151b00',runtimeSha256:'e42be4f7355845c67bb554c14cd9f23e9d3dcaad79f88dc1cd3e725c7b7597b5',runtimeBytes:2332},
 implementation:{address:'0xb35490d6f9163de4f80d88dc75c3516eb64c5ae2',runtimeSha256:'0ac99e9cc7a3738645af72f6d9e8fb8242660b63134d8fb0c44ba6fac39deec2',runtimeBytes:11614},
 proxy:{runtimeSha256:'399ec4bc5b43db03486ceae11f9a6fc5c126427f8f8e10c90fed0c773f4325c6',runtimeBytes:283},
 tokens:Object.freeze([
  ['0x322f0929c4625ed5bad873c95208d54e1c003b2d','TSLA',"Tesla"],
  ['0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec','NVDA',"NVIDIA"],
  ['0xaf3d76f1834a1d425780943c99ea8a608f8a93f9','AAPL',"Apple"],
  ['0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea','SPCX',"SpaceX Class A"],
  ['0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3','GOOGL',"Alphabet Class A"],
  ['0x12f190a9f9d7d37a250758b26824b97ce941bf54','AMZN',"Amazon"],
  ['0xe93237c50d904957cf27e7b1133b510c669c2e74','MSFT',"Microsoft"],
  ['0xc0d6457c16cc70d6790dd43521c899c87ce02f35','META',"Meta Platforms"],
  ['0x86923f96303d656e4aa86d9d42d1e57ad2023fdc','AMD',"Advanced Micro Devices"],
  ['0x894e1ec2d74ffe5aef8dc8a9e84686accb964f2a','PLTR',"Palantir Technologies"],
  ['0x6330d8c3178a418788df01a47479c0ce7ccf450b','COIN',"Coinbase"],
  ['0xec262a75e413fafd0df80480274532c79d42da09','MSTR',"Strategy"],
  ['0x1b0e319c6a659f002271b69db8a7df2f911c153e','GME',"GameStop"],
  ['0x117cc2133c37b721f49de2a7a74833232b3b4c0c','SPY',"SPDR S&P 500 ETF"],
  ['0xd5f3879160bc7c32ebb4dc785f8a4f505888de68','QQQ',"Invesco QQQ"],
  ['0xe0444ef8bf4ed74f74fd73686e2ddf4c1c5591e8','NFLX',"Netflix"],
  ['0x156e175dd063a8ce274c50654ef40e0032b3fbcf','AVGO',"Broadcom"],
  ['0x05a3d1cd21d0c88145e82600e62e7e496e0f222b','AMC',"AMC Entertainment"],
  ['0x4d21483a44bf67a86b77e3da301411880797d452','BA',"Boeing"],
  ['0xad25ac6c84d497db898fa1e8387bf6af3532a1c4','BABA',"Alibaba Group"],
  ['0x48e39e56acdba37b09020c0b734a613c9a2f100a','BB',"BlackBerry"],
  ['0x822cc93ffd030293e9842c30bbd678f530701867','BE',"Bloom Energy"],
  ['0xcef9027c7d6985b85f0ba431125073529a947a68','BULL',"Webull Corporation"],
  ['0xae517a2903e68bd929dfd15be875f8369d53e94a','CEG',"Constellation Energy"],
  ['0x4ea005168d7f09a7a0ba9d1def21a479950e44c2','COST',"Costco"],
  ['0xdf0992e440dd0be65bd8439b609d6d4366bf1cb5','CRCL',"Circle Internet Group"],
  ['0x27c99fbde9d0d2aa4f4bfb4943f237843ddf6958','DDOG',"Datadog"],
  ['0x941ae714ec6d8130c7b75d67160ca08f1e7d11dd','DELL',"Dell"],
  ['0x1d11f0496982706c5e14a514d4e79f2e6bde4516','DJT',"Trump Media & Technology Group"],
  ['0x7f0abef0c07280f82c6a08ead09ded6bae2c13fc','EWY',"iShares MSCI South Korea ETF"],
  ['0x25c288e6d899b9bc30160965ad9644c67e73be0c','F',"Ford Motor"],
  ['0x41f4267525a8aff329540ef24fd83d9044758b33','FIG',"Figma"],
  ['0xc9a981fee1f9dec688bb123ccdecc63d0debfc4e','GLD',"SPDR Gold Shares"],
  ['0xccee82fe024c36fa15e1005ede3e9e4787e23d09','HIMS',"Hims & Hers Health"],
  ['0x980dcf6766fa79f5cf0c4aadb3ab477ff15a9619','IBM',"IBM"],
  ['0xacef2e09adb47ad6abebad9ff06689e60615c2b6','INDA',"iShares MSCI India ETF"],
  ['0xc72b96e0e48ecd4dc75e1e45396e26300bc39681','INTC',"Intel"],
  ['0x03dfbbe0ac4e7bcdafd08ed41a400326b77d8c80','JNJ',"Johnson & Johnson"],
  ['0x8005d266423c7ea827372c9c864491e5786600ea','LLY',"Eli Lilly"],
  ['0x329fcaceb9ad6f9580dd5f643fed0646900d043c','LMT',"Lockheed Martin"],
  ['0x4e62068525ab11fe768e29dfd00ef909b9803016','LULU',"Lululemon"],
  ['0x43b07d15ce533bec5476d70c22a78a1b2b662155','MRNA',"Moderna"],
  ['0x62fd0668e10d8b72339be2dcf7643001688ff13b','MRVL',"Marvell Technology"],
  ['0xff080c8ce2e5feadaca0da81314ae59d232d4afd','MU',"Micron Technology"],
  ['0x9d9c6684f596f66a64c030b93a886d51fd4d7931','NBIS',"Nebius Group"],
  ['0x116f00968269b7bfbad4109ce591d6e74c0601d4','NET',"Cloudflare"],
  ['0x408c14038a04f7bd235329e26d2bf569ee20e250','NU',"Nu Holdings"],
  ['0xb0992820e760d836549ba69bc7598b4af75dee03','ORCL',"Oracle"],
  ['0x1cdad396db64bda184d5182a97dd9b3c62100b7d','P',"Everpure"],
  ['0x9b23573b156b52565012f5ce02cdf60afbaa70be','PENG',"Penguin Solutions"],
  ['0x7066a64c24e4206cd62e83bf198c1e7eb361f51e','PFE',"Pfizer"],
  ['0x59818904ab4ce163b3ce4ffb64f2d6ca02c434b4','QUBT',"Quantum Computing"],
  ['0xf0c4bf4c582cb3836e98394b1d4e7b7281101be8','RBLX',"Roblox"],
  ['0xfde6b5d9bb419b10c23268c74e369abff39c0460','RCAT',"Red Cat Holdings"],
  ['0x05b37fb53a299a1b874a619e1c4c404d52c36f4c','RDDT',"Reddit"],
  ['0xb1bf26c1d20ff267a4f93550d1e0d06ac40a114b','RIVN',"Rivian Automotive"],
  ['0x3b14c39e89d60d627b42a1a4ca45b5bb45fc12e2','RKLB',"Rocket Lab"],
  ['0x92fd66527192e3e61d4ddd13322aa222de86f9b5','SGOV',"iShares 0-3 Month Treasury Bond ETF"],
  ['0xf53f66751b1eff985311b693531e3290f600c410','SHOP',"Shopify"],
  ['0x84cab63bc87912e71ad199ff14a0ba45de68fef8','SKHY',"SK Hynix"],
  ['0x411efb0e7f985935daec3d4c3ebaea0d0ad7d89f','SLV',"iShares Silver Trust"],
  ['0xf6589f11bc40b669e584073f428b05562f568733','SNAP',"Snap"],
  ['0xb90a19ff0af67f7779aff50a882a9cff42446400','SNDK',"SanDisk"],
  ['0xba0cab75495255d0cb58e22b648bfed4ecd1f47e','SNOW',"Snowflake"],
  ['0x75742c18bc1f1c5c5f448f4c9d9c6f66dafaaa38','SOXX',"iShares Semiconductor ETF"],
  ['0x58ffe4a942d3885baa22d7520691f611ef09e7aa','TSM',"Taiwan Semiconductor"],
  ['0x5e81213613b6b86eab4c6c50d718d34359459786','TTWO',"Take-Two Interactive"],
  ['0xf23250dac154d05bb671cb0d0ebef3c635c79ce2','UPS',"United Parcel Service"],
  ['0xa30fa36db767ad9ed3f7a60fc79526fb4d56d344','USO',"United States Oil Fund"],
  ['0x9e7abd3c9139d14e4c86dce0e455aab7a0c2fb3e','WYFI',"WhiteFiber"]])
})});
const PAIR_KEY=chainId=>'qhooks:pair:v1:'+chainId;
/** The stock entry for `address` on `chainId`, or null. */
export function stockPair(chainId,address){
 const set=STOCK_PAIRS[chainId];if(!set||typeof address!=='string')return null;
 const a=address.toLowerCase(),t=set.tokens.find(x=>x[0]===a);
 return t?Object.freeze({address:t[0],symbol:t[1],name:t[2],decimals:18}):null;
}
/** The stock this browser chose as the pair for new launches on `chainId` (Studio's pair picker), or null for the default. */
export function selectedPair(chainId){
 try{const a=globalThis.localStorage?.getItem(PAIR_KEY(chainId));return stockPair(chainId,a)?a:null;}catch{return null;}
}
export function choosePair(chainId,address){
 try{if(stockPair(chainId,address))globalThis.localStorage.setItem(PAIR_KEY(chainId),address.toLowerCase());else globalThis.localStorage.removeItem(PAIR_KEY(chainId));}catch{}
}
/** A chain row (quoteSymbol/quoteDecimals) with the chosen stock pair applied, for labels. */
export function withPair(c){const s=c&&selectedPair(c.id||c.chainId);return s?{...c,quoteSymbol:stockPair(c.id||c.chainId,s).symbol,quoteDecimals:18}:c;}
