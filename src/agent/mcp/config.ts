import * as fs from 'fs'
import * as path from 'path'
import { getMCPServerConfig, getZjmTalkConfigPath } from '../config'
import type { McpConfigFile, McpServerConfig } from './types'
import { isHttpServerConfig, isStdioServerConfig } from './types'

const ENV_VAR_RE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g

/** 将字符串中的 ${VAR} 替换为 process.env[VAR]；缺失则空串 */
export function interpolateEnv(
  value: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return value.replace(ENV_VAR_RE, (_m, name: string) => env[name] ?? '')
}

function interpolateDeep<T>(value: T, env: NodeJS.ProcessEnv): T {
  if (typeof value === 'string') {
    return interpolateEnv(value, env) as T
  }
  if (Array.isArray(value)) {
    return value.map((v) => interpolateDeep(v, env)) as T
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = interpolateDeep(v, env)
    }
    return out as T
  }
  return value
}

/**
 * MCP 配置文件路径。
 * 优先 `ZJMTALK_MCP_CONFIG`；否则 `~/.zjmTalk/zjmTalk.json`（与主配置同源）。
 */
export function defaultMcpConfigPath(): string {
  const fromEnv = process.env.ZJMTALK_MCP_CONFIG?.trim()
  if (fromEnv) {
    return path.isAbsolute(fromEnv)
      ? fromEnv
      : path.resolve(process.cwd(), fromEnv)
  }
  return getZjmTalkConfigPath()
}

function isServerConfig(v: unknown): v is McpServerConfig {
  if (v == null || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  if (typeof o.command === 'string' && o.command.length > 0) return true
  if (typeof o.url === 'string' && o.url.length > 0) return true
  return false
}

function normalizeMcpServers(
  serversIn: Record<string, unknown>,
  env: NodeJS.ProcessEnv,
): Record<string, McpServerConfig> {
  const mcpServers: Record<string, McpServerConfig> = {}
  for (const [name, cfg] of Object.entries(serversIn)) {
    if (!isServerConfig(cfg)) {
      throw new Error(
        `Invalid MCP server config for "${name}": need command or url`,
      )
    }
    const interpolated = interpolateDeep(cfg, env)
    if (isStdioServerConfig(interpolated) || isHttpServerConfig(interpolated)) {
      mcpServers[name] = interpolated
    }
  }
  return mcpServers
}

/**
 * 加载并规范化 MCP 配置（默认来自 `~/.zjmTalk/zjmTalk.json` 的 mcpServers）。
 * 显式 configPath / ZJMTALK_MCP_CONFIG 仍可读独立 JSON（便于测试）。
 * 主配置不存在 → 空配置；解析失败 → 抛错（由调用方决定是否 fail-open）。
 */
export function loadMcpConfig(
  configPath?: string,
  env: NodeJS.ProcessEnv = process.env,
): McpConfigFile {
  const overridePath =
    configPath ??
    (process.env.ZJMTALK_MCP_CONFIG?.trim()
      ? defaultMcpConfigPath()
      : undefined)

  // 默认：从主配置 getMCPServerConfig 取 mcpServers（不做二次读盘逻辑分叉）
  if (overridePath == null) {
    let raw: McpConfigFile
    try {
      raw = getMCPServerConfig()
    } catch {
      return { version: 1, mcpServers: {} }
    }
    return {
      version: raw.version ?? 1,
      mcpServers: normalizeMcpServers(
        (raw.mcpServers ?? {}) as Record<string, unknown>,
        env,
      ),
    }
  }

  const filePath = overridePath
  if (!fs.existsSync(filePath)) {
    return { version: 1, mcpServers: {} }
  }

  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown
  if (raw == null || typeof raw !== 'object') {
    throw new Error(`Invalid MCP config (not an object): ${filePath}`)
  }

  const obj = raw as Record<string, unknown>
  const version = typeof obj.version === 'number' ? obj.version : 1
  const serversIn =
    obj.mcpServers != null && typeof obj.mcpServers === 'object'
      ? (obj.mcpServers as Record<string, unknown>)
      : {}

  return {
    version,
    mcpServers: normalizeMcpServers(serversIn, env),
  }
}
