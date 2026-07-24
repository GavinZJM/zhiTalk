import type { BaseMessage } from '@langchain/core/messages'
import type { RunnableConfig } from '@langchain/core/runnables'
import { agent } from './app'
import {
  buildReplaceMessagesUpdate,
  replaceMessageById,
  toBaseMessages,
} from './context'
import type { AgentStateType } from './state'

function threadConfig(threadId: string): RunnableConfig {
  return { configurable: { thread_id: threadId } }
}

/** 读取当前 thread 的 state（messages + summary） */
export async function getThreadState(
  threadId: string,
): Promise<AgentStateType> {
  const snap = await agent.getState(threadConfig(threadId))
  const values = (snap.values ?? {}) as Partial<AgentStateType>
  return {
    messages: values.messages ?? [],
    summary: values.summary ?? '',
  }
}

/**
 * 用全新消息列表覆盖当前 thread 的 messages（下一轮 AI 只看到这些）。
 * 例：压缩成摘要后只留一条 HumanMessage。
 */
export async function replaceThreadMessages(
  threadId: string,
  nextMessages: Array<BaseMessage | { role: string; content: string }>,
): Promise<void> {
  const messages = toBaseMessages(nextMessages)
  await agent.updateState(
    threadConfig(threadId),
    buildReplaceMessagesUpdate(messages),
  )
}

/**
 * 设置摘要，并可选只保留最近 keepRecent 条原始消息。
 * 之后 buildModelContext 会用「摘要 + 最近 N 条」送给模型。
 */
export async function setThreadSummary(
  threadId: string,
  summary: string,
  options: { keepRecent?: number } = {},
): Promise<void> {
  const keepRecent = options.keepRecent ?? 6
  const { messages } = await getThreadState(threadId)
  const recent = keepRecent > 0 ? messages.slice(-keepRecent) : []

  await agent.updateState(threadConfig(threadId), {
    summary,
    ...buildReplaceMessagesUpdate(recent),
  })
}

/** 按 message id 替换单条内容（例如改成英语） */
export async function rewriteThreadMessage(
  threadId: string,
  messageId: string,
  newContent: string,
): Promise<boolean> {
  const { messages } = await getThreadState(threadId)
  const exists = messages.some((m) => m.id === messageId)
  if (!exists) return false

  const next = replaceMessageById(messages, messageId, newContent)
  await agent.updateState(
    threadConfig(threadId),
    buildReplaceMessagesUpdate(next),
  )
  return true
}
