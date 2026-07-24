import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages'
import {
  KEEP_RECENT_MESSAGES,
  buildLlmInput,
  buildModelContext,
  clearCompressionCache,
  compressThreadContext,
  getCompressionCache,
  replaceMessageById,
  sanitizeToolCallPairs,
} from './context'

describe('sanitizeToolCallPairs', () => {
  it('injects placeholder ToolMessage for missing tool_call_id', () => {
    const messages = [
      new HumanMessage({ id: 'h1', content: '读文件' }),
      new AIMessage({
        id: 'a1',
        content: '',
        tool_calls: [
          { id: 'exec:2', name: 'exec', args: { command: 'cat x' } },
        ],
      }),
      new HumanMessage({ id: 'h2', content: '继续' }),
    ]

    const out = sanitizeToolCallPairs(messages)
    expect(out).toHaveLength(4)
    expect(ToolMessage.isInstance(out[2])).toBe(true)
    const tm = out[2] as ToolMessage
    expect(tm.tool_call_id).toBe('exec:2')
    expect(String(tm.content)).toMatch(/missing/i)
    expect(out[3].id).toBe('h2')
  })

  it('keeps complete tool pairs unchanged', () => {
    const messages = [
      new AIMessage({
        id: 'a1',
        content: '',
        tool_calls: [
          { id: 'c1', name: 'exec', args: {} },
          { id: 'c2', name: 'exec', args: {} },
        ],
      }),
      new ToolMessage({ content: 'ok1', tool_call_id: 'c1', name: 'exec' }),
      new ToolMessage({ content: 'ok2', tool_call_id: 'c2', name: 'exec' }),
    ]
    const out = sanitizeToolCallPairs(messages)
    expect(out).toHaveLength(3)
    expect((out[1] as ToolMessage).content).toBe('ok1')
    expect((out[2] as ToolMessage).content).toBe('ok2')
  })

  it('drops orphan ToolMessages', () => {
    const messages = [
      new ToolMessage({ content: 'orphan', tool_call_id: 'x', name: 'exec' }),
      new HumanMessage({ id: 'h', content: 'hi' }),
    ]
    const out = sanitizeToolCallPairs(messages)
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('h')
  })
})

describe('buildModelContext', () => {
  const threadId = 'test-build-ctx'
  const messages = [
    new HumanMessage({ id: '1', content: '第一轮问' }),
    new AIMessage({ id: '2', content: '第一轮答' }),
    new HumanMessage({ id: '3', content: '第二轮问' }),
    new AIMessage({ id: '4', content: '第二轮答' }),
    new HumanMessage({ id: '5', content: '第三轮问' }),
    new AIMessage({ id: '6', content: '第三轮答' }),
  ]

  afterEach(() => {
    clearCompressionCache()
  })

  it('returns full messages when no compression cache', () => {
    const out = buildModelContext(
      { messages, summary: '' },
      { threadId },
    )
    expect(out).toHaveLength(6)
    expect(out.map((m) => m.id)).toEqual(['1', '2', '3', '4', '5', '6'])
  })

  it('uses cache summary + recent messages', async () => {
    await compressThreadContext(threadId, messages, {
      keepRecent: 2,
      summarize: async () => '用户在讨论职业规划',
    })

    const out = buildModelContext(
      { messages, summary: '' },
      { threadId, keepRecent: 2 },
    )
    expect(out).toHaveLength(3)
    expect(String(out[0].content)).toContain('【对话摘要】')
    expect(String(out[0].content)).toContain('职业规划')
    expect(out[1].id).toBe('5')
    expect(out[2].id).toBe('6')
  })

  it('repairs incomplete tool pairs when sending to model', () => {
    const broken = [
      new HumanMessage({ id: '1', content: 'q' }),
      new AIMessage({
        id: '2',
        content: '',
        tool_calls: [{ id: 'exec:2', name: 'exec', args: {} }],
      }),
    ]
    const out = buildModelContext({ messages: broken, summary: '' })
    expect(out).toHaveLength(3)
    expect(ToolMessage.isInstance(out[2])).toBe(true)
    expect((out[2] as ToolMessage).tool_call_id).toBe('exec:2')
  })

  it('buildLlmInput prepends system prompt', () => {
    const out = buildLlmInput('You are helpful.', {
      messages: [new HumanMessage('hi')],
      summary: '',
    })
    expect(out).toHaveLength(2)
    expect(out[0]._getType()).toBe('system')
    expect(out[1].content).toBe('hi')
  })
})

describe('compressThreadContext', () => {
  const threadId = 'test-compress'

  afterEach(() => {
    clearCompressionCache()
  })

  function makeMessages(n: number) {
    const list = []
    for (let i = 1; i <= n; i++) {
      list.push(new HumanMessage({ id: `h${i}`, content: `问${i}` }))
      list.push(new AIMessage({ id: `a${i}`, content: `答${i}` }))
    }
    return list
  }

  it('keeps recent 6 and summarizes older once', async () => {
    const messages = makeMessages(5) // 10 messages
    const summarize = jest.fn(async () => '摘要A')

    const first = await compressThreadContext(threadId, messages, {
      keepRecent: KEEP_RECENT_MESSAGES,
      summarize,
    })
    expect(first.compressed).toBe(true)
    expect(first.newlyCompressedCount).toBe(4) // 10 - 6
    expect(first.compressionCount).toBe(1)
    expect(summarize).toHaveBeenCalledTimes(1)
    expect(getCompressionCache(threadId)?.summary).toBe('摘要A')

    // 再次压缩：旧消息已标记，无新增
    const second = await compressThreadContext(threadId, messages, {
      keepRecent: KEEP_RECENT_MESSAGES,
      summarize,
    })
    expect(second.compressed).toBe(false)
    expect(second.newlyCompressedCount).toBe(0)
    expect(second.compressionCount).toBe(1)
    expect(summarize).toHaveBeenCalledTimes(1)
  })

  it('does not re-compress already compressed when history grows', async () => {
    const summarize = jest.fn(async (_msgs, opts) => {
      return opts?.previousSummary
        ? `${opts.previousSummary}+新`
        : '首轮摘要'
    })

    const round1 = makeMessages(5) // 10 msgs → compress 4
    await compressThreadContext(threadId, round1, {
      keepRecent: 6,
      summarize,
    })
    expect(summarize).toHaveBeenCalledTimes(1)

    const round2 = [
      ...round1,
      new HumanMessage({ id: 'h6', content: '问6' }),
      new AIMessage({ id: 'a6', content: '答6' }),
      new HumanMessage({ id: 'h7', content: '问7' }),
      new AIMessage({ id: 'a7', content: '答7' }),
    ] // 14 msgs → older 8, of which 4 already compressed → 4 new

    const result = await compressThreadContext(threadId, round2, {
      keepRecent: 6,
      summarize,
    })
    expect(result.compressed).toBe(true)
    expect(result.newlyCompressedCount).toBe(4)
    expect(result.compressionCount).toBe(2)
    expect(summarize).toHaveBeenCalledTimes(2)
    expect(getCompressionCache(threadId)?.summary).toBe('首轮摘要+新')
  })

  it('suggests /new when compressionCount >= 3 but still compresses', async () => {
    const summarize = jest.fn(async () => 's')
    let messages = makeMessages(5)

    for (let i = 0; i < 3; i++) {
      // 每轮追加 2 条，让 older 区出现新消息
      messages = [
        ...messages,
        new HumanMessage({ id: `hx${i}`, content: `额外问${i}` }),
        new AIMessage({ id: `ax${i}`, content: `额外答${i}` }),
      ]
      const r = await compressThreadContext(threadId, messages, {
        keepRecent: 6,
        summarize,
      })
      expect(r.compressed).toBe(true)
      expect(r.compressionCount).toBe(i + 1)
      expect(r.suggestNewSession).toBe(i + 1 >= 3)
      if (i + 1 >= 3) {
        expect(r.message).toMatch(/\/new/)
      }
    }
    expect(summarize).toHaveBeenCalledTimes(3)
  })

  it('does not mutate the original messages array', async () => {
    const messages = makeMessages(5)
    const snapshot = messages.map((m) => m.id)
    await compressThreadContext(threadId, messages, {
      summarize: async () => 'x',
    })
    expect(messages.map((m) => m.id)).toEqual(snapshot)
    expect(messages).toHaveLength(10)
  })
})

describe('replaceMessageById', () => {
  it('replaces matching human message content', () => {
    const messages = [
      new HumanMessage({ id: 'a', content: '中文' }),
      new AIMessage({ id: 'b', content: 'ok' }),
    ]
    const next = replaceMessageById(messages, 'a', 'English')
    expect(HumanMessage.isInstance(next[0])).toBe(true)
    expect(next[0].content).toBe('English')
    expect(next[1].content).toBe('ok')
  })
})
