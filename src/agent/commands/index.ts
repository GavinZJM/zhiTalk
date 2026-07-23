import { CommandRegistry } from './registry'
import { newCommand } from './new'
import { rewindCommand } from './rewind'
import { sessionsCommand } from './sessions'

/**
 * 注册全部内置 CLI 命令。
 * 未来扩展（示例，暂不实现）：
 * - /skill <name>
 */
export function createCommandRegistry(): CommandRegistry {
  const registry = new CommandRegistry()
  registry.register(newCommand)
  registry.register(sessionsCommand)
  registry.register(rewindCommand)
  return registry
}

export { CommandRegistry, looksLikeCommand, parseCommand } from './registry'
export type {
  CommandContext,
  CommandDefinition,
  CommandResult,
  ParsedCommand,
} from './types'
export { createThreadId, newCommand } from './new'
export { sessionsCommand } from './sessions'
export { rewindCommand } from './rewind'
