// Measured runtime pins supplied with this catalogue edition. No network or signing.
import {CATALOG_EDITION} from './qx-lab-catalog-pins.mjs';
import {chainById} from './chains.mjs';
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const measured={
  "1": {
    "manager": {
      "address": "0x000000000004444c5dc75cb358380d2e3de08a90",
      "runtimeBytes": 24009,
      "runtimeSha256": "3316c7b1c67095ef6fc9b7e62fc754ad1e46e1c9119564ea4f5615a252af893e"
    },
    "stateView": {
      "address": "0x7ffe42c4a5deea5b0fec41c94c136cf115597227",
      "runtimeBytes": 3531,
      "runtimeSha256": "afb76fbf22525470301fdd914354516e10e64e11872c773ee33b1834e1beb2ef"
    },
    "feeds": {
      "ethUsd": {
        "address": "0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419",
        "description": "ETH / USD",
        "decimals": 8
      },
      "usdcUsd": {
        "address": "0x8fffffd4afb6115b954bd326cbe7b4ba576818f6",
        "description": "USDC / USD",
        "decimals": 8
      }
    }
  },
  "56": {
    "manager": {
      "address": "0x28e2ea090877bf75740558f6bfb36a5ffee9e9df",
      "runtimeBytes": 24009,
      "runtimeSha256": "694a431d81b6da55c8d75d0df8b3959ef088bb2f92b3281ada188e02c2e760f2"
    },
    "stateView": {
      "address": "0xd13dd3d6e93f276fafc9db9e6bb47c1180aee0c4",
      "runtimeBytes": 3531,
      "runtimeSha256": "5b68d1a1378521f362a73e02c16476422aabe23348b878cd3aab0529b874d9a5"
    },
    "feeds": {
      "bnbUsd": {
        "address": "0x0567f2323251f0aab15c8dfb1967e4e8a7d42aee",
        "description": "BNB / USD",
        "decimals": 8
      },
      "usdtUsd": {
        "address": "0xb97ad0e74fa7d920791e90258a6e2085088b4320",
        "description": "USDT / USD",
        "decimals": 8
      }
    }
  },
  "4663": {
    "manager": {
      "address": "0x8366a39cc670b4001a1121b8f6a443a643e40951",
      "runtimeBytes": 24009,
      "runtimeSha256": "6eb21c69298b064e37fcf8089a941ae096fe08c0f179b2d399567aef1b10585b"
    },
    "stateView": {
      "address": "0xf3334192d15450cdd385c8b70e03f9a6bd9e673b",
      "runtimeBytes": 3531,
      "runtimeSha256": "60cd24035661345b74c14895a641420f2598f910e376fb3f115bbd6bf504c8c0"
    },
    "feeds": {}
  },
  "8453": {
    "manager": {
      "address": "0x498581ff718922c3f8e6a244956af099b2652b2b",
      "runtimeBytes": 24009,
      "runtimeSha256": "b08ceda0478797f4a64fa9a089a97290411d71ce00131ccf599412210c191868"
    },
    "stateView": {
      "address": "0xa3c0c9b65bad0b08107aa264b0f3db444b867a71",
      "runtimeBytes": 3531,
      "runtimeSha256": "bd50437a34de4e1e9536bc7c8495c514b4a3b457ae5f68b1195ce58951c14689"
    },
    "feeds": {
      "ethUsd": {
        "address": "0x71041dddad3595f9ced3dccfbe3d1f4b0a16bb70",
        "description": "ETH / USD",
        "decimals": 8
      },
      "usdcUsd": {
        "address": "0x7e860098f58bbfc8648a4311b374b1d669a2bc6b",
        "description": "USDC / USD",
        "decimals": 8
      },
      "sequencer": {
        "address": "0xbcf85224fc0756b9fa45aa7892530b47e10b6433",
        "description": "L2 Sequencer Uptime Status Feed",
        "decimals": 0
      }
    }
  },
  "42161": {
    "manager": {
      "address": "0x360e68faccca8ca495c1b759fd9eee466db9fb32",
      "runtimeBytes": 24009,
      "runtimeSha256": "395c56a54ab2e08c7314e529c1be825d4443f80ccf4c0979a9a8e6847490b00b"
    },
    "stateView": {
      "address": "0x76fd297e2d437cd7f76d50f01afe6160f86e9990",
      "runtimeBytes": 3531,
      "runtimeSha256": "649f6a15dd1da5c251ceba5a9aceae6e604b8148e1dc1cb3a16ff13d146b83a0"
    },
    "feeds": {
      "ethUsd": {
        "address": "0x639fe6ab55c921f74e7fac1ee960c0b6293ba612",
        "description": "ETH / USD",
        "decimals": 8
      },
      "usdcUsd": {
        "address": "0x50834f3163758fcc1df9973b6e91f0f0f0434ad3",
        "description": "USDC / USD",
        "decimals": 8
      },
      "sequencer": {
        "address": "0xfdb631f5ee196f0ed6faa767959853a9f217697d",
        "description": "L2 Sequencer Uptime Status Feed",
        "decimals": 0
      }
    }
  }
};
const pairs={
 '8453':[['0x4200000000000000000000000000000000000006','WETH'],['0x833589fcd6edb6e08f4c7c32d4f71b54bda02913','USDC']],
 '1':[['0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2','WETH'],['0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48','USDC']],
 '42161':[['0x82af49447d8a07e3bd95bd0d56f35241523fbab1','WETH'],['0xaf88d065e77c8cc2239327c5edb3a432268e5831','USDC']],
 '56':[['0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c','WBNB'],['0x55d398326f99059ff775485246999027b3197955','USDT']],
 '4663':[['0x0bd7d308f8e1639fab988df18a8011f41eacad73','WETH'],['0x5fc5360d0400a0fd4f2af552add042d716f1d168','USDG']]
};
export const CATALOG_CHAIN_ORDER=Object.freeze(['8453','1','42161','56','4663','99901']);
export const CATALOG_CHAINS=freeze(Object.fromEntries(CATALOG_CHAIN_ORDER.map(chainId=>{
 if(chainId==='99901')return[chainId,{chainId,name:'Elysium',native:'HYPE',status:'coming',reason:"Elysium mainnet hasn't opened yet",manager:null,stateView:null,quoter:null,router:null,permit2:null,examplePair:null,examplePrice:null,feeds:{},blockNumberClock:{seconds:1,source:'parent-hyperevm'},basefeeFloorGwei:0.1}];
 const chain=chainById(chainId),pair=pairs[chainId].slice().sort((a,b)=>BigInt(a[0])<BigInt(b[0])?-1:1);
 return[chainId,{chainId,name:chain.name,native:chain.native,status:'live',
  manager:chainId==='8453'?{...CATALOG_EDITION.manager}:measured[chainId].manager,
  stateView:chainId==='8453'?{...CATALOG_EDITION.stateView}:measured[chainId].stateView,
  quoter:chain.contracts.quoter,router:chain.contracts.router,permit2:chain.contracts.permit2,
  examplePair:{currency0:pair[0][0],currency1:pair[1][0],symbols:pair.map(p=>p[1])},
  // The original Q96 fixture means raw 1:1, or 10^12 USDC per 18-decimal WETH.
  examplePrice:{base:chainId==='56'?'WBNB':'WETH',quote:chainId==='56'?'USDT':chainId==='4663'?'USDG':'USDC',price:chainId==='56'?'600':'1000000000000'},feeds:measured[chainId].feeds,
  blockNumberClock:{seconds:chainId==='56'?0.45:chainId==='8453'?2:12,source:['42161','4663'].includes(chainId)?'parent-ethereum':'own'},basefeeFloorGwei:null}];
})));
export function catalogChain(chainId){
 if(typeof chainId!=='string'||!Object.hasOwn(CATALOG_CHAINS,chainId))throw new TypeError('Unknown catalogue chain: '+String(chainId));
 return CATALOG_CHAINS[chainId];
}
export function catalogAvailability(templateId,chainId){
 const chain=catalogChain(chainId),notes=[];
 if(templateId==='fees/qfee-gas-congestion-discount'&&chain.basefeeFloorGwei!==null)notes.push('Base fee starts at '+chain.basefeeFloorGwei+' gwei on '+chain.name+'.');
 if(templateId.startsWith('policies/block-')||templateId==='fees/qfee-block-crowding')notes.push('Counts blocks of about '+chain.blockNumberClock.seconds+' s on '+chain.name);
 const reason=chain.status==='coming'?chain.reason:
  templateId==='next-wave/external-reference-price-guard-hook'&&!Object.keys(chain.feeds).length?'Not available on '+chain.name+': no Chainlink-style price feeds there.':null;
 return freeze({available:reason===null,reason,notes});
}
