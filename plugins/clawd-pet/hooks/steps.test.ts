import { expect, test } from 'claude-code/testing'

import { cacheLine, countCache, NO_CACHE, stepAlerts } from './steps'

const usage = (input: number, read: number, created: number, model = 'claude-opus-5-5') => ({
  input_tokens: input,
  cache_read_input_tokens: read,
  cache_creation_input_tokens: created,
  model,
})

test('the cache counts sum each step with usage, and a step without usage changes nothing', () => {
  const c = countCache(countCache(NO_CACHE, usage(4, 121694, 57215)), usage(2, 178000, 900))
  expect(c).toEqual({ input: 6, read: 299694, created: 58115, steps: 2 })
  expect(countCache(c, null)).toBe(c)
})

test('the cache line gives the share of input read from the cache, and nothing before any input', () => {
  expect(cacheLine({ input: 10, read: 940, created: 50, steps: 3 })).toBe('- cache: 94% of input read from cache')
  expect(cacheLine(NO_CACHE)).toBe('')
})

test('a later step that re-writes 20k or more tokens and reads fewer alerts that the cache went cold', () => {
  const before = countCache(NO_CACHE, usage(4, 0, 30000))
  expect(stepAlerts(before, 'claude-opus-5-5', { stopReason: 'end_turn', usage: usage(4, 1000, 57215) })).toEqual([
    { kind: 'cache', text: '❄ prompt cache went cold: 57k tokens re-cached' },
  ])
})

test('the session first step, a small write, or a write smaller than the read stays quiet', () => {
  const before = countCache(NO_CACHE, usage(4, 0, 30000))
  const quiet = (b: typeof before, u: ReturnType<typeof usage>) => stepAlerts(b, 'claude-opus-5-5', { stopReason: 'end_turn', usage: u })
  expect(quiet(NO_CACHE, usage(4, 0, 57215))).toEqual([])
  expect(quiet(before, usage(4, 0, 19999))).toEqual([])
  expect(quiet(before, usage(4, 121694, 57215))).toEqual([])
})

test('a reply cut at max_tokens, a refusal and a full context window each alert', () => {
  const alert = (stopReason: string | null) => stepAlerts(NO_CACHE, 'claude-opus-5-5', { stopReason, usage: null })
  expect(alert('max_tokens')).toEqual([{ kind: 'max_tokens', text: '✂ the reply hit max_tokens and was cut' }])
  expect(alert('refusal')).toEqual([{ kind: 'refusal', text: 'the model refused this request' }])
  expect(alert('model_context_window_exceeded')).toEqual([{ kind: 'model_context_window_exceeded', text: 'context window full · /compact' }])
  expect(alert('end_turn')).toEqual([])
  expect(alert('tool_use')).toEqual([])
  expect(alert(null)).toEqual([])
})

test('an answer from another family than the one asked for alerts the fallback, and an unknown family stays quiet', () => {
  const answered = (model: string, by: string) => stepAlerts(NO_CACHE, model, { stopReason: 'end_turn', usage: usage(4, 0, 0, by) })
  expect(answered('claude-opus-5-5', 'claude-sonnet-5-5')).toEqual([{ kind: 'fallback', text: '↯ answered by sonnet, not opus' }])
  expect(answered('opus', 'claude-opus-5-5')).toEqual([])
  expect(answered('custom-model', 'claude-sonnet-5-5')).toEqual([])
  expect(answered('claude-opus-5-5', 'other-model')).toEqual([])
})
