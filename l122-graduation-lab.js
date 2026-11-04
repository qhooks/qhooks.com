// A local recipe retains its local-chain destination. No wallet or chain action.
import {bindGraduationLabPage} from './graduation-lab-page.mjs';
bindGraduationLabPage({document,target:window,fetch:window.fetch.bind(window),navigate(url){
  if(url!=='graduation.html')throw new TypeError('Unexpected graduation destination');
  window.location.href='graduation-local.html';
}});
