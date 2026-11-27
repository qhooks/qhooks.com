# Pass BaseTool and a schema factory preserving required/properties from Pydantic.
from qhooks_runtime import TOOLS, call_tool
def qhooks_tools(BaseTool, schema_from_json):
    def make_tool(t):
        def run(self, **kwargs):
            return call_tool(t['name'], kwargs)
        cls = type('QHooks_' + t['name'], (BaseTool,), {'__annotations__': {'name':str,'description':str,'args_schema':type}, 'name':t['name'], 'description':t['description'], 'args_schema':schema_from_json(t['inputSchema']), '_run':run})
        return cls()
    return [make_tool(t) for t in TOOLS]
