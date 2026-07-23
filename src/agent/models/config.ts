/** Moonshot / Kimi API 相关配置（与 ChatOpenAI 共用） */
export const MOONSHOT_BASE_URL =
  process.env.MOONSHOT_BASE_URL || 'https://api.moonshot.cn/v1'

/** 当前使用的模型 id；切换模型时改这里即可 */
export const MODEL_ID = process.env.ZHITALK_MODEL || 'kimi-k2.6'

export function getMoonshotBaseUrl(): string {
  return MOONSHOT_BASE_URL
}

export function getMoonshotApiKey(): string | undefined {
  return process.env.MOONSHOT_API_KEY
}

export function getModelId(): string {
  return MODEL_ID
}
