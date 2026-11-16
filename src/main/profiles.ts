import { execFile } from 'child_process'
import { existsSync, readdirSync, statSync } from 'fs'
import { delimiter, join } from 'path'
import { promisify } from 'util'
import { isValidNamedProfile } from '../shared/profile-name'
import { DEFAULT_PROFILE, type OmpAccountIdentity, type ProfileInfo } from '../shared/types'

const execFileAsync = promisify(execFile)

/** How long `omp usage accounts` may take for one profile. */
const USAGE_TIMEOUT_MS = 30_000
const OMP_EXECUTABLE_NAMES = process.platform === 'win32' ? ['omp.exe'] : ['omp']

export function homeDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.USERPROFILE ?? env.HOME ?? ''
}

/**
 * The OMP profiles on this computer: `default` first, then every directory
 * under `~/.omp/profiles` whose name OMP accepts, sorted.
 */
export function listProfileNames(home: string): string[] {
  let named: string[] = []
  try {
    named = readdirSync(join(home, '.omp', 'profiles'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && isValidNamedProfile(entry.name))
      .map((entry) => entry.name)
      .sort()
  } catch {
    // No profiles directory yet: only the default profile exists.
  }
  return [DEFAULT_PROFILE, ...named]
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

/**
 * The omp executable: the configured path when it exists, else the first
 * `omp` on PATH. Only real executables are used, never a script shim, so it
 * can be started without a shell.
 */
export function findOmp(configured: string, env: NodeJS.ProcessEnv = process.env): string | null {
  if (configured) return isFile(configured) ? configured : null
  const pathValue = env.Path ?? env.PATH ?? ''
  for (const dir of pathValue.split(delimiter)) {
    const trimmed = dir.trim().replace(/^"(.*)"$/, '$1')
    // A relative PATH entry would resolve against the working directory.
    if (!trimmed || !/^(?:[a-zA-Z]:[\\/]|[\\/])/.test(trimmed)) continue
    for (const name of OMP_EXECUTABLE_NAMES) {
      const candidate = join(trimmed, name)
      if (existsSync(candidate) && isFile(candidate)) return candidate
    }
  }
  return null
}

function emailFromIdentityKey(identityKey: string): string | undefined {
  const match = /(?:^|\|)email:([^|]+)/.exec(identityKey)
  return match ? match[1] : undefined
}

/** The accounts in `omp usage accounts --json` output; malformed rows are skipped. */
export function parseUsageAccounts(output: string): OmpAccountIdentity[] {
  const start = output.indexOf('{')
  if (start < 0) return []
  const parsed: unknown = JSON.parse(output.slice(start))
  const rows = parsed && typeof parsed === 'object' ? (parsed as { accounts?: unknown }).accounts : undefined
  if (!Array.isArray(rows)) return []
  return rows.flatMap((row): OmpAccountIdentity[] => {
    if (!row || typeof row !== 'object') return []
    const value = row as Record<string, unknown>
    if (typeof value.provider !== 'string' || typeof value.identityKey !== 'string') return []
    const email = emailFromIdentityKey(value.identityKey)
    return [{
      provider: value.provider,
      identityKey: value.identityKey,
      ...(email ? { email } : {}),
      ...(typeof value.orgName === 'string' && value.orgName ? { orgName: value.orgName } : {}),
    }]
  })
}

/** The accounts signed in under one profile. */
export async function readProfileAccounts(omp: string, profile: string): Promise<ProfileInfo> {
  try {
    const { stdout } = await execFileAsync(omp, ['--profile', profile, 'usage', 'accounts', '--json'], {
      timeout: USAGE_TIMEOUT_MS,
      windowsHide: true,
    })
    return { name: profile, accounts: parseUsageAccounts(stdout) }
  } catch (err) {
    const message = err instanceof Error ? err.message.split('\n')[0] : String(err)
    return { name: profile, accounts: [], error: message }
  }
}

/** Every profile on this computer, with its accounts (read in parallel). */
export async function listProfiles(home: string, omp: string | null): Promise<ProfileInfo[]> {
  const names = listProfileNames(home)
  if (!omp) return names.map((name) => ({ name, accounts: [], error: 'omp was not found' }))
  return Promise.all(names.map((name) => readProfileAccounts(omp, name)))
}
