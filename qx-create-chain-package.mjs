import {chainLaunchProfile} from './qx-chain-launch-profiles.mjs';
import {hasTokenProfile} from './qx-token-profile-core.mjs';
import {liquidityChainHandoff} from './qx-create-liquidity.mjs';
const editableProfile=config=>({description:config.description||'',image:config.image||'',banner:config.banner||'',links:{x:config.x||'',discord:config.discord||'',telegram:config.telegram||'',website:config.website||''}});
export function prepareCreateChainHandoff({config,liquidityState=null,profileScope='',requestedChain=null,hasSavedDraft=false,hasActiveRecord=false},{newProfileScope=()=> 'create-'+crypto.randomUUID()}={}){
 if(hasActiveRecord||!requestedChain||hasSavedDraft&&config.chainId===requestedChain.id)return{config,profileScope,profileCarry:null,changedChain:false};
 const changedChain=config.chainId!==requestedChain.id,carry=hasSavedDraft&&changedChain;
 const scope=carry?newProfileScope():profileScope;if(typeof scope!=='string'||scope&&!/^[a-z0-9-]{1,80}$/i.test(scope))throw TypeError('Invalid launch profile scope.');
 const liquidity=liquidityChainHandoff(config,requestedChain.id,liquidityState);
 return{config:{...config,chainId:requestedChain.id,liquidity:liquidity.liquidity},liquidityState:liquidity.liquidityState,profileScope:scope,profileCarry:carry?{chainId:requestedChain.id,scope,profile:editableProfile(config)}:null,changedChain};
}
export function adoptCreateProfile({config,profileScope='',hasActiveRecord=false},{readProfile,writeProfile}){
 if(hasActiveRecord)return config;let value=readProfile(config.chainId,profileScope);
 if(!hasTokenProfile(value)){const own=editableProfile(config);if(hasTokenProfile(own)){writeProfile(config.chainId,own,profileScope);value=readProfile(config.chainId,profileScope);}}
 return{...config,description:value.description,image:value.image,banner:value.banner,...value.links};
}
const COPY=Object.freeze({
 '8453':{title:'Base · community first',body:'Bring a launch link into the community. Set explicit allocations, lock terms and creator controls, then take holders straight to the token’s market.',next:'Plan a fixed-price opening, community allocation and Base social handoff.'},
 '56':{title:'BNB Chain · a plan beyond launch',body:'Start a WBNB-quoted market with disclosed launch rules and protected creator controls. Make the ongoing fee and liquidity policy part of the plan.',next:'Plan decrease-only fees, community allocations and a separate Pancake liquidity review.'},
 '42161':{title:'Arbitrum · build the ongoing market',body:'Define the allocation, lock schedule and creator powers alongside your USDC-quoted launch. Keep the policy clear as the community grows.',next:'Plan community claims, decreasing fees and a separate Camelot liquidity review.'},
 '1':{title:'Ethereum · clear terms before gas',body:'Review supply allocations, lock terms and the powers behind each rule before committing L1 gas. Your completed launch opens its exact token market.',next:'Compare a fixed-price opening and funded community vault before choosing extra contracts.'},
 '4663':{title:'Robinhood Chain · a community market',body:'Launch a WETH-quoted token with explicit allocations, locks and protected creator controls. Keep its rights and fee powers easy for holders to inspect.',next:'Plan bounded openings and community claims for an ordinary token market.'}
});
export function createChainPackageContext(chainId){const p=chainLaunchProfile(chainId),c=COPY[chainId];if(!p?.existingCreate.supported||!c)return null;return Object.freeze({...c,title:p.launchTitle||c.title,body:p.launchDescription||c.body,chainId,name:p.name,quote:p.quote.symbol,href:'/launch-options?chain='+encodeURIComponent(chainId)});}
export function mountCreateChainPackage({container,document=globalThis.document}={}){
 if(!container)throw TypeError('A chain context container is required.');let current=null;
 const node=(tag,text,className)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(className)e.className=className;return e;};
 return Object.freeze({refresh(chainId){if(current===chainId)return;current=chainId;const value=createChainPackageContext(chainId);container.replaceChildren();container.hidden=!value;if(!value)return;const heading=node('h3',value.title),body=node('p',value.body),details=node('details'),summary=node('summary','Explore this chain’s package'),next=node('p',value.next),link=node('a','Build your '+value.name+' package →');link.href=value.href;details.append(summary,next,link);container.append(heading,body,details);},destroy(){container.replaceChildren();current=null;}});
}
