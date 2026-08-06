import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  clearZjmTalkConfigCache,
  ensureZjmTalkDataDir,
  formatConfigManual,
  getMCPServerConfig,
  getModelConfig,
  getTavilyApiKey,
  getZjmTalkConfigPath,
  getZjmTalkDataDir,
  getZjmTalkDir,
  loadZjmTalkConfig,
} from '../config'
import {
  clearModelConfigCache,
  getModelApiKey,
  getModelBaseUrl,
  getModelId,
  loadModelConfig,
} from './config'
import { createChatModel } from './model'

function writeTempConfig(body: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zjmTalk-cfg-'))
  const file = path.join(dir, 'zjmTalk.json')
  fs.writeFileSync(file, JSON.stringify(body, null, 2))
  return file
}

describe('zjmTalk config', () => {
  const prevConfig = process.env.ZJMTALK_CONFIG

  afterEach(() => {
    clearZjmTalkConfigCache()
    clearModelConfigCache()
    if (prevConfig === undefined) delete process.env.ZJMTALK_CONFIG
    else process.env.ZJMTALK_CONFIG = prevConfig
  })

  it('getZjmTalkDir uses os.homedir/.zjmTalk', () => {
    expect(getZjmTalkDir()).toBe(path.join(os.homedir(), '.zjmTalk'))
  })

  it('formatConfigManual lists config paths and fields', () => {
    const manual = formatConfigManual()
    expect(manual).toMatch(/配置手册/)
    expect(manual).toMatch(/最小可启动配置/)
    expect(manual.indexOf('最小可启动配置')).toBeLessThan(
      manual.indexOf('可选增强'),
    )
    expect(manual).toContain(getZjmTalkConfigPath())
    expect(manual).toContain(path.join(getZjmTalkDir(), 'skills'))
    expect(manual).toMatch(/model\.model/)
    expect(manual).toMatch(/mcpServers/)
    expect(manual).toMatch(/hooks/)
    expect(manual).toMatch(/ZJMTALK_CONFIG/)
    expect(manual).toMatch(/SKILL\.md/)
    expect(manual).toMatch(/PreToolUse/)
    expect(manual).toMatch(/TAVILY_API_KEY/)
    expect(manual).toMatch(/mkdir -p/)
  })

  it('getZjmTalkDataDir is ~/.zjmTalk/.data', () => {
    const prev = process.env.ZJMTALK_DATA_DIR
    delete process.env.ZJMTALK_DATA_DIR
    try {
      expect(getZjmTalkDataDir()).toBe(path.join(os.homedir(), '.zjmTalk', '.data'))
    } finally {
      if (prev === undefined) delete process.env.ZJMTALK_DATA_DIR
      else process.env.ZJMTALK_DATA_DIR = prev
    }
  })

  it('ensureZjmTalkDataDir creates the directory', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zjmTalk-data-'))
    const dataDir = path.join(dir, '.data')
    const prev = process.env.ZJMTALK_DATA_DIR
    try {
      process.env.ZJMTALK_DATA_DIR = dataDir
      expect(fs.existsSync(dataDir)).toBe(false)
      expect(ensureZjmTalkDataDir()).toBe(dataDir)
      expect(fs.existsSync(dataDir)).toBe(true)
    } finally {
      if (prev === undefined) delete process.env.ZJMTALK_DATA_DIR
      else process.env.ZJMTALK_DATA_DIR = prev
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('loads model and env from zjmTalk.json', () => {
    const file = writeTempConfig({
      model: {
        model: 'kimi-k2.6',
        apiKey: 'sk-test',
        baseURL: 'https://api.moonshot.cn/v1',
      },
      env: {
        TAVILY_API_KEY: 'tvly-test',
      },
    })
    process.env.ZJMTALK_CONFIG = file
    clearZjmTalkConfigCache()
    const cfg = loadZjmTalkConfig()
    expect(cfg.model).toEqual({
      model: 'kimi-k2.6',
      apiKey: 'sk-test',
      baseURL: 'https://api.moonshot.cn/v1',
    })
    expect(cfg.env).toEqual({ TAVILY_API_KEY: 'tvly-test' })
    expect(getModelConfig()).toEqual(cfg.model)
    expect(getModelId()).toBe('kimi-k2.6')
    expect(getModelApiKey()).toBe('sk-test')
    expect(getModelBaseUrl()).toBe('https://api.moonshot.cn/v1')
    expect(getTavilyApiKey()).toBe('tvly-test')
    expect(loadModelConfig()).toEqual(cfg.model)
  })

  it('getMCPServerConfig reads mcpServers from zjmTalk.json', () => {
    const file = writeTempConfig({
      model: {
        model: 'kimi-k2.6',
        apiKey: 'sk-test',
        baseURL: 'https://api.moonshot.cn/v1',
      },
      version: 1,
      mcpServers: {
        local: { command: 'npx', args: ['-y', 'demo'] },
      },
    })
    process.env.ZJMTALK_CONFIG = file
    clearZjmTalkConfigCache()
    expect(getMCPServerConfig()).toEqual({
      version: 1,
      mcpServers: {
        local: { command: 'npx', args: ['-y', 'demo'] },
      },
    })
  })

  it('getMCPServerConfig returns empty servers when omitted', () => {
    const file = writeTempConfig({
      model: {
        model: 'kimi-k2.6',
        apiKey: 'sk-test',
        baseURL: 'https://api.moonshot.cn/v1',
      },
    })
    process.env.ZJMTALK_CONFIG = file
    clearZjmTalkConfigCache()
    expect(getMCPServerConfig()).toEqual({ version: 1, mcpServers: {} })
  })

  it('throws when config file is missing', () => {
    const missing = path.join(os.tmpdir(), `zjmTalk-missing-${Date.now()}.json`)
    expect(() => loadZjmTalkConfig(missing)).toThrow(/未找到 zjmTalk 配置文件/)
    expect(() => loadZjmTalkConfig(missing)).toThrow(missing)
  })

  it('throws when model section is missing', () => {
    const file = writeTempConfig({ other: true })
    expect(() => loadZjmTalkConfig(file)).toThrow(/缺少 model 配置/)
  })

  it('throws when model fields are incomplete', () => {
    const file = writeTempConfig({
      model: { model: 'kimi-k2.6', apiKey: 'sk-x' },
    })
    expect(() => loadZjmTalkConfig(file)).toThrow(/model\.baseURL/)
  })

  it('allows missing env section', () => {
    const file = writeTempConfig({
      model: {
        model: 'kimi-k2.6',
        apiKey: 'sk-x',
        baseURL: 'https://api.moonshot.cn/v1',
      },
    })
    process.env.ZJMTALK_CONFIG = file
    clearZjmTalkConfigCache()
    expect(getTavilyApiKey()).toBeUndefined()
  })

  it('ZJMTALK_CONFIG overrides default path', () => {
    const file = writeTempConfig({
      model: {
        model: 'custom-model',
        apiKey: 'sk-y',
        baseURL: 'https://example.com/v1',
      },
    })
    process.env.ZJMTALK_CONFIG = file
    clearZjmTalkConfigCache()
    expect(getZjmTalkConfigPath()).toBe(path.resolve(file))
    expect(getModelId()).toBe('custom-model')
  })

  it('createChatModel builds ChatOpenAI from config', () => {
    const model = createChatModel({
      config: {
        model: 'kimi-k2.6',
        apiKey: 'sk-z',
        baseURL: 'https://api.moonshot.cn/v1',
      },
      streaming: false,
      streamUsage: false,
    })
    expect(model).toBeDefined()
    expect(typeof model.invoke).toBe('function')
  })
})
