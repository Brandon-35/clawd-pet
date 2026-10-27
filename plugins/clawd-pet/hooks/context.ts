import type { SessionContextBreakdown } from 'claude-code'

import { fmtTokens } from './hud'

/** The MCP schemas, in all, worth naming servers for. */
export const MCP_SHOWN_TOKENS = 5000
/** The memory files, in all, worth naming files for. */
export const MEMORY_SHOWN_TOKENS = 3000

const count = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0)
const list = <T>(a: T[] | undefined): T[] => (Array.isArray(a) ? a : [])
/** `System tools` → `system tools`, but `MCP tools` stays. */
const lower = (s: string) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s)
const top = (sums: Map<string, number>, n: number) =>
  [...sums]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, tokens]) => `${name} ~${fmtTokens(tokens)}`)
    .join(' · ')

/** The server a tool belongs to: its `serverName`, else the part between `mcp__` and the next `__`. */
const serverOf = (tool: { name?: string; serverName?: string }) =>
  (typeof tool.serverName === 'string' && tool.serverName) || /^mcp__(.+?)__/.exec(tool.name ?? '')?.[1] || 'other'

/**
 * Up to three `/clawd` lines saying what fills the context window: the biggest categories, then the biggest MCP
 * servers and memory files when those are big enough to trim. Empty for a missing or odd breakdown.
 */
export function contextLines(b: Partial<SessionContextBreakdown> | undefined): string[] {
  if (b === undefined || b === null || typeof b !== 'object') {
    return []
  }
  const lines: string[] = []

  const used = list(b.categories)
    .filter(c => c?.kind === 'used' && !c.isDeferred && count(c.tokens) > 0 && typeof c.name === 'string')
    .sort((x, y) => y.tokens - x.tokens)
    .slice(0, 4)
  if (used.length > 0) {
    lines.push(`- context: ${used.map(c => `${lower(c.name)} ${fmtTokens(c.tokens)}`).join(' · ')}`)
  }

  const servers = new Map<string, number>()
  for (const t of list(b.mcpTools)) {
    if (t?.isLoaded !== false && count(t?.tokens) > 0) {
      const s = serverOf(t)
      servers.set(s, (servers.get(s) ?? 0) + t.tokens)
    }
  }
  if ([...servers.values()].reduce((a, n) => a + n, 0) >= MCP_SHOWN_TOKENS) {
    lines.push(`- biggest MCP servers: ${top(servers, 3)}`)
  }

  const files = new Map<string, number>()
  for (const f of list(b.memoryFiles)) {
    if (count(f?.tokens) > 0 && typeof f.path === 'string') {
      // shortcut: two files with one basename add up; fine for a hint of what to trim.
      const name = f.path.split(/[\\/]/).pop() || f.path
      files.set(name, (files.get(name) ?? 0) + f.tokens)
    }
  }
  if ([...files.values()].reduce((a, n) => a + n, 0) >= MEMORY_SHOWN_TOKENS) {
    lines.push(`- biggest memory files: ${top(files, 2)}`)
  }

  return lines
}
