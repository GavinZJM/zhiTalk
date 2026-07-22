import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { readFileTool as readFileImpl } from './read_file_tool'
import { writeFileTool as writeFileImpl } from './write_file_tool'
import { execTool as execImpl } from './exec_tool'
import { runJsTool as runJsImpl } from './run_js_tool'
import { runPyTool as runPyImpl } from './run_py_tool'
import { webSearchTool as webSearchImpl } from './web_search_tool'
import { webFetchTool as webFetchImpl } from './web_fetch_tool'
import { loadSkillTool as loadSkillImpl } from './load_skill_tool'

/**
 * 统一注册所有 tools：在此声明 name / description / schema，
 * 具体业务实现放在同目录各文件中，便于单独单测。
 */

const readFileSchema = z.object({
  file_path: z
    .string()
    .describe(
      'Path to a local text file. Accepts absolute paths or paths relative to the current working directory.',
    ),
})

export const read_file_tool = tool(
  async ({ file_path }) => readFileImpl(file_path),
  {
    name: 'read_file',
    description:
      'Read the contents of a local text file. Absolute and relative paths are both allowed.',
    schema: readFileSchema,
  },
)

const writeFileSchema = z.object({
  file_path: z
    .string()
    .describe(
      'Path of the file to create or overwrite. Absolute and relative paths are both allowed.',
    ),
  content: z.string().describe('The full text content to write into the file.'),
})

export const write_file_tool = tool(
  async ({ file_path, content }) => writeFileImpl(file_path, content),
  {
    name: 'write_file',
    description:
      'Create a new local text file or overwrite an existing one with the given content.',
    schema: writeFileSchema,
  },
)

const execSchema = z.object({
  command: z
    .string()
    .describe(
      'A shell command to run. Dangerous operations such as deleting files (rm), sudo, chmod, dd are blocked.',
    ),
})

export const exec_tool = tool(
  async ({ command }) => execImpl(command),
  {
    name: 'exec',
    description:
      'Execute a shell command in the current working directory. Destructive commands (e.g. rm, rmdir, sudo, chmod, dd) are rejected.',
    schema: execSchema,
  },
)

const runJsSchema = z.object({
  code: z
    .string()
    .describe(
      'JavaScript source code to execute with Node.js. Use console.log to print results.',
    ),
})

export const run_js_tool = tool(
  async ({ code }) => runJsImpl(code),
  {
    name: 'run_js',
    description:
      'Execute JavaScript code with the local Node.js runtime and return stdout/stderr. If Node.js is not installed, returns an installation hint.',
    schema: runJsSchema,
  },
)

const runPySchema = z.object({
  code: z
    .string()
    .describe(
      'Python 3 source code to execute with python3. Use print() to print results.',
    ),
})

export const run_py_tool = tool(
  async ({ code }) => runPyImpl(code),
  {
    name: 'run_py',
    description:
      'Execute Python code with the local python3 runtime and return stdout/stderr. If Python 3 is not installed, returns an installation hint.',
    schema: runPySchema,
  },
)

const webSearchSchema = z.object({
  query: z
    .string()
    .describe('Natural language search query for live web results via Tavily.'),
})

export const web_search_tool = tool(
  async ({ query }) => webSearchImpl(query),
  {
    name: 'web_search',
    description:
      'Search the live web with Tavily and return titles, URLs, and content snippets. Requires TAVILY_API_KEY.',
    schema: webSearchSchema,
  },
)

const webFetchSchema = z.object({
  url: z
    .string()
    .describe(
      'HTTP or HTTPS URL to fetch (e.g. a webpage). Returns status, content-type, and body text.',
    ),
})

export const web_fetch_tool = tool(
  async ({ url }) => webFetchImpl(url),
  {
    name: 'web_fetch',
    description:
      'Fetch a network resource by URL (download webpage HTML/text). On failure, returns an error message instead of throwing.',
    schema: webFetchSchema,
  },
)

const loadSkillSchema = z.object({
  skill_name: z
    .string()
    .describe(
      'Exact skill name to load (from the available skills list). Loads the full SKILL.md for that one skill only.',
    ),
})

export const load_skill_tool = tool(
  async ({ skill_name }) => loadSkillImpl(skill_name),
  {
    name: 'load_skill',
    description:
      'Load the full SKILL.md content for exactly one skill by name. Use when a user request matches a skill description.',
    schema: loadSkillSchema,
  },
)

/** 供 agent 挂载；新增 tool 时在此追加即可 */
export const tools = [
  exec_tool,
  run_js_tool,
  run_py_tool,
  web_search_tool,
  web_fetch_tool,
  read_file_tool,
  write_file_tool,
  load_skill_tool,
]
