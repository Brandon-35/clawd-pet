import type { Mode } from '../types'
import type { HudLook } from './hud'
import type { Scene } from './scene'

export type Clip = 'stand' | 'run' | 'jump' | 'think' | 'cheer'
export type BodyFrame = { g: string[]; l: [number, number]; r: [number, number]; e: string }
export type MiniColors = { top: number; body: number; edge: number }
/** A pet ready to draw: `animate` in theme.ts makes one from a theme. */
export type Body = {
  name: string
  w: number
  h: number
  palette: Record<string, number> // frame character -> color
  eye: Record<string, number> // expression character -> color
  mini: MiniColors
  miniSprite?: string[] // the pet's own mini, in its palette, in place of the default block
  props: Partial<Record<Mode, string[][] | null>> // the pet's own props: frames of rows in its palette; null for none
  look: Look
  scene?: Scene
  clips: Record<Clip, { fps: number; frames: BodyFrame[] }>
}
/** What a pet changes beyond its drawing: its status lines, their colors, and the HUD. */
export type Look = { lines: Partial<Record<Mode, string[]>>; lineColors: Partial<Record<Mode, string>>; hud: HudLook }
export type Canvas = { w: number; h: number; px: number[] }

const NONE = -1
const DEFAULT = 0x01000000
export const PROP_X = 17 // the prop's 16x20 box starts here; the body's right edge is empty from column 17
export const BODY_W = 19
export const PROP_W = 16
export const HEIGHT = 20
const PROP_FPS = 4 // for a pet's own props

export const EYE_COLOR: Record<string, number> = { K: 0x2b2233, W: 0xfff4d6, Y: 0xe8aa38, H: 0xe0607a, B: 0x6fb3e0 }

export type ModeSpec = {
  clip: Clip
  fps?: number
  once?: number // ms; the mode ends by itself
  eyes: [string, number][] // expression name and how long it holds, looping
  prop?: boolean
}

export const MODES: Record<Mode, ModeSpec> = {
  idle: { clip: 'stand', eyes: [['open', 2400], ['blink', 200], ['open', 1800], ['look', 2600], ['open', 1600], ['wave', 3000], ['blink', 200], ['wink', 1800], ['content', 1800], ['open', 1800]] },
  sleep: { clip: 'stand', fps: 3, eyes: [['sleepy', 2400]] },
  think: { clip: 'think', eyes: [['look', 1800], ['curious', 2400], ['look', 1800], ['blink', 160], ['curious', 2400]] },
  read: { clip: 'stand', fps: 4, prop: true, eyes: [['scan', 2600], ['blink', 160], ['scan', 2600]] },
  search: { clip: 'stand', fps: 7, prop: true, eyes: [['wide', 1400], ['look', 1800], ['wide', 1400], ['heart', 1200]] },
  edit: { clip: 'stand', fps: 11, prop: true, eyes: [['focus', 3000], ['blink', 160], ['focus', 3000]] },
  bash: { clip: 'stand', fps: 9, prop: true, eyes: [['spiral', 3000], ['blink', 160], ['spiral', 3000]] },
  web: { clip: 'stand', fps: 6, prop: true, eyes: [['wave', 2600], ['wide', 800], ['wave', 2600]] },
  agent: { clip: 'stand', fps: 8, eyes: [['wide', 1500], ['happy', 1200], ['happy', 1200], ['wink', 1200]] },
  run: { clip: 'run', eyes: [['open', 1000]] },
  jump: { clip: 'jump', once: (14 / 12) * 1000, eyes: [['open', 1000]] },
  cheer: { clip: 'cheer', once: 1800, eyes: [['star', 900], ['happy', 900]] },
  error: { clip: 'stand', once: 2000, eyes: [['dizzy', 1000]] },
  abort: { clip: 'stand', fps: 4, once: 2400, eyes: [['sad', 1600], ['blink', 160], ['sad', 1000]] },
  compact: { clip: 'think', fps: 10, eyes: [['spiral', 1800], ['content', 1200]] },
  alert: { clip: 'stand', fps: 10, eyes: [['alert', 2400], ['blink', 160]] },
}

export function frameIndex(count: number, fps: number, elapsedMs: number, isLoop: boolean) {
  const n = Math.floor((Math.max(0, elapsedMs) / 1000) * fps)

  return isLoop ? n % count : Math.min(n, count - 1)
}

export function canvas(w: number, h: number): Canvas {
  return { w, h, px: new Array<number>(w * h).fill(NONE) }
}

function put(c: Canvas, x: number, y: number, color: number) {
  if (x >= 0 && x < c.w && y >= 0 && y < c.h) {
    c.px[y * c.w + x] = color
  }
}

function rect(c: Canvas, x: number, y: number, w: number, h: number, color: number) {
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      put(c, x + i, y + j, color)
    }
  }
}

export function stamp(c: Canvas, ox: number, oy: number, rows: string[], palette: Record<string, number>) {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = palette[row[x] as string]
      if (color !== undefined) {
        put(c, ox + x, oy + y, color)
      }
    }
  })
}

export const hash = (n: number) => {
  let h = Math.imul(n | 0, 2654435761) >>> 0
  h ^= h >>> 13
  h = Math.imul(h, 1274126177) >>> 0

  return (h >>> 8) / 16777216
}

// ---- eyes: a 3x3 box per eye, drawn as slits ----

type Eyes = { l: string[]; r: string[]; fx?: (c: Canvas) => void }

/** The resting eye: a slit two pixels tall in the middle of the box. */
export const EYE_OPEN = ['.K.', '.K.', '...']
const SHUT = ['...', 'KKK', '...']
const LOW = ['...', '...', 'KKK']
const TALL = ['.K.', '.K.', '.K.']
const same = (p: string[], fx?: Eyes['fx']): Eyes => ({ l: p, r: p, fx })

/** A slit two pixels tall at column `x` of the box, from row `y`. */
function slit(x: number, y: number) {
  return [0, 1, 2].map(row => [0, 1, 2].map(col => (col === x && (row === y || row === y + 1) ? 'K' : '.')).join(''))
}

const RING: [number, number][] = [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2], [0, 1]]
const DROP = 0x6fb3e0
const GOLD = 0xe8aa38

const EXPRESSIONS: Record<string, (t: number) => Eyes> = {
  open: () => same(EYE_OPEN),
  blink: () => same(SHUT),
  wide: () => same(TALL),
  wave: t => same(slit(1, Math.round((Math.sin(t / 220) + 1) / 2))),
  look: t => same(slit([1, 0, 0, 1, 2, 2][Math.floor(t / 500) % 6] as number, 0)),
  scan: t => same(slit([0, 1, 2, 1][Math.floor(t / 240) % 4] as number, Math.floor(t / 1300) % 2)),
  wink: t => ({ l: EYE_OPEN, r: Math.floor(t / 700) % 2 ? SHUT : EYE_OPEN }),
  content: () => same(['...', 'K.K', '.K.']),
  happy: () => same(['.K.', 'K.K', '...']),
  heart: () => same(['H.H', 'HHH', '.H.']),
  star: t => same(['.Y.', `Y${Math.floor(t / 180) % 2 ? 'W' : 'Y'}Y`, '.Y.']),
  focus: () => ({ l: ['K..', '.K.', 'K..'], r: ['..K', '.K.', '..K'] }),
  curious: t => (Math.floor(t / 800) % 2 ? { l: slit(1, 1), r: TALL } : { l: TALL, r: slit(1, 1) }),
  spiral: t => {
    const g = [0, 1, 2].map(() => ['.', '.', '.'])
    const head = Math.floor(t / 90) % 8
    for (let k = 0; k < 4; k++) {
      const [x, y] = RING[(head + 2 * k) % 8] as [number, number]
      ;(g[y] as string[])[x] = 'K'
    }

    return same(g.map(r => r.join('')))
  },
  sleepy: t => {
    const q = (t / 1600) % 1

    return same(Math.floor(t / 1200) % 2 ? LOW : SHUT, c => {
      if (q < 0.8) {
        const y = Math.round(7 - q * 6)
        stamp(c, 15, y, ['ZZZ', '.Z.', 'ZZZ'], { Z: 0x8f9bd6 })
        if (q > 0.35) {
          stamp(c, 17, y - 3, ['ZZ', 'ZZ'], { Z: 0x8f9bd6 })
        }
      }
    })
  },
  dizzy: t => same(['K.K', '.K.', 'K.K'], c => rect(c, 16, 9 + (Math.floor(t / 300) % 3), 1, 2, DROP)),
  sweat: t => same(EYE_OPEN, c => rect(c, 16, 9 + (Math.floor(t / 500) % 2), 1, 2, DROP)),
  tired: () => same(LOW),
  sad: () => ({ l: ['...', 'KK.', '..K'], r: ['...', '.KK', 'K..'] }),
  alert: t => same(TALL, c => {
    if (Math.floor(t / 300) % 4 !== 3) {
      rect(c, 17, 2, 1, 4, GOLD)
      put(c, 17, 7, GOLD)
    }
  }),
}

/** Every face the pet can make, from any sprite. */
export const FACES = Object.keys(EXPRESSIONS)

/** What low HP or MP does to the face while the pet has no tool in hand. */
const MOOD_EYES: Record<string, string> = { worried: 'sweat', critical: 'dizzy', tired: 'tired' }

const RUN_EYES: Record<string, string> = { open: 'open', wide: 'wide', bar: 'blink' }

export function expressionName(mode: Mode, elapsedMs: number, hint: string, mood = 'ok') {
  const spec = MODES[mode]
  if ((mode === 'idle' || mode === 'think') && MOOD_EYES[mood]) {
    return MOOD_EYES[mood] as string
  }
  if (mode === 'run' || mode === 'jump') {
    return RUN_EYES[hint] ?? 'open'
  }
  const total = spec.eyes.reduce((sum, [, ms]) => sum + ms, 0)
  let u = Math.max(0, elapsedMs) % total
  for (const [name, ms] of spec.eyes) {
    if (u < ms) {
      return name
    }
    u -= ms
  }

  return 'open'
}

// ---- props: each is drawn in a 16x20 box ----

const hex = (s: string) => parseInt(s.slice(1), 16)

const PROPS: Partial<Record<Mode, (c: Canvas, t: number) => void>> = {
  // An open book on its spine, a gold ribbon hanging out, a page turning now and then.
  read: (c, t) => {
    const paper = hex('#f3ead6')
    rect(c, 1, 10, 14, 8, hex('#7a4a2b'))
    rect(c, 2, 9, 5, 8, paper)
    rect(c, 9, 9, 5, 8, paper)
    rect(c, 7, 9, 2, 9, hex('#5b3520'))
    for (const y of [11, 13, 15]) {
      rect(c, 3, y, 3, 1, hex('#b8a98a'))
      rect(c, 10, y, 3, 1, hex('#b8a98a'))
    }
    rect(c, 10, 11 + 2 * (Math.floor(t / 350) % 3), 3, 1, hex('#d97757'))
    rect(c, 12, 17, 1, 2, hex('#e8aa38'))
    if (t % 2600 > 2250) {
      rect(c, 8, 7, 4, 9, paper)
      rect(c, 8, 15, 4, 1, hex('#d8ccb0'))
    }
  },
  // A page of text with a lens that drifts over it.
  search: (c, t) => {
    rect(c, 2, 5, 9, 13, hex('#eef0f4'))
    rect(c, 8, 5, 3, 3, hex('#cfd4de'))
    for (let y = 9; y <= 15; y += 2) {
      rect(c, 3, y, 2 + ((y * 3) % 5), 1, hex('#9aa1ae'))
    }
    const cx = Math.round(6 + 3 * Math.sin(t / 650))
    const cy = Math.round(11 + 3 * Math.cos(t / 820))
    rect(c, cx - 1, cy - 1, 3, 3, hex('#cfe6f5'))
    const ring = hex('#d97757')
    rect(c, cx - 1, cy - 2, 3, 1, ring)
    rect(c, cx - 1, cy + 2, 3, 1, ring)
    rect(c, cx - 2, cy - 1, 1, 3, ring)
    rect(c, cx + 2, cy - 1, 1, 3, ring)
    for (let k = 2; k <= 4; k++) {
      put(c, cx + k, cy + k, hex('#6b4a34'))
    }
  },
  // A pencil writing lines onto a card.
  edit: (c, t) => {
    const line = Math.floor(t / 800) % 6
    const done = (t % 800) / 800
    rect(c, 0, 6, 12, 12, hex('#f6f3ee'))
    rect(c, 0, 6, 12, 1, hex('#d97757'))
    let tx = 2
    let ty = 8
    for (let i = 0; i < 5; i++) {
      const y = 8 + i * 2
      const w = [7, 5, 8, 4, 6][i] as number
      const color = hex(['#5a8f5a', '#c4703a', '#5b7fb8', '#c4703a', '#5a8f5a'][i] as string)
      if (i < line) {
        rect(c, 2, y, w, 1, color)
      } else if (i === line) {
        const n = Math.max(1, Math.round(w * done))
        rect(c, 2, y, n, 1, color)
        tx = 2 + n
        ty = y
      }
    }
    put(c, tx, ty, hex('#2b2233'))
    for (let k = 1; k <= 3; k++) {
      put(c, tx + k, ty - k, hex('#e8aa38'))
    }
    put(c, tx + 4, ty - 4, hex('#e07a8a'))
  },
  // A small terminal: a prompt, lines of output scrolling up, a blinking cursor.
  bash: (c, t) => {
    rect(c, 0, 5, 16, 13, hex('#2b2233'))
    rect(c, 1, 7, 14, 10, hex('#17131c'))
    for (const [x, color] of [[1, '#e0604a'], [3, '#e8aa38'], [5, '#5a8f5a']] as const) {
      put(c, x, 6, hex(color))
    }
    const n = Math.floor(t / 450)
    for (let k = 0; k < 4; k++) {
      const li = n - 3 + k
      const y = 8 + k * 2
      if (li < 0) {
        continue
      }
      if (li % 4 === 0) {
        put(c, 2, y, hex('#d97757'))
        rect(c, 4, y, 3 + Math.floor(hash(li) * 6), 1, hex('#ece6dc'))
      } else {
        rect(c, 2, y, 3 + Math.floor(hash(li) * 9), 1, li % 6 === 5 ? hex('#e0604a') : hex('#8c8496'))
      }
    }
    if (Math.floor(t / 300) % 2 === 0) {
      rect(c, 2, 16, 2, 1, hex('#d97757'))
    }
  },
  // A globe with meridians turning, and a satellite going round it.
  web: (c, t) => {
    const turn = (t / 900) % 1
    for (let y = 5; y <= 17; y++) {
      for (let x = 1; x <= 13; x++) {
        const dx = x + 0.5 - 7.5
        const dy = y + 0.5 - 11.5
        const d = Math.hypot(dx, dy)
        if (d > 6.3) {
          continue
        }
        const half = Math.sqrt(Math.max(0, 6.3 * 6.3 - dy * dy))
        const u = (dx / Math.max(1, half) + 1) / 2 // 0..1 across this row of the globe
        const meridian = Math.abs(((u * 2 + turn) % 0.5) - 0.25) < 0.06
        const color = d > 5.4 ? '#24508f' : meridian || Math.abs(dy) < 0.6 ? '#7fb6e8' : '#3b7dd8'
        put(c, x, y, hex(color))
      }
    }
    const a = t / 520
    rect(c, Math.round(7 + 7 * Math.cos(a)), Math.round(11 + 2 * Math.sin(a)), 2, 1, hex(Math.sin(a) > 0 ? '#e8aa38' : '#9b7428'))
  },
}

// ---- minis: one per running subagent, in a trail behind the pet ----

/** One mini as drawn: ms since its agent started, and since it ended once it has. */
export type MiniView = { age: number; doneFor?: number; failed?: boolean }

export const MAX_MINIS = 6
const MINI_W = 6 // a 5 px mini and a 1 px gap
export const MINI_SIZE = { w: 5, h: 7 }
const MINI_DROP_MS = 300

export const trailWidth = (count: number) => Math.min(count, MAX_MINIS) * MINI_W

const MINI_FAILED = { top: hex('#b0a9a3'), body: hex('#8c8496'), edge: hex('#5e5864') }

const grey = (c: number) => {
  const l = Math.round(0.3 * ((c >> 16) & 255) + 0.59 * ((c >> 8) & 255) + 0.11 * (c & 255))
  return (l << 16) | (l << 8) | l
}

function drawMini(c: Canvas, ox: number, m: MiniView, k: number, body: Body) {
  let lift = Math.round(Math.abs(Math.sin(m.age / 260 + k * 1.3)) * 3)
  if (m.age < MINI_DROP_MS) {
    lift = Math.round((1 - m.age / MINI_DROP_MS) * 10)
  } else if (m.doneFor !== undefined && !m.failed) {
    lift = Math.round(Math.abs(Math.sin(m.doneFor / 160)) * 5)
  }
  const rows = body.miniSprite
  const y = HEIGHT - (rows?.length ?? 4) - lift
  if (rows) {
    const palette = m.failed ? Object.fromEntries(Object.entries(body.palette).map(([ch, color]) => [ch, grey(color)])) : body.palette
    stamp(c, ox, y, rows, palette)
  } else {
    drawBlock(c, ox, y, m.failed ? MINI_FAILED : body.mini)
  }
  if (m.doneFor !== undefined && !m.failed && Math.floor(m.doneFor / 180) % 2 === 0) {
    put(c, ox + 2, y - 2, EYE_COLOR.Y as number)
  }
}

function drawBlock(c: Canvas, ox: number, y: number, colors: MiniColors) {
  rect(c, ox, y, 5, 1, colors.top)
  rect(c, ox, y + 1, 5, 2, colors.body)
  put(c, ox + 1, y + 1, 0x2b2233)
  put(c, ox + 3, y + 1, 0x2b2233)
  put(c, ox + 1, y + 3, colors.edge)
  put(c, ox + 3, y + 3, colors.edge)
}

export function overlay(out: Canvas, src: Canvas, ox: number) {
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const color = src.px[y * src.w + x] as number
      if (color !== NONE) {
        put(out, ox + x, y, color)
      }
    }
  }
}

function mirror(c: Canvas) {
  for (let y = 0; y < c.h; y++) {
    const row = c.px.slice(y * c.w, (y + 1) * c.w).reverse()
    c.px.splice(y * c.w, c.w, ...row)
  }
}

// ---- effects on the body canvas ----

const QUESTION = ['.YY.', 'Y..Y', '...Y', '..Y.', '....', '..Y.']
const DUST = hex('#9a8f86')
const THOUGHT = hex('#b9ada3')

function effects(c: Canvas, mode: Mode, clipIndex: number, t: number, ownThink: boolean) {
  if (mode === 'think' && !ownThink) {
    stamp(c, 15, 1 + (Math.floor(t / 400) % 2), QUESTION, EYE_COLOR)
    for (let k = 0; k < 1 + (Math.floor(t / 500) % 3); k++) {
      put(c, 14 + k, 8 - k, THOUGHT)
    }
  }
  const lands = (mode === 'run' && (clipIndex === 3 || clipIndex === 7)) || (mode === 'jump' && (clipIndex === 11 || clipIndex === 12))
  if (lands) {
    rect(c, 0, 19, 1, 1, DUST)
    put(c, 1, 18, DUST)
    rect(c, 18, 19, 1, 1, DUST)
    put(c, 17, 18, DUST)
  }
}

/** How the prop of `mode` draws: the pet's own, the mod's, or none. */
function propOf(body: Body, mode: Mode): ((c: Canvas, t: number) => void) | undefined {
  const own = body.props[mode]
  if (own === null) {
    return undefined
  }
  if (own) {
    return (c, t) => {
      const rows = own[frameIndex(own.length, PROP_FPS, t, true)] as string[]
      stamp(c, 0, HEIGHT - rows.length, rows, body.palette)
    }
  }

  return MODES[mode].prop ? PROPS[mode] : undefined
}

// ---- compose ----

export function compose(body: Body, mode: Mode, elapsedMs: number, dir: 1 | -1, mood = 'ok', minis: MiniView[] = []): Canvas {
  // The expressions index their sequences by time; a negative time would index past the start.
  elapsedMs = Math.max(0, elapsedMs)
  const spec = MODES[mode]
  const clip = body.clips[spec.clip]
  const isLoop = spec.once === undefined
  const index = frameIndex(clip.frames.length, spec.fps ?? clip.fps, elapsedMs, isLoop)
  const frame = clip.frames[index] as BodyFrame
  const pet = canvas(BODY_W, HEIGHT)

  stamp(pet, 0, 0, frame.g, body.palette)

  const eyes = (EXPRESSIONS[expressionName(mode, elapsedMs, frame.e, mood)] as (t: number) => Eyes)(elapsedMs)
  const shift = mode === 'run' ? 1 : 0
  stamp(pet, frame.l[0] + shift, frame.l[1], eyes.l, body.eye)
  stamp(pet, frame.r[0] + shift, frame.r[1], eyes.r, body.eye)
  eyes.fx?.(pet)
  // A pet's own think prop, or none, takes the place of the question mark.
  effects(pet, mode, index, elapsedMs, body.props.think !== undefined)

  const drawProp = mode === 'run' ? undefined : propOf(body, mode)
  const trail = trailWidth(minis.length)
  const out = canvas(trail + (drawProp ? PROP_X + PROP_W : BODY_W), HEIGHT)
  minis.slice(0, MAX_MINIS).forEach((m, k) => drawMini(out, trail - (k + 1) * MINI_W, m, k, body))
  overlay(out, pet, trail)
  if (drawProp) {
    const prop = canvas(PROP_W, HEIGHT)
    drawProp(prop, elapsedMs)
    overlay(out, prop, trail + PROP_X)
  }
  // Running or jumping left mirrors the whole picture, so the trail stays behind the pet. Neither mode has a prop.
  if ((mode === 'run' || mode === 'jump') && dir === -1) {
    mirror(out)
  }

  return out
}

/** The pet resting with one face, by name from FACES, at `t` ms into the face's own motion. */
export function composeFace(body: Body, name: string, t: number): Canvas {
  const frame = body.clips.stand.frames[0] as BodyFrame
  const c = canvas(BODY_W, HEIGHT)
  stamp(c, 0, 0, frame.g, body.palette)
  const expression = EXPRESSIONS[name] ?? (EXPRESSIONS.open as (t: number) => Eyes)
  const eyes = expression(Math.max(0, t))
  stamp(c, frame.l[0], frame.l[1], eyes.l, body.eye)
  stamp(c, frame.r[0], frame.r[1], eyes.r, body.eye)
  eyes.fx?.(c)

  return c
}

// ---- encoders ----

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function base64(bytes: number[]) {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = ((bytes[i] as number) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    out += B64.charAt((n >> 18) & 63) + B64.charAt((n >> 12) & 63)
    out += i + 1 < bytes.length ? B64.charAt((n >> 6) & 63) : '='
    out += i + 2 < bytes.length ? B64.charAt(n & 63) : '='
  }

  return out
}

/** The `w`×`h` part of `c` from column `x`, row `y`. */
export function crop(c: Canvas, x: number, y: number, w: number, h: number): Canvas {
  const out = canvas(w, h)
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      out.px[j * w + i] = c.px[(y + j) * c.w + x + i] as number
    }
  }

  return out
}

/** Raster `cells`: little-endian u32 triplets [glyph, fg, bg], two pixels per cell as ▀ and ▄. */
export function encodeCells(c: Canvas) {
  const bytes: number[] = []
  const word = (v: number) => bytes.push(v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255)
  for (let r = 0; r < c.h / 2; r++) {
    for (let x = 0; x < c.w; x++) {
      const top = c.px[2 * r * c.w + x] as number
      const bottom = c.px[(2 * r + 1) * c.w + x] as number
      if (top === NONE && bottom === NONE) {
        word(0x20)
        word(DEFAULT)
        word(DEFAULT)
      } else if (bottom === NONE) {
        word(0x2580)
        word(top)
        word(DEFAULT)
      } else if (top === NONE) {
        word(0x2584)
        word(bottom)
        word(DEFAULT)
      } else {
        word(0x2580)
        word(top)
        word(bottom)
      }
    }
  }

  return base64(bytes)
}

export function encodeSvg(c: Canvas) {
  const paths = new Map<number, string[]>()
  for (let y = 0; y < c.h; y++) {
    let x = 0
    while (x < c.w) {
      const color = c.px[y * c.w + x] as number
      let n = 1
      while (x + n < c.w && c.px[y * c.w + x + n] === color) {
        n += 1
      }
      if (color !== NONE) {
        paths.set(color, [...(paths.get(color) ?? []), `M${x} ${y}h${n}v1h-${n}z`])
      }
      x += n
    }
  }
  const body = [...paths].map(([color, d]) => `<path fill="#${color.toString(16).padStart(6, '0')}" d="${d.join('')}"/>`).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${c.w} ${c.h}" shape-rendering="crispEdges">${body}</svg>`
}
