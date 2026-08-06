import {
  agent_tool,
  getToolPermissionLevel,
  tools,
  exec_tool,
  run_js_tool,
  run_py_tool,
  web_search_tool,
  web_fetch_tool,
  read_file_tool,
  write_file_tool,
  load_skill_tool,
  memory_create_tool,
  memory_retrieve_tool,
  memory_delete_tool,
  profile_update_tool,
} from './index'

describe('tool permission_level', () => {
  const expected: Record<string, string> = {
    read_file: 'read',
    write_file: 'write',
    exec: 'exec',
    run_js: 'exec',
    run_py: 'exec',
    web_search: 'network',
    web_fetch: 'network',
    load_skill: 'read',
    memory_create: 'db',
    memory_retrieve: 'db',
    memory_delete: 'db',
    profile_update: 'write',
    agent_tool: 'exec',
    list_mcp_resources: 'network',
    read_mcp_resource: 'network',
  }

  it('assigns permission_level on every registered tool', () => {
    for (const t of tools) {
      expect(expected[t.name]).toBeDefined()
      expect(t.permission_level).toBe(expected[t.name])
      expect(getToolPermissionLevel(t)).toBe(expected[t.name])
      expect(t.metadata?.permission_level).toBe(expected[t.name])
    }
  })

  it('covers the full expected map', () => {
    const names = new Set(tools.map((t) => t.name))
    expect([...names].sort()).toEqual(Object.keys(expected).sort())
  })

  it('exposes permission_level on named exports', () => {
    expect(read_file_tool.permission_level).toBe('read')
    expect(write_file_tool.permission_level).toBe('write')
    expect(exec_tool.permission_level).toBe('exec')
    expect(run_js_tool.permission_level).toBe('exec')
    expect(run_py_tool.permission_level).toBe('exec')
    expect(web_search_tool.permission_level).toBe('network')
    expect(web_fetch_tool.permission_level).toBe('network')
    expect(load_skill_tool.permission_level).toBe('read')
    expect(memory_create_tool.permission_level).toBe('db')
    expect(memory_retrieve_tool.permission_level).toBe('db')
    expect(memory_delete_tool.permission_level).toBe('db')
    expect(profile_update_tool.permission_level).toBe('write')
    expect(agent_tool.permission_level).toBe('exec')
    expect(
      tools.find((t) => t.name === 'list_mcp_resources')?.permission_level,
    ).toBe('network')
    expect(
      tools.find((t) => t.name === 'read_mcp_resource')?.permission_level,
    ).toBe('network')
  })
})
