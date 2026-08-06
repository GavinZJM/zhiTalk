#!/usr/bin/env node
/**
 * Integration: zjmTalk + ask AI to list src/ via exec tool.
 */
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const QUESTION =
  'Please use the exec tool to list files under the src directory (for example: ls src). Reply with the file/folder names you see.\n'

function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
}

async function main() {
  const child = spawn('zjmTalk', [], {
    cwd: root,
    env: {
      ...process.env,
      PATH: `${path.join(root, '.bin')}:${process.env.PATH || ''}`,
      FORCE_COLOR: '0',
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
      console.log('\n[test] asked AI to list src/')
    } else if (phase === 'wait_done') {
      const afterAi = plain.includes('AI:')
      const mentionsSrc =
        /\b(agent|tools|index\.ts|cli\.ts)\b/i.test(plain) ||
        /src\//i.test(plain)
      const backToPrompt =
        plain.split('You:').length >= 3 ||
        (askedAt &&
          Date.now() - askedAt > 3000 &&
          /You:\s*$/.test(plain.trim()))

      // Success: saw tool/list output mentioning known src entries, then returned
      if (afterAi && mentionsSrc && plain.split('You:').length >= 3) {
        console.log('\n[test] PASS: AI listed src directory contents')
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
