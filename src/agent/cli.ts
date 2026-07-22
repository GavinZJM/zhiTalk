#!/usr/bin/env node
import * as readline from 'readline'
import { AgentCancelledError, runAgentStream } from './agent'

// 历史记录由 agent 的 checkpointer 自动持久化；可用环境变量覆盖会话 ID
const THREAD_ID = process.env.ZHITALK_THREAD_ID || 'user-session-1'

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

  process.stdout.write('\nAI: ')

  const ac = new AbortController()
  const stopListening = listenForEscape(() => {
    if (!ac.signal.aborted) {
      ac.abort()
    }
  })

  try {
    await runAgentStream(
      userInput,
      (token: string) => {
        process.stdout.write(token)
      },
      THREAD_ID,
      ac.signal,
    )
    process.stdout.write('\n\n')
  } catch (err) {
    if (err instanceof AgentCancelledError || ac.signal.aborted) {
      process.stdout.write('\n\n[已取消]\n\n')
      return
    }
    throw err
  } finally {
    stopListening()
    rl.resume() // 恢复 readline
  }
}

async function main(): Promise<void> {
  console.log('=== Agent 聊天控制台 (输入 "exit" 退出，回复中按 ESC 取消) ===\n')

  while (true) {
    const userInput = await prompt('You: ')

    if (!userInput.trim()) continue
    if (userInput.toLowerCase() === 'exit') {
      console.log('再见！')
      rl.close()
      break
    }

    try {
      await chat(userInput)
    } catch (err) {
      console.error('请求出错:', (err as Error).message)
    }
  }
}

main()
