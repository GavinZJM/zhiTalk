import {
  CommandRegistry,
  createCommandRegistry,
  createThreadId,
  looksLikeCommand,
  parseCommand,
} from './index'

describe('parseCommand', () => {
  it('parses bare /new', () => {
    expect(parseCommand('/new')).toEqual({
      name: 'new',
      args: [],
      raw: '/new',
    })
  })

  it('parses args and quoted tokens', () => {
    expect(parseCommand('/rewind abc-123')).toEqual({
      name: 'rewind',
      args: ['abc-123'],
      raw: '/rewind abc-123',
    })
    expect(parseCommand('/skill "brain storm"')).toEqual({
      name: 'skill',
      args: ['brain storm'],
      raw: '/skill "brain storm"',
    })
    expect(parseCommand(`/skill 'x y' z`)).toEqual({
      name: 'skill',
      args: ['x y', 'z'],
      raw: `/skill 'x y' z`,
    })
  })

  it('lowercases command name', () => {
    expect(parseCommand('/NEW')).toMatchObject({ name: 'new', args: [] })
  })

  it('returns null for non-commands', () => {
    expect(parseCommand('hello')).toBeNull()
    expect(parseCommand('  hello /new')).toBeNull()
  })
})

describe('looksLikeCommand', () => {
  it('detects leading slash', () => {
    expect(looksLikeCommand('/new')).toBe(true)
    expect(looksLikeCommand('  /sessions')).toBe(true)
    expect(looksLikeCommand('please /new')).toBe(false)
  })
})

describe('CommandRegistry + /new', () => {
  it('registers /new and switches thread id', async () => {
    const registry = createCommandRegistry()
    let threadId = 'user-session-1'
    const ctx = {
      get threadId() {
        return threadId
      },
      setThreadId(next: string) {
        threadId = next
      },
    }

    const result = await registry.dispatch('/new', ctx)
    expect(result).toMatchObject({ type: 'ok' })
    expect(threadId).toMatch(/^session-/)
    expect(threadId).not.toBe('user-session-1')
    expect(result?.type === 'ok' && result.message).toContain(threadId)
  })

  it('supports alias /n', async () => {
    const registry = createCommandRegistry()
    let threadId = 'old'
    const result = await registry.dispatch('/n', {
      get threadId() {
        return threadId
      },
      setThreadId(next) {
        threadId = next
      },
    })
    expect(result?.type).toBe('ok')
    expect(threadId).toMatch(/^session-/)
  })

  it('returns error for unknown command without calling AI path', async () => {
    const registry = createCommandRegistry()
    const result = await registry.dispatch('/skill abc', {
      threadId: 't1',
      setThreadId: () => undefined,
    })
    expect(result).toEqual({
      type: 'error',
      message: 'Unknown command: /skill. Try /new',
    })
  })

  it('returns null for normal chat so caller can send to AI', async () => {
    const registry = new CommandRegistry()
    const result = await registry.dispatch('你好', {
      threadId: 't1',
      setThreadId: () => undefined,
    })
    expect(result).toBeNull()
  })

  it('createThreadId is unique', () => {
    expect(createThreadId()).not.toBe(createThreadId())
  })
})
