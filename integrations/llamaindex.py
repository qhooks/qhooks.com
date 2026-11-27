# Pass FunctionTool from llama_index.core.tools.
from qhooks_runtime import TOOLS, call_tool
def qhooks_tools(FunctionTool, schema_from_json):
    def make_tool(t):
        def execute(**kwargs):
            return call_tool(t['name'], kwargs)
        return FunctionTool.from_defaults(fn=execute, name=t['name'], description=t['description'], fn_schema=schema_from_json(t['inputSchema']))
    return [make_tool(t) for t in TOOLS]
