import * as path from 'path'
import {
  expandPathPlaceholders,
  isDangerousPath,
  normalizePathForCompare,
  resolveFilePath,
} from './is-dangerous-path'

describe('isDangerousPath', () => {
  const unixHome = '/Users/alice'
  const winHome = 'C:\\Users\\alice'
  const winEnv = {
    USERPROFILE: winHome,
    HOME: winHome,
    APPDATA: path.join(winHome, 'AppData', 'Roaming'),
    LOCALAPPDATA: path.join(winHome, 'AppData', 'Local'),
    HOMEDRIVE: 'C:',
    HOMEPATH: '\\Users\\alice',
  }

  describe('darwin', () => {
    const opts = {
      platform: 'darwin' as const,
      homedir: unixHome,
      env: { HOME: unixHome, USERPROFILE: unixHome },
      cwd: '/Users/alice/project',
    }

    it('flags ~/.ssh via tilde, relative, and absolute forms', () => {
      expect(isDangerousPath('~/.ssh/id_rsa', opts)).toBe(true)
      expect(isDangerousPath('/Users/alice/.ssh/id_rsa', opts)).toBe(true)
      expect(isDangerousPath('.ssh/config', opts)).toBe(true)
      expect(isDangerousPath('../.ssh/id_ed25519', opts)).toBe(true)
    })

    it('flags Keychains and allows normal project files', () => {
      expect(
        isDangerousPath('~/Library/Keychains/login.keychain-db', opts),
      ).toBe(true)
      expect(isDangerousPath('./src/index.ts', opts)).toBe(false)
      expect(isDangerousPath('/Users/alice/project/readme.md', opts)).toBe(
        false,
      )
    })

    it('flags common secret filenames anywhere', () => {
      expect(isDangerousPath('/Users/alice/project/.env', opts)).toBe(true)
      expect(isDangerousPath('/tmp/app/.env.local', opts)).toBe(true)
      expect(isDangerousPath('/tmp/certs/server.pem', opts)).toBe(true)
    })
  })

  describe('linux', () => {
    const opts = {
      platform: 'linux' as const,
      homedir: '/home/alice',
      env: { HOME: '/home/alice' },
      cwd: '/home/alice/app',
    }

    it('flags /etc/shadow and ~/.gnupg', () => {
      expect(isDangerousPath('/etc/shadow', opts)).toBe(true)
      expect(isDangerousPath('~/.gnupg/private-keys-v1.d', opts)).toBe(true)
      expect(isDangerousPath('/home/alice/.aws/credentials', opts)).toBe(true)
    })

    it('does not flag ordinary paths', () => {
      expect(isDangerousPath('/home/alice/app/src/main.ts', opts)).toBe(false)
      expect(isDangerousPath('/etc/hosts', opts)).toBe(false)
    })
  })

  describe('win32', () => {
    const opts = {
      platform: 'win32' as const,
      homedir: winHome,
      env: winEnv,
      cwd: path.join(winHome, 'project'),
    }

    it('expands %USERPROFILE% / %APPDATA% / %LOCALAPPDATA%', () => {
      expect(
        isDangerousPath('%USERPROFILE%\\.ssh\\id_rsa', opts),
      ).toBe(true)
      expect(
        isDangerousPath('%APPDATA%\\Microsoft\\Credentials\\x', opts),
      ).toBe(true)
      expect(
        isDangerousPath(
          '%LOCALAPPDATA%\\Google\\Chrome\\User Data\\Default\\Cookies',
          opts,
        ),
      ).toBe(true)
    })

    it('is case-insensitive on Windows', () => {
      expect(
        isDangerousPath('C:\\Users\\Alice\\.SSH\\id_rsa', opts),
      ).toBe(true)
      expect(
        isDangerousPath('c:/users/alice/.ssh/config', opts),
      ).toBe(true)
    })

    it('allows normal project files', () => {
      expect(
        isDangerousPath('%USERPROFILE%\\project\\src\\app.ts', opts),
      ).toBe(false)
    })
  })

  describe('helpers', () => {
    it('expandPathPlaceholders handles ~ and env vars', () => {
      expect(
        expandPathPlaceholders('~/Documents', {
          platform: 'darwin',
          env: { HOME: unixHome },
          homedir: unixHome,
        }),
      ).toBe(path.join(unixHome, 'Documents'))

      expect(
        normalizePathForCompare(
          expandPathPlaceholders('%APPDATA%\\Microsoft', {
            platform: 'win32',
            env: winEnv,
            homedir: winHome,
          }),
          'win32',
        ),
      ).toBe(
        normalizePathForCompare(
          path.join(winEnv.APPDATA, 'Microsoft'),
          'win32',
        ),
      )
    })

    it('resolveFilePath resolves relative paths against cwd', () => {
      const resolved = resolveFilePath('../.ssh/id_rsa', {
        platform: 'linux',
        env: { HOME: '/home/alice' },
        homedir: '/home/alice',
        cwd: '/home/alice/project',
      })
      expect(resolved).toBe('/home/alice/.ssh/id_rsa')
    })
  })
})
