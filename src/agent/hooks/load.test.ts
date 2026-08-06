import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { getZjmTalkConfigPath } from '../config'
import {
  clearHooksConfigCache,
  defaultHooksConfigPath,
  getHooksForEvent,
  loadHooksConfig,
} from './load'

describe('loadHooksConfig from zjmTalk.json', () => {
  let tmp: string
  let prevConfig: string | undefined

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zjmTalk-hooks-load-'))
    prevConfig = process.env.ZJMTALK_CONFIG
    clearHooksConfigCache()
  })

  afterEach(() => {
    clearHooksConfigCache()
    if (prevConfig === undefined) delete process.env.ZJMTALK_CONFIG
    else process.env.ZJMTALK_CONFIG = prevConfig
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('defaultHooksConfigPath uses getZjmTalkConfigPath', () => {
    expect(defaultHooksConfigPath()).toBe(getZjmTalkConfigPath())
  })

  it('reads hooks from ~/.zjmTalk/zjmTalk.json and ignores model/env', () => {
    const file = path.join(tmp, 'zjmTalk.json')
    fs.writeFileSync(
      file,
      JSON.stringify({
        model: {
          model: 'kimi',
          apiKey: 'sk',
          baseURL: 'https://example.com',
        },
        env: { TAVILY_API_KEY: 'tvly' },
        version: 1,
        hooks: {
          PreToolUse: [{ matcher: 'exec', command: 'true' }],
        },
      }),
      'utf8',
    )
    process.env.ZJMTALK_CONFIG = file

    const cfg = loadHooksConfig()
    expect(cfg.version).toBe(1)
    expect(cfg.hooks.PreToolUse).toEqual([
      { matcher: 'exec', command: 'true' },
    ])
    expect(getHooksForEvent('PostToolUse')).toEqual([])
  })

  it('returns empty hooks when section missing', () => {
    const file = path.join(tmp, 'zjmTalk.json')
    fs.writeFileSync(
      file,
      JSON.stringify({
        model: { model: 'm', apiKey: 'k', baseURL: 'https://x' },
      }),
      'utf8',
    )
    expect(loadHooksConfig(file)).toEqual({ version: 1, hooks: {} })
  })
})
