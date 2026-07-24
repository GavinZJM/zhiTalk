import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'
import { ToolMessage } from '@langchain/core/messages'
import {
  maybeSpillToolMessage,
  spillLargeToolOutput,
  toolOutputContentLength,
} from './spill_tool_output'

describe('spill_tool_output', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'spill-tool-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('keeps small output inline', async () => {
    const result = await spillLargeToolOutput('hello world', {
      toolName: 'exec',
      toolCallId: 'c1',
    }, { maxChars: 100, outputDir: tmpDir })

    expect(result.spilled).toBe(false)
    expect(result.content).toBe('hello world')
    expect(result.filePath).toBeUndefined()
  })

  it('spills large output to a local file and returns path hint', async () => {
    const big = 'x'.repeat(500)
    const result = await spillLargeToolOutput(big, {
      toolName: 'web_fetch',
      toolCallId: 'call_abc',
    }, {
      maxChars: 100,
      outputDir: tmpDir,
      now: new Date('2026-07-18T08:00:00.000Z'),
    })

    expect(result.spilled).toBe(true)
    expect(result.filePath).toBeTruthy()
    expect(result.content).toContain('tool output too large')
    expect(result.content).toContain(result.filePath!)
    expect(result.content).toContain('Read in chunks')

    const saved = await fs.readFile(result.filePath!, 'utf8')
    expect(saved).toBe(big)
  })

  it('rewrites ToolMessage content when oversized', async () => {
    const msg = new ToolMessage({
      content: 'y'.repeat(5_000),
      tool_call_id: 'tc1',
      name: 'run_py',
    })

    const out = await maybeSpillToolMessage(msg, {
      maxChars: 50,
      outputDir: tmpDir,
    })

    expect(ToolMessage.isInstance(out)).toBe(true)
    const toolMsg = out as ToolMessage
    expect(toolMsg.tool_call_id).toBe('tc1')
    expect(toolMsg.name).toBe('run_py')
    expect(String(toolMsg.content)).toContain('Saved to:')
    expect(String(toolMsg.content).length).toBeLessThan(String(msg.content).length)
  })

  it('leaves non-ToolMessage values unchanged', async () => {
    const value = { foo: 1 }
    await expect(maybeSpillToolMessage(value)).resolves.toBe(value)
  })

  it('measures string content length', () => {
    expect(toolOutputContentLength('abc')).toBe(3)
  })
})
