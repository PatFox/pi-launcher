import assert from 'node:assert/strict'
import { test } from 'node:test'
import { instanceStateLabel, isOpenState, signedInSummary } from './account-view'

test('a signed-in profile shows organisation, email and provider', () => {
  const summary = signedInSummary({
    name: 'personal',
    accounts: [{ provider: 'anthropic', identityKey: 'email:pat@example.com|org:1', email: 'pat@example.com', orgName: 'Personal' }],
  })
  assert.deepEqual(summary, { text: 'Personal · pat@example.com (anthropic)', signedIn: true })
})

test('a profile without accounts, or one that failed to read, is not signed in', () => {
  assert.deepEqual(signedInSummary({ name: 'x', accounts: [] }), { text: 'Not signed in', signedIn: false })
  assert.equal(signedInSummary({ name: 'x', accounts: [], error: 'boom' }).signedIn, false)
  assert.equal(signedInSummary(undefined).text, 'Checking…')
})

test('instance states read as plain words', () => {
  assert.equal(instanceStateLabel('running'), 'Open')
  assert.equal(instanceStateLabel('exited', 0), 'Closed')
  assert.equal(instanceStateLabel('exited', 3), 'Closed (exit 3)')
  assert.equal(isOpenState('starting'), true)
  assert.equal(isOpenState('exited'), false)
})
