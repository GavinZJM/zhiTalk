import Database from 'better-sqlite3'
import * as fs from 'fs'
import * as path from 'path'
import { getZjmTalkDataDir } from './config'

/** 应用 SQLite：`~/.zjmTalk/.data/zjmTalk.db`（记忆等非 checkpointer 数据） */
export function getAppDbPath(): string {
  return path.join(getZjmTalkDataDir(), 'zjmTalk.db')
}

/** @deprecated 使用 getAppDbPath()；保留为兼容，在首次读取时解析 */
export const DB_PATH = getAppDbPath()

const MEMORY_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  keywords TEXT,
  importance INTEGER DEFAULT 3,
  session_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`

/** 外部 content 模式：不重复存正文，rowid 对齐 memory.id */
const MEMORY_FTS_SQL = `
CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
  content,
  keywords,
  content='memory',
  content_rowid='id'
);
`

/**
 * FTS5 external-content 必须用触发器同步；
 * 否则 INSERT INTO memory 后无法被 MATCH 搜到。
 */
const MEMORY_FTS_TRIGGERS_SQL = `
CREATE TRIGGER IF NOT EXISTS memory_ai AFTER INSERT ON memory BEGIN
  INSERT INTO memory_fts(rowid, content, keywords)
  VALUES (new.id, new.content, new.keywords);
END;

CREATE TRIGGER IF NOT EXISTS memory_ad AFTER DELETE ON memory BEGIN
  INSERT INTO memory_fts(memory_fts, rowid, content, keywords)
  VALUES ('delete', old.id, old.content, old.keywords);
END;

CREATE TRIGGER IF NOT EXISTS memory_au AFTER UPDATE ON memory BEGIN
  INSERT INTO memory_fts(memory_fts, rowid, content, keywords)
  VALUES ('delete', old.id, old.content, old.keywords);
  INSERT INTO memory_fts(rowid, content, keywords)
  VALUES (new.id, new.content, new.keywords);
END;
`

function tableExists(db: Database.Database, name: string): boolean {
  const row = db
    .prepare(
      `SELECT 1 AS ok FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?`,
    )
    .get(name) as { ok: number } | undefined
  return Boolean(row)
}

/**
 * 打开 SQLite；若目录不存在则创建。默认 `~/.zjmTalk/.data/zjmTalk.db`。
 */
export function openDb(dbPath: string = getAppDbPath()): Database.Database {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  return db
}

/** 确保 memory + memory_fts（及同步触发器）存在 */
export function ensureMemorySchema(db: Database.Database): void {
  db.exec(MEMORY_TABLE_SQL)

  const ftsExisted = tableExists(db, 'memory_fts')
  db.exec(MEMORY_FTS_SQL)
  db.exec(MEMORY_FTS_TRIGGERS_SQL)

  // 首次创建 FTS 时，把已有 memory 行编入索引
  if (!ftsExisted) {
    db.exec(`INSERT INTO memory_fts(memory_fts) VALUES('rebuild')`)
  }
}

/** @deprecated 使用 ensureMemorySchema */
export function ensureMemoryTable(db: Database.Database): void {
  ensureMemorySchema(db)
}

/**
 * 打开 DB 并确保 memory schema；调用方负责 db.close()。
 */
export function openMemoryDb(dbPath: string = getAppDbPath()): Database.Database {
  const db = openDb(dbPath)
  ensureMemorySchema(db)
  return db
}

/**
 * 项目启动前调用：创建目录（若不存在）并创建/迁移应用库表结构（memory、memory_fts）。
 */
export function ensureAppDatabase(dbPath: string = getAppDbPath()): void {
  const db = openDb(dbPath)
  try {
    ensureMemorySchema(db)
  } finally {
    db.close()
  }
}
