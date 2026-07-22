#!/usr/bin/env node
/**
 * Pipe-based integration test (no PTY required):
 * 1. Start `pnpm exec ts-node src/agent/cli.ts`
 * 2. Ask: intro youself in 100 words
 * 3. After AI starts (or 3s), send ESC (0x1b)
 * 4. Expect [已取消] and return to You:
 */
const { spawn } = require('child_process')
const path = require('path')

const root = path.resolve(__dirname, '..')
const QUESTION = 'intro youself in 100 words\n'
const ESC = '\x1b'
const TIMEOUT_MS = 90000

function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
}

async function main() {
  const child = spawn('pnpm', ['exec', 'ts-node', 'src/agent/cli.ts'], {
    cwd: root,
    env: { ...process.env, FORCE_COLOR: '0' },
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  let out = ''
  const append = (buf) => {
    out += buf.toString()
    process.stdout.write(buf)
  }
  child.stdout.on('data', append)
  child.stderr.on('data', append)

  const started = Date.now()
  let phase = 'wait_prompt'
  let escAt = 0
  let delayUntil = 0

  const deadline = Date.now() + TIMEOUT_MS

  while (Date.now() < deadline) {
    const plain = stripAnsi(out)

    if (phase === 'wait_prompt' && plain.includes('You:')) {
      child.stdin.write(QUESTION)
      phase = 'wait_ai'
      console.log('\n[test] sent question')
    } else if (phase === 'wait_ai' && plain.includes('AI:')) {
      delayUntil = Date.now() + 3000
      phase = 'delay'
      console.log('\n[test] AI started, waiting 3s before ESC')
    } else if (phase === 'delay' && Date.now() >= delayUntil) {
      child.stdin.write(ESC)
      escAt = Date.now()
      phase = 'wait_cancel'
      console.log('\n[test] sent ESC')
    } else if (phase === 'wait_cancel') {
      if (plain.includes('[已取消]')) {
        const after = plain.split('[已取消]').pop() || ''
        if (after.includes('You:')) {
          console.log('\n[test] PASS: cancelled and returned to prompt')
          child.stdin.write('exit\n')
          setTimeout(() => child.kill('SIGTERM'), 1000)
          return 0
        }
      }
      if (escAt && Date.now() - escAt > 30000) {
        console.error('\n[test] FAIL: timeout after ESC')
        console.error(plain.slice(-1200))
        child.kill('SIGTERM')
        return 1
      }
    }

    await new Promise((r) => setTimeout(r, 100))
  }

  console.error('\n[test] FAIL: overall timeout, phase=', phase)
  console.error(stripAnsi(out).slice(-1500))
  child.kill('SIGTERM')
  return 1
}

main().then((code) => process.exit(code))
