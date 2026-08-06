/** MCP Client 配置与运行时类型 */

export type McpStdioServerConfig = {
  command: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
}

export type McpHttpServerConfig = {
  url: string
  headers?: Record<string, string>
}

export type McpServerConfig = McpStdioServerConfig | McpHttpServerConfig

export type McpConfigFile = {
  version?: number
  mcpServers?: Record<string, McpServerConfig>
}

export type McpToolInfo = {
  serverName: string
  name: string
  /** LangChain / model 侧工具名：mcp_{server}_{tool} */
  boundName: string
  description?: string
  inputSchema?: Record<string, unknown>
}

export type McpResourceInfo = {
  serverName: string
  uri: string
  name?: string
  description?: string
  mimeType?: string
}

export function isStdioServerConfig(
  cfg: McpServerConfig,
): cfg is McpStdioServerConfig {
  return typeof (cfg as McpStdioServerConfig).command === 'string'
}

export function isHttpServerConfig(
  cfg: McpServerConfig,
): cfg is McpHttpServerConfig {
  return typeof (cfg as McpHttpServerConfig).url === 'string'
}
