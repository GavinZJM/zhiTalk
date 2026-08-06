import { ChatOpenAI } from '@langchain/openai'
import {
  getModelConfig,
  type ZjmTalkModelConfig,
} from '../config'
import {
  getModelApiKey,
  getModelBaseUrl,
  getModelId,
  loadModelConfig,
} from './config'

export type CreateChatModelOptions = {
  /** 覆盖已加载的 model 配置（便于单测） */
  config?: ZjmTalkModelConfig
  streaming?: boolean
  streamUsage?: boolean
}

/**
 * 根据 `~/.zjmTalk/zjmTalk.json` 的 model 段（或注入的 config）创建 ChatOpenAI。
 * OpenAI 兼容协议；Moonshot / Kimi 等通过 baseURL 对接。
 */
export function createChatModel(
  options: CreateChatModelOptions = {},
): ChatOpenAI {
  const cfg = options.config ?? getModelConfig()
  return new ChatOpenAI({
    model: cfg.model,
    apiKey: cfg.apiKey,
    configuration: {
      baseURL: cfg.baseURL,
    },
    streaming: options.streaming ?? true,
    streamUsage: options.streamUsage ?? true,
  })
}

export { getModelApiKey, getModelBaseUrl, getModelId, loadModelConfig }
export type { ZjmTalkModelConfig }
