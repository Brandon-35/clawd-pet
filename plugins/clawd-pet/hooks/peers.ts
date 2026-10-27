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
export const clean = (s: string, max: number) => [...s.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim()].slice(0, max).join('')

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

/** `cwd` with the home folder as `~`, cut to its last 40 characters. */
export const shortPath = (cwd: string, home = '') => {
  const p = home !== '' && (cwd === home || cwd.startsWith(`${home}/`)) ? `~${cwd.slice(home.length)}` : cwd
  return p.length > 40 ? `…${p.slice(-39)}` : p
}

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

    return `- ${[names[i], doing, clock, p.hp === undefined ? '' : `HP ${p.hp}%`, shortPath(p.cwd, home)].filter(s => s !== '').join(' · ')}`
  })

  return [...lines, ...(list.length > MAX_LINES ? [`… and ${list.length - MAX_LINES} more`] : [])].join('\n')
}

/** The report's one line on the peers, or '' when there is none. */
export function peersLine(list: Peer[]) {
  const waiting = list.filter(p => p.mode === 'alert').length

  return list.length === 0 ? '' : `- peers: ${list.length} live${waiting > 0 ? `, ${waiting} needs you` : ''}`
}

/** A turn shorter than this ends without a toast in the other sessions. */
export const PEER_LONG_TURN_MS = 30000

/** What changed in another session between two reads that the user should hear about from here. */
export type PeerEvent = { kind: 'finished' | 'waiting'; id: string; text: string }

/**
 * The events between the live peers `before` and `now`, read at `at`: a peer that started waiting on the user, and one
 * whose turn of 30 s or more ended. A peer seen for the first time, or gone, makes none.
 */
export function peerEvents(before: Peer[], now: Peer[], at: number, home = ''): PeerEvent[] {
  const was = new Map(before.map(p => [p.id, p]))
  const names = namePeers(now, home)
  const events: PeerEvent[] = []
  now.forEach((p, i) => {
    const b = was.get(p.id)
    if (!b) {
      return
    }
    if (p.mode === 'alert') {
      // Only mid-turn, as at a permission prompt: the idle reminder after a turn would repeat its finish.
      if (b.mode !== 'alert' && p.turnStartedAt !== undefined) {
        events.push({ kind: 'waiting', id: p.id, text: `✻ ${names[i]} needs you` })
      }
    } else if (b.turnStartedAt !== undefined && p.turnStartedAt === undefined && at - b.turnStartedAt >= PEER_LONG_TURN_MS) {
      // Any mode but waiting: a read can land on the cheer between a turn's end and idle.
      events.push({ kind: 'finished', id: p.id, text: `✻ ${names[i]} finished (${fmtDuration(at - b.turnStartedAt)})` })
    }
  })

  return events
}

/** How many of the live peers wait on the user. */
export const waitingPeers = (list: Peer[]) => list.filter(p => p.mode === 'alert').length

/** The longest message `/clawd send` passes on; the rest is cut. */
export const SEND_MAX = 2000

/** `/clawd <verb> <peer> <text…>` read from the command's args: the peer's first word and the rest as the text, cut to `max`, or undefined. */
export function parsePeerCommand(args: string, verb: string, max = SEND_MAX) {
  const [, word, peer, text] = /^(\S+)\s+(\S+)\s+([\s\S]*\S)\s*$/.exec(args.trim()) ?? []

  return word === verb && peer && text ? { peer, text: [...text].slice(0, max).join('') } : undefined
}

/** `/clawd send <peer> <text…>` read from the command's args, or undefined. */
export const parseSend = (args: string) => parsePeerCommand(args, 'send')

/**
 * The live peer `query` names, matched without case against the names `namePeers` gives: an exact name first, then
 * the start of one name, then the start of one id of 4 characters or more, with its name. Otherwise an error that says why.
 */
export function findPeer(list: Peer[], query: string, home = ''): { peer?: Peer; name?: string; error?: string } {
  const q = query.replace(/^#/, '').toLowerCase()
  const names = namePeers(list, home)
  const all = list.map((p, i) => ({ p, name: names[i] ?? p.id }))
  const tries = [
    all.filter(x => x.name.toLowerCase() === q),
    all.filter(x => x.name.toLowerCase().startsWith(q)),
    q.length >= 4 ? all.filter(x => x.p.id.toLowerCase().startsWith(q)) : [],
  ]
  for (const hits of tries) {
    const [hit] = hits
    if (hit && hits.length === 1) {
      return { peer: hit.p, name: hit.name }
    }
    if (hits.length > 1) {
      return { error: `"${query}" matches several: ${hits.map(x => x.name).join(', ')}` }
    }
  }

  return { error: `no live session matches "${query}"` }
}

/** What `/clawd send` prints after a send to the peer named `name`. */
export const sendReport = (name: string, result: { isDelivered: boolean; reason?: string }) =>
  result.isDelivered ? `sent to ${name}` : `not sent to ${name}: ${result.reason ?? 'unknown reason'}`

/**
 * The typeahead rows for the peer word of `/clawd send` and `/clawd note`: `#` lists every live peer, other text the
 * ones whose name or folder holds it. A row writes the peer's name, or `#` and its id where the name has a space.
 */
export function peerSuggestions(before: string, token: string, list: Peer[], now: number, home = '') {
  if (!/^\s*\/clawd\s+(send|note)\s+$/.test(before)) {
    return []
  }
  const q = token.replace(/^#/, '').toLowerCase()
  const names = namePeers(list, home)

  return list
    .map((p, i) => ({ p, name: names[i] ?? p.id }))
    .filter(x => q === '' || x.name.toLowerCase().includes(q) || x.p.cwd.toLowerCase().includes(q) || x.p.id.toLowerCase().startsWith(q))
    .slice(0, MAX_LINES)
    .map(({ p, name }) => ({
      text: `${/\s/.test(name) ? `#${p.id.slice(0, 8)}` : name} `,
      label: name,
      description: [shortPath(p.cwd, home), p.mode === 'alert' ? 'needs you' : p.mode, p.turnStartedAt === undefined ? '' : fmtDuration(now - p.turnStartedAt)].filter(s => s !== '').join(' · '),
    }))
}

const SUBCOMMANDS = [
  { name: 'peers', description: 'list your other live sessions' },
  { name: 'send', description: 'message another session: /clawd send <session> <message>' },
  { name: 'note', description: 'show a note to the person in another session, never its model' },
  { name: 'advisor', description: 'check that the advisor runs under the main model, and fill the fix' },
]

/** The typeahead rows for the word after `/clawd`: the subcommands that start with `token`. */
export function subcommandSuggestions(before: string, token: string) {
  if (!/^\s*\/clawd\s+$/.test(before)) {
    return []
  }
  const q = token.toLowerCase()

  return SUBCOMMANDS.filter(c => c.name.startsWith(q)).map(c => ({ text: `${c.name} `, label: c.name, description: c.description }))
}
