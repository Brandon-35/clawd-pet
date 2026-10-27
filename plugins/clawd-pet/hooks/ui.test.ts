import { expect, mock, test } from 'claude-code/testing'
import type { On, SessionUsage } from 'claude-code'

const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 100, scroll: { offset: 0, bodyRows: 20 }, view: {} } } as const
const HINT = { component: 'PromptHint', props: { isDraft: false, isWorking: false, hint: '⏵⏵ auto mode on' } } as const

const BLOCK = { name: 'block', sprite: ['ddddddd', 'ddddddd', 'ddddddd', 'ddddddd'], palette: { d: '#3d84f0' }, eyes: [[0, 1], [4, 1]] }
const CAT = { name: 'Mochi', sprite: ['k.....k', 'kkkkkkk', 'kwkkkwk', 'kkkkkkk'], palette: { k: '#e8a33d', w: '#fff4e0' }, eyes: [[0, 1], [4, 1]] }
const usage: SessionUsage = { startedAt: 0, context: { window: 200000, percent: 14 }, rateLimits: [{ kind: 'five_hour', percentUsed: 38 }] }

/** Answers what the mod asks of Claude Code, keeping its toasts in `toasts` and its usage from `readUsage`, and draws Claude Code's own hint line as one Text. Returns the mod's store, kept in memory. */
function stubEngine(on: On, toasts: string[] = [], readUsage = (): SessionUsage => usage) {
  const store = new Map<string, unknown>()
  mock.clock(on)
  on('store.get', (_$, e) => ({ value: store.get(e.key) }))
  on('store.set', (_$, e) => {
    store.set(e.key, e.value)
    return { value: undefined }
  })
  on('store.delete', (_$, e) => {
    store.delete(e.key)
    return { value: undefined }
  })
  on('session.start', (_$, e) => e)
  on('session.usage', () => ({ value: readUsage() }))
  on('agent.list', () => ({ value: [] }))
  on('fs.read', () => ({ value: JSON.stringify(BLOCK) }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['engine hint'] }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('fs.write', (_$, e) => {
    store.set(`file:${e.path}`, e.text)
    return { value: undefined }
  })

  return store
}

test('the band draws the pet, and the hint line draws the HUD in its window', async ($, on) => {
  stubEngine(on)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })

  const band = await $.ui.mount({ plugin: 'clawd-pet', surface: 'terminal', ...BAND })
  const drawn = JSON.stringify(await band.drawn())
  expect(drawn).toContain('"key":"pet"')
  await band.unmount()

  const hint = await $.ui.mount({ plugin: 'clawd-pet', surface: 'terminal', ...HINT })
  const tree = JSON.stringify(await hint.drawn())
  expect(tree).toContain('╭─ block ─')
  expect(tree).toContain('╰──')
  expect(tree).toContain('HP ')
  expect(tree).toContain('━')
  await hint.unmount()
})

test('a theme with a scene draws the band across its width, with the ground in a row below the pet', async ($, on) => {
  stubEngine(on)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  const scene = { ground: ['gg'], obstacles: [['gg', 'gg']] }
  await $.tool.call({ tool: 'mcp__clawd-pet__set_theme', theme: { ...BLOCK, palette: { ...BLOCK.palette, g: '#888888' }, scene } })

  const band = await $.ui.mount({ plugin: 'clawd-pet', surface: 'terminal', ...BAND })
  const drawn = JSON.stringify(await band.drawn())
  expect(drawn).toContain('"key":"pet"')
  expect(drawn).toContain('"key":"ground"')
  expect(drawn).toContain('"columns":99')
  await band.unmount()
})

test('set_theme draws and keeps a theme, notes what it repaired, and refuses one with no sprite', async ($, on) => {
  const store = stubEngine(on)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })

  const set = await $.tool.call({ tool: 'mcp__clawd-pet__set_theme', theme: CAT })
  expect(set.deny).toBeUndefined()
  expect(String(set.result)).toContain('The Mochi theme is on screen now')
  expect(store.get('theme')).toEqual(CAT)

  const refused = await $.tool.call({ tool: 'mcp__clawd-pet__set_theme', theme: { name: 'nothing' } })
  expect(refused.deny ?? refused.text).toContain('`sprite` is a list of text rows')
  expect(store.get('theme')).toEqual(CAT)

  const noted = await $.tool.call({ tool: 'mcp__clawd-pet__set_theme', theme: { ...CAT, palette: { k: '#e8a33d' } } })
  expect(String(noted.result)).toContain('"w" has no palette color, so it is drawn clear.')
  expect(String(noted.result)).toContain('stand, run, jump, think, cheer, and 20 faces')

  const reset = await $.tool.call({ tool: 'mcp__clawd-pet__set_theme', theme: null })
  expect(String(reset.result)).toContain('Clawd is back')
  expect(store.get('theme')).toBeUndefined()
})

test('set_theme with no theme sets the last preview, and refuses when there is none', async ($, on) => {
  const store = stubEngine(on)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })

  const none = await $.tool.call({ tool: 'mcp__clawd-pet__set_theme' })
  expect(none.deny ?? none.text).toContain('no preview_theme call')

  await $.tool.call({ tool: 'mcp__clawd-pet__preview_theme', theme: CAT, path: '/tmp/cat.html' })
  const set = await $.tool.call({ tool: 'mcp__clawd-pet__set_theme' })
  expect(String(set.result)).toContain('The Mochi theme is on screen now')
  expect(store.get('theme')).toEqual(CAT)
})

test('get_theme returns the kept theme, or Clawd\'s when none is kept', async ($, on) => {
  stubEngine(on)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })

  const clawd = await $.tool.call({ tool: 'mcp__clawd-pet__get_theme' })
  expect(String(clawd.result)).toContain('No theme is kept')
  expect(String(clawd.result)).toContain('"name":"block"')

  await $.tool.call({ tool: 'mcp__clawd-pet__set_theme', theme: CAT })
  const kept = await $.tool.call({ tool: 'mcp__clawd-pet__get_theme' })
  expect(String(kept.result)).toContain('"name": "Mochi"')
})

test('the settings hide the HUD and the status line', { options: { hud: false, statusLine: false } }, async ($, on) => {
  stubEngine(on)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })

  const band = await $.ui.mount({ plugin: 'clawd-pet', surface: 'terminal', ...BAND })
  const drawn = JSON.stringify(await band.drawn())
  expect(drawn).toContain('"key":"pet"')
  expect(drawn).not.toContain('›')
  await band.unmount()

  const hint = await $.ui.mount({ plugin: 'clawd-pet', surface: 'terminal', ...HINT })
  expect(JSON.stringify(await hint.drawn())).not.toContain('╭─')
  await hint.unmount()
})

test('preview_theme writes the preview and leaves the pet on screen alone', async ($, on) => {
  const store = stubEngine(on)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })

  const wrote = await $.tool.call({ tool: 'mcp__clawd-pet__preview_theme', theme: CAT, path: '/tmp/mochi.html' })
  expect(String(wrote.result)).toContain('Wrote the preview of Mochi to /tmp/mochi.html')
  const page = String(store.get('file:/tmp/mochi.html'))
  for (const part of ['<title>Mochi: preview</title>', 'Motions', 'Faces', 'Frames', 'A subagent starts']) {
    expect(page).toContain(part)
  }
  expect(store.get('theme')).toBeUndefined()

  const nowhere = await $.tool.call({ tool: 'mcp__clawd-pet__preview_theme', theme: CAT })
  expect(nowhere.deny ?? nowhere.text).toContain('`path` is the HTML file to write')
})

test('a re-read of an unchanged file toasts once, and an edit or a change on disk makes the next read new', async ($, on) => {
  const toasts: string[] = []
  stubEngine(on, toasts)
  let mtimeMs = 1000
  on('fs.stat', () => ({ value: { kind: 'file', size: 1, mtimeMs, isLink: false } }))
  on('tool.call', () => ({ result: 'ok' }))
  mock.session(on)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })

  const read = () => $.tool.call({ tool: 'Read', file_path: '/repo/src/app.ts' })
  await read()
  const content = [{ type: 'tool_result', tool_use_id: 't1', content: 'x'.repeat(16800) }]
  const row = { type: 'user', role: 'user', content } as const
  await $.session.append({ message: row, door: 'tool-result', origin: { kind: 'tool', tool: 'Read' }, uuid: 'u1' })
  await read()
  await read()
  const rereads = () => toasts.filter(t => t.includes('already in context'))
  expect(rereads()).toEqual(['app.ts is already in context, unchanged since it was read this turn (~4.2k tokens)'])

  await $.tool.call({ tool: 'Edit', file_path: '/repo/src/app.ts', old_string: 'a', new_string: 'b' })
  await read()
  mtimeMs = 2000
  await read()
  expect(rereads().length).toBe(1)
  const report = await $.command.run({ command: 'clawd', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
  expect(report.text).toContain('- re-reads: 2')
})

test('a heavy tool result toasts once and lands in the report, and the row goes on unchanged', async ($, on) => {
  const toasts: string[] = []
  stubEngine(on, toasts)
  on('tool.call', () => ({ result: 'ok' }))
  const session = mock.session(on)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })

  await $.tool.call({ tool: 'Read', file_path: '/repo/logs/big.log' })
  const content = [{ type: 'tool_result', tool_use_id: 't1', content: 'x'.repeat(56000) }]
  const row = { type: 'user', role: 'user', content } as const
  await $.session.append({ message: row, door: 'tool-result', origin: { kind: 'tool', tool: 'Read' }, uuid: 'u1' })
  await $.session.append({ message: { ...row, content: [{ type: 'tool_result', tool_use_id: 't2', content: 'small' }] }, door: 'tool-result', origin: { kind: 'tool', tool: 'Read' }, uuid: 'u2' })

  expect(toasts).toEqual(['Read big.log added ~14k tokens to the context; Read with offset/limit or Grep to take less'])
  expect(session.appended()[0]?.message.content).toEqual(content)
  const report = await $.command.run({ command: 'clawd', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
  expect(report.text).toContain('- heaviest results: Read big.log ~14k')
})

test('a compaction toasts the tokens it freed, counts in the report, and its result goes on unchanged', async ($, on) => {
  const toasts: string[] = []
  stubEngine(on, toasts)
  const messages = [{ role: 'user' as const, text: 'the plan so far', toolUses: [] }]
  const done = { messages, tokensBefore: 152000, tokensAfter: 31000 }
  on('session.compact', () => done)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })

  const r = await $.session.compact({ trigger: 'manual', messages })
  expect(r).toEqual(done)
  expect(toasts).toEqual(['compacted 152k → 31k tokens, freed 121k (HP 24% → 84%)'])

  await $.session.compact({ trigger: 'auto', messages, agentId: 'a1' })
  await $.session.compact({ trigger: 'precompute', messages })
  expect(toasts.length).toBe(1)

  const report = await $.command.run({ command: 'clawd', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
  expect(report.text).toContain('- compactions: 1, freed ~121k tokens')
  expect(report.text).toContain('1 compaction')
})

test('a long turn toasts what it cost, the report names it, and the day adds it up', async ($, on) => {
  const toasts: string[] = []
  let usd = 1.1
  const store = stubEngine(on, toasts, () => ({ ...usage, cost: { usd } }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })

  await $.turn.start({ text: 'go', turnId: 't1' })
  usd = 1.52
  await $.turn.complete({ answer: '', durationMs: 45_000, isAborted: false, turnId: 't1', reason: 'answer' })
  expect(toasts.at(-1)).toBe('done in 45s · $0.42')

  const report = await $.command.run({ command: 'clawd', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
  expect(report.text).toContain('- cost: $1.52 this session, $0.42 last turn')
  expect(report.text).toContain(', $0.42 spent')
  expect((store.get('today') as { usd: number }).usd).toBeGreaterThan(0.41)

  // The next turn starts from the cost the last one ended on, with no push in between.
  await $.turn.start({ text: 'again', turnId: 't2' })
  usd = 2
  await $.turn.complete({ answer: '', durationMs: 45_000, isAborted: false, turnId: 't2', reason: 'answer' })
  expect(toasts.at(-1)).toBe('done in 45s · $0.48')
  expect((store.get('today') as { usd: number }).usd).toBeGreaterThan(0.89)
})
