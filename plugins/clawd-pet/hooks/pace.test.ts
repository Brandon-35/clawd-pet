import { expect, test } from 'claude-code/testing'

import { limitStart, noteTurn, runsOutInMin, stepLimit, turnsLeft } from './pace'

test('the context forecast follows the recent turns and starts over after a compaction', () => {
  let hps: number[] = []
  for (const hp of [90, 84, 78, 72]) {
    hps = noteTurn(hps, hp)
  }
  expect(turnsLeft(hps)).toBe(12)
  expect(noteTurn(hps, 95)).toEqual([95])
  expect(turnsLeft([95])).toBeUndefined()
  expect(turnsLeft([60, 60])).toBeUndefined()
  expect(noteTurn([1, 2, 3, 4, 5, 6].map(n => 100 - n), 90)).toHaveLength(6)
})

test('a rate limit warns when its pace runs it out before the reset', () => {
  const min = 60000
  const start = limitStart(undefined, 40, 120, 0)
  expect(start).toEqual({ at: 0, left: 40, resetsAt: 120 * min })
  // 20 points in 20 minutes: the other 20 last 20 minutes, well before the reset in 100.
  expect(runsOutInMin(limitStart(start, 20, 100, 20 * min), 20, 20 * min, 15 * min)).toBe(20)
  // A slow pace lasts past the reset.
  expect(runsOutInMin(start, 38, 20 * min, 15 * min)).toBeUndefined()
  // Too soon to tell.
  expect(runsOutInMin(start, 20, 10 * min, 15 * min)).toBeUndefined()
})

test('a new window or a rise in the share left starts the pace over', () => {
  const start = { at: 0, left: 40, resetsAt: 120 * 60000 }
  expect(limitStart(start, 30, 100, 20 * 60000)).toBe(start)
  expect(limitStart(start, 90, 300, 20 * 60000)).toEqual({ at: 20 * 60000, left: 90, resetsAt: 320 * 60000 })
  expect(limitStart(start, 50, 100, 20 * 60000)).toEqual({ at: 20 * 60000, left: 50, resetsAt: 120 * 60000 })
  expect(limitStart(start, undefined, undefined, 0)).toBeUndefined()
})

test('a fast pace warns once per window', () => {
  const min = 60000
  let p = stepLimit({}, 40, 120, 0, 15 * min).pace
  const first = stepLimit(p, 20, 100, 20 * min, 15 * min)
  expect([first.outMin, first.warn]).toEqual([20, true])
  p = first.pace
  const again = stepLimit(p, 18, 98, 22 * min, 15 * min)
  expect(again.warn).toBe(false)
  expect(again.outMin).toBeDefined()
  // The window resets, and a new fast pace warns again.
  p = stepLimit(again.pace, 100, 300, 100 * min, 15 * min).pace
  expect(stepLimit(p, 60, 280, 120 * min, 15 * min).warn).toBe(true)
})
