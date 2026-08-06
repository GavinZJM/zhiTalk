import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { memoryCreateTool } from './memory_create_tool'
import {
  buildFtsMatchQuery,
  memoryRetrieveTool,
} from './memory_retrieve_tool'

describe('buildFtsMatchQuery', () => {
  it('joins keywords with OR and quotes terms', () => {
    expect(buildFtsMatchQuery(['水果', '偏好'])).toBe('"水果" OR "偏好"')
  })

  it('escapes double quotes inside terms', () => {
    expect(buildFtsMatchQuery(['say "hi"'])).toBe('"say ""hi"""')
  })

  it('rejects empty keywords', () => {
    expect(() => buildFtsMatchQuery(['', '  '])).toThrow(/required/)
  })
})

describe('memoryRetrieveTool', () => {
  let tmpDir: string
  let dbPath: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-retrieve-'))
    dbPath = path.join(tmpDir, 'test.db')

    memoryCreateTool(
      {
        type: 'preference',
        content: '用户喜欢吃水果，尤其是苹果和香蕉。',
        keywords: ['水果', '偏好', '苹果'],
        importance: 5,
      },
      { dbPath },
    )
    memoryCreateTool(
      {
        type: 'fact',
        content: '用户的名字叫 Gavin。',
        keywords: ['name', 'Gavin'],
        importance: 4,
      },
      { dbPath },
    )
    memoryCreateTool(
      {
        type: 'preference',
        content: '用户不喜欢吃香菜。',
        keywords: ['偏好', '香菜'],
        importance: 3,
      },
      { dbPath },
    )
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('retrieves memories matching keywords with ranking', () => {
    const out = memoryRetrieveTool(
      { keywords: ['水果', '偏好'], limit: 10 },
      { dbPath },
    )

    expect(out).toMatch(/Found \d+ memor/)
    expect(out).toContain('水果')
    expect(out).toContain('id=')
    expect(out).toContain('score=')
  })

  it('returns not-found message when nothing matches', () => {
    const out = memoryRetrieveTool(
      { keywords: ['量子纠缠飞船'] },
      { dbPath },
    )
    expect(out).toMatch(/No memories matched/)
  })

  it('respects limit', () => {
    const out = memoryRetrieveTool(
      { keywords: ['偏好'], limit: 1 },
      { dbPath },
    )
    const ids = out.match(/^- id=/gm) ?? []
    expect(ids.length).toBe(1)
  })
})
