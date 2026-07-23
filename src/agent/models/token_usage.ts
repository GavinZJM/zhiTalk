export type TokenUsageSnapshot = {
  /** 当前上下文占用（通常取本轮最后一次 LLM 调用的 total_tokens） */
  contextTokens: number
  /** 模型最大 context 上限 */
  maxTokens: number
  /** contextTokens / maxTokens，0~1 */
  ratio: number
  model: string
  inputTokens?: number
  outputTokens?: number
}

export type StreamUsage = {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

/** Context 占用达到该比例时提示用户开启新会话 */
export const CONTEXT_WARNING_RATIO = 0.8

/** 从 AIMessage / Chunk 上提取 usage_metadata */
export function extractUsageFromMessage(message: unknown): StreamUsage | null {
  if (!message || typeof message !== 'object') return null
  const usage = (message as { usage_metadata?: Record<string, unknown> })
    .usage_metadata
  if (!usage) return null

  const inputTokens = Number(usage.input_tokens ?? 0)
  const outputTokens = Number(usage.output_tokens ?? 0)
  const totalTokens = Number(
    usage.total_tokens ?? inputTokens + outputTokens,
  )
  if (!Number.isFinite(totalTokens) || totalTokens <= 0) return null

  return {
    inputTokens: Number.isFinite(inputTokens) ? inputTokens : 0,
    outputTokens: Number.isFinite(outputTokens) ? outputTokens : 0,
    totalTokens,
  }
}

export function buildTokenUsageSnapshot(
  usage: StreamUsage,
  maxTokens: number,
  model: string,
): TokenUsageSnapshot {
  const contextTokens = usage.totalTokens
  const safeMax = maxTokens > 0 ? maxTokens : 1
  return {
    contextTokens,
    maxTokens: safeMax,
    ratio: Math.min(1, contextTokens / safeMax),
    model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  }
}

/** 控制台展示行，例如：Context 1,234 / 262,144 (0.47%) · kimi-k2.6 */
export function formatTokenUsageLine(stats: TokenUsageSnapshot): string {
  const pctNum = stats.ratio * 100
  const pct = pctNum < 1 ? pctNum.toFixed(2) : pctNum.toFixed(1)
  return (
    `Context ${formatNumber(stats.contextTokens)} / ${formatNumber(stats.maxTokens)}` +
    ` (${pct}%) · ${stats.model}`
  )
}

export function shouldWarnContextUsage(stats: TokenUsageSnapshot): boolean {
  return stats.ratio >= CONTEXT_WARNING_RATIO
}

/** Context 接近上限时的警告文案 */
export function formatContextWarning(): string {
  return [
    '⚠ Context window 接近大模型接口上限，即将压缩 Context，可能会丢失信息。',
    '  建议输入 /new 命令开启新会话。',
  ].join('\n')
}

function formatNumber(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}
