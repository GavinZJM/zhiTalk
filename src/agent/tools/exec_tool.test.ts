import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'
import { assertSafeCommand, execTool } from './exec_tool'

describe('assertSafeCommand', () => {
  it('allows safe listing commands', () => {
    expect(() => assertSafeCommand('ls -la src')).not.toThrow()
    expect(() => assertSafeCommand('pwd')).not.toThrow()
    expect(() => assertSafeCommand('echo hello')).not.toThrow()
  })

  it('blocks rm and rmdir', () => {
    expect(() => assertSafeCommand('rm -rf /tmp/x')).toThrow(/Dangerous/)
    expect(() => assertSafeCommand('rmdir foo')).toThrow(/Dangerous/)
    expect(() => assertSafeCommand('/bin/rm file')).toThrow(/Dangerous/)
  })

  it('blocks rm inside pipelines and chains', () => {
    expect(() => assertSafeCommand('ls && rm -rf x')).toThrow(/Dangerous/)
    expect(() => assertSafeCommand('echo hi; rm x')).toThrow(/Dangerous/)
    expect(() => assertSafeCommand('cat a | rm')).toThrow(/Dangerous/)
  })

  it('blocks find -delete and git clean', () => {
    expect(() => assertSafeCommand('find . -delete')).toThrow(/Dangerous/)
    expect(() => assertSafeCommand('git clean -fd')).toThrow(/Dangerous/)
  })

  it('blocks sudo / chmod / dd', () => {
    expect(() => assertSafeCommand('sudo ls')).toThrow(/Dangerous/)
    expect(() => assertSafeCommand('chmod 777 a')).toThrow(/Dangerous/)
    expect(() => assertSafeCommand('dd if=/dev/zero of=x')).toThrow(/Dangerous/)
  })

  it('does not false-positive on names containing blocked substrings', () => {
    expect(() => assertSafeCommand('echo arm')).not.toThrow()
    expect(() => assertSafeCommand('npm run build')).not.toThrow()
  })

  it('rejects empty command', () => {
    expect(() => assertSafeCommand('  ')).toThrow(/required/)
  })
})

describe('execTool', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'exec-tool-'))
    await fs.writeFile(path.join(tmpDir, 'a.txt'), 'hello', 'utf8')
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('runs a safe command and returns stdout', async () => {
    const result = await execTool('ls', { cwd: tmpDir })
    expect(result).toMatch(/exit_code: 0/)
    expect(result).toMatch(/a\.txt/)
  })

  it('returns non-zero exit code without throwing for failed safe commands', async () => {
    const result = await execTool('ls missing-dir-xyz', { cwd: tmpDir })
    expect(result).toMatch(/exit_code: [^0]/)
  })

  it('refuses dangerous commands before executing', async () => {
    await expect(execTool('rm -rf a.txt', { cwd: tmpDir })).rejects.toThrow(
      /Dangerous/,
    )
    await expect(
      fs.readFile(path.join(tmpDir, 'a.txt'), 'utf8'),
    ).resolves.toBe('hello')
  })
})
