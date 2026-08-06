import type { CommandDefinition } from './types'
import { applySessionStartHooks } from '../hooks'
import { threadExists } from '../sessions/thread_exists'

/**
 * /rewind <thread_id> — 恢复到已有会话（只改当前 thread_id，不访问 LLM）
 */
export const rewindCommand: CommandDefinition = {
  name: 'rewind',
  description: 'Resume an existing chat session by thread_id',
  usage: '/rewind <thread_id>',
  aliases: ['r'],
  async run(args, ctx) {
    const target = args[0]?.trim()
    if (!target) {
      return {
        type: 'error',
        message: 'Usage: /rewind <thread_id>',
      }
    }

    if (!threadExists(target)) {
      return {
        type: 'error',
        message: `Thread not found: ${target}`,
      }
    }

    const prev = ctx.threadId
    if (prev === target) {
      return {
        type: 'ok',
        message: `Already on session:\n  ${target}`,
      }
    }

    ctx.setThreadId(target)

    const start = await applySessionStartHooks({
      threadId: target,
      source: 'rewind',
    })
    if (start.blocked) {
      ctx.setThreadId(prev)
      return {
        type: 'error',
        message: `SessionStart hook blocked rewind: ${start.blockMessage}`,
      }
    }

    return {
      type: 'ok',
      message: `Resumed session.\n  previous: ${prev}\n  current:  ${target}`,
    }
  },
}
