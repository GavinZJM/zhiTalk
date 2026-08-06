export type WebFetchOptions = {
  /** 注入 fetch，便于单测不打真实网络 */
  fetchImpl?: typeof fetch
  timeoutMs?: number
  /** 返回正文最大字符数，避免撑爆模型上下文 */
  maxChars?: number
}

/**
 * 根据 URL 拉取网络资源（网页 HTML / 文本等）。
 * 失败时返回错误信息字符串给 AI，不抛崩 agent。
 */
export async function webFetchTool(
  url: string,
  options: WebFetchOptions = {},
): Promise<string> {
  if (!url || !url.trim()) {
    return 'Web fetch failed: url is required'
  }

  let parsed: URL
  try {
    parsed = new URL(url.trim())
  } catch {
    return `Web fetch failed: invalid URL: ${url}`
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return `Web fetch failed: only http/https URLs are allowed (got ${parsed.protocol})`
  }

  const timeoutMs = options.timeoutMs ?? 20_000
  const maxChars = options.maxChars ?? 50_000
  const fetchImpl = options.fetchImpl ?? globalThis.fetch

  if (typeof fetchImpl !== 'function') {
    return 'Web fetch failed: fetch is not available in this runtime'
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchImpl(parsed.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'zjmTalk-web-fetch/1.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7',
      },
    })

    const contentType = response.headers.get('content-type') ?? ''
    const body = await response.text()
    const truncated = body.length > maxChars
    const content = truncated
      ? `${body.slice(0, maxChars)}\n\n...[truncated, showing first ${maxChars} of ${body.length} chars]`
      : body

    if (!response.ok) {
      return [
        `Web fetch failed: HTTP ${response.status} ${response.statusText}`,
        `url: ${parsed.toString()}`,
        contentType ? `content-type: ${contentType}` : '',
        content ? `body:\n${content}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    }

    return [
      `status: ${response.status}`,
      `url: ${parsed.toString()}`,
      contentType ? `content-type: ${contentType}` : '',
      `content:\n${content}`,
    ]
      .filter(Boolean)
      .join('\n')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/aborted|AbortError/i.test(message)) {
      return `Web fetch failed: timed out after ${timeoutMs}ms for ${parsed.toString()}`
    }
    return `Web fetch failed: ${message}`
  } finally {
    clearTimeout(timer)
  }
}
