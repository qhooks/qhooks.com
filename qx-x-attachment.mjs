import {attachedXPost,xPost} from './qx-x-core.mjs';
import {mountXEmbed} from './qx-x-embed.mjs';
export function xAttachment(text,{hidden=false}={}){
 if(hidden)return null;const post=attachedXPost(text);if(!post)return null;
 if(!document.querySelector('link[href="/qx-news.css"]')){const link=document.createElement('link');link.rel='stylesheet';link.href='/qx-news.css';document.head.append(link);}
 const target=document.createElement('div');target.className='qn-token';mountXEmbed(target,{url:post.url,kind:'post',label:'attached post'});return target;
}
export function xAttachmentInput(textarea){
 if(!document.querySelector('link[href="/qx-news.css"]')){const css=document.createElement('link');css.rel='stylesheet';css.href='/qx-news.css';document.head.append(css);}
 const box=document.createElement('div'),label=document.createElement('label'),input=document.createElement('input'),button=document.createElement('button'),status=document.createElement('span');
 box.className='qb-x-attach';input.type='url';input.placeholder='https://x.com/account/status/…';input.maxLength=200;input.setAttribute('aria-label','Optional X post URL');label.append('Attach an X post (optional)',input);button.type='button';button.textContent='Attach';button.className='qa-btn';status.setAttribute('role','status');
 button.onclick=()=>{const post=xPost(input.value.trim());if(!post){status.textContent='Use an HTTPS x.com or twitter.com status link.';return;}if(!textarea.value.includes(post.url)){const next=textarea.value.trim()+'\n'+post.url;if([...next].length>textarea.maxLength){status.textContent='Shorten your post to make room for the link.';return;}textarea.value=next.trim();textarea.dispatchEvent(new Event('input',{bubbles:true}));}input.value='';status.textContent='Post attached. It will be included when you publish.';};
 box.append(label,button,status);return box;
}
