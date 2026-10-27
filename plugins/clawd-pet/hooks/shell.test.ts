import { expect, test } from 'claude-code/testing'

import { shellDue, shellKey, shellRecord } from './shell'
import type { ShellState } from './shell'

const s: ShellState = { mode: 'bash', color: '#4f9a5a', line: '$ npm\ttest', cwd: '/w/app', hp: 64, mp: 80, turnStartedAt: 1000 }

test('a record is one tab-separated line with no tab or newline inside a field', () => {
  expect(shellRecord(s, 5000)).toBe('1\tbash\t#4f9a5a\t$ npm test\t/w/app\t64\t80\t\t1000\t5000\t1\t\n')
  expect(shellRecord({ mode: 'ended', color: '', line: '', cwd: '/w' }, 9)).toBe('1\tended\t\t\t/w\t\t\t\t\t9\t1\t\n')
})

test('a record is due when what the shell shows changes, or each minute', () => {
  const key = shellKey(s)
  expect(shellDue({ ...s, line: 'running: npm test' }, key, 0, 30000)).toBe(false)
  expect(shellDue({ ...s, mode: 'think' }, key, 0, 1000)).toBe(true)
  expect(shellDue({ ...s, hp: 63 }, key, 0, 1000)).toBe(true)
  expect(shellDue(s, key, 0, 60000)).toBe(true)
})
