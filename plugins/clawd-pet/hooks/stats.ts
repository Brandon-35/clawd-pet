import { advisorCalls } from './advisor'
import type { AdvisorUse } from './advisor'
import { aboutTurns, fmtMin, fmtTokens, fmtUsd } from './hud'
import type { Forecast, Hud } from './hud'
import { fmtDuration } from './status'
import type { ToolMode } from './status'

const MODE_ORDER: ToolMode[] = ['read', 'search', 'edit', 'bash', 'web', 'agent']
const MAX_FILES = 1000 // past this, new files stop counting rather than grow the list

/** What the session has done, counted from the main loop's turns and every tool call. */
export type Stats = {
  since: number // when the count started
  turns: number
  workMs: number // the turns' time, summed
  calls: Partial<Record<ToolMode, number>>
  failed: number
  files: string[] // each file an edit touched, once
  streak?: number // failed tool calls in a row, up to now
  rereads?: number // reads of a file the context already held unchanged
  compactions?: number // compactions of the main conversation
  freed?: number // tokens those compactions freed, summed
  lastTurnUsd?: number // what the latest main-loop turn cost, when the host keeps a ledger
  untested?: number // main-loop turns that edited code files and ran no check
  sent?: number // messages `/clawd send` delivered to other sessions
}

export const newStats = (since: number): Stats => ({ since, turns: 0, workMs: 0, calls: {}, failed: 0, files: [] })

/** `s` after one tool call in `mode` on `file` ('' for none), which failed or not. */
export function countCall(s: Stats, mode: ToolMode, file: string, failed: boolean): Stats {
  const isNew = mode === 'edit' && file !== '' && !s.files.includes(file) && s.files.length < MAX_FILES

  return {
    ...s,
    calls: { ...s.calls, [mode]: (s.calls[mode] ?? 0) + 1 },
    failed: s.failed + (failed ? 1 : 0),
    streak: failed ? (s.streak ?? 0) + 1 : 0,
    files: isNew ? [...s.files, file] : s.files,
  }
}

/** `s` after a main-loop turn that took `durationMs` and cost `usd` (undefined when unknown). */
export const countTurn = (s: Stats, durationMs: number, usd?: number): Stats => ({ ...s, turns: s.turns + 1, workMs: s.workMs + Math.max(0, durationMs), lastTurnUsd: usd })

const known = (v: number | undefined): v is number => typeof v === 'number' && Number.isFinite(v)

/** What a turn cost from the session cost at its start and its end; undefined when either is unknown or it fell. */
export function turnCost(startUsd?: number, endUsd?: number) {
  return known(startUsd) && known(endUsd) && endUsd >= startUsd ? endUsd - startUsd : undefined
}

const CENT = 0.01 // below a cent, a cost would print as $0.00

/** `usd` as money when it is at least a cent, otherwise nothing. */
const spent = (usd?: number) => (known(usd) && usd >= CENT ? fmtUsd(usd) : undefined)

/** `s` after one read of something the context already held. */
export const countReread = (s: Stats): Stats => ({ ...s, rereads: (s.rereads ?? 0) + 1 })

/** `s` after a compaction that freed `freed` tokens. */
export const countCompaction = (s: Stats, freed: number): Stats => ({ ...s, compactions: (s.compactions ?? 0) + 1, freed: (s.freed ?? 0) + Math.max(0, freed) })

/** `s` after a turn that edited code files and ran no check. */
export const countUntested = (s: Stats): Stats => ({ ...s, untested: (s.untested ?? 0) + 1 })

/** `s` after one message `/clawd send` delivered. */
export const countSent = (s: Stats): Stats => ({ ...s, sent: (s.sent ?? 0) + 1 })

/** All the tool calls `s` counted. */
export const callCount = (s: Stats) => MODE_ORDER.reduce((n, m) => n + (s.calls[m] ?? 0), 0)

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** What `/clawd` prints: the session's turns, tool calls by kind, failures, files edited, and the HUD's readings. */
export function statsReport(s: Stats, now: number, hud?: Hud, forecast: Forecast = {}) {
  const calls = callCount(s)
  const kinds = MODE_ORDER.filter(m => s.calls[m]).map(m => `${s.calls[m]} ${m}`)
  const share = calls > 0 ? ` (${Math.round((s.failed / calls) * 100)}%)` : ''
  const limit = (label: string, left?: number, resetsInMin?: number, outMin?: number) =>
    left === undefined
      ? []
      : [`${label} ${left}% left${resetsInMin === undefined ? '' : `, resets in ${fmtMin(resetsInMin)}`}${outMin === undefined ? '' : `, runs out in about ${fmtMin(outMin)} at this pace`}`]
  const session = spent(hud?.costUsd)
  const last = spent(s.lastTurnUsd)
  const gauges = hud ? [`context ${hud.hp}% left${aboutTurns(forecast.turns)}`, ...limit('5-hour limit', hud.mp, hud.mpResetsInMin, forecast.mpOutMin), ...limit('7-day limit', hud.st, hud.stResetsInMin, forecast.stOutMin)] : []

  return [
    `report on this session, ${fmtDuration(now - s.since)} in:`,
    `- ${plural(s.turns, 'turn')}, ${fmtDuration(s.workMs)} of work`,
    `- ${plural(calls, 'tool call')}${kinds.length > 0 ? `: ${kinds.join(', ')}` : ''}`,
    `- ${s.failed} failed${share}`,
    `- ${plural(s.files.length, 'file')} edited`,
    ...((s.rereads ?? 0) > 0 ? [`- re-reads: ${s.rereads}`] : []),
    ...((s.untested ?? 0) > 0 ? [`- turns with untested edits: ${s.untested}`] : []),
    ...((s.sent ?? 0) > 0 ? [`- messages sent: ${s.sent}`] : []),
    ...((s.compactions ?? 0) > 0 ? [`- compactions: ${s.compactions}, freed ~${fmtTokens(s.freed ?? 0)} tokens`] : []),
    ...(session ? [`- cost: ${session} this session${last ? `, ${last} last turn` : ''}`] : []),
    ...(gauges.length > 0 ? [`- ${gauges.join(' · ')}`] : []),
  ].join('\n')
}

const RECAP_AFTER_MS = 30000 // a shorter turn ends while the user still watches

/**
 * The toast for a main-loop turn that ended for `reason` after `durationMs`, from the counts at its start and its
 * end: what it did, or that it failed, what it cost when `costUsd` is a cent or more, and the advisor's calls in
 * `advisor`. Undefined for a short turn and for one the user stopped.
 */
export function turnRecap(start: Stats, end: Stats, durationMs: number, reason: 'answer' | 'aborted' | 'refusal' | 'error', costUsd?: number, advisor?: AdvisorUse) {
  if (durationMs < RECAP_AFTER_MS || reason === 'aborted') {
    return undefined
  }
  const calls = callCount(end) - callCount(start)
  const files = end.files.length - start.files.length
  const failed = end.failed - start.failed
  const parts = [
    ...(calls > 0 ? [plural(calls, 'tool call')] : []),
    ...(files > 0 ? [`${plural(files, 'file')} edited`] : []),
    ...(failed > 0 ? [`${failed} failed`] : []),
    ...(spent(costUsd) ? [spent(costUsd)] : []),
    ...(advisor && advisor.calls > 0 ? [`advisor ${advisorCalls(advisor)}`] : []),
  ]
  const head = reason === 'answer' ? `done in ${fmtDuration(durationMs)}` : `the turn ended in ${reason === 'error' ? 'an error' : 'a refusal'} after ${fmtDuration(durationMs)}`

  return [head, ...parts].join(' · ')
}

const STREAK_WARN = 3

/** The toast when the failed tool calls in a row reach 3, 6, 9, ...: Claude may be going in circles. */
export function streakWarning(s: Stats) {
  const n = s.streak ?? 0

  return n > 0 && n % STREAK_WARN === 0 ? `${n} tool calls failed in a row. Press Esc to step in if Claude is stuck.` : undefined
}
