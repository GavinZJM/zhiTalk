/**
 * 模型配置访问层（基于 `~/.zjmTalk/zjmTalk.json`）。
 * 文件读写与路径解析见 `../config`。
 */
import {
  clearZjmTalkConfigCache,
  getModelConfig,
  getZjmTalkConfigPath,
  getZjmTalkDir,
  loadZjmTalkConfig,
  type ZjmTalkModelConfig,
} from '../config'

export type { ZjmTalkModelConfig }
export {
  clearZjmTalkConfigCache,
  getZjmTalkConfigPath,
  getZjmTalkDir,
  loadZjmTalkConfig,
}

/** @deprecated 使用 clearZjmTalkConfigCache */
export function clearModelConfigCache(): void {
  clearZjmTalkConfigCache()
}

/** 读取并返回 model 段（校验逻辑在 loadZjmTalkConfig） */
export function loadModelConfig(
  configPath?: string,
): ZjmTalkModelConfig {
  return getModelConfig(configPath)
}

export function getModelId(): string {
  return getModelConfig().model
}

export function getModelApiKey(): string {
  return getModelConfig().apiKey
}

export function getModelBaseUrl(): string {
  return getModelConfig().baseURL
}

/** @deprecated 使用 getModelBaseUrl */
export function getMoonshotBaseUrl(): string {
  return getModelBaseUrl()
}

/** @deprecated 使用 getModelApiKey */
export function getMoonshotApiKey(): string {
  return getModelApiKey()
}
