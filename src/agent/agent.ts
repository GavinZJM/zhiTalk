import { SystemMessage } from '@langchain/core/messages'
import * as dotenv from 'dotenv'
import * as path from 'path'
import { getAgentGraph } from './graph/app'
import { getModelId } from './models/model'
export {
  initAgentRuntime,
  shutdownAgentRuntime,
  isAgentRuntimeReady,
  getAgentGraph,
  agent,
  subAgent,
} from './graph/app'
import {
  compressThreadContext,
  type CompressContextResult,
  type CompressThreadContextOptions,
} from './graph/context'
import { getThreadState } from './graph/thread_history'
import {
  formatHookInjection,
  HookBlockedError,
  runHooks,
} from './hooks'
import { getModelContextLimit } from './models/context_limit'
import {
  buildTokenUsageSnapshot,
  extractUsageFromMessage,
  type StreamUsage,
  type TokenUsageSnapshot,
} from './models/token_usage'

export { memoryPrompt } from './memory_prompt'
export {
  buildProfilePrompt,
  buildSystemPrompt,
  getProfileMdPath,
  loadProfileInfo,
  wrapProfileInfo,
} from './prompt'
export { buildProfilePrompt as profilePrompt } from './prompt'

/** 用户主动取消（如按 ESC）时抛出 */
export class AgentCancelledError extends Error {
  constructor(message = 'Agent request cancelled') {
    super(message)
    this.name = 'AgentCancelledError'
  }
}

export type RunAgentStreamResult = {
  text: string
  /** 本轮最后一次 LLM 调用的用量；取消或未返回 usage 时为 undefined */
  usage?: TokenUsageSnapshot
}

export type RunAgentStreamOptions = {
  onToken: (token: string) => void
  threadId?: string
  signal?: AbortSignal
  /**
   * 为 true 时跳过 UserPromptSubmit hooks（调用方已自行处理时使用）。
   * 默认 false：在 stream 前统一跑 hooks。
   */
  skipUserPromptHooks?: boolean
  /**
   * main（默认）：主 agent 图（含 agent_tool）
   * sub：subagent 图（不含 agent_tool）
   */
  variant?: 'main' | 'sub'
}

export { HookBlockedError } from './hooks'

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { name?: string; message?: string; code?: string }
  return (
    e.name === 'AbortError' ||
    e.name === 'AgentCancelledError' ||
    e.code === 'ABORT_ERR' ||
    (typeof e.message === 'string' && /aborted|abort/i.test(e.message))
  )
}

/**
 * 压缩指定会话的 Context（读 checkpointer 消息，结果写入进程内缓存，不改库内历史）。
 */
export async function compressContext(
  threadId: string,
  options?: CompressThreadContextOptions,
): Promise<CompressContextResult> {
  const { messages } = await getThreadState(threadId)
  return compressThreadContext(threadId, messages, options)
}

/**
 * Main / Subagent 共用的启动与流式执行逻辑。
 * - 仅接收本轮 userMessage（纯文本）；历史由 checkpointer + thread_id 续接
 * - variant=sub 时走 subAgent 图（无 agent_tool）
 */
export async function runAgentStream(
  userMessage: string,
  onToken: (token: string) => void,
  threadId?: string,
  signal?: AbortSignal,
): Promise<RunAgentStreamResult>
export async function runAgentStream(
  userMessage: string,
  options: RunAgentStreamOptions,
): Promise<RunAgentStreamResult>
export async function runAgentStream(
  userMessage: string,
  onTokenOrOptions: ((token: string) => void) | RunAgentStreamOptions,
  threadId: string = 'default-session',
  signal?: AbortSignal,
): Promise<RunAgentStreamResult> {
  const options: RunAgentStreamOptions =
    typeof onTokenOrOptions === 'function'
      ? {
          onToken: onTokenOrOptions,
          threadId,
          signal,
        }
      : onTokenOrOptions

  const {
    onToken,
    threadId: tid = 'default-session',
    signal: abortSignal,
    skipUserPromptHooks = false,
    variant = 'main',
  } = options

  if (abortSignal?.aborted) {
    throw new AgentCancelledError()
  }

  const graph = getAgentGraph(variant)

  const config = {
    configurable: { thread_id: tid },
    signal: abortSignal,
    streamMode: 'messages' as const,
  }

  const inputMessages: Array<
    SystemMessage | { role: 'user'; content: string }
  > = []

  if (!skipUserPromptHooks) {
    const promptHook = await runHooks(
      'UserPromptSubmit',
      {
        thread_id: tid,
        prompt: userMessage,
      },
      { matchAgainst: 'UserPromptSubmit' },
    )

    if (promptHook.blocked) {
      throw new HookBlockedError(
        'UserPromptSubmit',
        promptHook.blockMessage || 'Blocked by UserPromptSubmit hook.',
      )
    }

    for (const inj of promptHook.injections) {
      const text = formatHookInjection('UserPromptSubmit', inj)
      if (text) inputMessages.push(new SystemMessage(text))
    }
  }

  inputMessages.push({ role: 'user', content: userMessage })

  let fullResponse = ''
  let lastUsage: StreamUsage | null = null

  try {
    const stream = await graph.stream({ messages: inputMessages }, config)

    for await (const chunk of stream as any) {
      if (abortSignal?.aborted) {
        throw new AgentCancelledError()
      }

      const message = chunk[0]
      const metadata = chunk[1]

      if (metadata?.langgraph_node !== 'agent') continue

      const usage = extractUsageFromMessage(message)
      if (usage) {
        // 多轮 tool 调用时保留最后一次（上下文通常最大）
        lastUsage = usage
      }

      const content: string =
        (message as any).content ?? (message as any).kwargs?.content ?? ''
      const toolCallChunks = (message as any).tool_call_chunks ?? []

      if (!content || toolCallChunks.length > 0) continue

      onToken(content)
      fullResponse += content
    }
  } catch (err) {
    if (abortSignal?.aborted || isAbortError(err)) {
      throw new AgentCancelledError()
    }
    throw err
  }

  let usage: TokenUsageSnapshot | undefined
  if (lastUsage) {
    const id = getModelId()
    const maxTokens = await getModelContextLimit(id)
    usage = buildTokenUsageSnapshot(lastUsage, maxTokens, id)
  }

  return { text: fullResponse, usage }
}

export {
  getThreadState,
  replaceThreadMessages,
  rewriteThreadMessage,
  setThreadSummary,
} from './graph/thread_history'
export {
  buildModelContext,
  buildLlmInput,
  compressThreadContext,
  clearCompressionCache,
  summarizeMessagesWithAi,
  sanitizeToolCallPairs,
  simplifyHistoricalToolMessages,
} from './graph/context'
export type { CompressContextResult } from './graph/context'
