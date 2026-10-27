import { fmtDuration } from './status'

/** The model families by capability, weakest first. */
const FAMILIES = ['haiku', 'sonnet', 'opus', 'fable'] as const
export type Family = (typeof FAMILIES)[number]

/** The family of a model alias or full id (`opusplan`, `sonnet[1m]`, `claude-sonnet-5-5`), or undefined for one it does not name. */
export function modelFamily(name?: string): Family | undefined {
  const lower = (name ?? '').toLowerCase()

  return FAMILIES.find(f => lower.includes(f))
}

/** How the advisor pairs with the main model: none set, it runs, it never runs (with the command that fixes it), or unknown. */
export type AdvisorHealth = { state: 'none' | 'active' | 'idle' | 'unknown'; fix?: string; text: string }

/**
 * The advisor's health under `main`. Claude Code runs the advisor only when it is a stronger family than the main
 * model; otherwise the fix is a stronger advisor, or Sonnet as the main model when the main model is the strongest.
 */
export function advisorHealth(main?: string, advisor?: string): AdvisorHealth {
  if (!advisor) {
    return { state: 'none', text: 'no advisor set' }
  }
  const m = modelFamily(main)
  const a = modelFamily(advisor)
  if (!m || !a) {
    return { state: 'unknown', text: `advisor ${a ?? advisor}` }
  }
  if (FAMILIES.indexOf(a) > FAMILIES.indexOf(m)) {
    return { state: 'active', text: `advisor ${a} · active` }
  }
  const fix = m === 'fable' ? '/model sonnet' : `/advisor ${m === 'opus' ? 'fable' : 'opus'}`

  return { state: 'idle', fix, text: `advisor ${a} is not stronger than ${m}, so it never runs · fix: ${fix}` }
}

/** The toast for an advisor that never runs, else undefined. */
export function advisorToast(main?: string, advisor?: string) {
  return advisorHealth(main, advisor).state === 'idle' ? `✻ advisor ${modelFamily(advisor)} never runs under ${modelFamily(main)} · /clawd advisor` : undefined
}

/** Advisor calls and their time, summed. */
export type AdvisorUse = { calls: number; ms: number }

/** `u` after a step's server tool calls: each advisor call counts, and its time when it ended. */
export function countAdvisor(u: AdvisorUse, uses: readonly { name: string; startedAt: number; endedAt?: number }[] = []): AdvisorUse {
  const advisor = uses.filter(s => s.name === 'advisor')

  return { calls: u.calls + advisor.length, ms: u.ms + advisor.reduce((ms, s) => ms + (s.endedAt === undefined ? 0 : Math.max(0, s.endedAt - s.startedAt)), 0) }
}

/** `u` as `×2 (14s)`, the time left out when none was measured. */
export const advisorCalls = (u: AdvisorUse) => `×${u.calls}${u.ms > 0 ? ` (${fmtDuration(u.ms)})` : ''}`

/** The `/clawd` report's advisor line: the pairing's health and the session's calls; '' with no advisor and no calls. */
export function advisorLine(main: string | undefined, advisor: string | undefined, u: AdvisorUse) {
  const h = advisorHealth(main, advisor)
  if (h.state === 'none' && u.calls === 0) {
    return ''
  }
  const calls = u.calls > 0 ? ` · ${u.calls} ${u.calls === 1 ? 'call' : 'calls'}${u.ms > 0 ? `, ${fmtDuration(u.ms)}` : ''} this session` : ''

  return `- ${h.text.replace(/^advisor /, 'advisor: ')}${calls}`
}
