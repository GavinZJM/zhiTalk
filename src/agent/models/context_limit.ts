import { getMoonshotBaseUrl, getMoonshotApiKey } from './config'

export type ModelInfo = {
  id: string
  context_length?: number
}

type ModelsCache = {
  fetchedAt: number
  byId: Map<string, ModelInfo>
}

const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

/** 接口失败时的兜底上限（按已知公开规格） */
const FALLBACK_CONTEXT_LIMITS: Record<string, number> = {
  'kimi-k2.6': 262_144,
  'kimi-k2.5': 262_144,
  'kimi-k2.7-code': 262_144,
  'kimi-k2.7-code-highspeed': 262_144,
  'kimi-k3': 1_048_576,
  'moonshot-v1-8k': 8_192,
  'moonshot-v1-32k': 32_768,
  'moonshot-v1-128k': 131_072,
  'moonshot-v1-auto': 131_072,
}

let cache: ModelsCache | null = null

type FetchModels = (url: string, init?: RequestInit) => Promise<Response>

/**
 * 从 Moonshot `/v1/models` 动态获取模型 context_length，带内存缓存。
 */
export async function getModelContextLimit(
  modelId: string,
  options: {
    fetchImpl?: FetchModels
    apiKey?: string
    baseUrl?: string
    now?: number
    forceRefresh?: boolean
  } = {},
): Promise<number> {
  const id = modelId.trim()
  const now = options.now ?? Date.now()
  const fetchImpl = options.fetchImpl ?? fetch

  if (
    !options.forceRefresh &&
    cache &&
    now - cache.fetchedAt < CACHE_TTL_MS &&
    cache.byId.has(id)
  ) {
    const hit = cache.byId.get(id)!
    if (typeof hit.context_length === 'number' && hit.context_length > 0) {
      return hit.context_length
    }
  }

  try {
    const baseUrl = (options.baseUrl ?? getMoonshotBaseUrl()).replace(/\/$/, '')
    const apiKey = options.apiKey ?? getMoonshotApiKey()
    if (!apiKey) {
      return fallbackLimit(id)
    }

    const res = await fetchImpl(`${baseUrl}/models`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })
    if (!res.ok) {
      return fallbackLimit(id)
    }

    const body = (await res.json()) as { data?: ModelInfo[] }
    const byId = new Map<string, ModelInfo>()
    for (const m of body.data ?? []) {
      if (m?.id) byId.set(m.id, m)
    }
    cache = { fetchedAt: now, byId }

    const found = byId.get(id)
    if (typeof found?.context_length === 'number' && found.context_length > 0) {
      return found.context_length
    }
  } catch {
    // fall through
  }

  return fallbackLimit(id)
}

function fallbackLimit(modelId: string): number {
  return FALLBACK_CONTEXT_LIMITS[modelId] ?? 128_000
}

/** 测试用：清空缓存 */
export function clearModelContextLimitCache(): void {
  cache = null
}
