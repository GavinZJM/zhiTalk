import { promises as fs } from 'fs'
import * as path from 'path'
import { ToolMessage } from '@langchain/core/messages'
import { randomUUID } from 'crypto'
import { getZjmTalkDir } from '../config'

/** tool 输出超过该字符数则落盘，messages 里只保留路径提示 */
export const TOOL_OUTPUT_MAX_CHARS = Number(
  process.env.TOOL_OUTPUT_MAX_CHARS || 4_000,
)

/** 大输出落盘目录：`~/.zjmTalk/.tool_output`（跨平台：`os.homedir()`） */
export function getToolOutputDir(): string {
  return path.join(getZjmTalkDir(), '.tool_output')
}

export function toolOutputContentLength(content: unknown): number {
  if (typeof content === 'string') return content.length
  if (content == null) return 0
  try {
    return JSON.stringify(content).length
  } catch {
    return String(content).length
  }
}

export function stringifyToolOutput(content: unknown): string {
  if (typeof content === 'string') return content
  if (content == null) return ''
  try {
    return JSON.stringify(content, null, 2)
  } catch {
    return String(content)
  }
}

export type SpillToolOutputResult = {
  content: string
  spilled: boolean
  filePath?: string
}

/**
 * 若输出过大，写入本地文件，返回给 messages 用的短提示（含绝对路径）。
 */
export async function spillLargeToolOutput(
  rawContent: unknown,
  meta: { toolName?: string; toolCallId?: string },
  options: {
    maxChars?: number
    outputDir?: string
    now?: Date
  } = {},
): Promise<SpillToolOutputResult> {
  const maxChars = options.maxChars ?? TOOL_OUTPUT_MAX_CHARS
  const text = stringifyToolOutput(rawContent)
  if (text.length <= maxChars) {
    return { content: text, spilled: false }
  }

  const dir = options.outputDir ?? getToolOutputDir()
  await fs.mkdir(dir, { recursive: true })

  const stamp = (options.now ?? new Date())
    .toISOString()
    .replace(/[:.]/g, '-')
  const safeName = (meta.toolName || 'tool').replace(/[^\w.-]+/g, '_')
  const id = (meta.toolCallId || randomUUID()).replace(/[^\w.-]+/g, '_').slice(0, 48)
  const filePath = path.join(dir, `${stamp}_${safeName}_${id}.txt`)

  await fs.writeFile(filePath, text, 'utf8')

  const preview = text.slice(0, 200).replace(/\s+/g, ' ')
  const content = [
    `[tool output too large: ${text.length} chars]`,
    `Saved to: ${filePath}`,
    `Preview: ${preview}${text.length > 200 ? '…' : ''}`,
    'Read in chunks via exec/run_js/run_py if needed (e.g. head -c 2000 <path>).',
  ].join('\n')

  // 提示本身可能不短；若并不更省上下文则仍内联
  if (content.length >= text.length) {
    await fs.unlink(filePath).catch(() => undefined)
    return { content: text, spilled: false }
  }

  return { content, spilled: true, filePath }
}

/**
 * 对单条 ToolMessage：过大则落盘并替换 content。
 */
export async function maybeSpillToolMessage(
  message: unknown,
  options?: { maxChars?: number; outputDir?: string },
): Promise<unknown> {
  if (!ToolMessage.isInstance(message)) {
    return message
  }

  const spilled = await spillLargeToolOutput(message.content, {
    toolName: message.name,
    toolCallId: message.tool_call_id,
  }, options)

  if (!spilled.spilled) {
    return message
  }

  return new ToolMessage({
    content: spilled.content,
    tool_call_id: message.tool_call_id,
    name: message.name,
    id: message.id,
    additional_kwargs: message.additional_kwargs,
    response_metadata: message.response_metadata,
  })
}
