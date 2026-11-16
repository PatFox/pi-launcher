import assert from 'node:assert/strict'
import { test } from 'node:test'
import { delimiter, dirname, join } from 'node:path'
import { buildLaunchEnv } from './launch-env'

const account = { id: 'personal', ompProfile: 'personal', label: 'Personal', color: '#10b981' }
const omp = join('D:', 'omp', 'bin', 'omp.exe')

test('an instance gets its account, data folder and title', () => {
  const env = buildLaunchEnv({ Path: 'C:\\Windows' }, account, 'D:\\launcher', omp)
  assert.equal(env.PI_DESKTOP_USER_DATA_DIR, join('D:\\launcher', 'instances', 'personal'))
  assert.equal(env.OMP_PROFILE, 'personal')
  assert.equal(env.PI_DESKTOP_WINDOW_TITLE, 'Personal')
  assert.equal(env.Path, `${dirname(omp)}${delimiter}C:\\Windows`, 'omp is found first, under the existing key')
  assert.equal('PATH' in env, false)
})

test('the default account names the default profile explicitly', () => {
  const env = buildLaunchEnv({}, { ...account, id: 'default', ompProfile: 'default' }, 'R', null)
  assert.equal(env.OMP_PROFILE, 'default')
})

test('nothing from the launcher changes how Pi Desktop starts or which account it uses', () => {
  const env = buildLaunchEnv({
    ELECTRON_RENDERER_URL: 'http://localhost:5173',
    electron_run_as_node: '1',
    NODE_ENV: 'development',
    OMP_PROFILE: 'other',
    PI_PROFILE: 'legacy',
    OMP_CODING_AGENT_DIR: 'X',
    PI_DESKTOP_FRAMELESS: '1',
    PI_DESKTOP_WORKSPACE: 'C:\\somewhere',
    KEEP_ME: 'yes',
  }, account, 'R', null)
  for (const name of ['ELECTRON_RENDERER_URL', 'electron_run_as_node', 'NODE_ENV', 'PI_PROFILE', 'OMP_CODING_AGENT_DIR', 'PI_DESKTOP_FRAMELESS', 'PI_DESKTOP_WORKSPACE']) {
    assert.equal(name in env, false, name)
  }
  assert.equal(env.OMP_PROFILE, 'personal')
  assert.equal(env.KEEP_ME, 'yes')
})
