import type { ApiContentBlock } from 'claude-code'

import { fmtTokens } from './hud'

/** A tool result at least this many tokens big gets a toast. */
export const HEAVY_TOKENS = 10000

const IMAGE_TOKENS = 1600 // a rough flat cost; the real one depends on the image's size
const MAX_WARNING = 110

/** One heavy tool result of the session: the tool, its target ('' when unknown or hidden), and its rough tokens. */
export type Heavy = { tool: string; target: string; tokens: number }

const textTokens = (s: string) => Math.ceil(s.length / 4)

/**
 * Rough tokens of a tool result's content blocks, at four characters a token. A tool_result's `content` may be a
 * string or more blocks; an image counts a flat 1600; a kind with no text counts nothing.
 */
export function estimateTokens(blocks: readonly ApiContentBlock[]): number {
  let n = 0
  for (const b of blocks) {
    if (b.type === 'text' && typeof b.text === 'string') {
      n += textTokens(b.text)
    } else if (b.type === 'image') {
      n += IMAGE_TOKENS
    } else if (b.type === 'tool_result') {
      const c = b.content
      n += typeof c === 'string' ? textTokens(c) : Array.isArray(c) ? estimateTokens(c as ApiContentBlock[]) : 0
    }
  }

  return n
}

/** How to take less from `tool` next time. */
function advice(tool: string) {
  switch (tool) {
    case 'Read':
      return 'Read with offset/limit or Grep'
    case 'Bash':
      return 'pipe through head, tail or grep'
    case 'Grep':
      return 'narrow the pattern or use head_limit'
    case 'WebFetch':
      return 'ask a narrower prompt'
    default:
      return 'ask for less'
  }
}

/** A tool as the warning and the report name it: an MCP tool by its own name, without the server. */
const toolName = (tool: string) => (tool.startsWith('mcp__') ? (tool.split('__').pop() ?? tool) : tool)

/** The toast for a tool result of `tokens` from `tool` on `target`, cut to fit; the target gives way first. */
export function heavyWarning(tool: string, target: string, tokens: number) {
  const name = toolName(tool)
  const tail = ` added ~${fmtTokens(tokens)} tokens to the context; ${advice(tool)} to take less`
  const room = MAX_WARNING - name.length - tail.length - 1
  const what = target === '' || room < 2 ? name : `${name} ${target.length > room ? `${target.slice(0, room - 1)}…` : target}`

  return `${what}${tail}`
}

/** `list` with `item` added, heaviest first, at most `n` long. */
export function keepHeaviest(list: readonly Heavy[], item: Heavy, n = 3): Heavy[] {
  return [...list, item].sort((a, b) => b.tokens - a.tokens).slice(0, n)
}

/** The report's line on the heaviest results, or '' when there were none. */
export function heaviestLine(list: readonly Heavy[]) {
  const items = list.map(h => `${[toolName(h.tool), h.target].filter(s => s !== '').join(' ')} ~${fmtTokens(h.tokens)}`)

  return items.length > 0 ? `- heaviest results: ${items.join(' · ')}` : ''
}
