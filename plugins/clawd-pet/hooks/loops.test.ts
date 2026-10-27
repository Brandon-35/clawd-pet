import { expect, test } from 'claude-code/testing'

import { callKey, loopWarning, repeat } from './loops'
import type { Repeats } from './loops'

test('a call is keyed by its tool and main input', () => {
  expect(callKey('Bash', { command: 'npm test' })).toBe('Bash\nnpm test')
  expect(callKey('Read', { file_path: '/a.ts', offset: 10 })).toBe('Read\n/a.ts')
  expect(callKey('Edit', { file_path: '/a.ts' })).toBeUndefined()
  expect(callKey('Bash', {})).toBeUndefined()
})

test('the same call warns on its third run, and an edit between starts it over', () => {
  let r: Repeats = {}
  const run = (mode: 'bash' | 'edit', key?: string) => {
    const next = repeat(r, mode, key)
    r = next.repeats
    return next.n
  }
  expect([run('bash', 'k'), run('bash', 'other'), run('bash', 'k')]).toEqual([1, 1, 2])
  expect(loopWarning(run('bash', 'k'), 'Bash', 'npm test')).toBe('`$ npm test` ran 3 times with no edit between. Claude may be going in circles.')
  run('edit')
  expect(run('bash', 'k')).toBe(1)
  expect(loopWarning(4, 'Read', 'a.ts')).toBeUndefined()
  expect(loopWarning(6, 'Read', 'a.ts')).toBe('`Read a.ts` ran 6 times with no edit between. Claude may be going in circles.')
  expect(loopWarning(3, 'Bash', '')).toContain('The same Bash call ran 3 times')
  expect(loopWarning(0, 'Bash', 'x')).toBeUndefined()
})
