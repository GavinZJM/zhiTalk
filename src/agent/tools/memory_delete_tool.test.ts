import Database from 'better-sqlite3'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { memoryCreateTool } from './memory_create_tool'
import { memoryDeleteTool } from './memory_delete_tool'
import { memoryRetrieveTool } from './memory_retrieve_tool'

describe('memoryDeleteTool', () => {
  let tmpDir: string
  let dbPath: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-delete-'))
    dbPath = path.join(tmpDir, 'test.db')

    memoryCreateTool(
      {
        type: 'fact',
        content: '用户的名字叫 Gavin。',
        keywords: ['名字', 'Gavin'],
        importance: 5,
      },
      { dbPath },
    )
    memoryCreateTool(
      {
        type: 'preference',
        content: '用户喜欢简洁回复。',
        keywords: ['偏好', '简洁'],
        importance: 3,
      },
      { dbPath },
    )
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('deletes memory rows and removes them from fts', () => {
    const out = memoryDeleteTool({ ids: [1] }, { dbPath })
    expect(out).toMatch(/Deleted 1 memory/)
    expect(out).toContain('Gavin')

    const db = new Database(dbPath, { readonly: true, fileMustExist: true })
    try {
      const count = db.prepare('SELECT COUNT(*) AS c FROM memory').get() as {
        c: number
      }
      expect(count.c).toBe(1)

      const ftsHit = db
        .prepare(
          `SELECT COUNT(*) AS c FROM memory_fts WHERE memory_fts MATCH ?`,
        )
        .get('"Gavin"') as { c: number }
      expect(ftsHit.c).toBe(0)

      const stillThere = memoryRetrieveTool(
        { keywords: ['简洁'] },
        { dbPath },
      )
      expect(stillThere).toContain('简洁回复')
    } finally {
      db.close()
    }
  })

  it('deletes multiple ids and reports missing ids', () => {
    const out = memoryDeleteTool({ ids: [1, 2, 99] }, { dbPath })
    expect(out).toMatch(/Deleted 2 memor/)
    expect(out).toContain('ids not found')
    expect(out).toContain('99')

    const db = new Database(dbPath, { readonly: true, fileMustExist: true })
    try {
      const count = db.prepare('SELECT COUNT(*) AS c FROM memory').get() as {
        c: number
      }
      expect(count.c).toBe(0)
    } finally {
      db.close()
    }
  })

  it('rejects empty ids', () => {
    expect(() => memoryDeleteTool({ ids: [] }, { dbPath })).toThrow(/ids/)
  })
})
