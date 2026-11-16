import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import { isValidNamedProfile } from '../shared/profile-name'

/**
 * Rename an OMP named profile. OMP has no rename command: a profile is just the
 * folder `~/.omp/profiles/<name>`, and `omp --profile <name>` reads whichever
 * folder carries that name. So renaming moves the folder and fixes the one
 * kind of file inside it that records its own location:
 * `agent/custom-session-files/*`, one-line pointers to session files.
 *
 * Windows refuses to move a folder while any process holds a file in it open,
 * so a profile still in use (an OMP session, a Pi Desktop window) makes the
 * rename fail before anything changed. The default profile is `~/.omp` itself
 * and cannot be renamed.
 */

const POINTERS_DIR = join('agent', 'custom-session-files')

export class ProfileRenameError extends Error {}

export function profilesDir(home: string): string {
  return join(home, '.omp', 'profiles')
}

/** Point the profile's session-file pointers at its new folder; returns how many changed. */
export function rewriteSessionPointers(profileRoot: string, oldRoot: string): number {
  const dir = join(profileRoot, POINTERS_DIR)
  if (!existsSync(dir)) return 0
  let changed = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile()) continue
    const path = join(dir, entry.name)
    const content = readFileSync(path, 'utf-8')
    const trimmed = content.trim()
    // Compare case-insensitively: Windows paths, possibly written differently.
    if (!trimmed.toLowerCase().startsWith(oldRoot.toLowerCase())) continue
    writeFileSync(path, profileRoot + trimmed.slice(oldRoot.length) + content.slice(content.trimEnd().length), 'utf-8')
    changed++
  }
  return changed
}

function describeMoveFailure(err: unknown): string {
  const code = (err as NodeJS.ErrnoException).code
  if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') {
    return 'The profile is in use. Close every Pi Desktop window and OMP session using it, then try again.'
  }
  return err instanceof Error ? err.message : String(err)
}

/** Move `from` to `to`, reporting a profile in use in plain words. */
function move(from: string, to: string): void {
  try {
    renameSync(from, to)
  } catch (err) {
    throw new ProfileRenameError(describeMoveFailure(err))
  }
}

export interface ProfileRenameResult {
  /** Session-file pointers updated to the new folder. */
  pointersUpdated: number
}

/**
 * Rename profile `oldName` to `newName` under `home`. When `extraMove` is
 * given (the launcher's own data folder for the account), it is moved too, and
 * the profile is moved back if that fails, so the two never disagree.
 */
export function renameProfile(
  home: string,
  oldName: string,
  newName: string,
  extraMove?: { from: string; to: string },
): ProfileRenameResult {
  if (!isValidNamedProfile(oldName)) throw new ProfileRenameError('Only a named profile can be renamed; the default profile is ~/.omp itself.')
  if (!isValidNamedProfile(newName)) throw new ProfileRenameError(`"${newName}" is not a profile name OMP accepts.`)
  if (oldName === newName) return { pointersUpdated: 0 }
  const from = join(profilesDir(home), oldName)
  const to = join(profilesDir(home), newName)
  if (!existsSync(from)) throw new ProfileRenameError(`Profile "${oldName}" was not found.`)
  if (existsSync(to)) throw new ProfileRenameError(`A profile called "${newName}" already exists.`)
  if (extraMove && existsSync(extraMove.to)) throw new ProfileRenameError(`The launcher already has a data folder for "${newName}".`)

  move(from, to)
  if (extraMove && existsSync(extraMove.from)) {
    try {
      move(extraMove.from, extraMove.to)
    } catch (err) {
      move(to, from)
      throw err
    }
  }
  return { pointersUpdated: rewriteSessionPointers(to, from) }
}
