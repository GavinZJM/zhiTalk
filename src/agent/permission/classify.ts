import type { PermissionLevel } from '../tools/permission'
import { classifyExecPermission } from './exec'
import { classifyReadPermission } from './read'
import { classifyWritePermission } from './write'
import type { PermissionPolicyOptions, ToolPathPolicyResult } from './util'

/**
 * 按 permission_level 分发到 read / write / exec 策略；其它 level 默认 auto。
 */
export function classifyToolPermission(
  input: {
    permission_level?: PermissionLevel
    args: unknown
  },
  options: PermissionPolicyOptions = {},
): ToolPathPolicyResult {
  const level = input.permission_level
  if (level === 'read') {
    return classifyReadPermission(input.args, options)
  }
  if (level === 'write') {
    return classifyWritePermission(input.args, options)
  }
  if (level === 'exec') {
    return classifyExecPermission(input.args, options)
  }
  return { action: 'auto' }
}
