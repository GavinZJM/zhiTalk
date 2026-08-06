import {
  dangerousBlockResult,
  extractToolFilePath,
  isFilepathDangerous,
  resolvePolicyContext,
  type PermissionPolicyOptions,
  type ToolPathPolicyResult,
} from './util'

/**
 * write 权限策略：
 * - 无 filepath → 直接执行
 * - 敏感/危险路径 → 阻止
 * - 其它路径（含项目外）→ 直接执行
 */
export function classifyWritePermission(
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
