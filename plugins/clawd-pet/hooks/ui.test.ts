import { expect, mock, test } from 'claude-code/testing'
import type { On, SessionUsage } from 'claude-code'

const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 100, scroll: { offset: 0, bodyRows: 20 }, view: {} } } as const
const HINT = { component: 'PromptHint', props: { isDraft: false, isWorking: false, hint: '⏵⏵ auto mode on' } } as const

const BLOCK = { name: 'block', sprite: ['ddddddd', 'ddddddd', 'ddddddd', 'ddddddd'], palette: { d: '#3d84f0' }, eyes: [[0, 1], [4, 1]] }
const CAT = { name: 'Mochi', sprite: ['k.....k', 'kkkkkkk', 'kwkkkwk', 'kkkkkkk'], palette: { k: '#e8a33d', w: '#fff4e0' }, eyes: [[0, 1], [4, 1]] }
const usage: SessionUsage = { startedAt: 0, context: { window: 200000, percent: 14 }, rateLimits: [{ kind: 'five_hour', percentUsed: 38 }] }

/** Answers what the mod asks of Claude Code, keeping its toasts in `toasts` and its usage from `readUsage`, and draws Claude Code's own hint line as one Text. Returns the mod's store, kept in memory, with the test's clock. */
function stubEngine(on: On, toasts: string[] = [], readUsage = (): SessionUsage => usage, readFile = (_path: string) => JSON.stringify(BLOCK)) {
  const store = new Map<string, unknown>()
  const clock = mock.clock(on)
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
  on('fs.read', (_$, e) => ({ value: readFile(e.path) }))
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

  return Object.assign(store, { clock })
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

test('a turn that edits code files and runs no check toasts at its end; a check or an abort keeps it quiet', async ($, on) => {
  const toasts: string[] = []
  stubEngine(on, toasts)
  on('tool.call', () => ({ result: 'ok' }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  const untested = () => toasts.filter(t => t.includes('ran no tests or checks'))
  const turn = async (id: string, bash: string | undefined, reason: 'answer' | 'aborted' = 'answer') => {
    await $.turn.start({ text: 'go', turnId: id })
    await $.tool.call({ tool: 'Edit', file_path: '/repo/src/a.ts', old_string: 'a', new_string: 'b' })
    await $.tool.call({ tool: 'Write', file_path: '/repo/src/b.ts', content: 'x', agentId: 'sub1' })
    if (bash !== undefined) {
      await $.tool.call({ tool: 'Bash', command: bash, agentId: 'sub1' })
    }
    await $.turn.complete({ answer: '', durationMs: 5_000, isAborted: reason === 'aborted', turnId: id, reason })
  }

  await turn('t1', undefined)
  expect(untested()).toEqual(['edited 2 code files this turn and ran no tests or checks'])
  await turn('t2', 'npm test')
  await turn('t3', undefined, 'aborted')
  await turn('t4', 'git status')
  expect(untested().length).toBe(2)

  const report = await $.command.run({ command: 'clawd', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
  expect(report.text).toContain('- turns with untested edits: 2')
})

test('/clawd peers lists the other live sessions from their records, and /clawd counts them', async ($, on) => {
  const files: Record<string, string> = {
    'self.tsv': '1\talert\t\t\t/w/me\t50\t\t\t\t0\t1\t\n',
    'a1b2.tsv': '1\talert\t\t\t/w/web\t41\t\t\t\t0\t1\t\n',
    'c3d4.tsv': '1\tbash\t\trunning npm test\t/w/api\t72\t\t\t-65000\t0\t1\t\n',
    'gone.tsv': '1\tidle\t\t\t/w/gone\t90\t\t\t\t0\t\n',
    'notes.txt': 'not a record',
  }
  stubEngine(on, [], () => usage, path => (path.startsWith('/home/u/') ? files[path.split('/').pop() ?? ''] ?? '' : JSON.stringify(BLOCK)))
  on('env.get', () => ({ value: '/home/u' }))
  on('session.id', () => ({ value: 'self' }))
  on('session.root', () => ({ value: '/w/me' }))
  on('fs.list', () => ({ value: Object.keys(files).map(name => ({ name, kind: 'file' as const, size: 1, mtimeMs: name === 'gone.tsv' ? -200000 : 0, isLink: false })) }))
  await $.session.start({ cwd: '/w/me', surface: 'terminal', isInteractive: true })

  const run = (args: string) => $.command.run({ command: 'clawd', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
  expect((await run('peers')).text).toBe('- web · ✻ needs you · HP 41% · /w/web\n- api · running npm test · 1m 05s · HP 72% · /w/api')
  expect((await run('')).text).toContain('- peers: 2 live, 1 needs you')
})

test('/clawd send messages a live session by name, counts it, and sends nothing to an unknown or ambiguous name', async ($, on) => {
  const files: Record<string, string> = {
    'self.tsv': '1\tidle\t\t\t/w/me\t50\t\t\t\t0\t1\t\n',
    'a1b2.tsv': '1\tidle\t\t\t/w/api\t41\t\t\t\t0\t1\t\n',
    'c3d4.tsv': '1\tidle\t\t\t/w/web\t72\t\t\t\t0\t1\t\n',
    'e5f6.tsv': '1\tidle\t\t\t/x/web\t72\t\t\t\t0\t1\t\n',
  }
  stubEngine(on, [], () => usage, path => (path.startsWith('/home/u/') ? files[path.split('/').pop() ?? ''] ?? '' : JSON.stringify(BLOCK)))
  const sent: { to: unknown; text: string }[] = []
  on('env.get', () => ({ value: '/home/u' }))
  on('session.id', () => ({ value: 'self' }))
  on('session.root', () => ({ value: '/w/me' }))
  on('fs.list', () => ({ value: Object.keys(files).map(name => ({ name, kind: 'file' as const, size: 1, mtimeMs: 0, isLink: false })) }))
  on('session.send', (_$, e) => {
    sent.push({ to: e.to, text: e.text })
    return { isDelivered: true }
  })
  await $.session.start({ cwd: '/w/me', surface: 'terminal', isInteractive: true })

  const run = (args: string) => $.command.run({ command: 'clawd', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
  expect((await run('send api hello there')).text).toBe('sent to api')
  // The engine spells a plugin's { sessionId } as the bare id by the time a hook sees it.
  expect(sent).toEqual([{ to: 'a1b2', text: 'hello there' }])
  expect((await run('send web hi')).text).toBe('"web" matches several: web #c3d4, web #e5f6')
  expect((await run('send docs hi')).text).toBe('no live session matches "docs"')
  expect((await run('send api')).text).toBe('usage: /clawd send <session> <message>; /clawd peers lists the sessions')
  expect(sent.length).toBe(1)
  expect((await run('')).text).toContain('- messages sent: 1')
})

test('/clawd send that throws says why and counts nothing', async ($, on) => {
  stubEngine(on, [], () => usage, path => (path.startsWith('/home/u/') ? '1\tidle\t\t\t/w/api\t41\t\t\t\t0\t1\t\n' : JSON.stringify(BLOCK)))
  on('env.get', () => ({ value: '/home/u' }))
  on('session.id', () => ({ value: 'self' }))
  on('session.root', () => ({ value: '/w/me' }))
  on('fs.list', () => ({ value: [{ name: 'a1b2.tsv', kind: 'file' as const, size: 1, mtimeMs: 0, isLink: false }] }))
  // A hook that throws is skipped, so the call fails beneath it, as a closed socket would.
  on('session.send', () => {
    throw new Error('the socket closed')
  })
  await $.session.start({ cwd: '/w/me', surface: 'terminal', isInteractive: true })

  const run = (args: string) => $.command.run({ command: 'clawd', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
  expect((await run('send api hi')).text).toMatch(/^not sent to api: no implementation for session\.send/)
  expect((await run('')).text).not.toContain('messages sent')
})

test('a clawd-pet note from another session is taken before the model, toasts, and lands in the report', async ($, on) => {
  const toasts: string[] = []
  stubEngine(on, toasts)
  const received: string[] = []
  on('session.receive', (_$, e) => {
    received.push(e.text)
    return { text: e.text }
  })
  await $.session.start({ cwd: '/w/me', surface: 'terminal', isInteractive: true })

  const text = '<cross-session-message from="uds:/tmp/s.sock" from-name="api" from-mode="bypass">\u0001clawd-pet note: lunch at 12\u0001</cross-session-message>'
  expect(await $.session.receive({ origin: { kind: 'peer', plugin: 'clawd-pet' }, text })).toEqual({ consumed: 'clawd-pet note' })
  expect(received).toEqual([])
  expect(toasts).toEqual(['✎ note from api: lunch at 12'])
  const report = await $.command.run({ command: 'clawd', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
  expect(report.text).toContain('- notes: "lunch at 12" (api, 0s ago)')
})

test('a message from another mod or model toasts and reaches the model unchanged; other deliveries pass silently', async ($, on) => {
  const toasts: string[] = []
  stubEngine(on, toasts)
  const received: string[] = []
  on('session.receive', (_$, e) => {
    received.push(e.text)
    return { text: e.text }
  })
  await $.session.start({ cwd: '/w/me', surface: 'terminal', isInteractive: true })

  const other = '<cross-session-message from-name="web">\u0001clawd-pet note: rebase now\u0001</cross-session-message>'
  const model = '<cross-session-message from-name="api">the migration is merged</cross-session-message>'
  expect(await $.session.receive({ origin: { kind: 'peer', plugin: 'other-mod' }, text: other })).toEqual({ text: other })
  expect(await $.session.receive({ origin: { kind: 'peer' }, text: model })).toEqual({ text: model })
  await $.session.receive({ origin: { kind: 'bridge' }, text: 'from the phone' })
  await $.session.receive({ origin: { kind: 'peer', plugin: 'clawd-pet' }, text: 'clawd-pet note: for a worker', agentId: 'a1' })
  expect(received).toEqual([other, model, 'from the phone', 'clawd-pet note: for a worker'])
  expect(toasts).toEqual(['✉ web: clawd-pet note: rebase now', '✉ api: the migration is merged'])
})

test('/clawd note sends the prefixed note to a session that reads notes, and nothing to an older one', async ($, on) => {
  const files: Record<string, string> = {
    'self.tsv': '1\tidle\t\t\t/w/me\t50\t\t\t\t0\t1\t\n',
    'a1b2.tsv': '1\tidle\t\t\t/w/api\t41\t\t\t\t0\t1\t\n',
    'c3d4.tsv': '1\tidle\t\t\t/w/old\t72\t\t\t\t0\t\n',
  }
  stubEngine(on, [], () => usage, path => (path.startsWith('/home/u/') ? files[path.split('/').pop() ?? ''] ?? '' : JSON.stringify(BLOCK)))
  const sent: { to: unknown; text: string }[] = []
  on('env.get', () => ({ value: '/home/u' }))
  on('session.id', () => ({ value: 'self' }))
  on('session.root', () => ({ value: '/w/me' }))
  on('fs.list', () => ({ value: Object.keys(files).map(name => ({ name, kind: 'file' as const, size: 1, mtimeMs: 0, isLink: false })) }))
  on('session.send', (_$, e) => {
    sent.push({ to: e.to, text: e.text })
    return { isDelivered: true }
  })
  await $.session.start({ cwd: '/w/me', surface: 'terminal', isInteractive: true })

  const run = (args: string) => $.command.run({ command: 'clawd', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
  expect((await run('note api lunch at 12')).text).toBe('note sent to api')
  expect(sent).toEqual([{ to: 'a1b2', text: 'clawd-pet note: lunch at 12' }])
  expect((await run('note old hi')).text).toBe('old runs an older clawd-pet that would hand the note to its model; use /clawd send instead')
  expect((await run('note api')).text).toBe('usage: /clawd note <session> <note>; /clawd peers lists the sessions')
  expect(sent.length).toBe(1)
  expect((await run('')).text).not.toContain('messages sent')
})

test('with the Peer board off, /clawd peers reads no other session', { options: { peers: false } }, async ($, on) => {
  stubEngine(on)
  let listed = false
  on('env.get', () => ({ value: '/home/u' }))
  on('session.id', () => ({ value: 'self' }))
  on('fs.list', () => {
    listed = true
    return { value: [] }
  })
  await $.session.start({ cwd: '/w/me', surface: 'terminal', isInteractive: true })

  const r = await $.command.run({ command: 'clawd', args: 'peers', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
  expect(r.text).toBe('The Peer board setting is off, so other sessions are not read.')
  expect(listed).toBe(false)
})

test('another session finishing a long turn or starting to wait toasts here, and the HUD counts the waiting', async ($, on) => {
  const toasts: string[] = []
  const files: Record<string, string> = {}
  const record = (mode: string, cwd: string, turnStartedAt = '') => `1\t${mode}\t\t\t${cwd}\t72\t\t\t${turnStartedAt}\t${clock.now()}\t1\t\n`
  const { clock } = stubEngine(on, toasts, () => usage, path => (path.startsWith('/home/u/') ? files[path.split('/').pop() ?? ''] ?? '' : JSON.stringify(BLOCK)))
  on('env.get', () => ({ value: '/home/u' }))
  on('session.id', () => ({ value: 'self' }))
  on('session.root', () => ({ value: '/w/me' }))
  on('fs.list', () => ({ value: Object.keys(files).map(name => ({ name, kind: 'file' as const, size: 1, mtimeMs: clock.now(), isLink: false })) }))
  await $.session.start({ cwd: '/w/me', surface: 'terminal', isInteractive: true })
  const peerToasts = () => toasts.filter(t => t.startsWith('✻'))

  // The first read only seeds what the other sessions were doing.
  files['a1.tsv'] = record('bash', '/w/api', '-25000')
  files['b2.tsv'] = record('read', '/w/web', '0')
  files['c3.tsv'] = record('alert', '/w/docs')
  await clock.advance(10000)
  expect(peerToasts()).toEqual([])

  files['a1.tsv'] = record('idle', '/w/api')
  files['b2.tsv'] = record('alert', '/w/web', '0')
  await clock.advance(10000)
  expect(peerToasts()).toEqual(['✻ web needs you', '✻ api finished (45s)'])

  const hint = await $.ui.mount({ plugin: 'clawd-pet', surface: 'terminal', ...HINT })
  expect(JSON.stringify(await hint.drawn())).toContain('✻ 2 waiting')
  await hint.unmount()

  await clock.advance(10000)
  expect(peerToasts().length).toBe(2)
})

test('an advisor that never runs under the main model toasts once, counts in the recap and the report, and /clawd advisor fills the fix', async ($, on) => {
  const toasts: string[] = []
  stubEngine(on, toasts)
  const filled: string[] = []
  on('settings.read', () => ({ value: { advisorModel: 'opus' } }))
  on('prompt.fill', (_$, e) => {
    filled.push(e.text)
    return { isFilled: true }
  })
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('turn.step', async function* (_$, e) {
    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn' as const,
      usage: null,
      serverToolUses: e.agentId === undefined ? [{ id: 'a', name: 'advisor', input: {}, startedAt: 1000, endedAt: 15_000 }] : undefined,
    }
  })
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  const stepOnce = async (model: string, agentId?: string) => {
    const s = $.turn.step({ turnId: 't1', index: 0, model, messageCount: 1, ...(agentId !== undefined && { agentId }) })
    let chunk = await s.next()
    while (!chunk.done) {
      chunk = await s.next()
    }
    return chunk.value
  }

  await $.turn.start({ text: 'go', turnId: 't1' })
  const r = await stepOnce('claude-fable-5-1')
  expect(r.stopReason).toBe('end_turn')
  await stepOnce('claude-fable-5-1')
  await stepOnce('claude-fable-5-1', 'sub1')
  expect(toasts.filter(t => t.includes('advisor'))).toEqual(['✻ advisor opus never runs under fable · /clawd advisor'])
  await $.turn.complete({ answer: '', durationMs: 45_000, isAborted: false, turnId: 't1', reason: 'answer' })
  expect(toasts.at(-1)).toBe('done in 45s · advisor ×2 (28s)')

  const run = (args: string) => $.command.run({ command: 'clawd', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
  expect((await run('')).text).toContain('- advisor: opus is not stronger than fable, so it never runs · fix: /model sonnet · 2 calls, 28s this session')
  expect((await run('advisor')).text).toBe(
    'main claude-fable-5-1 · advisor opus\nadvisor opus is not stronger than fable, so it never runs · fix: /model sonnet\npress Enter to apply: /model sonnet',
  )
  expect(filled).toEqual(['/model sonnet'])

  await stepOnce('claude-sonnet-5-5')
  expect((await run('advisor')).text).toBe('main claude-sonnet-5-5 · advisor opus\nadvisor opus · active')
  expect(filled.length).toBe(1)
  expect(toasts.filter(t => t.includes('never runs')).length).toBe(1)
})

test('main-loop steps toast a cold cache, a cut reply and a fallback once per turn, and /clawd reports the cache share', async ($, on) => {
  const toasts: string[] = []
  stubEngine(on, toasts)
  on('settings.read', () => ({ value: {} }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  const usage = (read: number, created: number, model = 'claude-opus-5-5') => ({ input_tokens: 10, output_tokens: 5, cache_read_input_tokens: read, cache_creation_input_tokens: created, model })
  let next: { stopReason: 'end_turn' | 'max_tokens'; usage: ReturnType<typeof usage> } = { stopReason: 'end_turn', usage: usage(0, 0) }
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], ...next }
  })
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  const stepOnce = async (step: typeof next, agentId?: string) => {
    next = step
    const s = $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 1, ...(agentId !== undefined && { agentId }) })
    let chunk = await s.next()
    while (!chunk.done) {
      chunk = await s.next()
    }
    return chunk.value
  }

  await $.turn.start({ text: 'go', turnId: 't1' })
  await stepOnce({ stopReason: 'end_turn', usage: usage(0, 57215) })
  expect(toasts).toEqual([])
  await stepOnce({ stopReason: 'max_tokens', usage: usage(1000, 57215, 'claude-sonnet-5-5') }, 'sub1')
  expect(toasts).toEqual([])
  await stepOnce({ stopReason: 'max_tokens', usage: usage(1000, 57215, 'claude-sonnet-5-5') })
  await stepOnce({ stopReason: 'max_tokens', usage: usage(1000, 57215, 'claude-sonnet-5-5') })
  expect(toasts).toEqual(['❄ prompt cache went cold: 57k tokens re-cached', '✂ the reply hit max_tokens and was cut', '↯ answered by sonnet, not opus'])

  await $.turn.complete({ answer: '', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' })
  await $.turn.start({ text: 'again', turnId: 't2' })
  await stepOnce({ stopReason: 'max_tokens', usage: usage(178000, 0) })
  expect(toasts.at(-1)).toBe('✂ the reply hit max_tokens and was cut')

  const report = await $.command.run({ command: 'clawd', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
  expect(report.text).toContain('- cache: 51% of input read from cache')
})
