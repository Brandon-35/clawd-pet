import type { ToolMode } from './status'

const LOOP_WARN = 3
// Reads are left to reread.ts, which tells a repeat from paging through a file.
const KEY_INPUT: Record<string, string> = { Bash: 'command', Grep: 'pattern', Glob: 'pattern', WebFetch: 'url', WebSearch: 'query' }

/** How many times each call has run since the last edit, by the call's key. */
export type Repeats = Record<string, number>

/** What makes two calls the same: the tool and its main input. Undefined for a tool that is not checked. */
export function callKey(tool: string, input: Record<string, unknown>) {
  const field = KEY_INPUT[tool]
  const value = field === undefined ? undefined : input[field]

  return typeof value === 'string' && value !== '' ? `${tool}\n${value}` : undefined
}

/** `r` after a call in `mode` with `key`, and how many times that call has now run. An edit starts the count over. */
export function repeat(r: Repeats, mode: ToolMode, key: string | undefined): { repeats: Repeats; n: number } {
  if (mode === 'edit') {
    return { repeats: {}, n: 0 }
  }
  if (key === undefined) {
    return { repeats: r, n: 0 }
  }
  const n = (r[key] ?? 0) + 1

  return { repeats: { ...r, [key]: n }, n }
}

/**
 * The toast when the same call runs a third time, and every third after, with no edit between. It names the call by
 * its `target`, or by the tool alone when the target is '' (the user hides targets).
 */
export function loopWarning(n: number, tool: string, target: string) {
  const what = target === '' ? `The same ${tool} call` : `\`${tool === 'Bash' ? '$' : tool} ${target}\``

  return n > 0 && n % LOOP_WARN === 0 ? `${what} ran ${n} times with no edit between. Claude may be going in circles.` : undefined
}
