// Pass DynamicStructuredTool from @langchain/core/tools and a JSON-schema converter.
import {tools,callTool} from './runtime.mjs';
export const qhooksTools=({DynamicStructuredTool,schemaFromJSON},options={})=>tools.map(t=>new DynamicStructuredTool({name:t.name,description:t.description,schema:schemaFromJSON(t.inputSchema),func:async args=>JSON.stringify(await callTool(t.name,args,options))}));
