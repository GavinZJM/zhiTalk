import { getHooksForEvent } from './load'
import { matcherMatches } from './match'
import { runHookCommand } from './run_command'
import { style } from '../ui/style'
import type {
  HookEventName,
  HookPayload,
  HookRunResult,
} from './types'

export type RunHooksOptions = {
  /** 覆盖默认 `~/.zjmTalk/zjmTalk.json` 路径（测试用） */
  configPath?: string
  cwd?: string
  /**
   * 用于 matcher 的字符串。
   * Tool 事件传 tool_name；其它事件可传 ''（空 matcher 全匹配）。
   */
  matchAgainst?: string
}

/**
 * 运行某事件下所有匹配的 hooks，串行执行。
 * - 任一 exit 1 → blocked，停止后续
 * - exit 2 → 累积 injections，继续
 */
export async function runHooks(
  event: HookEventName,
  payload: Omit<HookPayload, 'hook_event_name' | 'cwd'> & {
    cwd?: string
  },
  options: RunHooksOptions = {},
): Promise<HookRunResult> {
  const cwd = options.cwd ?? payload.cwd ?? process.cwd()
  const defs = getHooksForEvent(event, options.configPath)
  const matchAgainst =
    options.matchAgainst ?? payload.tool_name ?? payload.prompt ?? ''

  const fullPayload: HookPayload = {
    ...payload,
    hook_event_name: event,
    cwd,
  }

  const result: HookRunResult = {
    blocked: false,
    blockMessage: '',
    injections: [],
    decisions: [],
  }

  for (const def of defs) {
    if (!matcherMatches(def.matcher, matchAgainst)) {
      continue
    }

    const decision = await runHookCommand(def, fullPayload, { cwd })
    result.decisions.push(decision)

    if (!process.env.JEST_WORKER_ID) {
      console.log(
        style.tool(
          `\n[Hook ${event}] ${decision.command} → exit ${decision.exitCode} (${decision.action})`,
        ),
      )
      const out = decision.stdout.trimEnd()
      const err = decision.stderr.trimEnd()
      if (out) console.log(style.toolPreview(out))
      if (err) console.log(style.toolPreview(err))
    }
    if (decision.action === 'block') {
      result.blocked = true
      result.blockMessage = decision.message
      break
    }

    if (decision.action === 'inject' && decision.message) {
      result.injections.push(decision.message)
    }
  }

  return result
}

/** 将 inject 文本格式化为对话可见上下文 */
export function formatHookInjection(
  event: HookEventName,
  text: string,
): string {
  const body = text.trim()
  if (!body) return ''
  return `[hook:${event}]\n${body}`
}
