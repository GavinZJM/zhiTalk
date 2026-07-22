import { webSearchTool } from './web_search_tool'

describe('webSearchTool', () => {
  it('rejects empty query', async () => {
    await expect(webSearchTool('  ')).rejects.toThrow(/required/)
  })

  it('returns a hint when TAVILY_API_KEY is missing', async () => {
    const prev = process.env.TAVILY_API_KEY
    delete process.env.TAVILY_API_KEY
    try {
      const result = await webSearchTool('langchain tavily')
      expect(result).toMatch(/TAVILY_API_KEY is not set/i)
    } finally {
      if (prev === undefined) {
        delete process.env.TAVILY_API_KEY
      } else {
        process.env.TAVILY_API_KEY = prev
      }
    }
  })

  it('invokes the searcher and returns string content', async () => {
    const searcher = {
      invoke: jest.fn().mockResolvedValue(
        JSON.stringify({
          query: 'euro 2024 host',
          results: [{ title: 'Wikipedia', url: 'https://example.com', content: 'Germany' }],
        }),
      ),
    }

    const result = await webSearchTool('euro 2024 host', { searcher })
    expect(searcher.invoke).toHaveBeenCalledWith({ query: 'euro 2024 host' })
    expect(result).toMatch(/Germany/)
    expect(result).toMatch(/Wikipedia/)
  })

  it('returns ToolMessage.content when searcher yields a message-like object', async () => {
    const searcher = {
      invoke: jest.fn().mockResolvedValue({
        content: '{"results":[{"title":"A","content":"alpha"}]}',
      }),
    }

    await expect(webSearchTool('alpha', { searcher })).resolves.toMatch(/alpha/)
  })

  it('returns a readable error when searcher throws', async () => {
    const searcher = {
      invoke: jest.fn().mockRejectedValue(new Error('rate limited')),
    }

    await expect(webSearchTool('q', { searcher })).resolves.toMatch(
      /Web search failed: rate limited/,
    )
  })
})
