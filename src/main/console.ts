import { spawn } from 'child_process'
import { isValidProfile } from '../shared/profile-name'

/**
 * OMP's sign-in and sign-out are interactive (a browser opens; OMP may ask
 * for input), so they run in a console window of their own. The profile name
 * is validated with OMP's rule before it reaches the command line.
 */

export type OmpConsoleAction = 'login' | 'logout'

/** PowerShell literal string: single quotes, embedded quotes doubled. */
function psLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/** The PowerShell command a console window runs for `action` on `profile`. */
export function buildOmpConsoleCommand(ompExecutable: string, profile: string, action: OmpConsoleAction): string {
  if (!isValidProfile(profile)) throw new Error(`Invalid OMP profile: ${profile}`)
  const title = `${action === 'login' ? 'Sign in' : 'Sign out'}: ${profile}`
  return [
    `$host.UI.RawUI.WindowTitle = ${psLiteral(title)}`,
    `& ${psLiteral(ompExecutable)} --profile ${profile} ${action}`,
    `Write-Host ''`,
    `Write-Host 'Done. You can close this window and return to Pi Launcher.'`,
  ].join('; ')
}

/** Open a console window running `omp --profile <profile> <action>`. */
export function openOmpConsole(ompExecutable: string, profile: string, action: OmpConsoleAction): void {
  const command = buildOmpConsoleCommand(ompExecutable, profile, action)
  // detached on Windows gives the child its own console window.
  const child = spawn('powershell.exe', ['-NoProfile', '-NoExit', '-Command', command], {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
}
