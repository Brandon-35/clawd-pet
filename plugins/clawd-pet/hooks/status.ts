import type { Mode } from '../types'

export type ToolMode = 'read' | 'search' | 'edit' | 'bash' | 'web' | 'agent'

const TOOL_MODE: Record<string, ToolMode> = {
  Read: 'read',
  Grep: 'search',
  Glob: 'search',
  Edit: 'edit',
  MultiEdit: 'edit',
  Write: 'edit',
  NotebookEdit: 'edit',
  TodoWrite: 'edit',
  Bash: 'bash',
  WebFetch: 'web',
  WebSearch: 'web',
  Task: 'agent',
  Agent: 'agent',
}

const MAX_TARGET = 24

export function toolMode(tool: string): ToolMode {
  return TOOL_MODE[tool] ?? 'bash'
}

const clip = (s: string) => (s.length > MAX_TARGET ? `${s.slice(0, MAX_TARGET - 1)}…` : s)
const text = (v: unknown) => (typeof v === 'string' ? v : '')

/** What the tool works on, as the status line names it: a file, a pattern, a command, a host. */
export function targetOf(tool: string, input: Record<string, unknown>) {
  switch (tool in TOOL_MODE ? tool : 'other') {
    case 'Read':
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
      return clip(text(input.file_path).split('/').pop() ?? '')
    case 'NotebookEdit':
      return clip(text(input.notebook_path).split('/').pop() ?? '')
    case 'TodoWrite':
      return 'the todo list'
    case 'Grep':
    case 'Glob':
      return clip(text(input.pattern))
    case 'Bash':
      return clip(text(input.command).split('\n')[0] ?? '')
    case 'WebFetch':
      return clip(text(input.url).replace(/^https?:\/\//, '').split('/')[0] ?? '')
    case 'WebSearch':
      return clip(text(input.query))
    case 'other':
      return clip(tool.split('__').pop() ?? tool)
    default:
      return ''
  }
}

/** The mod's status lines by mode; `{}` stands for the target. A pet's own `lines` replace a mode's. */
export const LINES: Record<Mode, string[]> = {
  idle: ['ready when you are', 'what are we making?', 'stretching my legs', 'watching the cursor'],
  sleep: ['zzz… a prompt wakes me', 'zzz…'],
  think: ['thinking', 'turning it over', 'weighing the options', 'nearly there…'],
  read: ['reading {}', 'looking through {}', 'reading…'],
  search: ['looking for "{}"', 'searching the files', 'combing through "{}"'],
  edit: ['editing {}', 'writing the change', 'touching up {}'],
  bash: ['$ {}', 'running: {}', 'waiting on the shell…'],
  web: ['fetching {}', 'visiting {}', 'out on the web…'],
  agent: ['sending out helpers', 'the helpers are on it'],
  run: ['on my way', 'step step step', 'on it!'],
  jump: ['let’s go!', 'on it!'],
  cheer: ['done!', 'all wrapped up', 'that went well'],
  error: ['that one failed', 'oof, trying again', 'not quite'],
  abort: ['okay, stopping', 'stopped where we were'],
  compact: ['packing up the context', 'making room to think'],
  alert: ['you’re needed', 'waiting on you'],
}

const SWAP_MS = 4000

/** The columns a terminal gives `text`: two for an emoji, none for a joiner or variation selector. */
export const lineWidth = (text: string) =>
  [...text].reduce((n, ch) => n + (/[\u200d\ufe0e\ufe0f]/.test(ch) ? 0 : /\p{Extended_Pictographic}/u.test(ch) ? 2 : 1), 0)

// Mid-tone colors, so the line reads on a dark terminal and on a light one.
const LINE_COLOR: Record<Mode, string> = {
  idle: '#c9744f',
  sleep: '#8f86c0',
  think: '#a07ac8',
  read: '#c98a2e',
  search: '#c98a2e',
  edit: '#b9932a',
  bash: '#4f9a5a',
  web: '#3f8fb0',
  agent: '#c9744f',
  run: '#c9744f',
  jump: '#c9744f',
  cheer: '#c08a1e',
  error: '#d0503f',
  abort: '#9a8f86',
  compact: '#8f86c0',
  alert: '#d68a1a',
}

/** The color of the status line and its arrow in this mode: the pet's own, else the mod's. */
export const lineColor = (mode: Mode, own: Partial<Record<Mode, string>> = {}) => own[mode] ?? LINE_COLOR[mode]

/**
 * A line for the mode, from the pet's `own` lines when it has them; the pick moves on every 4 s and starts
 * differently per `since`. With no target, only lines that need none.
 */
export function statusLine(mode: Mode, since: number, elapsedMs: number, target: string, own?: string[]) {
  const all = own ?? LINES[mode]
  const untargeted = all.filter(l => !l.includes('{}'))
  const lines = target || untargeted.length === 0 ? all : untargeted
  const seed = Math.abs(Math.floor(since / 100)) % lines.length
  const line = lines[(seed + Math.floor(Math.max(0, elapsedMs) / SWAP_MS)) % lines.length] as string

  return line.replace('{}', target || 'something')
}

/** A duration as the status line and toasts print it: `42s`, `3m 05s`, `1h 02m`. */
export function fmtDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s >= 3600) {
    return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`
  }

  return s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`
}

const CLOCK_AFTER_MS = 5000 // a clock on a short wait is noise

/**
 * The status line with a clock after it: how long the turn has run while Claude works, or how long a notification
 * has waited on the user. `turnMs` is undefined outside a turn. Short waits and the one-off modes get no clock.
 */
export function clocked(line: string, mode: Mode, turnMs: number | undefined, modeMs: number) {
  const ms = mode === 'alert' ? modeMs : mode === 'cheer' || mode === 'error' || mode === 'abort' || mode === 'jump' ? undefined : turnMs

  return line && ms !== undefined && ms >= CLOCK_AFTER_MS ? `${line} · ${fmtDuration(ms)}` : line
}
