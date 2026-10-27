import { expect, test } from 'claude-code/testing'

import { estimateTokens, heaviestLine, heavyWarning, keepHeaviest } from './heavy'

test('a tool result with string content counts four characters a token', () => {
  expect(estimateTokens([{ type: 'tool_result', tool_use_id: 'a', content: 'x'.repeat(40001) }])).toBe(10001)
})

test('a tool result with block content counts its text and images', () => {
  const content = [
    { type: 'text', text: 'x'.repeat(8) },
    { type: 'image', source: {} },
  ]
  expect(estimateTokens([{ type: 'tool_result', tool_use_id: 'a', content }])).toBe(1602)
  expect(estimateTokens([{ type: 'text', text: 'abc' }])).toBe(1)
})

test('an unknown block or a tool result with no content counts nothing', () => {
  expect(estimateTokens([{ type: 'document', source: {} }, { type: 'tool_result', tool_use_id: 'a' }])).toBe(0)
})

test('the warning gives advice for the tool', () => {
  expect(heavyWarning('Read', 'big.log', 14000)).toBe('Read big.log added ~14k tokens to the context; Read with offset/limit or Grep to take less')
  expect(heavyWarning('Bash', 'npm test', 11000)).toContain('pipe through head, tail or grep')
  expect(heavyWarning('Grep', 'foo', 11000)).toContain('narrow the pattern or use head_limit')
  expect(heavyWarning('WebFetch', 'example.com', 11000)).toContain('ask a narrower prompt')
  expect(heavyWarning('mcp__db__query', 'query', 11000)).toBe('query query added ~11k tokens to the context; ask for less to take less')
  expect(heavyWarning('Read', '', 14000)).toBe('Read added ~14k tokens to the context; Read with offset/limit or Grep to take less')
})

test('the warning cuts a long target to fit', () => {
  const w = heavyWarning('Read', 'x'.repeat(200), 14000)
  expect(w.length).toBe(110)
  expect(w).toContain('x… added ~14k tokens')
})

test('keepHeaviest keeps the three heaviest, heaviest first', () => {
  let list = keepHeaviest([], { tool: 'Read', target: 'a', tokens: 11000 })
  list = keepHeaviest(list, { tool: 'Bash', target: 'b', tokens: 30000 })
  list = keepHeaviest(list, { tool: 'Grep', target: 'c', tokens: 12000 })
  list = keepHeaviest(list, { tool: 'Read', target: 'd', tokens: 20000 })
  expect(list.map(h => h.target)).toEqual(['b', 'd', 'c'])
})

test('the report line names the heaviest results, or is empty', () => {
  expect(heaviestLine([])).toBe('')
  expect(
    heaviestLine([
      { tool: 'Read', target: 'big.log', tokens: 14000 },
      { tool: 'Bash', target: '', tokens: 11000 },
    ]),
  ).toBe('- heaviest results: Read big.log ~14k · Bash ~11k')
})
