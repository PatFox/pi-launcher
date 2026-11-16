import { dirname, delimiter } from 'path'
import type { Account } from '../shared/types'
import { instanceDataDir } from './config'

/**
 * The environment one Pi Desktop instance starts with: the launcher's own,
 * minus what would change how Pi Desktop itself starts, plus the account's
 * instance settings. Pi Desktop gives a launch with a data folder of its own
 * its own single-instance lock, so instances with different folders run side
 * by side.
 */

/** Variables a launched Pi Desktop must not inherit from the launcher. */
const STRIPPED_VARIABLES = [
  // The launcher's own dev server: Pi Desktop would load the launcher's page.
  'ELECTRON_RENDERER_URL',
  // Makes Electron run as plain Node instead of as an app.
  'ELECTRON_RUN_AS_NODE',
  // Development mode in Pi Desktop opens DevTools.
  'NODE_ENV',
  // Set explicitly below; an inherited value must not override the account.
  'OMP_PROFILE',
  'PI_PROFILE',
  'OMP_CODING_AGENT_DIR',
  'PI_DESKTOP_WORKSPACE',
]
const STRIPPED_PREFIX = 'PI_DESKTOP_'

function pathKey(env: NodeJS.ProcessEnv): string {
  return Object.keys(env).find((key) => key.toUpperCase() === 'PATH') ?? 'PATH'
}

export function buildLaunchEnv(
  base: NodeJS.ProcessEnv,
  account: Account,
  root: string,
  ompExecutable: string | null,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  const stripped = new Set(STRIPPED_VARIABLES.map((name) => name.toUpperCase()))
  for (const [key, value] of Object.entries(base)) {
    const upper = key.toUpperCase()
    // Windows reads variable names case-insensitively: compare upper-cased.
    if (stripped.has(upper) || upper.startsWith(STRIPPED_PREFIX)) continue
    env[key] = value
  }
  env.PI_DESKTOP_USER_DATA_DIR = instanceDataDir(root, account.id)
  env.OMP_PROFILE = account.ompProfile
  env.PI_DESKTOP_WINDOW_TITLE = account.label
  if (ompExecutable) {
    const key = pathKey(env)
    const current = env[key]
    env[key] = current ? `${dirname(ompExecutable)}${delimiter}${current}` : dirname(ompExecutable)
  }
  return env
}
