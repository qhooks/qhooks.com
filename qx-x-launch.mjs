import {node} from './qx-news-ui.mjs';
import {mountXEmbed} from './qx-x-embed.mjs';
import {xPost} from './qx-x-core.mjs';
import {pastedPostIdea} from './qx-x-launch-core.mjs';
import {openTrendDraft} from './qx-news-trends.mjs';
export function mountPastedPostLaunch(target){
 if(!target)return {dispose(){}};
 const form=node('form',{class:'qn-x-launch','aria-label':'Launch from your pasted X post'}),url=node('input',{type:'url',required:true,maxlength:2048,autocomplete:'off',placeholder:'https://x.com/…/status/…','aria-label':'X post URL'}),theme=node('input',{type:'text',required:true,maxlength:80,placeholder:'A theme for an original token','aria-label':'Theme for your token'}),status=node('p',{class:'qn-note',role:'status','aria-live':'polite'}),preview=node('div'),launch=node('button',{class:'qn-button',type:'submit'},'Launch on this ↗');let embed=null;
 const field=(text,input)=>node('label',{},node('span',{},text),input);
 form.append(node('h3',{},'A post sparked an idea?'),node('p',{class:'qn-note'},'Paste the link and choose your theme. Your token copy and art start fresh.'),field('X post URL',url),field('Your theme',theme),node('div',{class:'qn-x-actions'},launch),status,preview);target.append(form);
 const clear=()=>{embed?.dispose();embed=null;preview.replaceChildren();status.textContent='';};theme.addEventListener('input',()=>{status.textContent='';});url.addEventListener('input',()=>{clear();const post=xPost(url.value);if(post)embed=mountXEmbed(preview,{url:post.url,kind:'post',label:'your pasted post'});});
 form.addEventListener('submit',event=>{event.preventDefault();try{const idea=pastedPostIdea(url.value,theme.value);status.textContent='';openTrendDraft(idea,{title:'Draft from your theme',verifyTopic:async()=>pastedPostIdea(idea.sourcePost,idea.topic)});}catch(e){status.textContent=e.message;}});
 return {dispose(){clear();form.remove();}};
}
