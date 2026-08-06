import {
  agentTool,
  isSubagentRunning,
  resetSubagentLock,
  type AgentRunner,
} from './agent_tool'
import { agent_tool, subagentTools, tools } from './index'

describe('agentTool', () => {
  afterEach(() => {
    resetSubagentLock()
  })

  it('requires a non-empty prompt', async () => {
    await expect(agentTool('')).rejects.toThrow(/prompt is required/i)
    await expect(agentTool('   ')).rejects.toThrow(/prompt is required/i)
  })

  it('calls shared runner with variant=sub and only the prompt text', async () => {
    const calls: Array<{ message: string; opts: Record<string, unknown> }> = []
    const runner: AgentRunner = async (message, opts) => {
      calls.push({ message, opts: opts as Record<string, unknown> })
      return { text: 'subagent answer' }
    }

    const out = await agentTool('Do the independent task', {
      runner,
      threadId: 'subagent-test-1',
    })

    expect(out).toBe('subagent answer')
    expect(calls).toHaveLength(1)
    expect(calls[0].message).toBe('Do the independent task')
    expect(calls[0].opts.variant).toBe('sub')
    expect(calls[0].opts.threadId).toBe('subagent-test-1')
    expect(calls[0].opts).not.toHaveProperty('messages')
    expect(isSubagentRunning()).toBe(false)
  })

  it('returns a placeholder when subagent text is empty', async () => {
    const runner: AgentRunner = async () => ({ text: '   ' })
    await expect(
      agentTool('x', { runner, threadId: 'sub-empty' }),
    ).resolves.toBe('(subagent finished with empty response)')
  })

  it('allows only one subagent at a time', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let started!: () => void
    const startedGate = new Promise<void>((resolve) => {
      started = resolve
    })

    const runner: AgentRunner = async () => {
      started()
      await gate
      return { text: 'done' }
    }

    const first = agentTool('first', { runner, threadId: 'sub-a' })
    await startedGate
    expect(isSubagentRunning()).toBe(true)

    await expect(
      agentTool('second', {
        runner: async () => ({ text: 'should not run' }),
        threadId: 'sub-b',
      }),
    ).rejects.toThrow(/only one subagent/i)

    release()
    await expect(first).resolves.toBe('done')
    expect(isSubagentRunning()).toBe(false)
  })

  it('releases the lock if the runner throws', async () => {
    const runner: AgentRunner = async () => {
      throw new Error('boom')
    }
    await expect(
      agentTool('fail', { runner, threadId: 'sub-fail' }),
    ).rejects.toThrow(/boom/)
    expect(isSubagentRunning()).toBe(false)
  })
})

describe('agent_tool registry', () => {
  it('registers agent_tool with exec permission', () => {
    expect(agent_tool.name).toBe('agent_tool')
    expect(agent_tool.permission_level).toBe('exec')
    expect(agent_tool.description).toMatch(/subagent/i)
  })

  it('includes agent_tool only on main tools list', () => {
    expect(tools.some((t) => t.name === 'agent_tool')).toBe(true)
    expect(subagentTools.some((t) => t.name === 'agent_tool')).toBe(false)
    expect(tools.length).toBe(subagentTools.length + 1)
  })

  it('invokes through LangChain wrapper with mocked runner path', async () => {
    // Use impl-level mock via replacing behavior is hard on bound tool;
    // ensure schema accepts prompt and empty prompt is rejected by Zod/impl.
    await expect(agent_tool.invoke({ prompt: '' })).rejects.toThrow()
  })
})
