import { AIMessage } from '@langchain/core/messages'
import {
  START,
  StateGraph,
} from '@langchain/langgraph'
import { ToolNode, toolsCondition } from '@langchain/langgraph/prebuilt'
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite'
import { ChatOpenAI } from '@langchain/openai'
import type { RunnableConfig } from '@langchain/core/runnables'
import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'
import { getCheckpointerDbPath } from '../checkpointer/db_path'
import {
  getModelId,
  getMoonshotApiKey,
  getMoonshotBaseUrl,
} from '../models/config'
import { tools } from '../tools'
import { maybeSpillToolMessage } from '../tools/spill_tool_output'
import { discoverSkills, formatSkillsCatalog } from '../skills/registry'
import { style } from '../ui/style'
import { buildLlmInput } from './context'
import { AgentState, type AgentStateType } from './state'

dotenv.config({ path: path.resolve(__dirname, '../../../.env') })
dotenv.config()

const skills = discoverSkills()
const skillsCatalog = formatSkillsCatalog(skills)

export const systemPrompt = `You are a helpful assistant.

## Available Skills
The following skills are available. Each entry shows only name and description.
When the user's request matches a skill description, you MUST call the load_skill tool with that skill's exact name to load its full SKILL.md instructions, then follow those instructions.
You can load only one skill per load_skill call.
Do not invent skill contents; always load_skill first when a skill applies.

${skillsCatalog}

## Large Tool Outputs
If a tool result is too large, it is saved to a local file and the message only contains the file path plus a short preview.
Do not pretend you already have the full output. When you need more of it, use exec / run_js / run_py to read that file in chunks (head, sed, or open().read()[:N]).
`

export const modelId = getModelId()

const model = new ChatOpenAI({
  model: modelId,
  apiKey: getMoonshotApiKey(),
  configuration: {
    baseURL: getMoonshotBaseUrl(),
  },
  streaming: true,
  streamUsage: true,
}).bindTools(tools)

const checkpointDbPath = getCheckpointerDbPath()
fs.mkdirSync(path.dirname(checkpointDbPath), { recursive: true })
const checkpointer = SqliteSaver.fromConnString(checkpointDbPath)

/**
 * agent 节点：通过 buildLlmInput / buildModelContext
 * 控制真正传给大模型的聊天记录（可读进程内压缩缓存，不改 checkpointer）。
 */
async function callModel(state: AgentStateType, config: RunnableConfig) {
  const threadId = String(config.configurable?.thread_id ?? '')
  const llmMessages = buildLlmInput(systemPrompt, state, { threadId })
  const response = await model.invoke(llmMessages)
  return { messages: [response] }
}

const toolsExecutor = new ToolNode(tools)

/**
 * tools 节点：调用前打印工具名与参数；调用后若输出过大则落盘，messages 只保留路径提示。
 */
async function toolNode(state: AgentStateType, config: RunnableConfig) {
  const lastMessage = state.messages.at(-1)
  if (AIMessage.isInstance(lastMessage)) {
    for (const call of lastMessage.tool_calls ?? []) {
      if (!call?.name) continue
      console.log(style.tool(`\n[Tool] ${call.name}`))
      const argsText = formatToolArgs(call.args)
      if (argsText) {
        console.log(style.toolPreview(argsText))
      }
    }
  }

  const result = await toolsExecutor.invoke(state, config)
  return rewriteLargeToolOutputs(result)
}

function formatToolArgs(args: unknown, maxLen = 800): string {
  if (args == null) return ''
  let text: string
  try {
    text = typeof args === 'string' ? args : JSON.stringify(args, null, 2)
  } catch {
    text = String(args)
  }
  if (text.length <= maxLen) return text
  return `${text.slice(0, maxLen)}…`
}

async function rewriteLargeToolOutputs(result: unknown): Promise<unknown> {
  if (result == null || typeof result !== 'object') {
    return result
  }

  const record = result as { messages?: unknown[] }
  if (!Array.isArray(record.messages)) {
    return result
  }

  const messages = await Promise.all(
    record.messages.map((msg) => maybeSpillToolMessage(msg)),
  )
  return { ...record, messages }
}

/** 编译后的 StateGraph（带 SQLite checkpointer） */
export const agent = new StateGraph(AgentState)
  .addNode('agent', callModel)
  .addNode('tools', toolNode)
  .addEdge(START, 'agent')
  .addConditionalEdges('agent', toolsCondition)
  .addEdge('tools', 'agent')
  .compile({ checkpointer })
