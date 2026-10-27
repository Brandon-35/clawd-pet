import { expect, test } from 'claude-code/testing'

import { advisorCalls, advisorHealth, advisorLine, advisorToast, countAdvisor, modelFamily } from './advisor'

test('modelFamily reads the family from an alias or a full id, and nothing from an unknown name', () => {
  expect(modelFamily('claude-sonnet-5-5')).toBe('sonnet')
  expect(modelFamily('opusplan')).toBe('opus')
  expect(modelFamily('sonnet[1m]')).toBe('sonnet')
  expect(modelFamily('Claude-Fable-5-1')).toBe('fable')
  expect(modelFamily('haiku')).toBe('haiku')
  expect(modelFamily('gpt-9')).toBeUndefined()
  expect(modelFamily(undefined)).toBeUndefined()
})

test('the advisor runs only when stronger than the main model, and an idle one names its fix', () => {
  expect(advisorHealth('claude-sonnet-5-5', undefined)).toEqual({ state: 'none', text: 'no advisor set' })
  expect(advisorHealth('claude-sonnet-5-5', 'opus')).toEqual({ state: 'active', text: 'advisor opus · active' })
  expect(advisorHealth('claude-fable-5-1', 'opus')).toEqual({ state: 'idle', fix: '/model sonnet', text: 'advisor opus is not stronger than fable, so it never runs · fix: /model sonnet' })
  expect(advisorHealth('claude-opus-5-5', 'opus').fix).toBe('/advisor fable')
  expect(advisorHealth('claude-sonnet-5-5', 'sonnet').fix).toBe('/advisor opus')
  expect(advisorHealth('claude-sonnet-5-5', 'haiku').fix).toBe('/advisor opus')
  expect(advisorHealth('mystery', 'opus').state).toBe('unknown')
  expect(advisorHealth(undefined, 'opus').state).toBe('unknown')
  expect(advisorHealth('claude-sonnet-5-5', 'other').state).toBe('unknown')
})

test('only an advisor that never runs toasts', () => {
  expect(advisorToast('claude-fable-5-1', 'opus')).toBe('✻ advisor opus never runs under fable · /clawd advisor')
  expect(advisorToast('claude-sonnet-5-5', 'opus')).toBeUndefined()
  expect(advisorToast('mystery', 'opus')).toBeUndefined()
  expect(advisorToast('claude-fable-5-1', undefined)).toBeUndefined()
})

test('advisor calls count with their time, skipping a call that never ended and other server tools', () => {
  const u = countAdvisor({ calls: 0, ms: 0 }, [
    { name: 'advisor', startedAt: 1000, endedAt: 10_000 },
    { name: 'web_search', startedAt: 0, endedAt: 5000 },
    { name: 'advisor', startedAt: 2000 },
  ])
  expect(u).toEqual({ calls: 2, ms: 9000 })
  expect(countAdvisor(u)).toEqual(u)
  expect(advisorCalls({ calls: 2, ms: 14_000 })).toBe('×2 (14s)')
  expect(advisorCalls({ calls: 1, ms: 0 })).toBe('×1')
})

test('the report line shows the health and the session calls, and nothing with no advisor and no calls', () => {
  expect(advisorLine('claude-sonnet-5-5', 'opus', { calls: 3, ms: 41_000 })).toBe('- advisor: opus · active · 3 calls, 41s this session')
  expect(advisorLine('claude-fable-5-1', 'opus', { calls: 0, ms: 0 })).toBe('- advisor: opus is not stronger than fable, so it never runs · fix: /model sonnet')
  expect(advisorLine('claude-sonnet-5-5', undefined, { calls: 0, ms: 0 })).toBe('')
  expect(advisorLine(undefined, 'opus', { calls: 0, ms: 0 })).toBe('- advisor: opus')
})
