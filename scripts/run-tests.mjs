// Run every *.test.ts under src with node:test through tsx. Spawned directly
// (no shell) so a long file list cannot hit cmd.exe's command-line limit.
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

function findTests(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return findTests(path)
    return entry.name.endsWith('.test.ts') ? [path] : []
  })
}

const files = findTests('src')
const tsx = join('node_modules', 'tsx', 'dist', 'cli.mjs')
const result = spawnSync(process.execPath, [tsx, '--test', ...files], { stdio: 'inherit' })
process.exit(result.status ?? 1)
