import { fmtTokens } from './hud'

/** One read the context still holds: when and in which turn, the file's mtime then, its rough tokens, and whether a re-read of it was told. */
export type ReadEntry = { at: number; turn: number; tokens?: number; mtimeMs?: number; told?: boolean }

/** The session's reads, by `readKey`. */
export type Reads = Record<string, ReadEntry>

/** A read of something the context already holds: how long and how many turns ago, its size, and whether it was told before. */
export type Again = { agoMs: number; turnsAgo: number; tokens?: number; told: boolean }

const SEP = '\u0000'
const MAX_TARGET = 60

const text = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '')

/** The key of a Read call: its file, offset and limit, so a ranged read and a whole read differ. */
export const readKey = (input: Record<string, unknown>) => [text(input.file_path), text(input.offset), text(input.limit)].join(SEP)

/**
 * `reads` after a read of `key` at `at` in `turn`, of a file last changed at `mtimeMs` (undefined when unknown).
 * `again` is set when the context holds the same read and the file has not changed on disk since; an unknown mtime
 * never counts as unchanged.
 */
export function noteRead(reads: Reads, key: string, at: number, turn: number, mtimeMs?: number): { reads: Reads; again?: Again } {
  const before = reads[key]
  if (before && mtimeMs !== undefined && before.mtimeMs === mtimeMs) {
    const again = { agoMs: at - before.at, turnsAgo: turn - before.turn, tokens: before.tokens, told: before.told === true }
    return { reads: { ...reads, [key]: { ...before, told: true } }, again }
  }

  return { reads: { ...reads, [key]: { at, turn, mtimeMs } } }
}

/** `reads` with the size of the read of `key`, once its result arrives. */
export const noteTokens = (reads: Reads, key: string, tokens: number): Reads => (reads[key] ? { ...reads, [key]: { ...reads[key], tokens } } : reads)

/** `reads` without any read of `path`: an edit of it makes the next read new. */
export const forgetPath = (reads: Reads, path: string): Reads =>
  Object.fromEntries(Object.entries(reads).filter(([k]) => !k.startsWith(`${path}${SEP}`)))

/** No reads: after a compaction the earlier ones are summarized away. */
export const forgetAll = (): Reads => ({})

/** The toast for a read of `target` the context already holds. */
export function rereadWarning(target: string, again: Again) {
  const name = target === '' ? 'this file' : target.length > MAX_TARGET ? `${target.slice(0, MAX_TARGET - 1)}…` : target
  const when = again.turnsAgo <= 0 ? 'this turn' : again.turnsAgo === 1 ? '1 turn ago' : `${again.turnsAgo} turns ago`
  const size = again.tokens === undefined ? '' : ` (~${fmtTokens(again.tokens)} tokens)`

  return `${name} is already in context, unchanged since it was read ${when}${size}`
}
