import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  discoverSkills,
  formatSkillsCatalog,
  loadSkillContent,
  parseSkillFrontmatter,
} from '../skills/registry'
import { loadSkillTool } from './load_skill_tool'

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

describe('discoverSkills', () => {
  it('discovers built-in planner and programmer-resume skills', () => {
    const skills = discoverSkills()
    const names = skills.map((s) => s.name)
    expect(names).toContain('planner')
    expect(names).toContain('programmer-resume')
    for (const s of skills) {
      expect(s.description.length).toBeGreaterThan(0)
      expect(fs.existsSync(s.skillFile)).toBe(true)
    }
  })

  it('formatSkillsCatalog includes names', () => {
    const catalog = formatSkillsCatalog(discoverSkills())
    expect(catalog).toMatch(/planner/)
    expect(catalog).toMatch(/programmer-resume/)
  })
})

describe('loadSkillTool', () => {
  let tmpRoot: string

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-test-'))
    const dir = path.join(tmpRoot, 'hello-skill')
    fs.mkdirSync(dir)
    fs.writeFileSync(
      path.join(dir, 'SKILL.md'),
      `---
name: hello-skill
description: Says hello when loaded.
---

# Hello Skill

Do the hello thing.
`,
      'utf8',
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
    const other = path.join(tmpRoot, 'other-skill')
    fs.mkdirSync(other)
    fs.writeFileSync(
      path.join(other, 'SKILL.md'),
      `---
name: other-skill
description: Other.
---

# Other
`,
      'utf8',
    )

    const skills = discoverSkills(tmpRoot)
    const content = await loadSkillTool('hello-skill', { skills })
    expect(content).toMatch(/Hello Skill/)
    expect(content).not.toMatch(/# Other/)
  })
})
