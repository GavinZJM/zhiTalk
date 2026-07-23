import * as path from 'path'

/** 聊天记录 SQLite 路径：当前工作目录下 `.data/checkpointer.db` */
export function getCheckpointerDbPath(): string {
  return path.resolve(process.cwd(), '.data', 'checkpointer.db')
}
