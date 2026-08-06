import { promises as fs } from 'fs'
import * as path from 'path'
import { getProfileMdPath } from '../prompt'

export type ProfileUpdateOptions = {
  /** 覆盖默认 `~/.zjmTalk/.data/profile.md`（便于单测） */
  profilePath?: string
}

/**
 * 若模型把整段包在 <profile_info> 里，去掉外壳，避免写入后 prompt 双重包裹。
 */
export function normalizeProfileContent(content: string): string {
  const trimmed = content.trim()
  const matched = trimmed.match(
    /^<profile_info>\s*([\s\S]*?)\s*<\/profile_info>$/i,
  )
  return (matched ? matched[1] : trimmed).trim()
}

function makeBackupFileName(now: Date = new Date()): string {
  const dt = now.toISOString().replace(/[:.]/g, '-')
  const random = Math.random().toString(36).slice(2, 10)
  return `profile.${dt}-${random}.md`
}

/**
 * 全量更新用户 profile：写入 `~/.zjmTalk/.data/profile.md`。
 * 若原文件存在，先备份为同目录下 `profile.<dt-random>.md`。
 */
export async function profileUpdateTool(
  content: string,
  options: ProfileUpdateOptions = {},
): Promise<string> {
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('content is required')
  }

  const body = normalizeProfileContent(content)
  if (!body) {
    throw new Error('content is required')
  }

  const profilePath = options.profilePath ?? getProfileMdPath()
  const dir = path.dirname(profilePath)
  await fs.mkdir(dir, { recursive: true })

  let backupPath: string | undefined
  try {
    await fs.access(profilePath)
    backupPath = path.join(dir, makeBackupFileName())
    await fs.copyFile(profilePath, backupPath)
  } catch {
    // 文件不存在：无需备份
  }

  await fs.writeFile(profilePath, `${body}\n`, 'utf8')

  const bytes = Buffer.byteLength(`${body}\n`, 'utf8')
  const lines = [
    `Profile updated (${bytes} bytes) → ${profilePath}`,
  ]
  if (backupPath) {
    lines.push(`Backup saved → ${backupPath}`)
  } else {
    lines.push('No previous profile.md (created new file).')
  }
  return lines.join('\n')
}
