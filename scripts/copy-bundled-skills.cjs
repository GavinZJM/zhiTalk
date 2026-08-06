#!/usr/bin/env node
/** 将 package 根目录 bundled-skills 复制到 dist/bundled-skills（供 npm 包与运行时解析） */
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const src = path.join(root, 'bundled-skills')
const dest = path.join(root, 'dist', 'bundled-skills')

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true })
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue
    const a = path.join(from, entry.name)
    const b = path.join(to, entry.name)
    if (entry.isDirectory()) copyDir(a, b)
    else if (entry.isFile()) fs.copyFileSync(a, b)
  }
}

if (!fs.existsSync(src)) {
  console.warn('[copy-bundled-skills] skip: bundled-skills/ not found')
  process.exit(0)
}

fs.rmSync(dest, { recursive: true, force: true })
copyDir(src, dest)
console.log(`[copy-bundled-skills] ${src} → ${dest}`)
