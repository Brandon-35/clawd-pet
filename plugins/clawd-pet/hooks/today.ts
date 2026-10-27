import { fmtDuration } from './status'

/** The day's work across every session on this machine, as `/clawd` reports it; kept in `$.store`. */
export type Today = { day: string; sessions: number; turns: number; workMs: number; calls: number }

const pad = (n: number) => String(n).padStart(2, '0')
const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0)

/** The local calendar day of `now`, as `2026-10-27`. */
export function dayOf(now: number) {
  const d = new Date(now)

  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** The kept value as the counts of `day`: zeros when it is from another day, missing, or malformed. */
export function readToday(v: unknown, day: string): Today {
  const o = typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {}
  const same = o.day === day

  return { day, sessions: same ? count(o.sessions) : 0, turns: same ? count(o.turns) : 0, workMs: same ? count(o.workMs) : 0, calls: same ? count(o.calls) : 0 }
}

/** The kept value `v` with `add` counted in on the day of `now`. A new day starts from zero. */
export function addToday(v: unknown, now: number, add: Partial<Omit<Today, 'day'>>): Today {
  const t = readToday(v, dayOf(now))

  return {
    day: t.day,
    sessions: t.sessions + (add.sessions ?? 0),
    turns: t.turns + (add.turns ?? 0),
    workMs: t.workMs + (add.workMs ?? 0),
    calls: t.calls + (add.calls ?? 0),
  }
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

/** The report's line for the day. */
export const todayLine = (t: Today) =>
  `- today, in every session: ${plural(t.sessions, 'session')}, ${plural(t.turns, 'turn')}, ${fmtDuration(t.workMs)} of work, ${plural(t.calls, 'tool call')}`
