import { promises as fs } from 'fs'
import * as path from 'path'

/**
 * 读取本地文件内容；支持相对路径（相对 baseDir / cwd）与任意绝对路径。
 */
export async function readFileTool(
  filePath: string,
  baseDir: string = process.cwd(),
): Promise<string> {
  if (!filePath || !filePath.trim()) {
    throw new Error('file_path is required')
  }

  const resolved = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(baseDir, filePath)

  try {
    return await fs.readFile(resolved, 'utf8')
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      throw new Error(`File not found: ${filePath}`)
    }
    if (code === 'EISDIR') {
      throw new Error(`Not a file: ${filePath}`)
    }
    throw err
  }
}
