import type { McpToolInfo } from './types'

/** 写入 system prompt 的 MCP 工具目录（简短） */
export function formatMcpToolsCatalog(tools: McpToolInfo[]): string {
  if (tools.length === 0) {
    return '(no MCP servers connected)'
  }

  const byServer = new Map<string, McpToolInfo[]>()
  for (const t of tools) {
    const list = byServer.get(t.serverName) ?? []
    list.push(t)
    byServer.set(t.serverName, list)
  }

  const blocks: string[] = []
  for (const [server, list] of byServer) {
    const lines = list.map((t) => {
      const desc = t.description?.trim().replace(/\s+/g, ' ') ?? ''
      const short = desc.length > 120 ? `${desc.slice(0, 117)}...` : desc
      return short
        ? `- ${t.boundName} (${t.name}): ${short}`
        : `- ${t.boundName} (${t.name})`
    })
    blocks.push(`### server: ${server}\n${lines.join('\n')}`)
  }
  return blocks.join('\n\n')
}
