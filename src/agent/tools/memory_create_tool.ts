import { openMemoryDb } from '../db'

export const MEMORY_TYPES = [
  'fact',
  'event',
  'preference',
  'skill',
] as const

export type MemoryType = (typeof MEMORY_TYPES)[number]

export type MemoryCreateInput = {
  type: MemoryType
  /** 自然语言描述，便于拼进 prompt */
  content: string
  /** 关键词，存为 JSON array */
  keywords?: string[]
  /** 1~5，默认 3 */
  importance?: number
  /** 当前对话 thread_id */
  sessionId?: string | null
}

export type MemoryCreateOptions = {
  dbPath?: string
}

export type MemoryCreateResult = {
  id: number
  type: MemoryType
  content: string
  keywords: string[]
  importance: number
  sessionId: string | null
}

function assertMemoryType(type: string): asserts type is MemoryType {
  if (!(MEMORY_TYPES as readonly string[]).includes(type)) {
    throw new Error(
      `type must be one of: ${MEMORY_TYPES.join(', ')} (got ${JSON.stringify(type)})`,
    )
  }
}

/**
 * 将一条记忆写入 SQLite memory 表。
 * 供 AI 在判断「用户需要长期记住的信息」时调用。
 */
export function memoryCreateTool(
  input: MemoryCreateInput,
  options: MemoryCreateOptions = {},
): string {
  const { type, content, keywords = [], sessionId = null } = input
  assertMemoryType(type)

  if (!content || !String(content).trim()) {
    throw new Error('content is required')
  }

  const importance = input.importance ?? 3
  if (!Number.isInteger(importance) || importance < 1 || importance > 5) {
    throw new Error('importance must be an integer from 1 to 5')
  }

  const keywordList = Array.isArray(keywords)
    ? keywords.map((k) => String(k).trim()).filter(Boolean)
    : []
  const keywordsJson = JSON.stringify(keywordList)

  const db = openMemoryDb(options.dbPath)
  try {
    const info = db
      .prepare(
        `INSERT INTO memory (type, content, keywords, importance, session_id)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        type,
        String(content).trim(),
        keywordsJson,
        importance,
        sessionId ? String(sessionId) : null,
      )

    const id = Number(info.lastInsertRowid)
    const result: MemoryCreateResult = {
      id,
      type,
      content: String(content).trim(),
      keywords: keywordList,
      importance,
      sessionId: sessionId ? String(sessionId) : null,
    }

    return [
      `Memory saved (id=${result.id}).`,
      `type=${result.type}`,
      `importance=${result.importance}`,
      `keywords=${keywordsJson}`,
      `session_id=${result.sessionId ?? ''}`,
      `content=${result.content}`,
    ].join('\n')
  } finally {
    db.close()
  }
}
