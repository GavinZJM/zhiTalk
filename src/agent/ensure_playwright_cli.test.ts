import * as path from 'path'
import { ensurePlaywrightCli, prependPathDir } from './ensure_playwright_cli'

describe('ensurePlaywrightCli', () => {
  const originalPath = process.env.PATH

  afterEach(() => {
    process.env.PATH = originalPath
  })

  it('returns existing binary without installing', async () => {
    const install = jest.fn()
    const logs: string[] = []
    const result = await ensurePlaywrightCli({
      findBinary: async () => '/opt/custom/bin/playwright-cli',
      install,
      log: (m) => logs.push(m),
    })
    expect(result).toEqual({
      binary: '/opt/custom/bin/playwright-cli',
      installed: false,
    })
    expect(install).not.toHaveBeenCalled()
    expect(logs.some((m) => m.includes('ready'))).toBe(true)
    const parts = (process.env.PATH ?? '').split(path.delimiter)
    expect(parts[0]).toBe('/opt/custom/bin')
  })

  it('installs when binary is missing then resolves local bin', async () => {
    let calls = 0
    const install = jest.fn(async () => {})
    const result = await ensurePlaywrightCli({
      cwd: '/tmp/proj',
      packageRoot: '/tmp/zjmTalk',
      findBinary: async () => {
        calls += 1
        return calls === 1 ? null : '/tmp/zjmTalk/node_modules/.bin/playwright-cli'
      },
      findNpm: async () => '/usr/local/bin/npm',
      install,
      log: () => {},
    })
    expect(install).toHaveBeenCalledWith('/tmp/zjmTalk', '/usr/local/bin/npm')
    expect(result.installed).toBe(true)
    expect(result.binary).toBe('/tmp/zjmTalk/node_modules/.bin/playwright-cli')
  })

  it('throws when npm is missing before attempting install', async () => {
    const install = jest.fn()
    await expect(
      ensurePlaywrightCli({
        findBinary: async () => null,
        findNpm: async () => null,
        install,
        log: () => {},
      }),
    ).rejects.toThrow(/npm.*not found/i)
    expect(install).not.toHaveBeenCalled()
  })

  it('throws when install finishes but binary still missing', async () => {
    await expect(
      ensurePlaywrightCli({
        cwd: '/tmp/empty-cwd',
        packageRoot: '/tmp/empty-pkg',
        findBinary: async () => null,
        findNpm: async () => '/usr/local/bin/npm',
        install: async () => {},
        log: () => {},
      }),
    ).rejects.toThrow(/still not available/)
  })

  it('prependPathDir is idempotent for the same dir', () => {
    const sep = path.delimiter
    process.env.PATH = `/a${sep}/b`
    prependPathDir('/x')
    prependPathDir('/x')
    expect(process.env.PATH).toBe(`/x${sep}/a${sep}/b`)
  })
})
