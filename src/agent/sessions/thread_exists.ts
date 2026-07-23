import Database from 'better-sqlite3'
import * as fs from 'fs'
import { getCheckpointerDbPath } from '../checkpointer/db_path'

/**
 * 检查 thread_id 是否在 checkpoints 表中存在。
 * 只读 SQLite，不访问 LLM。
 */
export function threadExists(
  threadId: string,
  options: { dbPath?: string } = {},
): boolean {
  const id = threadId.trim()
  if (!id) return false

  const dbPath = options.dbPath ?? getCheckpointerDbPath()
  if (!fs.existsSync(dbPath)) return false

  const db = new Database(dbPath, { readonly: true, fileMustExist: true })
  try {
    const row = db
      .prepare(
        `
      SELECT 1 AS ok
      FROM checkpoints
      WHERE thread_id = ?
      LIMIT 1
    `,
      )
      .get(id) as { ok: number } | undefined
    return Boolean(row)
  } finally {
    db.close()
  }
}
