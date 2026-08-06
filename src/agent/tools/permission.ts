import type { StructuredToolInterface } from '@langchain/core/tools'

/** tool 权限级别（后续按此做调用限制） */
export const PERMISSION_LEVELS = [
  'read',
  'write',
  'exec',
  'network',
  'db',
] as const

export type PermissionLevel = (typeof PERMISSION_LEVELS)[number]

export type ToolWithPermission<T extends StructuredToolInterface = StructuredToolInterface> =
  T & {
    permission_level: PermissionLevel
    metadata?: Record<string, unknown>
  }

type ToolMetaCarrier = {
  permission_level?: PermissionLevel
  metadata?: Record<string, unknown>
}

/**
 * 给 LangChain tool 挂上 permission_level（自身属性 + metadata）。
 */
export function withPermissionLevel<T extends StructuredToolInterface>(
  toolInstance: T,
  permission_level: PermissionLevel,
): ToolWithPermission<T> {
  const next = toolInstance as ToolWithPermission<T>
  next.permission_level = permission_level
  const carrier = next as ToolMetaCarrier
  carrier.metadata = {
    ...(carrier.metadata ?? {}),
    permission_level,
  }
  return next
}

export function getToolPermissionLevel(
  toolInstance: StructuredToolInterface | ToolWithPermission,
): PermissionLevel | undefined {
  const carrier = toolInstance as ToolMetaCarrier
  if (carrier.permission_level) return carrier.permission_level
  const fromMeta = carrier.metadata?.permission_level
  if (
    typeof fromMeta === 'string' &&
    (PERMISSION_LEVELS as readonly string[]).includes(fromMeta)
  ) {
    return fromMeta as PermissionLevel
  }
  return undefined
}
