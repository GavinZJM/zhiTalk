import * as fs from 'fs'
import * as path from 'path'
import boxen from 'boxen'
import chalk from 'chalk'
import figlet from 'figlet'

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

/** 启动时打印项目名称（figlet）+ 信息框（boxen）+ 使用说明 */
export function printStartupBanner(): void {
  const pkg = loadPackageInfo()
  const name = field(pkg.name, 'zhitalk')

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

  console.log(chalk.dim('使用说明'))
  console.log(chalk.dim('  • ESC                    取消 AI 请求'))
  console.log(chalk.dim('  • /new                   开启新会话'))
  console.log(chalk.dim('  • /sessions              列出最近会话'))
  console.log(chalk.dim('  • /rewind <thread_id>    恢复指定会话'))
  console.log(chalk.dim('  • /compact               手动压缩 Context'))
  console.log(chalk.dim('  • exit                   退出程序'))
  console.log()
}
