import { tool, type ToolRuntime } from '@langchain/core/tools'
import { z } from 'zod'
import { readFileTool as readFileImpl } from './read_file_tool'
import { writeFileTool as writeFileImpl } from './write_file_tool'
import { execTool as execImpl } from './exec_tool'
import { runJsTool as runJsImpl } from './run_js_tool'
import { runPyTool as runPyImpl } from './run_py_tool'
import { webSearchTool as webSearchImpl } from './web_search_tool'
import { webFetchTool as webFetchImpl } from './web_fetch_tool'
import { loadSkillTool as loadSkillImpl } from './load_skill_tool'
import {
  MEMORY_TYPES,
  memoryCreateTool as memoryCreateImpl,
} from './memory_create_tool'
import { memoryRetrieveTool as memoryRetrieveImpl } from './memory_retrieve_tool'
import { memoryDeleteTool as memoryDeleteImpl } from './memory_delete_tool'
import { profileUpdateTool as profileUpdateImpl } from './profile_update_tool'
import { agentTool as agentToolImpl } from './agent_tool'
import { withPermissionLevel } from './permission'
import {
  list_mcp_resources_tool,
  read_mcp_resource_tool,
} from '../mcp/resource_tools'

/**
 * 统一注册所有 tools：在此声明 name / description / schema / permission_level，
 * 具体业务实现放在同目录各文件中，便于单独单测。
 */

const readFileSchema = z.object({
  file_path: z
    .string()
    .describe(
      'Path to a local text file. Accepts absolute paths or paths relative to the current working directory.',
    ),
})

export const read_file_tool = withPermissionLevel(
  tool(async ({ file_path }) => readFileImpl(file_path), {
    name: 'read_file',
    description:
      'Read the contents of a local text file. Absolute and relative paths are both allowed.',
    schema: readFileSchema,
  }),
  'read',
)

const writeFileSchema = z.object({
  file_path: z
    .string()
    .describe(
      'Path of the file to create or overwrite. Absolute and relative paths are both allowed.',
    ),
  content: z.string().describe('The full text content to write into the file.'),
})

export const write_file_tool = withPermissionLevel(
  tool(async ({ file_path, content }) => writeFileImpl(file_path, content), {
    name: 'write_file',
    description:
      'Create a new local text file or overwrite an existing one with the given content.',
    schema: writeFileSchema,
  }),
  'write',
)

const execSchema = z.object({
  command: z
    .string()
    .describe(
      'A shell command to run. Dangerous operations such as deleting files (rm), sudo, chmod, dd are blocked.',
    ),
})

export const exec_tool = withPermissionLevel(
  tool(async ({ command }) => execImpl(command), {
    name: 'exec',
    description:
      'Execute a shell command in the current working directory. Destructive commands (e.g. rm, rmdir, sudo, chmod, dd) are rejected.',
    schema: execSchema,
  }),
  'exec',
)

const runJsSchema = z.object({
  code: z
    .string()
    .describe(
      'JavaScript source code to execute with Node.js. Use console.log to print results.',
    ),
})

export const run_js_tool = withPermissionLevel(
  tool(async ({ code }) => runJsImpl(code), {
    name: 'run_js',
    description:
      'Execute JavaScript code with the local Node.js runtime and return stdout/stderr. If Node.js is not installed, returns an installation hint.',
    schema: runJsSchema,
  }),
  'exec',
)

const runPySchema = z.object({
  code: z
    .string()
    .describe(
      'Python 3 source code to execute with python3. Use print() to print results.',
    ),
})

export const run_py_tool = withPermissionLevel(
  tool(async ({ code }) => runPyImpl(code), {
    name: 'run_py',
    description:
      'Execute Python code with the local python3 runtime and return stdout/stderr. If Python 3 is not installed, returns an installation hint.',
    schema: runPySchema,
  }),
  'exec',
)

const webSearchSchema = z.object({
  query: z
    .string()
    .describe('Natural language search query for live web results via Tavily.'),
})

export const web_search_tool = withPermissionLevel(
  tool(async ({ query }) => webSearchImpl(query), {
    name: 'web_search',
    description:
      'Search the live web with Tavily and return titles, URLs, and content snippets. Requires env.TAVILY_API_KEY in ~/.zjmTalk/zjmTalk.json.',
    schema: webSearchSchema,
  }),
  'network',
)

const webFetchSchema = z.object({
  url: z
    .string()
    .describe(
      'HTTP or HTTPS URL to fetch (e.g. a webpage). Returns status, content-type, and body text.',
    ),
})

export const web_fetch_tool = withPermissionLevel(
  tool(async ({ url }) => webFetchImpl(url), {
    name: 'web_fetch',
    description:
      'Fetch a network resource by URL (download webpage HTML/text). On failure, returns an error message instead of throwing.',
    schema: webFetchSchema,
  }),
  'network',
)

const loadSkillSchema = z.object({
  skill_name: z
    .string()
    .describe(
      'Exact skill name to load (from the available skills list). Loads the full SKILL.md for that one skill only.',
    ),
})

export const load_skill_tool = withPermissionLevel(
  tool(async ({ skill_name }) => loadSkillImpl(skill_name), {
    name: 'load_skill',
    description:
      'Load the full SKILL.md content for exactly one skill by name. Use when a user request matches a skill description.',
    schema: loadSkillSchema,
  }),
  'read',
)

const memoryCreateSchema = z.object({
  type: z
    .enum(MEMORY_TYPES)
    .describe(
      "Memory category: 'fact' (stable fact), 'event' (something that happened), 'preference' (user preference), or 'skill' (how the user likes tasks done).",
    ),
  content: z
    .string()
    .describe(
      'Natural-language memory text that can be pasted into a future prompt. Write clearly and specifically.',
    ),
  keywords: z
    .array(z.string())
    .optional()
    .describe('Optional keywords for later retrieval (JSON array in DB).'),
  importance: z
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .describe('Importance 1–5 (default 3). Higher = stronger recall priority.'),
})

export const memory_create_tool = withPermissionLevel(
  tool(
    async ({ type, content, keywords, importance }, runtime: ToolRuntime) => {
      const sessionId = String(runtime?.configurable?.thread_id ?? '') || null
      return memoryCreateImpl({
        type,
        content,
        keywords,
        importance,
        sessionId,
      })
    },
    {
      name: 'memory_create',
      description:
        'Persist a long-term memory about the user or project to the local SQLite memory table. Call when the user states lasting facts, preferences, events, or skills worth remembering across sessions.',
      schema: memoryCreateSchema,
    },
  ),
  'db',
)

const memoryRetrieveSchema = z.object({
  keywords: z
    .array(z.string())
    .min(1)
    .describe(
      'Keywords distilled from the user question for full-text memory search (e.g. ["水果", "偏好"]). Prefer concrete nouns and preference/fact terms.',
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe('Max memories to return (default 10).'),
})

export const memory_retrieve_tool = withPermissionLevel(
  tool(async ({ keywords, limit }) => memoryRetrieveImpl({ keywords, limit }), {
    name: 'memory_retrieve',
    description:
      'Search long-term memories in local SQLite (memory + memory_fts) by keywords. Use when the user asks about something that may have been stored earlier and is not in the current conversation context. Ranked by FTS relevance, importance, and recency.',
    schema: memoryRetrieveSchema,
  }),
  'db',
)

const memoryDeleteSchema = z.object({
  ids: z
    .array(z.number().int().positive())
    .min(1)
    .describe(
      'Memory id(s) to delete. Prefer ids returned by memory_retrieve. Confirm with the user before deleting when unsure.',
    ),
})

export const memory_delete_tool = withPermissionLevel(
  tool(async ({ ids }) => memoryDeleteImpl({ ids }), {
    name: 'memory_delete',
    description:
      'Delete one or more long-term memories by id from local SQLite (memory table; memory_fts is synced by trigger). Use when the user asks to forget or remove a stored memory.',
    schema: memoryDeleteSchema,
  }),
  'db',
)

const profileUpdateSchema = z.object({
  content: z
    .string()
    .describe(
      'The FULL updated user profile text covering all known profile dimensions (identity, appearance, personality/communication preferences, hobbies, skills, work). Always merge with existing <profile_info>: keep previous facts that are still true, apply the user\'s new changes, and do not drop unrelated fields. Write plain profile markdown (profile_template structure); do not store ephemeral chat notes.',
    ),
})

export const profile_update_tool = withPermissionLevel(
  tool(async ({ content }) => profileUpdateImpl(content), {
    name: 'profile_update',
    description:
      'Create or replace the user profile document. Use when the user shares lasting personal profile info that fits <profile_template>. Always submit the complete profile (existing <profile_info> plus new/changed fields together), never a partial fragment that would erase other known profile details. Profile info must NOT be stored via memory_create.',
    schema: profileUpdateSchema,
  }),
  'write',
)

const agentToolSchema = z.object({
  prompt: z
    .string()
    .describe(
      'A self-contained task description for the subagent. Include all necessary context; the subagent does not receive the parent chat history.',
    ),
})

export const agent_tool = withPermissionLevel(
  tool(async ({ prompt }) => agentToolImpl(prompt), {
    name: 'agent_tool',
    description:
      'Start a single subagent to complete an independent task. Pass only a plain-text prompt (no chat history). The subagent has the same tools/skills/memory/hooks as the main agent except it cannot start another subagent. Only one subagent may run at a time. Returns the subagent final answer.',
    schema: agentToolSchema,
  }),
  'exec',
)

/**
 * Subagent 可用工具（不含 agent_tool，禁止嵌套）。
 * Main agent 在此基础上再挂 agent_tool。
 * 动态 MCP server tools 在 initAgentRuntime 时追加。
 */
export const subagentTools = [
  exec_tool,
  run_js_tool,
  run_py_tool,
  web_search_tool,
  web_fetch_tool,
  read_file_tool,
  write_file_tool,
  load_skill_tool,
  memory_create_tool,
  memory_retrieve_tool,
  memory_delete_tool,
  profile_update_tool,
  list_mcp_resources_tool,
  read_mcp_resource_tool,
]

/** 供 main agent 挂载；新增 tool 时在此追加即可 */
export const tools = [...subagentTools, agent_tool]

export {
  list_mcp_resources_tool,
  read_mcp_resource_tool,
}

export type { PermissionLevel } from './permission'
export {
  PERMISSION_LEVELS,
  getToolPermissionLevel,
  withPermissionLevel,
} from './permission'
