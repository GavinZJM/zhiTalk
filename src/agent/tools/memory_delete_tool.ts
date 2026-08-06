import { openMemoryDb } from '../db'

export type MemoryDeleteInput = {
  /** 要删除的 memory.id 列表（通常来自 memory_retrieve） */
  ids: number[]
}

export type MemoryDeleteOptions = {
  dbPath?: string
}

type MemoryRow = {
  id: number
  type: string
  content: string
  keywords: string | null
  importance: number
}

/**
 * 按 id 删除 memory 行；memory_ad 触发器会同步清理 memory_fts。
 */
export function memoryDeleteTool(
  input: MemoryDeleteInput,
  options: MemoryDeleteOptions = {},
): string {
  if (!Array.isArray(input.ids) || input.ids.length === 0) {
    throw new Error('ids is required (non-empty array of memory ids)')
  }

  const ids = [
    ...new Set(
      input.ids.map((id) => {
        if (!Number.isInteger(id) || id < 1) {
          throw new Error(`invalid memory id: ${JSON.stringify(id)}`)
        }
        return id
      }),
    ),
  ]

  const db = openMemoryDb(options.dbPath)
  try {
    const placeholders = ids.map(() => '?').join(', ')
    const existing = db
      .prepare(
        `SELECT id, type, content, keywords, importance
         FROM memory
         WHERE id IN (${placeholders})`,
      )
      .all(...ids) as MemoryRow[]

    const foundIds = new Set(existing.map((r) => r.id))
    const missing = ids.filter((id) => !foundIds.has(id))

    if (existing.length === 0) {
      return [
        'No memories deleted.',
        `ids not found: ${JSON.stringify(ids)}`,
      ].join('\n')
    }

    const del = db.prepare(
      `DELETE FROM memory WHERE id IN (${existing.map(() => '?').join(', ')})`,
    )
    const info = del.run(...existing.map((r) => r.id))

    const lines = [
      `Deleted ${info.changes} memor${info.changes === 1 ? 'y' : 'ies'} (memory + memory_fts synced via trigger):`,
      '',
    ]
    for (const row of existing) {
      lines.push(
        `- id=${row.id} type=${row.type} importance=${row.importance}\n  content: ${row.content}`,
      )
    }
    if (missing.length > 0) {
      lines.push('', `ids not found (skipped): ${JSON.stringify(missing)}`)
    }

    return lines.join('\n')
  } finally {
    db.close()
  }
}
