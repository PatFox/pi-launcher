import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProfileRenameError, profilesDir, renameProfile } from './profile-rename'

async function withHome(run: (home: string) => Promise<void>): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), 'pi-launcher-rename-'))
  try {
    await run(home)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
}

async function makeProfile(home: string, name: string): Promise<string> {
  const root = join(profilesDir(home), name)
  await mkdir(join(root, 'agent', 'sessions', '--p--'), { recursive: true })
  await writeFile(join(root, 'agent', 'agent.db'), 'logins')
  await writeFile(join(root, 'agent', 'sessions', '--p--', 'a.jsonl'), '{}\n')
  await mkdir(join(root, 'agent', 'custom-session-files'), { recursive: true })
  await writeFile(join(root, 'agent', 'custom-session-files', 'ptr1'), join(root, 'agent', 'sessions', '--p--', 'a.jsonl'))
  await writeFile(join(root, 'agent', 'custom-session-files', 'ptr2'), join('C:', 'elsewhere', 'b.jsonl'))
  return root
}

test('a named profile moves with its logins and sessions, and its session pointers follow', async () => {
  await withHome(async (home) => {
    await makeProfile(home, 'work')
    const result = renameProfile(home, 'work', 'employer-b')
    const root = join(profilesDir(home), 'employer-b')
    assert.equal(existsSync(join(profilesDir(home), 'work')), false)
    assert.equal(await readFile(join(root, 'agent', 'agent.db'), 'utf-8'), 'logins')
    assert.equal(existsSync(join(root, 'agent', 'sessions', '--p--', 'a.jsonl')), true)
    assert.equal(result.pointersUpdated, 1)
    assert.equal(await readFile(join(root, 'agent', 'custom-session-files', 'ptr1'), 'utf-8'), join(root, 'agent', 'sessions', '--p--', 'a.jsonl'))
    assert.equal(await readFile(join(root, 'agent', 'custom-session-files', 'ptr2'), 'utf-8'), join('C:', 'elsewhere', 'b.jsonl'), 'pointers elsewhere are untouched')
  })
})

test('the launcher data folder moves with the profile', async () => {
  await withHome(async (home) => {
    await makeProfile(home, 'work')
    const launcherData = join(home, 'launcher', 'instances')
    await mkdir(join(launcherData, 'work'), { recursive: true })
    renameProfile(home, 'work', 'client', { from: join(launcherData, 'work'), to: join(launcherData, 'client') })
    assert.equal(existsSync(join(launcherData, 'client')), true)
    assert.equal(existsSync(join(launcherData, 'work')), false)
  })
})

test('the default profile, invalid names and taken names are refused before anything moves', async () => {
  await withHome(async (home) => {
    await makeProfile(home, 'work')
    await makeProfile(home, 'taken')
    assert.throws(() => renameProfile(home, 'default', 'x'), ProfileRenameError)
    assert.throws(() => renameProfile(home, 'work', 'Bad Name'), ProfileRenameError)
    assert.throws(() => renameProfile(home, 'work', 'default'), ProfileRenameError)
    assert.throws(() => renameProfile(home, 'work', 'taken'), /already exists/)
    assert.throws(() => renameProfile(home, 'ghost', 'new'), /not found/)
    assert.equal(existsSync(join(profilesDir(home), 'work', 'agent', 'agent.db')), true)
  })
})

test('a launcher data folder already using the new name is refused before anything moves', async () => {
  await withHome(async (home) => {
    await makeProfile(home, 'work')
    const launcherData = join(home, 'launcher', 'instances')
    await mkdir(join(launcherData, 'client'), { recursive: true })
    assert.throws(
      () => renameProfile(home, 'work', 'client', { from: join(launcherData, 'work'), to: join(launcherData, 'client') }),
      /already has a data folder/
    )
    assert.equal(existsSync(join(profilesDir(home), 'work')), true)
  })
})

test('renaming to the same name changes nothing', async () => {
  await withHome(async (home) => {
    await makeProfile(home, 'work')
    assert.deepEqual(renameProfile(home, 'work', 'work'), { pointersUpdated: 0 })
  })
})

test('a profile with a file held open is refused cleanly and left in place', { skip: process.platform !== 'win32' && 'Windows file locking' }, async () => {
  await withHome(async (home) => {
    const root = await makeProfile(home, 'work')
    const { openSync, closeSync } = await import('node:fs')
    // An OMP session or Pi Desktop window keeps files like agent.db open.
    const handle = openSync(join(root, 'agent', 'agent.db'), 'r+')
    try {
      assert.throws(() => renameProfile(home, 'work', 'employer-b'), /in use/)
    } finally {
      closeSync(handle)
    }
    assert.equal(existsSync(join(profilesDir(home), 'work', 'agent', 'agent.db')), true)
    assert.equal(existsSync(join(profilesDir(home), 'employer-b')), false)
  })
})
