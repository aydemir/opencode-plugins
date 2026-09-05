# opencode-mcp-bash-tools

MCP server (stdio) that exposes two schema-controlled alternatives to
opencode's native `bash` tool:

| Tool | Behavior | Schema-controlled args |
|---|---|---|
| `bash_safe` | middle-prune + marker (default) | `max_chars`, `head_chars`, `tail_chars`, `timeout_ms` |
| `bash_raw` | full output, no prune | `max_chars` (filesystem guard only), `timeout_ms` |

## Why

opencode's native `bash` tool has a fixed schema (`command`,
`description`, `timeoutMs`, ...). Plugin-only "bypass flags" like
`no_prune=true` or `disableForCalls=N` are documented in
`opencode-context-saver` plugin's disclosure — but they are silently
ignored by opencode because they are not part of the tool's schema.

This MCP server fixes that by exposing our **own** tools with **our**
schema. LLM can pick `bash_safe` (default) or `bash_raw` (full output)
and the bypass actually works.

## Install

```bash
npm install
npm run build
```

Output: `dist/server.js`

## Register in opencode

Add to your `~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "mcp": {
    "opencode-mcp-bash-tools": {
      "type": "local",
      "command": ["node", "/root/opencode-plugins/dist/plugins/mcp-bash-tools/server.js"],
      "enabled": true
    }
  }
}
```

The server name in your config (`opencode-mcp-bash-tools` here) must
match the `<server-name>_<tool-name>` tool names that opencode uses
(`opencode-mcp-bash-tools_bash_safe`, `opencode-mcp-bash-tools_bash_raw`)
— and that `opencode-context-saver` plugin's `skipTools` list also
matches.

## Marker format

When `bash_safe` prunes, output looks like:

```
[Run ls /tmp]
file1.txt
file2.txt
...

[... pruned: 60000→400 chars (99.3% saved). For raw output, call bash_raw with the same command. ...]

...last lines of file...
```

LLM sees this marker and knows the exact tool call to make for raw
output (schema-controlled, actually works).

## Plugin interaction

`opencode-context-saver` plugin (TASK-110) skips MCP tool names
(`mcp__opencode-mcp-bash-tools__bash_safe`,
`mcp__opencode-mcp-bash-tools__bash_raw`) so the two layers don't
double-prune.
