import { fmtMin } from './hud'
import type { Hud } from './hud'
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

/** `s` after a main-loop turn that took `durationMs`. */
export const countTurn = (s: Stats, durationMs: number): Stats => ({ ...s, turns: s.turns + 1, workMs: s.workMs + Math.max(0, durationMs) })

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** What `/clawd` prints: the session's turns, tool calls by kind, failures, files edited, and the HUD's readings. */
export function statsReport(s: Stats, now: number, name: string, hud?: Hud) {
  const calls = MODE_ORDER.reduce((n, m) => n + (s.calls[m] ?? 0), 0)
  const kinds = MODE_ORDER.filter(m => s.calls[m]).map(m => `${s.calls[m]} ${m}`)
  const share = calls > 0 ? ` (${Math.round((s.failed / calls) * 100)}%)` : ''
  const limit = (label: string, left?: number, resetsInMin?: number) =>
    left === undefined ? [] : [`${label} ${left}% left${resetsInMin === undefined ? '' : `, resets in ${fmtMin(resetsInMin)}`}`]
  const gauges = hud ? [`context ${hud.hp}% left`, ...limit('5-hour limit', hud.mp, hud.mpResetsInMin), ...limit('7-day limit', hud.st, hud.stResetsInMin)] : []

  return [
    `${name}'s report on this session, ${fmtDuration(now - s.since)} in:`,
    `- ${plural(s.turns, 'turn')}, ${fmtDuration(s.workMs)} of work`,
    `- ${plural(calls, 'tool call')}${kinds.length > 0 ? `: ${kinds.join(', ')}` : ''}`,
    `- ${s.failed} failed${share}`,
    `- ${plural(s.files.length, 'file')} edited`,
    ...(gauges.length > 0 ? [`- ${gauges.join(' · ')}`] : []),
  ].join('\n')
}

const RECAP_AFTER_MS = 30000 // a shorter turn ends while the user still watches

/**
 * The toast for a main-loop turn that ended for `reason` after `durationMs`, from the counts at its start and its
 * end: what it did, or that it failed. Undefined for a short turn and for one the user stopped.
 */
export function turnRecap(start: Stats, end: Stats, durationMs: number, reason: 'answer' | 'aborted' | 'refusal' | 'error', name: string) {
  if (durationMs < RECAP_AFTER_MS || reason === 'aborted') {
    return undefined
  }
  const total = (s: Stats) => MODE_ORDER.reduce((n, m) => n + (s.calls[m] ?? 0), 0)
  const calls = total(end) - total(start)
  const files = end.files.length - start.files.length
  const failed = end.failed - start.failed
  const parts = [
    ...(calls > 0 ? [plural(calls, 'tool call')] : []),
    ...(files > 0 ? [`${plural(files, 'file')} edited`] : []),
    ...(failed > 0 ? [`${failed} failed`] : []),
  ]
  const head = reason === 'answer' ? `done in ${fmtDuration(durationMs)}` : `the turn ended in ${reason === 'error' ? 'an error' : 'a refusal'} after ${fmtDuration(durationMs)}`

  return `${name}: ${[head, ...parts].join(' · ')}`
}

const STREAK_WARN = 3

/** The toast when the failed tool calls in a row reach 3, 6, 9, ...: Claude may be going in circles. */
export function streakWarning(s: Stats, name: string) {
  const n = s.streak ?? 0

  return n > 0 && n % STREAK_WARN === 0 ? `${name}: ${n} tool calls failed in a row. Press Esc to step in if Claude is stuck.` : undefined
}
