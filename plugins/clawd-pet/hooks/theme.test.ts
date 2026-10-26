import { expect, test } from 'claude-code/testing'

import { animate, maxSize, readTheme, restingFrame } from './theme'

// Clawd's drawing, as scripts/build-clawd-assets.mjs writes it to assets/clawd.json. Tests cannot import JSON.
const CLAWD = {
  name: 'clawd',
  scale: 1,
  sprite: [
    '..lllllllllld..',
    '..ccccccccccd..',
    '..ccccccccccd..',
    'eeccccccccccdee',
    'eeccccccccccdee',
    '..ccccccccccd..',
    '..ccccccccccd..',
    '..ddddddddddd..',
    '...g.g...g.g...',
    '...g.g...g.g...',
  ],
  palette: { c: '#d97757', l: '#f2a283', d: '#a84d33', e: '#d97757', g: '#a84d33', a: '#2b2233' },
  eyes: [[3, 3], [9, 3]],
  eyeColor: '#2b2233',
  limbs: { arms: 'e', legs: 'g' },
}

const themeOf = (v: unknown) => {
  const read = readTheme(v)
  if (read.errors) {
    throw new Error(read.errors.join('\n'))
  }
  return read.theme
}

test('Clawd, the default pet, reads with no notes and animates to the frames it was drawn with', () => {
  const read = readTheme(CLAWD)
  expect(read.errors ? ['refused'] : read.notes).toEqual([])
  const body = animate(themeOf(CLAWD))
  const rest = body.clips.stand.frames[0]!
  expect(rest.g.slice(10)).toEqual([
    '....lllllllllld....',
    '....ccccccccccd....',
    '....ccccccccccd....',
    '..eeccccccccccdee..',
    '..eeccccccccccdee..',
    '....ccccccccccd....',
    '....ccccccccccd....',
    '....ddddddddddd....',
    '.....g.g...g.g.....',
    '.....g.g...g.g.....',
  ])
  expect([rest.l, rest.r]).toEqual([[5, 12], [11, 12]])
  expect(Object.fromEntries(Object.entries(body.clips).map(([k, c]) => [k, [c.fps, c.frames.length]]))).toEqual({
    stand: [8, 16], run: [12, 8], jump: [12, 14], think: [6, 12], cheer: [10, 18],
  })
})

test('the poses lift the arms and step the legs, and never stretch the body', () => {
  const body = animate(themeOf(CLAWD))
  const rows = (clip: 'run' | 'jump' | 'think', i: number) => body.clips[clip].frames[i]!.g.filter(r => /[^.]/.test(r))
  // Running: the 2nd and 4th legs lift while the left arm swings up.
  expect(rows('run', 4).slice(2, 5)).toEqual(['..eeccccccccccd....', '..eeccccccccccdee..', '....ccccccccccdee..'])
  expect(rows('run', 4).at(-1)).toBe('.....g.....g.......')
  // In the air: both arms up by 2, every leg tucked, the body 6 px up and still 11 by 8.
  const air = body.clips.jump.frames[5]!
  expect(air.g.slice(4, 6)).toEqual(['....lllllllllld....', '..eeccccccccccdee..'])
  expect(air.g.slice(4).filter(r => r.includes('c') || r.includes('l') || r.includes('d')).length).toBe(8)
  expect(air.l).toEqual([5, 6])
  // Thinking: the right arm stays raised.
  expect(rows('think', 0)[1]).toBe('....ccccccccccdee..')
  for (const clip of Object.values(body.clips)) {
    for (const f of clip.frames) {
      expect(f.g.join('').split('').filter(c => c === 'c').length).toBe(rest(body))
    }
  }
})

const rest = (body: ReturnType<typeof animate>) => body.clips.stand.frames[0]!.g.join('').split('').filter(c => c === 'c').length

test('`limbs` names palette characters; anything else is left out with a note', () => {
  expect(themeOf(CLAWD).limbs).toEqual({ arms: 'e', legs: 'g' })
  const read = readTheme({ ...CLAWD, limbs: { arms: 'q', legs: 'gg' } })
  expect(read.errors ? [] : [read.theme.limbs, read.notes]).toEqual([
    undefined,
    ['`limbs.arms` is one palette character, so the arms stay still.', '`limbs.legs` is one palette character, so the legs stay still.'],
  ])
  const loose = readTheme({ ...CLAWD, limbs: 'arms' })
  expect(loose.errors ? [] : loose.notes).toEqual(['`limbs` is an object, so the pet moves as one piece.'])
  // Without limbs the pet still bobs and jumps, as one piece.
  const stiff = animate(themeOf({ ...CLAWD, limbs: undefined }))
  expect(stiff.clips.run.frames[4]!.g.filter(r => /[^.]/.test(r)).at(-1)).toBe('.....g.g...g.g.....')
})

test('a pet fills in its defaults', () => {
  const pet = themeOf({ sprite: ['aaaaaaa', 'aaaaaaa', 'aaaaaaa'], palette: { a: '#123456' }, eyes: [[0, 1], [4, 1]] })
  expect([pet.name, pet.scale, pet.eyeColor, pet.mini.body, pet.limbs]).toEqual(['pet', 1, '#000000', '#d97757', undefined])
})



test('the resting frame marks the eyes with @ and starts at the first row in use', () => {
  const rows = restingFrame(animate(themeOf(CLAWD))).split('\n')
  expect(rows[0]).toBe('....lllllllllld....')
  expect(rows.slice(2, 4)).toEqual(['....cc@ccccc@cd....', '..eecc@ccccc@cdee..'])
})

test('at scale 1 the resting frame is the sprite itself, at an even width or an odd one', () => {
  for (const sprite of [['.aaaaaa.', 'abbaabba', 'abbaabba', 'aaaaaaaa'], ['..aaaaa..', '.abbabba.', 'abbbabbba', 'aaaaaaaaa']]) {
    const body = animate(themeOf({ sprite, palette: { a: '#111111', b: '#999999' }, eyes: [[0, 1], [5, 1]] }))
    const rows = body.clips.stand.frames[0]!.g.filter(r => /[^.]/.test(r)).map(r => r.replace(/^\.+|\.+$/g, ''))
    expect(rows).toEqual(sprite.map(r => r.replace(/^\.+|\.+$/g, '')))
  }
})


test('a sprite too big for scale 1 is drawn smaller, with a note', () => {
  expect(maxSize(1)).toEqual({ w: 19, h: 14 })
  const read = readTheme({ sprite: Array.from({ length: 16 }, () => 'c'.repeat(21)), palette: { c: '#d97757' } })
  expect(read.errors ? 0 : read.theme.scale).toBe(0.9)
  expect(read.errors ? [] : read.notes).toEqual([
    'A 21×16 sprite is drawn at scale 0.9 to fit every pose. At scale 1 the largest is 19×14, and a smaller scale blurs detail.',
  ])
})

test('only a pet with no sprite is refused; the rest is repaired and noted', () => {
  expect(readTheme('a cat').errors).toEqual(['A theme is a JSON object with a `sprite`.'])
  expect(readTheme({ palette: { a: '#123456' } }).errors).toEqual(['`sprite` is a list of text rows, one character per pixel.'])

  const read = readTheme({ sprite: ['ab*', 'a'], palette: { a: '#abc', b: 'blue' }, eyes: 'big', mini: { top: '#fff' } })
  if (read.errors) {
    throw new Error(read.errors.join('\n'))
  }
  expect(read.theme.sprite).toEqual(['ab.', 'a..'])
  expect(read.theme.palette).toEqual({ a: '#aabbcc' })
  expect(read.theme.eyes).toBeUndefined()
  expect(read.notes).toEqual([
    'Rows of different widths were padded with "." to 3.',
    'The sprite\'s "*", "+", "@" pixels are drawn clear: the mod marks its own drawings with them.',
    'The palette color for "b", "blue", is not "#rrggbb", so "b" is drawn clear.',
    '"b" has no palette color, so it is drawn clear.',
    '`eyes` is two [x, y] points, so the pet has no eyes and no faces.',
    '`mini` needs three colors, `top`, `body`, and `edge`, so the minis keep the default clay.',
  ])
})

test('overlapping eyes and a cheek in an eye box draw anyway, with notes', () => {
  const read = readTheme({ sprite: ['aaaaaaa', 'aaaaaaa', 'aaaaaaa', 'aaaaaaa'], palette: { a: '#123456' }, eyes: [[0, 1], [2, 1]], cheeks: [[1, 2], [6, 3]] })
  expect(read.errors ? [] : read.notes).toEqual([
    'The eye boxes overlap, so the wide eyes and hearts merge into one shape. Eyes 4 pixels apart keep them apart.',
    'A cheek sits inside an eye box, where some faces draw over it.',
  ])
  expect(read.errors ? undefined : read.theme.cheekColor).toBe('#ff8aaa')
})

test('a pet with no eyes draws no faces, and its resting frame marks no eyes', () => {
  const body = animate(themeOf({ sprite: ['.aaa.', 'aaaaa', 'aaaaa'], palette: { a: '#123456' } }))
  expect(body.eye).toEqual({})
  expect(restingFrame(body)).not.toContain('@')
})

test('a pet with fields this version does not know still reads', () => {
  const read = readTheme({ ...CLAWD, frames: { jump: [] }, author: 'someone' })
  expect(read.errors).toBeUndefined()
  expect(read.errors ? [] : read.notes).toEqual([])
})

test('a pet carries its own props, mini, lines, line colors, and HUD look', () => {
  const read = readTheme({
    sprite: ['aaa'],
    palette: { a: '#44cc44', y: '#ffe25a' },
    props: { read: ['yy', 'yy'], web: [['y'], ['.y']], bash: false },
    miniSprite: ['.y.', 'yyy'],
    lines: { think: ['probing the problem'], read: 'scanning {}' },
    lineColors: { think: '#44cc44' },
    hud: { frame: '#4a4', hp: { label: 'FUEL', fill: ['#1a6a40', '#33bb77'] }, st: false },
  })
  if (read.errors) {
    throw new Error(read.errors.join('\n'))
  }
  expect(read.notes).toEqual([])
  expect(read.theme.props).toEqual({ read: [['yy', 'yy']], web: [['y'], ['.y']], bash: null })
  expect(read.theme.miniSprite).toEqual(['.y.', 'yyy'])
  expect(read.theme.lines).toEqual({ think: ['probing the problem'], read: ['scanning {}'] })
  expect(read.theme.lineColors).toEqual({ think: '#44cc44' })
  expect(read.theme.hud).toEqual({ frame: '#44aa44', hp: { label: 'FUEL', fill: ['#1a6a40', '#33bb77'] }, st: false })
  expect(animate(read.theme).look.hud.st).toBe(false)
})

test('a look the mod cannot use is left out or cut, with a note', () => {
  const read = readTheme({
    sprite: ['aaa'],
    palette: { a: '#44cc44' },
    props: { run: ['a'], fly: ['a'], read: 'book', edit: Array.from({ length: 22 }, () => 'a'.repeat(18)) },
    miniSprite: ['aaaaaaa'],
    lines: { read: [], think: ['x'.repeat(50)] },
    lineColors: { read: 'green' },
    hud: { frame: 'blue', hp: { label: 'FUELTANK', fill: ['#000'] }, mp: 'none' },
  })
  if (read.errors) {
    throw new Error(read.errors.join('\n'))
  }
  expect(read.theme.props.edit?.[0]).toHaveLength(20)
  expect(read.theme.props.edit?.[0]?.[0]).toHaveLength(16)
  expect(read.theme.miniSprite).toEqual(['aaaaa'])
  expect(read.theme.lines).toEqual({ think: ['x'.repeat(40)] })
  expect(read.theme.hud).toEqual({ hp: { label: 'FUELTA' } })
  expect(read.notes).toEqual([
    '`miniSprite` is 7×1, past the largest, 5×7, so its bottom-left part is kept.',
    '"run" in `props` is not a mode that can hold a prop, so it is left out.',
    '"fly" in `props` is not a mode that can hold a prop, so it is left out.',
    'the read prop is not a list of text rows, so it is left out.',
    'the edit prop is 18×22, past the largest, 16×20, so its bottom-left part is kept.',
    '`lines.read` has no text, so the read mode keeps its own lines.',
    'Lines in `lines.think` are cut to 40 characters.',
    '`lineColors.read`, "green", is not "#rrggbb", so the read mode keeps its own color.',
    '`hud.frame`, "blue", is not "#rrggbb", so the frame keeps its own color.',
    '`hud.hp.label` is cut to 6 characters.',
    '`hud.hp.fill` is two "#rrggbb" colors, so the bar keeps its own fill.',
    '`hud.mp` is an object or false, so that bar keeps its own look.',
  ])
})

test('a scene keeps its ground, obstacles, and decor in the palette, and notes what it cut', () => {
  const palette = { ...CLAWD.palette, r: '#9aa0b0' }
  const read = readTheme({ ...CLAWD, palette, scene: { ground: ['rr'], obstacles: [['rrrrrrrrrr', 'rrrrrrrrrr']], decor: ['zz'], every: 10 } })
  if (read.errors) {
    throw new Error(read.errors.join('\n'))
  }
  expect(read.theme.scene).toEqual({ ground: ['rr'], obstacles: [['rrrrrrrr', 'rrrrrrrr']], decor: [['zz']], every: 30 })
  expect(read.notes.some(n => n.includes('`scene.obstacles` 1 is 10×2, past the largest, 8×6'))).toBe(true)
  expect(read.notes.some(n => n.includes('In `scene.decor` 1, "z" has no palette color'))).toBe(true)
  expect(read.notes.some(n => n.includes('`scene.every` is a number of columns from 30 to 120, so it is 30.'))).toBe(true)
})

test('a scene with nothing to draw is left out, with a note', () => {
  const read = readTheme({ ...CLAWD, scene: {} })
  expect(read.errors ? undefined : [read.theme.scene, read.notes]).toEqual([undefined, ['`scene` has no ground, sky, obstacles, or decor to draw, so the pet has no scene.']])
  expect(themeOf({ ...CLAWD, scene: { ground: ['a'] } }).scene).toEqual({ ground: ['a'], obstacles: [], decor: [], every: 40 })
  expect(themeOf({ ...CLAWD, scene: { sky: ['.a.', 'aaa'] } }).scene).toEqual({ sky: ['.a.', 'aaa'], obstacles: [], decor: [], every: 40 })
})
