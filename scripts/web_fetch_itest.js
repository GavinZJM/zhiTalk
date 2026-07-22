#!/usr/bin/env node
/**
 * Integration: zhitalk + ask AI to web_fetch https://www.mianshipai.com/
 */
const { spawn } = require('child_process')
const path = require('path')

const root = path.resolve(__dirname, '..')
const URL = 'https://www.mianshipai.com/'
const QUESTION =
  `Please use the web_fetch tool to fetch ${URL} and tell me what the page is about based on the returned HTML/text. Quote a short snippet from the content.\n`

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
      ZHITALK_THREAD_ID: 'itest-web-fetch-' + Date.now(),
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
      console.log('\n[test] asked AI to web_fetch mianshipai.com')
    } else if (phase === 'wait_done') {
      const toolCalled = plain.includes('[Tool] web_fetch called')
      const returned = plain.split('You:').length >= 3
      const gotContent =
        /mianshipai|面试|面试派|html|status:\s*200/i.test(plain) &&
        !/Web fetch failed/i.test(plain.slice(plain.indexOf('[Tool] web_fetch')))

      if (toolCalled && returned && gotContent) {
        console.log('\n[test] PASS: web_fetch retrieved page content')
        child.stdin.write('exit\n')
        setTimeout(() => child.kill('SIGTERM'), 800)
        return 0
      }

      // Tool ran but failed — still report clearly
      if (
        toolCalled &&
        returned &&
        /Web fetch failed/i.test(plain)
      ) {
        console.error('\n[test] FAIL: web_fetch returned an error')
        console.error(plain.slice(-2000))
        child.kill('SIGTERM')
        return 1
      }

      if (askedAt && Date.now() - askedAt > 90000) {
        console.error('\n[test] FAIL: timeout')
        console.error(plain.slice(-2500))
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
