import { expect, test } from 'claude-code/testing'

import { countCall, countTurn, newStats, statsReport } from './stats'

test('tool calls count by kind, failures add up, and each edited file counts once', () => {
  let s = newStats(0)
  s = countCall(s, 'edit', '/a/app.ts', false)
  s = countCall(s, 'edit', '/a/app.ts', true)
  s = countCall(s, 'read', '/a/b.ts', false)
  s = countCall(s, 'bash', '', true)
  expect(s.calls).toEqual({ edit: 2, read: 1, bash: 1 })
  expect(s.failed).toBe(2)
  expect(s.files).toEqual(['/a/app.ts'])
})

test('the report lists turns, calls by kind, failures, files, and the HUD readings', () => {
  let s = countTurn(countTurn(newStats(0), 65_000), 20_000)
  s = countCall(countCall(countCall(s, 'read', '', false), 'edit', '/x.ts', false), 'bash', '', true)
  const hud = { hp: 64, mp: 80, mpResetsInMin: 130 }
  expect(statsReport(s, 3_725_000, 'clawd', hud)).toBe(
    [
      "clawd's report on this session, 1h 02m in:",
      '- 2 turns, 1m 25s of work',
      '- 3 tool calls: 1 read, 1 edit, 1 bash',
      '- 1 failed (33%)',
      '- 1 file edited',
      '- context 64% left · 5-hour limit 80% left, resets in 2h10m',
    ].join('\n'),
  )
})

test('a fresh session reports zeros without a share', () => {
  expect(statsReport(newStats(0), 0, 'clawd')).toBe(["clawd's report on this session, 0s in:", '- 0 turns, 0s of work', '- 0 tool calls', '- 0 failed', '- 0 files edited'].join('\n'))
})
