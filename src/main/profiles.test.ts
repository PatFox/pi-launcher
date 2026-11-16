import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { findOmp, listProfileNames, parseUsageAccounts } from './profiles'

async function withDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'pi-launcher-profiles-'))
  try {
    await run(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test('the default profile is always listed, named ones after it, sorted', async () => {
  await withDir(async (home) => {
    assert.deepEqual(listProfileNames(home), ['default'])
    for (const name of ['work', 'personal', 'Bad-Case', '-flag']) {
      await mkdir(join(home, '.omp', 'profiles', name), { recursive: true })
    }
    await writeFile(join(home, '.omp', 'profiles', 'stray-file'), '')
    assert.deepEqual(listProfileNames(home), ['default', 'personal', 'work'])
  })
})

test('usage accounts output is parsed into identities, with the email when present', () => {
  const output = JSON.stringify({
    accounts: [
      { provider: 'anthropic', identityKey: 'email:pat@example.com|org:1234', orgName: 'Example' },
      { provider: 'openai-codex', identityKey: 'account:acct-1' },
      { provider: 42, identityKey: 'x' },
      'junk',
    ],
  })
  assert.deepEqual(parseUsageAccounts(output), [
    { provider: 'anthropic', identityKey: 'email:pat@example.com|org:1234', email: 'pat@example.com', orgName: 'Example' },
    { provider: 'openai-codex', identityKey: 'account:acct-1' },
  ])
})

test('usage accounts output tolerates a banner before the JSON and an empty list', () => {
  assert.deepEqual(parseUsageAccounts('note: something\n{"accounts":[]}'), [])
  assert.deepEqual(parseUsageAccounts('no json here'), [])
})

test('omp is found at the configured path, else on PATH, never via a relative entry', async () => {
  await withDir(async (dir) => {
    const binDir = join(dir, 'bin')
    await mkdir(binDir)
    const exe = join(binDir, process.platform === 'win32' ? 'omp.exe' : 'omp')
    await writeFile(exe, '')
    assert.equal(findOmp(exe, {}), exe)
    assert.equal(findOmp(join(dir, 'missing.exe'), { PATH: binDir }), null, 'a configured path that is gone is not replaced')
    assert.equal(findOmp('', { PATH: ['relative', binDir].join(delimiter) }), exe)
    assert.equal(findOmp('', { PATH: 'relative' }), null)
  })
})
