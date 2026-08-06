import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { loadMcpConfig } from './config'
import type {
  McpConfigFile,
  McpHttpServerConfig,
  McpResourceInfo,
  McpServerConfig,
  McpStdioServerConfig,
  McpToolInfo,
} from './types'
import { isHttpServerConfig, isStdioServerConfig } from './types'

const CONNECT_TIMEOUT_MS = 60_000

type ConnectedServer = {
  name: string
  client: Client
  transport: { close?: () => Promise<void> }
  tools: McpToolInfo[]
}

function sanitizeSegment(raw: string): string {
  const s = raw.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')
  return s || 'x'
}

/** 生成唯一的 LangChain tool 名：mcp_{server}_{tool} */
export function boundMcpToolName(serverName: string, toolName: string): string {
  return `mcp_${sanitizeSegment(serverName)}_${sanitizeSegment(toolName)}`
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`MCP connect timed out after ${ms}ms: ${label}`))
    }, ms)
    promise.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

async function connectStdio(
  name: string,
  cfg: McpStdioServerConfig,
): Promise<{ client: Client; transport: StdioClientTransport }> {
  const transport = new StdioClientTransport({
    command: cfg.command,
    args: cfg.args ?? [],
    env: cfg.env,
    cwd: cfg.cwd,
    // inherit：避免 pipe 未读导致子进程阻塞；也便于看到 playwright 启动日志
    stderr: 'inherit',
  })
  const client = new Client({ name: `zjmTalk-${name}`, version: '1.0.0' })
  await client.connect(transport)
  return { client, transport }
}

/**
 * HTTP MCP 鉴权头校验：避免 ${ENV} 未设置导致 "Bearer " 空 token 却静默 401。
 * 仅在配置里出现了 Authorization（大小写不敏感）时检查。
 */
export function assertHttpAuthHeaders(
  serverName: string,
  headers: Record<string, string> | undefined,
): void {
  if (!headers) return
  const entry = Object.entries(headers).find(
    ([k]) => k.toLowerCase() === 'authorization',
  )
  if (!entry) return

  const [, value] = entry
  const trimmed = (value ?? '').trim()
  if (!trimmed) {
    throw new Error(
      `MCP server "${serverName}": Authorization header is empty after env interpolation (set the token env var, e.g. GITHUB_PERSONAL_ACCESS_TOKEN)`,
    )
  }
  // "Bearer" / "Bearer " / "Bearer   " 都视为无效
  const bearerMatch = /^Bearer\s*(.*)$/i.exec(trimmed)
  if (bearerMatch && !bearerMatch[1].trim()) {
    throw new Error(
      `MCP server "${serverName}": Authorization Bearer token is empty after env interpolation (set the token env var, e.g. GITHUB_PERSONAL_ACCESS_TOKEN)`,
    )
  }
}

function formatHttpConnectError(serverName: string, err: unknown): Error {
  const raw = err instanceof Error ? err.message : String(err)
  // SDK / fetch 常见信息里带 status；统一前缀方便 fail-open 日志排查
  const statusMatch = /\b(401|403|404|429|5\d{2})\b/.exec(raw)
  const statusHint = statusMatch ? ` (HTTP ${statusMatch[1]})` : ''
  return new Error(
    `MCP HTTP connect failed for "${serverName}"${statusHint}: ${raw}`,
  )
}

async function connectHttp(
  name: string,
  cfg: McpHttpServerConfig,
): Promise<{ client: Client; transport: StreamableHTTPClientTransport }> {
  assertHttpAuthHeaders(name, cfg.headers)

  let url: URL
  try {
    url = new URL(cfg.url)
  } catch {
    throw new Error(`MCP server "${name}": invalid url "${cfg.url}"`)
  }

  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: cfg.headers
      ? { headers: cfg.headers }
      : undefined,
  })
  const client = new Client({ name: `zjmTalk-${name}`, version: '1.0.0' })
  try {
    await client.connect(transport)
  } catch (err) {
    try {
      await transport.close?.()
    } catch {
      /* ignore */
    }
    throw formatHttpConnectError(name, err)
  }
  return { client, transport }
}

async function connectOne(
  name: string,
  cfg: McpServerConfig,
): Promise<ConnectedServer> {
  let client: Client
  let transport: { close?: () => Promise<void> }

  if (isStdioServerConfig(cfg)) {
    const conn = await withTimeout(
      connectStdio(name, cfg),
      CONNECT_TIMEOUT_MS,
      name,
    )
    client = conn.client
    transport = conn.transport
  } else if (isHttpServerConfig(cfg)) {
    const conn = await withTimeout(
      connectHttp(name, cfg),
      CONNECT_TIMEOUT_MS,
      name,
    )
    client = conn.client
    transport = conn.transport
  } else {
    throw new Error(`Unsupported MCP server config for "${name}"`)
  }

  const listed = await client.listTools()
  const tools: McpToolInfo[] = (listed.tools ?? []).map((t) => ({
    serverName: name,
    name: t.name,
    boundName: boundMcpToolName(name, t.name),
    description: t.description,
    inputSchema: t.inputSchema as Record<string, unknown> | undefined,
  }))

  return { name, client, transport, tools }
}

/**
 * 多 MCP Server 连接管理：fail-open（单 server 失败跳过）。
 */
export class McpClientManager {
  private servers = new Map<string, ConnectedServer>()
  private toolIndex = new Map<string, { serverName: string; toolName: string }>()

  get connectedServerNames(): string[] {
    return [...this.servers.keys()]
  }

  getAllTools(): McpToolInfo[] {
    const out: McpToolInfo[] = []
    for (const s of this.servers.values()) {
      out.push(...s.tools)
    }
    return out
  }

  /**
   * 按 `~/.zjmTalk/zjmTalk.json` 中的 mcpServers 连接全部 MCP Server，并重建 tool 索引。
   *
   * @param config  可选：直接传入已解析的配置；省略则从磁盘加载
   * @param options.configPath  自定义配置文件路径（传给 loadMcpConfig）
   * @param options.onWarning   非致命错误回调（配置读失败 / 单 server 连失败）
   *
   * 语义：fail-open —— 某个 server 挂了不影响其它；最终只登记连成功的。
   */
  async connectFromConfig(
    config?: McpConfigFile,
    options?: { configPath?: string; onWarning?: (msg: string) => void },
  ): Promise<void> {
    // 先拆掉旧连接与索引，避免重复 connect 时残留半开的 client / 过期 tool 名
    await this.closeAll()

    // 配置来源二选一：
    // 1) 调用方显式传入 config（测试或运行时注入）
    // 2) 否则读主配置 mcpServers；读失败不抛错，当成空配置继续（仍 fail-open）
    const cfg =
      config ??
      (() => {
        try {
          return loadMcpConfig(options?.configPath)
        } catch (err) {
          options?.onWarning?.(
            `Failed to load MCP config: ${(err as Error).message}`,
          )
          return { version: 1, mcpServers: {} } as McpConfigFile
        }
      })()

    // mcpServers: { "playwright": { command, args }, "foo": { url }, ... }
    const entries = Object.entries(cfg.mcpServers ?? {})
    if (entries.length === 0) return

    // 并行连所有 server；allSettled 保证单个 reject 不会短路整批
    // connectOne 内部：建 transport → client.connect → listTools → 生成 boundName
    const results = await Promise.allSettled(
      entries.map(([name, serverCfg]) => connectOne(name, serverCfg)),
    )

    // 按与 entries 相同的下标合并结果（allSettled 保留顺序）
    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      const serverName = entries[i][0]
      if (result.status === 'fulfilled') {
        // 成功：登记 ConnectedServer（client + tools 列表）
        this.servers.set(serverName, result.value)
        // 再建 boundName → { serverName, 原始 toolName }，供 callTool 反查
        // 例：mcp_playwright_browser_navigate → { playwright, browser_navigate }
        for (const t of result.value.tools) {
          this.toolIndex.set(t.boundName, {
            serverName: t.serverName,
            toolName: t.name,
          })
        }
      } else {
        // 失败：只告警，不写入 servers / toolIndex（其它 server 照常可用）
        const reason =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason)
        options?.onWarning?.(
          `MCP server "${serverName}" failed to connect: ${reason}`,
        )
      }
    }
  }

  async callTool(
    boundName: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    const ref = this.toolIndex.get(boundName)
    if (!ref) {
      return `MCP error: unknown tool "${boundName}"`
    }
    const server = this.servers.get(ref.serverName)
    if (!server) {
      return `MCP error: server "${ref.serverName}" is not connected`
    }

    try {
      const result = await server.client.callTool({
        name: ref.toolName,
        arguments: args,
      })
      return formatCallToolResult(result)
    } catch (err) {
      return `MCP error: ${(err as Error).message}`
    }
  }

  async listResources(): Promise<McpResourceInfo[]> {
    const out: McpResourceInfo[] = []
    for (const server of this.servers.values()) {
      try {
        const listed = await server.client.listResources()
        for (const r of listed.resources ?? []) {
          out.push({
            serverName: server.name,
            uri: r.uri,
            name: r.name,
            description: r.description,
            mimeType: r.mimeType,
          })
        }
      } catch {
        // skip servers that don't support resources
      }
    }
    return out
  }

  async readResource(serverName: string, uri: string): Promise<string> {
    const server = this.servers.get(serverName)
    if (!server) {
      return `MCP error: server "${serverName}" is not connected`
    }
    try {
      const result = await server.client.readResource({ uri })
      return formatResourceContents(result.contents ?? [])
    } catch (err) {
      return `MCP error: ${(err as Error).message}`
    }
  }

  async closeAll(): Promise<void> {
    const closers = [...this.servers.values()].map(async (s) => {
      try {
        await s.transport.close?.()
      } catch {
        /* ignore */
      }
    })
    this.servers.clear()
    this.toolIndex.clear()
    await Promise.all(closers)
  }
}

function formatCallToolResult(result: unknown): string {
  if (result == null) return ''
  const r = result as {
    content?: Array<{ type?: string; text?: string; [k: string]: unknown }>
    isError?: boolean
  }
  if (Array.isArray(r.content)) {
    const texts = r.content
      .map((c) => {
        if (c.type === 'text' && typeof c.text === 'string') return c.text
        try {
          return JSON.stringify(c)
        } catch {
          return String(c)
        }
      })
      .filter(Boolean)
    const body = texts.join('\n')
    if (r.isError) return `MCP error: ${body || 'tool returned isError'}`
    return body
  }
  try {
    return JSON.stringify(result)
  } catch {
    return String(result)
  }
}

function formatResourceContents(contents: unknown[]): string {
  if (!Array.isArray(contents) || contents.length === 0) return '(empty resource)'
  return contents
    .map((c) => {
      const item = c as { text?: string; blob?: string; uri?: string; mimeType?: string }
      if (typeof item.text === 'string') return item.text
      if (typeof item.blob === 'string') {
        return `[blob uri=${item.uri ?? ''} mime=${item.mimeType ?? ''} len=${item.blob.length}]`
      }
      try {
        return JSON.stringify(c)
      } catch {
        return String(c)
      }
    })
    .join('\n\n')
}

/** 进程内默认 manager（agent runtime 使用） */
let defaultManager: McpClientManager | null = null

export function getMcpClientManager(): McpClientManager {
  if (!defaultManager) defaultManager = new McpClientManager()
  return defaultManager
}

export function resetMcpClientManagerForTests(): void {
  defaultManager = null
}
