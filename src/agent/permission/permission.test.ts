import { commandChangesWorkingDirectory } from './exec'
import { classifyToolPermission } from './classify'
import { extractToolFilePath, isInProjectDir } from './util'

describe('extractToolFilePath', () => {
  it('reads file_path / filepath / path', () => {
    expect(extractToolFilePath({ file_path: './a.txt' })).toBe('./a.txt')
    expect(extractToolFilePath({ filepath: '/tmp/x' })).toBe('/tmp/x')
    expect(extractToolFilePath({ path: 'b.md' })).toBe('b.md')
    expect(extractToolFilePath({ content: 'nope' })).toBeUndefined()
    expect(extractToolFilePath(null)).toBeUndefined()
  })
})

describe('classifyToolPermission', () => {
  const projectRoot = '/Users/alice/project'
  const base = {
    platform: 'darwin' as const,
    homedir: '/Users/alice',
    env: { HOME: '/Users/alice' },
    cwd: projectRoot,
    projectRoot,
  }

  it('auto when read/write has no filepath', () => {
    expect(
      classifyToolPermission(
        { permission_level: 'read', args: { skill_name: 'x' } },
        base,
      ).action,
    ).toBe('auto')
    expect(
      classifyToolPermission(
        { permission_level: 'write', args: { content: 'profile' } },
        base,
      ).action,
    ).toBe('auto')
  })

  it('read: auto for non-dangerous paths even outside project', () => {
    const inside = classifyToolPermission(
      {
        permission_level: 'read',
        args: { file_path: './src/index.ts' },
      },
      base,
    )
    expect(inside.action).toBe('auto')

    const outside = classifyToolPermission(
      {
        permission_level: 'read',
        args: { file_path: '/Users/alice/Documents/note.txt' },
      },
      base,
    )
    expect(outside.action).toBe('auto')
  })

  it('read/write: block dangerous paths', () => {
    const r = classifyToolPermission(
      {
        permission_level: 'read',
        args: { file_path: '~/.ssh/id_rsa' },
      },
      base,
    )
    expect(r.action).toBe('block')
    expect(r.reason).toMatch(/Access denied/i)
  })

  it('write: auto when outside project but not dangerous', () => {
    const r = classifyToolPermission(
      {
        permission_level: 'write',
        args: { file_path: '/Users/alice/Documents/note.txt' },
      },
      base,
    )
    expect(r.action).toBe('auto')
    expect(r.filepath).toBe('/Users/alice/Documents/note.txt')
  })

  it('write: auto inside project', () => {
    const r = classifyToolPermission(
      {
        permission_level: 'write',
        args: { file_path: 'notes/a.txt' },
      },
      base,
    )
    expect(r.action).toBe('auto')
  })

  it('auto for db tools', () => {
    expect(
      classifyToolPermission(
        { permission_level: 'db', args: { keywords: ['x'] } },
        base,
      ).action,
    ).toBe('auto')
  })

  it('exec: block commands that change working directory', () => {
    const blocked = classifyToolPermission(
      { permission_level: 'exec', args: { command: 'cd /tmp && ls' } },
      base,
    )
    expect(blocked.action).toBe('block')
    expect(blocked.reason).toMatch(/working directory/i)

    expect(
      classifyToolPermission(
        { permission_level: 'exec', args: { command: 'pushd ..' } },
        base,
      ).action,
    ).toBe('block')
  })

  it('exec: auto when command stays in cwd', () => {
    expect(
      classifyToolPermission(
        { permission_level: 'exec', args: { command: 'ls -la' } },
        base,
      ).action,
    ).toBe('auto')
  })
})

describe('commandChangesWorkingDirectory', () => {
  it('detects cd / pushd / popd / Set-Location', () => {
    expect(commandChangesWorkingDirectory('cd /tmp')).toBe(true)
    expect(commandChangesWorkingDirectory('ls; cd ..')).toBe(true)
    expect(commandChangesWorkingDirectory('pushd src')).toBe(true)
    expect(commandChangesWorkingDirectory('popd')).toBe(true)
    expect(commandChangesWorkingDirectory('Set-Location C:\\Temp')).toBe(true)
  })

  it('does not treat path args as directory change', () => {
    expect(commandChangesWorkingDirectory('ls /tmp')).toBe(false)
    expect(commandChangesWorkingDirectory('cat ../README.md')).toBe(false)
    expect(commandChangesWorkingDirectory('echo hello')).toBe(false)
  })
})

describe('isInProjectDir', () => {
  it('detects project membership', () => {
    const opts = {
      platform: 'linux' as const,
      homedir: '/home/alice',
      env: { HOME: '/home/alice' },
      cwd: '/home/alice/app',
      projectRoot: '/home/alice/app',
    }
    expect(isInProjectDir('src/a.ts', opts)).toBe(true)
    expect(isInProjectDir('/home/alice/app', opts)).toBe(true)
    expect(isInProjectDir('/home/alice/other/x', opts)).toBe(false)
  })
})
