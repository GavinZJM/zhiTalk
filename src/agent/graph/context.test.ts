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
  simplifyHistoricalToolMessages,
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

describe('simplifyHistoricalToolMessages', () => {
  function tool(id: string, name: string, content: string) {
    return new ToolMessage({
      id,
      name,
      content,
      tool_call_id: `call_${id}`,
    })
  }

  it('simplifies older tool messages but keeps last 3', () => {
    const messages = [
      new HumanMessage({ id: 'h1', content: '搜索 aaa' }),
      new AIMessage({ id: 'a1', content: '', tool_calls: [{ id: 'call_t1', name: 'web_search', args: {} }] }),
      tool('t1', 'web_search', '一大堆搜索结果 aaa'),
      new AIMessage({ id: 'a2', content: '找到了 aaa' }),
      new HumanMessage({ id: 'h2', content: '写文件' }),
      new AIMessage({ id: 'a3', content: '', tool_calls: [{ id: 'call_t2', name: 'write_file', args: {} }] }),
      tool('t2', 'write_file', 'wrote ok'),
      new AIMessage({ id: 'a4', content: '写好了' }),
      new HumanMessage({ id: 'h3', content: '再搜' }),
      new AIMessage({ id: 'a5', content: '', tool_calls: [{ id: 'call_t3', name: 'web_search', args: {} }] }),
      tool('t3', 'web_search', 'result3'),
      new AIMessage({ id: 'a6', content: '', tool_calls: [{ id: 'call_t4', name: 'exec', args: {} }] }),
      tool('t4', 'exec', 'out4'),
      new AIMessage({ id: 'a7', content: '', tool_calls: [{ id: 'call_t5', name: 'web_fetch', args: {} }] }),
      tool('t5', 'web_fetch', 'out5'),
    ]

    const out = simplifyHistoricalToolMessages(messages, { keepRecentTools: 3 })
    const tools = out.filter((m) => ToolMessage.isInstance(m)) as ToolMessage[]
    expect(tools).toHaveLength(5)
    expect(String(tools[0].content)).toBe('[Previous: used web_search]')
    expect(String(tools[1].content)).toBe('[Previous: used write_file]')
    expect(String(tools[2].content)).toBe('result3')
    expect(String(tools[3].content)).toBe('out4')
    expect(String(tools[4].content)).toBe('out5')

    // 非 ToolMessage 不变
    expect(out[0].content).toBe('搜索 aaa')
    expect(out[3].content).toBe('找到了 aaa')
  })

  it('never simplifies read_file even when old', () => {
    const messages = [
      tool('r1', 'read_file', 'file contents here'),
      tool('t1', 'exec', 'exec out 1'),
      tool('t2', 'exec', 'exec out 2'),
      tool('t3', 'exec', 'exec out 3'),
      tool('t4', 'exec', 'exec out 4'),
    ]
    const out = simplifyHistoricalToolMessages(messages, { keepRecentTools: 3 })
    const tools = out.filter((m) => ToolMessage.isInstance(m)) as ToolMessage[]
    expect(String(tools[0].content)).toBe('file contents here')
    expect(String(tools[1].content)).toBe('[Previous: used exec]')
    expect(String(tools[2].content)).toBe('exec out 2')
    expect(String(tools[3].content)).toBe('exec out 3')
    expect(String(tools[4].content)).toBe('exec out 4')
  })

  it('does not mutate original ToolMessage objects', () => {
    const original = tool('t1', 'web_search', 'big payload')
    const messages = [
      original,
      tool('t2', 'exec', 'a'),
      tool('t3', 'exec', 'b'),
      tool('t4', 'exec', 'c'),
    ]
    simplifyHistoricalToolMessages(messages, { keepRecentTools: 3 })
    expect(original.content).toBe('big payload')
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

  it('simplifies old tool messages in model context without touching originals', () => {
    const history = [
      new AIMessage({
        id: 'a1',
        content: '',
        tool_calls: [{ id: 'c1', name: 'web_search', args: { q: 'aaa' } }],
      }),
      new ToolMessage({
        id: 't1',
        content: 'huge search result',
        tool_call_id: 'c1',
        name: 'web_search',
      }),
      new AIMessage({ id: 'a2', content: 'done1' }),
      new AIMessage({
        id: 'a3',
        content: '',
        tool_calls: [{ id: 'c2', name: 'write_file', args: {} }],
      }),
      new ToolMessage({
        id: 't2',
        content: 'wrote',
        tool_call_id: 'c2',
        name: 'write_file',
      }),
      new AIMessage({
        id: 'a4',
        content: '',
        tool_calls: [{ id: 'c3', name: 'exec', args: {} }],
      }),
      new ToolMessage({
        id: 't3',
        content: 'exec3',
        tool_call_id: 'c3',
        name: 'exec',
      }),
      new AIMessage({
        id: 'a5',
        content: '',
        tool_calls: [{ id: 'c4', name: 'exec', args: {} }],
      }),
      new ToolMessage({
        id: 't4',
        content: 'exec4',
        tool_call_id: 'c4',
        name: 'exec',
      }),
    ]

    const out = buildModelContext({ messages: history, summary: '' })
    const tools = out.filter((m) => ToolMessage.isInstance(m)) as ToolMessage[]
    expect(String(tools[0].content)).toBe('[Previous: used web_search]')
    expect(String(tools[1].content)).toBe('wrote')
    expect(String(tools[2].content)).toBe('exec3')
    expect(String(tools[3].content)).toBe('exec4')
    expect(history[1].content).toBe('huge search result')
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
