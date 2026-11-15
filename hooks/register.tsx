import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ThemeSetArgs, Timer } from 'claude-code'

import type { ContextReading, SkyLevel } from '../types'
import { makeColors } from './make-colors.js'
import { renderProse } from './prose'

// ---------------------------------------------------------------------------
// Palette: ink-violet surfaces a few percent apart, lavender text, a violet
// accent, one cold HUD cyan for literals so code does not flatten into purple,
// jade for strings, Amarr gold for warnings and rose for danger.
// ---------------------------------------------------------------------------

const { theme, problems } = makeColors({
  label: 'EVE Nebula',
  only: 'dark',
  roles: { accent: '#a682ff', danger: '#f2617f', success: '#5ed1a7', warning: '#e8b45c', pro: '#6fd0ff' },
  dark: {
    gray: {
      anchors: {
        'surface-0': '#0b0915',
        'surface-1': '#110e1d',
        'surface-2': '#161326',
        'surface-3': '#1c172e',
        'text-primary': '#efebfa',
        'text-secondary': '#c8c1de',
        'text-muted': '#a098bf',
      },
    },
    git: {
      added: '#5ed1a7',
      removed: '#f2617f',
      modified: '#e8b45c',
      merged: '#b8a2ff',
      closed: '#f2617f',
      conflicting: '#ee8a52',
      draft: '#a098bf',
    },
  },
})

const VERSION = '0.6.0'
const SCENE_NAME = 'new-eden-saturn'

// The app lays a glass over the scene wherever a panel sits. No blur, so the
// planet, its rings and the capacitor figure stay sharp under every panel; the
// tint alone keeps the words on top readable.
const LOOK: ThemeSetArgs = {
  colors: theme,
  overrideColorScheme: 'dark',
  backdrop: {
    scene: SCENE_NAME,
    glass: { blur: 0, tint: '#0b0915', opacity: 0.5 },
  },
}

// ---------------------------------------------------------------------------
// Scene: a layered nebula over a quiet starfield, and a ringed planet in the
// open space left of the conversation. Its middle ring is the capacitor:
// twenty cells, one for each twentieth of the context window still free, that
// go dark one by one as the window fills; lavender while there is room, gold
// under half, rose in the last quarter, pulsing at the very end. The figure
// itself sits under the planet, in space nothing covers.
// ---------------------------------------------------------------------------

const n1 = (value: number): string => value.toFixed(1)

// A small seeded generator, so the sky is the same on every launch.
function seeded(seed: number): () => number {
  let s = seed

  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Star = { x: number; y: number; r: number; o: number; tint: string }

const STAR_TINTS = ['#ffffff', '#e8e1ff', '#d4e6ff', '#ffe6f3', '#dcd0ff']

// The galaxy's band runs from low left to high right; stars crowd toward it.
function bandWeight(x: number, y: number): number {
  const distance = Math.abs(0.45 * x + y - 860) / 1.0966

  return 0.25 + 0.75 * Math.exp(-((distance / 200) ** 2))
}

function scatter(count: number, seed: number, radius: [number, number], opacity: [number, number]): Star[] {
  const rand = seeded(seed)
  const stars: Star[] = []

  for (let tries = 0; stars.length < count && tries < count * 50; tries += 1) {
    const x = -60 + rand() * 1720
    const y = -40 + rand() * 1080

    if (rand() > bandWeight(x, y)) {
      continue
    }

    stars.push({
      x,
      y,
      r: radius[0] + rand() * (radius[1] - radius[0]),
      o: opacity[0] + rand() * (opacity[1] - opacity[0]),
      tint: STAR_TINTS[Math.floor(rand() * STAR_TINTS.length)] ?? '#ffffff',
    })
  }

  return stars
}

function dot(star: Star, extra = ''): string {
  return `<circle cx="${n1(star.x)}" cy="${n1(star.y)}" r="${star.r.toFixed(2)}" fill="${star.tint}" fill-opacity="${star.o.toFixed(2)}"${extra}/>`
}

const twinkles = seeded(77)

function twinkle(): string {
  const duration = (7 + twinkles() * 8).toFixed(1)
  const offset = (twinkles() * 15).toFixed(1)

  return ` class="tw" style="animation-duration:${duration}s;animation-delay:calc(var(--t) * -1s - ${offset}s)"`
}

// Every animation is offset by --t, the time of drawing, so a redraw (a new
// capacitor reading) picks the motion up where it was instead of starting over.
//
// The planet sits in the gutter left of the conversation column, tuned for a
// window about 1.6 times as wide as tall with the sidebar open; narrower windows
// shrink it, and below 1.35 there is no room left, so it steps aside.
const STYLE = `<style>
  .neb { transform-box: fill-box; transform-origin: center; }
  .neb-a { animation: nebA 120s ease-in-out calc(var(--t) * -1s) infinite alternate; }
  .neb-b { animation: nebFade 48s ease-in-out calc(var(--t) * -1s) infinite alternate, nebB 96s ease-in-out calc(var(--t) * -1s) infinite alternate; }
  .neb-c { animation: nebC 70s ease-in-out calc(var(--t) * -1s) infinite alternate; }
  .wisps { animation: wisps 150s ease-in-out calc(var(--t) * -1s) infinite alternate; }
  @keyframes nebA { from { transform: translate(0, 0) scale(1); } to { transform: translate(36px, 14px) scale(1.05); } }
  @keyframes nebB { from { transform: translate(0, 0) scale(1.02); } to { transform: translate(-30px, -12px) scale(.97); } }
  @keyframes nebFade { from { opacity: .45; } to { opacity: 1; } }
  @keyframes nebC { from { opacity: .5; transform: translate(0, 0); } to { opacity: .95; transform: translate(-30px, 8px); } }
  @keyframes wisps { from { opacity: .75; transform: translate(0, 0); } to { opacity: 1; transform: translate(24px, -10px); } }

  .mid { animation: driftMid 140s linear calc(var(--t) * -1s) infinite alternate; }
  .near { animation: driftNear 90s ease-in-out calc(var(--t) * -1s) infinite alternate; }
  @keyframes driftMid { to { transform: translate(-22px, 4px); } }
  @keyframes driftNear { to { transform: translate(-54px, 10px); } }

  .tw { animation-name: twinkle; animation-timing-function: ease-in-out; animation-iteration-count: infinite; animation-direction: alternate; }
  @keyframes twinkle { from { opacity: .3; } to { opacity: 1; } }

  .warp { opacity: 0; animation-name: warp; animation-timing-function: linear; animation-iteration-count: infinite; }
  .w1 { animation-duration: 31s; animation-delay: calc(var(--t) * -1s - 6s); }
  .w2 { animation-duration: 53s; animation-delay: calc(var(--t) * -1s - 29s); }
  @keyframes warp {
    0% { transform: translate(-400px, 420px); opacity: 0; }
    1% { opacity: .9; }
    5% { opacity: .9; }
    7% { transform: translate(2000px, -16px); opacity: 0; }
    100% { transform: translate(2000px, -16px); opacity: 0; }
  }

  .sat-storms { animation: storms 80s linear calc(var(--t) * -1s) infinite; }
  @keyframes storms { to { transform: translateX(-160px); } }
  .sat-atmo { animation: atmo 14s ease-in-out calc(var(--t) * -1s) infinite alternate; }
  @keyframes atmo { from { opacity: .7; } to { opacity: 1; } }
  .sat-alarm { animation: alarm 3s ease-in-out calc(var(--t) * -1s) infinite alternate; }
  @keyframes alarm { from { opacity: .35; } to { opacity: 1; } }
  .sat-on { animation: cellGlow 8s ease-in-out calc(var(--t) * -1s) infinite alternate; }
  @keyframes cellGlow { from { opacity: .8; } to { opacity: 1; } }
  .sat-low { animation: low 2.4s ease-in-out calc(var(--t) * -1s) infinite alternate; }
  @keyframes low { from { opacity: .3; } to { opacity: 1; } }

  .sat-readout text { font-family: -apple-system, 'SF Pro Display', 'Helvetica Neue', sans-serif; }
  .sat-cap { font-size: 7.5px; letter-spacing: .34em; fill: #a098bf; }
  .sat-val { font-size: 20px; font-weight: 300; letter-spacing: .02em; }
  .sat-sub { font-size: 9.5px; letter-spacing: .05em; fill: #a098bf; }

  .saturn-pos { transform: translate(456px, 191px); }
  @media (max-aspect-ratio: 156/100) { .saturn-pos { transform: translate(470px, 191px) scale(.82); } }
  @media (max-aspect-ratio: 149/100) { .saturn-pos { transform: translate(488px, 191px) scale(.66); } }
  @media (max-aspect-ratio: 142/100) { .saturn-pos { transform: translate(506px, 191px) scale(.54); } }
  @media (max-aspect-ratio: 135/100) { .saturn-pos { display: none; } }
  @media (min-aspect-ratio: 170/100) { .saturn-pos { transform: translate(452px, 215px); } }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
</style>`

const DEFS = `<defs>
  <linearGradient id="space" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0d0a1c"/><stop offset=".5" stop-color="#090713"/><stop offset="1" stop-color="#040308"/></linearGradient>
  <radialGradient id="ambient" cx=".28" cy=".3" r=".8"><stop offset="0" stop-color="#2a1858" stop-opacity=".55"/><stop offset=".5" stop-color="#140d2c" stop-opacity=".25"/><stop offset="1" stop-color="#0b0915" stop-opacity="0"/></radialGradient>
  <radialGradient id="nViolet"><stop offset="0" stop-color="#7b4dff" stop-opacity=".42"/><stop offset=".42" stop-color="#5a32c4" stop-opacity=".19"/><stop offset="1" stop-color="#1a0f3d" stop-opacity="0"/></radialGradient>
  <radialGradient id="nOrchid"><stop offset="0" stop-color="#c35be8" stop-opacity=".32"/><stop offset=".45" stop-color="#7d2fa6" stop-opacity=".13"/><stop offset="1" stop-color="#2a0a33" stop-opacity="0"/></radialGradient>
  <radialGradient id="nIndigo"><stop offset="0" stop-color="#4549e3" stop-opacity=".3"/><stop offset=".5" stop-color="#262a8f" stop-opacity=".12"/><stop offset="1" stop-color="#0f0b2a" stop-opacity="0"/></radialGradient>
  <radialGradient id="nCyan"><stop offset="0" stop-color="#46c8f2" stop-opacity=".16"/><stop offset=".55" stop-color="#2a6fa8" stop-opacity=".06"/><stop offset="1" stop-color="#0b1a33" stop-opacity="0"/></radialGradient>
  <radialGradient id="wisp"><stop offset="0" stop-color="#c3b0ff" stop-opacity=".22"/><stop offset=".5" stop-color="#7b4dff" stop-opacity=".08"/><stop offset="1" stop-color="#3a2280" stop-opacity="0"/></radialGradient>
  <radialGradient id="lane"><stop offset="0" stop-color="#04030a" stop-opacity=".62"/><stop offset=".6" stop-color="#05030c" stop-opacity=".24"/><stop offset="1" stop-color="#05030c" stop-opacity="0"/></radialGradient>
  <radialGradient id="vignette" cx=".5" cy=".5" r=".78"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".62"/></radialGradient>
  <radialGradient id="starHalo"><stop offset="0" stop-color="#ffffff" stop-opacity=".5"/><stop offset=".35" stop-color="#d8ccff" stop-opacity=".16"/><stop offset="1" stop-color="#a682ff" stop-opacity="0"/></radialGradient>
  <linearGradient id="spikeH" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <linearGradient id="spikeV" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <linearGradient id="trail" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#a682ff" stop-opacity="0"/><stop offset=".7" stop-color="#d2c4ff" stop-opacity=".45"/><stop offset="1" stop-color="#ffffff" stop-opacity=".95"/></linearGradient>
  <clipPath id="sat-disc"><ellipse rx="58" ry="55"/></clipPath>
  <radialGradient id="sat-body" cx=".36" cy=".3" r=".85"><stop offset="0" stop-color="#f1e9ff"/><stop offset=".32" stop-color="#c7b5f5"/><stop offset=".66" stop-color="#7f69cf"/><stop offset="1" stop-color="#2c2262"/></radialGradient>
  <radialGradient id="sat-shade" cx=".3" cy=".24" r="1"><stop offset=".38" stop-color="#05040b" stop-opacity="0"/><stop offset=".72" stop-color="#05040b" stop-opacity=".55"/><stop offset="1" stop-color="#05040b" stop-opacity=".9"/></radialGradient>
  <linearGradient id="sat-limb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6f0ff" stop-opacity=".9"/><stop offset=".4" stop-color="#c9b8ff" stop-opacity=".35"/><stop offset="1" stop-color="#c9b8ff" stop-opacity="0"/></linearGradient>
  <radialGradient id="sat-moon" cx=".35" cy=".32" r=".8"><stop offset="0" stop-color="#ece6fb"/><stop offset=".55" stop-color="#8f86b8"/><stop offset="1" stop-color="#262140"/></radialGradient>
</defs>`

const SKY = `<rect width="1600" height="1000" fill="url(#space)"/>
<rect width="1600" height="1000" fill="url(#ambient)"/>
<g class="neb neb-a">
  <ellipse cx="430" cy="360" rx="640" ry="390" fill="url(#nViolet)"/>
  <ellipse cx="300" cy="650" rx="520" ry="300" fill="url(#nIndigo)"/>
</g>
<g class="neb neb-b">
  <ellipse cx="560" cy="300" rx="380" ry="230" fill="url(#nOrchid)" transform="rotate(-18 560 300)"/>
  <ellipse cx="1180" cy="790" rx="520" ry="250" fill="url(#nOrchid)" opacity=".5" transform="rotate(-12 1180 790)"/>
</g>
<g class="neb neb-c">
  <ellipse cx="820" cy="170" rx="460" ry="170" fill="url(#nCyan)" transform="rotate(-8 820 170)"/>
</g>
<g class="neb wisps">
  <ellipse cx="560" cy="470" rx="560" ry="90" fill="url(#wisp)" opacity=".8" transform="rotate(-27 560 470)"/>
  <ellipse cx="420" cy="300" rx="380" ry="64" fill="url(#wisp)" opacity=".45" transform="rotate(-33 420 300)"/>
  <ellipse cx="990" cy="560" rx="420" ry="76" fill="url(#wisp)" opacity=".3" transform="rotate(-22 990 560)"/>
  <ellipse cx="520" cy="420" rx="470" ry="66" fill="url(#lane)" opacity=".75" transform="rotate(-26 520 420)"/>
  <ellipse cx="370" cy="540" rx="320" ry="52" fill="url(#lane)" opacity=".55" transform="rotate(-30 370 540)"/>
</g>`

// Bright stars with soft diffraction spikes, kept clear of the planet and of
// the reading column.
const SPIKE_AT: readonly (readonly [number, number, number])[] = [
  [420, 700, 0],
  [1400, 290, 4.5],
  [1340, 830, 8],
]

const SPIKES = SPIKE_AT.map(
  ([x, y, phase]) =>
    `<g transform="translate(${x} ${y})"><g class="tw" style="animation-duration:9s;animation-delay:calc(var(--t) * -1s - ${phase}s)">` +
    '<circle r="9" fill="url(#starHalo)"/>' +
    '<rect x="-24" y="-0.5" width="48" height="1" fill="url(#spikeH)"/>' +
    '<rect x="-0.5" y="-24" width="1" height="48" fill="url(#spikeV)"/>' +
    '<circle r="1.5" fill="#ffffff"/></g></g>',
).join('')

const STARS =
  `<g>${scatter(230, 11, [0.3, 0.75], [0.35, 0.8])
    .map(star => dot(star))
    .join('')}</g>` +
  `<g class="mid">${scatter(70, 23, [0.7, 1.2], [0.5, 0.95])
    .map(star => dot(star, twinkles() < 0.45 ? twinkle() : ''))
    .join('')}</g>` +
  `<g class="near">${scatter(12, 41, [1.2, 1.8], [0.75, 1])
    .map(
      star =>
        `<circle cx="${n1(star.x)}" cy="${n1(star.y)}" r="${n1(star.r * 5)}" fill="url(#starHalo)" opacity=".7"/>` +
        dot(star, twinkles() < 0.5 ? twinkle() : ''),
    )
    .join('')}</g>` +
  SPIKES

const TRAILS =
  '<g><path class="warp w1" d="M0 0 L220 -40" stroke="url(#trail)" stroke-width="1.2" stroke-linecap="round" fill="none"/>' +
  '<path class="warp w2" d="M0 90 L160 61" stroke="url(#trail)" stroke-width="1" stroke-linecap="round" fill="none"/></g>'

const VIGNETTE = '<rect width="1600" height="1000" fill="url(#vignette)"/>'

// ---------------------------------------------------------------------------
// The capacitor's moods.
// ---------------------------------------------------------------------------

type Tone = { cell: string; glow: string; halo: readonly [string, string, string] }

const ROSE: Tone = { cell: '#ff95a8', glow: '#f2617f', halo: ['#ff7d96', '#e0566f', '#a8304a'] }

const TONES: Record<SkyLevel, Tone> = {
  calm: { cell: '#ddd1ff', glow: '#a682ff', halo: ['#9b7bff', '#8a6bff', '#6d4fe0'] },
  half: { cell: '#f3d28c', glow: '#e8b45c', halo: ['#f0c674', '#d9a54d', '#a8742a'] },
  low: ROSE,
  alarm: ROSE,
}

const MOODS: Record<SkyLevel, string> = {
  calm: 'lavender',
  half: 'gold',
  low: 'rose',
  alarm: 'rose and pulsing',
}

function levelOf(left: number): SkyLevel {
  if (left >= 50) {
    return 'calm'
  }

  if (left >= 25) {
    return 'half'
  }

  return left >= 15 ? 'low' : 'alarm'
}

function compact(tokens: number): string {
  if (tokens >= 1_000_000) {
    const millions = tokens / 1_000_000

    return `${Number.isInteger(millions) ? millions.toFixed(0) : millions.toFixed(1)}M`
  }

  return tokens >= 1000 ? `${Math.round(tokens / 1000)}k` : String(tokens)
}

// ---------------------------------------------------------------------------
// The ringed planet, drawn about its own centre and tilted with its rings.
// ---------------------------------------------------------------------------

const TILT = -16
const DISC = { rx: 58, ry: 55 } as const
const RING_INNER = { rx: 76, ry: 17.5 } as const
const RING_CELLS = { rx: 98, ry: 22.5 } as const
const RING_OUTER = { rx: 118, ry: 27 } as const
const CELLS = 20
const MOON = { rx: 142, ry: 33, seconds: 70 } as const

function onEllipse(rx: number, ry: number, degrees: number): string {
  const a = (degrees * Math.PI) / 180

  return `${n1(rx * Math.cos(a))} ${n1(ry * Math.sin(a))}`
}

// Half an ellipse, clockwise: from 0 degrees it is the near half, which passes
// in front of the planet; from 180 the far half, which passes behind it.
function halfEllipse(rx: number, ry: number, from: 0 | 180): string {
  return `M${onEllipse(rx, ry, from)}A${rx} ${ry} 0 0 1 ${onEllipse(rx, ry, from + 180)}`
}

// Twenty cells around the middle ring, clockwise from the nearest point.
const CELL_ARCS = Array.from({ length: CELLS }, (_, index) => {
  const from = 90 + index * 18 + 2
  const middle = (from + 7) % 360
  const { rx, ry } = RING_CELLS

  return {
    d: `M${onEllipse(rx, ry, from)}A${rx} ${ry} 0 0 1 ${onEllipse(rx, ry, from + 14)}`,
    isFar: middle > 180,
  }
})

function ringBands(from: 0 | 180): string {
  return (
    `<path d="${halfEllipse(RING_INNER.rx, RING_INNER.ry, from)}" stroke="#cfc2ff" stroke-opacity=".16" stroke-width="7" fill="none"/>` +
    `<path d="${halfEllipse(RING_CELLS.rx, RING_CELLS.ry, from)}" stroke="#ffffff" stroke-opacity=".05" stroke-width="9" fill="none"/>` +
    `<path d="${halfEllipse(RING_OUTER.rx, RING_OUTER.ry, from)}" stroke="#d9cfff" stroke-opacity=".2" stroke-width="5" fill="none"/>`
  )
}

function capacitorCells(lit: number, level: SkyLevel, isFar: boolean): string {
  const tone = TONES[level]
  let cells = ''

  CELL_ARCS.forEach((arc, index) => {
    if (arc.isFar !== isFar) {
      return
    }

    if (index >= lit) {
      cells += `<path data-cell="off" d="${arc.d}" stroke="#ffffff" stroke-opacity=".1" stroke-width="5.5" fill="none"/>`

      return
    }

    const isLast = level === 'alarm' && index === lit - 1

    cells +=
      `<g class="${isLast ? 'sat-low' : 'sat-on'}" data-cell="on">` +
      `<path d="${arc.d}" stroke="${tone.glow}" stroke-opacity=".3" stroke-width="11" fill="none"/>` +
      `<path d="${arc.d}" stroke="${tone.cell}" stroke-width="5.5" fill="none"/></g>`
  })

  return cells
}

// Gas bands parallel to the rings, and storms that drift across the face so
// the planet is seen to turn.
const BANDS: readonly (readonly [number, number, string, number])[] = [
  [-56, 9, '#3d2f7c', 0.45],
  [-46, 6, '#e6dcff', 0.22],
  [-38, 11, '#6a56b8', 0.3],
  [-24, 5, '#f3ecff', 0.28],
  [-17, 13, '#8d78d8', 0.22],
  [-1, 6, '#3f307c', 0.32],
  [7, 9, '#d6c9ff', 0.2],
  [19, 7, '#5b48a8', 0.3],
  [29, 10, '#b8a6f2', 0.18],
  [41, 8, '#3a2c70', 0.38],
  [50, 8, '#5a4799', 0.3],
]

const STORMS: readonly (readonly [number, number, number, number, string, number])[] = [
  [-62, -34, 10, 2.6, '#f4eeff', 0.35],
  [-30, 6, 14, 3, '#2b2162', 0.45],
  [4, -20, 9, 2.4, '#ece4ff', 0.3],
  [30, 26, 12, 2.8, '#2a2060', 0.4],
  [58, -6, 8, 2.2, '#f2ebff', 0.32],
  [-48, 34, 9, 2.2, '#efe8ff', 0.26],
  [44, 40, 10, 2.4, '#251c58', 0.4],
]

const PLANET_BODY =
  '<g clip-path="url(#sat-disc)">' +
  `<ellipse rx="${DISC.rx}" ry="${DISC.ry}" fill="url(#sat-body)"/>` +
  BANDS.map(
    ([y, height, colour, opacity]) =>
      `<rect x="-80" y="${y}" width="160" height="${height}" fill="${colour}" fill-opacity="${opacity}"/>`,
  ).join('') +
  `<g class="sat-storms">${STORMS.flatMap(([x, y, rx, ry, colour, opacity]) =>
    [x, x + 160].map(
      cx => `<ellipse cx="${cx}" cy="${y}" rx="${rx}" ry="${ry}" fill="${colour}" fill-opacity="${opacity}"/>`,
    ),
  ).join('')}</g>` +
  // The rings' shadow falls across the face below the equator.
  `<path d="${halfEllipse(100, 23, 0)}" transform="translate(0 5)" stroke="#05040b" stroke-opacity=".45" stroke-width="5" fill="none"/>` +
  `<ellipse rx="${DISC.rx}" ry="${DISC.ry}" fill="url(#sat-shade)"/>` +
  '</g>' +
  `<ellipse rx="${DISC.rx}" ry="${DISC.ry}" fill="none" stroke="url(#sat-limb)" stroke-width="1.3"/>`

// A small moon in the ring plane: two copies run the same orbit, one shown on
// the near half in front of the planet, one on the far half behind it.
function moon(t: number): { far: string; near: string } {
  const begin = `-${(t % MOON.seconds).toFixed(1)}s`
  const path =
    `M${MOON.rx} 0A${MOON.rx} ${MOON.ry} 0 0 1 ${-MOON.rx} 0` + `A${MOON.rx} ${MOON.ry} 0 0 1 ${MOON.rx} 0`
  const copy = (values: string): string =>
    '<g opacity="0"><circle r="4.6" fill="url(#sat-moon)"/>' +
    `<animateMotion dur="${MOON.seconds}s" begin="${begin}" repeatCount="indefinite" path="${path}"/>` +
    `<animate attributeName="opacity" dur="${MOON.seconds}s" begin="${begin}" repeatCount="indefinite" calcMode="discrete" keyTimes="0;0.5" values="${values}"/></g>`

  return { far: copy('0;1'), near: copy('1;0') }
}

function readout(reading: ContextReading, level: SkyLevel): string {
  const value = reading === null ? '—' : `${reading.left}%`
  const colour = reading === null ? '#a098bf' : TONES[level].cell
  const charge =
    reading === null || reading.tokensLeft === null
      ? ''
      : `<text class="sat-sub" y="111" text-anchor="middle">${compact(reading.tokensLeft)} / ${compact(reading.window)}</text>`

  return (
    '<g class="sat-readout">' +
    '<text class="sat-cap" y="74" text-anchor="middle">CAPACITOR</text>' +
    `<text class="sat-val" y="96" text-anchor="middle" fill="${colour}">${value}</text>` +
    `${charge}</g>`
  )
}

function saturn(reading: ContextReading, t: number): string {
  const level = reading === null ? 'calm' : levelOf(reading.left)
  const [h0, h1, h2] = TONES[level].halo
  const lit = reading === null ? 0 : Math.ceil((reading.left / 100) * CELLS)
  const moons = moon(t)

  return (
    '<g class="saturn-pos">' +
    '<defs><radialGradient id="sat-halo" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="86">' +
    `<stop offset=".64" stop-color="${h0}" stop-opacity=".42"/><stop offset=".75" stop-color="${h1}" stop-opacity=".16"/>` +
    `<stop offset="1" stop-color="${h2}" stop-opacity="0"/></radialGradient></defs>` +
    `<circle r="86" fill="url(#sat-halo)" class="${level === 'alarm' ? 'sat-alarm' : 'sat-atmo'}"/>` +
    `<g transform="rotate(${TILT})">` +
    ringBands(180) +
    capacitorCells(lit, level, true) +
    moons.far +
    PLANET_BODY +
    ringBands(0) +
    capacitorCells(lit, level, false) +
    moons.near +
    '</g>' +
    readout(reading, level) +
    '</g>'
  )
}

function scene(reading: ContextReading, nowMs: number): string {
  const t = (nowMs / 1000) % 86400

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" style="--t:${t.toFixed(1)}">` +
    `${STYLE}${DEFS}${SKY}${STARS}${TRAILS}${VIGNETTE}${saturn(reading, t)}</svg>`
  )
}

function describe(reading: ContextReading): string {
  const view = 'A violet nebula over a starfield, with a ringed planet left of the conversation'

  if (reading === null) {
    return view
  }

  const lit = Math.ceil((reading.left / 100) * CELLS)

  return `${view}; ${lit} of the ${CELLS} capacitor cells on its ring are lit, glowing ${MOODS[levelOf(reading.left)]}, with ${reading.left}% of the context window left`
}

// ---------------------------------------------------------------------------
// Context reading, refreshed after every turn; the scene redraws only when the
// figures it shows change.
// ---------------------------------------------------------------------------

const readingAtom = atom({ plugin: 'eve-nebula', key: 'reading' } as const, null)
// Whether this chat shows the look now; the assistant's orange prose follows it.
const lookOn = atom({ plugin: 'eve-nebula', key: 'lookOn' } as const, false)
let latest: ContextReading = null
let lastReadingKey: string | undefined

async function readContext($: EngineInterface): Promise<void> {
  const { context } = await $.session.usage()
  const reading: ContextReading =
    context.percent === undefined
      ? null
      : {
          left: Math.max(0, Math.min(100, 100 - Math.round(context.percent))),
          tokensLeft: context.tokens === undefined ? null : Math.max(0, context.window - context.tokens),
          window: context.window,
        }

  latest = reading

  const readingKey = JSON.stringify(reading)

  if (readingKey !== lastReadingKey) {
    lastReadingKey = readingKey
    await update($, readingAtom, () => reading)
  }
}

// ---------------------------------------------------------------------------
// On/off: the choice lives in one small file beside the mod that every open
// chat reads, so turning it off or on in one chat reaches the others within
// seconds, and new chats start from it. A missing or unreadable file means on.
// ---------------------------------------------------------------------------

const STATE_PATH_IN_HOME = '.claude/mods/eve-nebula.state.json'
const FOLLOW_EVERY_MS = 3000

const ON_WORDS = new Set(['on', 'aç', 'ac', 'açık', 'acik', 'enable'])
const OFF_WORDS = new Set(['off', 'kapat', 'kapalı', 'kapali', 'disable'])
const STATUS_WORDS = new Set(['status', 'durum'])

const USAGE = 'Kullanım: /eve-theme (on/off arasında geçiş yapar), /eve-theme on, /eve-theme off, /eve-theme status'

// This chat's own view, which starts over on a reload (session.start runs again):
// what it shows now, its follow timer, and a count of choices made here, so a
// read that a newer choice overtook is not applied.
let shown: boolean | undefined
let followTimer: Timer | undefined
let choices = 0

async function statePath($: EngineInterface): Promise<string | undefined> {
  const home = await $.env.get('HOME')

  return home === undefined ? undefined : `${home}/${STATE_PATH_IN_HOME}`
}

async function isEnabled($: EngineInterface): Promise<boolean> {
  const path = await statePath($)

  if (path === undefined) {
    return true
  }

  try {
    const saved: unknown = JSON.parse(await $.fs.read(path))

    return !(typeof saved === 'object' && saved !== null && 'enabled' in saved && saved.enabled === false)
  } catch {
    return true
  }
}

async function saveEnabled($: EngineInterface, enabled: boolean): Promise<boolean> {
  const path = await statePath($)

  if (path === undefined) {
    return false
  }

  try {
    await $.fs.write(path, `${JSON.stringify({ enabled })}\n`)

    return true
  } catch {
    return false
  }
}

async function show($: EngineInterface, enabled: boolean): Promise<void> {
  shown = enabled
  await update($, lookOn, () => enabled)

  if (!enabled) {
    await $.theme.clear()
    $.ui.status(undefined)

    return
  }

  const unpainted = problems.find(line => line.startsWith("Desktop won't paint"))

  if (unpainted !== undefined) {
    $.ui.toast(unpainted)
  }

  const set = await $.theme.set(LOOK)

  $.ui.status(set.isDrawn ? undefined : set.reason)
}

// Brings this chat in line with a choice made in another chat.
async function follow($: EngineInterface): Promise<void> {
  const before = choices
  const enabled = await isEnabled($)

  if (choices === before && enabled !== shown) {
    await show($, enabled)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // Another copy of this mod may hold the command already (a chat that loaded
    // it twice); the look goes on regardless.
    await $.command
      .register({
        name: 'eve-theme',
        description: 'EVE Nebula teması on/off; tüm sohbetlerde geçerli olur',
        argumentHint: '[on|off|status]',
        immediate: true,
      })
      .catch(() => undefined)

    // Off at the start draws nothing and clears nothing: a theme is cleared
    // only on the person's own choice.
    if (await isEnabled($)) {
      await show($, true)
    } else {
      shown = false
    }

    await readContext($).catch(() => undefined)

    followTimer?.cancel()
    followTimer = $.clock.every(FOLLOW_EVERY_MS, () => {
      follow($).catch(() => undefined)
    })

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)

    await readContext($).catch(() => undefined)

    return done
  })

  on('command.run', { command: 'eve-theme' }, async ($, e) => {
    const word = e.args.trim().toLowerCase()
    const current = await isEnabled($)

    if (STATUS_WORDS.has(word)) {
      const charge =
        latest === null || latest.tokensLeft === null ? '' : ` (${compact(latest.tokensLeft)} / ${compact(latest.window)})`
      const capacitor = latest === null ? '' : `, kapasitör %${latest.left}${charge}`

      return { text: `EVE Nebula ${VERSION}: ${current ? 'açık (on)' : 'kapalı (off)'}${capacitor}.` }
    }

    let wanted: boolean

    if (word === '') {
      wanted = !current
    } else if (ON_WORDS.has(word)) {
      wanted = true
    } else if (OFF_WORDS.has(word)) {
      wanted = false
    } else {
      return { text: `"${word}" seçeneğini tanımıyorum. ${USAGE}` }
    }

    choices += 1
    const isSaved = await saveEnabled($, wanted)
    await show($, wanted)

    const unsaved = isSaved ? '' : ' Seçimi kaydedemedim, yalnızca bu sohbette geçerli.'

    if (wanted) {
      return { text: `EVE Nebula teması açıldı (on). Açık diğer sohbetler birkaç saniye içinde açılır, yeni sohbetler de temalı başlar.${unsaved}` }
    }

    return {
      text: `EVE Nebula teması kapatıldı (off). Açık diğer sohbetler birkaç saniye içinde kapanır, yeni sohbetler temasız başlar. Geri açmak için: /eve-theme on${unsaved}`,
    }
  })

  on('ui.render', { component: 'Backdrop' }, async ($, e, next) => {
    if (e.surface !== 'desktop' && e.surface !== 'mobile') {
      return next(e)
    }

    if (e.props.scene !== SCENE_NAME) {
      return next(e)
    }

    const reading = await read($, readingAtom)
    const { Svg } = $.ui.resolve(e)

    return <Svg source={scene(reading, Date.now())} alt={describe(reading)} isInteractive />
  })

  // The assistant's words in light orange, while the look is on. Summaries keep
  // the app's own drawing and its mark; the terminal is left as it is.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface !== 'desktop' && e.surface !== 'mobile') {
      return next(e)
    }

    if (e.props.isSummary === true || !(await read($, lookOn))) {
      return next(e)
    }

    const { Box, Text, Link, Code, Markdown } = $.ui.resolve(e)

    return renderProse(e.props.text, { Box, Text, Link, Code, Markdown })
  })
}
