// Actions require validated toolArguments supplied by your runtime, never parsed from prose.
import {tools,callTool} from './runtime.mjs';
export const qhooksActions=(options={})=>tools.map(t=>({name:t.name.toUpperCase(),similes:[],description:t.description,examples:[],validate:async(_runtime,message)=>message.content?.toolName===t.name,handler:async(_runtime,message,_state,_options,callback)=>{const result=await callTool(t.name,message.content.toolArguments,options);await callback?.({text:JSON.stringify(result),content:result});return true;}}));
