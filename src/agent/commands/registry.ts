import type {
  CommandContext,
  CommandDefinition,
  CommandResult,
  ParsedCommand,
} from './types'

/**
 * 判断是否像斜杠命令（以 `/` 开头）。
 * 普通聊天内容不会走命令系统。
 */
export function looksLikeCommand(input: string): boolean {
  return input.trimStart().startsWith('/')
}

/**
 * 解析 `/cmd arg1 arg2 ...`
 * - 支持引号包裹参数：`/skill "my skill"`、`/rewind 'id with space'`
 * - 形式可多样，后续命令各自解释 args
 */
export function parseCommand(input: string): ParsedCommand | null {
  const trimmed = input.trim()
  if (!trimmed.startsWith('/')) return null

  const body = trimmed.slice(1)
  if (!body) {
    return { name: '', args: [], raw: trimmed }
  }

  const tokens = tokenize(body)
  const [name = '', ...args] = tokens
  return {
    name: name.toLowerCase(),
    args,
    raw: trimmed,
  }
}

/** 简单 shell 风格分词：空白分隔，支持单/双引号 */
function tokenize(input: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]

    if (quote) {
      if (ch === quote) {
        quote = null
      } else {
        current += ch
      }
      continue
    }

    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }

    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }

    current += ch
  }

  if (current) tokens.push(current)
  return tokens
}

export class CommandRegistry {
  private readonly byName = new Map<string, CommandDefinition>()

  register(command: CommandDefinition): void {
    const names = [command.name, ...(command.aliases ?? [])].map((n) =>
      n.toLowerCase(),
    )
    for (const name of names) {
      if (this.byName.has(name)) {
        throw new Error(`Command already registered: /${name}`)
      }
      this.byName.set(name, command)
    }
  }

  get(name: string): CommandDefinition | undefined {
    return this.byName.get(name.toLowerCase())
  }

  list(): CommandDefinition[] {
    const seen = new Set<CommandDefinition>()
    const out: CommandDefinition[] = []
    for (const cmd of this.byName.values()) {
      if (seen.has(cmd)) continue
      seen.add(cmd)
      out.push(cmd)
    }
    return out.sort((a, b) => a.name.localeCompare(b.name))
  }

  /**
   * 尝试执行用户输入中的命令。
   * - 不是 `/` 开头 → null（交给 AI）
   * - 是命令 → CommandResult
   */
  async dispatch(
    input: string,
    ctx: CommandContext,
  ): Promise<CommandResult | null> {
    if (!looksLikeCommand(input)) return null

    const parsed = parseCommand(input)
    if (!parsed || !parsed.name) {
      return {
        type: 'error',
        message: 'Empty command. Try /new',
      }
    }

    const command = this.get(parsed.name)
    if (!command) {
      return {
        type: 'error',
        message: `Unknown command: /${parsed.name}. Try /new`,
      }
    }

    return command.run(parsed.args, ctx)
  }
}
