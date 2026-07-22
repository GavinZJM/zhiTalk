import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { MemorySaver } from '@langchain/langgraph'
import { ChatOpenAI } from '@langchain/openai'
import * as dotenv from 'dotenv'
import * as path from 'path'
import { tools } from './tools'
import { discoverSkills, formatSkillsCatalog } from './skills/registry'

dotenv.config({ path: path.resolve(__dirname, '../../.env') })
dotenv.config()

// ── Skills：启动时扫描 name + description ─────────────────
const skills = discoverSkills()
const skillsCatalog = formatSkillsCatalog(skills)

const systemPrompt = `You are a helpful assistant.

## Available Skills
The following skills are available. Each entry shows only name and description.
When the user's request matches a skill description, you MUST call the load_skill tool with that skill's exact name to load its full SKILL.md instructions, then follow those instructions.
You can load only one skill per load_skill call.
Do not invent skill contents; always load_skill first when a skill applies.

${skillsCatalog}
`

// ── 模型 ──────────────────────────────────────────────────
const model = new ChatOpenAI({
  model: 'kimi-k2.6',
  apiKey: process.env.MOONSHOT_API_KEY,
  configuration: {
    baseURL: 'https://api.moonshot.cn/v1',
  },
  streaming: true,
})

// ── 记忆 / Checkpointer ───────────────────────────────────
const checkpointer = new MemorySaver()

// ── Agent 创建 ────────────────────────────────────────────
export const agent = createReactAgent({
  llm: model,
  tools,
  messageModifier: systemPrompt,
  checkpointer,
})

/** 用户主动取消（如按 ESC）时抛出 */
export class AgentCancelledError extends Error {
  constructor(message = 'Agent request cancelled') {
    super(message)
    this.name = 'AgentCancelledError'
  }
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
 * 以流式方式运行 agent，将 token 逐个回调给调用方
 * @param userMessage - 当前用户输入（历史已由 checkpointer 自动续接）
 * @param onToken   - 每个 token 到来时的回调 (token: string) => void
 * @param threadId    - 会话 ID，相同 ID 自动续上历史记录
 * @param signal      - 可选 AbortSignal，用于取消本次请求
 * @returns 完整的 AI 回复文本
 */
export async function runAgentStream(
  userMessage: string,
  onToken: (token: string) => void,
  threadId: string = 'default-session',
  signal?: AbortSignal,
): Promise<string> {
  if (signal?.aborted) {
    throw new AgentCancelledError()
  }

  const config = {
    configurable: { thread_id: threadId },
    signal,
    streamMode: 'messages' as const,
  }

  let fullResponse = ''

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

  return fullResponse
}
