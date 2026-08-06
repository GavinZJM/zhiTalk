import { matcherMatches } from './match'

describe('matcherMatches', () => {
  it('empty / undefined / * matches everything', () => {
    expect(matcherMatches(undefined, 'exec')).toBe(true)
    expect(matcherMatches('', 'read_file')).toBe(true)
    expect(matcherMatches('*', 'read_file')).toBe(true)
    expect(matcherMatches('*', 'exec')).toBe(true)
  })

  it('matches tool names containing exec', () => {
    expect(matcherMatches('exec', 'exec')).toBe(true)
    expect(matcherMatches('exec', 'safe_exec')).toBe(true)
    expect(matcherMatches('exec', 'exec_tool')).toBe(true)
    expect(matcherMatches('exec', 'read_file')).toBe(false)
  })

  it('supports anchors and alternation', () => {
    expect(matcherMatches('^exec$', 'exec')).toBe(true)
    expect(matcherMatches('^exec$', 'safe_exec')).toBe(false)
    expect(matcherMatches('read|write', 'read_file')).toBe(true)
  })

  it('invalid regex does not match', () => {
    expect(matcherMatches('[', 'exec')).toBe(false)
  })
})
