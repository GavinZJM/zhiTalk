import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'
import { readFileTool } from './read_file_tool'

describe('readFileTool', () => {
  let tmpDir: string
  let outsideDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'read-file-tool-'))
    outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'read-file-outside-'))
    await fs.writeFile(path.join(tmpDir, 'hello.txt'), 'hello world', 'utf8')
    await fs.mkdir(path.join(tmpDir, 'sub'))
    await fs.writeFile(path.join(tmpDir, 'sub', 'nested.txt'), 'nested', 'utf8')
    await fs.writeFile(
      path.join(outsideDir, 'secret.txt'),
      'outside content',
      'utf8',
    )
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
    await fs.rm(outsideDir, { recursive: true, force: true })
  })

  it('reads a file relative to baseDir', async () => {
    await expect(readFileTool('hello.txt', tmpDir)).resolves.toBe('hello world')
  })

  it('reads a nested relative file', async () => {
    await expect(readFileTool('sub/nested.txt', tmpDir)).resolves.toBe('nested')
  })

  it('reads via parent-relative path', async () => {
    const subDir = path.join(tmpDir, 'sub')
    await expect(readFileTool('../hello.txt', subDir)).resolves.toBe(
      'hello world',
    )
  })

  it('reads an absolute path anywhere on the system', async () => {
    const abs = path.join(outsideDir, 'secret.txt')
    await expect(readFileTool(abs, tmpDir)).resolves.toBe('outside content')
  })

  it('throws when file does not exist', async () => {
    await expect(readFileTool('missing.txt', tmpDir)).rejects.toThrow(
      /File not found/,
    )
  })

  it('throws when path is a directory', async () => {
    await expect(readFileTool('sub', tmpDir)).rejects.toThrow(/Not a file/)
  })

  it('throws when file_path is empty', async () => {
    await expect(readFileTool('  ', tmpDir)).rejects.toThrow(/required/)
  })
})
