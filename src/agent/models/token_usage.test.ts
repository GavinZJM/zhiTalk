import {
  buildTokenUsageSnapshot,
  extractUsageFromMessage,
  formatContextWarning,
  formatTokenUsageLine,
  shouldWarnContextUsage,
} from './token_usage'
import {
  clearModelContextLimitCache,
  getModelContextLimit,
} from './context_limit'

describe('extractUsageFromMessage', () => {
  it('reads usage_metadata', () => {
    expect(
      extractUsageFromMessage({
        usage_metadata: {
          input_tokens: 100,
          output_tokens: 20,
          total_tokens: 120,
        },
      }),
    ).toEqual({
      inputTokens: 100,
      outputTokens: 20,
      totalTokens: 120,
    })
  })

  it('returns null when missing', () => {
    expect(extractUsageFromMessage({})).toBeNull()
    expect(extractUsageFromMessage(null)).toBeNull()
  })
})

describe('formatTokenUsageLine', () => {
  it('formats ratio as percent', () => {
    const snap = buildTokenUsageSnapshot(
      { inputTokens: 1000, outputTokens: 234, totalTokens: 1234 },
      262_144,
      'kimi-k2.6',
    )
    expect(formatTokenUsageLine(snap)).toBe(
      'Context 1,234 / 262,144 (0.47%) · kimi-k2.6',
    )
  })
})

describe('context warning threshold', () => {
  it('warns at >= 80%', () => {
    const warn = buildTokenUsageSnapshot(
      { inputTokens: 80, outputTokens: 0, totalTokens: 80 },
      100,
      'kimi-k2.6',
    )
    const ok = buildTokenUsageSnapshot(
      { inputTokens: 79, outputTokens: 0, totalTokens: 79 },
      100,
      'kimi-k2.6',
    )
    expect(shouldWarnContextUsage(warn)).toBe(true)
    expect(shouldWarnContextUsage(ok)).toBe(false)
    expect(formatContextWarning()).toMatch(/压缩 Context/)
    expect(formatContextWarning()).toMatch(/checkpointer/)
  })
})

describe('getModelContextLimit', () => {
  afterEach(() => {
    clearModelContextLimitCache()
  })

  it('reads context_length from /v1/models', async () => {
    const fetchImpl = jest.fn(async () => {
      return {
        ok: true,
        json: async () => ({
          data: [{ id: 'kimi-k2.6', context_length: 262144 }],
        }),
      } as Response
    })

    const limit = await getModelContextLimit('kimi-k2.6', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: 'test-key',
      baseUrl: 'https://api.example/v1',
    })
    expect(limit).toBe(262144)
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example/v1/models',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
        }),
      }),
    )
  })

  it('falls back when API fails', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error('network')
    })
    await expect(
      getModelContextLimit('kimi-k2.6', {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        apiKey: 'test-key',
      }),
    ).resolves.toBe(262_144)
  })

  it('uses cache within TTL', async () => {
    const fetchImpl = jest.fn(async () => {
      return {
        ok: true,
        json: async () => ({
          data: [{ id: 'kimi-k2.6', context_length: 111 }],
        }),
      } as Response
    })
    const opts = {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: 'k',
      baseUrl: 'https://api.example/v1',
      now: 1_000,
    }
    await expect(getModelContextLimit('kimi-k2.6', opts)).resolves.toBe(111)
    await expect(
      getModelContextLimit('kimi-k2.6', { ...opts, now: 1_000 + 60_000 }),
    ).resolves.toBe(111)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
