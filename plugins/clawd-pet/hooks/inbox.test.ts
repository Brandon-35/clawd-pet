import { expect, test } from 'claude-code/testing'

import { NOTE_PREFIX, isNote, keepNotes, messageToast, noteText, noteToast, notesLine, unwrap } from './inbox'

const ENVELOPE = (inner: string, attrs = 'from="uds:/tmp/cc-socks/4267.sock" from-name="api" from-mode="bypass"') =>
  `<cross-session-message ${attrs}>${inner}</cross-session-message>`

test('unwrap reads the sender and the body of an envelope, with its control characters out', () => {
  expect(unwrap(ENVELOPE('\u0001run  the\ntests\u0001'))).toEqual({ from: 'api', body: 'run the tests' })
})

test('unwrap takes the whole text as the body when there is no envelope', () => {
  expect(unwrap('  hello\u0007 there ')).toEqual({ body: 'hello there' })
})

test('unwrap leaves the sender out when the envelope names none, and cuts a long name to 40', () => {
  expect(unwrap(ENVELOPE('hi', 'from="uds:/tmp/x.sock"'))).toEqual({ body: 'hi' })
  expect(unwrap(ENVELOPE('hi', `from-name="${'n'.repeat(60)}"`)).from?.length).toBe(40)
})

test('isNote takes only a clawd-pet message with the note prefix', () => {
  const body = `${NOTE_PREFIX}lunch at 12`
  expect(isNote({ kind: 'peer', plugin: 'clawd-pet' }, body)).toBe(true)
  expect(isNote({ kind: 'coordinator', plugin: 'clawd-pet' }, body)).toBe(true)
  expect(isNote({ kind: 'peer', plugin: 'other-mod' }, body)).toBe(false)
  expect(isNote({ kind: 'peer' }, body)).toBe(false)
  expect(isNote({ kind: 'bridge' }, body)).toBe(false)
  expect(isNote({ kind: 'peer', plugin: 'clawd-pet' }, 'lunch at 12')).toBe(false)
})

test('noteText drops the prefix and cuts to 300; the toasts name the sender or another session', () => {
  expect(noteText(`${NOTE_PREFIX}lunch at 12`)).toBe('lunch at 12')
  expect(noteText(`${NOTE_PREFIX}${'x'.repeat(400)}`).length).toBe(300)
  expect(messageToast('api', 'rebase now')).toBe('✉ api: rebase now')
  expect(messageToast(undefined, 'y'.repeat(100))).toBe(`✉ another session: ${'y'.repeat(80)}…`)
  expect(noteToast('api', 'lunch at 12')).toBe('✎ note from api: lunch at 12')
  expect(noteToast(undefined, 'hi')).toBe('✎ note from another session: hi')
})

test('keepNotes keeps the latest three first, and notesLine prints them with their age', () => {
  let list = keepNotes([], { from: 'api', text: 'one', at: 0 })
  list = keepNotes(list, { text: 'two', at: 60000 })
  list = keepNotes(list, { from: 'web', text: 'three', at: 120000 })
  list = keepNotes(list, { from: 'web', text: 'four', at: 170000 })
  expect(list.map(n => n.text)).toEqual(['four', 'three', 'two'])
  expect(notesLine(list, 240000)).toBe('- notes: "four" (web, 1m ago) · "three" (web, 2m ago) · "two" (another session, 3m ago)')
  expect(notesLine([], 0)).toBe('')
})
