import {xPost} from './qx-x-core.mjs';
import {googleTopicPolicy} from './qx-news-policy.mjs';
export function pastedPostIdea(url,value){
 const post=xPost(url);if(!post)throw TypeError('Paste an HTTPS X or Twitter post URL.');
 const theme=String(value||'').trim();if(!theme||theme.length>80||/[<>\p{C}]/u.test(theme))throw TypeError('Add a theme using 1–80 printable characters.');
 const policy=googleTopicPolicy(theme,theme);if(policy.blocked)throw TypeError('Choose a theme without minors, sexual offences or human tragedies.');
 return {id:'xpost:'+post.id,topic:theme,theme:'#'+theme.replace(/\s+/g,'_').replace(/[^\p{L}\p{N}_]/gu,''),sourcePost:post.url,source:'Your X link',url:post.url,tags:policy.animalStory?['Animal']:[],...(policy.animalStory?{animalStory:true}:{}),name:'Signal Spark',ticker:'SPARK',description:'An original community token with an independent abstract theme.',look:'Original abstract angular light ribbons and stepped gold geometry on charcoal. No people, characters, logos or words.'};
}
