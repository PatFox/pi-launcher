import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { ExternalLink, LogIn, LogOut, Play, Plus, RefreshCw, RotateCcw, Settings, Square, Trash2, X } from 'lucide-react'
import { isValidNamedProfile } from '../../shared/profile-name'
import { DEFAULT_PROFILE, type Account, type AccountUpdate, type InstanceStatus, type LauncherState, type ProfileInfo } from '../../shared/types'
import { instanceStateLabel, isOpenState, signedInSummary } from './account-view'

const PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']

const BUTTON = 'inline-flex items-center gap-1.5 rounded-md border border-neutral-700 px-2.5 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-40 disabled:hover:bg-transparent'
const PRIMARY = 'inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-40'
const INPUT = 'w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-blue-500'

function errorText(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  // Electron prefixes errors thrown in the main process.
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

export function App(): React.JSX.Element {
  const [state, setState] = useState<LauncherState | null>(null)
  const [profiles, setProfiles] = useState<ProfileInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)

  const run = useCallback(async (action: () => Promise<unknown>) => {
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(errorText(err))
    }
  }, [])

  const refreshProfiles = useCallback(async () => {
    try {
      setProfiles(await window.launcher.listProfiles())
    } catch (err) {
      setError(errorText(err))
    }
  }, [])

  useEffect(() => {
    void window.launcher.getState().then(setState)
    window.launcher.listProfiles().then(setProfiles, (err: unknown) => setError(errorText(err)))
    const off = window.launcher.onState(setState)
    // Sign-in happens in a console window; pick up its result on return.
    const onFocus = (): void => {
      void refreshProfiles()
    }
    window.addEventListener('focus', onFocus)
    return () => {
      off()
      window.removeEventListener('focus', onFocus)
    }
  }, [refreshProfiles])

  const profileByName = useMemo(() => new Map((profiles ?? []).map((profile) => [profile.name, profile])), [profiles])
  const statusById = useMemo(() => new Map((state?.instances ?? []).map((status) => [status.accountId, status])), [state])

  if (!state) return <div className="p-6 text-sm text-neutral-400">Loading…</div>

  const accountIds = new Set(state.config.accounts.map((account) => account.id))
  const otherProfiles = (profiles ?? []).filter((profile) => !accountIds.has(profile.name))

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-neutral-800 px-5 py-3">
        <div>
          <h1 className="text-base font-semibold">Pi Launcher</h1>
          <p className="text-xs text-neutral-500">One Pi Desktop window per OMP account</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className={BUTTON} onClick={() => void refreshProfiles()}>
            <RefreshCw size={13} /> Refresh
          </button>
          <button type="button" className={BUTTON} onClick={() => setShowSettings(true)}>
            <Settings size={13} /> Settings
          </button>
        </div>
      </header>

      <main className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {!state.ompExecutable && (
          <Banner tone="warning">omp was not found on PATH. Set its location in Settings.</Banner>
        )}
        {!state.piDesktopExecutable && (
          <Banner tone="warning">Pi Desktop was not found. Install it, or set its location in Settings.</Banner>
        )}
        {error && <Banner tone="error" onClose={() => setError(null)}>{error}</Banner>}
        {notice && <Banner tone="info" onClose={() => setNotice(null)}>{notice}</Banner>}

        <section className="space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-500">Accounts</h2>
          {state.config.accounts.length === 0 && <p className="text-sm text-neutral-400">No accounts yet. Add one below.</p>}
          {state.config.accounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              profile={profileByName.get(account.ompProfile)}
              status={statusById.get(account.id)}
              run={run}
              onNotice={setNotice}
              onProfilesChanged={refreshProfiles}
            />
          ))}
        </section>

        {otherProfiles.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-500">Other OMP profiles on this computer</h2>
            {otherProfiles.map((profile) => (
              <div key={profile.name} className="flex items-center justify-between rounded-lg border border-neutral-800 px-3 py-2">
                <div>
                  <div className="text-sm">{profile.name}</div>
                  <div className="text-xs text-neutral-500">{signedInSummary(profile).text}</div>
                </div>
                <button type="button" className={BUTTON} onClick={() => void run(() => window.launcher.addAccount(profile.name))}>
                  <Plus size={13} /> Add
                </button>
              </div>
            ))}
          </section>
        )}

        <AddAccount run={run} existing={accountIds} onNotice={setNotice} />
      </main>

      {showSettings && <SettingsDialog state={state} onClose={() => setShowSettings(false)} />}
    </div>
  )
}

function Banner({ tone, children, onClose }: { tone: 'error' | 'warning' | 'info'; children: React.ReactNode; onClose?: () => void }): React.JSX.Element {
  const colours = {
    error: 'border-red-900 bg-red-950/60 text-red-200',
    warning: 'border-amber-900 bg-amber-950/60 text-amber-200',
    info: 'border-blue-900 bg-blue-950/60 text-blue-200',
  }[tone]
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={clsx('flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm', colours)}>
      <span className="whitespace-pre-wrap">{children}</span>
      {onClose && (
        <button type="button" aria-label="Dismiss" className="opacity-70 hover:opacity-100" onClick={onClose}>
          <X size={14} />
        </button>
      )}
    </div>
  )
}

function AccountCard({ account, profile, status, run, onNotice, onProfilesChanged }: {
  account: Account
  profile: ProfileInfo | undefined
  status: InstanceStatus | undefined
  run: (action: () => Promise<unknown>) => Promise<void>
  onNotice: (text: string) => void
  onProfilesChanged: () => Promise<void>
}): React.JSX.Element {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const summary = signedInSummary(profile)
  const state = status?.state ?? 'stopped'
  const open = isOpenState(state)
  const openAccount = (): void => {
    void run(() => window.launcher.open(account.id))
  }

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <span aria-hidden="true" className="h-8 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: account.color }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="truncate text-sm font-medium hover:underline"
              title={open ? `Show ${account.label}` : `Open ${account.label}`}
              onClick={openAccount}
            >
              {account.label}
            </button>
            <span className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-[10px] text-neutral-400" title="OMP profile">
              {account.ompProfile}
            </span>
            <span className={clsx('text-[11px]', open ? 'text-emerald-400' : 'text-neutral-500')}>
              {instanceStateLabel(state, status?.exitCode)}
            </span>
          </div>
          <div className={clsx('truncate text-xs', summary.signedIn ? 'text-neutral-400' : 'text-amber-300')}>{summary.text}</div>
          {status?.error && <div className="truncate text-xs text-red-300">{status.error}</div>}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
          {!summary.signedIn && (
            <button
              type="button"
              className={BUTTON}
              onClick={() => void run(async () => {
                await window.launcher.signIn(account.ompProfile)
                onNotice(`Finish signing in to "${account.label}" in the console window, then come back here.`)
              })}
            >
              <LogIn size={13} /> Sign in
            </button>
          )}
          <button type="button" className={PRIMARY} onClick={openAccount}>
            {open ? <ExternalLink size={13} /> : <Play size={13} />} {open ? 'Show' : 'Open'}
          </button>
          <button type="button" className={BUTTON} disabled={!open} onClick={() => void run(() => window.launcher.restart(account.id))}>
            <RotateCcw size={13} /> Restart
          </button>
          <button type="button" className={BUTTON} disabled={!open} onClick={() => void run(() => window.launcher.stop(account.id))}>
            <Square size={13} /> Close
          </button>
          <button
            type="button"
            className={BUTTON}
            title="Account settings: label, colour, OMP profile name"
            aria-label={`Settings for ${account.label}`}
            onClick={() => setSettingsOpen(true)}
          >
            <Settings size={13} />
          </button>
          {summary.signedIn && (
            <button
              type="button"
              className={BUTTON}
              title="Sign out of this OMP profile"
              onClick={() => {
                if (!window.confirm(`Sign out of "${account.label}" (OMP profile ${account.ompProfile})? Pi Desktop windows for it will stop working until you sign in again.`)) return
                void run(async () => {
                  await window.launcher.signOut(account.ompProfile)
                  onNotice('Finish signing out in the console window, then come back here.')
                })
              }}
            >
              <LogOut size={13} />
            </button>
          )}
          <button
            type="button"
            className={BUTTON}
            title="Remove from the launcher (keeps the OMP profile and its sign-in)"
            onClick={() => {
              if (!window.confirm(`Remove "${account.label}" from the launcher? The OMP profile and its sign-in stay on this computer.`)) return
              void run(() => window.launcher.removeAccount(account.id))
            }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      {settingsOpen && (
        <AccountSettingsDialog
          account={account}
          open={open}
          onClose={() => setSettingsOpen(false)}
          onSaved={async (renamedTo) => {
            setSettingsOpen(false)
            if (renamedTo) {
              onNotice(`OMP profile "${account.ompProfile}" is now "${renamedTo}". Use "omp --profile ${renamedTo}" from now on.`)
              await onProfilesChanged()
            }
          }}
        />
      )}
    </div>
  )
}

/**
 * Per-account settings: the launcher label, the colour, and (for named
 * profiles) the OMP profile name itself. Changes apply together on Save; a
 * profile rename runs first, so a refused rename changes nothing else.
 */
function AccountSettingsDialog({ account, open, onClose, onSaved }: {
  account: Account
  /** The account's Pi Desktop window is open (a profile rename needs it closed). */
  open: boolean
  onClose: () => void
  onSaved: (renamedTo: string | null) => Promise<void>
}): React.JSX.Element {
  const [label, setLabel] = useState(account.label)
  const [color, setColor] = useState(account.color)
  const [profileName, setProfileName] = useState(account.ompProfile)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const namedProfile = account.ompProfile !== DEFAULT_PROFILE

  const trimmedLabel = label.trim()
  const trimmedProfile = profileName.trim()
  const renaming = namedProfile && trimmedProfile !== account.ompProfile
  const labelValid = trimmedLabel !== ''
  const profileValid = !renaming || isValidNamedProfile(trimmedProfile)
  const changed = trimmedLabel !== account.label || color !== account.color || renaming
  const canSave = changed && labelValid && profileValid && !(renaming && open) && !busy

  const save = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      let accountId = account.id
      if (renaming) {
        await window.launcher.renameProfile(account.id, trimmedProfile)
        accountId = trimmedProfile
      }
      const update: AccountUpdate = {}
      if (trimmedLabel !== account.label) update.label = trimmedLabel
      if (color !== account.color) update.color = color
      if (Object.keys(update).length > 0) await window.launcher.updateAccount(accountId, update)
      await onSaved(renaming ? trimmedProfile : null)
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  return (
    <Dialog title="Account settings" busy={busy} canSave={canSave} error={error} onClose={onClose} onSave={save}>
      <label className="block space-y-1">
        <span className="text-xs text-neutral-400">Label</span>
        <input
          className={INPUT}
          value={label}
          autoFocus
          maxLength={40}
          onChange={(event) => setLabel(event.target.value)}
        />
        <span className="block text-[11px] text-neutral-500">Shown in the launcher and in the Pi Desktop window title. Changes nothing in OMP.</span>
      </label>

      <div className="space-y-1">
        <span className="text-xs text-neutral-400">Colour</span>
        <div className="flex gap-2">
          {PALETTE.map((option) => (
            <button
              key={option}
              type="button"
              aria-label={`Colour ${option}`}
              aria-pressed={option === color}
              className={clsx('h-6 w-6 rounded-full border-2', option === color ? 'border-white' : 'border-transparent')}
              style={{ backgroundColor: option }}
              onClick={() => setColor(option)}
            />
          ))}
        </div>
      </div>

      <label className="block space-y-1">
        <span className="text-xs text-neutral-400">OMP profile name</span>
        <input
          className={clsx(INPUT, 'font-mono')}
          value={profileName}
          spellCheck={false}
          disabled={!namedProfile || busy}
          onChange={(event) => setProfileName(event.target.value)}
        />
        {namedProfile ? (
          <span className="block text-[11px] text-neutral-500">
            Renames the OMP profile itself (its folder under ~/.omp/profiles); the sign-in, sessions, models and plugins move with it.
            Anything else that uses the old name, such as scripts, shell aliases or <span className="font-mono">omp --profile {account.ompProfile}</span>, needs the new name.
          </span>
        ) : (
          <span className="block text-[11px] text-neutral-500">The default profile is ~/.omp itself and cannot be renamed. Give it a label instead.</span>
        )}
        {renaming && open && <span className="block text-xs text-amber-300">Close this account's Pi Desktop window first.</span>}
        {renaming && !profileValid && (
          <span className="block text-xs text-amber-300">Use lower-case letters, digits, dots, dashes and underscores, starting with a letter or digit.</span>
        )}
      </label>

      {!labelValid && <p className="text-xs text-amber-300">The label cannot be empty.</p>}
    </Dialog>
  )
}

/**
 * Modal pop-up over the launcher window: a form with a title bar, Cancel and
 * Save. Escape, the close button and a click outside close it, except while a
 * save is running.
 */
function Dialog({ title, busy, canSave, error, onClose, onSave, children }: {
  title: string
  busy: boolean
  canSave: boolean
  error: string | null
  onClose: () => void
  onSave: () => Promise<void>
  children: React.ReactNode
}): React.JSX.Element {
  const titleId = useId()
  const close = (): void => {
    if (!busy) onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-[8vh]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            close()
          }
        }}
        onSubmit={(event) => {
          event.preventDefault()
          if (canSave) void onSave()
        }}
      >
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <h2 id={titleId} className="text-sm font-semibold">{title}</h2>
          <button type="button" aria-label="Close" className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100" onClick={close}>
            <X size={14} />
          </button>
        </div>

        <div className="space-y-4 px-4 py-3">
          {children}
          {error && <p role="alert" className="rounded border border-red-900 bg-red-950/60 px-3 py-2 text-xs text-red-200">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-neutral-800 px-4 py-3">
          <button type="button" className={BUTTON} onClick={close} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className={PRIMARY} disabled={!canSave}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}

function AddAccount({ run, existing, onNotice }: {
  run: (action: () => Promise<unknown>) => Promise<void>
  existing: Set<string>
  onNotice: (text: string) => void
}): React.JSX.Element {
  const [name, setName] = useState('')
  const trimmed = name.trim()
  const valid = isValidNamedProfile(trimmed) && !existing.has(trimmed)
  const hint = !trimmed
    ? 'A short name for the new OMP profile, for example "employer-b".'
    : existing.has(trimmed)
      ? 'That profile is already in the launcher.'
      : valid
        ? 'A console window opens so you can sign in to this account.'
        : 'Use lower-case letters, digits, dots, dashes and underscores, starting with a letter or digit.'

  return (
    <section className="space-y-2 rounded-lg border border-dashed border-neutral-800 p-3">
      <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-500">Add an account</h2>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (!valid) return
          void run(async () => {
            await window.launcher.addAccount(trimmed)
            await window.launcher.signIn(trimmed)
            onNotice(`Finish signing in to "${trimmed}" in the console window, then come back here.`)
            setName('')
          })
        }}
      >
        <input
          className={clsx(INPUT, 'max-w-xs')}
          placeholder="profile name"
          value={name}
          spellCheck={false}
          onChange={(event) => setName(event.target.value)}
        />
        <button type="submit" className={PRIMARY} disabled={!valid}>
          <LogIn size={13} /> Add and sign in
        </button>
      </form>
      <p className={clsx('text-xs', trimmed && !valid ? 'text-amber-300' : 'text-neutral-500')}>{hint}</p>
    </section>
  )
}

function splitArgs(text: string): string[] {
  return text.split('\n').map((arg) => arg.trim()).filter(Boolean)
}

/** Launcher settings. Every field, the reopen option included, applies on Save. */
function SettingsDialog({ state, onClose }: {
  state: LauncherState
  onClose: () => void
}): React.JSX.Element {
  const { piDesktop, ompPath } = state.config
  const [command, setCommand] = useState(piDesktop.command)
  const [args, setArgs] = useState(piDesktop.args.join('\n'))
  const [cwd, setCwd] = useState(piDesktop.cwd)
  const [omp, setOmp] = useState(ompPath)
  const [reopenOnStart, setReopenOnStart] = useState(state.config.reopenOnStart)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const changed = command !== piDesktop.command
    || splitArgs(args).join('\n') !== piDesktop.args.join('\n')
    || cwd !== piDesktop.cwd
    || omp !== ompPath
    || reopenOnStart !== state.config.reopenOnStart
  const canSave = changed && !busy

  const save = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await window.launcher.updateSettings({
        piDesktop: { command, args: splitArgs(args), cwd },
        ompPath: omp,
        reopenOnStart,
      })
      onClose()
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  return (
    <Dialog title="Launcher settings" busy={busy} canSave={canSave} error={error} onClose={onClose} onSave={save}>
      <label className="block space-y-1">
        <span className="text-xs text-neutral-400">
          Pi Desktop executable (empty: the installed Pi Desktop; in use: {state.piDesktopExecutable ?? 'not found'})
        </span>
        <input className={INPUT} value={command} spellCheck={false} autoFocus onChange={(event) => setCommand(event.target.value)} />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-neutral-400">Arguments (one per line; for a dev checkout, its folder)</span>
        <textarea className={clsx(INPUT, 'h-14 font-mono text-xs')} value={args} spellCheck={false} onChange={(event) => setArgs(event.target.value)} />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-neutral-400">Working folder (empty: the executable's folder)</span>
        <input className={INPUT} value={cwd} spellCheck={false} onChange={(event) => setCwd(event.target.value)} />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-neutral-400">omp executable (empty: find it on PATH; in use: {state.ompExecutable ?? 'not found'})</span>
        <input className={INPUT} value={omp} spellCheck={false} onChange={(event) => setOmp(event.target.value)} />
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={reopenOnStart} onChange={(event) => setReopenOnStart(event.target.checked)} />
        <span className="text-xs text-neutral-300">Reopen the accounts that were open when the launcher last closed</span>
      </label>
      <p className="break-all text-[11px] text-neutral-500">Data folder: {state.root} (set PI_LAUNCHER_ROOT to move it)</p>
    </Dialog>
  )
}
