import * as fs from 'fs'
import * as path from 'path'
import { getZjmTalkDataDir } from './config'
import { memoryPrompt } from './memory_prompt'

/** 用户画像文件：`~/.zjmTalk/.data/profile.md`（跨平台：`os.homedir()`） */
export function getProfileMdPath(): string {
  return path.join(getZjmTalkDataDir(), 'profile.md')
}

/** 读取 profile.md；文件不存在或读失败时返回空字符串 */
export function loadProfileInfo(): string {
  const filePath = getProfileMdPath()
  try {
    if (!fs.existsSync(filePath)) return ''
    return fs.readFileSync(filePath, 'utf8').trim()
  } catch {
    return ''
  }
}

/** 用 `<profile_info>` 包裹；无内容时为空标签 */
export function wrapProfileInfo(content: string): string {
  const body = content.trim()
  if (!body) return '<profile_info></profile_info>'
  return `<profile_info>\n${body}\n</profile_info>`
}

/**
 * 用户画像 prompt（含 template + 当前 profile.md 内容）。
 * 每次调用都会重新读文件，便于对话中更新后即时生效。
 */
export function buildProfilePrompt(): string {
  const profileInfo = wrapProfileInfo(loadProfileInfo())

  return `## User Profile
When learning about the user, organize and remember profile information using these dimensions (fill only what the user has shared; do not invent):

<profile_template>
- 基本身份：姓名，昵称，性别，年龄、地区、语言
- 外貌：身高 体重 肤色 胖瘦
- 性格与沟通偏好
- 兴趣爱好
- 技能
- 工作
</profile_template>

${profileInfo}
`
}

/** @deprecated 使用 buildProfilePrompt()；保留别名便于调用方迁移 */
export function profilePrompt(): string {
  return buildProfilePrompt()
}

/** 组装完整 systemPrompt（skills + MCP + profile + memory） */
export function buildSystemPrompt(
  skillsCatalog: string,
  mcpCatalog?: string,
): string {
  const mcpSection =
    mcpCatalog && mcpCatalog.trim() && mcpCatalog !== '(no MCP servers connected)'
      ? `
## MCP Tools
Tools from connected MCP servers (names are prefixed with mcp_<server>_). Prefer these when they match the task. Use list_mcp_resources / read_mcp_resource for MCP resources.

${mcpCatalog.trim()}
`
      : ''

  return `You are a helpful assistant.

## Available Skills
The following skills are available. Each entry shows only name and description.
When the user's request matches a skill description, you MUST call the load_skill tool with that skill's exact name to load its full SKILL.md instructions, then follow those instructions.
You can load only one skill per load_skill call.
Do not invent skill contents; always load_skill first when a skill applies.
For browser / webpage / Playwright tasks, load_skill "playwright-cli" and run commands with the exec tool (e.g. playwright-cli open). Do not assume a Playwright MCP server exists unless it appears in MCP Tools below.

${skillsCatalog}
${mcpSection}
## Large Tool Outputs
If a tool result is too large, it is saved to a local file and the message only contains the file path plus a short preview.
Do not pretend you already have the full output. When you need more of it, use exec / run_js / run_py to read that file in chunks (head, sed, or open().read()[:N]).

${buildProfilePrompt()}
${memoryPrompt}
`
}
