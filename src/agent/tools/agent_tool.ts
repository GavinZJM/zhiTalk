import { randomUUID } from 'crypto'

export type AgentRunnerResult = {
  text: string
}

export type AgentRunnerOptions = {
  onToken: (token: string) => void
  threadId?: string
  signal?: AbortSignal
  /**
   * main：含 agent_tool 的主图
   * sub：不含 agent_tool，防止嵌套
   */
  variant?: 'main' | 'sub'
}

export type AgentRunner = (
  userMessage: string,
  options: AgentRunnerOptions,
) => Promise<AgentRunnerResult>

export type AgentToolOptions = {
  /** 注入 runner（单测 mock）；默认动态加载 runAgentStream */
  runner?: AgentRunner
  signal?: AbortSignal
  /** 自定义 subagent thread id；默认随机 */
  threadId?: string
}

/** 进程内互斥：同一时刻只允许一个 subagent */
let subagentRunning = false

export function isSubagentRunning(): boolean {
  return subagentRunning
}

/** 测试用：重置互斥锁 */
export function resetSubagentLock(): void {
  subagentRunning = false
}

/**
 * 启动独立 subagent：仅传入 prompt，不带 main 聊天记录。
 * 与 main agent 共用 runAgentStream；variant=sub 时使用不含 agent_tool 的图。
 */
export async function agentTool(
  prompt: string,
  options: AgentToolOptions = {},
): Promise<string> {
  const trimmed = prompt?.trim() ?? ''
  if (!trimmed) {
    throw new Error('prompt is required')
  }

  if (subagentRunning) {
    throw new Error(
      'A subagent is already running. Only one subagent can run at a time.',
    )
  }

  subagentRunning = true
  const threadId = options.threadId ?? `subagent-${randomUUID()}`

  try {
    const runner: AgentRunner =
      options.runner ??
      (async (message, opts) => {
        const { runAgentStream } = await import('../agent')
        return runAgentStream(message, opts)
      })

    if (!process.env.JEST_WORKER_ID) {
      console.log(`\n[SubAgent] start thread=${threadId}`)
    }

    const result = await runner(trimmed, {
      onToken: () => {
        /* subagent tokens stay inside the tool result */
      },
      threadId,
      signal: options.signal,
      variant: 'sub',
    })

    const text = (result.text ?? '').trim()
    if (!process.env.JEST_WORKER_ID) {
      console.log(`[SubAgent] done thread=${threadId}`)
    }
    return text || '(subagent finished with empty response)'
  } finally {
    subagentRunning = false
  }
}
