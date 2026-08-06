import { z } from 'zod'
import {
  boundMcpToolName,
  McpClientManager,
} from './client_manager'
import {
  jsonSchemaToZod,
  mcpToolInfoToLangChainTool,
} from './langchain_tools'
import { formatMcpToolsCatalog } from './catalog'

describe('boundMcpToolName', () => {
  it('prefixes and sanitizes', () => {
    expect(boundMcpToolName('file system', 'read/file')).toBe(
      'mcp_file_system_read_file',
    )
  })
})

describe('jsonSchemaToZod', () => {
  it('builds object schema with required string', () => {
    const schema = jsonSchemaToZod({
      type: 'object',
      properties: {
        path: { type: 'string' },
        n: { type: 'number' },
      },
      required: ['path'],
    })
    expect(schema.parse({ path: '/tmp' })).toEqual({ path: '/tmp' })
    expect(() => schema.parse({})).toThrow()
  })

  it('falls back for non-object', () => {
    const schema = jsonSchemaToZod(undefined)
    expect(schema.parse({ a: 1 })).toEqual({ a: 1 })
  })
})

describe('mcpToolInfoToLangChainTool', () => {
  it('creates network tool that calls manager', async () => {
    const manager = {
      callTool: jest.fn(async () => 'ok-result'),
    } as unknown as McpClientManager

    const lc = mcpToolInfoToLangChainTool(
      {
        serverName: 'demo',
        name: 'echo',
        boundName: 'mcp_demo_echo',
        description: 'Echo something',
        inputSchema: {
          type: 'object',
          properties: { text: { type: 'string' } },
          required: ['text'],
        },
      },
      manager,
    )

    expect(lc.name).toBe('mcp_demo_echo')
    expect((lc as { permission_level?: string }).permission_level).toBe(
      'network',
    )
    await expect(lc.invoke({ text: 'hi' })).resolves.toBe('ok-result')
    expect(manager.callTool).toHaveBeenCalledWith('mcp_demo_echo', {
      text: 'hi',
    })
  })
})

describe('formatMcpToolsCatalog', () => {
  it('groups by server', () => {
    const text = formatMcpToolsCatalog([
      {
        serverName: 'a',
        name: 't1',
        boundName: 'mcp_a_t1',
        description: 'one',
      },
      {
        serverName: 'a',
        name: 't2',
        boundName: 'mcp_a_t2',
      },
    ])
    expect(text).toContain('server: a')
    expect(text).toContain('mcp_a_t1')
    expect(text).toContain('mcp_a_t2')
  })

  it('empty list message', () => {
    expect(formatMcpToolsCatalog([])).toMatch(/no MCP/i)
  })
})

describe('jsonSchemaToZod zod version smoke', () => {
  it('optional number works', () => {
    const s = jsonSchemaToZod({
      type: 'object',
      properties: { n: { type: 'integer' } },
    })
    expect(s).toBeInstanceOf(z.ZodType)
  })
})
