// Records docs/images/demo.gif: a scripted session played through the mod's own modules, at the mod's tick, and
// drawn cell by cell the way a terminal draws what the mod returns.
// Run: node tools/demo/record.mjs [out.gif] (Node 22.18 or later). Needs Google Chrome, or its path in CHROME,
// and ffmpeg on the PATH.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// The hooks import each other without an extension, as the mod's bundler allows.
registerHooks({ resolve: (spec, ctx, next) => next(/^\.\.?\//.test(spec) && !/\.[a-z]+$/.test(spec) ? `${spec}.ts` : spec, ctx) })
const plugin = new URL('../../plugins/clawd-pet/', import.meta.url)
const hook = name => import(new URL(`hooks/${name}.ts`, plugin).href)
const { TICK_MS, fail, leapClipMs, step } = await hook('anim')
const { HUD_WINDOW_W, barWidth, frameColor, hudRows, mood, windowEdges } = await hook('hud')
const { minisOnScreen } = await hook('minis')
const { animate, readTheme } = await hook('theme')
const { BODY_W, HEIGHT, MAX_MINIS, compose, crop, encodeCells, trailWidth } = await hook('pixels')
const { GROUND_H, drawBand, layScene, obstacleSpans } = await hook('scene')
const { lineColor, lineWidth, statusLine, targetOf, toolMode } = await hook('status')

const out = process.argv[2] ?? fileURLToPath(new URL('../../docs/images/demo.gif', import.meta.url))
const chromePath = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
if (!existsSync(chromePath)) {
  console.error(`No Chrome at ${chromePath}. Set CHROME to its path.`)
  process.exit(1)
}

// ---- the session ----

const PROMPT = 'add a dark mode toggle to the settings page'
const TYPED = [300, 1700] // ms: the prompt is typed between these
const TURN = [2000, 21200] // ms: the turn runs between these
const END_MS = 25000
// Each tool call: when it runs, its tool and input, the transcript's name for it, and its result.
const CALLS = [
  { at: [3600, 5600], tool: 'Read', input: { file_path: 'src/settings/Settings.tsx' }, shown: 'Read(src/settings/Settings.tsx)', result: 'Read 142 lines' },
  { at: [6000, 7800], tool: 'Grep', input: { pattern: 'theme' }, shown: 'Search(pattern: "theme", path: "src")', result: 'Found 6 files' },
  { at: [8200, 9200], tool: 'Task', input: {}, shown: 'Task(Find the theme tokens)', result: 'Running in the background' },
  {
    at: [9600, 11400],
    tool: 'WebFetch',
    input: { url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme' },
    shown: 'Fetch(developer.mozilla.org/…/prefers-color-scheme)',
    result: 'Received 41.2KB',
  },
  { at: [11800, 14200], tool: 'Edit', input: { file_path: 'src/settings/Settings.tsx' }, shown: 'Update(src/settings/Settings.tsx)', result: 'Updated with 18 additions' },
  { at: [14600, 16600], tool: 'Bash', input: { command: 'npm test' }, shown: 'Bash(npm test)', result: 'Error: 1 test failed', fails: true },
  { at: [17000, 18400], tool: 'Edit', input: { file_path: 'src/theme.ts' }, shown: 'Update(src/theme.ts)', result: 'Updated with 3 additions' },
  { at: [18800, 20800], tool: 'Bash', input: { command: 'npm test' }, shown: 'Bash(npm test)', result: '24 passed' },
]
const SUBAGENT = { id: 'tokens', since: 8400, doneAt: 20200, name: 'Find the theme tokens' }
const ANSWER = 'The settings page has a dark mode toggle, and the tests pass.'

// The HUD as the session's usage would read every 2 s: context and the 5-hour limit drain while the turn runs.
function hudAt(t) {
  const polled = Math.floor(t / 2000) * 2000
  const worked = Math.max(0, Math.min(polled, TURN[1]) - TURN[0]) / (TURN[1] - TURN[0])
  return { hp: Math.round(100 - 22 * worked), mp: Math.round(92 - 4 * worked), mpResetsInMin: 219, st: 57, stResetsInMin: 4380 }
}

// ---- the screen, as register.tsx lays it out ----

const COLS = 86
const ROWS = 10 // the band's height in cells, above the ground
const GROUND_ROWS = GROUND_H / 2
const STATUS_ROOM = 20
const LEAVE_MS = 1500
const SLOW_BEATS = { idle: 2, sleep: 4 }
const TRANSCRIPT_ROWS = 7
const GREY = '#8b93b8'
const TEXT = '#e3e6f0'

function transcriptAt(t) {
  const lines = []
  if (t >= TURN[0]) lines.push({ text: `> ${PROMPT}`, color: GREY })
  for (const c of CALLS) {
    if (t < c.at[0]) break
    const done = t >= c.at[1]
    const dot = done ? (c.fails ? '#f0506e' : '#2fbf5b') : GREY
    lines.push({ spans: [{ text: '⏺ ', color: dot }, { text: c.shown, color: TEXT, bold: true }] })
    if (done) lines.push({ text: `  ⎿  ${c.result}`, color: c.fails ? '#f0506e' : GREY })
  }
  if (t >= SUBAGENT.doneAt) lines.push({ spans: [{ text: '⏺ ', color: '#2fbf5b' }, { text: `Agent "${SUBAGENT.name}" finished`, color: TEXT }] })
  if (t >= TURN[1]) lines.push({ spans: [{ text: '⏺ ', color: TEXT }, { text: ANSWER, color: TEXT }] })
  return lines.slice(-TRANSCRIPT_ROWS)
}

function spansOps(row, col, spans) {
  return spans.map(s => {
    const op = { kind: 'text', row, col, ...s }
    col += [...s.text].length
    return op
  })
}

function screen(t, a, body, layout) {
  const ops = []
  transcriptAt(t).forEach((l, i) => ops.push(...spansOps(1 + i, 0, l.spans ?? [l])))

  const band = 2 + TRANSCRIPT_ROWS
  const hud = hudAt(t)
  const minis = minisOnScreen(minisAt(t), t)
  const elapsed = t - a.since
  const drawn = a.leap ? { mode: 'jump', ms: leapClipMs(t - a.leap.since) } : { mode: a.mode, ms: elapsed }
  const picture = compose(body, drawn.mode, drawn.ms, a.dir, mood(hud), minis)
  const extra = minis.length > MAX_MINIS ? ` (+${minis.length - MAX_MINIS} minis)` : ''
  const line = statusLine(a.mode, a.since, elapsed, a.target, body.look.lines[a.mode]) + extra
  // The band with its scene, cut around the status line, as register.tsx draws it.
  const width = layout.width
  const textW = lineWidth(line) + 3
  const left = Math.max(0, Math.min(Math.round(a.x), width - picture.w - textW))
  const canvas = drawBand(body, body.scene, layout, picture, left, t)
  const raster = (row, col, x, y, w, h) => ops.push({ kind: 'raster', row, col, columns: w, cells: encodeCells(crop(canvas, x, y, w, h)) })
  const textAt = left + picture.w
  const shown = Math.min(textW, width - textAt)
  raster(band, 0, 0, 0, textAt, HEIGHT)
  if (shown > 0) {
    raster(band, textAt, textAt, 0, shown, HEIGHT - 4)
    ops.push({ kind: 'text', row: band + ROWS - 2, col: textAt, text: ` › ${line}`.slice(0, shown), color: lineColor(a.mode, body.look.lineColors), bold: true })
    raster(band + ROWS - 1, textAt, textAt, HEIGHT - 2, shown, 2)
  }
  if (width - textAt - shown > 0) raster(band, textAt + shown, textAt + shown, 0, width - textAt - shown, HEIGHT)
  raster(band + ROWS, 0, 0, HEIGHT, width, GROUND_H)

  const prompt = band + ROWS + GROUND_ROWS
  const typed = t < TYPED[0] ? 0 : t >= TURN[0] ? 0 : Math.round(PROMPT.length * Math.min(1, (t - TYPED[0]) / (TYPED[1] - TYPED[0])))
  ops.push({ kind: 'text', row: prompt, col: 0, text: '─'.repeat(COLS), color: '#4b5068' })
  ops.push({ kind: 'text', row: prompt + 1, col: 0, text: `> ${PROMPT.slice(0, typed)}`, color: TEXT })
  ops.push({ kind: 'text', row: prompt + 2, col: 0, text: '─'.repeat(COLS), color: '#4b5068' })
  ops.push({ kind: 'text', row: prompt + 3, col: 2, text: '⏵⏵ auto mode on (shift+tab to cycle)', color: '#6b7499' })

  const hudW = Math.min(HUD_WINDOW_W, Math.max(24, COLS - 2))
  const edges = windowEdges(hudW, body.name)
  const frame = frameColor(body.look.hud)
  const rows = hudRows(hud, body.look.hud, barWidth(hudW))
  const top = prompt + 4
  ops.push({ kind: 'text', row: top, col: 1, text: edges.top, color: frame })
  rows.forEach((r, i) => {
    const row = top + 1 + i
    ops.push({ kind: 'text', row, col: 1, text: edges.side, color: frame })
    ops.push(...spansOps(row, 3, [{ text: `${r.label} `, color: r.color, bold: true }, ...r.bar, ...r.parts]))
    ops.push({ kind: 'text', row, col: hudW, text: edges.side, color: frame })
  })
  ops.push({ kind: 'text', row: top + 1 + rows.length, col: 1, text: edges.bottom, color: frame })
  return ops
}

function minisAt(t) {
  if (t < SUBAGENT.since || t - SUBAGENT.doneAt >= LEAVE_MS) return []
  return [{ id: SUBAGENT.id, since: SUBAGENT.since, doneAt: t >= SUBAGENT.doneAt ? SUBAGENT.doneAt : undefined }]
}

// The pet tick by tick, as register.tsx's clock hook steps it, with each frame's screen.
function play() {
  const body = animate(readTheme(JSON.parse(readFileSync(new URL('assets/clawd.json', plugin), 'utf8'))).theme)
  // The band leaves the last column free, so a full row never wraps.
  const layout = layScene(body.scene, Math.max(BODY_W, COLS - 1))
  let a = { mode: 'idle', since: 0, x: 0, dir: 1, tick: 0, target: '', working: false }
  let ops
  const frames = []
  for (let beat = 0, t = 0; t < END_MS; beat++, t += TICK_MS) {
    const running = CALLS.filter(c => t >= c.at[0] && t < c.at[1])
    const ended = CALLS.filter(c => t >= c.at[1])
    const latest = running.at(-1)
    for (const c of CALLS) {
      if (c.fails && t - TICK_MS < c.at[1] && t >= c.at[1]) a = fail(a, c.at[1])
    }
    const activity = {
      isWorking: t >= TURN[0] && t < TURN[1],
      activeTools: running.length,
      activeMode: latest ? toolMode(latest.tool) : a.mode,
      activeTarget: latest ? targetOf(latest.tool, latest.input) : '',
      lastToolAt: running.length ? t : (ended.at(-1)?.at[1] ?? -Infinity),
      room: Math.max(0, COLS - BODY_W - trailWidth(minisAt(t).length) - STATUS_ROOM),
      obstacles: obstacleSpans(layout),
      trail: trailWidth(minisAt(t).length),
    }
    const moved = step(a, activity, t)
    const slowBeat = minisAt(t).length > 0 ? undefined : SLOW_BEATS[moved.mode]
    const holds = slowBeat !== undefined && moved.mode === a.mode && beat % slowBeat !== 0
    if (!holds) {
      a = moved
      ops = screen(t, a, body, layout)
    }
    frames.push(ops)
  }
  return frames
}

// ---- drawing and encoding ----

const CW = 9 // px per cell across; a cell is twice as tall, so a pet pixel is square
const CH = 18
const PAD = 16
const BAR = 28 // the window's title bar
const SCREEN_ROWS = 2 + TRANSCRIPT_ROWS + ROWS + GROUND_ROWS + 4 + 5 + 1
const W = PAD * 2 + COLS * CW
const H = BAR + PAD + SCREEN_ROWS * CH

const PAGE = `<!doctype html><meta charset="utf-8"><body style="margin:0"><canvas id="c" width="${W}" height="${H}"></canvas><script>
const g = document.getElementById('c').getContext('2d')
const BG = '#14161f'
const hex = n => '#' + n.toString(16).padStart(6, '0')
const at = (col, row) => [${PAD} + col * ${CW}, ${BAR + PAD} + row * ${CH}]
function text({ row, col, text, color, bold }) {
  g.font = (bold ? 'bold ' : '') + '15px Menlo, "DejaVu Sans Mono", monospace'
  g.fillStyle = color
  g.textBaseline = 'middle'
  ;[...text].forEach((ch, i) => {
    const [x, y] = at(col + i, row)
    if (ch === '█') g.fillRect(x, y, ${CW}, ${CH})
    else if (ch === '▀') g.fillRect(x, y, ${CW}, ${CH / 2})
    else if (ch === '▄') g.fillRect(x, y + ${CH / 2}, ${CW}, ${CH / 2})
    else if (ch !== ' ') g.fillText(ch, x, y + ${CH / 2} + 1)
  })
}
// Raster cells: little-endian u32 triplets [glyph, fg, bg]; a color at or past 0x01000000 is the terminal's own.
function raster({ row, col, columns, cells }) {
  const b = atob(cells)
  const u32 = k => (b.charCodeAt(k) | (b.charCodeAt(k + 1) << 8) | (b.charCodeAt(k + 2) << 16) | (b.charCodeAt(k + 3) << 24)) >>> 0
  for (let i = 0; i * 12 < b.length; i++) {
    const [glyph, fg, bg] = [u32(i * 12), u32(i * 12 + 4), u32(i * 12 + 8)]
    const [x, y] = at(col + (i % columns), row + Math.floor(i / columns))
    const half = (color, dy) => { if (color < 0x01000000) { g.fillStyle = hex(color); g.fillRect(x, y + dy, ${CW}, ${CH / 2}) } }
    if (glyph === 0x2580) { half(fg, 0); half(bg, ${CH / 2}) }
    if (glyph === 0x2584) half(fg, ${CH / 2})
  }
}
window.draw = ops => {
  g.fillStyle = '#2a2d3a'; g.fillRect(0, 0, ${W}, ${H})
  ;['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(18 + i * 20, ${BAR / 2}, 6, 0, 7); g.fill() })
  g.fillStyle = BG; g.fillRect(0, ${BAR}, ${W}, ${H - BAR})
  for (const op of ops) (op.kind === 'raster' ? raster : text)(op)
  return document.getElementById('c').toDataURL('image/png')
}
</script>`

async function devtools(dir) {
  const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${join(dir, 'profile')}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' })
  const portFile = join(dir, 'profile', 'DevToolsActivePort')
  for (let i = 0; !existsSync(portFile); i++) {
    if (i > 100) throw new Error('Chrome did not start')
    await new Promise(r => setTimeout(r, 100))
  }
  const port = readFileSync(portFile, 'utf8').split('\n')[0]
  const page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(p => p.type === 'page')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => Object.assign(ws, { onopen: resolve, onerror: reject }))
  const pending = new Map()
  ws.onmessage = ({ data }) => {
    const m = JSON.parse(data)
    pending.get(m.id)?.(m)
    pending.delete(m.id)
  }
  let id = 0
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      pending.set(++id, m => (m.error ? reject(new Error(m.error.message)) : resolve(m.result)))
      ws.send(JSON.stringify({ id, method, params }))
    })
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
    return r.result.value
  }
  return { evaluate, send, close: () => (ws.close(), chrome.kill()) }
}

const dir = mkdtempSync(join(tmpdir(), 'clawd-pet-demo-'))
const browser = await devtools(dir)
try {
  writeFileSync(join(dir, 'page.html'), PAGE)
  await browser.send('Page.navigate', { url: pathToFileURL(join(dir, 'page.html')).href })
  while ((await browser.evaluate('typeof draw')) !== 'function') await new Promise(r => setTimeout(r, 50))
  const frames = play()
  for (const [i, ops] of frames.entries()) {
    const png = await browser.evaluate(`draw(${JSON.stringify(ops)})`)
    writeFileSync(join(dir, `${String(i).padStart(4, '0')}.png`), Buffer.from(png.split(',')[1], 'base64'))
  }
  const ffmpeg = spawnSync('ffmpeg', [
    '-y', '-v', 'error', '-framerate', String(1000 / TICK_MS), '-i', join(dir, '%04d.png'),
    '-vf', 'split[a][b];[a]palettegen=max_colors=160:stats_mode=full[p];[b][p]paletteuse=dither=none:diff_mode=rectangle',
    out,
  ], { stdio: 'inherit' })
  if (ffmpeg.error || ffmpeg.status !== 0) throw new Error(`ffmpeg failed${ffmpeg.error ? `: ${ffmpeg.error.message}` : ''}`)
  console.log(`wrote ${out}: ${frames.length} frames, ${W}×${H}`)
} finally {
  browser.close()
  rmSync(dir, { recursive: true, force: true })
}
