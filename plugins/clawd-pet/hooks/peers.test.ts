import { expect, test } from 'claude-code/testing'

import { findPeer, livePeers, namePeers, parseRecord, parseSend, peerEvents, peersLine, peersReport, sendReport, waitingPeers } from './peers'
import type { Peer } from './peers'
import { shellRecord } from './shell'

const peer = (id: string, mode: string, cwd: string, more: Partial<Peer> = {}): Peer => ({ id, mode, line: '', cwd, at: 0, ...more })

test('a record shellRecord wrote reads back, with the peer protocol from field 11', () => {
  const text = shellRecord({ mode: 'bash', color: '#4f9a5a', line: 'running npm test', cwd: '/w/api', hp: 72, turnStartedAt: 1000 }, 5000)
  expect(parseRecord('a1b2c3', text)).toEqual({ id: 'a1b2c3', mode: 'bash', line: 'running npm test', cwd: '/w/api', hp: 72, turnStartedAt: 1000, at: 5000, protocol: 1 })
})

test('a record from before field 11 reads with no protocol', () => {
  expect(parseRecord('x', '1\tidle\t#888\t\t/w/docs\t90\t\t\t\t5000\t\n')).toEqual({ id: 'x', mode: 'idle', line: '', cwd: '/w/docs', hp: 90, at: 5000 })
})

test('an ended session, another format, or a malformed line is no peer', () => {
  expect(parseRecord('x', '1\tended\t\t\t/w\t\t\t\t\t9\t1\t\n')).toBe(undefined)
  expect(parseRecord('x', '2\tidle\t\t\t/w\t\t\t\t\t9\t\n')).toBe(undefined)
  expect(parseRecord('x', '1\tidle\t\t\t/w\t\t\t\t\tsoon\t\n')).toBe(undefined)
  expect(parseRecord('x', '1\tidle\t/w')).toBe(undefined)
  expect(parseRecord('x', '')).toBe(undefined)
})

test('control characters are stripped and long text is cut', () => {
  const p = parseRecord('x\u001b', `1\tbash\t\t\u001b[31mrm\u0007  -rf ${'y'.repeat(80)}\t/w/\u0000app\t500\t\t\t\t9\t\n`)
  expect(p?.id).toBe('x')
  expect(p?.line).toBe(`[31mrm -rf ${'y'.repeat(49)}`)
  expect(p?.line.length).toBe(60)
  expect(p?.cwd).toBe('/w/ app')
  expect(p?.hp).toBe(undefined)
})

test('live peers leave out this session and stale records, and put the ones waiting on the user first', () => {
  const list = [
    peer('self', 'alert', '/w/me', { at: 100000 }),
    peer('old', 'alert', '/w/gone', { at: 0 }),
    peer('i1', 'idle', '/w/docs', { at: 100000 }),
    peer('b1', 'bash', '/w/zeta', { at: 100000 }),
    peer('b2', 'read', '/w/api', { at: 100000 }),
    peer('a1', 'alert', '/w/web', { at: 100000 }),
  ]
  expect(livePeers(list, 160000, 'self').map(p => p.id)).toEqual(['a1', 'b2', 'b1', 'i1'])
})

test('two peers in folders of one name get the start of their id', () => {
  expect(namePeers([peer('a1b2c3', 'idle', '/w/app'), peer('ffee99', 'idle', '/x/app'), peer('z', 'idle', '/home/u')], '/home/u')).toEqual(['app #a1b2', 'app #ffee', '~'])
})

test('the peers report: needs you, a running clock, idle, and nothing when alone', () => {
  const list = [
    peer('a1b2', 'alert', '/w/clawd-pet', { hp: 41 }),
    peer('c3', 'bash', '/w/api', { line: 'running npm test', turnStartedAt: 0, hp: 72 }),
    peer('d4', 'idle', '/w/docs', { hp: 90 }),
  ]
  expect(peersReport(list, 185000)).toBe('- clawd-pet · ✻ needs you · HP 41%\n- api · running npm test · 3m 05s · HP 72%\n- docs · idle · HP 90%')
  expect(peersReport([], 0)).toBe('no other live sessions')
  expect(peersLine(list)).toBe('- peers: 3 live, 1 needs you')
  expect(peersLine([])).toBe('')
})

test('the peers report shows eight and counts the rest', () => {
  const list = Array.from({ length: 11 }, (_, i) => peer(`p${i}`, 'idle', `/w/p${i}`))
  const lines = peersReport(list, 0).split('\n')
  expect(lines.length).toBe(9)
  expect(lines.at(-1)).toBe('… and 3 more')
})

test('a peer whose turn of 30 s or more ended is finished; a shorter turn says nothing', () => {
  const before = [peer('a', 'bash', '/w/api', { turnStartedAt: 0 }), peer('b', 'read', '/w/web', { turnStartedAt: 170000 })]
  const now = [peer('a', 'idle', '/w/api'), peer('b', 'idle', '/w/web')]
  expect(peerEvents(before, now, 185000)).toEqual([{ kind: 'finished', id: 'a', text: '✻ api finished (3m 05s)' }])
  expect(peerEvents([peer('a', 'bash', '/w/api', { turnStartedAt: 0 })], [peer('a', 'cheer', '/w/api')], 30000).map(e => e.text)).toEqual(['✻ api finished (30s)'])
})

test('a peer that starts waiting on the user mid-turn needs you, once; the idle reminder after a turn does not', () => {
  const working = [peer('a', 'bash', '/w/api', { turnStartedAt: 0 })]
  const waiting = [peer('a', 'alert', '/w/api', { turnStartedAt: 0 })]
  expect(peerEvents(working, waiting, 60000)).toEqual([{ kind: 'waiting', id: 'a', text: '✻ api needs you' }])
  expect(peerEvents(waiting, waiting, 70000)).toEqual([])
  expect(peerEvents([peer('a', 'idle', '/w/api')], [peer('a', 'alert', '/w/api')], 70000)).toEqual([])
  expect(waitingPeers([...waiting, peer('b', 'idle', '/w/web')])).toBe(1)
})

test('a peer seen for the first time or gone makes no event', () => {
  expect(peerEvents([], [peer('a', 'alert', '/w/api'), peer('b', 'idle', '/w/web')], 60000)).toEqual([])
  expect(peerEvents([peer('a', 'bash', '/w/api', { turnStartedAt: 0 })], [], 60000)).toEqual([])
})

test('parseSend reads the peer and the message, and refuses a send with no message or another command', () => {
  expect(parseSend('send api  run the tests now ')).toEqual({ peer: 'api', text: 'run the tests now' })
  expect(parseSend(' send a1b2 hi')).toEqual({ peer: 'a1b2', text: 'hi' })
  expect(parseSend('send api')).toBe(undefined)
  expect(parseSend('send api   ')).toBe(undefined)
  expect(parseSend('send')).toBe(undefined)
  expect(parseSend('peers')).toBe(undefined)
  expect(parseSend('sending api hi')).toBe(undefined)
})

test('parseSend cuts a long message to 2000 characters', () => {
  expect(parseSend(`send api ${'x'.repeat(2500)}`)?.text.length).toBe(2000)
})

test('findPeer matches an exact name, then a unique prefix, then an id prefix of 4 or more', () => {
  const list = [peer('a1b2c3', 'idle', '/w/api'), peer('c3d4e5', 'idle', '/w/api'), peer('e5f6a7', 'bash', '/w/web'), peer('f0f0f0', 'idle', '/w/webapp')]
  expect(findPeer(list, 'WEB').peer?.id).toBe('e5f6a7')
  expect(findPeer(list, 'weba').peer?.id).toBe('f0f0f0')
  expect(findPeer(list, 'api').error).toBe('"api" matches several: api #a1b2, api #c3d4')
  expect(findPeer(list, 'c3d4').peer?.id).toBe('c3d4e5')
  expect(findPeer(list, 'c3d').error).toBe('no live session matches "c3d"')
  expect(findPeer(list, 'docs').error).toBe('no live session matches "docs"')
  expect(findPeer([], 'api').error).toBe('no live session matches "api"')
})

test('sendReport says whether the message went', () => {
  expect(sendReport('api', { isDelivered: true })).toBe('sent to api')
  expect(sendReport('api', { isDelivered: false, reason: 'the session is gone' })).toBe('not sent to api: the session is gone')
})
