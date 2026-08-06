import { TavilySearch } from '@langchain/tavily'
import { getTavilyApiKey } from '../config'

export type WebSearchTopic = 'general' | 'news' | 'finance'

export type WebSearchOptions = {
  maxResults?: number
  topic?: WebSearchTopic
  tavilyApiKey?: string
  /** 注入假搜索器，便于单测不打真实网络 */
  searcher?: {
    invoke: (input: { query: string }) => Promise<unknown>
  }
}

/**
 * 使用 Tavily Search API 做网页搜索。
 * API Key 默认读取 `~/.zjmTalk/zjmTalk.json` 的 `env.TAVILY_API_KEY`。
 */
export async function webSearchTool(
  query: string,
  options: WebSearchOptions = {},
): Promise<string> {
  if (!query || !query.trim()) {
    throw new Error('query is required')
  }

  const apiKey = options.tavilyApiKey ?? getTavilyApiKey()
  if (!options.searcher && !apiKey) {
    return (
      'TAVILY_API_KEY is not set. ' +
      'Please add env.TAVILY_API_KEY to ~/.zjmTalk/zjmTalk.json and retry.'
    )
  }

  const searcher =
    options.searcher ??
    new TavilySearch({
      maxResults: options.maxResults ?? 3,
      topic: options.topic ?? 'general',
      tavilyApiKey: apiKey,
    })

  try {
    const result = await searcher.invoke({ query })
    if (typeof result === 'string') {
      return result
    }
    // ToolMessage 或对象：尽量抽出可读内容
    const content = (result as { content?: unknown })?.content
    if (typeof content === 'string') {
      return content
    }
    return JSON.stringify(result, null, 2)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return `Web search failed: ${message}`
  }
}
