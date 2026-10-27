import { SHELL_FORMAT } from './shell'
import { fmtDuration } from './status'

/** A record older than this is a session that died without writing `ended`; the heartbeat writes every 60 s. */
export const PEER_STALE_MS = 150000
const MAX_LINES = 8

/** Another session, as its shell status record tells it. Every text field came from another process: cleaned, capped. */
export type Peer = {
  id: string
  mode: string
  line: string
  cwd: string
  hp?: number
  turnStartedAt?: number
  at: number
  protocol?: number // the peer protocol the session understands; absent for a version that wrote no field 11
}

/** Control characters out, whitespace collapsed, cut to `max` characters. */
const clean = (s: string, max: number) => [...s.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim()].slice(0, max).join('')

const num = (s: string | undefined) => {
  const n = s === undefined || s === '' ? NaN : Number(s)
  return Number.isFinite(n) ? n : undefined
}

/** The record `shellRecord` wrote for session `id`, or undefined for another format, an ended session, or a malformed line. */
export function parseRecord(id: string, text: string): Peer | undefined {
  const f = text.split('\n')[0]?.split('\t') ?? []
  const at = num(f[9])
  const mode = clean(f[1] ?? '', 16)
  if (f.length < 10 || f[0] !== String(SHELL_FORMAT) || at === undefined || mode === '' || mode === 'ended') {
    return undefined
  }
  const hp = num(f[5])
  const turnStartedAt = num(f[8])
  const protocol = num(f[10])

  return {
    id: clean(id, 64),
    mode,
    line: clean(f[3] ?? '', 60),
    cwd: clean(f[4] ?? '', 200),
    ...(hp !== undefined && hp >= 0 && hp <= 100 && { hp: Math.round(hp) }),
    ...(turnStartedAt !== undefined && { turnStartedAt }),
    at,
    ...(protocol !== undefined && { protocol }),
  }
}

const rank = (p: Peer) => (p.mode === 'alert' ? 0 : p.mode === 'idle' || p.mode === 'sleep' ? 2 : 1)
const base = (cwd: string, home: string) => (home !== '' && cwd === home ? '~' : cwd.replace(/\/+$/, '').split('/').pop() || cwd || '?')

/** The other sessions still alive at `now`: the ones waiting on the user first, then the working, then the idle, each by folder. */
export function livePeers(peers: Peer[], now: number, selfId: string) {
  return peers
    .filter(p => p.id !== selfId && now - p.at <= PEER_STALE_MS)
    .sort((a, b) => rank(a) - rank(b) || base(a.cwd, '').localeCompare(base(b.cwd, '')) || a.id.localeCompare(b.id))
}

/** Each peer's name: its folder's name, plus the start of its id where two share a folder name. */
export function namePeers(list: Peer[], home = '') {
  const names = list.map(p => base(p.cwd, home))

  return list.map((p, i) => (names.filter(n => n === names[i]).length > 1 ? `${names[i]} #${p.id.slice(0, 4)}` : names[i]))
}

/** What `/clawd peers` prints: one line per live peer, at most eight. */
export function peersReport(list: Peer[], now: number, home = '') {
  if (list.length === 0) {
    return 'no other live sessions'
  }
  const names = namePeers(list, home)
  const lines = list.slice(0, MAX_LINES).map((p, i) => {
    const doing = p.mode === 'alert' ? '✻ needs you' : rank(p) === 2 ? p.mode : p.line || p.mode
    const clock = rank(p) === 1 && p.turnStartedAt !== undefined ? fmtDuration(now - p.turnStartedAt) : ''

    return `- ${[names[i], doing, clock, p.hp === undefined ? '' : `HP ${p.hp}%`].filter(s => s !== '').join(' · ')}`
  })

  return [...lines, ...(list.length > MAX_LINES ? [`… and ${list.length - MAX_LINES} more`] : [])].join('\n')
}

/** The report's one line on the peers, or '' when there is none. */
export function peersLine(list: Peer[]) {
  const waiting = list.filter(p => p.mode === 'alert').length

  return list.length === 0 ? '' : `- peers: ${list.length} live${waiting > 0 ? `, ${waiting} needs you` : ''}`
}
