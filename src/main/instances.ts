import { spawn, execFile, type ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import { mkdirSync } from 'fs'
import { dirname } from 'path'
import type { Account, InstanceStatus, PiDesktopCommand } from '../shared/types'

/**
 * The Pi Desktop processes the launcher started, one per account.
 *
 * Pi Desktop (with multiple instances allowed) keeps one process per data
 * folder: starting an account whose instance already runs only brings that
 * window forward, so Open is safe to repeat even for an instance the launcher
 * lost track of (for example after the launcher itself restarted).
 */

/** How long a window gets to close by itself before its process tree is ended. */
export const STOP_GRACE_MS = 15_000

export interface StartRequest {
  account: Account
  command: PiDesktopCommand
  env: NodeJS.ProcessEnv
  dataDir: string
}

interface Tracked {
  status: InstanceStatus
  child: ChildProcess | null
  stopTimer: NodeJS.Timeout | null
}

/** Run a Windows tool and ignore its outcome (best effort). */
function runQuietly(file: string, args: string[]): Promise<void> {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true }, () => resolve())
  })
}

export class InstanceManager extends EventEmitter {
  private readonly tracked = new Map<string, Tracked>()

  statuses(): InstanceStatus[] {
    return [...this.tracked.values()].map((entry) => ({ ...entry.status }))
  }

  status(accountId: string): InstanceStatus {
    return { ...(this.tracked.get(accountId)?.status ?? { accountId, state: 'stopped' }) }
  }

  isRunning(accountId: string): boolean {
    const state = this.tracked.get(accountId)?.status.state
    return state === 'starting' || state === 'running' || state === 'stopping'
  }

  private update(accountId: string, status: Partial<InstanceStatus>): void {
    const entry = this.tracked.get(accountId) ?? { status: { accountId, state: 'stopped' as const }, child: null, stopTimer: null }
    entry.status = { ...entry.status, ...status, accountId }
    this.tracked.set(accountId, entry)
    this.emit('change')
  }

  /** Start the account's instance, or bring it forward when it already runs. */
  async open(request: StartRequest): Promise<void> {
    const entry = this.tracked.get(request.account.id)
    if (entry?.child && this.isRunning(request.account.id) && entry.status.pid) {
      await this.focus(entry.status.pid)
      return
    }
    this.start(request)
  }

  private start({ account, command, env, dataDir }: StartRequest): void {
    mkdirSync(dataDir, { recursive: true })
    this.update(account.id, { state: 'starting', pid: undefined, exitCode: undefined, error: undefined })
    let child: ChildProcess
    try {
      child = spawn(command.command, command.args, {
        cwd: command.cwd || dirname(command.command),
        env,
        // Its own process group and lifetime: closing the launcher leaves it open.
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      })
    } catch (err) {
      this.update(account.id, { state: 'exited', error: err instanceof Error ? err.message : String(err) })
      return
    }
    const entry = this.tracked.get(account.id)!
    entry.child = child
    child.unref()
    child.once('spawn', () => this.update(account.id, { state: 'running', pid: child.pid }))
    child.once('error', (err) => {
      if (entry.child !== child) return
      entry.child = null
      this.update(account.id, { state: 'exited', error: err.message })
    })
    child.once('exit', (code) => {
      if (entry.child !== child) return
      entry.child = null
      if (entry.stopTimer) clearTimeout(entry.stopTimer)
      entry.stopTimer = null
      const stopping = entry.status.state === 'stopping'
      this.update(account.id, { state: stopping ? 'stopped' : 'exited', pid: undefined, exitCode: stopping ? undefined : code })
    })
  }

  /** Bring a process's main window to the front (the launcher is foreground, so Windows allows it). */
  async focus(pid: number): Promise<void> {
    if (process.platform !== 'win32') return
    await runQuietly('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `$null = (New-Object -ComObject WScript.Shell).AppActivate(${Math.trunc(pid)})`,
    ])
  }

  /**
   * Close the account's window as a user would, so Pi Desktop stops its own
   * agent processes; end the whole process tree only if it does not exit in time.
   */
  async stop(accountId: string): Promise<void> {
    const entry = this.tracked.get(accountId)
    const pid = entry?.status.pid
    if (!entry?.child || !pid) return
    this.update(accountId, { state: 'stopping' })
    if (process.platform === 'win32') await runQuietly('taskkill.exe', ['/PID', String(pid)])
    else entry.child.kill('SIGTERM')
    entry.stopTimer = setTimeout(() => {
      if (entry.child && entry.status.pid === pid) {
        if (process.platform === 'win32') void runQuietly('taskkill.exe', ['/PID', String(pid), '/T', '/F'])
        else entry.child.kill('SIGKILL')
      }
    }, STOP_GRACE_MS)
  }

  /** Resolves once the account's process has exited (or at once when none runs). */
  whenStopped(accountId: string): Promise<void> {
    const entry = this.tracked.get(accountId)
    if (!entry?.child) return Promise.resolve()
    return new Promise((resolve) => entry.child!.once('exit', () => resolve()))
  }

  async restart(request: StartRequest): Promise<void> {
    const stopped = this.whenStopped(request.account.id)
    await this.stop(request.account.id)
    await stopped
    this.start(request)
  }

  /** Forget an account (removed from the launcher); its window stays open. */
  forget(accountId: string): void {
    const entry = this.tracked.get(accountId)
    if (entry?.stopTimer) clearTimeout(entry.stopTimer)
    this.tracked.delete(accountId)
    this.emit('change')
  }

  /** Account ids whose instance currently runs. */
  runningAccountIds(): string[] {
    return [...this.tracked.keys()].filter((id) => this.isRunning(id))
  }
}
