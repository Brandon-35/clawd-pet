import { expect, test } from 'claude-code/testing'

import { DEFAULTS, readSettings } from './settings'

test('no options give the defaults', () => {
  expect(readSettings({})).toEqual(DEFAULTS)
})

test('each option sets its setting', () => {
  expect(readSettings({ speed: 'fast', sleepAfter: 300, hud: false, hudStyle: 'line', statusLine: false, targets: false, minis: false, toasts: false, notifyAfter: 0, shellStatus: false })).toEqual({
    pace: 1.6, sleepAfterMs: 300000, hud: false, hudStyle: 'line', statusLine: false, targets: false, minis: false, toasts: false, notifyAfterMs: 0, shellStatus: false,
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

test('the HUD style is the window unless the setting says line', () => {
  expect([readSettings({ hudStyle: 'line' }).hudStyle, readSettings({ hudStyle: 'tiny' }).hudStyle, readSettings({ hudStyle: 3 }).hudStyle]).toEqual(['line', 'window', 'window'])
})
