import Database from 'better-sqlite3'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { threadExists } from './thread_exists'
import { createCommandRegistry } from '../commands'

function createTempDbWithThread(threadId: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zjmTalk-rewind-'))
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
  db.prepare(
    `
    INSERT INTO checkpoints (thread_id, checkpoint_ns, checkpoint_id, type, checkpoint, metadata)
    VALUES (?, '', 'cp-1', 'json', ?, '{}')
  `,
  ).run(
    threadId,
    Buffer.from(
      JSON.stringify({
        ts: '2026-07-22T12:00:00.000Z',
        channel_values: { messages: [] },
      }),
    ),
  )
  db.close()
  return dbPath
}

describe('threadExists', () => {
  it('returns true only when thread_id is present', () => {
    const dbPath = createTempDbWithThread('session-abc')
    try {
      expect(threadExists('session-abc', { dbPath })).toBe(true)
      expect(threadExists('missing', { dbPath })).toBe(false)
      expect(threadExists('  ', { dbPath })).toBe(false)
    } finally {
      fs.rmSync(path.dirname(dbPath), { recursive: true, force: true })
    }
  })
})

describe('/rewind command', () => {
  it('switches thread_id when target exists', async () => {
    const dbPath = createTempDbWithThread('session-target')
    const dataDir = path.dirname(dbPath)
    const prevDataDir = process.env.ZJMTALK_DATA_DIR
    try {
      process.env.ZJMTALK_DATA_DIR = dataDir

      let threadId = 'user-session-1'
      const registry = createCommandRegistry()
      const result = await registry.dispatch('/rewind session-target', {
        get threadId() {
          return threadId
        },
        setThreadId(next) {
          threadId = next
        },
      })

      expect(result).toMatchObject({ type: 'ok' })
      expect(threadId).toBe('session-target')
      expect(result?.type === 'ok' && result.message).toContain('session-target')
    } finally {
      if (prevDataDir === undefined) delete process.env.ZJMTALK_DATA_DIR
      else process.env.ZJMTALK_DATA_DIR = prevDataDir
      fs.rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it('errors when thread_id is missing or unknown', async () => {
    const dbPath = createTempDbWithThread('session-only')
    const dataDir = path.dirname(dbPath)
    const prevDataDir = process.env.ZJMTALK_DATA_DIR
    try {
      process.env.ZJMTALK_DATA_DIR = dataDir

      const registry = createCommandRegistry()
      const missingArg = await registry.dispatch('/rewind', {
        threadId: 't1',
        setThreadId: () => undefined,
      })
      expect(missingArg).toEqual({
        type: 'error',
        message: 'Usage: /rewind <thread_id>',
      })

      const unknown = await registry.dispatch('/rewind no-such-thread', {
        threadId: 't1',
        setThreadId: () => undefined,
      })
      expect(unknown).toEqual({
        type: 'error',
        message: 'Thread not found: no-such-thread',
      })
    } finally {
      if (prevDataDir === undefined) delete process.env.ZJMTALK_DATA_DIR
      else process.env.ZJMTALK_DATA_DIR = prevDataDir
      fs.rmSync(dataDir, { recursive: true, force: true })
    }
  })
})
