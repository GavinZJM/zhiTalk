import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import type { McpConfigFile, McpServerConfig } from './mcp/types'

/** `~/.zjmTalk/zjmTalk.json` 中的 model 段 */
export type ZjmTalkModelConfig = {
  model: string
  apiKey: string
  baseURL: string
}

/** 完整用户配置文件结构 */
export type ZjmTalkFileConfig = {
  model: ZjmTalkModelConfig
  /** 可选：额外环境变量，如 TAVILY_API_KEY */
  env?: Record<string, string>
  /** 可选：MCP 配置版本（与 mcpServers 同级） */
  version?: number
  /** 可选：MCP servers（格式同原 mcp.json 的 mcpServers） */
  mcpServers?: Record<string, McpServerConfig>
}

type ZjmTalkJson = {
  model?: Partial<ZjmTalkModelConfig> | null
  env?: Record<string, unknown> | null
  version?: unknown
  mcpServers?: unknown
}

let cachedConfig: ZjmTalkFileConfig | null = null
let cachedPath: string | null = null

/** 跨平台用户配置目录：`~/.zjmTalk`（Windows 为 `%USERPROFILE%\.zjmTalk`） */
export function getZjmTalkDir(): string {
  return path.join(os.homedir(), '.zjmTalk')
}

/**
 * 包内置 skills 根目录（随 npm 包分发）。
 * - 编译后：`dist/bundled-skills`（相对 `dist/agent/config.js`）
 * - 开发 ts-node：仓库根 `bundled-skills/`
 */
export function getBundledSkillsRoot(): string {
  const candidates = [
    // dist/agent → dist/bundled-skills
    path.join(__dirname, '..', 'bundled-skills'),
    // src/agent → <pkg>/bundled-skills
    path.join(__dirname, '..', '..', 'bundled-skills'),
  ]
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir
  }
  return candidates[0]
}

/**
 * Skills 搜索根目录（优先级从低到高，后者同名覆盖前者）。
 * 目录不存在时由调用方跳过，此处不创建、不报错。
 *
 * 1. 包内置 `bundled-skills`（随 npm 发布）
 * 2. `~/.zjmTalk/.agents/skills`
 * 3. `~/.zjmTalk/skills`
 */
export function getSkillRoots(): string[] {
  const base = getZjmTalkDir()
  return [
    getBundledSkillsRoot(),
    path.join(base, '.agents', 'skills'),
    path.join(base, 'skills'),
  ]
}

/**
 * 数据目录：`~/.zjmTalk/.data`（checkpointer / memory 等 SQLite）。
 * 可用 `ZJMTALK_DATA_DIR` 覆盖（便于测试）。
 */
export function getZjmTalkDataDir(): string {
  const fromEnv = process.env.ZJMTALK_DATA_DIR?.trim()
  if (fromEnv) return path.resolve(fromEnv)
  return path.join(getZjmTalkDir(), '.data')
}

/** 确保数据目录存在并返回路径 */
export function ensureZjmTalkDataDir(): string {
  const dir = getZjmTalkDataDir()
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * 配置文件路径。
 * 优先 `ZJMTALK_CONFIG`（便于测试/自定义），否则 `~/.zjmTalk/zjmTalk.json`。
 */
export function getZjmTalkConfigPath(): string {
  const fromEnv = process.env.ZJMTALK_CONFIG?.trim()
  if (fromEnv) return path.resolve(fromEnv)
  return path.join(getZjmTalkDir(), 'zjmTalk.json')
}

export function clearZjmTalkConfigCache(): void {
  cachedConfig = null
  cachedPath = null
}

/**
 * 启动时 / 帮助用的配置手册（路径随本机 homedir 解析）。
 * 不抛错、不读盘；优先突出「最小可启动配置」。
 */
export function formatConfigManual(): string {
  const configPath = getZjmTalkConfigPath()
  const dataDir = getZjmTalkDataDir()
  const [bundledSkills, agentsSkills, userSkills] = getSkillRoots()
  const dir = getZjmTalkDir()

  return [
    '════════════════════════════════════════════════════════════',
    '配置手册',
    '════════════════════════════════════════════════════════════',
    '',
    '★★★ 最小可启动配置（只看这一节就能跑起来）★★★',
    '',
    '目标：创建下面这一个文件后，执行 npm run dev 即可进入对话。',
    `路径：${configPath}`,
    '（也可用 ZJMTALK_CONFIG 指向其它路径；默认即用户主目录下的该文件）',
    '',
    '步骤：',
    `  1. 创建目录（若不存在）：`,
    `       mkdir -p ${dir}`,
    `  2. 新建文件：`,
    `       ${configPath}`,
    '  3. 写入下方 JSON（把 sk-xxx 换成你的真实 Key）',
    '  4. 保存后重启 CLI：npm run dev',
    '',
    '必填 JSON（仅此一段；其它字段都可省略）：',
    '  {',
    '    "model": {',
    '      "model": "kimi-k2.6",',
    '      "apiKey": "sk-xxx",',
    '      "baseURL": "https://api.moonshot.cn/v1"',
    '    }',
    '  }',
    '',
    '三个字段分别做什么：',
    '  model.model    模型名称 / ID，须与服务商控制台一致',
    '                 例：kimi-k2.6、gpt-4o、deepseek-chat',
    '  model.apiKey   调用密钥；不要提交到 git、不要发到公开群',
    '  model.baseURL  OpenAI 兼容 HTTP 根地址（一般以 /v1 结尾）',
    '                 月之暗面例：https://api.moonshot.cn/v1',
    '                 OpenAI 例：  https://api.openai.com/v1',
    '',
    '最小配置下会发生什么：',
    '  ✓ 可以对话、用内置工具（读文件、exec 等，受 hooks/权限约束）',
    '  ✓ 会话写入数据目录（见下文）',
    '  ✓ 可使用包内置 bundled-skills（随 npm 安装）',
    '  ✗ 未配 env.TAVILY_API_KEY → web_search 不可用（会提示缺 key）',
    '  ✗ 未配 mcpServers → 无外部 MCP 工具',
    '  ✗ 未配 hooks → 无自定义生命周期脚本',
    '',
    '常见启动失败：',
    '  • 文件不存在 / 路径写错     → 按上面步骤 1–2 创建',
    '  • JSON 语法错误（多逗号等） → 用编辑器校验 JSON；文件内不能写 // 注释',
    '  • 缺少 model / apiKey / baseURL 任一字段 → 三个都必须是非空字符串',
    '  • apiKey / baseURL 无效 → 能启动，但首轮对话会由模型接口报错',
    '',
    '────────────────────────────────────────────────────────────',
    '以下为可选增强（不配也能启动）',
    '────────────────────────────────────────────────────────────',
    '',
    '一、目录布局（跨平台：~ = 用户主目录；Windows = %USERPROFILE%）',
    `  用户根目录   ${dir}`,
    `  配置文件     ${configPath}`,
    '                可用 ZJMTALK_CONFIG=/路径 覆盖',
    `  数据目录     ${dataDir}`,
    '                checkpointer / memory 等 SQLite；可用 ZJMTALK_DATA_DIR 覆盖',
    `  Skills 内置  ${bundledSkills}`,
    '                随 npm 包分发（最低优先级）',
    `  Skills 低优  ${agentsSkills}`,
    `  Skills 高优  ${userSkills}`,
    '                扫描顺序：内置 → 低优 → 高优；同名后者覆盖；目录不存在则跳过',
    '',
    '二、Skills（内置已打包；也可在用户目录自行添加）',
    `  例：${userSkills}/planner/SKILL.md`,
    '  SKILL.md 须含 frontmatter：',
    '    ---',
    '    name: planner',
    '    description: 一句话说明何时使用',
    '    ---',
    '    # 正文（load_skill 时整份加载）',
    '  改用户目录 skills 后需重启 CLI。',
    '',
    '三、可选 JSON 字段',
    '',
    '  env（可选）',
    '    字符串键值；供工具读取（不会自动写入 process.env）。',
    '    TAVILY_API_KEY  → 启用 web_search（也可用进程环境变量 / 项目 .env）',
    '',
    '  version（可选）',
    '    数字，默认 1。',
    '',
    '  mcpServers（可选）',
    '    键 = server 名；值 = 本地或远程二选一。',
    '    本地: command（必填）, args?, env?, cwd?',
    '    远程: url（必填）, headers?',
    '    字符串支持 ${ENV_VAR}（读进程环境变量；未设则为空串）。',
    '    单 server 失败不影响其它；工具名 mcp_<server>_<tool>。',
    '    也可用 ZJMTALK_MCP_CONFIG 指向独立 MCP JSON。',
    '',
    '  hooks（可选）',
    '    事件: PreToolUse / PostToolUse / SessionStart / SessionEnd / UserPromptSubmit',
    '    Pre/PostToolUse 可设 matcher（JS RegExp；空或 * = 全部工具）',
    '    每项: command（必填）, timeout?（秒，默认 30）, failClosed?, type?',
    '    退出码: 0 继续 | 1 拦截 | 2 注入 stderr 后继续',
    '',
    '四、其它环境变量',
    '  ZJMTALK_CONFIG / ZJMTALK_DATA_DIR / ZJMTALK_THREAD_ID / ZJMTALK_MCP_CONFIG',
    '  ZJMTALK_RECURSION_LIMIT  LangGraph 步数上限（默认 100；agent↔tools 各算 1 步）',
    '',
    '五、可选增强完整示例（复制时请删掉本段以外的说明文字；JSON 禁止 //）',
    '  {',
    '    "model": {',
    '      "model": "kimi-k2.6",',
    '      "apiKey": "sk-xxx",',
    '      "baseURL": "https://api.moonshot.cn/v1"',
    '    },',
    '    "env": {',
    '      "TAVILY_API_KEY": "tvly-xxx"',
    '    },',
    '    "version": 1,',
    '    "mcpServers": {',
    '      "filesystem": {',
    '        "command": "npx",',
    '        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]',
    '      },',
    '      "github": {',
    '        "url": "https://api.githubcopilot.com/mcp/",',
    '        "headers": {',
    '          "Authorization": "Bearer ${GITHUB_PERSONAL_ACCESS_TOKEN}"',
    '        }',
    '      }',
    '    },',
    '    "hooks": {',
    '      "PreToolUse": [',
    '        {',
    '          "matcher": "exec|run_.*",',
    '          "command": "src/agent/hooks/protect_env.sh",',
    '          "timeout": 10',
    '        }',
    '      ]',
    '    }',
    '  }',
    '',
    '════════════════════════════════════════════════════════════',
  ].join('\n')
}

function formatConfigHint(configPath: string): string {
  return [
    `请创建配置文件: ${configPath}`,
    '',
    formatConfigManual(),
  ].join('\n')
}

function parseMcpServersSection(
  mcpServers: ZjmTalkJson['mcpServers'],
  configPath: string,
): Record<string, McpServerConfig> | undefined {
  if (mcpServers == null) return undefined
  if (typeof mcpServers !== 'object' || Array.isArray(mcpServers)) {
    throw new Error(
      `配置文件 mcpServers 必须是对象。\n${formatConfigHint(configPath)}`,
    )
  }
  return mcpServers as Record<string, McpServerConfig>
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

function parseEnvSection(
  env: ZjmTalkJson['env'],
  configPath: string,
): Record<string, string> | undefined {
  if (env == null) return undefined
  if (typeof env !== 'object' || Array.isArray(env)) {
    throw new Error(
      `配置文件 env 必须是对象。\n${formatConfigHint(configPath)}`,
    )
  }
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (!isNonEmptyString(key)) continue
    if (!isNonEmptyString(value)) {
      throw new Error(
        `配置文件 env.${key} 必须是非空字符串。\n${formatConfigHint(configPath)}`,
      )
    }
    out[key] = value.trim()
  }
  return out
}

/**
 * 读取并校验 `~/.zjmTalk/zjmTalk.json`。
 * 文件不存在、JSON 无效、或缺少 model / 必填字段时抛出明确错误。
 */
export function loadZjmTalkConfig(
  configPath?: string,
): ZjmTalkFileConfig {
  const resolvedPath = configPath ?? getZjmTalkConfigPath()
  if (cachedConfig && cachedPath === resolvedPath) {
    return cachedConfig
  }

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(
      `未找到 zjmTalk 配置文件。\n${formatConfigHint(resolvedPath)}`,
    )
  }

  let raw: string
  try {
    raw = fs.readFileSync(resolvedPath, 'utf8')
  } catch (err) {
    throw new Error(
      `无法读取 zjmTalk 配置文件: ${resolvedPath}\n${(err as Error).message}`,
    )
  }

  let parsed: ZjmTalkJson
  try {
    parsed = JSON.parse(raw) as ZjmTalkJson
  } catch (err) {
    throw new Error(
      `zjmTalk 配置文件不是合法 JSON: ${resolvedPath}\n${(err as Error).message}`,
    )
  }

  const model = parsed?.model
  if (model == null || typeof model !== 'object' || Array.isArray(model)) {
    throw new Error(
      `配置文件中缺少 model 配置。\n${formatConfigHint(resolvedPath)}`,
    )
  }

  const missing: string[] = []
  if (!isNonEmptyString(model.model)) missing.push('model.model')
  if (!isNonEmptyString(model.apiKey)) missing.push('model.apiKey')
  if (!isNonEmptyString(model.baseURL)) missing.push('model.baseURL')

  if (missing.length > 0) {
    throw new Error(
      `配置文件 model 字段不完整，缺少: ${missing.join(', ')}\n${formatConfigHint(resolvedPath)}`,
    )
  }

  const version =
    typeof parsed.version === 'number' ? parsed.version : undefined
  const mcpServers = parseMcpServersSection(parsed.mcpServers, resolvedPath)

  const config: ZjmTalkFileConfig = {
    model: {
      model: model.model!.trim(),
      apiKey: model.apiKey!.trim(),
      baseURL: model.baseURL!.trim(),
    },
    env: parseEnvSection(parsed.env, resolvedPath),
    ...(version != null ? { version } : {}),
    ...(mcpServers != null ? { mcpServers } : {}),
  }

  cachedConfig = config
  cachedPath = resolvedPath
  return config
}

/** model 段 */
export function getModelConfig(
  configPath?: string,
): ZjmTalkModelConfig {
  return loadZjmTalkConfig(configPath).model
}

/**
 * MCP servers 段（`~/.zjmTalk/zjmTalk.json` 中的 version + mcpServers）。
 * 未配置时返回空 servers；不做 ${ENV} 插值（由 mcp/config.loadMcpConfig 处理）。
 */
export function getMCPServerConfig(configPath?: string): McpConfigFile {
  const cfg = loadZjmTalkConfig(configPath)
  return {
    version: cfg.version ?? 1,
    mcpServers: cfg.mcpServers ?? {},
  }
}

/** 读取配置文件 env 段中的某个键；不存在返回 undefined */
export function getConfigEnv(
  name: string,
  configPath?: string,
): string | undefined {
  const env = loadZjmTalkConfig(configPath).env
  const value = env?.[name]
  return value && value.trim() ? value.trim() : undefined
}

/**
 * Tavily Key：优先 `zjmTalk.json` 的 `env.TAVILY_API_KEY`，
 * 否则回退 `process.env.TAVILY_API_KEY`（如项目 `.env` / dotenv）。
 */
export function getTavilyApiKey(configPath?: string): string | undefined {
  const fromConfig = getConfigEnv('TAVILY_API_KEY', configPath)
  if (fromConfig) return fromConfig
  const fromProcess = process.env.TAVILY_API_KEY?.trim()
  return fromProcess || undefined
}
