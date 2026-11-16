import { DEFAULT_PROFILE } from './types'

/**
 * OMP's profile-name rule (`normalizeProfileName` in OMP's pi-utils): what OMP
 * accepts, and nothing more, so a name the launcher creates is one OMP uses.
 * The name becomes a path segment and a command-line argument, which this rule
 * keeps safe: no separators, no leading `-`, no `.`/`..`.
 */
const PROFILE_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/
const WINDOWS_RESERVED_BASENAME_PATTERN = /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\..*)?$/i

/** True for a named profile OMP accepts (not `default`). */
export function isValidNamedProfile(name: string): boolean {
  return (
    name !== DEFAULT_PROFILE &&
    PROFILE_NAME_PATTERN.test(name) &&
    !name.endsWith('.') &&
    !WINDOWS_RESERVED_BASENAME_PATTERN.test(name)
  )
}

/** True for `default` or a named profile OMP accepts. */
export function isValidProfile(name: string): boolean {
  return name === DEFAULT_PROFILE || isValidNamedProfile(name)
}
