import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  buildProfilePrompt,
  getProfileMdPath,
  loadProfileInfo,
  wrapProfileInfo,
} from './prompt'

describe('prompt profile_info', () => {
  let tmpDir: string
  let prevDataDir: string | undefined

  beforeEach(() => {
    prevDataDir = process.env.ZJMTALK_DATA_DIR
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-prompt-'))
    process.env.ZJMTALK_DATA_DIR = tmpDir
  })

  afterEach(() => {
    if (prevDataDir === undefined) delete process.env.ZJMTALK_DATA_DIR
    else process.env.ZJMTALK_DATA_DIR = prevDataDir
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('getProfileMdPath uses ~/.zjmTalk/.data/profile.md', () => {
    delete process.env.ZJMTALK_DATA_DIR
    expect(getProfileMdPath()).toBe(
      path.join(os.homedir(), '.zjmTalk', '.data', 'profile.md'),
    )
  })

  it('wraps empty content as empty profile_info tags', () => {
    expect(wrapProfileInfo('')).toBe('<profile_info></profile_info>')
    expect(wrapProfileInfo('   ')).toBe('<profile_info></profile_info>')
  })

  it('wraps profile markdown in profile_info', () => {
    expect(wrapProfileInfo('姓名：张三')).toBe(
      '<profile_info>\n姓名：张三\n</profile_info>',
    )
  })

  it('buildProfilePrompt uses empty tags when profile.md missing', () => {
    const prompt = buildProfilePrompt()
    expect(prompt).toContain('<profile_template>')
    expect(prompt).toContain('<profile_info></profile_info>')
    expect(loadProfileInfo()).toBe('')
  })

  it('buildProfilePrompt loads ~/.zjmTalk/.data/profile.md content', () => {
    const profilePath = getProfileMdPath()
    fs.mkdirSync(path.dirname(profilePath), { recursive: true })
    fs.writeFileSync(profilePath, '昵称：小明\n地区：上海\n', 'utf8')

    const prompt = buildProfilePrompt()
    expect(prompt).toContain('<profile_info>')
    expect(prompt).toContain('昵称：小明')
    expect(prompt).toContain('地区：上海')
    expect(prompt).toContain('</profile_info>')
    expect(prompt).not.toContain('<profile_info></profile_info>')
  })
})
