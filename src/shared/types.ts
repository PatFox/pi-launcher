/**
 * Types shared by the launcher's main process, preload bridge and renderer.
 *
 * An account is an OMP profile the launcher manages: `default` (the plain
 * `~/.omp` tree) or a named profile under `~/.omp/profiles/<name>`. Each
 * account opens its own Pi Desktop instance with its own data folder.
 */

/** The OMP profile name for the default profile. */
export const DEFAULT_PROFILE = 'default'

export interface Account {
  /** Stable id; the OMP profile name (`default` for the default profile). */
  id: string
  /** OMP profile this account runs under: `default` or a named profile. */
  ompProfile: string
  /** Label shown in the launcher and the Pi Desktop window title. */
  label: string
  /** Accent colour, `#rrggbb`. */
  color: string
}

export interface PiDesktopCommand {
  /**
   * Executable to start: a packaged Pi Desktop exe, or Electron for a dev
   * checkout. Empty means the installed Pi Desktop.
   */
  command: string
  /** Arguments, e.g. the dev checkout folder for Electron. */
  args: string[]
  /** Working directory; empty means the command's own folder. */
  cwd: string
}

export interface LauncherConfig {
  version: 1
  accounts: Account[]
  piDesktop: PiDesktopCommand
  /** Path of `omp` (`omp.exe`); empty means "find it on PATH". */
  ompPath: string
  /** Reopen the accounts that were open when the launcher last closed. */
  reopenOnStart: boolean
  /** Account ids open when the launcher last closed. */
  lastOpen: string[]
}

/** One OAuth account inside an OMP profile, as `omp usage accounts --json` reports it. */
export interface OmpAccountIdentity {
  provider: string
  /** OMP's identity key, e.g. `email:a@b.com|org:<uuid>`; never a token. */
  identityKey: string
  email?: string
  orgName?: string
}

export interface ProfileInfo {
  /** `default` or a named profile. */
  name: string
  /** Accounts signed in under the profile; empty when none. */
  accounts: OmpAccountIdentity[]
  /** Why the accounts could not be read, if they could not. */
  error?: string
}

export type InstanceState = 'stopped' | 'starting' | 'running' | 'stopping' | 'exited'

export interface InstanceStatus {
  accountId: string
  state: InstanceState
  pid?: number
  /** Exit code of the last run, when it exited by itself. */
  exitCode?: number | null
  /** Why the last start failed, if it did. */
  error?: string
}

export interface LauncherState {
  config: LauncherConfig
  /** Folder holding launcher.json and the instances' data folders. */
  root: string
  /** The omp executable in use, or null when none was found. */
  ompExecutable: string | null
  /** The Pi Desktop executable an Open starts, or null when none was found. */
  piDesktopExecutable: string | null
  instances: InstanceStatus[]
}

export const IPC = {
  GET_STATE: 'launcher:get-state',
  LIST_PROFILES: 'launcher:list-profiles',
  ADD_ACCOUNT: 'launcher:add-account',
  UPDATE_ACCOUNT: 'launcher:update-account',
  REMOVE_ACCOUNT: 'launcher:remove-account',
  RENAME_PROFILE: 'launcher:rename-profile',
  SIGN_IN: 'launcher:sign-in',
  SIGN_OUT: 'launcher:sign-out',
  OPEN: 'launcher:open',
  STOP: 'launcher:stop',
  RESTART: 'launcher:restart',
  UPDATE_SETTINGS: 'launcher:update-settings',
  EVENT_STATE: 'launcher:event-state',
} as const

export interface AccountUpdate {
  label?: string
  color?: string
}

export interface SettingsUpdate {
  piDesktop?: PiDesktopCommand
  ompPath?: string
  reopenOnStart?: boolean
}

/** The API the preload bridge exposes to the renderer as `window.launcher`. */
export interface LauncherApi {
  getState(): Promise<LauncherState>
  listProfiles(): Promise<ProfileInfo[]>
  addAccount(ompProfile: string): Promise<LauncherState>
  updateAccount(accountId: string, update: AccountUpdate): Promise<LauncherState>
  removeAccount(accountId: string): Promise<LauncherState>
  /** Rename the account's OMP profile (named profiles only; its window must be closed). */
  renameProfile(accountId: string, newName: string): Promise<LauncherState>
  signIn(ompProfile: string): Promise<void>
  signOut(ompProfile: string): Promise<void>
  open(accountId: string): Promise<void>
  stop(accountId: string): Promise<void>
  restart(accountId: string): Promise<void>
  updateSettings(update: SettingsUpdate): Promise<LauncherState>
  onState(listener: (state: LauncherState) => void): () => void
}
