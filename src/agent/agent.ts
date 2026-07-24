import * as dotenv from 'dotenv'
import * as path from 'path'
import { agent, modelId } from './graph/app'
import {
  compressThreadContext,
  type CompressContextResult,
  type CompressThreadContextOptions,
} from './graph/context'
import { getThreadState } from './graph/thread_history'
import { getModelContextLimit } from './models/context_limit'
import {
  buildTokenUsageSnapshot,
  extractUsageFromMessage,
  type StreamUsage,
  type TokenUsageSnapshot,
} from './models/token_usage'

dotenv.config({ path: path.resolve(__dirname, '../../.env') })
dotenv.config()

export { agent }

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
 * 以流式方式运行 agent，将 token 逐个回调给调用方
 * @param userMessage - 当前用户输入（历史已由 checkpointer 自动续接）
 * @param onToken   - 每个 token 到来时的回调 (token: string) => void
 * @param threadId    - 会话 ID，相同 ID 自动续上历史记录
 * @param signal      - 可选 AbortSignal，用于取消本次请求
 */
export async function runAgentStream(
  userMessage: string,
  onToken: (token: string) => void,
  threadId: string = 'default-session',
  signal?: AbortSignal,
): Promise<RunAgentStreamResult> {
  if (signal?.aborted) {
    throw new AgentCancelledError()
  }

  const config = {
    configurable: { thread_id: threadId },
    signal,
    streamMode: 'messages' as const,
  }

  let fullResponse = ''
  let lastUsage: StreamUsage | null = null

  try {
    const stream = await agent.stream(
      { messages: [{ role: 'user', content: userMessage }] },
      config,
    )

    for await (const chunk of stream as any) {
      if (signal?.aborted) {
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

      // AIMessageChunk 的 content 在 message.content 属性上，不在 kwargs.content
      const content: string =
        (message as any).content ?? (message as any).kwargs?.content ?? ''
      const toolCallChunks = (message as any).tool_call_chunks ?? []

      if (!content || toolCallChunks.length > 0) continue

      onToken(content)
      fullResponse += content
    }
  } catch (err) {
    if (signal?.aborted || isAbortError(err)) {
      throw new AgentCancelledError()
    }
    throw err
  }

  let usage: TokenUsageSnapshot | undefined
  if (lastUsage) {
    const maxTokens = await getModelContextLimit(modelId)
    usage = buildTokenUsageSnapshot(lastUsage, maxTokens, modelId)
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
} from './graph/context'
export type { CompressContextResult } from './graph/context'
