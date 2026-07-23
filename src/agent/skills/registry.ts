import { promises as fs } from 'fs'
import * as fsSync from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import { style } from '../ui/style'

export type SkillMeta = {
  /** SKILL.md frontmatter 中的 name */
  name: string
  /** SKILL.md frontmatter 中的 description */
  description: string
  /** skill 所在目录绝对路径 */
  dir: string
  /** SKILL.md 绝对路径 */
  skillFile: string
}

const SKILL_FILE_CANDIDATES = ['SKILL.md', 'skill.md']

/** 向上查找带 package.json 的项目根目录 */
function findProjectRoot(start: string = __dirname): string {
  let dir = start
  while (true) {
    if (fsSync.existsSync(path.join(dir, 'package.json'))) {
      return dir
    }
    const parent = path.dirname(dir)
    if (parent === dir) {
      return start
    }
    dir = parent
  }
}

/**
 * 默认 skills 根目录：始终指向源码树 src/agent/skills
 * （兼容 ts-node 开发与 dist 编译后运行）
 */
export function defaultSkillsRoot(): string {
  return path.join(findProjectRoot(), 'src/agent/skills')
}

/**
 * 解析 SKILL.md YAML frontmatter 中的 name / description。
 * 使用 js-yaml 完整解析，支持多行字符串（>、| 等 YAML 语法）。
 */
export function parseSkillFrontmatter(content: string): {
  name?: string
  description?: string
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return {}

  try {
    const frontmatter = yaml.load(match[1]) as Record<string, any>
    const name = typeof frontmatter?.name === 'string' ? frontmatter.name.trim() : undefined
    const description = typeof frontmatter?.description === 'string' ? frontmatter.description.trim() : undefined
    return { name, description }
  } catch {
    return {}
  }
}

function resolveSkillFile(dir: string): string | null {
  for (const file of SKILL_FILE_CANDIDATES) {
    const full = path.join(dir, file)
    if (fsSync.existsSync(full) && fsSync.statSync(full).isFile()) {
      return full
    }
  }
  return null
}

/**
 * 遍历 skills 根目录下的子文件夹，收集 name + description。
 * 启动时调用一次即可；目录不存在则返回空数组。
 */
export function discoverSkills(skillsRoot: string = defaultSkillsRoot()): SkillMeta[] {
  if (!fsSync.existsSync(skillsRoot) || !fsSync.statSync(skillsRoot).isDirectory()) {
    return []
  }

  const entries = fsSync.readdirSync(skillsRoot, { withFileTypes: true })
  const skills: SkillMeta[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    // 跳过非 skill 实现目录（如 registry 同级的辅助文件所在处——当前无）
    if (entry.name.startsWith('.')) continue

    const dir = path.join(skillsRoot, entry.name)
    const skillFile = resolveSkillFile(dir)
    if (!skillFile) continue

    const content = fsSync.readFileSync(skillFile, 'utf8')
    const { name, description } = parseSkillFrontmatter(content)
    if (!name || !description) continue

    skills.push({ name, description, dir, skillFile })
  }

  skills.sort((a, b) => a.name.localeCompare(b.name))
  return skills
}

/** 格式化成系统提示片段，供每次 LLM 请求携带 */
export function formatSkillsCatalog(skills: SkillMeta[]): string {
  if (skills.length === 0) {
    return 'No skills are currently available.'
  }

  const lines = skills.map(
    (s, i) => `${i + 1}. name: ${s.name}\n   description: ${s.description}`,
  )

  return lines.join('\n')
}

/**
 * 按 name 加载某一个 skill 的完整 SKILL.md 内容（每次只加载一个）。
 */
export async function loadSkillContent(
  skillName: string,
  skills: SkillMeta[] = discoverSkills(),
): Promise<string> {
  if (!skillName || !skillName.trim()) {
    return 'Load skill failed: skill name is required'
  }

  const target = skillName.trim()
  const skill = skills.find((s) => s.name === target)
  if (!skill) {
    const available = skills.map((s) => s.name).join(', ') || '(none)'
    return `Load skill failed: unknown skill "${target}". Available: ${available}`
  }

  console.log(style.skill(`\n[Skill] loading: ${skill.name}`))
  return fs.readFile(skill.skillFile, 'utf8')
}
