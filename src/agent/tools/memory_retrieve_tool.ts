import { openMemoryDb } from '../db'

export type MemoryRetrieveInput = {
  /** 从用户问题整理出的检索关键词 */
  keywords: string[]
  /** 返回条数，默认 10 */
  limit?: number
}

export type MemoryRetrieveOptions = {
  dbPath?: string
}

export type MemoryRetrieveRow = {
  id: number
  type: string
  content: string
  keywords: string | null
  importance: number
  session_id: string | null
  created_at: string
  updated_at: string
  bm25_raw: number
  score: number
}

const DEFAULT_LIMIT = 10
const MAX_LIMIT = 50

/**
 * 把关键词编成 FTS5 MATCH 表达式（OR 连接，逐词加双引号）。
 */
export function buildFtsMatchQuery(keywords: string[]): string {
  const terms = keywords
    .map((k) => String(k).trim())
    .filter(Boolean)
    .map((k) => `"${k.replace(/"/g, '""')}"`)

  if (terms.length === 0) {
    throw new Error('keywords is required (at least one non-empty keyword)')
  }

  return terms.join(' OR ')
}

const RETRIEVE_SQL = `
SELECT
  m.id,
  m.type,
  m.content,
  m.keywords,
  m.importance,
  m.session_id,
  m.created_at,
  m.updated_at,
  bm25(memory_fts) AS bm25_raw,
  (
    (-1.0 * bm25(memory_fts)) * 2.0
    + COALESCE(m.importance, 3) * 1.0
    + (
        1.0 / (1.0 + (julianday('now') - julianday(COALESCE(m.updated_at, m.created_at))))
      ) * 3.0
  ) AS score
FROM memory_fts
JOIN memory AS m ON m.id = memory_fts.rowid
WHERE memory_fts MATCH ?
ORDER BY score DESC
LIMIT ?
`

/**
 * 用关键词全文检索 memory / memory_fts。
 * 综合 bm25 相关性、importance、时间衰减，返回最相关的若干条。
 */
export function memoryRetrieveTool(
  input: MemoryRetrieveInput,
  options: MemoryRetrieveOptions = {},
): string {
  if (!Array.isArray(input.keywords)) {
    throw new Error('keywords must be an array of strings')
  }

  const matchQuery = buildFtsMatchQuery(input.keywords)
  let limit = input.limit ?? DEFAULT_LIMIT
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error('limit must be a positive integer')
  }
  limit = Math.min(limit, MAX_LIMIT)

  const db = openMemoryDb(options.dbPath)
  try {
    const rows = db.prepare(RETRIEVE_SQL).all(matchQuery, limit) as MemoryRetrieveRow[]

    if (rows.length === 0) {
      return [
        `No memories matched keywords: ${JSON.stringify(input.keywords)}`,
        `match=${matchQuery}`,
      ].join('\n')
    }

    const lines = [
      `Found ${rows.length} memor${rows.length === 1 ? 'y' : 'ies'} (match=${matchQuery}):`,
      '',
    ]

    for (const row of rows) {
      lines.push(
        [
          `- id=${row.id} type=${row.type} importance=${row.importance} score=${Number(row.score).toFixed(4)}`,
          `  content: ${row.content}`,
          `  keywords: ${row.keywords ?? '[]'}`,
          `  updated_at: ${row.updated_at}`,
        ].join('\n'),
      )
    }

    return lines.join('\n\n')
  } finally {
    db.close()
  }
}
