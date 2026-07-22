import { execFile } from 'child_process'
import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export type RunJsToolOptions = {
  /** 注入 Node 可执行路径；传 null 表示未安装（便于单测） */
  nodeBinary?: string | null
  timeoutMs?: number
  maxBuffer?: number
  tmpDir?: string
}

/**
 * 查找本机可用的 Node.js 可执行文件路径。
 * 返回绝对路径字符串；若两处都找不到则返回 null（表示“未安装 / 不可用”）。
 *
 * 查找顺序：
 * 1) 当前进程自己的 Node（process.execPath）—— agent 本身就是 Node 跑起来的，通常最可靠
 * 2) 系统 PATH 里的 `node`（Windows 用 where，Unix 用 `command -v`）
 */
export async function findNodeBinary(): Promise<string | null> {
  // ── 路径 1：复用当前进程的 Node ────────────────────────────────
  // process.execPath 例：/Users/xxx/.nvm/versions/node/v21.7.3/bin/node
  // 用 basename 判断文件名是否叫 node / node.exe，避免误用其它运行时。
  if (process.execPath && /node(\.exe)?$/i.test(path.basename(process.execPath))) {
    try {
      // 再跑一次 `node -v`，确认这个二进制现在还能启动（文件没被删、没坏）。
      await execFileAsync(process.execPath, ['-v'], { timeout: 5_000 })
      return process.execPath
    } catch {
      // 当前 execPath 不可用，继续尝试 PATH 查找。
    }
  }

  // ── 路径 2：在 PATH 中查找名为 node 的命令 ─────────────────────
  // 不直接 execFile('node')：若 PATH 里没有，错误信息不统一。
  // 改为询问 shell/系统“node 在哪”，拿到明确路径再返回。
  try {
    const { stdout } = await execFileAsync(
      // Windows: `where.exe node` 会打印匹配到的路径（可能多行）
      // macOS/Linux: `command -v node` 打印 PATH 中第一个 node
      process.platform === 'win32' ? 'where.exe' : '/bin/sh',
      process.platform === 'win32' ? ['node'] : ['-c', 'command -v node'],
      { timeout: 5_000, env: process.env },
    )
    // where 可能输出多行；只取第一条非空路径。
    const first = stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find(Boolean)
    return first || null
  } catch {
    // where / command -v 失败（退出码非 0）→ PATH 里没有 node
    return null
  }
}

/**
 * 使用 Node.js 执行一段 JavaScript 代码，返回 stdout/stderr 或错误信息。
 */
export async function runJsTool(
  code: string,
  options: RunJsToolOptions = {},
): Promise<string> {
  if (!code || !code.trim()) {
    throw new Error('code is required')
  }

  console.log(`\n[Tool] run_js called (${code.length} chars)`)
  console.log(`[Tool] run_js preview: ${code.slice(0, 80).replace(/\n/g, ' ')}`)

  // ── 决定用哪个 node ───────────────────────────────────────────
  // options.nodeBinary 三种语义（方便单测注入）：
  //   - undefined：自动探测（生产默认）
  //   - string：强制使用该路径
  //   - null：假装本机没有 Node，走“未安装”提示分支
  let nodeBinary: string | null
  if (options.nodeBinary === null) {
    nodeBinary = null
  } else if (options.nodeBinary !== undefined) {
    nodeBinary = options.nodeBinary
  } else {
    nodeBinary = await findNodeBinary()
  }

  // 探测失败 / 单测注入 null → 把提示返回给 AI，而不是抛异常中断 agent
  if (!nodeBinary) {
    return (
      'Node.js is not installed on this machine. ' +
      'Please install Node.js from https://nodejs.org/ and ensure `node` is on PATH, then retry.'
    )
  }

  const timeout = options.timeoutMs ?? 15_000
  const maxBuffer = options.maxBuffer ?? 1024 * 1024
  const dir = options.tmpDir ?? os.tmpdir()
  const tmpFile = path.join(
    dir,
    `zhitalk-run-js-${Date.now()}-${Math.random().toString(16).slice(2)}.js`,
  )

  await fs.writeFile(tmpFile, code, 'utf8')

  try {
    try {
      // 等价于：node /tmp/zhitalk-run-js-xxx.js
      const { stdout, stderr } = await execFileAsync(nodeBinary, [tmpFile], {
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

      // 自动探测场景下，若启动时仍报 ENOENT（路径失效/被删），同样当作“未安装”
      // 单测注入的假路径不走这句，避免掩盖真实执行错误。
      if (
        e.message &&
        /ENOENT|not found|spawn/i.test(e.message) &&
        options.nodeBinary === undefined
      ) {
        return (
          'Node.js is not installed on this machine. ' +
          'Please install Node.js from https://nodejs.org/ and ensure `node` is on PATH, then retry.'
        )
      }

      if (e.killed) {
        return formatResult(
          1,
          e.stdout ?? '',
          `Error: script timed out after ${timeout}ms`,
        )
      }

      // JS 运行时报错（语法错误、throw 等）：把 exit_code + stderr 回给 AI
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
