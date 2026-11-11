// The public app settings decide availability; provider calls never probe it.
export const PRIVY_PUBLIC_APP='cmv3q3emi00mi0flc038ym0mt';
const readers=new WeakMap();
export function readPrivyAppConfig(fetcher=globalThis.fetch,appId=globalThis.QHOOKS_PRIVY_APP||PRIVY_PUBLIC_APP){
 if(typeof fetcher!=='function')return Promise.resolve(null);
 let apps=readers.get(fetcher);if(!apps){apps=new Map();readers.set(fetcher,apps);}
 const previous=apps.get(appId);if(previous&&previous.until>Date.now())return previous.promise;
 const entry={until:Date.now()+60000};
 entry.promise=Promise.resolve().then(async()=>{try{
  const response=await fetcher('https://auth.privy.io/api/v1/apps/'+encodeURIComponent(appId),{headers:{'privy-app-id':appId},cache:'no-store'});
  if(!response.ok)throw Error('Public app settings unavailable');const config=await response.json();
  if(!config||typeof config!=='object'||Array.isArray(config))throw Error('Invalid public app settings');return config;
 }catch{if(apps.get(appId)===entry)apps.delete(appId);return null;}});apps.set(appId,entry);return entry.promise;
}
// Site readiness per method, on top of Privy's toggles. Telegram stays off until the page CSP allows Privy's Telegram login script
// (script-src https://auth.privy.io https://telegram.org, frame-src https://oauth.telegram.org) — flip TELEGRAM_LINK_READY in that release.
export const TELEGRAM_LINK_READY = false;
export function privyLinkedMethods(config,{telegramReady=TELEGRAM_LINK_READY}={}){
 return{x:config?.twitter_oauth===true,discord:config?.discord_oauth===true,farcaster:config?.farcaster_auth===true,telegram:telegramReady&&(config?.telegram_auth===true||config?.telegram_oauth===true)};
}
