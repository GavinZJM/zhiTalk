import type { StructuredToolInterface } from '@langchain/core/tools'
import { style } from '../ui/style'
import { buildMcpLangChainTools } from './langchain_tools'
import {
  getMcpClientManager,
  type McpClientManager,
} from './client_manager'
import { formatMcpToolsCatalog } from './catalog'
import type { McpToolInfo } from './types'

export type McpRuntimeState = {
  manager: McpClientManager
  mcpTools: StructuredToolInterface[]
  toolInfos: McpToolInfo[]
  catalog: string
}

let runtime: McpRuntimeState | null = null

export function getMcpRuntimeState(): McpRuntimeState | null {
  return runtime
}

export function getMcpCatalogText(): string {
  return runtime?.catalog ?? '(no MCP servers connected)'
}

/**
 * 连接主配置 mcpServers 中的 servers，构建 LangChain MCP tools。
 * 单 server 失败会警告并跳过。
 */
export async function initMcpRuntime(options?: {
  configPath?: string
}): Promise<McpRuntimeState> {
  const manager = getMcpClientManager()
  await manager.connectFromConfig(undefined, {
    configPath: options?.configPath,
    onWarning: (msg) => {
      console.warn(style.commandError(`[MCP] ${msg}`))
    },
  })

  const toolInfos = manager.getAllTools()
  const mcpTools = buildMcpLangChainTools(manager)
  const catalog = formatMcpToolsCatalog(toolInfos)

  runtime = { manager, mcpTools, toolInfos, catalog }

  if (manager.connectedServerNames.length > 0) {
    console.log(
      style.commandOk(
        `[MCP] connected: ${manager.connectedServerNames.join(', ')} (${mcpTools.length} tools)`,
      ),
    )
  }

  return runtime
}

export async function shutdownMcpRuntime(): Promise<void> {
  if (!runtime) {
    await getMcpClientManager().closeAll()
    return
  }
  await runtime.manager.closeAll()
  runtime = null
}
