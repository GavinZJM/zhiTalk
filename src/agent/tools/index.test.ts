import {
  agent_tool,
  exec_tool,
  load_skill_tool,
  read_file_tool,
  run_js_tool,
  run_py_tool,
  subagentTools,
  tools,
  web_fetch_tool,
  web_search_tool,
  write_file_tool,
} from './index'
import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'

describe('tools registry', () => {
  it('registers read_file_tool with name and description', () => {
    expect(read_file_tool.name).toBe('read_file')
    expect(read_file_tool.description).toMatch(/absolute and relative/i)
  })

  it('registers write_file_tool with name and description', () => {
    expect(write_file_tool.name).toBe('write_file')
    expect(write_file_tool.description).toMatch(/create|overwrite/i)
  })

  it('registers exec_tool with name and description', () => {
    expect(exec_tool.name).toBe('exec')
    expect(exec_tool.description).toMatch(/shell|command/i)
  })

  it('registers run_js_tool with name and description', () => {
    expect(run_js_tool.name).toBe('run_js')
    expect(run_js_tool.description).toMatch(/javascript|node\.js/i)
  })

  it('registers run_py_tool with name and description', () => {
    expect(run_py_tool.name).toBe('run_py')
    expect(run_py_tool.description).toMatch(/python/i)
  })

  it('registers web_search_tool with name and description', () => {
    expect(web_search_tool.name).toBe('web_search')
    expect(web_search_tool.description).toMatch(/tavily|web/i)
  })

  it('registers web_fetch_tool with name and description', () => {
    expect(web_fetch_tool.name).toBe('web_fetch')
    expect(web_fetch_tool.description).toMatch(/fetch|url|webpage/i)
  })

  it('registers load_skill_tool with name and description', () => {
    expect(load_skill_tool.name).toBe('load_skill')
    expect(load_skill_tool.description).toMatch(/skill/i)
  })

  it('exposes tools list for the agent', () => {
    expect(tools.map((t) => t.name)).toEqual([
      'exec',
      'run_js',
      'run_py',
      'web_search',
      'web_fetch',
      'read_file',
      'write_file',
      'load_skill',
      'memory_create',
      'memory_retrieve',
      'memory_delete',
      'profile_update',
      'list_mcp_resources',
      'read_mcp_resource',
      'agent_tool',
    ])
    expect(subagentTools.map((t) => t.name)).not.toContain('agent_tool')
    expect(tools).toContain(agent_tool)
  })

  it('invokes read_file_tool with relative and absolute paths', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'read-file-idx-'))
    const prevCwd = process.cwd()
    try {
      await fs.writeFile(path.join(tmpDir, 'note.txt'), 'from index', 'utf8')
      process.chdir(tmpDir)
      await expect(
        read_file_tool.invoke({ file_path: 'note.txt' }),
      ).resolves.toBe('from index')
      await expect(
        read_file_tool.invoke({
          file_path: path.join(tmpDir, 'note.txt'),
        }),
      ).resolves.toBe('from index')
    } finally {
      process.chdir(prevCwd)
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })

  it('invokes write_file_tool via schema-bound wrapper', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'write-file-idx-'))
    const prevCwd = process.cwd()
    try {
      process.chdir(tmpDir)
      const result = await write_file_tool.invoke({
        file_path: 'out.txt',
        content: 'written by tool',
      })
      expect(result).toMatch(/Successfully wrote/)
      await expect(
        fs.readFile(path.join(tmpDir, 'out.txt'), 'utf8'),
      ).resolves.toBe('written by tool')
    } finally {
      process.chdir(prevCwd)
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })

  it('invokes exec_tool via schema-bound wrapper', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'exec-idx-'))
    const prevCwd = process.cwd()
    try {
      process.chdir(tmpDir)
      await fs.writeFile(path.join(tmpDir, 'x.txt'), 'x', 'utf8')
      const result = await exec_tool.invoke({ command: 'ls' })
      expect(result).toMatch(/exit_code: 0/)
      expect(result).toMatch(/x\.txt/)
      await expect(
        exec_tool.invoke({ command: 'rm -rf x.txt' }),
      ).rejects.toThrow(/Dangerous/)
    } finally {
      process.chdir(prevCwd)
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })

  it('invokes run_js_tool via schema-bound wrapper', async () => {
    const result = await run_js_tool.invoke({
      code: 'console.log(1 + 2)',
    })
    // Strip ANSI so colored stdout (hidden in Jest diffs) still matches.
    const plain = String(result).replace(/\u001b\[[0-9;]*m/g, '')
    expect(plain).toMatch(/exit_code: 0/)
    expect(plain).toMatch(/stdout:\s*3\b/)
  })

  it('invokes run_py_tool via schema-bound wrapper', async () => {
    const result = await run_py_tool.invoke({
      code: 'print(1 + 2)',
    })
    const plain = String(result).replace(/\u001b\[[0-9;]*m/g, '')
    expect(plain).toMatch(/exit_code: 0/)
    expect(plain).toMatch(/stdout:\s*3\b/)
  })

  it('web_search_tool is invokable', () => {
    expect(typeof web_search_tool.invoke).toBe('function')
  })

  it('invokes web_fetch_tool via schema-bound wrapper', async () => {
    const result = await web_fetch_tool.invoke({ url: 'not-a-url' })
    expect(result).toMatch(/Web fetch failed/)
  })

  it('invokes load_skill_tool for planner', async () => {
    const result = await load_skill_tool.invoke({ skill_name: 'planner' })
    expect(result).toMatch(/name: planner/)
    expect(result).toMatch(/# Planner/)
  })
})
