import type { PermissionPolicyOptions, ToolPathPolicyResult } from './util'

/**
 * 从 tool args 取出 command 字符串。
 */
export function extractToolCommand(args: unknown): string | undefined {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return undefined
  }
  const command = (args as Record<string, unknown>).command
  if (typeof command === 'string' && command.trim()) {
    return command.trim()
  }
  return undefined
}

/**
 * 判断命令是否会切换 / 离开当前工作目录（如 cd、pushd、popd、Set-Location 等）。
 * 只看“是否改变 shell cwd”，不把 `ls /other` 这种仅访问路径算作转移目录。
 */
export function commandChangesWorkingDirectory(command: string): boolean {
  if (!command || !command.trim()) return false

  const text = command.trim()

  // 整段快速匹配常见目录切换（含被 ; && || | & 串联的情况）
  if (
    /(?:^|[\n;|&])\s*(?:cd|chdir|pushd|popd)\b/i.test(text) ||
    /(?:^|[\n;|&])\s*Set-Location\b/i.test(text) ||
    /(?:^|[\n;|&])\s*Push-Location\b/i.test(text) ||
    /(?:^|[\n;|&])\s*Pop-Location\b/i.test(text)
  ) {
    return true
  }

  const segments = text.split(/;|&&|\|\||\||&/).map((s) => s.trim())
  for (const segment of segments) {
    if (!segment) continue

    const tokens = segment.split(/\s+/).filter(Boolean)
    if (tokens.length === 0) continue

    // 跳过 FOO=bar 形式的环境变量赋值
    let i = 0
    while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) {
      i += 1
    }
    if (i >= tokens.length) continue

    const raw = tokens[i].replace(/^['"]+|['"]+$/g, '')
    // 去掉路径前缀，只看可执行名
    const base = raw.split(/[/\\]/).pop()?.toLowerCase() ?? ''
    if (
      base === 'cd' ||
      base === 'chdir' ||
      base === 'pushd' ||
      base === 'popd' ||
      base === 'set-location' ||
      base === 'push-location' ||
      base === 'pop-location'
    ) {
      return true
    }

    // PowerShell 短别名 sl（Set-Location）；避免误伤其它命令时要求整 token 精确为 sl
    if (tokens[i].toLowerCase() === 'sl') {
      return true
    }
  }

  return false
}

/**
 * exec 权限策略：
 * - 命令会切换工作目录 → 阻止
 * - 否则 → 自动执行
 */
export function classifyExecPermission(
  args: unknown,
  _options: PermissionPolicyOptions = {},
): ToolPathPolicyResult {
  const command = extractToolCommand(args)

  // 无 command（如 run_js / run_py 只有 code）→ 自动执行
  if (!command) {
    return { action: 'auto' }
  }

  if (commandChangesWorkingDirectory(command)) {
    return {
      action: 'block',
      reason: [
        `Access denied: command attempts to change the working directory and is blocked.`,
        `command: ${command}`,
        'Run commands that stay in the current project directory, or ask the user to change directories manually.',
      ].join(' '),
    }
  }

  return { action: 'auto' }
}
