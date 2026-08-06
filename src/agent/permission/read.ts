import {
  dangerousBlockResult,
  extractToolFilePath,
  isFilepathDangerous,
  resolvePolicyContext,
  type PermissionPolicyOptions,
  type ToolPathPolicyResult,
} from './util'

/**
 * read 权限策略：
 * - 无 filepath → 直接执行
 * - 敏感/危险路径 → 阻止
 * - 其它路径（含项目外）→ 直接执行，不询问用户
 */
export function classifyReadPermission(
  args: unknown,
  options: PermissionPolicyOptions = {},
): ToolPathPolicyResult {
  const filepath = extractToolFilePath(args)
  if (!filepath) {
    return { action: 'auto' }
  }

  const { platform, env, homedir, cwd, resolvedPath } = resolvePolicyContext(
    filepath,
    options,
  )

  if (
    isFilepathDangerous(filepath, {
      ...options,
      platform,
      env,
      homedir,
      cwd,
    })
  ) {
    return dangerousBlockResult(filepath, resolvedPath)
  }

  return { action: 'auto', filepath, resolvedPath }
}
