import Database from 'better-sqlite3'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { memoryCreateTool } from './memory_create_tool'

describe('memoryCreateTool', () => {
  let tmpDir: string
  let dbPath: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-create-'))
    dbPath = path.join(tmpDir, 'test.db')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('inserts a memory row into sqlite', () => {
    const msg = memoryCreateTool(
      {
        type: 'preference',
        content: '用户喜欢简洁的回复',
        keywords: ['偏好', '简洁'],
        importance: 4,
        sessionId: 'thread-1',
      },
      { dbPath },
    )

    expect(msg).toMatch(/Memory saved \(id=1\)/)
    expect(msg).toContain('type=preference')
    expect(msg).toContain('用户喜欢简洁的回复')

    const db = new Database(dbPath, { readonly: true, fileMustExist: true })
    try {
      const row = db
        .prepare('SELECT * FROM memory WHERE id = 1')
        .get() as {
        type: string
        content: string
        keywords: string
        importance: number
        session_id: string
      }
      expect(row.type).toBe('preference')
      expect(row.content).toBe('用户喜欢简洁的回复')
      expect(JSON.parse(row.keywords)).toEqual(['偏好', '简洁'])
      expect(row.importance).toBe(4)
      expect(row.session_id).toBe('thread-1')
    } finally {
      db.close()
    }
  })

  it('defaults importance to 3 and allows null session', () => {
    memoryCreateTool(
      { type: 'fact', content: '用户住在上海' },
      { dbPath },
    )
    const db = new Database(dbPath, { readonly: true, fileMustExist: true })
    try {
      const row = db.prepare('SELECT importance, session_id FROM memory').get() as {
        importance: number
        session_id: string | null
      }
      expect(row.importance).toBe(3)
      expect(row.session_id).toBeNull()
    } finally {
      db.close()
    }
  })

  it('rejects invalid type', () => {
    expect(() =>
      memoryCreateTool(
        { type: 'note' as 'fact', content: 'x' },
        { dbPath },
      ),
    ).toThrow(/type must be one of/)
  })

  it('rejects empty content', () => {
    expect(() =>
      memoryCreateTool({ type: 'event', content: '  ' }, { dbPath }),
    ).toThrow(/content is required/)
  })

  it('rejects importance out of range', () => {
    expect(() =>
      memoryCreateTool(
        { type: 'skill', content: 'x', importance: 0 },
        { dbPath },
      ),
    ).toThrow(/importance/)
  })
})
