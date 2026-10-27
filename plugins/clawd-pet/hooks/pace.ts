const TURNS_KEPT = 6 // the context readings a forecast reads, so it follows the recent pace

/**
 * The context left, in %, at the end of each recent main-loop turn, after `hp` is read at the end of one more. A rise
 * (a compaction, a cleared conversation) starts the list over.
 */
export function noteTurn(hps: number[], hp: number) {
  const last = hps[hps.length - 1]

  return last !== undefined && hp > last ? [hp] : [...hps, hp].slice(-TURNS_KEPT)
}

/** About how many more turns fit in the context at the recent pace, from `noteTurn`'s list; undefined before two readings or while nothing is used. */
export function turnsLeft(hps: number[]) {
  const first = hps[0]
  const last = hps[hps.length - 1]
  if (first === undefined || last === undefined || hps.length < 2 || first <= last) {
    return undefined
  }

  return Math.floor(last / ((first - last) / (hps.length - 1)))
}

/** The first reading of a rate limit in its current window: when, the share left, and when the window resets. */
export type LimitStart = { at: number; left: number; resetsAt: number }

const WINDOW_MOVED_MS = 10 * 60000 // a reset time that moves this far means a new window

/**
 * The start of the limit's window after a reading of `left` % that resets in `resetsInMin`, at `t`: kept, or
 * started over when there was none, the window moved, or the share left rose.
 */
export function limitStart(start: LimitStart | undefined, left: number | undefined, resetsInMin: number | undefined, t: number) {
  if (left === undefined || resetsInMin === undefined) {
    return undefined
  }
  const resetsAt = t + resetsInMin * 60000
  const moved = !start || Math.abs(start.resetsAt - resetsAt) > WINDOW_MOVED_MS || left > start.left

  return moved ? { at: t, left, resetsAt } : start
}

/**
 * The minutes until the limit runs out at the pace since `start`, when that comes before its reset; else undefined.
 * The pace needs `minMs` of readings, so one burst does not make a forecast.
 */
export function runsOutInMin(start: LimitStart | undefined, left: number | undefined, t: number, minMs: number) {
  if (!start || left === undefined || t - start.at < minMs || left >= start.left) {
    return undefined
  }
  const outMs = left / ((start.left - left) / (t - start.at))

  return t + outMs < start.resetsAt ? Math.max(0, Math.round(outMs / 60000)) : undefined
}

/** One rate limit's pace: the start of its window, and the window whose forecast already warned. */
export type LimitPace = { start?: LimitStart; warnedAt?: number }

/**
 * The limit's pace after a reading at `t`, the minutes until it runs out when that beats the reset, and whether to
 * warn: once per window, the first time the forecast says it runs out first.
 */
export function stepLimit(p: LimitPace, left: number | undefined, resetsInMin: number | undefined, t: number, minMs: number) {
  const start = limitStart(p.start, left, resetsInMin, t)
  const outMin = runsOutInMin(start, left, t, minMs)
  const warn = outMin !== undefined && start !== undefined && p.warnedAt !== start.at

  return { pace: { start, warnedAt: warn ? start?.at : p.warnedAt }, outMin, warn }
}
