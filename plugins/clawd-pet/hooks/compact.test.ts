import { expect, test } from 'claude-code/testing'

import { compactLine } from './compact'

test('a compaction names the tokens before, after and freed, and HP when the window is known', () => {
  expect(compactLine(152000, 31000, 'manual', 200000)).toBe('compacted 152k → 31k tokens, freed 121k (HP 24% → 84%)')
  expect(compactLine(152000, 31000, 'manual')).toBe('compacted 152k → 31k tokens, freed 121k')
  expect(compactLine(152000, 31000, 'auto', 0)).toBe('auto-compacted 152k → 31k tokens, freed 121k')
})

test('HP stays within 0 to 100 when the tokens pass the window', () => {
  expect(compactLine(250000, 400, 'auto', 200000)).toBe('auto-compacted 250k → 400 tokens, freed 250k (HP 0% → 100%)')
})

test('no toast when a count is missing or nothing was freed', () => {
  expect(compactLine(undefined, 31000, 'manual')).toBeUndefined()
  expect(compactLine(152000, undefined, 'manual')).toBeUndefined()
  expect(compactLine(30000, 30000, 'manual')).toBeUndefined()
  expect(compactLine(30000, 40000, 'auto')).toBeUndefined()
})
