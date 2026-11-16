import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { isValidProfile } from '../shared/profile-name'
import { DEFAULT_PROFILE, type Account, type LauncherConfig, type PiDesktopCommand } from '../shared/types'

/**
 * The launcher's own settings: `<root>\launcher.json`. The root also holds
 * each account's Pi Desktop data folder (`<root>\instances\<id>`).
 */

export const CONFIG_FILE_NAME = 'launcher.json'
export const INSTANCES_DIR_NAME = 'instances'
/** Environment variable that moves the launcher's root folder. */
export const ROOT_ENV_VAR = 'PI_LAUNCHER_ROOT'
/** Folder name of the root under the user's app data folder, when PI_LAUNCHER_ROOT is not set. */
export const DEFAULT_ROOT_NAME = 'Pi Launcher'
/** Executable name of a packaged Pi Desktop on Windows. */
export const PI_DESKTOP_EXE = 'Pi Desktop.exe'

export const MAX_LABEL_LENGTH = 40
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/
export const ACCOUNT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'] as const

/** An empty command means the installed Pi Desktop (see resolvePiDesktopCommand). */
export function defaultPiDesktopCommand(): PiDesktopCommand {
  return { command: '', args: [], cwd: '' }
}

export function defaultConfig(): LauncherConfig {
  return { version: 1, accounts: [], piDesktop: defaultPiDesktopCommand(), ompPath: '', reopenOnStart: false, lastOpen: [] }
}

/**
 * Where Pi Desktop's Windows installer puts it: for the current user under
 * %LOCALAPPDATA%\Programs, or for all users under %ProgramFiles%, in a folder
 * named after the product.
 */
export function installedPiDesktopCandidates(env: NodeJS.ProcessEnv = process.env): string[] {
  const roots = [env.LOCALAPPDATA ? join(env.LOCALAPPDATA, 'Programs') : '', env.ProgramFiles ?? '']
  return roots.filter(Boolean).map((root) => join(root, 'Pi Desktop', PI_DESKTOP_EXE))
}

/**
 * The command that starts Pi Desktop: the configured one, or else the
 * installed Pi Desktop; null when there is neither.
 */
export function resolvePiDesktopCommand(
  configured: PiDesktopCommand,
  env: NodeJS.ProcessEnv = process.env,
  exists: (path: string) => boolean = existsSync,
): PiDesktopCommand | null {
  if (configured.command) return configured
  const installed = installedPiDesktopCandidates(env).find((candidate) => exists(candidate))
  return installed ? { ...configured, command: installed } : null
}

/** The launcher's root folder: PI_LAUNCHER_ROOT, else "Pi Launcher" in the user's app data folder. */
export function resolveRoot(appDataDir: string, env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env[ROOT_ENV_VAR]?.trim()
  return fromEnv ? fromEnv : join(appDataDir, DEFAULT_ROOT_NAME)
}

/** The data folder of one account's Pi Desktop instance. */
export function instanceDataDir(root: string, accountId: string): string {
  return join(root, INSTANCES_DIR_NAME, accountId)
}

export function isValidColor(value: unknown): value is string {
  return typeof value === 'string' && COLOR_PATTERN.test(value)
}

export function cleanLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null
  // eslint-disable-next-line no-control-regex
  const label = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, MAX_LABEL_LENGTH).trim()
  return label || null
}

/** The colour for the n-th account. */
export function accountColor(index: number): string {
  return ACCOUNT_COLORS[index % ACCOUNT_COLORS.length]
}

/** The label an account gets by default: its profile name, capitalised. */
export function defaultLabel(ompProfile: string): string {
  return ompProfile === DEFAULT_PROFILE ? 'Default' : ompProfile.charAt(0).toUpperCase() + ompProfile.slice(1)
}

/** A new account for an OMP profile, with a readable default label. */
export function newAccount(ompProfile: string, index: number): Account {
  return { id: ompProfile, ompProfile, label: defaultLabel(ompProfile), color: accountColor(index) }
}

/**
 * The config after account `oldId`'s profile was renamed to `newProfile`: the
 * account takes the new profile (and id, which is the profile), keeps its
 * colour and position, and keeps a label the user chose; a label still at its
 * default follows the new name.
 */
export function renameAccount(config: LauncherConfig, oldId: string, newProfile: string): LauncherConfig {
  return {
    ...config,
    accounts: config.accounts.map((account) => {
      if (account.id !== oldId) return account
      const label = account.label === defaultLabel(account.ompProfile) ? defaultLabel(newProfile) : account.label
      return { ...account, id: newProfile, ompProfile: newProfile, label }
    }),
    lastOpen: config.lastOpen.map((id) => (id === oldId ? newProfile : id)),
  }
}

function normalizeAccount(raw: unknown): Account | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  if (typeof value.ompProfile !== 'string' || !isValidProfile(value.ompProfile)) return null
  const label = cleanLabel(value.label) ?? value.ompProfile
  const color = isValidColor(value.color) ? value.color : accountColor(0)
  // The id is the profile: one account per profile, one data folder per account.
  return { id: value.ompProfile, ompProfile: value.ompProfile, label, color }
}

function normalizeCommand(raw: unknown): PiDesktopCommand {
  const fallback = defaultPiDesktopCommand()
  if (!raw || typeof raw !== 'object') return fallback
  const value = raw as Record<string, unknown>
  if (typeof value.command !== 'string') return fallback
  const args = Array.isArray(value.args) ? value.args.filter((arg): arg is string => typeof arg === 'string') : []
  return { command: value.command.trim(), args, cwd: typeof value.cwd === 'string' ? value.cwd.trim() : '' }
}

/** A config from stored JSON; anything malformed falls back to its default. */
export function normalizeConfig(raw: unknown): LauncherConfig {
  const base = defaultConfig()
  if (!raw || typeof raw !== 'object') return base
  const value = raw as Record<string, unknown>
  const seen = new Set<string>()
  const accounts = (Array.isArray(value.accounts) ? value.accounts : [])
    .map(normalizeAccount)
    .filter((account): account is Account => {
      if (!account || seen.has(account.id)) return false
      seen.add(account.id)
      return true
    })
  const lastOpen = Array.isArray(value.lastOpen)
    ? value.lastOpen.filter((id): id is string => typeof id === 'string' && seen.has(id))
    : []
  return {
    version: 1,
    accounts,
    piDesktop: normalizeCommand(value.piDesktop),
    ompPath: typeof value.ompPath === 'string' ? value.ompPath.trim() : '',
    reopenOnStart: value.reopenOnStart === true,
    lastOpen,
  }
}

export function configPath(root: string): string {
  return join(root, CONFIG_FILE_NAME)
}

/** The stored config, or null when there is none yet (first run). */
export function loadConfig(root: string): LauncherConfig | null {
  const path = configPath(root)
  if (!existsSync(path)) return null
  try {
    return normalizeConfig(JSON.parse(readFileSync(path, 'utf-8')))
  } catch {
    // A broken file starts over with defaults; it is kept as .bak on the next save.
    return defaultConfig()
  }
}

export function saveConfig(root: string, config: LauncherConfig): void {
  const path = configPath(root)
  mkdirSync(dirname(path), { recursive: true })
  if (existsSync(path)) {
    try {
      JSON.parse(readFileSync(path, 'utf-8'))
    } catch {
      renameSync(path, `${path}.bak`)
    }
  }
  const temporaryPath = `${path}.tmp-${process.pid}`
  writeFileSync(temporaryPath, JSON.stringify(config, null, 2) + '\n', 'utf-8')
  renameSync(temporaryPath, path)
}
