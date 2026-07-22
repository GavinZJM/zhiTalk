#!/usr/bin/env node
/**
 * Integration: zhitalk + ask AI to run simple Python via run_py tool.
 */
const { spawn } = require('child_process')
const path = require('path')

const root = path.resolve(__dirname, '..')
const QUESTION =
  'Please use the run_py tool to execute: print(21 * 2) and tell me the result.\n'

function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
}

async function main() {
  const child = spawn('zhitalk', [], {
    cwd: root,
    env: {
      ...process.env,
      PATH: `${path.join(root, '.bin')}:${process.env.PATH || ''}`,
      FORCE_COLOR: '0',
      ZHITALK_THREAD_ID: 'itest-run-py-' + Date.now(),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  let out = ''
  const append = (b) => {
    out += b.toString()
    process.stdout.write(b)
  }
  child.stdout.on('data', append)
  child.stderr.on('data', append)

  const deadline = Date.now() + 120000
  let phase = 'wait_prompt'
  let askedAt = 0

  while (Date.now() < deadline) {
    const plain = stripAnsi(out)

    if (phase === 'wait_prompt' && plain.includes('You:')) {
      child.stdin.write(QUESTION)
      phase = 'wait_done'
      askedAt = Date.now()
      console.log('\n[test] asked AI to run Python')
    } else if (phase === 'wait_done') {
      const toolCalled = plain.includes('[Tool] run_py called')
      const returned = plain.split('You:').length >= 3
      const sawFortyTwo = /\b42\b/.test(plain.slice(plain.indexOf('AI:')))

      if (toolCalled && returned && sawFortyTwo) {
        console.log('\n[test] PASS: run_py executed and AI reported 42')
        child.stdin.write('exit\n')
        setTimeout(() => child.kill('SIGTERM'), 800)
        return 0
      }

      if (toolCalled && returned && /print\(21 \* 2\)/.test(plain)) {
        console.log('\n[test] PASS: run_py tool invoked with expected code')
        child.stdin.write('exit\n')
        setTimeout(() => child.kill('SIGTERM'), 800)
        return 0
      }

      if (askedAt && Date.now() - askedAt > 90000) {
        console.error('\n[test] FAIL: timeout')
        console.error(plain.slice(-2000))
        child.kill('SIGTERM')
        return 1
      }
    }

    await new Promise((r) => setTimeout(r, 200))
  }

  console.error('\n[test] FAIL: overall timeout')
  child.kill('SIGTERM')
  return 1
}

main().then((c) => process.exit(c))
