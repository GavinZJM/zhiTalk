import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { getSkillRoots, getZjmTalkDir } from '../config'
import {
  discoverSkills,
  formatSkillsCatalog,
  loadSkillContent,
  parseSkillFrontmatter,
} from '../skills/registry'
import { loadSkillTool } from './load_skill_tool'

function writeSkill(
  root: string,
  folder: string,
  name: string,
  description: string,
  body = `# ${name}\n`,
): void {
  const dir = path.join(root, folder)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}`,
    'utf8',
  )
}

describe('parseSkillFrontmatter', () => {
  it('parses name and description', () => {
    const md = `---
name: demo-skill
description: A demo skill for testing.
---

# Demo
`
    expect(parseSkillFrontmatter(md)).toEqual({
      name: 'demo-skill',
      description: 'A demo skill for testing.',
    })
  })

  it('returns empty object when frontmatter is missing', () => {
    expect(parseSkillFrontmatter('# No frontmatter')).toEqual({})
  })
})

describe('getSkillRoots', () => {
  it('includes bundled-skills then ~/.zjmTalk agents/skills', () => {
    const roots = getSkillRoots()
    expect(roots).toHaveLength(3)
    expect(roots[0]).toMatch(/bundled-skills$/)
    expect(fs.existsSync(roots[0])).toBe(true)
    expect(roots[1]).toBe(path.join(getZjmTalkDir(), '.agents', 'skills'))
    expect(roots[2]).toBe(path.join(getZjmTalkDir(), 'skills'))
    expect(getZjmTalkDir()).toBe(path.join(os.homedir(), '.zjmTalk'))
  })

  it('discoverSkills finds built-in planner from bundled-skills', () => {
    const skills = discoverSkills()
    const names = skills.map((s) => s.name)
    expect(names).toContain('planner')
    expect(names).toContain('skill-creator')
  })
})

describe('discoverSkills', () => {
  it('returns empty array when roots are missing (no throw)', () => {
    const missing = path.join(
      os.tmpdir(),
      `zjmTalk-skills-missing-${Date.now()}`,
    )
    expect(discoverSkills(missing)).toEqual([])
    expect(discoverSkills([missing, path.join(missing, 'also')])).toEqual([])
  })

  it('later root overrides earlier root on same skill name', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'zjmTalk-skills-'))
    const agents = path.join(base, '.agents', 'skills')
    const user = path.join(base, 'skills')
    try {
      writeSkill(agents, 'shared', 'shared', 'from agents', '# agents\n')
      writeSkill(user, 'shared', 'shared', 'from user', '# user\n')
      writeSkill(agents, 'only-agents', 'only-agents', 'agents only')

      const skills = discoverSkills([agents, user])
      const byName = Object.fromEntries(skills.map((s) => [s.name, s]))

      expect(byName['shared']?.description).toBe('from user')
      expect(byName['shared']?.dir).toBe(path.join(user, 'shared'))
      expect(byName['only-agents']?.description).toBe('agents only')
      expect(skills.map((s) => s.name).sort()).toEqual([
        'only-agents',
        'shared',
      ])
    } finally {
      fs.rmSync(base, { recursive: true, force: true })
    }
  })

  it('formatSkillsCatalog includes discovered names', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zjmTalk-skills-cat-'))
    try {
      writeSkill(root, 'planner', 'planner', 'Plan tasks.')
      const catalog = formatSkillsCatalog(discoverSkills(root))
      expect(catalog).toMatch(/planner/)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('loadSkillTool', () => {
  let tmpRoot: string

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-test-'))
    writeSkill(
      tmpRoot,
      'hello-skill',
      'hello-skill',
      'Says hello when loaded.',
      '# Hello Skill\n\nDo the hello thing.\n',
    )
  })

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  it('loads the full SKILL.md for a known skill and logs the name', async () => {
    const skills = discoverSkills(tmpRoot)
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})

    const content = await loadSkillTool('hello-skill', { skills })

    expect(content).toMatch(/^---/)
    expect(content).toMatch(/name: hello-skill/)
    expect(content).toMatch(/# Hello Skill/)
    expect(content).toMatch(/Do the hello thing/)
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Skill] loading: hello-skill'),
    )

    logSpy.mockRestore()
  })

  it('returns an error for unknown skill without throwing', async () => {
    const skills = discoverSkills(tmpRoot)
    await expect(loadSkillTool('missing', { skills })).resolves.toMatch(
      /unknown skill "missing"/,
    )
  })

  it('returns an error when skill name is empty', async () => {
    await expect(loadSkillContent('  ', [])).resolves.toMatch(/required/)
  })

  it('only loads one skill content at a time (exact file match)', async () => {
    writeSkill(tmpRoot, 'other-skill', 'other-skill', 'Other.', '# Other\n')

    const skills = discoverSkills(tmpRoot)
    const content = await loadSkillTool('hello-skill', { skills })
    expect(content).toMatch(/Hello Skill/)
    expect(content).not.toMatch(/# Other/)
  })
})
