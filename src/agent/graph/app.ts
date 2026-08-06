import {
  AIMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages'
import type { StructuredToolInterface } from '@langchain/core/tools'
import {
  START,
  StateGraph,
} from '@langchain/langgraph'
import { ToolNode, toolsCondition } from '@langchain/langgraph/prebuilt'
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite'
import type { RunnableConfig } from '@langchain/core/runnables'
import * as dotenv from 'dotenv'
import * as path from 'path'
import { ensureCheckpointerDatabase } from '../checkpointer/db_path'
import {
  formatHookInjection,
  getSessionHookExtras,
  runHooks,
} from '../hooks'
import { createChatModel, getModelId } from '../models/model'
import { subagentTools, tools, agent_tool } from '../tools'
import { getToolPermissionLevel } from '../tools/permission'
import { maybeSpillToolMessage } from '../tools/spill_tool_output'
import { discoverSkills, formatSkillsCatalog } from '../skills/registry'
import { style } from '../ui/style'
import { memoryPrompt } from '../memory_prompt'
import { buildProfilePrompt, buildSystemPrompt } from '../prompt'
import {
  getMcpCatalogText,
  initMcpRuntime,
  shutdownMcpRuntime,
} from '../mcp'
import { buildLlmInput } from './context'
import { AgentState, type AgentStateType } from './state'
import { classifyToolPermission } from '../permission/classify'

dotenv.config({ path: path.resolve(__dirname, '../../../.env') })
dotenv.config()

const skills = discoverSkills()
const skillsCatalog = formatSkillsCatalog(skills)

export { memoryPrompt, buildProfilePrompt, buildSystemPrompt }

/** 兼容旧用法：每次访问时重新读取 profile.md */
export function profilePrompt(): string {
  return buildProfilePrompt()
}

/** 完整 system prompt（含当前 profile.md + SessionStart + MCP catalog）；每次调用重新构建 */
export function getSystemPrompt(): string {
  const base = buildSystemPrompt(skillsCatalog, getMcpCatalogText())
  const extras = getSessionHookExtras()
  if (!extras) return base
  return `${base}\n\n## Session Hook Context\n${extras}`
}

/** @deprecated 使用 getSystemPrompt()，以便加载最新 profile */
export const systemPrompt = getSystemPrompt()

/** 当前配置中的模型 id（读自 ~/.zjmTalk/zjmTalk.json） */
export function modelId(): string {
  return getModelId()
}

const checkpointDbPath = ensureCheckpointerDatabase()
const checkpointer = SqliteSaver.fromConnString(checkpointDbPath)

type ToolCallLike = {
  id?: string
  name?: string
  args?: unknown
}

function rejectToolMessage(
  call: ToolCallLike,
  content: string,
): ToolMessage {
  return new ToolMessage({
    content,
    tool_call_id: String(call.id ?? ''),
    name: call.name,
  })
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

/**
 * 用指定 tool 列表编译一张 StateGraph（main / sub 共用同一套节点逻辑与 checkpointer）。
 */
export function compileAgentGraph(toolList: StructuredToolInterface[]) {
  const model = createChatModel({
    streaming: true,
    streamUsage: true,
  }).bindTools(toolList)

  const toolsExecutor = new ToolNode(toolList)

  async function callModel(state: AgentStateType, config: RunnableConfig) {
    const threadId = String(config.configurable?.thread_id ?? '')
    const llmMessages = buildLlmInput(getSystemPrompt(), state, { threadId })
    const response = await model.invoke(llmMessages)
    return { messages: [response] }
  }

  async function toolNode(state: AgentStateType, config: RunnableConfig) {
    const lastMessage = state.messages.at(-1)
    const toolCalls = AIMessage.isInstance(lastMessage)
      ? (lastMessage.tool_calls ?? []).filter((c) => c?.name)
      : []

    const projectRoot = process.cwd()
    const threadId = String(config.configurable?.thread_id ?? '')
    const preInjects: SystemMessage[] = []
    const preResults: ToolMessage[] = []
    const toRun: ToolCallLike[] = []

    for (const call of toolCalls) {
      const matched = toolList.find((t) => t.name === call.name)
      const permission_level = matched
        ? getToolPermissionLevel(matched)
        : undefined
      const policy = classifyToolPermission(
        { permission_level, args: call.args },
        { projectRoot, cwd: projectRoot },
      )

      if (policy.action === 'block') {
        preResults.push(
          rejectToolMessage(
            call,
            policy.reason ||
              'Access denied: path is protected and cannot be accessed by tools.',
          ),
        )
        console.log(
          style.tool(
            `\n[Tool blocked] ${call.name}: ${policy.filepath ?? '(path)'}`,
          ),
        )
        continue
      }

      const preHook = await runHooks(
        'PreToolUse',
        {
          thread_id: threadId,
          tool_name: call.name,
          tool_input: call.args,
          permission_level,
          cwd: projectRoot,
        },
        { matchAgainst: call.name ?? '', cwd: projectRoot },
      )

      if (preHook.blocked) {
        preResults.push(
          rejectToolMessage(
            call,
            preHook.blockMessage || 'Blocked by PreToolUse hook.',
          ),
        )
        console.log(
          style.tool(`\n[Tool blocked by hook] ${call.name}`),
        )
        continue
      }

      for (const inj of preHook.injections) {
        const text = formatHookInjection('PreToolUse', inj)
        if (text) preInjects.push(new SystemMessage(text))
      }

      toRun.push(call)
    }

    if (toRun.length === 0) {
      return { messages: [...preInjects, ...preResults] }
    }

    for (const call of toRun) {
      console.log(style.tool(`\n[Tool] ${call.name}`))
      const argsText = formatToolArgs(call.args)
      if (argsText) {
        console.log(style.toolPreview(argsText))
      }
    }

    const stateForRun = {
      ...state,
      messages: [...state.messages, ...preInjects, ...preResults],
    }
    const result = await toolsExecutor.invoke(stateForRun, config)
    const rewritten = await rewriteLargeToolOutputs(result)
    const runMessages =
      rewritten &&
      typeof rewritten === 'object' &&
      Array.isArray((rewritten as { messages?: unknown[] }).messages)
        ? ((rewritten as { messages: unknown[] }).messages as ToolMessage[])
        : []

    const postInjects: SystemMessage[] = []
    const finalToolMessages: ToolMessage[] = []
    const argsByCallId = new Map<string, unknown>()
    for (const call of toolCalls) {
      if (call.id) argsByCallId.set(String(call.id), call.args)
    }

    for (const msg of runMessages) {
      if (!ToolMessage.isInstance(msg)) {
        finalToolMessages.push(msg as ToolMessage)
        continue
      }

      const toolName = String(msg.name ?? '')
      const matched = toolList.find((t) => t.name === toolName)
      const permission_level = matched
        ? getToolPermissionLevel(matched)
        : undefined
      const toolOutput =
        typeof msg.content === 'string'
          ? msg.content
          : JSON.stringify(msg.content)
      const toolInput = argsByCallId.get(String(msg.tool_call_id))

      const postHook = await runHooks(
        'PostToolUse',
        {
          thread_id: threadId,
          tool_name: toolName,
          tool_input: toolInput,
          tool_output: toolOutput,
          permission_level,
          cwd: projectRoot,
        },
        { matchAgainst: toolName, cwd: projectRoot },
      )

      if (postHook.blocked) {
        finalToolMessages.push(
          new ToolMessage({
            content:
              postHook.blockMessage || 'Overwritten by PostToolUse hook.',
            tool_call_id: msg.tool_call_id,
            name: msg.name,
          }),
        )
        continue
      }

      finalToolMessages.push(msg)
      for (const inj of postHook.injections) {
        const text = formatHookInjection('PostToolUse', inj)
        if (text) postInjects.push(new SystemMessage(text))
      }
    }

    return {
      messages: [
        ...preInjects,
        ...preResults,
        ...finalToolMessages,
        ...postInjects,
      ],
    }
  }

  return new StateGraph(AgentState)
    .addNode('agent', callModel)
    .addNode('tools', toolNode)
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', toolsCondition)
    .addEdge('tools', 'agent')
    .compile({ checkpointer })
}

type CompiledAgent = ReturnType<typeof compileAgentGraph>

/** 默认先用本地 tools 编译；initAgentRuntime 后会挂上 MCP tools 并重建 */
let mainGraph: CompiledAgent | null = null
let subGraph: CompiledAgent | null = null
let runtimeReady = false

function ensureDefaultGraphs(): void {
  if (!mainGraph) mainGraph = compileAgentGraph(tools)
  if (!subGraph) subGraph = compileAgentGraph(subagentTools)
}

/**
 * 连接 MCP、合并 tools、重新编译 main/sub 图。
 * CLI 启动时调用；可重复调用（会先关闭旧 MCP 连接）。
 */
export async function initAgentRuntime(options?: {
  configPath?: string
}): Promise<void> {
  const mcpState = await initMcpRuntime({ configPath: options?.configPath })
  const mcpTools = mcpState.mcpTools

  const subTools = [...subagentTools, ...mcpTools]
  const mainTools = [...subTools, agent_tool]

  mainGraph = compileAgentGraph(mainTools)
  subGraph = compileAgentGraph(subTools)
  runtimeReady = true
}

export async function shutdownAgentRuntime(): Promise<void> {
  await shutdownMcpRuntime()
  mainGraph = compileAgentGraph(tools)
  subGraph = compileAgentGraph(subagentTools)
  runtimeReady = false
}

export function isAgentRuntimeReady(): boolean {
  return runtimeReady
}

export function getAgentGraph(variant: 'main' | 'sub' = 'main'): CompiledAgent {
  ensureDefaultGraphs()
  return variant === 'sub' ? subGraph! : mainGraph!
}

/** 转发到当前 mainGraph（initAgentRuntime 后自动切到含 MCP 的图） */
function liveGraphProxy(getGraph: () => CompiledAgent): CompiledAgent {
  return new Proxy({} as CompiledAgent, {
    get(_target, prop) {
      const g = getGraph() as unknown as Record<string | symbol, unknown>
      const value = g[prop]
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(g)
        : value
    },
  })
}

/** Main agent 图（Proxy，始终指向最新编译结果） */
export const agent = liveGraphProxy(() => getAgentGraph('main'))

/** Subagent 图 */
export const subAgent = liveGraphProxy(() => getAgentGraph('sub'))
