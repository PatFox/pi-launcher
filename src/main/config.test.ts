import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  cleanLabel,
  configPath,
  defaultConfig,
  defaultPiDesktopCommand,
  installedPiDesktopCandidates,
  instanceDataDir,
  loadConfig,
  newAccount,
  normalizeConfig,
  renameAccount,
  resolvePiDesktopCommand,
  resolveRoot,
  saveConfig,
} from './config'

async function withRoot(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'pi-launcher-config-'))
  try {
    await run(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test('the root comes from PI_LAUNCHER_ROOT, else "Pi Launcher" in the app data folder', () => {
  assert.equal(resolveRoot('C:\\AppData', { PI_LAUNCHER_ROOT: ' E:\\launcher ' }), 'E:\\launcher')
  assert.equal(resolveRoot('C:\\AppData', {}), join('C:\\AppData', 'Pi Launcher'))
})

test('an empty Pi Desktop command means the installed Pi Desktop, per user first', () => {
  const env = { LOCALAPPDATA: 'L', ProgramFiles: 'P' }
  const perUser = join('L', 'Programs', 'Pi Desktop', 'Pi Desktop.exe')
  const allUsers = join('P', 'Pi Desktop', 'Pi Desktop.exe')
  assert.deepEqual(installedPiDesktopCandidates(env), [perUser, allUsers])
  assert.deepEqual(resolvePiDesktopCommand(defaultPiDesktopCommand(), env, () => true), { command: perUser, args: [], cwd: '' })
  assert.deepEqual(resolvePiDesktopCommand(defaultPiDesktopCommand(), env, (path) => path === allUsers)?.command, allUsers)
  assert.equal(resolvePiDesktopCommand(defaultPiDesktopCommand(), env, () => false), null)
  const configured = { command: 'X:\\electron.exe', args: ['X:\\checkout'], cwd: 'X:\\checkout' }
  assert.deepEqual(resolvePiDesktopCommand(configured, env, () => true), configured)
})

test('a stored empty Pi Desktop command stays empty (auto-detect)', () => {
  assert.deepEqual(normalizeConfig({ piDesktop: { command: '', args: [], cwd: '' } }).piDesktop, defaultPiDesktopCommand())
  assert.deepEqual(normalizeConfig({ piDesktop: { command: 5 } }).piDesktop, defaultPiDesktopCommand())
})

test('each account has its own instance data folder under the root', () => {
  assert.equal(instanceDataDir('R', 'personal'), join('R', 'instances', 'personal'))
})

test('a first run has no config; a saved config round-trips', async () => {
  await withRoot(async (root) => {
    assert.equal(loadConfig(root), null)
    const config = { ...defaultConfig(), accounts: [newAccount('default', 0), newAccount('personal', 1)], lastOpen: ['personal'] }
    saveConfig(root, config)
    assert.deepEqual(loadConfig(root), config)
    assert.equal(existsSync(`${configPath(root)}.tmp-${process.pid}`), false, 'no temp file left behind')
  })
})

test('a broken config falls back to defaults and is kept as .bak on save', async () => {
  await withRoot(async (root) => {
    await writeFile(configPath(root), '{ broken')
    assert.deepEqual(loadConfig(root), defaultConfig())
    saveConfig(root, defaultConfig())
    assert.equal(await readFile(`${configPath(root)}.bak`, 'utf-8'), '{ broken')
  })
})

test('normalize drops accounts OMP could not use and keeps one per profile', () => {
  const config = normalizeConfig({
    accounts: [
      { ompProfile: 'default', label: 'Work', color: '#112233' },
      { ompProfile: 'personal', label: '  Personal  ', color: 'red' },
      { ompProfile: '../escape', label: 'x', color: '#000000' },
      { ompProfile: 'personal', label: 'duplicate', color: '#000000' },
      'not an object',
    ],
    lastOpen: ['personal', 'ghost'],
    reopenOnStart: 'yes',
  })
  assert.deepEqual(config.accounts.map((account) => [account.id, account.label]), [['default', 'Work'], ['personal', 'Personal']])
  assert.equal(config.accounts[1].color, '#3b82f6', 'an invalid colour gets a palette colour')
  assert.deepEqual(config.lastOpen, ['personal'])
  assert.equal(config.reopenOnStart, false)
})

test('labels are cleaned of control characters and capped', () => {
  assert.equal(cleanLabel('A\nB'), 'A B')
  assert.equal(cleanLabel('x'.repeat(100))?.length, 40)
  assert.equal(cleanLabel('   '), null)
  assert.equal(cleanLabel(5), null)
})

test('new accounts get a readable default label', () => {
  assert.equal(newAccount('default', 0).label, 'Default')
  assert.equal(newAccount('personal', 1).label, 'Personal')
})

test('renaming a profile moves its account, keeping colour, position and a chosen label', () => {
  const config = {
    ...defaultConfig(),
    accounts: [newAccount('default', 0), { ...newAccount('work', 1), label: 'Employer B' }, newAccount('client', 2)],
    lastOpen: ['work', 'client'],
  }
  const renamed = renameAccount(config, 'work', 'employer-b')
  assert.deepEqual(renamed.accounts.map((account) => [account.id, account.ompProfile, account.label]), [
    ['default', 'default', 'Default'],
    ['employer-b', 'employer-b', 'Employer B'],
    ['client', 'client', 'Client'],
  ])
  assert.equal(renamed.accounts[1].color, config.accounts[1].color)
  assert.deepEqual(renamed.lastOpen, ['employer-b', 'client'])
  // A label still at its default follows the new name.
  assert.equal(renameAccount(config, 'client', 'acme').accounts[2].label, 'Acme')
})
