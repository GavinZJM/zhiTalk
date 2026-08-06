import { execFile, spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { promisify } from 'util'
import { style } from './ui/style'

const execFileAsync = promisify(execFile)

const CLI_PACKAGE = '@playwright/cli@latest'
const CLI_BIN = process.platform === 'win32' ? 'playwright-cli.cmd' : 'playwright-cli'

export type EnsurePlaywrightCliResult = {
  /** Absolute path to playwright-cli, or bare command name if resolved via PATH */
  binary: string
  /** True when this call performed an npm install */
  installed: boolean
}

export type EnsurePlaywrightCliOptions = {
  cwd?: string
  /** Project package root (zjmTalk). Defaults to package containing this module. */
  packageRoot?: string
  log?: (message: string) => void
  /** Inject for tests */
  findBinary?: () => Promise<string | null>
  findNpm?: () => Promise<string | null>
  install?: (cwd: string, npmBinary: string) => Promise<void>
}

function defaultPackageRoot(): string {
  // src/agent → ../../ ; dist/agent → ../../
  return path.resolve(__dirname, '../..')
}

function localBinPath(root: string): string {
  return path.join(root, 'node_modules', '.bin', CLI_BIN)
}

/** Prepend dir to process.env.PATH if not already present. */
export function prependPathDir(dir: string): void {
  const sep = path.delimiter
  const current = process.env.PATH ?? ''
  const parts = current.split(sep).filter(Boolean)
  if (parts.some((p) => path.resolve(p) === path.resolve(dir))) return
  process.env.PATH = `${dir}${sep}${current}`
}

async function pathHasCommand(name: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      process.platform === 'win32' ? 'where.exe' : '/bin/sh',
      process.platform === 'win32' ? [name] : ['-c', `command -v ${name}`],
      { timeout: 5_000, env: process.env },
    )
    const first = stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find(Boolean)
    return first || null
  } catch {
    return null
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, fs.constants.X_OK)
    return true
  } catch {
    try {
      await fs.promises.access(filePath, fs.constants.F_OK)
      return true
    } catch {
      return false
    }
  }
}

/**
 * Locate playwright-cli: PATH, then cwd/node_modules/.bin, then packageRoot/node_modules/.bin.
 */
export async function findPlaywrightCliBinary(
  cwd: string = process.cwd(),
  packageRoot: string = defaultPackageRoot(),
): Promise<string | null> {
  const fromPath = await pathHasCommand('playwright-cli')
  if (fromPath) return fromPath

  for (const root of [cwd, packageRoot]) {
    const local = localBinPath(root)
    if (await fileExists(local)) return local
  }
  return null
}

/** Locate npm on PATH (Windows: npm.cmd). */
export async function findNpmBinary(): Promise<string | null> {
  const name = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  return pathHasCommand(name)
}

async function defaultInstall(cwd: string, npmBinary: string): Promise<void> {
  // Stream npm output so slow installs show live progress in the terminal.
  await new Promise<void>((resolve, reject) => {
    const child = spawn(npmBinary, ['install', '-D', CLI_PACKAGE], {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const onChunk = (chunk: Buffer) => {
      process.stderr.write(chunk)
    }
    child.stdout?.on('data', onChunk)
    child.stderr?.on('data', onChunk)

    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`npm install ${CLI_PACKAGE} timed out after 180s`))
    }, 180_000)

    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else
        reject(
          new Error(
            `npm install ${CLI_PACKAGE} failed with exit code ${code ?? 'unknown'}`,
          ),
        )
    })
  })
}

/**
 * Startup helper: ensure `playwright-cli` is available.
 * If missing, requires npm, installs `@playwright/cli` into the zjmTalk package root,
 * and puts its `.bin` on PATH.
 */
export async function ensurePlaywrightCli(
  options: EnsurePlaywrightCliOptions = {},
): Promise<EnsurePlaywrightCliResult> {
  const cwd = options.cwd ?? process.cwd()
  const packageRoot = options.packageRoot ?? defaultPackageRoot()
  const log =
    options.log ??
    ((message: string) => {
      console.log(style.tool(message))
    })
  const find = options.findBinary ?? (() => findPlaywrightCliBinary(cwd, packageRoot))
  const findNpm = options.findNpm ?? findNpmBinary
  const install = options.install ?? defaultInstall
  const installRoot = packageRoot

  let binary = await find()
  if (binary) {
    prependPathDir(path.dirname(binary))
    log(`[playwright-cli] ready: ${binary}`)
    return { binary, installed: false }
  }

  const npmBinary = await findNpm()
  if (!npmBinary) {
    throw new Error(
      'playwright-cli is not installed, and `npm` was not found on PATH. Install Node.js/npm (https://nodejs.org/), then retry or run: npm install -g @playwright/cli@latest',
    )
  }

  log(`[playwright-cli] not found, installing @playwright/cli via ${npmBinary} …`)
  await install(installRoot, npmBinary)

  binary = await find()
  if (!binary) {
    const local = localBinPath(installRoot)
    if (await fileExists(local)) {
      binary = local
    }
  }

  if (!binary) {
    throw new Error(
      'playwright-cli install finished but the `playwright-cli` command is still not available. Try: npm install -g @playwright/cli@latest',
    )
  }

  prependPathDir(path.dirname(binary))
  log(`[playwright-cli] installed: ${binary}`)
  return { binary, installed: true }
}
