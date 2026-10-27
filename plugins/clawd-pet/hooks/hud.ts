import type { SessionUsage } from 'claude-code'

export const BAR_W = 20 // cells; each cell is a heavy line, or half of one at the tip

// The window frame around the HUD: a mid clay, so it shows on a dark terminal and on a light one.
export const FRAME_COLOR = '#c9744f'

export type Hud = {
  hp: number // context left, %
  mp?: number // the 5-hour rate limit left, %; absent off a subscription or before its first reading
  mpResetsInMin?: number
  st?: number // the 7-day rate limit left, %; absent like MP
  stResetsInMin?: number
}

export type Mood = 'ok' | 'worried' | 'critical' | 'tired'

/** A pet's look for one bar: its label, the label's color, and the fill while the bar is healthy. */
export type BarLook = { label?: string; color?: string; fill?: [string, string] }
/** A pet's look for the HUD: the frame's color, and each bar's look, or false to hide it. */
export type HudLook = { frame?: string; hp?: BarLook | false; mp?: BarLook | false; st?: BarLook | false }

/** The frame's color: the pet's own, else the mod's. */
export const frameColor = (look: HudLook) => look.frame ?? FRAME_COLOR

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const finite = (v: number | undefined) => (v !== undefined && Number.isFinite(v) ? v : undefined)

/** One rate-limit window: the share left, and the minutes until it resets. Both absent without a reading. */
function limitLeft(u: SessionUsage, kind: string, now: number) {
  const limit = u.rateLimits.find(r => r.kind === kind && finite(r.percentUsed) !== undefined)
  const resets = limit?.resetsAt ? Date.parse(limit.resetsAt) : Number.NaN

  return {
    left: limit ? clamp(Math.round(100 - limit.percentUsed), 0, 100) : undefined,
    resetsInMin: !limit || Number.isNaN(resets) ? undefined : Math.max(0, Math.round((resets - now) / 60000)),
  }
}

export function hudFrom(u: SessionUsage, now: number): Hud {
  const mp = limitLeft(u, 'five_hour', now)
  const st = limitLeft(u, 'seven_day', now)

  return {
    hp: clamp(Math.round(100 - (finite(u.context.percent) ?? 0)), 0, 100),
    mp: mp.left,
    mpResetsInMin: mp.resetsInMin,
    st: st.left,
    stResetsInMin: st.resetsInMin,
  }
}

export function mood(h: Hud): Mood {
  if (h.hp <= 25) {
    return 'critical'
  }
  if (h.hp <= 50) {
    return 'worried'
  }

  return [h.mp, h.st].some(left => left !== undefined && left < 20) ? 'tired' : 'ok'
}

/** Minutes as the HUD prints them: `36m`, `2h13m`, then whole hours past a day, `3d4h`. */
export function fmtMin(m: number) {
  if (m >= 1440) {
    return `${Math.floor(m / 1440)}d${Math.floor((m % 1440) / 60)}h`
  }

  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m` : `${m}m`
}

type Pair = [number, number]
const CLAY: Pair = [0xa84d33, 0xe88f6a]
const SKY: Pair = [0x3f5f9f, 0x7f9fdc]
const GOLD: Pair = [0x9a6a14, 0xe0a83a]
const AMBER: Pair = [0x9a5c0a, 0xd99a1a]
const RED: Pair = [0x9e2f2a, 0xe0604a]
// The empty part of a bar: a mid grey, so the track shows on a dark terminal and on a light one.
const TRACK = '#8a8290'

const channel = (c: number, shift: number) => (c >> shift) & 255
const mix = (a: number, b: number, t: number) =>
  [16, 8, 0].reduce((out, s) => out | (Math.round(channel(a, s) + (channel(b, s) - channel(a, s)) * t) << s), 0)

/** One run of a row's text. The reading is bold in its bar's color; the details beside it are grey. */
export type HudPart = { text: string; color: string; bold?: boolean }

export type HudRow = { key: string; label: string; color: string; bar: HudPart[]; parts: HudPart[] }

// A mid grey, so the details read on a dark terminal and on a light one.
export const DETAIL_COLOR = '#8a8290'

const cssColor = (c: number) => `#${c.toString(16).padStart(6, '0')}`

/**
 * A bar `width` cells wide as runs of text: a heavy line filled to `pct` in half cells, shading from the pair's
 * first color to its second, then a thin track for the rest.
 */
export function barParts(pct: number, [from, to]: Pair, width = BAR_W): HudPart[] {
  const halves = Math.round((clamp(pct, 0, 100) / 100) * width * 2)
  const parts: HudPart[] = []
  for (let i = 0; i < Math.floor(halves / 2); i++) {
    parts.push({ text: '━', color: cssColor(mix(from, to, width > 1 ? i / (width - 1) : 1)) })
  }
  if (halves % 2 === 1) {
    parts.push({ text: '╸', color: cssColor(mix(from, to, Math.floor(halves / 2) / Math.max(1, width - 1))) })
  }
  const rest = width - Math.ceil(halves / 2)
  if (rest > 0) {
    parts.push({ text: '─'.repeat(rest), color: TRACK })
  }

  return parts
}

const reading = (text: string, [from, to]: Pair): HudPart => ({ text: ` ${text.padStart(4)}`, color: cssColor(mix(from, to, 0.6)), bold: true })
const detail = (bits: (string | undefined)[]): HudPart[] => {
  const text = bits.filter(b => b !== undefined).join('  ')

  return text ? [{ text: `  ${text}`, color: DETAIL_COLOR }] : []
}

const resets = (min: number | undefined) => (min === undefined ? undefined : `↻ ${fmtMin(min)}`)

const pairOf = (fill: [string, string] | undefined, fallback: Pair): Pair => (fill ? [parseInt(fill[0].slice(1), 16), parseInt(fill[1].slice(1), 16)] : fallback)

/**
 * The HUD's rows: HP, and MP and ST when the session has their readings, each in the pet's `look` unless
 * the look hides it. A bar's warning colors (amber and red) replace its fill whatever the look.
 */
export function hudRows(h: Hud, look: HudLook = {}, width = BAR_W): HudRow[] {
  const rows: (HudRow & { look: BarLook | false | undefined })[] = []
  const hpFill = h.hp > 50 ? pairOf(look.hp ? look.hp.fill : undefined, CLAY) : h.hp > 25 ? AMBER : RED
  rows.push({
    key: 'hp',
    look: look.hp,
    label: 'HP',
    color: cssColor(CLAY[1]),
    bar: barParts(h.hp, hpFill, width),
    parts: [reading(`${h.hp}%`, hpFill), ...(h.hp < 10 ? [{ ...reading('', RED), text: '  /compact' }] : [])],
  })
  if (h.mp !== undefined) {
    const mpFill = h.mp < 15 ? RED : pairOf(look.mp ? look.mp.fill : undefined, SKY)
    rows.push({
      key: 'mp',
      look: look.mp,
      label: 'MP',
      color: cssColor(SKY[1]),
      bar: barParts(h.mp, mpFill, width),
      parts: [reading(`${h.mp}%`, mpFill), ...detail([resets(h.mpResetsInMin)])],
    })
  }
  if (h.st !== undefined) {
    const stFill = h.st < 15 ? RED : pairOf(look.st ? look.st.fill : undefined, GOLD)
    rows.push({
      key: 'st',
      look: look.st,
      label: 'ST',
      color: cssColor(GOLD[1]),
      bar: barParts(h.st, stFill, width),
      parts: [reading(`${h.st}%`, stFill), ...detail([resets(h.stResetsInMin)])],
    })
  }
  const shown = rows
    .filter(r => r.look !== false)
    .map(({ look: bar, ...r }) => (bar ? { ...r, label: bar.label ?? r.label, color: bar.color ?? r.color } : r))
  // Labels pad to one width, so the bars line up.
  const labelW = Math.max(0, ...shown.map(r => [...r.label].length))

  return shown.map(r => ({ ...r, label: r.label + ' '.repeat(labelW - [...r.label].length) }))
}

/** The window's edges as text, `width` cells across, corners included: rounded corners, the title in the top edge. */
export function windowEdges(width: number, title = '') {
  const run = Math.max(0, width - 2)
  const head = title ? `─ ${title} ` : ''
  const top = `╭${(head + '─'.repeat(run)).slice(0, run)}╮`

  return { top, side: '│', bottom: `╰${'─'.repeat(run)}╯` }
}

/** The HUD window's width in cells, sides included: room for a label, a full bar, a reading and a reset time. */
export const HUD_WINDOW_W = 46

/** The bar width that fits a window `columns` wide: the full BAR_W, down to 6 cells on a narrow terminal. */
export const barWidth = (columns: number) => clamp(BAR_W - Math.max(0, HUD_WINDOW_W - columns), 6, BAR_W)

// The readings that warn as a gauge falls to them, lowest last.
const HP_WARN = [20, 10]
const LIMIT_WARN = [10]

/** The forecasts `/clawd` and the toasts print: the turns the context holds, and the minutes until each rate limit runs out, when that beats its reset. */
export type Forecast = { turns?: number; mpOutMin?: number; stOutMin?: number }

/** The toast when a rate limit's pace runs it out before it resets. */
export const paceWarning = (label: string, outMin: number, resetsInMin?: number) =>
  `at this pace the ${label} runs out in about ${fmtMin(outMin)}${resetsInMin === undefined ? '' : `, before it resets in ${fmtMin(resetsInMin)}`}`

/** How many turns the context holds at the recent pace, as the HUD's warnings and `/clawd` say it; '' with no forecast. */
export const aboutTurns = (turns?: number) => (turns === undefined ? '' : ` (about ${turns} turn${turns === 1 ? '' : 's'} at this pace)`)

/** Whether `now` has fallen to a mark `before` was above. No reading before counts as full. */
const crossed = (marks: number[], before: number | undefined, now: number | undefined) =>
  now !== undefined && marks.some(m => now <= m && (before ?? 100) > m)

/**
 * The warnings for the gauges that fell to a mark between two HUD readings, one per gauge: context at 20 % and 10 %,
 * each rate limit at 10 %. A gauge that climbs back above a mark warns again the next time it falls.
 */
export function gaugeWarnings(before: Hud | undefined, now: Hud, turnsLeft?: number) {
  const limit = (label: string, left: number | undefined, resetsInMin: number | undefined) =>
    `${label} ${left}% left${resetsInMin === undefined ? '' : `, resets in ${fmtMin(resetsInMin)}`}`

  return [
    ...(crossed(HP_WARN, before?.hp, now.hp) ? [`context ${now.hp}% left${aboutTurns(turnsLeft)}: run /compact at a good stopping point`] : []),
    ...(crossed(LIMIT_WARN, before?.mp, now.mp) ? [limit('5-hour limit', now.mp, now.mpResetsInMin)] : []),
    ...(crossed(LIMIT_WARN, before?.st, now.st) ? [limit('7-day limit', now.st, now.stResetsInMin)] : []),
  ]
}
