import { exec } from 'child_process'
import * as path from 'path'
import { promisify } from 'util'

const execAsync = promisify(exec)

/** 危险命令黑名单（按可执行文件名匹配） */
const BLOCKED_COMMANDS = new Set([
  'rm',
  'rmdir',
  'unlink',
  'del',
  'erase',
  'rd',
  'shred',
  'srm',
  'wipe',
  'dd',
  'mkfs',
  'mkfs.ext4',
  'mkfs.xfs',
  'fdisk',
  'parted',
  'format',
  'sudo',
  'su',
  'doas',
  'chmod',
  'chown',
  'chgrp',
  'chattr',
  'truncate',
  'reboot',
  'shutdown',
  'halt',
  'poweroff',
  'kill',
  'killall',
  'pkill',
])

/** 额外危险模式 */
const BLOCKED_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'find -delete', re: /(?:^|[\s])-delete(?:\s|$)/ },
  { name: 'git clean', re: /\bgit\s+clean\b/i },
  { name: 'fork bomb', re: /:\s*\(\s*\)\s*\{/ },
  { name: 'write to /dev', re: />\s*\/dev\// },
  { name: 'curl|sh', re: /\b(curl|wget)\b[\s\S]*\|\s*(sh|bash|zsh)\b/i },
]

export function assertSafeCommand(command: string): void {
  if (!command || !command.trim()) {
    throw new Error('command is required')
  }

  for (const { name, re } of BLOCKED_PATTERNS) {
    if (re.test(command)) {
      throw new Error(`Dangerous operation blocked: ${name}`)
    }
  }

  // 按 ; && || | & 拆成子命令，检查每个可执行名
  const segments = command.split(/;|&&|\|\||\||&/).map((s) => s.trim())
  for (const segment of segments) {
    if (!segment) continue
    const tokens = segment.split(/\s+/).filter(Boolean)
    if (tokens.length === 0) continue

    // 跳过 env 赋值：FOO=bar cmd
    let i = 0
    while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) {
      i += 1
    }
    if (i >= tokens.length) continue

    const raw = tokens[i].replace(/^['"]+|['"]+$/g, '')
    const base = path.basename(raw).toLowerCase()
    if (BLOCKED_COMMANDS.has(base)) {
      throw new Error(`Dangerous operation blocked: ${base}`)
    }
  }
}

export type ExecToolOptions = {
  cwd?: string
  timeoutMs?: number
  maxBuffer?: number
}

/**
 * 执行 shell 命令（禁止删除等危险操作）。
 */
export async function execTool(
  command: string,
  options: ExecToolOptions = {},
): Promise<string> {
  assertSafeCommand(command)

  const cwd = options.cwd ?? process.cwd()
  const timeout = options.timeoutMs ?? 30_000
  const maxBuffer = options.maxBuffer ?? 1024 * 1024

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout,
      maxBuffer,
      shell:
        process.env.SHELL ||
        process.env.ComSpec ||
        (process.platform === 'win32' ? 'cmd.exe' : '/bin/zsh'),
    })
    return formatResult(0, stdout, stderr)
  } catch (err) {
    const e = err as {
      killed?: boolean
      code?: number | string
      stdout?: string
      stderr?: string
      message?: string
    }
    if (e.killed) {
      throw new Error(`Command timed out after ${timeout}ms: ${command}`)
    }
    const code = typeof e.code === 'number' ? e.code : 1
    return formatResult(code, e.stdout ?? '', e.stderr ?? e.message ?? '')
  }
}

function formatResult(
  exitCode: number,
  stdout: string,
  stderr: string,
): string {
  const parts = [`exit_code: ${exitCode}`]
  if (stdout?.trim()) parts.push(`stdout:\n${stdout}`)
  if (stderr?.trim()) parts.push(`stderr:\n${stderr}`)
  return parts.join('\n')
}
