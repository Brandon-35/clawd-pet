import { expect, test } from 'claude-code/testing'
import type { SessionUsage } from 'claude-code'

import { BAR_W, DETAIL_COLOR, HUD_WINDOW_W, barParts, barWidth, fmtMin, frameColor, gaugeWarnings, hudFrom, hudRows, mood, windowEdges } from './hud'

const usage = (over: Partial<SessionUsage> = {}): SessionUsage => ({
  startedAt: 0,
  context: { window: 200000, percent: 14 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 38, resetsAt: '1970-01-01T02:13:00Z' },
    { kind: 'seven_day', percentUsed: 36, resetsAt: '1970-01-04T04:36:00Z' },
  ],
  ...over,
})

test('HP is the context left, MP the five-hour limit left, ST the seven-day one, each with its reset in minutes', () => {
  expect(hudFrom(usage(), 36 * 60000)).toEqual({ hp: 86, mp: 62, mpResetsInMin: 97, st: 64, stResetsInMin: 4560 })
})

test('off a subscription there is no MP or ST; before the first response the context is full', () => {
  const h = hudFrom(usage({ rateLimits: [], context: { window: 200000 } }), 0)
  expect([h.mp, h.st]).toEqual([undefined, undefined])
  expect(h.hp).toBe(100)
  expect(hudRows(h).map(r => r.key)).toEqual(['hp'])
})

test('the face follows HP first, then MP or ST', () => {
  expect([90, 50, 20].map(hp => mood({ hp, mp: 80 }))).toEqual(['ok', 'worried', 'critical'])
  expect(mood({ hp: 90, mp: 10 })).toBe('tired')
  expect(mood({ hp: 90, mp: 80, st: 10 })).toBe('tired')
})

test('times read as minutes, then hours, then days', () => {
  expect([fmtMin(36), fmtMin(133), fmtMin(4440)]).toEqual(['36m', '2h13m', '3d2h'])
})

test('a bar fills in half cells and leaves a thin track for the rest', () => {
  const text = (pct: number) => barParts(pct, [0xa84d33, 0xe88f6a]).map(p => p.text).join('')
  expect(text(100)).toBe('━'.repeat(BAR_W))
  expect(text(0)).toBe('─'.repeat(BAR_W))
  expect(text(52.5)).toBe(`${'━'.repeat(10)}╸${'─'.repeat(9)}`)
  const colors = barParts(100, [0xa84d33, 0xe88f6a]).map(p => p.color)
  expect([colors[0], colors.at(-1)]).toEqual(['#a84d33', '#e88f6a'])
  expect(barParts(0, [0, 0])[0]?.color).toBe(DETAIL_COLOR)
})

test('the rows name every stat with its reading and reset time, and HP points to /compact when context runs out', () => {
  const rows = hudRows({ hp: 86, mp: 62, mpResetsInMin: 133, st: 64, stResetsInMin: 4476 })
  const text = (r: (typeof rows)[number]) => r.label + r.parts.map(p => p.text).join('')
  expect(rows.map(text)).toEqual(['HP  86%', 'MP  62%  ↻ 2h13m', 'ST  64%  ↻ 3d2h'])
  expect(text(hudRows({ hp: 8 })[0]!)).toBe('HP   8%  /compact')
})

test("the reading is bold in its bar's color, amber or red once low, and the details are grey", () => {
  const [hp, mp, st] = hudRows({ hp: 30, mp: 10, mpResetsInMin: 5, st: 70, stResetsInMin: 900 })
  expect(hp!.parts).toEqual([{ text: '  30%', color: '#c08114', bold: true }])
  expect(mp!.parts.map(p => p.color)).toEqual(['#c64c3d', DETAIL_COLOR])
  expect(st!.parts[0]).toEqual({ text: '  70%', color: '#c48f2b', bold: true })
})

test('HP rounds to a whole percent, and a usage number that is not finite reads as unknown', () => {
  expect(hudFrom(usage({ context: { window: 200000, percent: 12.7 } }), 0).hp).toBe(87)
  expect(hudFrom(usage({ context: { window: 200000, percent: Number.NaN } }), 0).hp).toBe(100)
  expect(hudFrom(usage({ rateLimits: [{ kind: 'five_hour', percentUsed: Number.NaN }] }), 0).mp).toBeUndefined()
})

test('each limit shows only with its own reading', () => {
  const h = hudFrom(usage({ rateLimits: [{ kind: 'seven_day', percentUsed: 70 }] }), 0)
  expect([h.mp, h.st, h.stResetsInMin]).toEqual([undefined, 30, undefined])
  expect(hudRows(h).map(r => r.key)).toEqual(['hp', 'st'])
})

test('the window has rounded corners, spans its width, and carries the title in its top edge', () => {
  const { top, side, bottom } = windowEdges(HUD_WINDOW_W, 'clawd')
  expect([...top].length).toBe(HUD_WINDOW_W)
  expect([...bottom].length).toBe(HUD_WINDOW_W)
  expect(top.startsWith('╭─ clawd ─')).toBe(true)
  expect([top.at(-1), bottom.at(0), bottom.at(-1), side]).toEqual(['╮', '╰', '╯', '│'])
})

test('the bars narrow on a narrow terminal, down to six cells', () => {
  expect([barWidth(120), barWidth(HUD_WINDOW_W), barWidth(40), barWidth(10)]).toEqual([BAR_W, BAR_W, BAR_W - 6, 6])
  expect(hudRows({ hp: 50 }, {}, 8)[0]!.bar.map(p => p.text).join('')).toBe('━━━━────')
})

test("a pet's HUD look relabels, recolors, and hides bars, and keeps the warning colors", () => {
  const h = { hp: 80, mp: 50, mpResetsInMin: 60, st: 10, stResetsInMin: 600 }
  const rows = hudRows(h, { hp: { label: 'FUEL', color: '#22aa66', fill: ['#1a6a40', '#33bb77'] }, mp: false, st: { fill: ['#555555', '#999999'] } })
  expect(rows.map(r => r.key)).toEqual(['hp', 'st'])
  expect(rows.map(r => r.label)).toEqual(['FUEL', 'ST  '])
  expect(rows[0]?.color).toBe('#22aa66')
  expect(rows[0]?.parts[0]?.color).toBe('#299b61')
  expect(rows[1]?.parts[0]?.color).toBe('#c64c3d')
  expect(hudRows(h, { hp: false, mp: false, st: false })).toEqual([])
  expect(frameColor({ frame: '#44aa44' })).toBe('#44aa44')
  expect(frameColor({})).toBe('#c9744f')
})

test('a gauge warns once as it falls to a mark, and again only after it climbs back', () => {
  expect(gaugeWarnings({ hp: 25 }, { hp: 18 })).toEqual(['context 18% left: run /compact at a good stopping point'])
  expect(gaugeWarnings({ hp: 18 }, { hp: 15 })).toEqual([])
  expect(gaugeWarnings({ hp: 15 }, { hp: 9 })).toEqual(['context 9% left: run /compact at a good stopping point'])
  expect(gaugeWarnings({ hp: 25 }, { hp: 5 })).toHaveLength(1)
  expect(gaugeWarnings({ hp: 60, mp: 12 }, { hp: 60, mp: 8, mpResetsInMin: 72 })).toEqual(['5-hour limit 8% left, resets in 1h12m'])
  expect(gaugeWarnings({ hp: 60, st: 11 }, { hp: 60, st: 10 })).toEqual(['7-day limit 10% left'])
  expect(gaugeWarnings(undefined, { hp: 90, mp: 6 })).toEqual(['5-hour limit 6% left'])
  expect(gaugeWarnings(undefined, { hp: 90 })).toEqual([])
  expect(gaugeWarnings({ hp: 25 }, { hp: 18 }, 3)).toEqual(['context 18% left (about 3 turns at this pace): run /compact at a good stopping point'])
  expect(gaugeWarnings({ hp: 25 }, { hp: 18 }, 1)[0]).toContain('(about 1 turn at this pace)')
})
