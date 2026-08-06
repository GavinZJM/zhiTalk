import { promises as fs } from 'fs'
import * as fsSync from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import { getSkillRoots } from '../config'
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

/**
 * 默认 skills 根目录列表（包内置 bundled-skills + ~/.zjmTalk/...）。
 * 顺序：低优先级 → 高优先级；同名后者覆盖前者。
 */
export function defaultSkillRoots(): string[] {
  return getSkillRoots()
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
 * 扫描单个 skills 根目录下的子文件夹。
 * 目录不存在或不是目录 → 空数组（不抛错）。
 */
function discoverSkillsInRoot(skillsRoot: string): SkillMeta[] {
  if (!fsSync.existsSync(skillsRoot)) return []

  let rootStat: fsSync.Stats
  try {
    rootStat = fsSync.statSync(skillsRoot)
  } catch {
    return []
  }
  if (!rootStat.isDirectory()) return []

  let entries: fsSync.Dirent[]
  try {
    entries = fsSync.readdirSync(skillsRoot, { withFileTypes: true })
  } catch {
    return []
  }

  const skills: SkillMeta[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('.')) continue

    const dir = path.join(skillsRoot, entry.name)
    const skillFile = resolveSkillFile(dir)
    if (!skillFile) continue

    let content: string
    try {
      content = fsSync.readFileSync(skillFile, 'utf8')
    } catch {
      continue
    }

    const { name, description } = parseSkillFrontmatter(content)
    if (!name || !description) continue

    skills.push({ name, description, dir, skillFile })
  }

  return skills
}

/**
 * 从多个 skills 根目录收集 skills。
 *
 * @param skillsRoots 省略则用默认：bundled-skills → `~/.zjmTalk/.agents/skills` → `~/.zjmTalk/skills`；
 *   也可传单个路径（测试）或路径数组。按顺序合并，同名后者覆盖前者。
 *   任一目录不存在则跳过，不报错。
 */
export function discoverSkills(
  skillsRoots?: string | string[],
): SkillMeta[] {
  const roots =
    skillsRoots == null
      ? defaultSkillRoots()
      : Array.isArray(skillsRoots)
        ? skillsRoots
        : [skillsRoots]

  const byName = new Map<string, SkillMeta>()
  for (const root of roots) {
    if (!root || !root.trim()) continue
    for (const skill of discoverSkillsInRoot(path.resolve(root))) {
      byName.set(skill.name, skill)
    }
  }

  return Array.from(byName.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  )
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
