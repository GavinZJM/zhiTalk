#!/usr/bin/env node
/**
 * Integration: start zjmTalk, ask AI to create a file, verify on disk.
 */
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const outFile = path.join(root, 'agent-write-demo.txt')
const MARKER = 'zjmTalk-write-file-integration-ok'
const QUESTION = `Please use the write_file tool to create a file named agent-write-demo.txt in the current working directory with exactly this content (and nothing else): ${MARKER}\n`

function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
}

async function main() {
  try {
    fs.unlinkSync(outFile)
  } catch (_) {}

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
      console.log('\n[test] asked AI to create file')
    } else if (phase === 'wait_done') {
      // Success if file exists with marker, or AI finished another You: and file is there
      if (fs.existsSync(outFile)) {
        const content = fs.readFileSync(outFile, 'utf8')
        if (content.includes(MARKER)) {
          console.log('\n[test] PASS: file created with expected content')
          console.log('[test] path:', outFile)
          console.log('[test] content:', JSON.stringify(content))
          child.stdin.write('exit\n')
          setTimeout(() => child.kill('SIGTERM'), 800)
          return 0
        }
      }
      // Also detect tool log or Successfully wrote
      if (
        askedAt &&
        Date.now() - askedAt > 90000 &&
        plain.split('You:').length >= 3
      ) {
        console.error('\n[test] FAIL: AI returned but file missing/wrong')
        console.error('exists=', fs.existsSync(outFile))
        if (fs.existsSync(outFile)) {
          console.error('content=', fs.readFileSync(outFile, 'utf8'))
        }
        child.kill('SIGTERM')
        return 1
      }
      if (askedAt && Date.now() - askedAt > 100000) {
        console.error('\n[test] FAIL: timeout')
        console.error(plain.slice(-1500))
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
