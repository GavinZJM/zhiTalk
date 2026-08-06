# MCP Client (zjmTalk)

zjmTalk acts as an **MCP client**. Configure servers in `mcp.json`, then restart the CLI.

## Config

- Default path: `src/agent/mcp/mcp.json` (under `process.cwd()`)
- Override: `ZJMTALK_MCP_CONFIG=/path/to/mcp.json`

```json
{
  "version": 1,
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      "env": {}
    },
    "remote": {
      "url": "https://example.com/mcp",
      "headers": {
        "Authorization": "Bearer ${MCP_TOKEN}"
      }
    }
  }
}
```

- `command` + `args` → stdio transport
- `url` → Streamable HTTP（鉴权用顶层 `headers`，不是 VS Code 的 `requestInit.headers`）
- `${VAR}` is replaced from the environment
- Extra fields like `"type": "http"` are ignored

## Tool naming

Remote MCP tools are bound as LangChain tools named:

`mcp_{server}_{tool}`

Also available:

- `list_mcp_resources`
- `read_mcp_resource`

Failed server connections are skipped (fail-open) with a console warning.

## Example: Playwright MCP

Official server: [`@playwright/mcp`](https://playwright.dev/docs/getting-started-mcp) (Microsoft Playwright browser automation).

Already configured in `mcp.json`:

```json
{
  "version": 1,
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    }
  }
}
```

Optional flags in `args` (after the package name):

- `--headless` — no visible browser window
- `--browser=chromium|firefox|webkit`
- `--viewport-size=1280,720`

First run may download the package/browsers (can take a while). If needed:

```bash
npx playwright install chromium
```

After restart (`npm run dev`), tools appear as `mcp_playwright_*` (e.g. navigate, snapshot). Look for `[MCP] connected: playwright` in the CLI startup log.

HTTP mode (separate terminal):

```bash
npx @playwright/mcp@latest --port 8931
```

```json
"playwright": { "url": "http://localhost:8931/mcp" }
```

## Example: GitHub Remote MCP

Hosted server: [Remote GitHub MCP](https://github.com/github/github-mcp-server/blob/main/docs/remote-server.md) at `https://api.githubcopilot.com/mcp/`.

Already configured in `mcp.json` (token via env — do not commit secrets):

```json
{
  "github": {
    "url": "https://api.githubcopilot.com/mcp/",
    "headers": {
      "Authorization": "Bearer ${GITHUB_PERSONAL_ACCESS_TOKEN}"
    }
  }
}
```

1. Create a [GitHub PAT](https://github.com/settings/tokens) with scopes for the tools you need (often `repo`).
2. Set `GITHUB_PERSONAL_ACCESS_TOKEN` in `.env` or your shell.
3. Restart (`npm run dev`). Look for `[MCP] connected: ... github`.

Tools appear as `mcp_github_*` (e.g. `mcp_github_get_me`, `mcp_github_list_issues`).

Optional GitHub headers (same `headers` object):

- `X-MCP-Toolsets`: e.g. `repos,issues,pull_requests`
- `X-MCP-Readonly`: `true` for read-only tools

If the token env var is missing, connection fails with a clear warning (fail-open); other servers like playwright still connect.

This client uses **PAT in `Authorization`**. Browser OAuth is not implemented.