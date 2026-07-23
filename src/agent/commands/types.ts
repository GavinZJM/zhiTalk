/**
 * CLI 斜杠命令的类型定义。
 * 新增命令时：实现 CommandDefinition，并在 commands/index.ts 注册即可。
 */

export type CommandContext = {
  /** 当前会话 thread_id（LangGraph checkpointer） */
  threadId: string
  /** 切换当前会话 */
  setThreadId: (threadId: string) => void
}

export type CommandResult =
  | { type: 'ok'; message?: string }
  | { type: 'error'; message: string }
  | { type: 'exit'; message?: string }

export type CommandDefinition = {
  /** 命令名，不含前导 `/`，如 `new`、`rewind` */
  name: string
  /** 简短说明（可用于未来 /help） */
  description: string
  /** 用法示例，如 `/rewind <thread_id>` */
  usage?: string
  /** 可选别名，如 `['n']` → `/n` */
  aliases?: string[]
  run: (
    args: string[],
    ctx: CommandContext,
  ) => CommandResult | Promise<CommandResult>
}

/** 解析后的原始输入 */
export type ParsedCommand = {
  name: string
  args: string[]
  raw: string
}
