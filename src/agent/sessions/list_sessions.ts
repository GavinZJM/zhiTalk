import Database from 'better-sqlite3'
import * as fs from 'fs'
import { getCheckpointerDbPath } from '../checkpointer/db_path'
import Table from 'cli-table3'

export type SessionRow = {
  threadId: string
  lastUserMessage: string
  updatedAt: Date
}

export type ListSessionsOptions = {
  dbPath?: string
  limit?: number
  /** 便于单测注入“现在” */
  now?: Date
}

type CheckpointBlob = {
  ts?: string
  channel_values?: {
    messages?: unknown[]
  }
}

/**
 * 查询最近会话（按最新 checkpoint 时间逆序），默认 20 条。
 * 只读 SQLite，不访问 LLM。
 */
export function listRecentSessions(
  options: ListSessionsOptions = {},
): SessionRow[] {
  const dbPath = options.dbPath ?? getCheckpointerDbPath()
  const limit = options.limit ?? 20

  if (!fs.existsSync(dbPath)) {
    return []
  }

  const db = new Database(dbPath, { readonly: true, fileMustExist: true })
  try {
    const rows = db
      .prepare(
        `
      SELECT c.thread_id AS thread_id, c.checkpoint AS checkpoint
      FROM checkpoints c
      INNER JOIN (
        SELECT thread_id, MAX(checkpoint_id) AS max_id
        FROM checkpoints
        WHERE checkpoint_ns = ''
        GROUP BY thread_id
      ) latest
        ON c.thread_id = latest.thread_id
       AND c.checkpoint_id = latest.max_id
      WHERE c.checkpoint_ns = ''
      ORDER BY c.checkpoint_id DESC
      LIMIT ?
    `,
      )
      .all(limit) as Array<{ thread_id: string; checkpoint: Buffer | string }>

    const sessions: SessionRow[] = []
    for (const row of rows) {
      const checkpoint = parseCheckpoint(row.checkpoint)
      const updatedAt = checkpoint.ts
        ? new Date(checkpoint.ts)
        : new Date(0)
      const lastUserMessage = extractLastUserMessage(
        checkpoint.channel_values?.messages ?? [],
      )
      sessions.push({
        threadId: row.thread_id,
        lastUserMessage,
        updatedAt,
      })
    }

    // 按时间再排一次（checkpoint_id 通常单调，但以 ts 为准更稳）
    sessions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    return sessions
  } finally {
    db.close()
  }
}

function parseCheckpoint(raw: Buffer | string): CheckpointBlob {
  const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw)
  return JSON.parse(text) as CheckpointBlob
}

function extractLastUserMessage(messages: unknown[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (!isHumanMessage(msg)) continue
    return getMessageContent(msg)
  }
  return ''
}

function isHumanMessage(msg: unknown): boolean {
  if (!msg || typeof msg !== 'object') return false
  const m = msg as Record<string, unknown>
  if (m.role === 'user' || m.role === 'human') return true
  const id = m.id
  if (Array.isArray(id) && id.some((x) => String(x).includes('HumanMessage'))) {
    return true
  }
  return false
}

function getMessageContent(msg: unknown): string {
  if (!msg || typeof msg !== 'object') return ''
  const m = msg as { content?: unknown; kwargs?: { content?: unknown } }
  const content = m.kwargs?.content ?? m.content
  if (typeof content === 'string') return content
  if (content == null) return ''
  return JSON.stringify(content)
}

/** 截取前 maxLen 个字符；超出加省略号 */
export function truncateText(text: string, maxLen = 50): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLen) return normalized
  return normalized.slice(0, maxLen) + '…'
}

/**
 * 相对时间：刚刚 / N分钟 / N小时 / N天；更久则用简洁日期。
 */
export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  if (Number.isNaN(date.getTime()) || date.getTime() <= 0) {
    return '—'
  }

  const diffMs = Math.max(0, now.getTime() - date.getTime())
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}小时`

  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}天`

  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 渲染为 cli-table3 终端表格；thread_id 完整输出便于复制 */
export function formatSessionsTable(
  sessions: SessionRow[],
  options: { now?: Date } = {},
): string {
  const now = options.now ?? new Date()
  const table = new Table({
    head: ['thread_id', '最后用户输入的问题', '时间'],
    wordWrap: true,
    style: {
      head: ['cyan'],
      border: ['gray'],
    },
  })

  if (sessions.length === 0) {
    table.push(['(暂无会话)', '—', '—'])
    return table.toString()
  }

  for (const s of sessions) {
    table.push([
      s.threadId,
      truncateText(s.lastUserMessage, 50) || '—',
      formatRelativeTime(s.updatedAt, now),
    ])
  }

  return table.toString()
}
