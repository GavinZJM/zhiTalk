import * as os from 'os'
import * as path from 'path'
import dangerousPathJson from './dangerous-path.json'

export type DangerousPathPlatform = 'darwin' | 'linux' | 'win32'

export type DangerousPathConfig = {
  darwin?: string[]
  linux?: string[]
  win32?: string[]
  /** 跨平台文件名/后缀规则（支持简单 glob：`**`、`*`） */
  common?: string[]
}

export type IsDangerousPathOptions = {
  /** 覆盖 process.platform，便于单测 */
  platform?: NodeJS.Platform
  /** 覆盖 process.env */
  env?: NodeJS.ProcessEnv
  /** 覆盖 os.homedir() */
  homedir?: string
  /** 解析相对路径时的基准目录，默认 process.cwd() */
  cwd?: string
  /** 覆盖默认 dangerous-path.json */
  config?: DangerousPathConfig
}

const WIN_ENV_PATTERN =
  /%(USERPROFILE|HOME|HOMEDRIVE|HOMEPATH|APPDATA|LOCALAPPDATA|TEMP|TMP|SYSTEMROOT|WINDIR)%/gi

const UNIX_ENV_PATTERN = /\$\{?(HOME|USERPROFILE|APPDATA|LOCALAPPDATA)\}?/gi

type PathApi = typeof path.posix | typeof path.win32

function pathApiFor(platform: NodeJS.Platform): PathApi {
  return platform === 'win32' ? path.win32 : path.posix
}

function platformKey(platform: NodeJS.Platform): DangerousPathPlatform {
  if (platform === 'darwin' || platform === 'win32' || platform === 'linux') {
    return platform
  }
  return 'linux'
}

function isWindowsPlatform(platform: NodeJS.Platform): boolean {
  return platform === 'win32'
}

/** 统一分隔符并去掉末尾分隔符（根路径除外） */
export function normalizePathForCompare(
  input: string,
  platform: NodeJS.Platform,
): string {
  const win = isWindowsPlatform(platform)
  let p = input.replace(/\\/g, '/')
  p = p.replace(/\/+/g, '/')
  if (win && /^[a-zA-Z]:$/.test(p)) {
    p = `${p}/`
  }
  if (p.length > 1 && p.endsWith('/')) {
    p = p.slice(0, -1)
  }
  return win ? p.toLowerCase() : p
}

/**
 * 展开 ~ 与常见环境变量占位符（大小写不敏感的 %VAR%、以及 $HOME / ${HOME}）。
 */
export function expandPathPlaceholders(
  input: string,
  options: {
    platform: NodeJS.Platform
    env: NodeJS.ProcessEnv
    homedir: string
  },
): string {
  const { platform, env, homedir } = options
  const pathApi = pathApiFor(platform)
  let result = input.trim()

  const home = homedir || env.HOME || env.USERPROFILE || ''
  const userProfile = env.USERPROFILE || home
  const appData =
    env.APPDATA ||
    (userProfile ? pathApi.join(userProfile, 'AppData', 'Roaming') : '')
  const localAppData =
    env.LOCALAPPDATA ||
    (userProfile ? pathApi.join(userProfile, 'AppData', 'Local') : '')

  const vars: Record<string, string> = {
    HOME: home,
    USERPROFILE: userProfile,
    APPDATA: appData,
    LOCALAPPDATA: localAppData,
    TEMP: env.TEMP || env.TMP || '',
    TMP: env.TMP || env.TEMP || '',
    SYSTEMROOT: env.SYSTEMROOT || env.WINDIR || '',
    WINDIR: env.WINDIR || env.SYSTEMROOT || '',
    HOMEDRIVE: env.HOMEDRIVE || '',
    HOMEPATH: env.HOMEPATH || '',
  }

  if (result.startsWith('~/') || result.startsWith('~\\')) {
    result = pathApi.join(home, result.slice(2))
  } else if (result === '~') {
    result = home
  }

  result = result.replace(WIN_ENV_PATTERN, (_m, name: string) => {
    return vars[name.toUpperCase()] ?? ''
  })
  result = result.replace(UNIX_ENV_PATTERN, (_m, name: string) => {
    return vars[name.toUpperCase()] ?? ''
  })

  if (isWindowsPlatform(platform) && /^\\[^\\]/.test(result) && vars.HOMEDRIVE) {
    result = `${vars.HOMEDRIVE}${result}`
  }

  return result
}

/** 将用户输入解析为规范化绝对路径（用于比较） */
export function resolveFilePath(
  filepath: string,
  options: {
    platform: NodeJS.Platform
    env: NodeJS.ProcessEnv
    homedir: string
    cwd: string
  },
): string {
  const pathApi = pathApiFor(options.platform)
  const expanded = expandPathPlaceholders(filepath, options)
  const absolute = pathApi.isAbsolute(expanded)
    ? pathApi.resolve(expanded)
    : pathApi.resolve(options.cwd, expanded)
  return normalizePathForCompare(absolute, options.platform)
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 极简 glob：仅支持 `**`、`*`，匹配整段规范化路径 */
function globToRegExp(glob: string, platform: NodeJS.Platform): RegExp {
  const normalized = normalizePathForCompare(
    glob.replace(/\\/g, '/'),
    platform,
  )
  let pattern = ''
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i]
    if (ch === '*' && normalized[i + 1] === '*') {
      pattern += '.*'
      i++
      if (normalized[i + 1] === '/') i++
      continue
    }
    if (ch === '*') {
      pattern += '[^/]*'
      continue
    }
    pattern += escapeRegExp(ch)
  }
  return new RegExp(`^${pattern}$`, isWindowsPlatform(platform) ? 'i' : '')
}

function isPathInsideOrEqual(
  candidate: string,
  dangerousRoot: string,
  platform: NodeJS.Platform,
): boolean {
  const a = normalizePathForCompare(candidate, platform)
  const b = normalizePathForCompare(dangerousRoot, platform)
  if (!b) return false
  if (a === b) return true
  const prefix = b.endsWith('/') ? b : `${b}/`
  return a.startsWith(prefix)
}

function loadPatterns(
  config: DangerousPathConfig,
  platform: NodeJS.Platform,
): { roots: string[]; globs: string[] } {
  const key = platformKey(platform)
  const roots = [...(config[key] ?? [])]
  const globs = [...(config.common ?? [])]
  return { roots, globs }
}

/**
 * 判断 filepath 是否落在危险路径上（或其子路径）。
 * 支持绝对路径、相对路径、`~`、`%USERPROFILE%` / `%APPDATA%` / `%LOCALAPPDATA%` 等。
 */
export function isDangerousPath(
  filepath: string,
  options: IsDangerousPathOptions = {},
): boolean {
  if (!filepath || !String(filepath).trim()) {
    return false
  }

  const platform = options.platform ?? process.platform
  const env = options.env ?? process.env
  const homedir = options.homedir ?? os.homedir()
  const cwd = options.cwd ?? process.cwd()
  const config = options.config ?? (dangerousPathJson as DangerousPathConfig)
  const pathApi = pathApiFor(platform)

  const resolved = resolveFilePath(filepath, { platform, env, homedir, cwd })
  const { roots, globs } = loadPatterns(config, platform)

  for (const root of roots) {
    const expandedRoot = expandPathPlaceholders(root, {
      platform,
      env,
      homedir,
    })
    const resolvedRoot = pathApi.isAbsolute(expandedRoot)
      ? pathApi.resolve(expandedRoot)
      : pathApi.resolve(cwd, expandedRoot)
    if (isPathInsideOrEqual(resolved, resolvedRoot, platform)) {
      return true
    }
  }

  for (const glob of globs) {
    if (globToRegExp(glob, platform).test(resolved)) {
      return true
    }
  }

  return false
}

export const defaultDangerousPathConfig =
  dangerousPathJson as DangerousPathConfig
