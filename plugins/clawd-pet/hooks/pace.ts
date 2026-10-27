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
