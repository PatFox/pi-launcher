import { app, BrowserWindow, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { join } from 'path'
import { isValidNamedProfile, isValidProfile } from '../shared/profile-name'
import {
  DEFAULT_PROFILE,
  IPC,
  type Account,
  type AccountUpdate,
  type LauncherConfig,
  type LauncherState,
  type ProfileInfo,
  type SettingsUpdate,
} from '../shared/types'
import {
  cleanLabel,
  defaultConfig,
  instanceDataDir,
  isValidColor,
  loadConfig,
  newAccount,
  renameAccount,
  resolvePiDesktopCommand,
  resolveRoot,
  saveConfig,
} from './config'
import { renameProfile } from './profile-rename'
import { openOmpConsole } from './console'
import { InstanceManager } from './instances'
import { buildLaunchEnv } from './launch-env'
import { findOmp, homeDir, listProfileNames, listProfiles } from './profiles'

const ROOT = resolveRoot(app.getPath('appData'))
const RENDERER_URL = process.env.ELECTRON_RENDERER_URL

// Keep the launcher's own Chromium data with the rest of its files.
app.setName('Pi Launcher')
app.setPath('userData', join(ROOT, 'app-data'))
if (process.platform === 'win32') app.setAppUserModelId('dev.pi.launcher')

const instances = new InstanceManager()
let config: LauncherConfig = defaultConfig()
let mainWindow: BrowserWindow | null = null

function ompExecutable(): string | null {
  return findOmp(config.ompPath)
}

function state(): LauncherState {
  return {
    config,
    root: ROOT,
    ompExecutable: ompExecutable(),
    piDesktopExecutable: resolvePiDesktopCommand(config.piDesktop)?.command ?? null,
    instances: instances.statuses(),
  }
}

function broadcast(): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(IPC.EVENT_STATE, state())
}

function persist(): void {
  saveConfig(ROOT, config)
  broadcast()
}

/** First run: one account per OMP profile already on this computer. */
function initialConfig(): LauncherConfig {
  const stored = loadConfig(ROOT)
  if (stored) return stored
  const fresh = defaultConfig()
  fresh.accounts = listProfileNames(homeDir()).map((profile, index) => newAccount(profile, index))
  saveConfig(ROOT, fresh)
  return fresh
}

// ─── IPC validation ──────────────────────────────────────────────────────────

/** Only the launcher's own page may call in. */
function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const url = event.senderFrame?.url ?? ''
  const trusted = RENDERER_URL ? url.startsWith(RENDERER_URL) : url.startsWith('file://')
  if (!trusted || event.sender !== mainWindow?.webContents) throw new Error('Untrusted sender')
}

function requireAccount(accountId: unknown): Account {
  const account = typeof accountId === 'string' ? config.accounts.find((item) => item.id === accountId) : undefined
  if (!account) throw new Error('Unknown account')
  return account
}

function requireProfile(profile: unknown): string {
  if (typeof profile !== 'string' || !isValidProfile(profile)) throw new Error('Invalid OMP profile name')
  return profile
}

function requireOmp(): string {
  const omp = ompExecutable()
  if (!omp) throw new Error('omp was not found; set its path in Settings')
  return omp
}

function startRequest(account: Account) {
  const command = resolvePiDesktopCommand(config.piDesktop)
  if (!command) throw new Error('Pi Desktop was not found; install it or set its path in Settings')
  return {
    account,
    command,
    env: buildLaunchEnv(process.env, account, ROOT, ompExecutable()),
    dataDir: instanceDataDir(ROOT, account.id),
  }
}

function registerHandlers(): void {
  ipcMain.handle(IPC.GET_STATE, (event) => {
    assertTrustedSender(event)
    return state()
  })

  ipcMain.handle(IPC.LIST_PROFILES, async (event): Promise<ProfileInfo[]> => {
    assertTrustedSender(event)
    return listProfiles(homeDir(), ompExecutable())
  })

  ipcMain.handle(IPC.ADD_ACCOUNT, (event, profile: unknown) => {
    assertTrustedSender(event)
    const name = requireProfile(profile)
    if (!config.accounts.some((account) => account.id === name)) {
      config = { ...config, accounts: [...config.accounts, newAccount(name, config.accounts.length)] }
      persist()
    }
    return state()
  })

  ipcMain.handle(IPC.UPDATE_ACCOUNT, (event, accountId: unknown, update: unknown) => {
    assertTrustedSender(event)
    const account = requireAccount(accountId)
    if (!update || typeof update !== 'object') throw new Error('Invalid account update')
    const { label, color } = update as AccountUpdate
    const next: Account = { ...account }
    if (label !== undefined) {
      const cleaned = cleanLabel(label)
      if (!cleaned) throw new Error('A label cannot be empty')
      next.label = cleaned
    }
    if (color !== undefined) {
      if (!isValidColor(color)) throw new Error('Invalid colour')
      next.color = color
    }
    config = { ...config, accounts: config.accounts.map((item) => (item.id === account.id ? next : item)) }
    persist()
    return state()
  })

  ipcMain.handle(IPC.REMOVE_ACCOUNT, (event, accountId: unknown) => {
    assertTrustedSender(event)
    const account = requireAccount(accountId)
    // Only the launcher's entry goes: the OMP profile and its logins stay.
    config = {
      ...config,
      accounts: config.accounts.filter((item) => item.id !== account.id),
      lastOpen: config.lastOpen.filter((id) => id !== account.id),
    }
    instances.forget(account.id)
    persist()
    return state()
  })

  // Renames the OMP profile itself (its folder under ~/.omp/profiles), then the
  // account. OMP has no rename command; see profile-rename.ts for how it is safe.
  ipcMain.handle(IPC.RENAME_PROFILE, (event, accountId: unknown, newName: unknown) => {
    assertTrustedSender(event)
    const account = requireAccount(accountId)
    if (account.ompProfile === DEFAULT_PROFILE) {
      throw new Error('The default profile cannot be renamed (it is ~/.omp itself); change its label instead.')
    }
    if (typeof newName !== 'string' || !isValidNamedProfile(newName.trim())) {
      throw new Error('Use lower-case letters, digits, dots, dashes and underscores, starting with a letter or digit.')
    }
    const name = newName.trim()
    if (name === account.ompProfile) return state()
    if (instances.isRunning(account.id)) throw new Error(`Close the Pi Desktop window for "${account.label}" first.`)
    if (config.accounts.some((item) => item.id === name)) throw new Error(`The launcher already has an account for "${name}".`)
    renameProfile(homeDir(), account.ompProfile, name, {
      from: instanceDataDir(ROOT, account.id),
      to: instanceDataDir(ROOT, name),
    })
    instances.forget(account.id)
    config = renameAccount(config, account.id, name)
    persist()
    return state()
  })

  ipcMain.handle(IPC.SIGN_IN, (event, profile: unknown) => {
    assertTrustedSender(event)
    openOmpConsole(requireOmp(), requireProfile(profile), 'login')
  })

  ipcMain.handle(IPC.SIGN_OUT, (event, profile: unknown) => {
    assertTrustedSender(event)
    openOmpConsole(requireOmp(), requireProfile(profile), 'logout')
  })

  ipcMain.handle(IPC.OPEN, async (event, accountId: unknown) => {
    assertTrustedSender(event)
    await instances.open(startRequest(requireAccount(accountId)))
  })

  ipcMain.handle(IPC.STOP, async (event, accountId: unknown) => {
    assertTrustedSender(event)
    await instances.stop(requireAccount(accountId).id)
  })

  ipcMain.handle(IPC.RESTART, async (event, accountId: unknown) => {
    assertTrustedSender(event)
    await instances.restart(startRequest(requireAccount(accountId)))
  })

  ipcMain.handle(IPC.UPDATE_SETTINGS, (event, update: unknown) => {
    assertTrustedSender(event)
    if (!update || typeof update !== 'object') throw new Error('Invalid settings update')
    const { piDesktop, ompPath, reopenOnStart } = update as SettingsUpdate
    const next = { ...config }
    if (piDesktop !== undefined) {
      const valid =
        piDesktop && typeof piDesktop.command === 'string' &&
        Array.isArray(piDesktop.args) && piDesktop.args.every((arg) => typeof arg === 'string') &&
        typeof piDesktop.cwd === 'string'
      if (!valid) throw new Error('Invalid Pi Desktop command')
      next.piDesktop = { command: piDesktop.command.trim(), args: piDesktop.args, cwd: piDesktop.cwd.trim() }
    }
    if (ompPath !== undefined) {
      if (typeof ompPath !== 'string') throw new Error('Invalid omp path')
      next.ompPath = ompPath.trim()
    }
    if (reopenOnStart !== undefined) {
      if (typeof reopenOnStart !== 'boolean') throw new Error('Invalid reopen option')
      next.reopenOnStart = reopenOnStart
    }
    config = next
    persist()
    return state()
  })
}

// ─── Window ──────────────────────────────────────────────────────────────────

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 720,
    minHeight: 480,
    title: 'Pi Launcher',
    backgroundColor: '#0a0a0a',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })
  mainWindow.setMenuBarVisibility(false)
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  // The page never navigates; links open in the browser.
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault())
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  if (RENDERER_URL) void mainWindow.loadURL(RENDERER_URL)
  else void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  void app.whenReady().then(() => {
    config = initialConfig()
    instances.on('change', broadcast)
    registerHandlers()
    createWindow()
    if (config.reopenOnStart) {
      for (const id of config.lastOpen) {
        const account = config.accounts.find((item) => item.id === id)
        if (!account) continue
        try {
          void instances.open(startRequest(account))
        } catch {
          // Pi Desktop is not installed or configured; the window says so.
          break
        }
      }
    }
  })

  // Remember which accounts were open; their windows stay open on their own.
  app.on('before-quit', () => {
    config = { ...config, lastOpen: instances.runningAccountIds() }
    saveConfig(ROOT, config)
  })

  app.on('window-all-closed', () => app.quit())
}
