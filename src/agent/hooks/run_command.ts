import { spawn } from 'child_process'
import * as path from 'path'
import type { HookDecision, HookDefinition, HookPayload } from './types'

const DEFAULT_TIMEOUT_SEC = 30

function decisionMessage(stderr: string, stdout: string): string {
  const err = stderr.trim()
  if (err) return err
  return stdout.trim()
}

function mapExitToDecision(
  exitCode: number,
  stderr: string,
  stdout: string,
  command: string,
): HookDecision {
  const message = decisionMessage(stderr, stdout)
  if (exitCode === 0) {
    return {
      action: 'continue',
      message: '',
      exitCode,
      command,
      stdout,
      stderr,
    }
  }
  if (exitCode === 1) {
    return {
      action: 'block',
      message: message || 'Hook blocked this action.',
      exitCode,
      command,
      stdout,
      stderr,
    }
  }
  if (exitCode === 2) {
    return {
      action: 'inject',
      message: message || '',
      exitCode,
      command,
      stdout,
      stderr,
    }
  }
  return {
    action: 'continue',
    message,
    exitCode,
    command,
    stdout,
    stderr,
  }
}

export type RunHookCommandOptions = {
  cwd?: string
  /** 覆盖定义中的 timeout（秒） */
  timeoutSec?: number
}

/**
 * 执行单个 command hook：stdin 写入 JSON payload，按 exit code 映射决策。
 */
export function runHookCommand(
  def: HookDefinition,
  payload: HookPayload,
  options: RunHookCommandOptions = {},
): Promise<HookDecision> {
  const cwd = options.cwd ?? process.cwd()
  const timeoutSec =
    options.timeoutSec ?? def.timeout ?? DEFAULT_TIMEOUT_SEC
  const timeoutMs = Math.max(1, timeoutSec) * 1000
  const command = def.command
  const failClosed = def.failClosed === true

  // 通过 shell 执行，支持相对路径脚本与带参数的 command 字符串
  const isWin = process.platform === 'win32'
  const shell = isWin ? 'cmd.exe' : '/bin/sh'
  const shellArgs = isWin ? ['/c', command] : ['-c', command]

  return new Promise((resolve) => {
    let settled = false
    const finish = (decision: HookDecision) => {
      if (settled) return
      settled = true
      resolve(decision)
    }

    let stdout = ''
    let stderr = ''
    let timedOut = false

    const child = spawn(shell, shellArgs, {
      cwd,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const timer = setTimeout(() => {
      timedOut = true
      try {
        child.kill('SIGKILL')
      } catch {
        /* ignore */
      }
    }, timeoutMs)

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })

    child.on('error', (err) => {
      clearTimeout(timer)
      const msg = `Hook failed to start (${command}): ${err.message}`
      if (failClosed) {
        finish({
          action: 'block',
          message: msg,
          exitCode: 1,
          command,
          stdout,
          stderr: stderr || msg,
        })
      } else {
        finish({
          action: 'continue',
          message: '',
          exitCode: 0,
          command,
          stdout,
          stderr,
        })
      }
    })

    child.on('close', (code) => {
      clearTimeout(timer)
      if (timedOut) {
        const msg = `Hook timed out after ${timeoutSec}s: ${command}`
        if (failClosed) {
          finish({
            action: 'block',
            message: msg,
            exitCode: 1,
            command,
            stdout,
            stderr: stderr || msg,
          })
        } else {
          finish({
            action: 'continue',
            message: '',
            exitCode: 0,
            command,
            stdout,
            stderr,
          })
        }
        return
      }

      const exitCode = code ?? 1
      if (exitCode === 0 || exitCode === 1 || exitCode === 2) {
        finish(mapExitToDecision(exitCode, stderr, stdout, command))
        return
      }

      const msg =
        decisionMessage(stderr, stdout) ||
        `Hook exited with code ${exitCode}: ${command}`
      if (failClosed) {
        finish({
          action: 'block',
          message: msg,
          exitCode: 1,
          command,
          stdout,
          stderr,
        })
      } else {
        finish({
          action: 'continue',
          message: '',
          exitCode: 0,
          command,
          stdout,
          stderr,
        })
      }
    })

    try {
      child.stdin?.write(JSON.stringify(payload))
      child.stdin?.end()
    } catch {
      // stdin 写失败时仍等 process 结束
    }
  })
}

/** 将相对 command 规范为展示用路径（不改变实际执行字符串） */
export function resolveHookCommandDisplay(
  command: string,
  cwd: string = process.cwd(),
): string {
  if (path.isAbsolute(command)) return command
  return path.resolve(cwd, command)
}
