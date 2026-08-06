import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { clearZjmTalkConfigCache } from '../config'
import {
  defaultMcpConfigPath,
  interpolateEnv,
  loadMcpConfig,
} from './config'

describe('interpolateEnv', () => {
  it('replaces ${VAR} from env', () => {
    expect(
      interpolateEnv('Bearer ${MCP_TOKEN}', { MCP_TOKEN: 'secret' }),
    ).toBe('Bearer secret')
  })

  it('missing vars become empty string', () => {
    expect(interpolateEnv('x${MISSING}y', {})).toBe('xy')
  })
})

describe('loadMcpConfig', () => {
  let tmp: string

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zjmTalk-mcp-cfg-'))
  })

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('returns empty servers when file missing', () => {
    const cfg = loadMcpConfig(path.join(tmp, 'nope.json'))
    expect(cfg.mcpServers).toEqual({})
  })

  it('loads stdio and http servers with env interpolation', () => {
    const file = path.join(tmp, 'mcp.json')
    fs.writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        mcpServers: {
          local: {
            command: 'npx',
            args: ['-y', 'demo'],
            env: { TOKEN: '${MCP_TOKEN}' },
          },
          remote: {
            url: 'https://example.com/mcp',
            headers: { Authorization: 'Bearer ${MCP_TOKEN}' },
          },
        },
      }),
      'utf8',
    )

    const cfg = loadMcpConfig(file, { MCP_TOKEN: 'abc' })
    expect(cfg.mcpServers?.local).toMatchObject({
      command: 'npx',
      env: { TOKEN: 'abc' },
    })
    expect(cfg.mcpServers?.remote).toMatchObject({
      url: 'https://example.com/mcp',
      headers: { Authorization: 'Bearer abc' },
    })
  })

  it('rejects invalid server entries', () => {
    const file = path.join(tmp, 'bad.json')
    fs.writeFileSync(
      file,
      JSON.stringify({ mcpServers: { bad: { foo: 1 } } }),
      'utf8',
    )
    expect(() => loadMcpConfig(file)).toThrow(/Invalid MCP server/)
  })

  it('ignores unknown fields like type on http servers', () => {
    const file = path.join(tmp, 'typed.json')
    fs.writeFileSync(
      file,
      JSON.stringify({
        mcpServers: {
          github: {
            type: 'http',
            url: 'https://api.githubcopilot.com/mcp/',
            headers: { Authorization: 'Bearer ${GITHUB_PERSONAL_ACCESS_TOKEN}' },
          },
        },
      }),
      'utf8',
    )
    const cfg = loadMcpConfig(file, {
      GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_test',
    })
    expect(cfg.mcpServers?.github).toMatchObject({
      url: 'https://api.githubcopilot.com/mcp/',
      headers: { Authorization: 'Bearer ghp_test' },
    })
  })

  it('loads from getMCPServerConfig when no path given', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zjmTalk-mcp-main-'))
    const file = path.join(dir, 'zjmTalk.json')
    fs.writeFileSync(
      file,
      JSON.stringify({
        model: {
          model: 'kimi-k2.6',
          apiKey: 'sk-test',
          baseURL: 'https://api.moonshot.cn/v1',
        },
        version: 1,
        mcpServers: {
          remote: {
            url: 'https://example.com/mcp',
            headers: { Authorization: 'Bearer ${MCP_TOKEN}' },
          },
        },
      }),
      'utf8',
    )
    const prevConfig = process.env.ZJMTALK_CONFIG
    const prevMcp = process.env.ZJMTALK_MCP_CONFIG
    process.env.ZJMTALK_CONFIG = file
    delete process.env.ZJMTALK_MCP_CONFIG
    clearZjmTalkConfigCache()
    try {
      const cfg = loadMcpConfig(undefined, { MCP_TOKEN: 'abc' })
      expect(cfg.mcpServers?.remote).toMatchObject({
        url: 'https://example.com/mcp',
        headers: { Authorization: 'Bearer abc' },
      })
    } finally {
      clearZjmTalkConfigCache()
      if (prevConfig === undefined) delete process.env.ZJMTALK_CONFIG
      else process.env.ZJMTALK_CONFIG = prevConfig
      if (prevMcp === undefined) delete process.env.ZJMTALK_MCP_CONFIG
      else process.env.ZJMTALK_MCP_CONFIG = prevMcp
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('defaultMcpConfigPath points at zjmTalk.json', () => {
    const prev = process.env.ZJMTALK_MCP_CONFIG
    delete process.env.ZJMTALK_MCP_CONFIG
    try {
      expect(defaultMcpConfigPath()).toMatch(/zjmTalk\.json$/)
    } finally {
      if (prev === undefined) delete process.env.ZJMTALK_MCP_CONFIG
      else process.env.ZJMTALK_MCP_CONFIG = prev
    }
  })
})
