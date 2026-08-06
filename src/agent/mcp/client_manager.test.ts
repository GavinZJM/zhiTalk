import {
  McpClientManager,
  assertHttpAuthHeaders,
} from './client_manager'

describe('assertHttpAuthHeaders', () => {
  it('allows missing headers and non-Authorization headers', () => {
    expect(() => assertHttpAuthHeaders('gh', undefined)).not.toThrow()
    expect(() =>
      assertHttpAuthHeaders('gh', { 'X-MCP-Readonly': 'true' }),
    ).not.toThrow()
    expect(() =>
      assertHttpAuthHeaders('gh', { Authorization: 'Bearer tok' }),
    ).not.toThrow()
  })

  it('rejects empty Authorization after interpolation', () => {
    expect(() => assertHttpAuthHeaders('github', { Authorization: '' })).toThrow(
      /Authorization header is empty/,
    )
    expect(() =>
      assertHttpAuthHeaders('github', { Authorization: 'Bearer ' }),
    ).toThrow(/Bearer token is empty/)
    expect(() =>
      assertHttpAuthHeaders('github', { authorization: 'Bearer' }),
    ).toThrow(/Bearer token is empty/)
  })
})

describe('McpClientManager', () => {
  it('starts empty and callTool returns unknown tool error', async () => {
    const mgr = new McpClientManager()
    expect(mgr.connectedServerNames).toEqual([])
    expect(mgr.getAllTools()).toEqual([])
    await expect(mgr.callTool('mcp_x_y', {})).resolves.toMatch(/unknown tool/)
  })

  it('connectFromConfig with empty servers is a no-op', async () => {
    const mgr = new McpClientManager()
    const warnings: string[] = []
    await mgr.connectFromConfig(
      { version: 1, mcpServers: {} },
      { onWarning: (m) => warnings.push(m) },
    )
    expect(mgr.connectedServerNames).toEqual([])
    expect(warnings).toEqual([])
  })

  it('isolates a failing server without throwing', async () => {
    const mgr = new McpClientManager()
    const warnings: string[] = []
    await mgr.connectFromConfig(
      {
        version: 1,
        mcpServers: {
          bad: {
            command: 'this-binary-does-not-exist-zjmTalk-mcp',
            args: [],
          },
        },
      },
      { onWarning: (m) => warnings.push(m) },
    )
    expect(mgr.connectedServerNames).toEqual([])
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings[0]).toMatch(/bad/)
  }, 20000)

  it('fail-opens HTTP server with empty Authorization Bearer', async () => {
    const mgr = new McpClientManager()
    const warnings: string[] = []
    await mgr.connectFromConfig(
      {
        version: 1,
        mcpServers: {
          github: {
            url: 'https://api.githubcopilot.com/mcp/',
            headers: { Authorization: 'Bearer ' },
          },
        },
      },
      { onWarning: (m) => warnings.push(m) },
    )
    expect(mgr.connectedServerNames).toEqual([])
    expect(
      warnings.some(
        (w) => /github/i.test(w) && /Bearer token is empty/i.test(w),
      ),
    ).toBe(true)
  })
})
