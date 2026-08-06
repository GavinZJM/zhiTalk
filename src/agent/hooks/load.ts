import * as fs from 'fs'
import { getZjmTalkConfigPath } from '../config'
import type { HookDefinition, HookEventName, HooksConfig } from './types'

const HOOK_EVENTS: HookEventName[] = [
  'PreToolUse',
  'PostToolUse',
  'SessionStart',
  'SessionEnd',
  'UserPromptSubmit',
]

let cached: HooksConfig | null = null
let cachedPath: string | null = null
let cachedMtimeMs: number | null = null

/** 默认从 `~/.zjmTalk/zjmTalk.json` 读取（与 model/env 同一文件；可用 `ZJMTALK_CONFIG` 覆盖） */
export function defaultHooksConfigPath(): string {
  return getZjmTalkConfigPath()
}

function isHookDefinition(v: unknown): v is HookDefinition {
  if (v == null || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return typeof o.command === 'string' && o.command.length > 0
}

/**
 * 从用户配置 JSON 中抽出 hooks 段。
 * 期望形态与原先 hooks.json 相同：`{ "version": 1, "hooks": { ... } }`
 * （同文件中的 model / env 会被忽略）。
 */
function normalizeConfig(raw: unknown): HooksConfig {
  if (raw == null || typeof raw !== 'object') {
    return { version: 1, hooks: {} }
  }
  const obj = raw as Record<string, unknown>
  const version = typeof obj.version === 'number' ? obj.version : 1
  const hooksIn =
    obj.hooks != null && typeof obj.hooks === 'object'
      ? (obj.hooks as Record<string, unknown>)
      : {}

  const hooks: HooksConfig['hooks'] = {}
  for (const event of HOOK_EVENTS) {
    const list = hooksIn[event]
    if (!Array.isArray(list)) continue
    hooks[event] = list.filter(isHookDefinition)
  }

  return { version, hooks }
}

function readMtimeMs(filePath: string): number | null {
  try {
    return fs.statSync(filePath).mtimeMs
  } catch {
    return null
  }
}

/**
 * 加载 `~/.zjmTalk/zjmTalk.json` 中的 hooks；失败时返回空配置（不抛错，避免拖垮 agent）。
 * 文件 mtime 变化时自动失效缓存。
 */
export function loadHooksConfig(configPath?: string): HooksConfig {
  const filePath = configPath ?? defaultHooksConfigPath()
  const mtimeMs = readMtimeMs(filePath)

  if (
    cached &&
    cachedPath === filePath &&
    cachedMtimeMs !== null &&
    mtimeMs === cachedMtimeMs
  ) {
    return cached
  }

  try {
    if (!fs.existsSync(filePath)) {
      cached = { version: 1, hooks: {} }
      cachedPath = filePath
      cachedMtimeMs = null
      return cached
    }
    const text = fs.readFileSync(filePath, 'utf8')
    cached = normalizeConfig(JSON.parse(text) as unknown)
    cachedPath = filePath
    cachedMtimeMs = mtimeMs
    return cached
  } catch {
    cached = { version: 1, hooks: {} }
    cachedPath = filePath
    cachedMtimeMs = mtimeMs
    return cached
  }
}

/** 测试用：清空配置缓存 */
export function clearHooksConfigCache(): void {
  cached = null
  cachedPath = null
  cachedMtimeMs = null
}

export function getHooksForEvent(
  event: HookEventName,
  configPath?: string,
): HookDefinition[] {
  const config = loadHooksConfig(configPath)
  return config.hooks[event] ?? []
}
