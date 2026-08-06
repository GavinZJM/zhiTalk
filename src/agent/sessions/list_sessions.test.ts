import Database from 'better-sqlite3'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  formatRelativeTime,
  formatSessionsTable,
  listRecentSessions,
  truncateText,
} from './list_sessions'
import { createCommandRegistry } from '../commands'

function createTempDb(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zjmTalk-sessions-'))
  const dbPath = path.join(dir, 'checkpointer.db')
  const db = new Database(dbPath)
  db.exec(`
    CREATE TABLE checkpoints (
      thread_id TEXT NOT NULL,
      checkpoint_ns TEXT NOT NULL DEFAULT '',
      checkpoint_id TEXT NOT NULL,
      parent_checkpoint_id TEXT,
      type TEXT,
      checkpoint BLOB,
      metadata BLOB,
      PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
    );
  `)

  const insert = db.prepare(`
    INSERT INTO checkpoints (thread_id, checkpoint_ns, checkpoint_id, type, checkpoint, metadata)
    VALUES (?, '', ?, 'json', ?, '{}')
  `)

  const older = {
    ts: '2026-07-22T10:00:00.000Z',
    channel_values: {
      messages: [
        {
          lc: 1,
          type: 'constructor',
          id: ['langchain_core', 'messages', 'HumanMessage'],
          kwargs: { content: '旧问题' },
        },
      ],
    },
  }
  const newer = {
    ts: '2026-07-22T12:00:00.000Z',
    channel_values: {
      messages: [
        {
          lc: 1,
          type: 'constructor',
          id: ['langchain_core', 'messages', 'HumanMessage'],
          kwargs: {
            content: `${'测'.repeat(60)}长问题`,
          },
        },
        {
          lc: 1,
          type: 'constructor',
          id: ['langchain_core', 'messages', 'AIMessage'],
          kwargs: { content: '回复' },
        },
      ],
    },
  }

  insert.run('thread-old', 'cp-1', Buffer.from(JSON.stringify(older)))
  insert.run('thread-new', 'cp-2', Buffer.from(JSON.stringify(newer)))
  // 同 thread 更早的 checkpoint，应被忽略
  insert.run(
    'thread-new',
    'cp-0',
    Buffer.from(
      JSON.stringify({
        ts: '2026-07-22T11:00:00.000Z',
        channel_values: {
          messages: [
            {
              id: ['HumanMessage'],
              kwargs: { content: '中间问题不应出现' },
            },
          ],
        },
      }),
    ),
  )
  db.close()
  return dbPath
}

describe('truncateText / formatRelativeTime', () => {
  it('truncates to 50 chars', () => {
    const s = '字'.repeat(60)
    expect(truncateText(s, 50)).toBe('字'.repeat(50) + '…')
  })

  it('formats relative time in Chinese', () => {
    const now = new Date('2026-07-22T12:00:00.000Z')
    expect(formatRelativeTime(new Date('2026-07-22T11:59:30.000Z'), now)).toBe(
      '刚刚',
    )
    expect(formatRelativeTime(new Date('2026-07-22T11:55:00.000Z'), now)).toBe(
      '5分钟',
    )
    expect(formatRelativeTime(new Date('2026-07-22T10:00:00.000Z'), now)).toBe(
      '2小时',
    )
    expect(formatRelativeTime(new Date('2026-07-20T12:00:00.000Z'), now)).toBe(
      '2天',
    )
  })
})

describe('listRecentSessions', () => {
  let dbPath: string

  beforeAll(() => {
    dbPath = createTempDb()
  })

  afterAll(() => {
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true })
  })

  it('returns sessions newest first with last user question', () => {
    const sessions = listRecentSessions({ dbPath, limit: 20 })
    expect(sessions.map((s) => s.threadId)).toEqual([
      'thread-new',
      'thread-old',
    ])
    expect(sessions[0].lastUserMessage.startsWith('测')).toBe(true)
    expect(sessions[0].lastUserMessage.length).toBeGreaterThan(50)
    expect(sessions[1].lastUserMessage).toBe('旧问题')
  })

  it('formats cli-table3 with full thread_id and truncated question', () => {
    const sessions = listRecentSessions({ dbPath })
    const table = formatSessionsTable(sessions, {
      now: new Date('2026-07-22T12:00:30.000Z'),
    })
    expect(table).toContain('thread_id')
    expect(table).toContain('最后用户输入的问题')
    expect(table).toContain('时间')
    expect(table).toContain('thread-new')
    expect(table).toContain('thread-old')
    expect(truncateText(sessions[0].lastUserMessage, 50).endsWith('…')).toBe(
      true,
    )
    expect(table).toContain(truncateText(sessions[0].lastUserMessage, 50))
    expect(table).toContain('刚刚')
    expect(table).toContain('2小时')
    // cli-table3 box-drawing borders
    expect(table).toMatch(/[│├└┌]/)
  })
})

describe('/sessions command', () => {
  it('dispatches without touching LLM and returns a table', async () => {
    const dbPath = createTempDb()
    const dataDir = path.dirname(dbPath)
    const prevDataDir = process.env.ZJMTALK_DATA_DIR
    try {
      // getCheckpointerDbPath 使用 ~/.zjmTalk/.data 或 ZJMTALK_DATA_DIR
      process.env.ZJMTALK_DATA_DIR = dataDir

      const registry = createCommandRegistry()
      const result = await registry.dispatch('/sessions', {
        threadId: 'current',
        setThreadId: () => undefined,
      })
      expect(result?.type).toBe('ok')
      expect(result?.type === 'ok' && result.message).toContain('thread-new')
      expect(result?.type === 'ok' && result.message).toContain('thread_id')
      expect(result?.type === 'ok' && result.message).toMatch(/[│├└┌]/)
    } finally {
      if (prevDataDir === undefined) delete process.env.ZJMTALK_DATA_DIR
      else process.env.ZJMTALK_DATA_DIR = prevDataDir
      fs.rmSync(dataDir, { recursive: true, force: true })
    }
  })
})
