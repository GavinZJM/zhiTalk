import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { clearHooksConfigCache } from './load'
import { formatHookInjection, runHooks } from './dispatch'

function writeScript(dir: string, name: string, body: string): string {
  const file = path.join(dir, name)
  fs.writeFileSync(file, body, { mode: 0o755 })
  return file
}

describe('runHooks aggregation', () => {
  let tmp: string
  let configPath: string

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zjmTalk-hooks-cfg-'))
    clearHooksConfigCache()
  })

  afterEach(() => {
    clearHooksConfigCache()
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  function writeConfig(hooks: unknown): void {
    configPath = path.join(tmp, 'zjmTalk.json')
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        model: {
          model: 'test',
          apiKey: 'sk-test',
          baseURL: 'https://example.com/v1',
        },
        version: 1,
        hooks,
      }),
      'utf8',
    )
  }

  it('skips non-matching matcher', async () => {
    const script = writeScript(
      tmp,
      'never.sh',
      '#!/bin/sh\necho should-not-run >&2\nexit 1\n',
    )
    writeConfig({
      PreToolUse: [{ matcher: 'exec', command: script }],
    })

    const r = await runHooks(
      'PreToolUse',
      { thread_id: 't', tool_name: 'read_file' },
      { configPath, matchAgainst: 'read_file', cwd: tmp },
    )
    expect(r.blocked).toBe(false)
    expect(r.decisions).toHaveLength(0)
  })

  it('first block stops the chain', async () => {
    const block = writeScript(
      tmp,
      'block.sh',
      '#!/bin/sh\necho stop >&2\nexit 1\n',
    )
    const later = writeScript(
      tmp,
      'later.sh',
      '#!/bin/sh\necho later >&2\nexit 2\n',
    )
    writeConfig({
      PreToolUse: [
        { matcher: 'exec', command: block },
        { matcher: 'exec', command: later },
      ],
    })

    const r = await runHooks(
      'PreToolUse',
      { thread_id: 't', tool_name: 'exec' },
      { configPath, matchAgainst: 'exec', cwd: tmp },
    )
    expect(r.blocked).toBe(true)
    expect(r.blockMessage).toContain('stop')
    expect(r.decisions).toHaveLength(1)
    expect(r.injections).toHaveLength(0)
  })

  it('accumulates inject then continues', async () => {
    const a = writeScript(
      tmp,
      'a.sh',
      '#!/bin/sh\necho note-a >&2\nexit 2\n',
    )
    const b = writeScript(
      tmp,
      'b.sh',
      '#!/bin/sh\necho note-b >&2\nexit 2\n',
    )
    const c = writeScript(tmp, 'c.sh', '#!/bin/sh\nexit 0\n')
    writeConfig({
      PreToolUse: [
        { matcher: 'exec', command: a },
        { matcher: 'exec', command: b },
        { matcher: 'exec', command: c },
      ],
    })

    const r = await runHooks(
      'PreToolUse',
      { thread_id: 't', tool_name: 'exec' },
      { configPath, matchAgainst: 'exec', cwd: tmp },
    )
    expect(r.blocked).toBe(false)
    expect(r.injections).toEqual(['note-a', 'note-b'])
    expect(r.decisions).toHaveLength(3)
  }, 15000)

  it('formatHookInjection prefixes event', () => {
    expect(formatHookInjection('PreToolUse', ' hello ')).toBe(
      '[hook:PreToolUse]\nhello',
    )
    expect(formatHookInjection('PostToolUse', '  ')).toBe('')
  })
})
