import { fmtTokens } from './hud'

/** HP for `tokens` used of a `window`: the share left, 0 to 100. */
const hpOf = (tokens: number, window: number) => Math.min(100, Math.max(0, 100 - Math.round((tokens / window) * 100)))

const known = (n: number | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0

/**
 * The toast after a compaction that went from `before` to `after` tokens, with HP before and after when the context
 * `window` is known. Undefined when a count is missing or nothing was freed.
 */
export function compactLine(before: number | undefined, after: number | undefined, trigger: string, window?: number) {
  if (!known(before) || !known(after) || after >= before) {
    return undefined
  }
  const hp = known(window) && window > 0 ? ` (HP ${hpOf(before, window)}% → ${hpOf(after, window)}%)` : ''

  return `${trigger === 'auto' ? 'auto-compacted' : 'compacted'} ${fmtTokens(before)} → ${fmtTokens(after)} tokens, freed ${fmtTokens(before - after)}${hp}`
}
