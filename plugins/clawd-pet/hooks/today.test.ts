import { expect, test } from 'claude-code/testing'

import { addToday, dayOf, readToday, todayLine } from './today'

const noon = new Date(2026, 9, 27, 12).getTime()

test('the day is the local calendar date', () => {
  expect(dayOf(noon)).toBe('2026-10-27')
})

test('the counts add up within a day and start over on the next', () => {
  let v: unknown = addToday(undefined, noon, { sessions: 1 })
  v = addToday(v, noon, { turns: 1, workMs: 65_000, calls: 12 })
  v = addToday(v, noon + 3600_000, { sessions: 1 })
  expect(v).toEqual({ day: '2026-10-27', sessions: 2, turns: 1, workMs: 65_000, calls: 12, compactions: 0 })
  expect(addToday(v, noon + 86_400_000, { sessions: 1 })).toEqual({ day: '2026-10-28', sessions: 1, turns: 0, workMs: 0, calls: 0, compactions: 0 })
})

test('a malformed kept value reads as zeros', () => {
  expect(readToday({ day: '2026-10-27', sessions: 'x', turns: -2 }, '2026-10-27')).toEqual({ day: '2026-10-27', sessions: 0, turns: 0, workMs: 0, calls: 0, compactions: 0 })
  expect(readToday('junk', '2026-10-27').sessions).toBe(0)
})

test('the report line names the day\'s work', () => {
  expect(todayLine({ day: '2026-10-27', sessions: 3, turns: 1, workMs: 4_200_000, calls: 340, compactions: 0 })).toBe(
    '- today, in every session: 3 sessions, 1 turn, 1h 10m of work, 340 tool calls',
  )
})

test('compactions count in a day, read as zero from a value kept before they did, and show only when there were some', () => {
  const kept = { day: '2026-10-27', sessions: 1, turns: 2, workMs: 0, calls: 3 }
  expect(readToday(kept, '2026-10-27').compactions).toBe(0)
  const t = addToday(addToday(kept, noon, { compactions: 1 }), noon, { compactions: 1 })
  expect(t.compactions).toBe(2)
  expect(todayLine(t)).toBe('- today, in every session: 1 session, 2 turns, 0s of work, 3 tool calls, 2 compactions')
})
