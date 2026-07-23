#!/usr/bin/env node
import * as readline from 'readline'
import { AgentCancelledError, runAgentStream } from './agent'
import {
  createCommandRegistry,
  type CommandContext,
} from './commands'
import { formatContextWarning, formatTokenUsageLine, shouldWarnContextUsage } from './models/token_usage'
import { printStartupBanner } from './ui/banner'
import { style } from './ui/style'

// 历史由 checkpointer 按 thread_id 持久化；可用环境变量指定初始会话
let threadId = process.env.ZHITALK_THREAD_ID || 'user-session-1'

const commands = createCommandRegistry()

const session: CommandContext = {
  get threadId() {
    return threadId
  },
  setThreadId(next: string) {
    threadId = next
  },
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

readline.emitKeypressEvents(process.stdin)

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve))
}

/** AI 回复期间监听 ESC；返回清理函数 */
function listenForEscape(onEscape: () => void): () => void {
  // TTY：用 keypress + raw mode，识别真正的 ESC 键
  if (process.stdin.isTTY) {
    const wasRaw = process.stdin.isRaw
    process.stdin.setRawMode(true)
    process.stdin.resume()

    const onKeypress = (_str: string, key: readline.Key) => {
      if (key.name === 'escape') {
        onEscape()
        return
      }
      // raw 模式下需自行处理 Ctrl+C
      if (key.ctrl && key.name === 'c') {
        process.stdout.write('\n')
        process.exit(0)
      }
    }

    process.stdin.on('keypress', onKeypress)

    return () => {
      process.stdin.off('keypress', onKeypress)
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(wasRaw ?? false)
      }
    }
  }

  // 非 TTY（管道/测试）：监听原始字节里的 ESC (0x1b)
  const onData = (chunk: Buffer | string) => {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    if (buf.includes(0x1b)) {
      onEscape()
    }
  }
  process.stdin.on('data', onData)
  process.stdin.resume()
  return () => {
    process.stdin.off('data', onData)
  }
}

async function chat(userInput: string): Promise<void> {
  rl.pause() // 暂停 readline，避免光标错位

  process.stdout.write('\n' + style.ai('AI: '))

  const ac = new AbortController()
  const stopListening = listenForEscape(() => {
    if (!ac.signal.aborted) {
      ac.abort()
    }
  })

  try {
    const result = await runAgentStream(
      userInput,
      (token: string) => {
        process.stdout.write(token)
      },
      session.threadId,
      ac.signal,
    )
    process.stdout.write('\n')
    if (result.usage) {
      console.log(style.tokenUsage(formatTokenUsageLine(result.usage)))
      if (shouldWarnContextUsage(result.usage)) {
        console.log(style.contextWarning(formatContextWarning()))
      }
    }
    process.stdout.write('\n')
  } catch (err) {
    if (err instanceof AgentCancelledError || ac.signal.aborted) {
      process.stdout.write('\n\n' + style.cancelled('[已取消]') + '\n\n')
      return
    }
    throw err
  } finally {
    stopListening()
    rl.resume() // 恢复 readline
  }
}

async function handleInput(userInput: string): Promise<'continue' | 'exit'> {
  if (userInput.toLowerCase() === 'exit') {
    console.log(style.goodbye('再见！'))
    return 'exit'
  }

  const result = await commands.dispatch(userInput, session)
  if (result) {
    if (result.type === 'exit') {
      console.log(style.goodbye(result.message ?? '再见！'))
      return 'exit'
    }
    if (result.type === 'error') {
      console.log(style.commandError(result.message))
      return 'continue'
    }
    if (result.message) {
      console.log(style.commandOk(result.message))
    }
    return 'continue'
  }

  await chat(userInput)
  return 'continue'
}

async function main(): Promise<void> {
  printStartupBanner()

  while (true) {
    const userInput = await prompt(style.you('You: '))

    if (!userInput.trim()) continue

    try {
      const status = await handleInput(userInput.trim())
      if (status === 'exit') {
        rl.close()
        break
      }
    } catch (err) {
      console.error(
        style.errorLabel('请求出错:'),
        style.errorMessage((err as Error).message),
      )
    }
  }
}

main()
