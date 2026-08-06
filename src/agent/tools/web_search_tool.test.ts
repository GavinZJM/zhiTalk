import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { clearZjmTalkConfigCache } from '../config'
import { webSearchTool } from './web_search_tool'

function writeTempConfig(body: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zjmTalk-websearch-'))
  const file = path.join(dir, 'zjmTalk.json')
  fs.writeFileSync(file, JSON.stringify(body, null, 2))
  return file
}

describe('webSearchTool', () => {
  const prevConfig = process.env.ZJMTALK_CONFIG

  afterEach(() => {
    clearZjmTalkConfigCache()
    if (prevConfig === undefined) delete process.env.ZJMTALK_CONFIG
    else process.env.ZJMTALK_CONFIG = prevConfig
  })

  it('rejects empty query', async () => {
    await expect(webSearchTool('  ')).rejects.toThrow(/required/)
  })

  it('returns a hint when env.TAVILY_API_KEY is missing', async () => {
    const file = writeTempConfig({
      model: {
        model: 'kimi-k2.6',
        apiKey: 'sk-test',
        baseURL: 'https://api.moonshot.cn/v1',
      },
    })
    process.env.ZJMTALK_CONFIG = file
    clearZjmTalkConfigCache()

    const result = await webSearchTool('langchain tavily')
    expect(result).toMatch(/TAVILY_API_KEY is not set/i)
    expect(result).toMatch(/zjmTalk\.json/i)
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
