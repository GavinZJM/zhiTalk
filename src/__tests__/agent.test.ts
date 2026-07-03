import { agent, runAgentStream } from '../agent/agent';

describe('agent', () => {
  it('exports agent and runAgentStream', () => {
    expect(agent).toBeDefined();
    expect(typeof runAgentStream).toBe('function');
  });
});
