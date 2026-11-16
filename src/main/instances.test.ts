import assert from 'node:assert/strict'
import { test } from 'node:test'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { InstanceManager, type StartRequest } from './instances'
import type { InstanceStatus } from '../shared/types'

const account = { id: 'work', ompProfile: 'work', label: 'Work', color: '#3b82f6' }

async function withDataDir(run: (dataDir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'pi-launcher-instances-'))
  try {
    await run(join(dir, 'instances', 'work'))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/** A stand-in for Pi Desktop: Node running a short script. */
function request(dataDir: string, script: string): StartRequest {
  return { account, command: { command: process.execPath, args: ['-e', script], cwd: '' }, env: process.env, dataDir }
}

async function waitFor(manager: InstanceManager, predicate: (status: InstanceStatus) => boolean): Promise<InstanceStatus> {
  for (;;) {
    const status = manager.status('work')
    if (predicate(status)) return status
    await once(manager, 'change')
  }
}

test('an instance is tracked from start to its own exit, with the exit code', async () => {
  await withDataDir(async (dataDir) => {
    const manager = new InstanceManager()
    assert.equal(manager.status('work').state, 'stopped')
    await manager.open(request(dataDir, 'setTimeout(() => process.exit(3), 300)'))
    const running = await waitFor(manager, (status) => status.state === 'running')
    assert.equal(typeof running.pid, 'number')
    assert.deepEqual(manager.runningAccountIds(), ['work'])
    const exited = await waitFor(manager, (status) => status.state === 'exited')
    assert.equal(exited.exitCode, 3)
    assert.equal(manager.isRunning('work'), false)
  })
})

test('a stopped instance reads as stopped, not as exited by itself', async () => {
  await withDataDir(async (dataDir) => {
    const manager = new InstanceManager()
    await manager.open(request(dataDir, 'setInterval(() => {}, 1000)'))
    await waitFor(manager, (status) => status.state === 'running')
    const stopped = manager.whenStopped('work')
    await manager.stop('work')
    await stopped
    const status = await waitFor(manager, (s) => s.state === 'stopped')
    assert.equal(status.exitCode, undefined)
  })
})

test('a command that cannot start is reported, not thrown', async () => {
  await withDataDir(async (dataDir) => {
    const manager = new InstanceManager()
    await manager.open({ ...request(dataDir, ''), command: { command: join(dataDir, 'missing.exe'), args: [], cwd: dataDir } })
    const status = await waitFor(manager, (s) => s.state === 'exited')
    assert.ok(status.error, 'the spawn error is kept for the UI')
  })
})
