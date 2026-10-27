import { expect, test } from 'claude-code/testing'

import { countCall, countCompaction, countReread, countSent, countTurn, countUntested, newStats, statsReport, streakWarning, turnCost, turnRecap } from './stats'

test('tool calls count by kind, failures add up, and each edited file counts once', () => {
  let s = newStats(0)
  s = countCall(s, 'edit', '/a/app.ts', false)
  s = countCall(s, 'edit', '/a/app.ts', true)
  s = countCall(s, 'read', '/a/b.ts', false)
  s = countCall(s, 'bash', '', true)
  expect(s.calls).toEqual({ edit: 2, read: 1, bash: 1 })
  expect(s.failed).toBe(2)
  expect(s.files).toEqual(['/a/app.ts'])
  expect(s.streak).toBe(1)
})

test('the report lists turns, calls by kind, failures, files, and the HUD readings', () => {
  let s = countTurn(countTurn(newStats(0), 65_000), 20_000)
  s = countCall(countCall(countCall(s, 'read', '', false), 'edit', '/x.ts', false), 'bash', '', true)
  const hud = { hp: 64, mp: 80, mpResetsInMin: 130 }
  expect(statsReport(s, 3_725_000, hud)).toBe(
    [
      'report on this session, 1h 02m in:',
      '- 2 turns, 1m 25s of work',
      '- 3 tool calls: 1 read, 1 edit, 1 bash',
      '- 1 failed (33%)',
      '- 1 file edited',
      '- context 64% left · 5-hour limit 80% left, resets in 2h10m',
    ].join('\n'),
  )
})

test('the report says how many turns the context holds at the recent pace', () => {
  expect(statsReport(newStats(0), 0, { hp: 40 }, { turns: 5 }).split('\n').pop()).toBe('- context 40% left (about 5 turns at this pace)')
  expect(statsReport(newStats(0), 0, { hp: 40, mp: 20, mpResetsInMin: 100 }, { mpOutMin: 30 }).split('\n').pop()).toBe(
    '- context 40% left · 5-hour limit 20% left, resets in 1h40m, runs out in about 30m at this pace',
  )
})

test('a fresh session reports zeros without a share', () => {
  expect(statsReport(newStats(0), 0)).toBe(['report on this session, 0s in:', '- 0 turns, 0s of work', '- 0 tool calls', '- 0 failed', '- 0 files edited'].join('\n'))
})

test('a long turn ends with a recap of what it did; a short or stopped one ends quietly', () => {
  const start = countCall(newStats(0), 'read', '', false)
  const end = countCall(countCall(countCall(start, 'edit', '/a.ts', false), 'edit', '/b.ts', false), 'bash', '', true)
  expect(turnRecap(start, end, 134_000, 'answer')).toBe('done in 2m 14s · 3 tool calls · 2 files edited · 1 failed')
  expect(turnRecap(start, start, 45_000, 'answer')).toBe('done in 45s')
  expect(turnRecap(start, end, 61_000, 'error')).toBe('the turn ended in an error after 1m 01s · 3 tool calls · 2 files edited · 1 failed')
  expect(turnRecap(start, end, 29_000, 'answer')).toBeUndefined()
  expect(turnRecap(start, end, 134_000, 'aborted')).toBeUndefined()
})

test('a long turn that called the advisor names its calls and their time in the recap', () => {
  const s = newStats(0)
  expect(turnRecap(s, s, 45_000, 'answer', 0.42, { calls: 2, ms: 14_000 })).toBe('done in 45s · $0.42 · advisor ×2 (14s)')
  expect(turnRecap(s, s, 45_000, 'answer', undefined, { calls: 0, ms: 0 })).toBe('done in 45s')
})

test('three failed calls in a row warn, a success starts the count over', () => {
  const fails = (s: ReturnType<typeof newStats>, n: number) => Array.from({ length: n }).reduce<ReturnType<typeof newStats>>(acc => countCall(acc, 'bash', '', true), s)
  expect(streakWarning(fails(newStats(0), 2))).toBeUndefined()
  expect(streakWarning(fails(newStats(0), 3))).toBe('3 tool calls failed in a row. Press Esc to step in if Claude is stuck.')
  expect(streakWarning(fails(newStats(0), 4))).toBeUndefined()
  expect(streakWarning(fails(newStats(0), 6))).toContain('6 tool calls')
  expect(streakWarning(countCall(fails(newStats(0), 2), 'read', '', false))).toBeUndefined()
  expect(streakWarning({ ...newStats(0), streak: undefined })).toBeUndefined()
})

test('the report counts turns with untested edits only when there were some', () => {
  expect(statsReport(newStats(0), 0)).not.toContain('untested')
  expect(statsReport(countUntested(countUntested(newStats(0))), 0).split('\n').pop()).toBe('- turns with untested edits: 2')
})

test('the report counts re-reads only when there were some', () => {
  expect(statsReport(newStats(0), 0)).not.toContain('re-reads')
  expect(statsReport(countReread(countReread(newStats(0))), 0).split('\n').pop()).toBe('- re-reads: 2')
})

test('the report counts compactions and the tokens they freed only when there were some', () => {
  expect(statsReport(newStats(0), 0)).not.toContain('compactions')
  expect(statsReport(countCompaction(countCompaction(newStats(0), 121000), 119000), 0).split('\n').pop()).toBe('- compactions: 2, freed ~240k tokens')
})

test('a turn costs the rise in the session cost, and nothing when either end is unknown or the cost fell', () => {
  expect(turnCost(1, 1.5)).toBe(0.5)
  expect(turnCost(1, 1)).toBe(0)
  expect(turnCost(undefined, 1.5)).toBeUndefined()
  expect(turnCost(1, undefined)).toBeUndefined()
  expect(turnCost(2, 1)).toBeUndefined()
  expect(turnCost(Number.NaN, 1)).toBeUndefined()
})

test('a long turn\'s recap names its cost from a cent, and never a zero or unknown cost', () => {
  const s = newStats(0)
  expect(turnRecap(s, s, 45_000, 'answer', 0.42)).toBe('done in 45s · $0.42')
  expect(turnRecap(s, s, 45_000, 'answer', 0.004)).toBe('done in 45s')
  expect(turnRecap(s, s, 45_000, 'answer', 0)).toBe('done in 45s')
  expect(turnRecap(s, s, 45_000, 'answer', undefined)).toBe('done in 45s')
  expect(turnRecap(s, s, 45_000, 'answer', Number.NaN)).toBe('done in 45s')
})

test('the report names the session cost and the last turn\'s, and leaves out what is unknown', () => {
  const s = countTurn(newStats(0), 1000, 0.42)
  expect(s.lastTurnUsd).toBe(0.42)
  expect(statsReport(s, 0, { hp: 50, costUsd: 1.24 }).split('\n').slice(-2)[0]).toBe('- cost: $1.24 this session, $0.42 last turn')
  expect(statsReport(countTurn(s, 1000, undefined), 0, { hp: 50, costUsd: 1.24 })).toContain('- cost: $1.24 this session\n')
  expect(statsReport(s, 0, { hp: 50 })).not.toContain('cost')
  expect(statsReport(s, 0, { hp: 50, costUsd: 0 })).not.toContain('cost')
  const old: ReturnType<typeof newStats> = { since: 0, turns: 1, workMs: 0, calls: {}, failed: 0, files: [] }
  expect(statsReport(old, 0, { hp: 50, costUsd: 2 })).toContain('- cost: $2.00 this session\n')
})

test('the report counts messages sent only when there were some', () => {
  expect(statsReport(newStats(0), 0)).not.toContain('messages sent')
  expect(statsReport(countSent(countSent(newStats(0))), 0).split('\n').pop()).toBe('- messages sent: 2')
})
