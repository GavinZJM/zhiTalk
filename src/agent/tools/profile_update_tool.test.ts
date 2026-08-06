import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  normalizeProfileContent,
  profileUpdateTool,
} from './profile_update_tool'

describe('normalizeProfileContent', () => {
  it('strips outer profile_info tags', () => {
    expect(
      normalizeProfileContent('<profile_info>\n姓名：A\n</profile_info>'),
    ).toBe('姓名：A')
  })

  it('keeps plain markdown', () => {
    expect(normalizeProfileContent('昵称：B')).toBe('昵称：B')
  })
})

describe('profileUpdateTool', () => {
  let tmpDir: string
  let profilePath: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'profile-update-'))
    profilePath = path.join(tmpDir, 'profile.md')
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('creates profile.md when missing', async () => {
    const msg = await profileUpdateTool('姓名：Gavin\n地区：上海', {
      profilePath,
    })
    expect(msg).toMatch(/Profile updated/)
    expect(msg).toMatch(/created new file/i)
    await expect(fs.readFile(profilePath, 'utf8')).resolves.toBe(
      '姓名：Gavin\n地区：上海\n',
    )
  })

  it('backs up existing file then overwrites', async () => {
    await fs.writeFile(profilePath, '姓名：旧名\n', 'utf8')
    const msg = await profileUpdateTool('姓名：新名\n兴趣：编程', {
      profilePath,
    })

    expect(msg).toMatch(/Backup saved/)
    await expect(fs.readFile(profilePath, 'utf8')).resolves.toBe(
      '姓名：新名\n兴趣：编程\n',
    )

    const files = await fs.readdir(tmpDir)
    const backups = files.filter(
      (f) => f.startsWith('profile.') && f.endsWith('.md') && f !== 'profile.md',
    )
    expect(backups.length).toBe(1)
    await expect(
      fs.readFile(path.join(tmpDir, backups[0]), 'utf8'),
    ).resolves.toBe('姓名：旧名\n')
  })

  it('rejects empty content', async () => {
    await expect(
      profileUpdateTool('  ', { profilePath }),
    ).rejects.toThrow(/content is required/)
  })
})
