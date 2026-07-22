import { discoverSkills, loadSkillContent, type SkillMeta } from '../skills/registry'

export type LoadSkillOptions = {
  /** 注入已发现的 skills（便于单测） */
  skills?: SkillMeta[]
}

/**
 * 加载某一个 skill 的完整 SKILL.md 内容。
 * 每次只能加载一个；加载时会打印 skill 名称。
 */
export async function loadSkillTool(
  skillName: string,
  options: LoadSkillOptions = {},
): Promise<string> {
  const skills = options.skills ?? discoverSkills()
  return loadSkillContent(skillName, skills)
}
