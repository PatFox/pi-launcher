import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isValidNamedProfile, isValidProfile } from './profile-name'

test('accepts the names OMP accepts', () => {
  for (const name of ['work', 'employer-a', 'client.2', 'a_b', '0', 'a'.repeat(64)]) {
    assert.equal(isValidNamedProfile(name), true, name)
  }
})

test('rejects names OMP refuses or that would be unsafe as a path or argument', () => {
  for (const name of ['', 'Work', '-flag', '.hidden', '..', 'trailing.', 'a/b', 'a\\b', 'with space', 'a'.repeat(65), 'con', 'nul.txt', 'com1']) {
    assert.equal(isValidNamedProfile(name), false, name)
  }
})

test('"default" is a valid profile but not a new named one', () => {
  assert.equal(isValidProfile('default'), true)
  assert.equal(isValidNamedProfile('default'), false)
  assert.equal(isValidProfile('work'), true)
  assert.equal(isValidProfile('Bad'), false)
})
