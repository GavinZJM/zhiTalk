import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'
import { findNodeBinary, runJsTool } from './run_js_tool'

describe('findNodeBinary', () => {
  it('finds a node binary on this machine', async () => {
    const bin = await findNodeBinary()
    expect(bin).toBeTruthy()
    expect(bin).toMatch(/node/i)
  })
})

describe('runJsTool', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'run-js-tool-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('executes simple JS and returns stdout', async () => {
    const result = await runJsTool(`console.log('hello-from-run-js')`, {
      tmpDir,
      nodeBinary: process.execPath,
    })
    expect(result).toMatch(/exit_code: 0/)
    expect(result).toMatch(/hello-from-run-js/)
  })

  it('returns stderr / non-zero exit when code throws', async () => {
    const result = await runJsTool(`throw new Error('boom')`, {
      tmpDir,
      nodeBinary: process.execPath,
    })
    expect(result).toMatch(/exit_code: [^0]/)
    expect(result).toMatch(/boom/)
  })

  it('tells the AI when Node.js is not installed', async () => {
    const result = await runJsTool(`console.log(1)`, {
      tmpDir,
      nodeBinary: null,
    })
    expect(result).toMatch(/Node\.js is not installed/i)
    expect(result).toMatch(/nodejs\.org/i)
  })

  it('rejects empty code', async () => {
    await expect(runJsTool('  ', { tmpDir })).rejects.toThrow(/required/)
  })

  it('cleans up the temp script file', async () => {
    await runJsTool(`console.log('cleanup')`, {
      tmpDir,
      nodeBinary: process.execPath,
    })
    const files = await fs.readdir(tmpDir)
    expect(files.filter((f) => f.startsWith('zhitalk-run-js-'))).toHaveLength(0)
  })
})
