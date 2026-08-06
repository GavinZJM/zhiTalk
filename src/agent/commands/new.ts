import { randomUUID } from 'crypto'
import { clearCompressionCache } from '../graph/context'
import { applySessionStartHooks } from '../hooks'
import type { CommandDefinition } from './types'

/** 生成新的会话 thread_id */
export function createThreadId(): string {
  return `session-${randomUUID()}`
}

/**
 * /new — 开启新会话（新的 thread_id，历史与旧会话隔离）
 */
export const newCommand: CommandDefinition = {
  name: 'new',
  description: 'Start a new chat session',
  usage: '/new',
  aliases: ['n'],
  async run(_args, ctx) {
    const next = createThreadId()
    const prev = ctx.threadId
    clearCompressionCache(prev)
    ctx.setThreadId(next)

    const start = await applySessionStartHooks({
      threadId: next,
      source: 'new',
    })
    if (start.blocked) {
      ctx.setThreadId(prev)
      return {
        type: 'error',
        message: `SessionStart hook blocked new session: ${start.blockMessage}`,
      }
    }

    return {
      type: 'ok',
      message: `Started new session.\n  previous: ${prev}\n  current:  ${next}`,
    }
  },
}
