import chalk from 'chalk'

/** CLI / 调试日志用的终端样式。非 TTY 时 chalk 会自动降级为无色。 */
export const style = {
  you: (s: string) => chalk.cyan.bold(s),
  ai: (s: string) => chalk.blue.bold(s),
  cancelled: (s: string) => chalk.yellow(s),
  goodbye: (s: string) => chalk.dim(s),
  errorLabel: (s: string) => chalk.red.bold(s),
  errorMessage: (s: string) => chalk.red(s),
  commandOk: (s: string) => chalk.green(s),
  commandError: (s: string) => chalk.yellow(s),
  tokenUsage: (s: string) => chalk.dim(s),
  contextWarning: (s: string) => chalk.yellow(s),
  contextCompress: (s: string) => chalk.magenta(s),
  skill: (s: string) => chalk.magenta(s),
  tool: (s: string) => chalk.gray(s),
  toolPreview: (s: string) => chalk.dim(s),
}
