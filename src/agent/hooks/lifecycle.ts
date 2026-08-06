import {
  appendSessionHookExtras,
  clearSessionHookExtras,
} from './session_context'
import { formatHookInjection, runHooks } from './dispatch'
import type { HookRunResult } from './types'

/**
 * SessionStart：清空旧 extras，跑 hooks；
 * block → 返回 blocked；inject → 写入 session extras。
 */
export async function applySessionStartHooks(input: {
  threadId: string
  source?: string
}): Promise<HookRunResult> {
  clearSessionHookExtras()

  const result = await runHooks(
    'SessionStart',
    {
      thread_id: input.threadId,
      session_id: input.threadId,
      source: input.source,
    },
    { matchAgainst: '' },
  )

  if (result.blocked) {
    return result
  }

  for (const inj of result.injections) {
    const text = formatHookInjection('SessionStart', inj)
    if (text) appendSessionHookExtras(text)
  }

  return result
}

/** SessionEnd：不阻断退出；inject 仅记入 decisions（无对话可注入） */
export async function runSessionEndHooks(input: {
  threadId: string
  source?: string
}): Promise<HookRunResult> {
  return runHooks(
    'SessionEnd',
    {
      thread_id: input.threadId,
      session_id: input.threadId,
      source: input.source,
    },
    { matchAgainst: '' },
  )
}
