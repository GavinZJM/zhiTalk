import Database from 'better-sqlite3'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  ensureAppDatabase,
  ensureMemorySchema,
  openDb,
  openMemoryDb,
} from './db'
import { memoryCreateTool } from './tools/memory_create_tool'

describe('memory_fts schema', () => {
  let tmpDir: string
  let dbPath: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-fts-'))
    dbPath = path.join(tmpDir, 'test.db')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates memory_fts with memory on ensureAppDatabase', () => {
    ensureAppDatabase(dbPath)
    const db = openDb(dbPath)
    try {
      const names = db
        .prepare(
          `SELECT name FROM sqlite_master WHERE name IN ('memory', 'memory_fts') ORDER BY name`,
        )
        .all() as Array<{ name: string }>
      expect(names.map((r) => r.name)).toEqual(['memory', 'memory_fts'])
    } finally {
      db.close()
    }
  })

  it('indexes new memory rows so MATCH works', () => {
    memoryCreateTool(
      {
        type: 'fact',
        content: '用户喜欢喝美式咖啡',
        keywords: ['咖啡', '美式'],
      },
      { dbPath },
    )

    const db = openMemoryDb(dbPath)
    try {
      const hit = db
        .prepare(
          `SELECT m.id, m.content
           FROM memory_fts f
           JOIN memory m ON m.id = f.rowid
           WHERE memory_fts MATCH ?
           LIMIT 5`,
        )
        .all('美式') as Array<{ id: number; content: string }>
      expect(hit.length).toBeGreaterThanOrEqual(1)
      expect(hit[0].content).toContain('美式咖啡')
    } finally {
      db.close()
    }
  })

  it('rebuilds fts for rows inserted before fts existed', () => {
    const db = openDb(dbPath)
    try {
      db.exec(`
        CREATE TABLE memory (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          content TEXT NOT NULL,
          keywords TEXT,
          importance INTEGER DEFAULT 3,
          session_id TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `)
      db.prepare(
        `INSERT INTO memory (type, content, keywords) VALUES (?, ?, ?)`,
      ).run('fact', '旧数据里有关键词香蕉牛奶', '["香蕉"]')
    } finally {
      db.close()
    }

    ensureAppDatabase(dbPath)

    const db2 = openDb(dbPath)
    try {
      ensureMemorySchema(db2)
      const hit = db2
        .prepare(
          `SELECT m.content FROM memory_fts f
           JOIN memory m ON m.id = f.rowid
           WHERE memory_fts MATCH ?`,
        )
        .all('香蕉') as Array<{ content: string }>
      expect(hit[0]?.content).toContain('香蕉牛奶')
    } finally {
      db2.close()
    }
  })
})
