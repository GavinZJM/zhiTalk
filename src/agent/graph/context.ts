import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  RemoveMessage,
  SystemMessage,
  ToolMessage,
  isBaseMessage,
} from '@langchain/core/messages'
import { REMOVE_ALL_MESSAGES } from '@langchain/langgraph'
import { createChatModel } from '../models/model'
import type { AgentStateType } from './state'

/** 压缩时保留的最近消息条数（不参与压缩） */
export const KEEP_RECENT_MESSAGES = 6

/** 历史 ToolMessage 简化时，保留最近 N 条原文不简化 */
export const KEEP_RECENT_TOOL_MESSAGES = 3

/** 永不简化内容的 tool 名（与 tools/index 中 name 一致） */
export const PRESERVE_TOOL_MESSAGE_NAMES = new Set(['read_file'])

/** 压缩次数达到该值后强烈建议 /new */
export const COMPRESSION_COUNT_WARN_AT = 3

export type BuildModelContextOptions = {
  /** summary 之外再保留最近 N 条原始消息（默认 6） */
  keepRecent?: number
  /** 用于读取进程内压缩缓存；不传则不做缓存摘要 */
  threadId?: string
}

/** 每个 thread 的压缩缓存（不写 checkpointer） */
export type ThreadCompressionCache = {
  summary: string
  /** 已纳入过摘要的消息 key，避免重复压缩 */
  compressedKeys: Set<string>
  compressionCount: number
}

const compressionCacheByThread = new Map<string, ThreadCompressionCache>()

export function getCompressionCache(
  threadId: string,
): ThreadCompressionCache | undefined {
  return compressionCacheByThread.get(threadId)
}

export function clearCompressionCache(threadId?: string): void {
  if (threadId) {
    compressionCacheByThread.delete(threadId)
    return
  }
  compressionCacheByThread.clear()
}

function ensureCache(threadId: string): ThreadCompressionCache {
  let cache = compressionCacheByThread.get(threadId)
  if (!cache) {
    cache = {
      summary: '',
      compressedKeys: new Set(),
      compressionCount: 0,
    }
    compressionCacheByThread.set(threadId, cache)
  }
  return cache
}

/** 稳定标识一条消息（优先用 id） */
export function getMessageKey(message: BaseMessage, index: number): string {
  if (message.id) return String(message.id)
  const type = typeof message._getType === 'function' ? message._getType() : 'msg'
  const content = String(message.content ?? '').slice(0, 120)
  return `idx:${index}:${type}:${content}`
}

function formatMessageForSummary(message: BaseMessage): string {
  const role =
    typeof message._getType === 'function' ? message._getType() : 'message'
  const content =
    typeof message.content === 'string'
      ? message.content
      : JSON.stringify(message.content)
  return `[${role}] ${content}`
}

export type SummarizeMessagesOptions = {
  /** 注入模型，便于单测 */
  model?: {
    invoke: (messages: BaseMessage[]) => Promise<{ content: unknown }>
  }
  previousSummary?: string
}

/**
 * 单独调用 AI 接口，把待压缩消息总结成一段摘要文本。
 * 若已有 previousSummary，则合并进新摘要（不重复叙述旧内容的细节时可概括继承）。
 */
export async function summarizeMessagesWithAi(
  messagesToCompress: BaseMessage[],
  options: SummarizeMessagesOptions = {},
): Promise<string> {
  if (messagesToCompress.length === 0) {
    return options.previousSummary?.trim() || ''
  }

  const transcript = messagesToCompress.map(formatMessageForSummary).join('\n\n')
  const previous = options.previousSummary?.trim()

  const userPrompt = previous
    ? [
        '下面是已有的对话摘要：',
        previous,
        '',
        '下面是尚未纳入摘要的新增对话：',
        transcript,
        '',
        '请输出「更新后的完整摘要」（合并新旧信息，去掉重复，保留关键事实、结论、用户偏好与未完成事项）。',
        '只输出摘要正文，不要开场白或解释。',
      ].join('\n')
    : [
        '请将下面的对话压缩成简洁摘要。',
        '保留关键事实、结论、用户偏好与未完成事项；去掉寒暄与重复。',
        '只输出摘要正文，不要开场白或解释。',
        '',
        transcript,
      ].join('\n')

  const model =
    options.model ??
    createChatModel({
      streaming: false,
      streamUsage: false,
      // kimi-k2.x 不允许自定义 temperature（仅允许模型固定值）
    })

  const response = await model.invoke([
    new SystemMessage('你是对话摘要助手，只输出摘要正文。'),
    new HumanMessage(userPrompt),
  ])

  const text = String(response.content ?? '').trim()
  return text || previous || ''
}

export type CompressContextResult = {
  /** 是否实际调用了压缩（有新内容） */
  compressed: boolean
  summary: string
  compressionCount: number
  /** 本轮新纳入压缩的消息条数 */
  newlyCompressedCount: number
  /** 是否应强烈建议 /new */
  suggestNewSession: boolean
  message: string
}

export type CompressThreadContextOptions = {
  keepRecent?: number
  summarize?: typeof summarizeMessagesWithAi
}

/**
 * 压缩某 thread 的上下文：
 * - 不修改 checkpointer / state.messages
 * - 保留最近 keepRecent 条不压缩
 * - 已压缩过的消息跳过
 * - 结果写入进程内缓存，供 buildModelContext 使用
 */
export async function compressThreadContext(
  threadId: string,
  messages: BaseMessage[],
  options: CompressThreadContextOptions = {},
): Promise<CompressContextResult> {
  const keepRecent = options.keepRecent ?? KEEP_RECENT_MESSAGES
  const summarize = options.summarize ?? summarizeMessagesWithAi
  const cache = ensureCache(threadId)

  if (messages.length <= keepRecent) {
    return {
      compressed: false,
      summary: cache.summary,
      compressionCount: cache.compressionCount,
      newlyCompressedCount: 0,
      suggestNewSession: cache.compressionCount >= COMPRESSION_COUNT_WARN_AT,
      message: '消息较少，无需压缩。',
    }
  }

  const older = messages.slice(0, -keepRecent)
  const toCompress: BaseMessage[] = []
  const newKeys: string[] = []

  for (let i = 0; i < older.length; i++) {
    const msg = older[i]
    const key = getMessageKey(msg, i)
    if (cache.compressedKeys.has(key)) continue
    toCompress.push(msg)
    newKeys.push(key)
  }

  if (toCompress.length === 0) {
    return {
      compressed: false,
      summary: cache.summary,
      compressionCount: cache.compressionCount,
      newlyCompressedCount: 0,
      suggestNewSession: cache.compressionCount >= COMPRESSION_COUNT_WARN_AT,
      message: '没有新增可压缩消息（较早内容已压缩过）。',
    }
  }

  const summary = await summarize(toCompress, {
    previousSummary: cache.summary || undefined,
  })

  for (const key of newKeys) {
    cache.compressedKeys.add(key)
  }
  cache.summary = summary
  cache.compressionCount += 1

  const suggestNewSession = cache.compressionCount >= COMPRESSION_COUNT_WARN_AT
  const lines = [
    `已压缩 Context（第 ${cache.compressionCount} 次）：新增压缩 ${toCompress.length} 条消息，保留最近 ${keepRecent} 条原文。`,
    '下一轮对话将使用「摘要 + 最近消息」。checkpointer 中的完整记录未改动。',
  ]
  if (suggestNewSession) {
    lines.push(
      `⚠ 已压缩 ${cache.compressionCount} 次（≥${COMPRESSION_COUNT_WARN_AT}），强烈建议输入 /new 开启新会话，以免摘要失真。`,
    )
  }

  return {
    compressed: true,
    summary: cache.summary,
    compressionCount: cache.compressionCount,
    newlyCompressedCount: toCompress.length,
    suggestNewSession,
    message: lines.join('\n'),
  }
}

/**
 * 修复 / 补全 tool_calls 与 ToolMessage 配对，避免 Moonshot 等 API 报
 * INVALID_TOOL_RESULTS（assistant.tool_calls 缺少对应 tool 回复）。
 *
 * - 缺结果：补一条占位 ToolMessage
 * - 孤儿 ToolMessage（前面没有对应 AI tool_calls）：丢弃
 * - 不修改 checkpointer，只影响送给模型的副本
 */
export function sanitizeToolCallPairs(messages: BaseMessage[]): BaseMessage[] {
  const out: BaseMessage[] = []
  let i = 0

  while (i < messages.length) {
    const msg = messages[i]

    if (AIMessage.isInstance(msg) && (msg.tool_calls?.length ?? 0) > 0) {
      const calls = msg.tool_calls ?? []
      const required = new Map<string, string | undefined>()
      for (const call of calls) {
        if (call?.id) required.set(String(call.id), call.name)
      }

      const toolMsgs: ToolMessage[] = []
      const seen = new Set<string>()
      let j = i + 1
      while (j < messages.length && ToolMessage.isInstance(messages[j])) {
        const tm = messages[j] as ToolMessage
        const id = String(tm.tool_call_id ?? '')
        if (required.has(id) && !seen.has(id)) {
          toolMsgs.push(tm)
          seen.add(id)
        }
        // 不匹配或重复的 tool 结果丢弃，避免污染配对
        j += 1
      }

      out.push(msg)
      for (const tm of toolMsgs) {
        out.push(tm)
      }
      for (const [id, name] of required) {
        if (seen.has(id)) continue
        out.push(
          new ToolMessage({
            content:
              '[tool result missing — interrupted or not persisted; continue without this output]',
            tool_call_id: id,
            name,
          }),
        )
      }
      i = j
      continue
    }

    if (ToolMessage.isInstance(msg)) {
      // 孤儿 tool 结果：前面没有 AI tool_calls
      i += 1
      continue
    }

    out.push(msg)
    i += 1
  }

  return out
}

/**
 * 简化历史 ToolMessage 内容，减轻 context 臃肿。
 * - 只改 ToolMessage；Human / AI / System 不动
 * - 不写 checkpointer，仅作用于送给模型的副本
 * - read_file（及 options.preserveToolNames）永不简化
 * - 最近 keepRecentTools 条 ToolMessage 保留原文
 */
export function simplifyHistoricalToolMessages(
  messages: BaseMessage[],
  options: {
    keepRecentTools?: number
    preserveToolNames?: ReadonlySet<string>
  } = {},
): BaseMessage[] {
  const keepRecentTools = options.keepRecentTools ?? KEEP_RECENT_TOOL_MESSAGES
  const preserve =
    options.preserveToolNames ?? PRESERVE_TOOL_MESSAGE_NAMES

  const toolIndices: number[] = []
  for (let i = 0; i < messages.length; i++) {
    if (ToolMessage.isInstance(messages[i])) toolIndices.push(i)
  }

  const keepSet = new Set(
    keepRecentTools > 0 ? toolIndices.slice(-keepRecentTools) : [],
  )

  return messages.map((msg, index) => {
    if (!ToolMessage.isInstance(msg)) return msg
    if (keepSet.has(index)) return msg

    const toolName = msg.name || 'tool'
    if (preserve.has(toolName)) return msg

    const simplified = `[Previous: used ${toolName}]`
    if (String(msg.content) === simplified) return msg

    return new ToolMessage({
      content: simplified,
      tool_call_id: msg.tool_call_id,
      name: msg.name,
      id: msg.id,
      additional_kwargs: msg.additional_kwargs,
      response_metadata: msg.response_metadata,
    })
  })
}

/**
 * 【控制点】决定「这一轮真正送给模型」的消息列表。
 *
 * - 无压缩缓存摘要：用 state.messages 全文
 * - 有缓存摘要：用「摘要 + 最近 keepRecent 条」（不改 checkpointer）
 * - sanitizeToolCallPairs：补全残缺 tool 对
 * - simplifyHistoricalToolMessages：压缩旧 ToolMessage 正文
 */
export function buildModelContext(
  state: Pick<AgentStateType, 'messages' | 'summary'>,
  options: BuildModelContextOptions = {},
): BaseMessage[] {
  const keepRecent = options.keepRecent ?? KEEP_RECENT_MESSAGES
  const messages = state.messages ?? []
  const cached = options.threadId
    ? getCompressionCache(options.threadId)?.summary?.trim()
    : ''
  // 优先用进程内压缩缓存；不读/不依赖 checkpointer 里的 summary 字段
  const summary = cached || ''

  const selected = !summary
    ? [...messages]
    : [
        new HumanMessage({
          content: `【对话摘要】\n${summary}`,
        }),
        ...(keepRecent > 0 ? messages.slice(-keepRecent) : []),
      ]

  return simplifyHistoricalToolMessages(sanitizeToolCallPairs(selected))
}

/** 给模型调用用：system + buildModelContext(...) */
export function buildLlmInput(
  systemPrompt: string,
  state: Pick<AgentStateType, 'messages' | 'summary'>,
  options?: BuildModelContextOptions,
): BaseMessage[] {
  return [new SystemMessage(systemPrompt), ...buildModelContext(state, options)]
}

/**
 * 构造「清空旧 messages 后写入新列表」的 updateState payload。
 * messages 通道是 append reducer，必须先 REMOVE_ALL 再写入。
 */
export function buildReplaceMessagesUpdate(
  nextMessages: BaseMessage[],
): { messages: BaseMessage[] } {
  return {
    messages: [
      new RemoveMessage({ id: REMOVE_ALL_MESSAGES }),
      ...nextMessages,
    ],
  }
}

/**
 * 把某条消息替换成新内容（按 id；找不到则原样返回）。
 * 用于例如「把某条改成英语」。
 */
export function replaceMessageById(
  messages: BaseMessage[],
  messageId: string,
  newContent: string,
): BaseMessage[] {
  return messages.map((m) => {
    if (m.id !== messageId) return m
    if (HumanMessage.isInstance(m)) {
      return new HumanMessage({ id: m.id, content: newContent })
    }
    if (AIMessage.isInstance(m)) {
      return new AIMessage({ id: m.id, content: newContent })
    }
    return new HumanMessage({ id: m.id, content: newContent })
  })
}

/** 规范化输入：允许 plain {role,content} 或 BaseMessage */
export function toBaseMessages(
  input: Array<BaseMessage | { role: string; content: string }>,
): BaseMessage[] {
  return input.map((m) => {
    if (isBaseMessage(m)) return m
    if (m.role === 'assistant' || m.role === 'ai') {
      return new AIMessage(m.content)
    }
    if (m.role === 'system') {
      return new SystemMessage(m.content)
    }
    return new HumanMessage(m.content)
  })
}
