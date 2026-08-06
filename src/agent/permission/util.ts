import * as os from 'os'
import * as path from 'path'
import {
  normalizePathForCompare,
  resolveFilePath,
  isDangerousPath,
  type IsDangerousPathOptions,
} from '../tools/is-dangerous-path'

const FILEPATH_ARG_KEYS = [
  'file_path',
  'filepath',
  'filePath',
  'path',
] as const

export type ToolPathAction = 'auto' | 'block'

export type ToolPathPolicyResult = {
  action: ToolPathAction
  filepath?: string
  resolvedPath?: string
  reason?: string
}

export type PermissionPolicyOptions = IsDangerousPathOptions & {
  projectRoot?: string
}

/**
 * 从 tool args 中提取文件路径（兼容 file_path / filepath / path 等）。
 */
export function extractToolFilePath(args: unknown): string | undefined {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return undefined
  }
  const record = args as Record<string, unknown>
  for (const key of FILEPATH_ARG_KEYS) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return undefined
}

/**
 * 判断路径是否落在项目目录（projectRoot）内。
 */
export function isInProjectDir(
  filepath: string,
  options: PermissionPolicyOptions = {},
): boolean {
  const platform = options.platform ?? process.platform
  const env = options.env ?? process.env
  const cwd = options.cwd ?? process.cwd()
  const homedir = options.homedir ?? os.homedir()
  const projectRoot = options.projectRoot ?? cwd

  const resolvedFile = resolveFilePath(filepath, {
    platform,
    env,
    homedir,
    cwd,
  })
  const resolvedRoot = normalizePathForCompare(
    path.resolve(projectRoot),
    platform,
  )

  if (resolvedFile === resolvedRoot) return true
  const prefix = resolvedRoot.endsWith('/')
    ? resolvedRoot
    : `${resolvedRoot}/`
  return resolvedFile.startsWith(prefix)
}

export function resolvePolicyContext(
  filepath: string,
  options: PermissionPolicyOptions = {},
): {
  platform: NodeJS.Platform
  env: NodeJS.ProcessEnv
  homedir: string
  cwd: string
  projectRoot: string
  resolvedPath: string
} {
  const platform = options.platform ?? process.platform
  const env = options.env ?? process.env
  const homedir = options.homedir ?? os.homedir()
  const cwd = options.cwd ?? process.cwd()
  const projectRoot = options.projectRoot ?? cwd
  const resolvedPath = resolveFilePath(filepath, {
    platform,
    env,
    homedir,
    cwd,
  })
  return { platform, env, homedir, cwd, projectRoot, resolvedPath }
}

export function dangerousBlockResult(
  filepath: string,
  resolvedPath: string,
): ToolPathPolicyResult {
  return {
    action: 'block',
    filepath,
    resolvedPath,
    reason: [
      `Access denied: "${filepath}" resolves to a protected/dangerous path`,
      `(${resolvedPath}) and cannot be read or written by tools.`,
      'Please use a path inside the project workspace, or ask the user to handle this file manually.',
    ].join(' '),
  }
}

export function isFilepathDangerous(
  filepath: string,
  options: PermissionPolicyOptions,
): boolean {
  return isDangerousPath(filepath, options)
}
