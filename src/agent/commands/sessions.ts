import type { CommandDefinition } from './types'
import {
  formatSessionsTable,
  listRecentSessions,
} from '../sessions/list_sessions'

/**
 * /sessions — 列出最近 20 条会话（只查 SQLite，不访问 LLM）
 */
export const sessionsCommand: CommandDefinition = {
  name: 'sessions',
  description: 'List recent chat sessions from the local database',
  usage: '/sessions',
  aliases: ['ls'],
  run() {
    const sessions = listRecentSessions({ limit: 20 })
    return {
      type: 'ok',
      message: formatSessionsTable(sessions),
    }
  },
}
