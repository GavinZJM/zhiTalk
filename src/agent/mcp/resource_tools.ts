import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { withPermissionLevel } from '../tools/permission'
import { getMcpClientManager } from './client_manager'

const listSchema = z.object({})

export const list_mcp_resources_tool = withPermissionLevel(
  tool(
    async () => {
      const manager = getMcpClientManager()
      const resources = await manager.listResources()
      if (resources.length === 0) {
        return 'No MCP resources available (no servers connected or none expose resources).'
      }
      return resources
        .map(
          (r) =>
            `- server=${r.serverName} uri=${r.uri}` +
            (r.name ? ` name=${r.name}` : '') +
            (r.mimeType ? ` mime=${r.mimeType}` : '') +
            (r.description ? `\n  ${r.description}` : ''),
        )
        .join('\n')
    },
    {
      name: 'list_mcp_resources',
      description:
        'List resources exposed by connected MCP servers (uri, server name, optional description).',
      schema: listSchema,
    },
  ),
  'network',
)

const readSchema = z.object({
  server: z
    .string()
    .describe(
      'MCP server name as configured in ~/.zjmTalk/zjmTalk.json mcpServers (e.g. filesystem).',
    ),
  uri: z.string().describe('Resource URI returned by list_mcp_resources.'),
})

export const read_mcp_resource_tool = withPermissionLevel(
  tool(
    async ({ server, uri }) => {
      const manager = getMcpClientManager()
      return manager.readResource(server, uri)
    },
    {
      name: 'read_mcp_resource',
      description:
        'Read one MCP resource by server name and uri. Prefer listing resources first with list_mcp_resources.',
      schema: readSchema,
    },
  ),
  'network',
)

export const mcpResourceTools = [
  list_mcp_resources_tool,
  read_mcp_resource_tool,
]
