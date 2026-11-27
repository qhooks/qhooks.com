// Pass {tool,jsonSchema} from your installed ai package.
import {tools,callTool} from './runtime.mjs';
export const qhooksTools=({tool,jsonSchema},options={})=>Object.fromEntries(tools.map(t=>[t.name,tool({description:t.description,inputSchema:jsonSchema(t.inputSchema),execute:args=>callTool(t.name,args,options)})]));
