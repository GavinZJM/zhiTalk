/** 支持的 hook 事件名（配置键） */
export type HookEventName =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'SessionStart'
  | 'SessionEnd'
  | 'UserPromptSubmit'

export type HookDefinition = {
  /** JS RegExp 源字符串；空 / 缺省 = 全匹配 */
  matcher?: string
  /** 相对项目根或绝对路径的可执行命令/脚本 */
  command: string
  /** 超时秒数，默认 30 */
  timeout?: number
  /** 超时/崩溃时当作 exit 1；默认 fail-open（exit 0） */
  failClosed?: boolean
  /** v1 仅 command；保留字段便于扩展 */
  type?: 'command'
}

export type HooksConfig = {
  version: number
  hooks: Partial<Record<HookEventName, HookDefinition[]>>
}

/** 传给 hook 脚本的 stdin JSON */
export type HookPayload = {
  hook_event_name: HookEventName
  cwd: string
  thread_id: string
  tool_name?: string
  tool_input?: unknown
  tool_output?: string
  permission_level?: string
  prompt?: string
  session_id?: string
  source?: string
}

export type HookDecisionAction = 'continue' | 'block' | 'inject'

export type HookDecision = {
  action: HookDecisionAction
  /** block / inject 时的文本（优先 stderr） */
  message: string
  exitCode: number
  command: string
  /** 原始 stdout（便于 CLI 回显） */
  stdout: string
  /** 原始 stderr（便于 CLI 回显） */
  stderr: string
}

/** 一次事件上所有匹配 hook 的聚合结果 */
export type HookRunResult = {
  /** 若任一 hook exit 1，则为 block */
  blocked: boolean
  blockMessage: string
  /** 按序累积的 inject 文本（exit 2） */
  injections: string[]
  decisions: HookDecision[]
}
