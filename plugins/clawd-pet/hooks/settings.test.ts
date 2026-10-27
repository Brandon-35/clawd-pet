import { expect, test } from 'claude-code/testing'

import { DEFAULTS, readSettings } from './settings'

test('no options give the defaults', () => {
  expect(readSettings({})).toEqual(DEFAULTS)
})

test('each option sets its setting', () => {
  expect(readSettings({ speed: 'fast', sleepAfter: 300, hud: false, statusLine: false, targets: false, minis: false, toasts: false, notifyAfter: 0 })).toEqual({
    pace: 1.6, sleepAfterMs: 300000, hud: false, statusLine: false, targets: false, minis: false, toasts: false, notifyAfterMs: 0,
  })
})

test('a value from another version, or a malformed one, takes its default', () => {
  expect(readSettings({ speed: 'ludicrous', sleepAfter: -5, hud: 'yes', retired: true })).toEqual(DEFAULTS)
})

test('a notification wait under 30 seconds rounds up to 30', () => {
  expect(readSettings({ notifyAfter: 5 }).notifyAfterMs).toBe(30000)
  expect(readSettings({ notifyAfter: 300 }).notifyAfterMs).toBe(300000)
  expect(readSettings({ notifyAfter: -1 }).notifyAfterMs).toBe(DEFAULTS.notifyAfterMs)
})
