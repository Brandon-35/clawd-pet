// Writes plugins/clawd-pet/assets/clawd.json: Clawd as a pixel sprite, with everything else in the theme format.
// Run: node scripts/build-clawd-assets.mjs
// Clawd is a flat block of clay with two slit eyes, two stubby arms, and four short legs. This lays each part out
// from a few measurements in pixels, so the drawing is easy to change by hand. LOOK below holds the rest of the theme.
import { writeFileSync } from 'node:fs'

const PAL = {
  ink: '#2b2233',
  clay: '#d97757',
  clayDark: '#a84d33',
  clayLight: '#f2a283',
  gold: '#e8aa38',
  sky: '#6f8fc8',
  wood: '#8a5a44',
  woodDark: '#6b4433',
  leaf: '#5a8f5a',
  mug: '#8c8496',
}

const W = 15 // the arms take 2 columns on each side of the body
const BODY = { left: 2, right: 12, top: 0, bottom: 7 } // inclusive pixel bounds
const ARM_ROWS = [3, 4]
const LEG_COLUMNS = [3, 5, 9, 11]
const LEG_ROWS = [8, 9]
const EYE_COLUMNS = [4, 10] // each eye is a slit two pixels tall in this column
const EYE_TOP = 2
const H = LEG_ROWS[LEG_ROWS.length - 1] + 1

const grid = Array.from({ length: H }, () => Array(W).fill('.'))
const put = (x, y, ch) => {
  grid[y][x] = ch
}

// Body: clay, lit along the top, shaded down the right side and along the bottom.
for (let y = BODY.top; y <= BODY.bottom; y++) {
  for (let x = BODY.left; x <= BODY.right; x++) {
    put(x, y, y === BODY.bottom || x === BODY.right ? 'd' : y === BODY.top ? 'l' : 'c')
  }
}
// Arms and legs get their own characters, so the poses can lift and step them (`limbs`).
for (const y of ARM_ROWS) {
  for (const x of [0, 1, W - 2, W - 1]) put(x, y, 'e')
}
for (const y of LEG_ROWS) {
  for (const x of LEG_COLUMNS) put(x, y, 'g')
}

// The mod draws each eye in a 3x3 box; `eyes` names the box's left column and its middle row.
const eyes = EYE_COLUMNS.map(x => [x - 1, EYE_TOP + 1])

const sprite = grid.map(r => r.join(''))
const theme = {
  name: 'clawd',
  scale: 1,
  sprite,
  palette: {
    c: PAL.clay,
    l: PAL.clayLight,
    d: PAL.clayDark,
    e: PAL.clay,
    g: PAL.clayDark,
    a: PAL.ink,
    y: PAL.gold,
    b: PAL.sky,
    k: PAL.wood,
    n: PAL.woodDark,
    p: PAL.leaf,
    m: PAL.mug,
  },
  eyes,
  eyeColor: PAL.ink,
  limbs: { arms: 'e', legs: 'g' },
  ...LOOK(),
}
const out = new URL('../plugins/clawd-pet/assets/clawd.json', import.meta.url)
writeFileSync(out, `${JSON.stringify(theme, null, 2)}\n`)
console.log(sprite.join('\n'))
console.log(`wrote ${out.pathname}`)

// Everything beyond the drawing: Clawd's mini, its emotes for the modes with no tool prop, its lines and colors,
// the HUD look, and a desk at night to walk along.
function LOOK() {
  // A prop stands on the band's floor; `raise` pads clear rows below it so it floats beside Clawd's head.
  const raise = (rows, by) => [...rows, ...Array(by).fill('.'.repeat(rows[0].length))]
  return {
    mini: { top: PAL.clayLight, body: PAL.clay, edge: PAL.clayDark },
    miniSprite: ['.lll.', 'cacac', 'ccccd', '.g.g.'],
    props: {
      think: [
        raise(['y....', '.....', '.....'], 9),
        raise(['y.y..', '.....', '.....'], 9),
        raise(['y.y.y', '.....', '.....'], 9),
      ],
      agent: [
        raise(['.yyy.', 'yyyyy', 'yyyyy', '.yyy.', '.mmm.', '.mmm.'], 7),
        raise(['y.y.y', '.yyy.', 'yyyyy', 'yyyyy', '.yyy.', '.mmm.', '.mmm.'], 7),
      ],
      error: [
        raise(['.y...', 'yyy..', '.y..y', '...yy', '....y'], 9),
        raise(['...y.', '..yyy', 'y..y.', 'yy...', 'y....'], 9),
      ],
      cheer: [
        raise(['..y..', '.yyy.', 'yyyyy', '.yyy.', '..y..'], 8),
        raise(['.....', '..y..', '.yyy.', '..y..', '.....'], 8),
      ],
    },
    lines: {
      idle: ['…', 'ready when you are', 'stretching my legs', 'what are we making?'],
      sleep: ['zzz…', 'resting my legs'],
      jump: ['on it!', 'let’s go'],
      think: ['hmm…', 'working it out', 'putting it together'],
      agent: ['calling in a helper', 'a tiny Clawd heads out'],
      cheer: ['done!', 'that went well', 'all wrapped up'],
      error: ['oof', 'that did not work', 'trying another way'],
      abort: ['okay, stopping', 'stopped', 'say the word'],
      compact: ['packing up the context', 'making room to think'],
      alert: ['you’re needed', 'waiting on you'],
    },
    lineColors: { idle: '#c06a4b', think: '#b0805a', agent: '#c08a1e', cheer: '#c08a1e', error: '#c0473a', alert: '#c08a1e' },
    hud: {
      frame: PAL.clay,
      hp: { label: 'HP', fill: [PAL.clayDark, PAL.clayLight] },
      mp: { label: 'MP' },
      st: { label: 'ST' },
    },
    scene: {
      ground: ['kkkkkkknkkkkkkkk', 'nnnknnnnnnnnknnn'],
      sky: ['..yyy.......', '.yy.......y.', 'yy..........', 'yy.....y....', '.yy.........', '..yyy.......'],
      obstacles: [
        ['mmmmm..', 'mnnnmmm', 'mnnnm.m', 'mnnnmmm', '.mmm...'],
        ['..dddd..', '.bbbbbb.', 'kkkkkkkk', '.yyyyyy.'],
        ['..p..', '.ppp.', 'p.p.p', 'ppppp', '..p..', '.kkk.'],
      ],
      decor: [
        ['.y.', 'yyy', '.y.', ...Array(12).fill('...')],
        ['p.p', '.p.'],
      ],
      every: 48,
    },
  }
}
