import { promises as fs } from 'fs'
import * as path from 'path'

/**
 * 创建或覆盖写入本地文件；支持相对路径（相对 baseDir / cwd）与任意绝对路径。
 * 若父目录不存在会自动创建。
 */
export async function writeFileTool(
  filePath: string,
  content: string,
  baseDir: string = process.cwd(),
): Promise<string> {
  if (!filePath || !filePath.trim()) {
    throw new Error('file_path is required')
  }
  if (typeof content !== 'string') {
    throw new Error('content is required')
  }

  const resolved = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(baseDir, filePath)

  await fs.mkdir(path.dirname(resolved), { recursive: true })
  await fs.writeFile(resolved, content, 'utf8')

  return `Successfully wrote ${Buffer.byteLength(content, 'utf8')} bytes to ${resolved}`
}
