import { modelFamily } from './advisor'
import { fmtTokens } from './hud'

/** A step's token counts, as `turn.step` reports them. */
export type StepUsage = { input_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number; model: string }

/** The session's main-loop input tokens: sent uncached, read from the cache, written to it; and the steps counted. */
export type CacheUse = { input: number; read: number; created: number; steps: number }

export const NO_CACHE: CacheUse = { input: 0, read: 0, created: 0, steps: 0 }

/** `c` after a step's usage; a step with none leaves it as it was. */
export function countCache(c: CacheUse, u: StepUsage | null | undefined): CacheUse {
  if (!u) {
    return c
  }
  return { input: c.input + u.input_tokens, read: c.read + u.cache_read_input_tokens, created: c.created + u.cache_creation_input_tokens, steps: c.steps + 1 }
}

/** The `/clawd` report's cache line: the share of the session's input read from the cache; '' before any input. */
export function cacheLine(c: CacheUse) {
  const total = c.input + c.read + c.created

  return total > 0 ? `- cache: ${Math.round((c.read / total) * 100)}% of input read from cache` : ''
}

/** One alert a step raises; each kind toasts at most once a turn. */
export type StepAlert = { kind: 'cache' | 'max_tokens' | 'refusal' | 'model_context_window_exceeded' | 'fallback'; text: string }

const STOPS: Partial<Record<string, StepAlert>> = {
  max_tokens: { kind: 'max_tokens', text: '✂ the reply hit max_tokens and was cut' },
  refusal: { kind: 'refusal', text: 'the model refused this request' },
  model_context_window_exceeded: { kind: 'model_context_window_exceeded', text: 'context window full · /compact' },
}

/**
 * The alerts for a main-loop step that asked for `model`, with `before` the session's cache counts before it: a cache
 * that went cold (a later step writing 20k+ tokens and reading fewer than it wrote), a stop that cut or refused the
 * reply, and an answer from another model family than the one asked for.
 */
export function stepAlerts(before: CacheUse, model: string, r: { stopReason: string | null; usage: StepUsage | null }): StepAlert[] {
  const alerts: StepAlert[] = []
  const u = r.usage
  if (u && before.steps > 0 && u.cache_creation_input_tokens >= 20000 && u.cache_read_input_tokens < u.cache_creation_input_tokens) {
    alerts.push({ kind: 'cache', text: `❄ prompt cache went cold: ${fmtTokens(u.cache_creation_input_tokens)} tokens re-cached` })
  }
  const stop = r.stopReason === null ? undefined : STOPS[r.stopReason]
  if (stop) {
    alerts.push(stop)
  }
  const asked = modelFamily(model)
  const answered = modelFamily(u?.model)
  if (asked && answered && asked !== answered) {
    alerts.push({ kind: 'fallback', text: `↯ answered by ${answered}, not ${asked}` })
  }
  return alerts
}
