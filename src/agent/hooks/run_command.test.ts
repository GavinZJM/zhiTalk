import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { runHookCommand } from './run_command'
import type { HookDefinition, HookPayload } from './types'

function writeScript(dir: string, name: string, body: string): string {
  const file = path.join(dir, name)
  fs.writeFileSync(file, body, { mode: 0o755 })
  return file
}

const basePayload: HookPayload = {
  hook_event_name: 'PreToolUse',
  cwd: process.cwd(),
  thread_id: 't1',
  tool_name: 'exec',
}

describe('runHookCommand', () => {
  let tmp: string

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zjmTalk-hooks-'))
  })

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('exit 0 → continue', async () => {
    const script = writeScript(
      tmp,
      'ok.sh',
      '#!/bin/sh\necho hi >&2\nexit 0\n',
    )
    const def: HookDefinition = { command: script }
    const d = await runHookCommand(def, basePayload, { cwd: tmp })
    expect(d.action).toBe('continue')
    expect(d.exitCode).toBe(0)
  })

  it('exit 1 → block with stderr', async () => {
    const script = writeScript(
      tmp,
      'block.sh',
      '#!/bin/sh\necho denied >&2\nexit 1\n',
    )
    const d = await runHookCommand(
      { command: script },
      basePayload,
      { cwd: tmp },
    )
    expect(d.action).toBe('block')
    expect(d.message).toContain('denied')
  })

  it('exit 2 → inject with stderr', async () => {
    const script = writeScript(
      tmp,
      'inject.sh',
      '#!/bin/sh\necho note-for-agent >&2\nexit 2\n',
    )
    const d = await runHookCommand(
      { command: script },
      basePayload,
      { cwd: tmp },
    )
    expect(d.action).toBe('inject')
    expect(d.message).toContain('note-for-agent')
  })

  it('timeout fail-open → continue', async () => {
    const script = writeScript(
      tmp,
      'slow.sh',
      '#!/bin/sh\nsleep 5\nexit 0\n',
    )
    const d = await runHookCommand(
      { command: script, timeout: 1 },
      basePayload,
      { cwd: tmp },
    )
    expect(d.action).toBe('continue')
  }, 15000)

  it('timeout failClosed → block', async () => {
    const script = writeScript(
      tmp,
      'slow2.sh',
      '#!/bin/sh\nsleep 5\nexit 0\n',
    )
    const d = await runHookCommand(
      { command: script, timeout: 1, failClosed: true },
      basePayload,
      { cwd: tmp },
    )
    expect(d.action).toBe('block')
    expect(d.message).toMatch(/timed out/i)
  }, 15000)
})
