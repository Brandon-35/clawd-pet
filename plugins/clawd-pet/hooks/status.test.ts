import { expect, test } from 'claude-code/testing'

import { clocked, fmtDuration, lineColor, statusLine, targetOf, toolMode } from './status'

test('each tool maps to its own action', () => {
  expect(['Read', 'Grep', 'Edit', 'Bash', 'WebFetch', 'Task', 'mcp__x__y'].map(toolMode)).toEqual(['read', 'search', 'edit', 'bash', 'web', 'agent', 'bash'])
})

test('the target names what the tool works on', () => {
  expect(targetOf('Read', { file_path: '/a/b/app.ts' })).toBe('app.ts')
  expect(targetOf('Grep', { pattern: 'useState' })).toBe('useState')
  expect(targetOf('Bash', { command: 'npm test\nnpm run build' })).toBe('npm test')
  expect(targetOf('WebFetch', { url: 'https://docs.anthropic.com/en/docs' })).toBe('docs.anthropic.com')
  expect(targetOf('mcp__srv__lookup', {})).toBe('lookup')
  expect(targetOf('Bash', { command: 'x'.repeat(60) })).toHaveLength(24)
})

test('the line fills in the target and moves on every four seconds', () => {
  expect(statusLine('read', 0, 0, 'app.ts')).toBe('reading app.ts')
  expect(statusLine('read', 0, 4000, 'app.ts')).toBe('looking through app.ts')
  expect(statusLine('read', 0, 12000, 'app.ts')).toBe('reading app.ts')
  expect(statusLine('bash', 0, 0, '')).toBe('waiting on the shell…')
  expect(statusLine('read', 0, 0, '')).toBe('reading…')
})

test('every mode has its own line color', () => {
  expect(lineColor('bash')).toBe('#4f9a5a')
  expect(lineColor('error')).toBe('#d0503f')
})

test("a pet's own lines and colors replace the mod's for their modes", () => {
  expect(statusLine('read', 0, 0, 'app.ts', ['peeking into {}'])).toBe('peeking into app.ts')
  expect(statusLine('read', 0, 0, '', ['sorting {}', 'humming'])).toBe('humming')
  expect(lineColor('bash', { bash: '#22aa66' })).toBe('#22aa66')
  expect(lineColor('read', { bash: '#22aa66' })).toBe('#c98a2e')
})

test('durations print in the largest two units', () => {
  expect([0, 42_000, 185_000, 3_725_000].map(fmtDuration)).toEqual(['0s', '42s', '3m 05s', '1h 02m'])
})

test('the clock follows the turn while Claude works and the wait while Claude Code needs the user', () => {
  expect(clocked('thinking', 'think', 65_000, 1_000)).toBe('thinking · 1m 05s')
  expect(clocked('$ npm test', 'bash', 12_000, 1_000)).toBe('$ npm test · 12s')
  expect(clocked('waiting on you', 'alert', 90_000, 20_000)).toBe('waiting on you · 20s')
  expect(clocked('thinking', 'think', 3_000, 3_000)).toBe('thinking')
  expect(clocked('done!', 'cheer', 65_000, 0)).toBe('done!')
  expect(clocked('ready when you are', 'idle', undefined, 90_000)).toBe('ready when you are')
  expect(clocked('', 'think', 65_000, 0)).toBe('')
})
