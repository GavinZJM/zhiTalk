import { compressContext } from '../agent'
import type { CommandDefinition } from './types'

/**
 * /compact — 手动触发当前会话的 Context 压缩
 */
export const compactCommand: CommandDefinition = {
  name: 'compact',
  description: 'Compress the current session context into a summary',
  usage: '/compact',
  aliases: ['c'],
  async run(_args, ctx) {
    try {
      const result = await compressContext(ctx.threadId)
      return {
        type: 'ok',
        message: result.message,
      }
    } catch (err) {
      return {
        type: 'error',
        message: `Context 压缩失败: ${(err as Error).message}`,
      }
    }
  },
}
