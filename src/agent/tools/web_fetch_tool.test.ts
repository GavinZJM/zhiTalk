import { webFetchTool } from './web_fetch_tool'

function mockResponse(opts: {
  status?: number
  statusText?: string
  body: string
  contentType?: string
}): Response {
  return {
    ok: (opts.status ?? 200) >= 200 && (opts.status ?? 200) < 300,
    status: opts.status ?? 200,
    statusText: opts.statusText ?? 'OK',
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'content-type'
          ? (opts.contentType ?? 'text/html')
          : null,
    },
    text: async () => opts.body,
  } as unknown as Response
}

describe('webFetchTool', () => {
  it('rejects empty url with error message (not throw)', async () => {
    await expect(webFetchTool('  ')).resolves.toMatch(/url is required/)
  })

  it('rejects invalid url', async () => {
    await expect(webFetchTool('not a url')).resolves.toMatch(/invalid URL/)
  })

  it('rejects non-http protocols', async () => {
    await expect(webFetchTool('file:///etc/passwd')).resolves.toMatch(
      /only http\/https/,
    )
  })

  it('returns page content on success', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      mockResponse({
        body: '<html><title>MianshiPai</title><body>hello interview</body></html>',
        contentType: 'text/html; charset=utf-8',
      }),
    )

    const result = await webFetchTool('https://www.mianshipai.com/', {
      fetchImpl,
    })

    expect(fetchImpl).toHaveBeenCalled()
    expect(result).toMatch(/status: 200/)
    expect(result).toMatch(/mianshipai\.com/)
    expect(result).toMatch(/hello interview/)
  })

  it('returns HTTP error details without throwing', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      mockResponse({
        status: 404,
        statusText: 'Not Found',
        body: 'missing',
      }),
    )

    const result = await webFetchTool('https://example.com/404', { fetchImpl })
    expect(result).toMatch(/Web fetch failed: HTTP 404/)
    expect(result).toMatch(/missing/)
  })

  it('truncates oversized bodies', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      mockResponse({ body: 'x'.repeat(1000) }),
    )

    const result = await webFetchTool('https://example.com/', {
      fetchImpl,
      maxChars: 50,
    })
    expect(result).toMatch(/truncated/)
    expect(result).toMatch(/first 50/)
  })

  it('returns timeout error when aborted', async () => {
    const fetchImpl = jest.fn().mockImplementation((_url, init) => {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const err = new Error('The operation was aborted')
          err.name = 'AbortError'
          reject(err)
        })
      })
    })

    const result = await webFetchTool('https://example.com/slow', {
      fetchImpl,
      timeoutMs: 20,
    })
    expect(result).toMatch(/timed out/i)
  })

  it('returns network error message when fetch throws', async () => {
    const fetchImpl = jest
      .fn()
      .mockRejectedValue(new Error('getaddrinfo ENOTFOUND'))

    await expect(
      webFetchTool('https://does-not-exist.example/', { fetchImpl }),
    ).resolves.toMatch(/Web fetch failed: getaddrinfo ENOTFOUND/)
  })
})
