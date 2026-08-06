import * as fs from 'fs'
import * as path from 'path'
import boxen from 'boxen'
import chalk from 'chalk'
import figlet from 'figlet'
import { formatConfigManual } from '../config'

type PackageInfo = {
  name?: string
  version?: string
  description?: string
  author?: string
  docs?: string
}

function loadPackageInfo(): PackageInfo {
  const pkgPath = path.resolve(__dirname, '../../../package.json')
  return JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as PackageInfo
}

function field(value: string | undefined, fallback = '—'): string {
  const trimmed = value?.trim()
  return trimmed ? trimmed : fallback
}

/** 给配置手册每行上色（纯文本 → 终端样式） */
function colorizeConfigManualLine(line: string): string {
  const trimmed = line.trim()

  if (!trimmed) return line

  // 分隔线
  if (/^[═─]+$/.test(trimmed) || trimmed.startsWith('──') || trimmed.startsWith('══')) {
    return chalk.gray(line)
  }

  // 主标题
  if (trimmed === '配置手册') {
    return chalk.cyan.bold(line)
  }

  // 最小可启动（强调）
  if (trimmed.includes('最小可启动配置')) {
    return chalk.yellow.bold(line)
  }

  // 章节：一、二、… / 「以下为可选」
  if (/^[一二三四五六七八九十]+、/.test(trimmed) || trimmed.startsWith('以下为可选')) {
    return chalk.magenta.bold(line)
  }

  // 小节标题（步骤 / 必填 JSON / 目标 / 常见…）
  if (
    /^(目标|路径|步骤|必填 JSON|三个字段|最小配置下会发生什么|常见启动失败)[:：]?/.test(
      trimmed,
    )
  ) {
    return chalk.white.bold(line)
  }

  // JSON 代码块行
  if (/^\s*[{}\[\]]/.test(line) || /^\s*"[^"]+"\s*:/.test(line)) {
    return chalk.green(line)
  }

  // shell / 路径偏多的缩进行
  if (/^\s+(mkdir |npm )/.test(line) || /^\s+\/\S+/.test(line)) {
    return chalk.cyan(line)
  }

  // 成功 / 失败标记
  if (trimmed.startsWith('✓')) return chalk.green(line)
  if (trimmed.startsWith('✗')) return chalk.red(line)
  if (trimmed.startsWith('•')) return chalk.yellow(line)

  // 环境变量名
  if (/\bZJMTALK_[A-Z_]+\b/.test(trimmed) && !trimmed.includes('{')) {
    return chalk.blue(line)
  }

  // 带「路径：」前缀
  if (trimmed.startsWith('路径：') || trimmed.startsWith('路径:')) {
    const i = line.indexOf('：') >= 0 ? line.indexOf('：') : line.indexOf(':')
    return chalk.white(line.slice(0, i + 1)) + chalk.cyan(line.slice(i + 1))
  }

  return chalk.white(line)
}

function printUsageGuide(): void {
  console.log(chalk.cyan.bold('使用说明'))
  const rows: Array<[string, string]> = [
    ['ESC', '取消 AI 请求'],
    ['/new', '开启新会话'],
    ['/sessions', '列出最近会话'],
    ['/rewind <thread_id>', '恢复指定会话'],
    ['/compact', '手动压缩 Context'],
    ['exit', '退出程序'],
  ]
  for (const [cmd, desc] of rows) {
    console.log(
      `  ${chalk.green('•')} ${chalk.yellow(cmd.padEnd(22))} ${chalk.white(desc)}`,
    )
  }
  console.log()
}

function printConfigManualColored(): void {
  for (const line of formatConfigManual().split('\n')) {
    console.log(colorizeConfigManualLine(line))
  }
  console.log()
}

/** 启动时打印项目名称（figlet）+ 信息框（boxen）+ 使用说明 + 配置手册 */
export function printStartupBanner(): void {
  const pkg = loadPackageInfo()
  const name = field(pkg.name, 'zjmTalk')

  const title = figlet.textSync(name, {
    font: 'Standard',
    horizontalLayout: 'default',
    verticalLayout: 'default',
  })

  console.log('\n' + chalk.cyan.bold(title))

  const info = [
    `${chalk.bold('version')}      ${chalk.green(field(pkg.version))}`,
    `${chalk.bold('description')}  ${field(pkg.description)}`,
    `${chalk.bold('author')}       ${field(pkg.author)}`,
    `${chalk.bold('docs')}         ${chalk.underline.blue(field(pkg.docs))}`,
  ].join('\n')

  console.log(
    boxen(info, {
      padding: 1,
      margin: { top: 0, bottom: 1, left: 0, right: 0 },
      borderStyle: 'round',
      borderColor: 'cyan',
      title: name,
      titleAlignment: 'center',
    }),
  )

  printUsageGuide()
  printConfigManualColored()
}
