import { agent, getAgentGraph, runAgentStream } from '../agent/agent'

describe('agent', () => {
  it('exports agent graph and runAgentStream', () => {
    expect(agent).toBeDefined()
    expect(getAgentGraph('main')).toBeDefined()
    expect(getAgentGraph('sub')).toBeDefined()
    expect(typeof runAgentStream).toBe('function')
  })
})
