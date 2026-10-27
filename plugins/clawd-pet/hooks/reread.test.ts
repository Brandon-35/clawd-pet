import { expect, test } from 'claude-code/testing'

import { forgetAll, forgetPath, noteRead, noteTokens, readKey, rereadWarning } from './reread'

const app = readKey({ file_path: '/a/app.ts' })

test('a ranged read and a whole read of one file have different keys', () => {
  expect(readKey({ file_path: '/a/app.ts', offset: 10, limit: 50 })).not.toBe(app)
  expect(readKey({ file_path: '/a/app.ts', offset: 10, limit: 50 })).toBe(readKey({ file_path: '/a/app.ts', offset: 10, limit: 50 }))
})

test('the same read of an unchanged file is a re-read, told once', () => {
  let r = noteRead({}, app, 1000, 2, 500)
  expect(r.again).toBe(undefined)
  r = noteRead(noteTokens(r.reads, app, 4200), app, 9000, 5, 500)
  expect(r.again).toEqual({ agoMs: 8000, turnsAgo: 3, tokens: 4200, told: false })
  r = noteRead(r.reads, app, 9500, 5, 500)
  expect(r.again?.told).toBe(true)
})

test('a file changed on disk, or with an unknown mtime, is a new read', () => {
  const first = noteRead({}, app, 1000, 2, 500).reads
  expect(noteRead(first, app, 2000, 3, 600).again).toBe(undefined)
  expect(noteRead(first, app, 2000, 3, undefined).again).toBe(undefined)
})

test('an edit forgets every read of its file, a compaction forgets all', () => {
  const other = readKey({ file_path: '/a/app.tsx' })
  let reads = noteRead({}, app, 0, 0, 1).reads
  reads = noteRead(reads, readKey({ file_path: '/a/app.ts', offset: 5 }), 0, 0, 1).reads
  reads = noteRead(reads, other, 0, 0, 1).reads
  expect(Object.keys(forgetPath(reads, '/a/app.ts'))).toEqual([other])
  expect(forgetAll()).toEqual({})
})

test('noteTokens leaves an unknown key alone', () => {
  expect(noteTokens({}, app, 10)).toEqual({})
})

test('the warning names the target, when it was read, and its size when known', () => {
  expect(rereadWarning('src/app.ts', { agoMs: 0, turnsAgo: 3, tokens: 4200, told: false })).toBe(
    'src/app.ts is already in context, unchanged since it was read 3 turns ago (~4.2k tokens)',
  )
  expect(rereadWarning('app.ts', { agoMs: 0, turnsAgo: 1, told: false })).toBe('app.ts is already in context, unchanged since it was read 1 turn ago')
  expect(rereadWarning('', { agoMs: 0, turnsAgo: 0, told: false })).toBe('this file is already in context, unchanged since it was read this turn')
})
