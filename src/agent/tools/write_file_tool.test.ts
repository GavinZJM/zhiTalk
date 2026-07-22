import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'
import { writeFileTool } from './write_file_tool'

describe('writeFileTool', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'write-file-tool-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('creates a new file with content', async () => {
    const result = await writeFileTool('hello.txt', 'hello world', tmpDir)
    expect(result).toMatch(/Successfully wrote/)
    await expect(
      fs.readFile(path.join(tmpDir, 'hello.txt'), 'utf8'),
    ).resolves.toBe('hello world')
  })

  it('overwrites an existing file', async () => {
    const target = path.join(tmpDir, 'note.txt')
    await fs.writeFile(target, 'old', 'utf8')
    await writeFileTool('note.txt', 'new content', tmpDir)
    await expect(fs.readFile(target, 'utf8')).resolves.toBe('new content')
  })

  it('creates nested directories as needed', async () => {
    await writeFileTool('a/b/c.txt', 'nested', tmpDir)
    await expect(
      fs.readFile(path.join(tmpDir, 'a', 'b', 'c.txt'), 'utf8'),
    ).resolves.toBe('nested')
  })

  it('writes via absolute path', async () => {
    const abs = path.join(tmpDir, 'abs.txt')
    await writeFileTool(abs, 'absolute', tmpDir)
    await expect(fs.readFile(abs, 'utf8')).resolves.toBe('absolute')
  })

  it('allows empty string content', async () => {
    await writeFileTool('empty.txt', '', tmpDir)
    await expect(
      fs.readFile(path.join(tmpDir, 'empty.txt'), 'utf8'),
    ).resolves.toBe('')
  })

  it('throws when file_path is empty', async () => {
    await expect(writeFileTool('  ', 'x', tmpDir)).rejects.toThrow(/required/)
  })
})
