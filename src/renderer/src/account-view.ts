import type { InstanceState, ProfileInfo } from '../../shared/types'

/** What a profile's sign-in state reads as on an account card. */
export function signedInSummary(profile: ProfileInfo | undefined): { text: string; signedIn: boolean } {
  if (!profile) return { text: 'Checking…', signedIn: false }
  if (profile.error && profile.accounts.length === 0) return { text: `Could not read accounts: ${profile.error}`, signedIn: false }
  if (profile.accounts.length === 0) return { text: 'Not signed in', signedIn: false }
  const parts = profile.accounts.map((account) => {
    const who = account.email ?? account.identityKey
    return account.orgName ? `${account.orgName} · ${who} (${account.provider})` : `${who} (${account.provider})`
  })
  return { text: parts.join(', '), signedIn: true }
}

const STATE_LABELS: Record<InstanceState, string> = {
  stopped: 'Not open',
  starting: 'Opening…',
  running: 'Open',
  stopping: 'Closing…',
  exited: 'Closed',
}

export function instanceStateLabel(state: InstanceState, exitCode?: number | null): string {
  if (state === 'exited' && exitCode !== undefined && exitCode !== null && exitCode !== 0) return `Closed (exit ${exitCode})`
  return STATE_LABELS[state]
}

export function isOpenState(state: InstanceState): boolean {
  return state === 'starting' || state === 'running' || state === 'stopping'
}
