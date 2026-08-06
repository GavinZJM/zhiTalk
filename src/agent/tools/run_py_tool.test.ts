import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'
import { findPython3Binary, runPyTool } from './run_py_tool'

describe('findPython3Binary', () => {
  it('finds a python3 binary on this machine', async () => {
    const bin = await findPython3Binary()
    expect(bin).toBeTruthy()
    expect(bin).toMatch(/python/i)
  })
})

describe('runPyTool', () => {
  let tmpDir: string
  let pythonBinary: string

  beforeAll(async () => {
    const bin = await findPython3Binary()
    if (!bin) {
      throw new Error('python3 is required to run run_py_tool unit tests')
    }
    pythonBinary = bin
  })

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'run-py-tool-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('executes simple Python and returns stdout', async () => {
    const result = await runPyTool(`print('hello-from-run-py')`, {
      tmpDir,
      pythonBinary,
    })
    expect(result).toMatch(/exit_code: 0/)
    expect(result).toMatch(/hello-from-run-py/)
  })

  it('returns stderr / non-zero exit when code raises', async () => {
    const result = await runPyTool(`raise RuntimeError('boom')`, {
      tmpDir,
      pythonBinary,
    })
    expect(result).toMatch(/exit_code: [^0]/)
    expect(result).toMatch(/boom/)
  })

  it('tells the AI when Python 3 is not installed', async () => {
    const result = await runPyTool(`print(1)`, {
      tmpDir,
      pythonBinary: null,
    })
    expect(result).toMatch(/Python 3 is not installed/i)
    expect(result).toMatch(/python\.org/i)
  })

  it('rejects empty code', async () => {
    await expect(runPyTool('  ', { tmpDir })).rejects.toThrow(/required/)
  })

  it('cleans up the temp script file', async () => {
    await runPyTool(`print('cleanup')`, {
      tmpDir,
      pythonBinary,
    })
    const files = await fs.readdir(tmpDir)
    expect(files.filter((f) => f.startsWith('zjmTalk-run-py-'))).toHaveLength(0)
  })
})
