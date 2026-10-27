import { expect, test } from 'claude-code/testing'

import { contextLines } from './context'

const row = (name: string, tokens: number, kind = 'used') => ({ name, tokens, color: 'inactive', isDeferred: kind === 'deferred', kind })
const tool = (name: string, tokens: number, serverName = '', isLoaded = true) => ({ name, serverName, tokens, isLoaded })

test('the context line names the four biggest used categories, biggest first', () => {
  const b = {
    categories: [
      row('System prompt', 3000),
      row('Messages', 98000),
      row('Free space', 60000, 'free'),
      row('Autocompact buffer', 33000, 'buffer'),
      row('MCP tools (deferred)', 40000, 'deferred'),
      row('System tools', 22000),
      row('MCP tools', 14000),
      row('Memory files', 8000),
      row('Skills', 0),
    ],
  } as never
  expect(contextLines(b)).toEqual(['- context: messages 98k · system tools 22k · MCP tools 14k · memory files 8k'])
})

test('MCP tools add up per server, the top three shown once they reach 5k', () => {
  const b = {
    mcpTools: [
      tool('mcp__github__create_issue', 5000, 'github'),
      tool('mcp__github__list_issues', 4000, 'github'),
      tool('mcp__figma__get_screenshot', 4000),
      tool('mcp__linear__search', 1000),
      tool('mcp__slack__post', 500),
      tool('mcp__notion__search', 90000, 'notion', false),
    ],
  } as never
  expect(contextLines(b)).toEqual(['- biggest MCP servers: github ~9k · figma ~4k · linear ~1k'])
  expect(contextLines({ mcpTools: [tool('mcp__a__x', 4999)] } as never)).toEqual([])
})

test('memory files show by basename, the top two once they reach 3k', () => {
  const b = {
    memoryFiles: [
      { path: '/home/u/.claude/CLAUDE.md', type: 'User', tokens: 6000 },
      { path: '/home/u/p/memory/MEMORY.md', type: 'AutoMem', tokens: 2000 },
      { path: 'C:\\p\\notes.md', type: 'Project', tokens: 500 },
    ],
  } as never
  expect(contextLines(b)).toEqual(['- biggest memory files: CLAUDE.md ~6k · MEMORY.md ~2k'])
  expect(contextLines({ memoryFiles: [{ path: '/a/CLAUDE.md', type: 'User', tokens: 2999 }] } as never)).toEqual([])
})

test('a missing or odd breakdown gives no lines', () => {
  expect(contextLines(undefined)).toEqual([])
  expect(contextLines(null as never)).toEqual([])
  expect(contextLines({} as never)).toEqual([])
  expect(contextLines({ categories: 'x', mcpTools: null, memoryFiles: [null, { tokens: 'a' }] } as never)).toEqual([])
})
