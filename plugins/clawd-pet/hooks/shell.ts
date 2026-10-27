import type { Mode } from '../types'

/** Where the shell status lives, under the user's home: one file per session, which the zsh plugin reads. */
export const SHELL_DIR = '.cache/clawd-pet/sessions'
export const SHELL_FORMAT = 1 // the record's first field; the zsh plugin skips a record of a format it does not know
export const PEER_PROTOCOL = 1 // the record's field 11: the peer protocol this session understands, so mod-to-mod messages go only to sessions that read them
const HEARTBEAT_MS = 60000 // an idle session still writes this often, so the shell can tell a live one from a dead one

/** What the shell shows of one session. `ended` is the last record of a session that closed. */
export type ShellState = {
  mode: Mode | 'ended'
  color: string
  line: string
  cwd: string
  hp?: number
  mp?: number
  st?: number
  turnStartedAt?: number // the running turn's start, so the shell keeps the clock going between writes
}

const field = (v: string | number | undefined) => (v === undefined ? '' : String(v).replace(/[\t\n\r]/g, ' '))

/**
 * The session's record as one tab-separated line, the cheapest thing for zsh to read: format, mode, color, the
 * status line, the session's directory, HP, MP, ST, the turn's start, the time written (ms), the peer protocol, and a
 * closing tab. The zsh plugin reads fields by position, so a field added at the end keeps the format.
 */
export function shellRecord(s: ShellState, at: number) {
  return `${[SHELL_FORMAT, s.mode, s.color, s.line, s.cwd, s.hp, s.mp, s.st, s.turnStartedAt, at, PEER_PROTOCOL].map(field).join('\t')}\t\n`
}

/** What a write is for: a record is due when what the shell shows changed, or the heartbeat is up. */
export const shellKey = (s: ShellState) => [s.mode, s.cwd, s.hp, s.mp, s.st, s.turnStartedAt].join('|')

export const shellDue = (s: ShellState, lastKey: string, lastAt: number, now: number) => shellKey(s) !== lastKey || now - lastAt >= HEARTBEAT_MS
