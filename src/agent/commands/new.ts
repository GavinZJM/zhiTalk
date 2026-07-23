import { randomUUID } from 'crypto'
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
  run(_args, ctx) {
    const next = createThreadId()
    const prev = ctx.threadId
    ctx.setThreadId(next)
    return {
      type: 'ok',
      message: `Started new session.\n  previous: ${prev}\n  current:  ${next}`,
    }
  },
}
