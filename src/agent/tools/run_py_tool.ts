import { execFile } from 'child_process'
import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export type RunPyToolOptions = {
  /** 注入 python3 可执行路径；传 null 表示未安装（便于单测） */
  pythonBinary?: string | null
  timeoutMs?: number
  maxBuffer?: number
  tmpDir?: string
}

/**
 * 查找本机可用的 python3 可执行文件路径。
 * 返回绝对路径字符串；找不到则返回 null（表示“未安装 / 不可用”）。
 *
 * 查找顺序：
 * 1) PATH 中的 `python3`（Windows 用 where，Unix 用 `command -v`）
 * 2) 回退尝试 `python`（部分环境只有 python 且为 3.x）
 */
export async function findPython3Binary(): Promise<string | null> {
  const candidates =
    process.platform === 'win32' ? (['python3', 'python'] as const) : (['python3'] as const)

  for (const name of candidates) {
    try {
      const { stdout } = await execFileAsync(
        process.platform === 'win32' ? 'where.exe' : '/bin/sh',
        process.platform === 'win32' ? [name] : ['-c', `command -v ${name}`],
        { timeout: 5_000, env: process.env },
      )
      const first = stdout
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find(Boolean)
      if (!first) continue

      // 确认能启动；Unix 上优先确保是 python3
      await execFileAsync(first, ['--version'], { timeout: 5_000 })
      if (process.platform !== 'win32' || name === 'python3') {
        return first
      }
      // Windows 上若只有 python，校验版本字符串含 Python 3
      const { stdout: ver } = await execFileAsync(first, ['--version'], {
        timeout: 5_000,
      })
      if (/Python\s*3/i.test(ver)) {
        return first
      }
    } catch {
      // 继续下一个候选
    }
  }

  return null
}

/**
 * 使用 python3 执行一段 Python 代码，返回 stdout/stderr 或错误信息。
 */
export async function runPyTool(
  code: string,
  options: RunPyToolOptions = {},
): Promise<string> {
  if (!code || !code.trim()) {
    throw new Error('code is required')
  }

  console.log(`\n[Tool] run_py called (${code.length} chars)`)
  console.log(`[Tool] run_py preview: ${code.slice(0, 80).replace(/\n/g, ' ')}`)

  // options.pythonBinary：
  //   - undefined：自动探测
  //   - string：强制使用该路径
  //   - null：假装未安装
  let pythonBinary: string | null
  if (options.pythonBinary === null) {
    pythonBinary = null
  } else if (options.pythonBinary !== undefined) {
    pythonBinary = options.pythonBinary
  } else {
    pythonBinary = await findPython3Binary()
  }

  if (!pythonBinary) {
    return (
      'Python 3 is not installed on this machine. ' +
      'Please install Python 3 from https://www.python.org/ and ensure `python3` is on PATH, then retry.'
    )
  }

  const timeout = options.timeoutMs ?? 15_000
  const maxBuffer = options.maxBuffer ?? 1024 * 1024
  const dir = options.tmpDir ?? os.tmpdir()
  const tmpFile = path.join(
    dir,
    `zhitalk-run-py-${Date.now()}-${Math.random().toString(16).slice(2)}.py`,
  )

  await fs.writeFile(tmpFile, code, 'utf8')

  try {
    try {
      // 等价于：python3 /tmp/zhitalk-run-py-xxx.py
      const { stdout, stderr } = await execFileAsync(pythonBinary, [tmpFile], {
        timeout,
        maxBuffer,
        env: process.env,
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

      if (
        e.message &&
        /ENOENT|not found|spawn/i.test(e.message) &&
        options.pythonBinary === undefined
      ) {
        return (
          'Python 3 is not installed on this machine. ' +
          'Please install Python 3 from https://www.python.org/ and ensure `python3` is on PATH, then retry.'
        )
      }

      if (e.killed) {
        return formatResult(
          1,
          e.stdout ?? '',
          `Error: script timed out after ${timeout}ms`,
        )
      }

      const codeNum = typeof e.code === 'number' ? e.code : 1
      return formatResult(codeNum, e.stdout ?? '', e.stderr ?? e.message ?? '')
    }
  } finally {
    await fs.unlink(tmpFile).catch(() => undefined)
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
