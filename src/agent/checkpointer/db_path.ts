import * as path from 'path'
import { ensureZjmTalkDataDir, getZjmTalkDataDir } from '../config'

/** 聊天记录 SQLite：`~/.zjmTalk/.data/checkpointer.db` */
export function getCheckpointerDbPath(): string {
  return path.join(getZjmTalkDataDir(), 'checkpointer.db')
}

/**
 * 确保 `~/.zjmTalk/.data` 存在并返回 checkpointer.db 路径。
 * 库文件由 SqliteSaver 首次连接时创建。
 */
export function ensureCheckpointerDatabase(): string {
  ensureZjmTalkDataDir()
  return getCheckpointerDbPath()
}
