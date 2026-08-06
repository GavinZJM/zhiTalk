import { tool } from '@langchain/core/tools'
import type { StructuredToolInterface } from '@langchain/core/tools'
import { z } from 'zod'
import { withPermissionLevel } from '../tools/permission'
import type { McpClientManager } from './client_manager'
import type { McpToolInfo } from './types'

/**
 * 将简单 JSON Schema object 转为 Zod（足够覆盖常见 MCP inputSchema）。
 * 复杂 schema 退化为 passthrough object。
 */
export function jsonSchemaToZod(
  schema: Record<string, unknown> | undefined,
): z.ZodTypeAny {
  if (!schema || schema.type !== 'object') {
    return z.record(z.string(), z.any())
  }

  const props = (schema.properties ?? {}) as Record<string, Record<string, unknown>>
  const required = new Set(
    Array.isArray(schema.required)
      ? (schema.required as string[])
      : [],
  )
  const shape: Record<string, z.ZodTypeAny> = {}

  for (const [key, prop] of Object.entries(props)) {
    let field = zodForProp(prop)
    if (!required.has(key)) {
      field = field.optional()
    }
    shape[key] = field
  }

  if (Object.keys(shape).length === 0) {
    return z.record(z.string(), z.any())
  }

  return z.object(shape).passthrough()
}

function zodForProp(prop: Record<string, unknown> | undefined): z.ZodTypeAny {
  if (!prop || typeof prop !== 'object') return z.any()
  const t = prop.type
  if (t === 'string') return z.string()
  if (t === 'number' || t === 'integer') return z.number()
  if (t === 'boolean') return z.boolean()
  if (t === 'array') return z.array(z.any())
  if (t === 'object') return z.record(z.string(), z.any())
  if (Array.isArray(t)) {
    // union types e.g. ["string","null"]
    return z.any()
  }
  return z.any()
}

export function mcpToolInfoToLangChainTool(
  info: McpToolInfo,
  manager: McpClientManager,
): StructuredToolInterface {
  const schema = jsonSchemaToZod(info.inputSchema)
  const description =
    info.description?.trim() ||
    `MCP tool "${info.name}" from server "${info.serverName}"`

  const lcTool = tool(
    async (input: Record<string, unknown>) => {
      const args =
        input && typeof input === 'object' && !Array.isArray(input)
          ? (input as Record<string, unknown>)
          : {}
      return manager.callTool(info.boundName, args)
    },
    {
      name: info.boundName,
      description,
      schema,
    },
  )

  return withPermissionLevel(lcTool, 'network')
}

export function buildMcpLangChainTools(
  manager: McpClientManager,
): StructuredToolInterface[] {
  return manager.getAllTools().map((info) => mcpToolInfoToLangChainTool(info, manager))
}
