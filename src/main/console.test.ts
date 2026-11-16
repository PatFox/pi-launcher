import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildOmpConsoleCommand } from './console'

test('the console runs omp for the profile and says where to go next', () => {
  const command = buildOmpConsoleCommand('D:\\omp\\bin\\omp.exe', 'personal', 'login')
  assert.match(command, /& 'D:\\omp\\bin\\omp\.exe' --profile personal login/)
  assert.match(command, /WindowTitle = 'Sign in: personal'/)
})

test('quotes in the omp path cannot break out of the command', () => {
  const command = buildOmpConsoleCommand("C:\\it's\\omp.exe", 'default', 'logout')
  assert.match(command, /& 'C:\\it''s\\omp\.exe' --profile default logout/)
})

test('a profile name OMP would refuse never reaches the command line', () => {
  assert.throws(() => buildOmpConsoleCommand('omp.exe', 'x; Remove-Item', 'login'))
  assert.throws(() => buildOmpConsoleCommand('omp.exe', '../escape', 'login'))
})
