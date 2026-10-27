import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Anim, Mode } from '../types'
import { TICK_MS, ended, fail, leapClipMs, needsUser, step } from './anim'
import { HUD_WINDOW_W, barWidth, fmtUsd, frameColor, gaugeWarnings, hudFrom, hudLine, hudRows, mood, paceWarning, windowEdges } from './hud'
import type { Hud } from './hud'
import { HEAVY_TOKENS, estimateTokens, heaviestLine, heavyWarning, keepHeaviest } from './heavy'
import type { Heavy } from './heavy'
import { callKey, loopWarning, repeat } from './loops'
import type { Repeats } from './loops'
import { minisOnScreen, reconcile } from './minis'
import { noteTurn, stepLimit, turnsLeft } from './pace'
import type { LimitPace } from './pace'
import type { Mini } from './minis'
import { animate, readTheme, restingFrame } from './theme'
import { previewPage } from './preview'
import { readSettings } from './settings'
import { SHELL_DIR, shellDue, shellKey, shellRecord } from './shell'
import type { ShellState } from './shell'
import { callCount, countCall, countTurn, newStats, statsReport, streakWarning, turnRecap } from './stats'
import { addToday, dayOf, readToday, todayLine } from './today'
import { BODY_W, FACES, HEIGHT, MAX_MINIS, compose, crop, encodeCells, encodeSvg, trailWidth } from './pixels'
import type { Body } from './pixels'
import { GROUND_H, drawBand, layScene, obstacleSpans } from './scene'
import type { SceneLayout } from './scene'
import { clocked, lineColor, lineWidth, statusLine, targetOf, toolMode } from './status'
import type { ToolMode } from './status'

const ROWS = 10 // a cell is two pixels tall, so the frames are 20 px high
const GROUND_ROWS = GROUND_H / 2
const STATUS_ROOM = 20 // columns kept free beside a running pet for its status line
const USAGE_EVERY_BEATS = 20
const AGENTS_EVERY_BEATS = 5
// How long a rate limit's pace must run before it makes a forecast, so one burst does not.
const PACE_MIN_MS = { mp: 15 * 60000, st: 2 * 3600000 }
const SLOW_BEATS: Partial<Record<Mode, number>> = { idle: 2, sleep: 4 } // ticks per redraw while nothing moves fast

const THEME_KEY = 'theme' // in $.store: the theme set_theme last took
const TODAY_KEY = 'today' // in $.store: the day's work across sessions
const OWN_TOOLS = 'mcp__clawd-pet__'
// Literals, so `claude plugin validate` can read the hooks' matchers.
const SET_THEME = 'mcp__clawd-pet__set_theme'
const PREVIEW_THEME = 'mcp__clawd-pet__preview_theme'
const GET_THEME = 'mcp__clawd-pet__get_theme'

const anim = atom({ plugin: 'clawd-pet', key: 'anim' } as const, {
  mode: 'idle',
  since: 0,
  x: 0,
  dir: 1,
  tick: 0,
  target: '',
  working: false,
} as Anim)

/** The HUD from fresh usage, or `last` when the usage call fails. */
async function usageOr($: EngineInterface, now: number, last: Hud | undefined) {
  try {
    return hudFrom(await $.session.usage(), now)
  } catch {
    return last
  }
}

/** The HUD's last reading, each rate limit's pace, and the minutes until each runs out when that beats its reset. */
type Gauges = { hud?: Hud; mpPace: LimitPace; stPace: LimitPace; mpOutMin?: number; stOutMin?: number }

/**
 * The gauges after a `fresh` reading at `t`: toasts for the gauges that fell to a mark and the limits whose pace runs
 * them out first, then a redraw of the HUD. No reading, or the last one again, changes nothing.
 */
function takeReading($: EngineInterface, g: Gauges, fresh: Hud | undefined, t: number, toasts: boolean, turns: number | undefined): Gauges {
  if (!fresh || fresh === g.hud) {
    return g
  }
  if (toasts) {
    for (const warning of gaugeWarnings(g.hud, fresh, turns)) {
      $.ui.toast(warning, { timeoutMs: 10000 })
    }
  }
  const mp = stepLimit(g.mpPace, fresh.mp, fresh.mpResetsInMin, t, PACE_MIN_MS.mp)
  const st = stepLimit(g.stPace, fresh.st, fresh.stResetsInMin, t, PACE_MIN_MS.st)
  if (toasts && mp.warn && mp.outMin !== undefined) {
    $.ui.toast(paceWarning('5-hour limit', mp.outMin, fresh.mpResetsInMin), { timeoutMs: 10000 })
  }
  if (toasts && st.warn && st.outMin !== undefined) {
    $.ui.toast(paceWarning('7-day limit', st.outMin, fresh.stResetsInMin), { timeoutMs: 10000 })
  }
  $.ui.invalidate('ui.render')

  return { hud: fresh, mpPace: mp.pace, stPace: st.pace, mpOutMin: mp.outMin, stOutMin: st.outMin }
}

/** The minis after a fresh look at the session's agents, or `last` when the list call fails. */
async function minisOr($: EngineInterface, now: number, last: Mini[]) {
  try {
    return reconcile(last, await $.agent.list(), now)
  } catch {
    return last
  }
}

/** What preview_theme and set_theme tell Claude about a theme's pet: the clips and faces made, the resting frame, and readTheme's notes. */
function themeReport(pet: Body, notes: string[]) {
  const made = `${Object.keys(pet.clips).join(', ')}, and ${FACES.length} faces`
  const noted = notes.length > 0 ? `\n\nNotes, to act on or leave as drawn:\n- ${notes.join('\n- ')}` : ''

  return `The mod made every clip and face from the sprite: ${made}.\n\nResting frame (@ is an eye, * a cheek):\n${restingFrame(pet)}${noted}`
}

/** Counts `add` into the day's work kept across sessions. Losing a count is better than failing the hook. */
async function countToday($: EngineInterface, now: number, add: Parameters<typeof addToday>[2]) {
  try {
    await $.store.set(TODAY_KEY, addToday(await $.store.get(TODAY_KEY), now, add))
  } catch {
    // The report shows what was kept.
  }
}

/** The default Clawd theme, from the plugin's own file. */
async function clawdBody($: EngineInterface) {
  const read = readTheme(JSON.parse(await $.fs.read(`${$.plugin.root}/assets/clawd.json`)))
  if (read.errors) {
    throw new Error(`assets/clawd.json: ${read.errors.join(' ')}`)
  }

  return animate(read.theme)
}

/** The theme set_theme kept in an earlier session, else Clawd. A kept theme this version cannot read gives way to Clawd, with a toast. */
async function keptBody($: EngineInterface) {
  const kept = await $.store.get(THEME_KEY)
  if (kept !== undefined) {
    const read = readTheme(kept)
    if (!read.errors) {
      return animate(read.theme)
    }
    $.ui.toast(`clawd-pet: your theme no longer reads (${read.errors[0]}). Showing Clawd.`)
  }

  return clawdBody($)
}

export const register: Register = (on, options) => {
  const settings = readSettings(options)
  let isWorking = false
  let lastToolAt = 0
  let activeTools = 0
  let activeMode: ToolMode = 'bash'
  let activeTarget = ''
  let bodyColumns = 80
  let beat = 0
  let showsError = false
  let alert = false // a notification waits on the user
  let compacting = false
  let turnStartedAt: number | undefined // the main loop's turn running now
  let body: Body | undefined
  let gauges: Gauges = { mpPace: {}, stPace: {} } // pushed by session.measure, polled by the tick as a fallback
  let minis: Mini[] = []
  let stats = newStats(0)
  let turnStats = stats // the counts when the main loop's turn began
  let repeats: Repeats = {}
  let hps: number[] = [] // the context left at the end of recent turns
  let heaviest: Heavy[] = [] // the session's heaviest tool results, for the report
  const lastTargets = new Map<string, string>() // the target of each tool's latest call, to name its result
  let shellPath: string | undefined // this session's record for the zsh plugin, once its home and id are known
  let shellCwd = ''
  let shellLast = { key: '', at: 0 }
  let previewed: unknown // the last theme preview_theme drew, for set_theme to apply without resending it
  let layout: SceneLayout | undefined // the scene of `layoutOf` on a band `bandWidth()` wide
  let layoutOf: Body | undefined

  // The band leaves the last column free, so a full row never wraps.
  const bandWidth = () => Math.max(BODY_W, bodyColumns - 1)
  /** The layout of the pet's scene on the band as wide as it is now, or undefined for a pet with no scene. */
  const sceneLayout = (pet: Body) => {
    if (!pet.scene) {
      return undefined
    }
    if (layout?.width !== bandWidth() || layoutOf !== pet) {
      layout = layScene(pet.scene, bandWidth())
      layoutOf = pet
    }
    return layout
  }

  on('session.start', async ($, e, next) => {
    const now = await $.clock.now()
    await update($, anim, () => ({ mode: 'idle', since: now, x: 0, dir: 1, tick: 0, target: '', working: false }))
    gauges = { ...gauges, hud: await usageOr($, now, undefined) }
    stats = newStats(now)
    heaviest = []
    await countToday($, now, { sessions: 1 })
    if (settings.shellStatus) {
      try {
        const home = await $.env.get('HOME')
        shellCwd = await $.session.root()
        shellPath = home ? `${home}/${SHELL_DIR}/${await $.session.id()}.tsv` : undefined
      } catch {
        shellPath = undefined
      }
    }
    try {
      await $.tool.register({
        name: 'preview_theme',
        description:
          'Writes the preview of a clawd-pet theme to `path`: an HTML page with every motion, face, status line, and HUD look of its pet, and the pet running through its scene. It does not change what is on screen. `theme` is in the format the `clawd-pet:clawd-pet` skill describes. Returns the resting frame and notes on anything repaired.',
        inputSchema: {
          type: 'object',
          properties: {
            theme: { type: 'object', description: 'The theme as a JSON object, in the format FORMAT.md documents.' },
            path: { type: 'string', description: 'Absolute path of the HTML file to write, such as one in the temp folder.' },
          },
          required: ['theme', 'path'],
        },
      })
      await $.tool.register({
        name: 'set_theme',
        description:
          'Sets the clawd-pet theme: the pet, its props, minis, status lines, HUD look, and scene, at once, kept for later sessions. `theme` is in the format the `clawd-pet:clawd-pet` skill describes, or null for the default Clawd. Leave `theme` out to set the last theme preview_theme drew in this session. Returns the resting frame and notes on anything repaired.',
        inputSchema: {
          type: 'object',
          properties: { theme: { type: ['object', 'null'], description: 'The theme as a JSON object, null for the default Clawd, or left out for the last preview.' } },
        },
      })
      await $.tool.register({
        name: 'get_theme',
        description:
          'Returns the clawd-pet theme on screen: the one set_theme kept, or the default Clawd\'s. Start a change from it, so set_theme keeps everything the change leaves alone.',
        inputSchema: { type: 'object', properties: {} },
      })
    } catch {
      // Without the tools the pet still draws; only changing the theme is missing.
    }
    try {
      await $.command.register({
        name: 'clawd',
        description: "Clawd's report on this session: turns, tool calls, failures, files edited, and what is left",
        immediate: true,
      })
    } catch {
      // Without the command the pet still draws and counts.
    }

    $.clock.every(TICK_MS, async () => {
      const t = await $.clock.now()
      beat += 1
      if (beat % USAGE_EVERY_BEATS === 0) {
        // Read first, so a measurement pushed meanwhile is not overwritten with the gauges from before it.
        const fresh = await usageOr($, t, undefined)
        gauges = takeReading($, gauges, fresh, t, settings.toasts, turnsLeft(hps))
      }
      if (settings.minis && beat % AGENTS_EVERY_BEATS === 0) {
        minis = await minisOr($, t, minis)
      }

      const trail = trailWidth(minis.length)
      const room = Math.max(0, bodyColumns - BODY_W - trail - STATUS_ROOM)
      const scene = body && sceneLayout(body)
      const obstacles = scene ? obstacleSpans(scene) : []
      await update($, anim, a => {
        const moved = step(a, { isWorking, activeTools, activeMode, activeTarget, lastToolAt, room, obstacles, trail, alert, compacting }, t, settings)
        // Minis hop on every tick, so they keep the redraw rate up while the pet idles.
        const slowBeat = minis.length > 0 ? undefined : SLOW_BEATS[moved.mode]
        return slowBeat !== undefined && moved.mode === a.mode && beat % slowBeat !== 0 ? a : moved
      })

      if (shellPath) {
        const a = await read($, anim)
        const shell: ShellState = {
          mode: a.mode,
          color: lineColor(a.mode, body?.look.lineColors),
          line: statusLine(a.mode, a.since, t - a.since, a.target, body?.look.lines[a.mode]),
          cwd: shellCwd,
          hp: gauges.hud?.hp,
          mp: gauges.hud?.mp,
          st: gauges.hud?.st,
          turnStartedAt,
        }
        if (shellDue(shell, shellLast.key, shellLast.at, t)) {
          shellLast = { key: shellKey(shell), at: t }
          // A record that cannot be written stops the writes; the pet carries on.
          await $.fs.write(shellPath, shellRecord(shell, t)).catch(() => {
            shellPath = undefined
          })
        }
      }
    })

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (e.tool.startsWith(OWN_TOOLS)) {
      return next(e)
    }
    const t = await $.clock.now()
    activeTools += 1
    const mode = toolMode(e.tool)
    activeMode = mode
    const input = e as unknown as Record<string, unknown>
    const target = settings.targets ? targetOf(e.tool, input) : ''
    activeTarget = target
    if (e.agentId === undefined) {
      lastTargets.set(e.tool, target)
    }
    lastToolAt = t

    let result: Awaited<ReturnType<typeof next>>
    try {
      result = await next(e)
    } finally {
      activeTools = Math.max(0, activeTools - 1)
      lastToolAt = await $.clock.now()
      // A permission prompt for this call has been answered by now.
      alert = false
    }
    // A denied call counts for the pet's face, not as a failure: the user or a hook chose it.
    const errored = 'isError' in result && result.isError === true
    stats = countCall(stats, mode, typeof input.file_path === 'string' ? input.file_path : '', errored)
    const again = repeat(repeats, mode, errored ? undefined : callKey(e.tool, input))
    repeats = again.repeats
    // A failing call already warns through the streak; this catches a loop of calls that succeed.
    const loop = settings.toasts ? loopWarning(again.n, e.tool, target) : undefined
    if (loop) {
      $.ui.toast(loop, { timeoutMs: 8000 })
    }
    const streak = settings.toasts ? streakWarning(stats) : undefined
    if (streak) {
      $.ui.toast(streak, { timeoutMs: 8000 })
    }
    if (errored || 'deny' in result) {
      await update($, anim, a => fail(a, lastToolAt))
    }

    return result
  })

  // Observe-only: the row goes on unchanged. A subagent's results stay out of the main context.
  on('session.append', { door: 'tool-result' }, async ($, e, next) => {
    const tool = e.origin.kind === 'tool' ? e.origin.tool : undefined
    if (e.agentId === undefined && tool !== undefined && !tool.startsWith(OWN_TOOLS)) {
      const tokens = estimateTokens(e.message.content)
      if (tokens >= HEAVY_TOKENS) {
        const target = lastTargets.get(tool) ?? ''
        heaviest = keepHeaviest(heaviest, { tool, target, tokens })
        if (settings.toasts) {
          $.ui.toast(heavyWarning(tool, target, tokens), { timeoutMs: 10000 })
        }
      }
    }
    return next(e)
  })

  // The engine pushes each new measurement; the tick's polling stays as the fallback.
  on('session.measure', async ($, e, next) => {
    const t = await $.clock.now()
    gauges = takeReading($, gauges, hudFrom(e, t), t, settings.toasts, turnsLeft(hps))
    return next(e)
  })

  // The main loop's turns only: a subagent's turn carries its `agentId`.
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      alert = false
      turnStartedAt = await $.clock.now()
      turnStats = stats
      repeats = {}
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      alert = false
      turnStartedAt = undefined
      stats = countTurn(stats, e.durationMs)
      await countToday($, await $.clock.now(), { turns: 1, workMs: e.durationMs, calls: callCount(stats) - callCount(turnStats) })
      // A fresh reading, kept apart from `hud` so the tick still sees the fall and warns.
      const fresh = await usageOr($, await $.clock.now(), undefined)
      if (fresh) {
        hps = noteTurn(hps, fresh.hp)
      }
      const recap = settings.toasts ? turnRecap(turnStats, stats, e.durationMs, e.reason) : undefined
      if (recap) {
        $.ui.toast(recap, { timeoutMs: 8000 })
      }
      if (settings.notifyAfterMs > 0 && e.durationMs >= settings.notifyAfterMs && e.reason !== 'aborted') {
        // The recap is never empty past 30 s, and a notification that cannot be sent is not worth a fault.
        $.ui.notify(turnRecap(turnStats, stats, e.durationMs, e.reason) ?? 'the turn ended', { title: 'Claude Code' }).catch(() => undefined)
      }
      const t = await $.clock.now()
      await update($, anim, a => ended(a, e.reason, t))
    }
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    alert = false
    return next(e)
  })

  // Only the flag changes here: the pet reads only that a notification came, never its text.
  on('classic.Notification', async ($, e, next) => {
    alert = alert || needsUser(e.notification_type)
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (shellPath) {
      const t = await $.clock.now()
      await $.fs.write(shellPath, shellRecord({ mode: 'ended', color: '', line: '', cwd: shellCwd }, t)).catch(() => undefined)
    }
    return next(e)
  })

  on('session.compact', async ($, e, next) => {
    if (e.agentId !== undefined) {
      return next(e)
    }
    compacting = true
    try {
      return await next(e)
    } finally {
      compacting = false
    }
  })

  on('command.run', { command: 'clawd' }, async $ => {
    const t = await $.clock.now()

    const hud = gauges.hud
    const forecast = {
      turns: turnsLeft(hps),
      mpOutMin: stepLimit(gauges.mpPace, hud?.mp, hud?.mpResetsInMin, t, PACE_MIN_MS.mp).outMin,
      stOutMin: stepLimit(gauges.stPace, hud?.st, hud?.stResetsInMin, t, PACE_MIN_MS.st).outMin,
    }

    const today = readToday(await $.store.get(TODAY_KEY).catch(() => undefined), dayOf(t))

    return { text: [statsReport(stats, t, hud, forecast), heaviestLine(heaviest), todayLine(today)].filter(s => s !== '').join('\n') }
  })

  on('tool.call', { tool: PREVIEW_THEME }, async ($, e) => {
    const { theme, path } = e as unknown as { theme?: unknown; path?: unknown }
    const read = readTheme(theme)
    if (read.errors) {
      return { deny: `No preview was written: ${read.errors.join(' ')}` }
    }
    if (typeof path !== 'string' || path === '') {
      return { deny: 'No preview was written: `path` is the HTML file to write.' }
    }
    const preview = animate(read.theme)
    await $.fs.write(path, previewPage(preview, read.notes))
    previewed = theme

    return { result: `Wrote the preview of ${read.theme.name} to ${path}. What is on screen has not changed.\n\n${themeReport(preview, read.notes)}` }
  })

  on('tool.call', { tool: GET_THEME }, async $ => {
    const kept = await $.store.get(THEME_KEY)
    if (kept === undefined) {
      return { result: `No theme is kept, so Clawd is on screen. Its theme:\n\n${await $.fs.read(`${$.plugin.root}/assets/clawd.json`)}` }
    }

    return { result: `The theme set_theme kept:\n\n${JSON.stringify(kept, null, 2)}` }
  })

  on('tool.call', { tool: SET_THEME }, async ($, e) => {
    const given = (e as unknown as { theme?: unknown }).theme
    if (given === undefined && previewed === undefined) {
      return { deny: 'The theme was not set: no preview_theme call in this session to apply. Pass `theme`.' }
    }
    const value = given === undefined ? previewed : given
    if (value === null) {
      await $.store.delete(THEME_KEY)
      body = await clawdBody($)
      $.ui.invalidate('ui.render')

      return { result: 'Clawd is back, for this session and later ones.' }
    }
    const read = readTheme(value)
    if (read.errors) {
      return { deny: `The theme was not set: ${read.errors.join(' ')}` }
    }
    await $.store.set(THEME_KEY, value)
    body = animate(read.theme)
    $.ui.invalidate('ui.render')

    return { result: `The ${read.theme.name} theme is on screen now, for this session and later ones.\n\n${themeReport(body, read.notes)}` }
  })

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const hud = gauges.hud
    if (!settings.hud || !hud || e.surface !== 'terminal') {
      return next(e)
    }
    if (!body) {
      body = await keptBody($)
    }
    const forecast = { turns: turnsLeft(hps), mpOutMin: gauges.mpOutMin, stOutMin: gauges.stOutMin }
    const { Box, Text } = $.ui.resolve(e)
    if (settings.hudStyle === 'line') {
      const parts = hudLine(hud, body.look.hud, forecast)
      if (parts.length === 0) {
        return next(e)
      }

      return (
        <Box flexDirection="column">
          {await next(e)}
          <Box marginLeft={2} width={Math.max(24, bodyColumns - 3)}>
            {parts.map((p, i) => (
              <Text key={String(i)} color={p.color} bold={p.bold} wrap="truncate">
                {p.text}
              </Text>
            ))}
          </Box>
        </Box>
      )
    }
    const width = Math.min(HUD_WINDOW_W, Math.max(24, bodyColumns - 2))
    const rows = hudRows(hud, body.look.hud, barWidth(width), forecast)
    if (rows.length === 0) {
      return next(e)
    }
    const edges = windowEdges(width, body.name, hud.costUsd === undefined ? '' : fmtUsd(hud.costUsd))
    const frame = frameColor(body.look.hud)

    return (
      <Box flexDirection="column">
        {await next(e)}
        <Box flexDirection="column" marginLeft={1}>
          <Text color={frame}>{edges.top}</Text>
          {rows.map(r => (
            <Box key={r.key}>
              <Text color={frame}>{edges.side}</Text>
              <Box width={width - 2} paddingLeft={1}>
                <Text color={r.color} bold>
                  {`${r.label} `}
                </Text>
                {r.bar.map((p, i) => (
                  <Text key={`bar-${i}`} color={p.color}>
                    {p.text}
                  </Text>
                ))}
                {r.parts.map((p, i) => (
                  <Text key={String(i)} color={p.color} bold={p.bold} wrap="truncate">
                    {p.text}
                  </Text>
                ))}
              </Box>
              <Text color={frame}>{edges.side}</Text>
            </Box>
          ))}
          <Text color={frame}>{edges.bottom}</Text>
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    try {
      if (e.props.hasSurvey) {
        return next(e)
      }
      isWorking = e.props.isWorking
      bodyColumns = e.props.bodyColumns

      if (!body) {
        body = await keptBody($)
      }
      const a = await read($, anim)
      const now = await $.clock.now()
      const elapsed = now - a.since
      const views = minisOnScreen(minis, now)
      // A leap is the run mode playing the jump clip, slowed, while the pet travels.
      const drawn = a.leap ? { mode: 'jump' as const, ms: leapClipMs((now - a.leap.since) * settings.pace) } : { mode: a.mode, ms: elapsed * settings.pace }
      const picture = compose(body, drawn.mode, drawn.ms, a.dir, gauges.hud ? mood(gauges.hud) : 'ok', views)
      const extra = views.length > MAX_MINIS ? ` (+${views.length - MAX_MINIS} minis)` : ''
      const turnMs = turnStartedAt === undefined ? undefined : now - turnStartedAt
      const line = settings.statusLine ? clocked(statusLine(a.mode, a.since, elapsed, a.target, body.look.lines[a.mode]), a.mode, turnMs, elapsed) + extra : ''
      if (showsError) {
        showsError = false
        $.ui.status(undefined)
      }

      const scene = sceneLayout(body)
      if (e.surface === 'terminal' && scene && body.scene) {
        const { Box, Raster, Text } = $.ui.resolve(e)
        const width = scene.width
        const textW = line ? lineWidth(line) + 3 : 0
        const left = Math.max(0, Math.min(Math.round(a.x), width - picture.w - textW))
        const band = drawBand(body, body.scene, scene, picture, left, now)
        const cells = (x: number, y: number, w: number, h: number) => encodeCells(crop(band, x, y, w, h))
        // The status line cuts a hole in the band; the band shows above, below, and right of it.
        const textAt = left + picture.w
        const shown = Math.min(textW, width - textAt)
        const rest = width - textAt - shown

        return (
          <Box flexDirection="column" height={ROWS + GROUND_ROWS}>
            <Box height={ROWS}>
              <Raster key="pet" columns={textAt} rows={ROWS} cells={cells(0, 0, textAt, HEIGHT)} />
              {shown > 0 && (
                <Box key="line" flexDirection="column" width={shown}>
                  <Raster key="above" columns={shown} rows={ROWS - 2} cells={cells(textAt, 0, shown, HEIGHT - 4)} />
                  <Text color={lineColor(a.mode, body.look.lineColors)} bold wrap="truncate">
                    {` › ${line}`}
                  </Text>
                  <Raster key="below" columns={shown} rows={1} cells={cells(textAt, HEIGHT - 2, shown, 2)} />
                </Box>
              )}
              {rest > 0 && <Raster key="rest" columns={rest} rows={ROWS} cells={cells(textAt + shown, 0, rest, HEIGHT)} />}
            </Box>
            <Raster key="ground" columns={width} rows={GROUND_ROWS} cells={cells(0, HEIGHT, width, GROUND_H)} />
          </Box>
        )
      }
      if (e.surface === 'terminal') {
        const { Box, Raster, Text } = $.ui.resolve(e)
        const room = Math.max(0, bodyColumns - picture.w - line.length - 4)

        return (
          <Box height={ROWS}>
            <Box marginLeft={Math.min(Math.round(a.x), room)} alignItems="flex-end">
              <Raster key="pet" columns={picture.w} rows={ROWS} cells={encodeCells(picture)} />
              {line && (
                <Box marginBottom={1} marginLeft={1}>
                  <Text color={lineColor(a.mode, body.look.lineColors)} bold>
                    › {line}
                  </Text>
                </Box>
              )}
            </Box>
          </Box>
        )
      }
      if (e.surface === 'desktop') {
        const { Box, Svg, Text } = $.ui.resolve(e)

        return (
          <Box alignItems="flex-end">
            <Box marginLeft={Math.round(a.x)}>
              <Svg source={encodeSvg(picture)} alt={`${body.name}, ${a.mode}`} width={picture.w * 4} height={80} />
            </Box>
            {line && (
              <Text color={lineColor(a.mode, body.look.lineColors)} bold>
                {line}
              </Text>
            )}
          </Box>
        )
      }

      return next(e)
    } catch (err) {
      showsError = true
      $.ui.status(`clawd-pet: ${String(err)}`)

      return next(e)
    }
  })
}
