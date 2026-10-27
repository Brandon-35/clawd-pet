import { expect, test } from 'claude-code/testing'

import { noteTurn, turnsLeft } from './pace'

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
