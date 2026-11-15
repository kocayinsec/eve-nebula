import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { parseBlocks, parseInline, PROSE } from '../hooks/prose'

const START = { cwd: '/', surface: 'desktop', isInteractive: true } as const

// What the engine stamps on a command the person typed.
const TYPED = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } } as const

const STATE = '/home/test/.claude/mods/eve-nebula.state.json'

const BACKDROP = {
  plugin: 'eve-nebula',
  component: 'Backdrop',
  requestId: 'look',
  props: { scene: 'new-eden-saturn', plugin: 'eve-nebula', glass: { blur: 8, opacity: 0.5 } },
} as const

// The engine beneath the mod: a disk in memory shared by every chat of the
// test, a 200k context window filled to `percentUsed`, and a record of each
// look set or cleared. With `isCommandTaken`, the engine refuses /eve-theme,
// as it does when another copy of the mod registered it first.
function engine(
  on: On,
  percentUsed?: number,
  isCommandTaken = false,
): { disk: Map<string, string>; looks: string[] } {
  const disk = new Map<string, string>()
  const looks: string[] = []

  mock.env(on, { HOME: '/home/test' })
  on('fs.read', (_, e) => {
    const text = disk.get(e.path)

    if (text === undefined) {
      throw new Error(`ENOENT: ${e.path}`)
    }

    return { value: text }
  })
  on('fs.write', (_, e) => {
    disk.set(e.path, e.text)

    return { value: undefined }
  })
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context:
        percentUsed === undefined
          ? { window: 200000 }
          : { window: 200000, tokens: percentUsed * 2000, percent: percentUsed },
      rateLimits: [],
    },
  }))
  on('command.register', () => {
    if (isCommandTaken) {
      throw new Error('"/eve-theme" refused: the plugin eve-nebula registered it already')
    }

    return { value: { command: 'eve-theme' } }
  })
  on('ui.status', () => ({ value: undefined }))
  on('theme.set', () => {
    looks.push('set')

    return { value: { isDrawn: true, requestId: 'look' } }
  })
  on('theme.clear', () => {
    looks.push('clear')

    return { value: { isDrawn: false, reason: 'cleared' } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  return { disk, looks }
}

// The scene the backdrop draws, as text.
async function sceneOf(
  $: Parameters<TestBody>[0],
  surface: 'desktop' | 'mobile' = 'desktop',
): Promise<{ source: string; alt: string }> {
  const ui = await $.ui.mount({ ...BACKDROP, surface })
  const svg = await ui.find({ type: 'Svg' })
  const drawn = { source: String(svg?.props.source ?? ''), alt: String(svg?.props.alt ?? '') }

  await ui.unmount()

  return drawn
}

const count = (source: string, pattern: RegExp): number => source.match(pattern)?.length ?? 0

test('the look is on by default, and /eve-theme turns it off and on for new chats too', async ($, on) => {
  mock.clock(on)
  const { disk, looks } = engine(on)

  await $.session.start(START)
  expect(looks).toEqual(['set'])

  const off = await $.command.run({ ...TYPED, command: 'eve-theme', args: 'off' })
  expect(looks).toEqual(['set', 'clear'])
  expect(off.text).toContain('kapatıldı')
  expect(JSON.parse(disk.get(STATE) ?? '{}')).toEqual({ enabled: false })

  // A new chat while it is off draws no look, and clears none either.
  await $.session.start(START)
  expect(looks).toEqual(['set', 'clear'])

  const status = await $.command.run({ ...TYPED, command: 'eve-theme', args: 'status' })
  expect(status.text).toBe('EVE Nebula 0.6.0: kapalı (off).')

  // With no word the command flips it back on.
  const back = await $.command.run({ ...TYPED, command: 'eve-theme', args: '' })
  expect(looks).toEqual(['set', 'clear', 'set'])
  expect(back.text).toContain('açıldı')

  await $.session.start(START)
  expect(looks).toEqual(['set', 'clear', 'set', 'set'])
})

test('an open chat follows a choice made in another chat', async ($, on) => {
  const clock = mock.clock(on)
  const { disk, looks } = engine(on)

  await $.session.start(START)
  expect(looks).toEqual(['set'])

  // Another chat turns it off: this one clears its look on the next tick.
  disk.set(STATE, JSON.stringify({ enabled: false }))
  await clock.advance(3000)
  expect(looks).toEqual(['set', 'clear'])

  // Nothing changed: the next ticks leave it alone.
  await clock.advance(9000)
  expect(looks).toEqual(['set', 'clear'])

  // Another chat turns it back on.
  disk.set(STATE, JSON.stringify({ enabled: true }))
  await clock.advance(3000)
  expect(looks).toEqual(['set', 'clear', 'set'])
})

test('an unknown word changes nothing', async ($, on) => {
  mock.clock(on)
  const { disk, looks } = engine(on)

  const answer = await $.command.run({ ...TYPED, command: 'eve-theme', args: 'belki' })
  expect(answer.text).toContain('tanımıyorum')
  expect(looks).toEqual([])
  expect(disk.size).toBe(0)
})

test('status names the version and the capacitor', async ($, on) => {
  mock.clock(on)
  engine(on, 38)

  await $.session.start(START)

  const status = await $.command.run({ ...TYPED, command: 'eve-theme', args: 'status' })
  expect(status.text).toBe('EVE Nebula 0.6.0: açık (on), kapasitör %62 (124k / 200k).')
})

test("the ringed planet's capacitor shows the context left, on every app surface", async ($, on) => {
  mock.clock(on)
  engine(on, 38)

  await $.session.start(START)

  for (const surface of ['desktop', 'mobile'] as const) {
    const { source, alt } = await sceneOf($, surface)

    // 62% left: 13 of the ring's 20 cells lit lavender, and the figures under it.
    expect(count(source, /data-cell="on"/g)).toBe(13)
    expect(count(source, /data-cell="off"/g)).toBe(7)
    expect(count(source, /stroke="#ddd1ff"/g)).toBe(13)
    expect(source).toContain('>CAPACITOR</text>')
    expect(source).toContain('fill="#ddd1ff">62%</text>')
    expect(source).toContain('>124k / 200k</text>')
    expect(source).toContain('class="sat-atmo"')
    expect(alt).toContain('13 of the 20 capacitor cells')
  }
})

test('under half the cells turn gold', async ($, on) => {
  mock.clock(on)
  engine(on, 62)

  await $.session.start(START)

  const { source } = await sceneOf($)

  expect(count(source, /data-cell="on"/g)).toBe(8)
  expect(count(source, /stroke="#f3d28c"/g)).toBe(8)
  expect(source).toContain('fill="#f3d28c">38%</text>')
})

test('a nearly full window turns the ring rose, its last cell and the glow pulsing', async ($, on) => {
  mock.clock(on)
  engine(on, 93)

  await $.session.start(START)

  const { source } = await sceneOf($)

  expect(count(source, /data-cell="on"/g)).toBe(2)
  expect(count(source, /class="sat-low"/g)).toBe(1)
  expect(source).toContain('class="sat-alarm"')
  expect(source).toContain('fill="#ff95a8">7%</text>')
})

test('before the first reading the ring waits dark, with no figure', async ($, on) => {
  mock.clock(on)
  engine(on)

  await $.session.start(START)

  const { source, alt } = await sceneOf($)

  expect(count(source, /data-cell="on"/g)).toBe(0)
  expect(count(source, /data-cell="off"/g)).toBe(20)
  expect(source).toContain('>—</text>')
  expect(alt).not.toContain('capacitor cells')
})

test('the moon runs one orbit in two halves, in front of the planet and behind it', async ($, on) => {
  mock.clock(on)
  engine(on, 38)

  await $.session.start(START)

  const { source } = await sceneOf($)

  expect(count(source, /<animateMotion /g)).toBe(2)
  expect(source).toContain('values="1;0"')
  expect(source).toContain('values="0;1"')
})

test('other surfaces draw no scene', async ($, on) => {
  mock.clock(on)
  engine(on, 38)

  await $.session.start(START)

  const ui = await $.ui.mount({ ...BACKDROP, surface: 'terminal' })
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  await ui.unmount()
})

test('the look still goes on when another copy holds the command', async ($, on) => {
  mock.clock(on)
  const { looks } = engine(on, 38, true)

  await $.session.start(START)
  expect(looks).toEqual(['set'])

  const { source } = await sceneOf($)
  expect(count(source, /data-cell="on"/g)).toBe(13)
})

const MESSAGE = (text: string, isSummary = false) =>
  ({
    plugin: 'eve-nebula',
    component: 'AssistantMessage',
    requestId: 'reply',
    props: isSummary ? { text, isFirstOfReply: true, isSummary: true as const } : { text, isFirstOfReply: true },
  }) as const

const REPLY = [
  '## Durum',
  '',
  'Push edildi: **hazır**, `main` dalında; ayrıntı [rapor](https://example.dev/r) içinde.',
  '',
  '- birinci madde',
  '  - iç madde snake_case_name',
  '1. numaralı',
  '',
  '```bash',
  'claude plugin test .',
  '```',
  '',
  '| a | b |',
  '| --- | --- |',
  '| 1 | 2 |',
  '',
  '> alıntı',
  '',
  '---',
].join('\n')

test('inline marks parse into spans, leaving snake_case words alone', () => {
  expect(parseInline('Use **bold**, *it*, `code`, [doc](https://x.dev) and snake_case_name.')).toEqual([
    { text: 'Use ' },
    { bold: true, text: 'bold' },
    { text: ', ' },
    { italic: true, text: 'it' },
    { text: ', ' },
    { code: true, text: 'code' },
    { text: ', ' },
    { href: 'https://x.dev', text: 'doc' },
    { text: ' and snake_case_name.' },
  ])
})

test('a reply splits into the blocks it is made of', () => {
  const blocks = parseBlocks(REPLY)

  expect(blocks.map(block => block.kind)).toEqual(['heading', 'paragraph', 'list', 'code', 'markdown', 'quote', 'rule'])
  expect(blocks[2]).toEqual({
    kind: 'list',
    items: [
      { depth: 0, marker: '-', text: 'birinci madde' },
      { depth: 1, marker: '-', text: 'iç madde snake_case_name' },
      { depth: 0, marker: '1.', text: 'numaralı' },
    ],
  })
  expect(blocks[3]).toEqual({ kind: 'code', language: 'bash', source: 'claude plugin test .' })
})

test("the assistant's words turn light orange while the look is on", async ($, on) => {
  mock.clock(on)
  engine(on, 38)

  await $.session.start(START)

  for (const surface of ['desktop', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...MESSAGE(REPLY), surface })

    expect((await ui.find({ type: 'Text', text: /Push edildi/ }))?.props.color).toBe(PROSE.body)
    expect((await ui.find({ type: 'Text', text: /^hazır$/ }))?.props.color).toBe(PROSE.strong)
    expect((await ui.find({ type: 'Text', text: /^main$/ }))?.props.color).toBe(PROSE.code)
    expect((await ui.find({ type: 'Link' }))?.props.href).toBe('https://example.dev/r')
    expect((await ui.find({ type: 'Code' }))?.props.source).toBe('claude plugin test .')
    expect(String((await ui.find({ type: 'Markdown' }))?.props.text)).toContain('| a | b |')
    await ui.unmount()
  }
})

test('with the look off, in summaries and on the terminal the app draws its own', async ($, on) => {
  mock.clock(on)
  engine(on, 38)

  await $.session.start(START)

  const terminal = await $.ui.mount({ ...MESSAGE(REPLY), surface: 'terminal' })
  expect(await terminal.find({ type: 'Code' })).toBeUndefined()
  await terminal.unmount()

  const summary = await $.ui.mount({ ...MESSAGE(REPLY, true), surface: 'desktop' })
  expect(await summary.find({ type: 'Code' })).toBeUndefined()
  await summary.unmount()

  await $.command.run({ ...TYPED, command: 'eve-theme', args: 'off' })

  const off = await $.ui.mount({ ...MESSAGE(REPLY), surface: 'desktop' })
  expect(await off.find({ type: 'Code' })).toBeUndefined()
  await off.unmount()
})
